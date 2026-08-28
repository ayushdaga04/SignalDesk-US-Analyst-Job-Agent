const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

let state = { jobs: [], messages: [], activity: [], settings: {}, companies: [], targetTitles: [] };
let priorityFilter = "All";
let textFilter = "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = error ? "show error" : "show";
  setTimeout(() => { element.className = ""; }, 2600);
}

function initials(company = "") {
  return company.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function relativeDate(date) {
  if (!date) return "Just now";
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function loadState() {
  state = await api("/api/bootstrap");
  renderAll();
}

function renderAll() {
  renderSources();
  renderMetrics();
  renderActivity();
  renderShortlist();
  renderKanban();
  renderMessages();
  renderSettings();
  renderTitles();
}

function renderTitles() {
  $("#title-options").innerHTML = state.targetTitles.map((title) => `<option value="${escapeHtml(title)}"></option>`).join("");
}

function renderSources() {
  const primary = ["Google", "Official portals", "LinkedIn", "Indeed", "Jobright", "Dice"];
  const secondary = ["Built In", "Wellfound", "Y Combinator"];
  $("#source-row").innerHTML = [...primary, ...(state.settings.includeSecondary ? secondary : [])]
    .map((source) => `<span class="source-badge">${escapeHtml(source)}</span>`).join("");
}

function renderMetrics() {
  const jobs = state.jobs;
  const high = jobs.filter((job) => job.analysis.priority === "High").length;
  const applied = jobs.filter((job) => ["Applied", "Interview", "Offer"].includes(job.status)).length;
  const verified = jobs.filter((job) => job.analysis.verificationStatus === "Employer Verified").length;
  const drafts = state.messages.filter((message) => message.status.includes("approval")).length;
  const metrics = [
    ["Tracked roles", jobs.length, "All active records"],
    ["High priority", high, "Strong resume match"],
    ["Applications", applied, "Applied or later"],
    ["Drafts waiting", drafts, `${verified} employer verified`]
  ];
  $("#metrics-grid").innerHTML = metrics.map(([label, value, note]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");
}

function renderActivity() {
  const element = $("#activity-list");
  if (!state.activity.length) {
    element.innerHTML = `<div class="empty-state">Actions will appear after you add or update a role.</div>`;
    return;
  }
  element.innerHTML = state.activity.slice(0, 7).map((item) => `<div class="activity-item"><i></i><div><strong>${escapeHtml(item.detail)}</strong><time>${relativeDate(item.at)}</time></div></div>`).join("");
}

function filteredJobs() {
  return state.jobs.filter((job) => {
    const priorityMatch = priorityFilter === "All" || job.analysis.priority === priorityFilter;
    const text = `${job.title} ${job.company} ${job.location}`.toLowerCase();
    return priorityMatch && text.includes(textFilter.toLowerCase());
  }).sort((a, b) => b.analysis.score - a.analysis.score);
}

function jobCard(job) {
  const skills = job.analysis.matchedSkills.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join("") || `<span class="empty-state">No explicit match terms detected</span>`;
  const missing = job.analysis.missingKeywords.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join("") || `<span class="empty-state">No material gaps detected</span>`;
  const flags = job.analysis.flags.map((flag) => `<span class="flag">• ${escapeHtml(flag)}</span>`).join("") || `<span class="empty-state">No material red flags detected</span>`;
  const directLink = job.applicationUrl ? `<a class="text-button" href="${escapeHtml(job.applicationUrl)}" target="_blank" rel="noreferrer">Apply ↗</a>` : "";
  const postingDetail = job.postingAgeHours === null || job.postingAgeHours === undefined
    ? escapeHtml(job.postingStatus || "Posting time not stated")
    : `${escapeHtml(job.postingStatus || "Posting timestamp")} · ${Math.round(job.postingAgeHours)}h ago`;
  return `<article class="job-card" data-job-id="${job.id}">
    <div class="job-title-row"><div class="company-avatar">${escapeHtml(initials(job.company))}</div><div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p><div class="job-actions"><button class="text-button" data-expand>Details</button>${directLink}<button class="text-button" data-message>Draft outreach</button></div></div></div>
    <div class="job-cell"><span>Recommendation</span><strong>${escapeHtml(job.analysis.recommendedResumeLabel)}</strong><em class="priority ${job.analysis.priority}">${job.analysis.priority}</em></div>
    <div class="job-cell"><span>Reliability</span><strong>${escapeHtml(job.analysis.verificationStatus)}</strong><p>${escapeHtml(job.source)}</p><p>${postingDetail}</p></div>
    <div class="score-wrap"><div class="score-ring" style="--score:${job.analysis.score}"><b>${job.analysis.score}</b></div><div><strong>${escapeHtml(job.analysis.fitBand)}</strong><p>${escapeHtml(job.analysis.workAuthorization)} authorization</p></div></div>
    <div class="job-details">
      <div class="detail-block"><h4>Matched evidence</h4><div class="tag-list">${skills}</div></div>
      <div class="detail-block"><h4>Potential gaps</h4><div class="tag-list">${missing}</div></div>
      <div class="detail-block"><h4>Review flags</h4>${flags}</div>
    </div>
  </article>`;
}

function renderShortlist() {
  const jobs = filteredJobs();
  $("#shortlist-list").innerHTML = jobs.length ? jobs.map(jobCard).join("") : `<div class="panel empty-state">No roles match this filter. Add a role or run an official portal scan.</div>`;
}

const TRACK_STATUSES = ["Discovered", "Shortlisted", "Applied", "Interview", "Offer"];

function renderKanban() {
  $("#kanban").innerHTML = TRACK_STATUSES.map((status) => {
    const jobs = state.jobs.filter((job) => job.status === status);
    return `<section class="kanban-column"><div class="kanban-head">${status}<span>${jobs.length}</span></div><div class="kanban-cards">${jobs.map((job) => `<article class="kanban-card"><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} · ${job.analysis.score}% match</p><select data-status-id="${job.id}">${TRACK_STATUSES.map((option) => `<option ${option === job.status ? "selected" : ""}>${option}</option>`).join("")}</select></article>`).join("") || `<div class="empty-state">No roles</div>`}</div></section>`;
  }).join("");
}

function renderMessages() {
  const element = $("#message-list");
  if (!state.messages.length) {
    element.innerHTML = `<div class="panel empty-state">Generate a draft from any role in the shortlist. Messages are never sent automatically.</div>`;
    return;
  }
  element.innerHTML = state.messages.map((message) => `<article class="message-card"><div class="message-card-head"><div><h3>${escapeHtml(message.title)} · ${escapeHtml(message.company)}</h3><small>${relativeDate(message.createdAt)}</small></div><span class="approval-badge">Approval required</span></div><div class="message-body">${escapeHtml(message.body)}</div><button class="button dark small" data-copy-message="${message.id}" style="margin-top:10px">Copy message</button></article>`).join("");
}

function renderSettings() {
  $("#exclude-healthcare").checked = state.settings.excludeHealthcare;
  $("#exclude-security").checked = state.settings.excludeSecurity;
  $("#include-secondary").checked = state.settings.includeSecondary;
  $("#search-hours").value = String(state.settings.freshHours || 24);
  $("#company-list").innerHTML = state.companies.map((company) => `<div class="company-row"><strong>${escapeHtml(company.name)}</strong><span>${escapeHtml(company.provider)}</span><span>${company.enabled === false ? "Paused" : "Active"}</span></div>`).join("") || `<div class="empty-state">No automatic boards configured.</div>`;
}

function currentSearchFilters() {
  return {
    query: $("#search-query").value,
    location: $("#search-location").value,
    freshHours: Number($("#search-hours").value),
    includeAdjacent: $("#include-adjacent").checked,
    expandSparse: $("#expand-sparse").checked
  };
}

function renderOfficialResults(result) {
  const element = $("#official-results");
  if (!result.jobs.length) {
    element.innerHTML = `<div class="empty-state">Scanned ${result.scannedCompanies} official company boards. No ${escapeHtml(result.query || "target analyst")} roles matched ${escapeHtml(result.location)} within ${result.freshHours} hours.${result.errors.length ? ` ${escapeHtml(result.errors.join(" "))}` : ""}</div>`;
  } else {
    const expansionNote = result.expandedToHours
      ? `<div class="expansion-note"><strong>${result.selectedWindowCount} match${result.selectedWindowCount === 1 ? "" : "es"} within ${result.freshHours}h.</strong> Expanded results are clearly labeled up to ${result.expandedToHours / 24} days.</div>`
      : "";
    element.innerHTML = expansionNote + result.jobs.map((job) => `<div class="official-result"><div><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${job.postingAgeHours}h · ${job.analysis.score}% · ${escapeHtml(job.analysis.priority)} ${job.outsideRequestedWindow ? "· Expanded" : ""}</span></div><button class="button small" data-approve-official="${job.id}">Add</button></div>`).join("");
    element._scanJobs = result.jobs;
  }
}

async function generateSearchLinks(event) {
  event.preventDefault();
  const button = event.submitter || $(".search-submit");
  const filters = currentSearchFilters();
  button.disabled = true;
  button.textContent = "Searching…";
  const activeCompanies = state.companies.filter((company) => company.enabled !== false).length;
  $("#official-results").innerHTML = `<div class="search-progress"><span></span><div><strong>Searching ${activeCompanies} official employer boards…</strong><small>Matching title, U.S. location, freshness, and resume evidence.</small></div></div>`;
  try {
  const links = await api("/api/search-links", {
    method: "POST",
    body: JSON.stringify({
      ...filters,
      secondary: state.settings.includeSecondary
    })
  });
  $("#search-links").classList.remove("empty-state");
  $("#search-links").innerHTML = links.map((link) => `<a class="search-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.source)}</a>`).join("");
    const result = await api("/api/search/official", { method: "POST", body: JSON.stringify(filters) });
    renderOfficialResults(result);
    toast(result.jobs.length ? `Found ${result.jobs.length} official role${result.jobs.length === 1 ? "" : "s"}` : "No current official matches — external searches are ready");
    $("#official-results").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Search roles";
  }
}

async function runOfficialScan() {
  const button = $("#official-scan");
  button.disabled = true;
  button.textContent = "Scanning…";
  const activeCompanies = state.companies.filter((company) => company.enabled !== false).length;
  $("#official-results").innerHTML = `<div class="search-progress"><span></span><div><strong>Searching ${activeCompanies} official employer boards…</strong><small>Matching title, U.S. location, freshness, and resume evidence.</small></div></div>`;
  try {
    const result = await api("/api/search/official", { method: "POST", body: JSON.stringify(currentSearchFilters()) });
    renderOfficialResults(result);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Scan configured companies";
  }
}

async function addOfficialJob(id) {
  const element = $("#official-results");
  const job = element._scanJobs?.find((item) => item.id === id);
  if (!job) return;
  try {
    await api("/api/jobs/bulk", { method: "POST", body: JSON.stringify({ jobs: [job] }) });
    await loadState();
    toast("Employer-verified role added");
  } catch (error) { toast(error.message, true); }
}

async function addJob(event) {
  event.preventDefault();
  const submitter = event.submitter;
  if (submitter?.value === "cancel") return $("#add-dialog").close();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  try {
    const job = await api("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
    $("#add-dialog").close();
    event.currentTarget.reset();
    await loadState();
    toast(`${job.analysis.score}% match · ${job.analysis.recommendedResumeLabel}`);
    showView("shortlist");
  } catch (error) { toast(error.message, true); }
}

async function updateStatus(id, status) {
  try {
    await api(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadState();
    toast(`Moved to ${status}`);
  } catch (error) { toast(error.message, true); }
}

async function draftMessage(id) {
  try {
    await api(`/api/jobs/${id}/message`, { method: "POST", body: "{}" });
    await loadState();
    toast("Recruiter draft created — approval required");
    showView("messages");
  } catch (error) { toast(error.message, true); }
}

async function saveSettings() {
  try {
    await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        excludeHealthcare: $("#exclude-healthcare").checked,
        excludeSecurity: $("#exclude-security").checked,
        includeSecondary: $("#include-secondary").checked,
        freshHours: Number($("#search-hours").value)
      })
    });
    await loadState();
    toast("Rules saved and scores recalculated");
  } catch (error) { toast(error.message, true); }
}

function exportCsv() {
  const columns = ["Company", "Title", "Location", "Source", "Verification", "Posting Signal", "Posting Age Hours", "Fit Score", "Priority", "Resume", "Status", "Application URL", "Created"];
  const rows = state.jobs.map((job) => [job.company, job.title, job.location, job.source, job.analysis.verificationStatus, job.postingStatus, job.postingAgeHours, job.analysis.score, job.analysis.priority, job.analysis.recommendedResumeLabel, job.status, job.applicationUrl, job.createdAt]);
  const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `signaldesk-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const VIEW_TITLES = { search: "Search center", shortlist: "Role shortlist", tracker: "Application tracker", messages: "Recruiter drafts", settings: "Rules & sources" };
function showView(view) {
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  $$(".nav-item").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
  $("#page-title").textContent = VIEW_TITLES[view];
  history.replaceState(null, "", `#${view}`);
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) showView(nav.dataset.view);
  if (event.target.closest("[data-open-add]")) $("#add-dialog").showModal();
  const expand = event.target.closest("[data-expand]");
  if (expand) expand.closest(".job-card").classList.toggle("expanded");
  const message = event.target.closest("[data-message]");
  if (message) await draftMessage(message.closest(".job-card").dataset.jobId);
  const official = event.target.closest("[data-approve-official]");
  if (official) await addOfficialJob(official.dataset.approveOfficial);
  const priority = event.target.closest("[data-priority]");
  if (priority) {
    priorityFilter = priority.dataset.priority;
    $$("#priority-filters button").forEach((button) => button.classList.toggle("active", button === priority));
    renderShortlist();
  }
  const copy = event.target.closest("[data-copy-message]");
  if (copy) {
    const draft = state.messages.find((item) => item.id === copy.dataset.copyMessage);
    await navigator.clipboard.writeText(draft.body);
    toast("Message copied — review before sending");
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-status-id]")) await updateStatus(event.target.dataset.statusId, event.target.value);
});

$("#search-form").addEventListener("submit", generateSearchLinks);
$("#official-scan").addEventListener("click", runOfficialScan);
$("#add-job-form").addEventListener("submit", addJob);
$("#save-settings").addEventListener("click", saveSettings);
$("#export-button").addEventListener("click", exportCsv);
$("#job-filter").addEventListener("input", (event) => { textFilter = event.target.value; renderShortlist(); });

loadState().then(() => showView(location.hash.slice(1) || "search")).catch((error) => toast(error.message, true));
