import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROFILES,
  TARGET_TITLES,
  buildSearchLinks,
  createJob,
  generateRecruiterMessage,
  isTargetRole,
  matchesRequestedLocation,
  matchesSearchQuery,
  stripHtml
} from "./src/engine.mjs";
import { JsonStore } from "./src/store.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_DIR = path.join(ROOT, "config");
const PORT = Number(process.env.PORT || 4177);
const HOST = process.env.HOST || "127.0.0.1";
const store = new JsonStore(path.join(DATA_DIR, "state.json"));

await store.init();

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

async function loadCompanies() {
  return JSON.parse(await fs.readFile(path.join(CONFIG_DIR, "companies.json"), "utf8"));
}

async function fetchGreenhouse(company, filters = {}, settings = {}) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.token)}/jobs`;
  const response = await fetch(url, {
    headers: { "user-agent": "SignalDesk/1.0 portfolio tool" },
    signal: AbortSignal.timeout(7_000)
  });
  if (!response.ok) throw new Error(`${company.name}: Greenhouse returned ${response.status}`);
  const data = await response.json();
  const freshHours = Number(filters.freshHours ?? settings.freshHours ?? 24);
  const query = String(filters.query || "").trim();
  const location = String(filters.location || settings.country || "United States").trim();
  const candidates = data.jobs
    .map((job) => ({
      ...job,
      postingAgeHours: job.updated_at ? Math.max(0, Math.round((Date.now() - new Date(job.updated_at).getTime()) / 3_600_000)) : null
    }))
    .filter((job) => isTargetRole(job.title))
    .filter((job) => matchesSearchQuery(job.title, query, filters.includeAdjacent === true))
    .filter((job) => matchesRequestedLocation(job.location?.name || "", location))
    .filter((job) => job.postingAgeHours !== null && job.postingAgeHours <= freshHours)
    .sort((a, b) => a.postingAgeHours - b.postingAgeHours)
    .slice(0, 20);

  return Promise.all(candidates.map(async (job) => {
    let content = "";
    try {
      const detailUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.token)}/jobs/${job.id}`;
      const detailResponse = await fetch(detailUrl, {
        headers: { "user-agent": "SignalDesk/1.0 portfolio tool" },
        signal: AbortSignal.timeout(5_000)
      });
      if (detailResponse.ok) content = (await detailResponse.json()).content || "";
    } catch {
      // A role can still be shown and linked when its detail request times out.
    }
    return {
      title: job.title,
      company: company.name,
      location: job.location?.name || "United States",
      source: "Official Greenhouse portal",
      sourceUrl: job.absolute_url,
      applicationUrl: job.absolute_url,
      postedAt: job.updated_at || "",
      postingAgeHours: job.postingAgeHours,
      postingStatus: job.updated_at ? "Refreshed on official portal" : "Posting time not stated",
      description: stripHtml(content),
      verificationStatus: "Employer Verified"
    };
  }));
}

