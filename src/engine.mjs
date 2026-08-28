import crypto from "node:crypto";

export const TARGET_TITLES = [
  "Data Analyst",
  "Business Data Analyst",
  "Business Analyst",
  "BI Analyst",
  "Business Intelligence Analyst",
  "Reporting Analyst",
  "Operations Analyst",
  "Business Operations Analyst",
  "Supply Chain Analyst",
  "Data Quality Analyst"
];

export const PROFILES = {
  data: {
    label: "Data Analyst Resume",
    strengths: [
      "sql", "python", "power bi", "tableau", "excel", "data analysis",
      "business intelligence", "dashboard", "kpi", "etl", "data modeling",
      "data validation", "data quality", "forecasting", "statistics",
      "reporting", "operations", "supply chain", "aws", "mysql",
      "postgresql", "dax", "power query", "stakeholder"
    ],
    titleSignals: [
      "data analyst", "bi analyst", "business intelligence analyst",
      "reporting analyst", "operations data analyst", "supply chain analyst",
      "data quality analyst", "research data analyst"
    ]
  },
  business: {
    label: "Business Analyst Resume",
    strengths: [
      "requirements gathering", "stakeholder analysis", "stakeholder management",
      "business analysis", "process mapping", "gap analysis", "user stories",
      "acceptance criteria", "uat", "requirements traceability", "jira",
      "confluence", "sql", "excel", "power bi", "dashboard", "kpi",
      "root cause analysis", "data validation", "reporting", "process improvement",
      "business intelligence", "operations", "etl", "data modeling"
    ],
    titleSignals: [
      "business analyst", "business data analyst", "bi business analyst",
      "business intelligence analyst", "reporting business analyst",
      "operations analyst", "business operations analyst", "requirements analyst",
      "process improvement analyst", "business systems analyst"
    ]
  }
};

const SENIOR_SIGNALS = ["senior", "sr.", "sr ", "lead", "principal", "manager", "director", "staff"];
const AUTH_CONFLICTS = [
  "no sponsorship", "unable to sponsor", "cannot sponsor", "will not sponsor",
  "without sponsorship now or in the future", "without current or future sponsorship",
  "u.s. citizen", "us citizen", "citizenship required", "security clearance required",
  "must possess a security clearance"
];
const AUTH_CAUTION = [
  "legally authorized to work", "authorized to work in the united states",
  "work authorization", "sponsorship"
];
const HEALTH_SIGNALS = ["healthcare", "clinical", "patient", "hospital", "hipaa", "medical claims"];
const SECURITY_SIGNALS = ["cybersecurity", "security analyst", "privacy analyst", "clearance"];
const NON_US_LOCATION_SIGNALS = [
  "canada", "brazil", "mexico", "united kingdom", "uk", "india", "germany",
  "france", "spain", "ireland", "netherlands", "singapore", "australia",
  "japan", "south korea", "china", "hong kong", "philippines", "poland",
  "portugal", "romania", "colombia", "argentina", "são paulo", "sao paulo",
  "gurugram", "london", "toronto", "vancouver", "berlin", "paris"
];
const US_STATE_PATTERN = /(?:,\s*|\b)(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\b|;)/i;
const LANGUAGE_NAMES = [
  "chinese", "mandarin", "cantonese", "spanish", "french", "german",
  "japanese", "korean", "arabic", "portuguese", "russian"
];

const SKILL_VOCABULARY = [
  "sql", "python", "power bi", "tableau", "excel", "dax", "power query",
  "looker", "snowflake", "aws", "mysql", "postgresql", "etl", "data modeling",
  "data quality", "data validation", "forecasting", "statistics", "a/b testing",
  "dashboard", "kpi", "requirements gathering", "stakeholder management",
  "process mapping", "gap analysis", "user stories", "acceptance criteria", "uat",
  "jira", "confluence", "root cause analysis", "financial modeling", "variance analysis"
];

