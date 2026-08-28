import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeJob,
  buildSearchLinks,
  createJob,
  generateRecruiterMessage,
  isTargetRole,
  matchesRequestedLocation,
  matchesSearchQuery,
  stripHtml
} from "../src/engine.mjs";

const settings = { excludeHealthcare: true, excludeSecurity: true };

test("recommends the Data Analyst resume for a technical analytics role", () => {
  const analysis = analyzeJob({
    title: "Operations Data Analyst",
    company: "Example",
    location: "California, United States",
    postingAgeHours: 8,
    applicationUrl: "https://example.com/job",
    source: "Official employer portal",
    description: "Use SQL, Python, Power BI, Excel, data modeling, ETL, dashboards, KPI reporting and forecasting. Requires 2 years of experience."
  }, settings);
  assert.equal(analysis.recommendedResume, "data");
  assert.equal(analysis.priority, "High");
  assert.equal(analysis.verificationStatus, "Employer Verified");
  assert.ok(analysis.score >= 78);
});

test("recommends the Business Analyst resume for requirements work", () => {
  const analysis = analyzeJob({
    title: "Business Data Analyst",
    company: "Example",
    location: "Remote, United States",
    applicationUrl: "https://example.com/job",
    source: "LinkedIn",
    description: "Gather requirements, map processes, create user stories and acceptance criteria, support UAT, Jira, stakeholder management, SQL and Power BI."
  }, settings);
  assert.equal(analysis.recommendedResume, "business");
  assert.ok(analysis.matchedSkills.includes("requirements gathering"));
  assert.equal(analysis.verificationStatus, "Trusted Secondary");
});

test("flags explicit sponsorship conflicts and skips the role", () => {
  const analysis = analyzeJob({
    title: "Data Analyst",
    company: "Example",
    location: "United States",
    source: "Official portal",
    applicationUrl: "https://example.com/job",
    description: "SQL and Excel required. Candidates must work without current or future sponsorship."
  }, settings);
  assert.equal(analysis.workAuthorization, "Conflict");
  assert.equal(analysis.priority, "Skip");
  assert.ok(analysis.flags.some((flag) => flag.startsWith("Work authorization conflict")));
});

test("creates a stable tracker record and message draft", () => {
  const job = createJob({
    title: "Reporting Analyst",
    company: "Example",
    description: "Build Power BI dashboards with SQL and Excel for business stakeholders.",
    recruiterName: "Taylor"
  }, settings);
  assert.ok(job.id);
  assert.equal(job.status, "Discovered");
  const message = generateRecruiterMessage(job);
  assert.match(message, /Hi Taylor/);
  assert.match(message, /Ayush Daga/);
  assert.match(message, /preparing a focused application/);
  assert.doesNotMatch(message, /I’ve applied/);
});

test("message states that an application was submitted only after the tracker says Applied", () => {
  const job = createJob({
    title: "Data Analyst",
    company: "Example",
    description: "Analyze business data with SQL and Power BI.",
    status: "Applied"
  }, settings);
  assert.match(generateRecruiterMessage(job), /I’ve applied/);
});

test("builds only approved primary and optional secondary source links", () => {
  const primary = buildSearchLinks({ query: "Data Analyst", secondary: false });
  assert.deepEqual(primary.map((item) => item.source), ["Google", "Official portals", "LinkedIn", "Indeed", "Jobright", "Dice"]);
  const extended = buildSearchLinks({ query: "Data Analyst", secondary: true });
  assert.ok(extended.some((item) => item.source === "Built In"));
  assert.ok(extended.some((item) => item.source === "Y Combinator"));
});

test("recognizes adjacent analyst titles and cleans ATS HTML", () => {
  assert.equal(isTargetRole("Business Operations Analyst"), true);
  assert.equal(isTargetRole("Senior Java Engineer"), false);
  assert.equal(stripHtml("&lt;p&gt;SQL &amp; &lt;strong&gt;Power BI&lt;/strong&gt;&lt;/p&gt;"), "SQL & Power BI");
});

test("treats a mandatory language absent from both resumes as a hard gap", () => {
  const analysis = analyzeJob({
    title: "Data Analyst",
    company: "Example",
    location: "Phoenix, AZ",
    applicationUrl: "https://example.com/job",
    description: "Bilingual in Chinese and English is required. Use SQL, Excel and Power BI."
  }, settings);
  assert.equal(analysis.priority, "Skip");
  assert.ok(analysis.missingKeywords.includes("chinese proficiency"));
  assert.ok(analysis.flags.some((flag) => flag.includes("Required language")));
});

test("preserves an unknown posting age instead of converting it to zero", () => {
  const job = createJob({ title: "Data Analyst", company: "Example", description: "SQL", postingAgeHours: null }, settings);
  assert.equal(job.postingAgeHours, null);
});

test("filters official roles by selected title and US location", () => {
  assert.equal(matchesSearchQuery("Data Analyst, In-Store", "Data Analyst"), true);
  assert.equal(matchesSearchQuery("Revenue Operations Analyst", "Data Analyst"), false);
  assert.equal(matchesRequestedLocation("Phoenix, AZ", "United States"), true);
  assert.equal(matchesRequestedLocation("São Paulo, Brazil", "United States"), false);
  assert.equal(matchesRequestedLocation("San Francisco, CA", "California"), true);
});

test("optionally includes closely related analyst titles", () => {
  assert.equal(matchesSearchQuery("Business Operations Analyst", "Data Analyst"), false);
  assert.equal(matchesSearchQuery("Business Operations Analyst", "Data Analyst", true), true);
  assert.equal(matchesSearchQuery("Business Systems Analyst", "Business Analyst", true), true);
});