async function fetchLever(company) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company.token)}?mode=json`;
  const response = await fetch(url, { headers: { "user-agent": "SignalDesk/1.0 local portfolio tool" } });
  if (!response.ok) throw new Error(`${company.name}: Lever returned ${response.status}`);
  const data = await response.json();
  return data.filter((job) => isTargetRole(job.text)).map((job) => ({
    title: job.text,
    company: company.name,
    location: job.categories?.location || "United States",
    workArrangement: job.workplaceType || "Not stated",
    source: "Official Lever portal",
    sourceUrl: job.hostedUrl,
    applicationUrl: job.applyUrl || job.hostedUrl,
    postingStatus: "Posting time not stated",
    description: stripHtml(`${job.descriptionPlain || ""} ${job.additionalPlain || ""}`),
    verificationStatus: "Employer Verified"
  }));
}

async function discoverOfficial(settings, filters = {}) {
  const companies = (await loadCompanies()).filter((company) => company.enabled !== false);
  const results = [];
  const errors = [];
  const requestedFreshHours = Number(filters.freshHours ?? settings.freshHours ?? 24);
  const expandedFreshHours = filters.expandSparse !== false && requestedFreshHours < 72 ? 72 : requestedFreshHours;
  const scanFilters = { ...filters, freshHours: expandedFreshHours };
  await Promise.all(companies.map(async (company) => {
    try {
      const jobs = company.provider === "greenhouse"
        ? await fetchGreenhouse(company, scanFilters, settings)
        : company.provider === "lever"
          ? await fetchLever(company)
          : [];
      results.push(...jobs.map((job) => createJob(job, settings)));
    } catch (error) {
      errors.push(error.message);
    }
  }));
  const freshHours = requestedFreshHours;
  const query = String(filters.query || "").trim();
  const location = String(filters.location || settings.country || "United States").trim();
  const candidates = [...new Map(results.map((job) => [`${job.company}|${job.title}|${job.location}`, job])).values()]
    .filter((job) => matchesSearchQuery(job.title, query, filters.includeAdjacent === true))
    .filter((job) => matchesRequestedLocation(job.location, location))
    .filter((job) => job.postingAgeHours !== null && job.postingAgeHours <= expandedFreshHours)
    .sort((a, b) => {
      const rank = { High: 0, Medium: 1, Stretch: 2, Skip: 3 };
      return rank[a.analysis.priority] - rank[b.analysis.priority]
        || b.analysis.score - a.analysis.score
        || a.postingAgeHours - b.postingAgeHours;
    });
  const withinRequestedWindow = candidates.filter((job) => job.postingAgeHours <= requestedFreshHours);
  const usedExpansion = filters.expandSparse !== false && withinRequestedWindow.length < 3 && expandedFreshHours > requestedFreshHours;
  const jobs = (usedExpansion ? candidates : withinRequestedWindow).map((job) => ({
    ...job,
    outsideRequestedWindow: job.postingAgeHours > requestedFreshHours
  }));
  return {
    jobs,
    errors,
    scannedCompanies: companies.length,
    query,
    location,
    freshHours,
    selectedWindowCount: withinRequestedWindow.length,
    expandedToHours: usedExpansion ? expandedFreshHours : null
  };
}

function addActivity(state, type, detail) {
  state.activity.unshift({ id: crypto.randomUUID(), type, detail, at: new Date().toISOString() });
  state.activity = state.activity.slice(0, 100);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const state = await store.read();
    return sendJson(res, 200, {
      ...state,
      profiles: PROFILES,
      targetTitles: TARGET_TITLES,
      companies: await loadCompanies()
    });
  }

  if (req.method === "POST" && url.pathname === "/api/search-links") {
    const input = await readJson(req);
    return sendJson(res, 200, buildSearchLinks(input));
  }

  if (req.method === "POST" && url.pathname === "/api/search/official") {
    const state = await store.read();
    const filters = await readJson(req);
    const discovery = await discoverOfficial(state.settings, filters);
    return sendJson(res, 200, discovery);
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    const input = await readJson(req);
    if (!input.title || !input.company || !input.description) {
      return sendError(res, 400, "Title, company, and job description are required");
    }
    const state = await store.read();
    input.applicationUrl = safeUrl(input.applicationUrl);
    input.sourceUrl = safeUrl(input.sourceUrl);
    const job = createJob(input, state.settings);
    await store.update((next) => {
      const duplicate = next.jobs.find((item) =>
        item.company.toLowerCase() === job.company.toLowerCase()
        && item.title.toLowerCase() === job.title.toLowerCase()
        && item.location.toLowerCase() === job.location.toLowerCase()
      );
      if (duplicate) throw new Error("This role is already in the tracker");
      next.jobs.unshift(job);
      addActivity(next, "job_added", `${job.title} at ${job.company}`);
    });
    return sendJson(res, 201, job);
  }

  if (req.method === "POST" && url.pathname === "/api/jobs/bulk") {
    const input = await readJson(req);
    const state = await store.read();
    const added = [];
    await store.update((next) => {
      for (const raw of input.jobs || []) {
        const job = createJob(raw, state.settings);
        const duplicate = next.jobs.some((item) =>
          item.company.toLowerCase() === job.company.toLowerCase()
          && item.title.toLowerCase() === job.title.toLowerCase()
          && item.location.toLowerCase() === job.location.toLowerCase()
        );
        if (!duplicate) {
          next.jobs.unshift(job);
          added.push(job);
        }
      }
      addActivity(next, "official_scan", `${added.length} verified roles added`);
    });
    return sendJson(res, 201, { added });
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "PATCH") {
    const patch = await readJson(req);
    let updated;
    await store.update((state) => {
      const index = state.jobs.findIndex((job) => job.id === jobMatch[1]);
      if (index < 0) throw new Error("Job not found");
      updated = { ...state.jobs[index], ...patch, id: state.jobs[index].id, updatedAt: new Date().toISOString() };
      updated.analysis = createJob(updated, state.settings).analysis;
      state.jobs[index] = updated;
      addActivity(state, "job_updated", `${updated.title}: ${updated.status}`);
    });
    return sendJson(res, 200, updated);
  }

  const messageMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/message$/);
  if (messageMatch && req.method === "POST") {
    let result;
    await store.update((state) => {
      const job = state.jobs.find((item) => item.id === messageMatch[1]);
      if (!job) throw new Error("Job not found");
      result = {
        id: crypto.randomUUID(),
        jobId: job.id,
        company: job.company,
        title: job.title,
        recruiterName: job.recruiterName,
        recruiterProfile: job.recruiterProfile,
        status: "Draft - approval required",
        body: generateRecruiterMessage(job),
        createdAt: new Date().toISOString()
      };
      state.messages.unshift(result);
      addActivity(state, "message_drafted", `${job.company}: approval required`);
    });
    return sendJson(res, 201, result);
  }

  if (req.method === "PATCH" && url.pathname === "/api/settings") {
    const patch = await readJson(req);
    let settings;
    await store.update((state) => {
      settings = { ...state.settings, ...patch };
      state.settings = settings;
      state.jobs = state.jobs.map((job) => createJob(job, settings));
      addActivity(state, "settings_updated", "Search and exclusion rules updated");
    });
    return sendJson(res, 200, settings);
  }

  return sendError(res, 404, "API route not found");
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, "Forbidden");
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "content-length": content.length,
      "cache-control": "no-cache"
    });
    res.end(content);
  } catch {
    const content = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": content.length });
    res.end(content);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (error) {
    return sendError(res, 500, error.message || "Unexpected server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SignalDesk is running at http://${HOST}:${PORT}`);
});