const SKILL_ALIASES = {
  "requirements gathering": ["gather requirements", "elicit requirements", "business requirements", "requirements elicitation"],
  "stakeholder analysis": ["analyze stakeholders", "stakeholder needs"],
  "stakeholder management": ["manage stakeholders", "work with stakeholders", "partner with stakeholders", "stakeholder collaboration"],
  "process mapping": ["map processes", "process maps", "current state process", "future state process"],
  "user stories": ["user story"],
  "acceptance criteria": ["acceptance criterion"],
  "root cause analysis": ["root-cause analysis", "identify root causes"],
  "power bi": ["powerbi"],
  "data validation": ["validate data", "data-quality review", "data quality review"],
  "data quality": ["data-quality", "quality review"],
  "business intelligence": ["bi reporting", "bi analytics"]
};

function normalize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9+#.&/\- ]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchesSearchQuery(title = "", query = "", includeAdjacent = false) {
  const normalizedTitle = normalize(title);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return isTargetRole(title);
  if (includeAdjacent && normalizedQuery === "data analyst") {
    return [
      "data analyst", "business data analyst", "bi analyst", "business intelligence analyst",
      "reporting analyst", "operations analyst", "business operations analyst", "supply chain analyst"
    ].some((signal) => normalizedTitle.includes(signal));
  }
  if (includeAdjacent && normalizedQuery === "business analyst") {
    return [
      "business analyst", "business systems analyst", "business data analyst",
      "operations business analyst", "requirements analyst", "process improvement analyst"
    ].some((signal) => normalizedTitle.includes(signal));
  }
  if (normalizedQuery === "bi analyst") {
    return /\bbi\b/.test(normalizedTitle) || normalizedTitle.includes("business intelligence analyst");
  }
  return normalizedTitle.includes(normalizedQuery);
}

export function matchesRequestedLocation(jobLocation = "", requestedLocation = "United States") {
  const job = normalize(jobLocation);
  const requested = normalize(requestedLocation || "United States");
  if (!job) return false;
  if (["united states", "us", "usa", "u s"].includes(requested)) {
    if (NON_US_LOCATION_SIGNALS.some((signal) => job.includes(signal))) return false;
    return /united states|usa|u\.s\.|remote\s*-?\s*us|washington\s*d\.c\./i.test(jobLocation) || US_STATE_PATTERN.test(jobLocation);
  }
  if (requested === "california") return job.includes("california") || /,\s*ca\b/i.test(jobLocation);
  return job.includes(requested);
}

function includesAny(text, terms) {
  return terms.filter((term) => text.includes(term));
}

function parseExperience(text) {
  const matches = [...text.matchAll(/(\d+)\s*(?:\+\s*)?(?:-|to)?\s*(\d+)?\s*years?/gi)];
  if (!matches.length) return null;
  return Math.min(...matches.map((match) => Number(match[1])));
}

function hasSkill(text, skill) {
  return text.includes(skill) || (SKILL_ALIASES[skill] || []).some((alias) => text.includes(alias));
}

function requiredLanguages(text) {
  return LANGUAGE_NAMES.filter((language) => {
    const before = new RegExp(`(?:bilingual(?:\\s+proficiency)?\\s+in|fluent(?:cy)?\\s+in|proficiency\\s+in|must\\s+speak|speak)\\s+(?:[a-z]+\\s+and\\s+)?${language}`, "i");
    const after = new RegExp(`${language}.{0,70}(?:is\\s+required|required|must\\s+be|mandatory)`, "i");
    return before.test(text) || after.test(text);
  });
}

function sourceReliability(source = "") {
  const value = normalize(source);
  if (["employer", "official", "company portal", "greenhouse", "lever", "ashby", "workday"].some((x) => value.includes(x))) {
    return "Employer Verified";
  }
  if (["linkedin", "indeed", "jobright", "dice", "built in", "wellfound", "y combinator"].some((x) => value.includes(x))) {
    return "Trusted Secondary";
  }
  return "Verification Pending";
}

function scoreProfile(profile, title, body) {
  const titleHits = profile.titleSignals.filter((signal) => title.includes(signal));
  const skillHits = profile.strengths.filter((skill) => hasSkill(body, skill));
  const explicitSkills = SKILL_VOCABULARY.filter((skill) => hasSkill(body, skill));
  const missing = explicitSkills.filter((skill) => !profile.strengths.includes(skill)).slice(0, 8);
  const titleScore = Math.min(34, titleHits.length ? 28 + (titleHits.length - 1) * 3 : 0);
  const skillScore = Math.min(48, skillHits.length * 3.4);
  const evidenceScore = Math.min(8, explicitSkills.length * 0.8);
  return {
    raw: titleScore + skillScore + evidenceScore,
    matched: [...new Set(skillHits)].slice(0, 12),
    missing
  };
}

export function analyzeJob(input, settings = {}) {
  const title = normalize(input.title);
  const body = normalize(`${input.title} ${input.company} ${input.location} ${input.description}`);
  const data = scoreProfile(PROFILES.data, title, body);
  const business = scoreProfile(PROFILES.business, title, body);
  const recommendedKey = data.raw >= business.raw ? "data" : "business";
  const recommended = recommendedKey === "data" ? data : business;
  const requiredExperience = parseExperience(input.description || "");
  const seniorSignals = includesAny(title, SENIOR_SIGNALS);
  const authConflicts = includesAny(body, AUTH_CONFLICTS);
  const authCautions = authConflicts.length ? [] : includesAny(body, AUTH_CAUTION);
  const languageConflicts = requiredLanguages(body);
  const excludedSector = [
    ...(settings.excludeHealthcare !== false ? includesAny(body, HEALTH_SIGNALS) : []),
    ...(settings.excludeSecurity !== false ? includesAny(body, SECURITY_SIGNALS) : [])
  ];

  let score = 22 + recommended.raw;
  if (/remote|united states|usa|u\.s\.|california|ca\b/.test(body)) score += 6;
  if (input.postingAgeHours !== undefined && Number(input.postingAgeHours) <= 24) score += 5;
  if (requiredExperience !== null && requiredExperience <= 3) score += 4;
  if (requiredExperience !== null && requiredExperience >= 5) score -= 22;
  if (seniorSignals.length) score -= 18;
  if (authConflicts.length) score -= 45;
  if (languageConflicts.length) score -= 35;
  if (excludedSector.length) score -= 35;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const flags = [];
  if (authConflicts.length) flags.push(`Work authorization conflict: ${authConflicts[0]}`);
  else if (authCautions.length) flags.push("Work authorization language requires review");
  if (requiredExperience !== null && requiredExperience >= 5) flags.push(`Requires approximately ${requiredExperience}+ years`);
  if (seniorSignals.length) flags.push("Senior-level title");
  if (excludedSector.length) flags.push(`Excluded-sector signal: ${excludedSector[0]}`);
  if (languageConflicts.length) flags.push(`Required language not shown in either resume: ${languageConflicts.join(", ")}`);
  if (!input.applicationUrl) flags.push("Direct employer link missing");

  const priority = authConflicts.length || excludedSector.length || languageConflicts.length
    ? "Skip"
    : score >= 78
      ? "High"
      : score >= 62
        ? "Medium"
        : "Stretch";

  return {
    score,
    priority,
    fitBand: score >= 78 ? "Strong match" : score >= 62 ? "Possible match" : "Stretch",
    recommendedResume: recommendedKey,
    recommendedResumeLabel: PROFILES[recommendedKey].label,
    matchedSkills: recommended.matched,
    missingKeywords: [...new Set([...recommended.missing, ...languageConflicts.map((language) => `${language} proficiency`)])],
    requiredExperience,
    flags,
    workAuthorization: authConflicts.length ? "Conflict" : authCautions.length ? "Review" : "Not stated",
    requiredLanguages: languageConflicts,
    verificationStatus: input.verificationStatus || sourceReliability(input.source)
  };
}

export function createJob(input, settings = {}) {
  const now = new Date().toISOString();
  const job = {
    id: input.id || crypto.randomUUID(),
    title: String(input.title || "").trim(),
    company: String(input.company || "").trim(),
    location: String(input.location || "United States").trim(),
    workArrangement: String(input.workArrangement || "Not stated").trim(),
    salary: String(input.salary || "Not listed").trim(),
    source: String(input.source || "Manual import").trim(),
    sourceUrl: String(input.sourceUrl || "").trim(),
    applicationUrl: String(input.applicationUrl || "").trim(),
    postingAgeHours: input.postingAgeHours === "" || input.postingAgeHours === undefined || input.postingAgeHours === null ? null : Number(input.postingAgeHours),
    postedAt: input.postedAt || "",
    postingStatus: String(input.postingStatus || "Not stated").trim(),
    description: String(input.description || "").trim(),
    recruiterName: String(input.recruiterName || "").trim(),
    recruiterProfile: String(input.recruiterProfile || "").trim(),
    status: input.status || "Discovered",
    notes: String(input.notes || "").trim(),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
  return { ...job, analysis: analyzeJob(job, settings) };
}

export function generateRecruiterMessage(job, profileLabel = job.analysis?.recommendedResumeLabel || "Data Analyst Resume") {
  const name = job.recruiterName ? `Hi ${job.recruiterName},` : "Hi,";
  const focus = job.analysis?.recommendedResume === "business"
    ? "business analysis, stakeholder requirements, SQL, Excel, and Power BI"
    : "SQL, Python, Excel, Power BI, and operational analytics";
  const applicationLine = ["Applied", "Interview", "Offer"].includes(job.status)
    ? `I’ve applied using my ${profileLabel}.`
    : `I’m preparing a focused application using my ${profileLabel}.`;
  return `${name}\n\nI’m reaching out regarding the ${job.title} opportunity at ${job.company}. I have 3+ years of analytics experience across ${focus}, including reporting workflows used by 1,000+ internal users. The role’s focus on ${job.analysis?.matchedSkills?.slice(0, 3).join(", ") || "data-driven decision support"} aligns closely with my background.\n\n${applicationLine} I’d be glad to share a concise project example relevant to the team.\n\nBest,\nAyush Daga`;
}

export function buildSearchLinks({ query, location = "United States", freshHours = 24, secondary = true }) {
  const q = encodeURIComponent(query || TARGET_TITLES[0]);
  const loc = encodeURIComponent(location);
  const googleQuery = encodeURIComponent(`(${query}) (${location}) (jobs OR careers) (posted today OR new)`);
  const links = [
    { source: "Google", url: `https://www.google.com/search?q=${googleQuery}` },
    { source: "Official portals", url: `https://www.google.com/search?q=${encodeURIComponent(`(${query}) (${location}) (site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com)`)}` },
    { source: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${loc}&f_TPR=r${Math.max(3600, freshHours * 3600)}&sortBy=DD` },
    { source: "Indeed", url: `https://www.indeed.com/jobs?q=${q}&l=${loc}&fromage=1&sort=date` },
    { source: "Jobright", url: "https://jobright.ai/jobs" },
    { source: "Dice", url: `https://www.dice.com/jobs?q=${q}&location=${loc}&filters.postedDate=ONE` }
  ];
  if (secondary) {
    links.push(
      { source: "Built In", url: `https://builtin.com/jobs?search=${q}` },
      { source: "Wellfound", url: "https://wellfound.com/jobs" },
      { source: "Y Combinator", url: "https://www.workatastartup.com/jobs" }
    );
  }
  return links;
}

export function isTargetRole(title = "") {
  const normalized = normalize(title);
  return TARGET_TITLES.some((target) => {
    const terms = normalize(target).split(" ");
    return terms.every((term) => normalized.includes(term));
  }) || /(?:data|business|bi|reporting|operations|supply chain).{0,20}analyst|analyst.{0,20}(?:data|business|reporting|operations|supply chain)/i.test(title);
}

export function stripHtml(value = "") {
  return String(value)
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
