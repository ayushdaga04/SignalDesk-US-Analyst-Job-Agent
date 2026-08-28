# SignalDesk — US Analyst Job Search Agent

SignalDesk is a local, approval-first dashboard built for Ayush Daga's US analyst search. It discovers roles from approved sources, compares each job description against the Data Analyst and Business Analyst resumes, flags work-authorization risks, recommends the stronger resume, tracks applications, and drafts recruiter outreach.

## What it does

- Searches 37 configured official employer boards and returns matching current roles directly in the dashboard.
- Can include closely related analyst titles and transparently expand sparse 24-hour searches to three days.
- Uses a two-stage portal scan so it fetches full descriptions only for roles that match the selected title, location, and freshness.
- Creates fresh external searches for Google, official career portals, LinkedIn, Indeed, Jobright, and Dice.
- Optionally includes Built In, Wellfound, and Y Combinator as secondary sources.
- Automatically scans configured public Greenhouse and Lever employer boards.
- Scores every role against both resume profiles.
- Detects seniority, experience, sector, mandatory-language, direct-link, and sponsorship concerns.
- Separates an official portal's refreshed timestamp from an unverified first-posted claim.
- Labels roles as `Employer Verified`, `Trusted Secondary`, or `Verification Pending`.
- Tracks roles through Discovered, Shortlisted, Applied, Interview, and Offer.
- Creates recruiter-message drafts that always require user approval.
- Exports the application tracker as CSV.
- Stores all tracker data locally in `data/state.json`.

## Start the dashboard

### Simplest option on macOS

Double-click `Start-SignalDesk.command`. Keep the Terminal window open while using the dashboard.

### Terminal option

```bash
cd "/Users/ayushdaga/Documents/Codex/2026-08-24/realtime-voice-chat-2/job-search-agent"
npm start
```

Then open:

```text
http://127.0.0.1:4177
```

No `npm install` is required. The application uses Node.js built-in modules only.

## Daily workflow

1. Open **Search center** and choose a target title, US location, and freshness window.
2. Select **Search roles** to scan official employer boards and create approved external-search links.
3. Review the employer-verified roles returned directly in SignalDesk.
4. Add a result to the tracker, or paste another job description through **Add a role**.
5. Review score, recommended resume, verification status, missing keywords, and risk flags.
6. Move strong roles through the application tracker.
7. Generate and review a recruiter draft after applying.
8. Export the tracker when needed.

## Search behavior and boundaries

SignalDesk does not scrape private accounts or bypass job-board protections. It returns roles directly from configured public employer APIs. Google, LinkedIn, Indeed, Jobright, Dice, Built In, Wellfound, and Y Combinator remain targeted external searches because those services do not provide unrestricted public search APIs for this local app.

Configured public Greenhouse and Lever boards are checked automatically. Other ATS providers can be added later through supported public APIs or licensed search services.

SignalDesk never:

- Submits an application automatically.
- Sends recruiter messages automatically.
- Claims a role is employer verified when it only appears on a secondary source.
- Hides explicit sponsorship or citizenship conflicts.
- Stores LinkedIn, Indeed, Google, or email credentials.

## Add official employer boards

Edit `config/companies.json` and add a public Greenhouse or Lever company token:

```json
{
  "name": "Example Company",
  "provider": "greenhouse",
  "token": "examplecompany",
  "enabled": true,
  "note": "Official public Greenhouse board"
}
```

For Lever, use `"provider": "lever"` and the employer's Lever site token.

## Matching logic

The scoring engine considers:

- Target-title alignment.
- Skills explicitly present in the job description.
- Data Analyst versus Business Analyst resume evidence.
- US location and posting freshness.
- Required years of experience and seniority.
- Healthcare, security, and privacy exclusions.
- Explicit sponsorship, citizenship, and clearance conflicts.
- Direct employer link and source reliability.

The score is a prioritization aid, not a guarantee of eligibility or an interview.

## Tests

```bash
npm test
```

The tests cover resume selection, source labels, role recognition, sponsorship conflicts, search-source controls, and outreach drafting.

## Files

```text
job-search-agent/
├── config/companies.json   # ATS watchlist
├── data/state.example.json # Safe blank tracker template
├── data/state.json         # Private local tracker data; ignored by Git
├── public/                 # Dashboard UI
├── src/engine.mjs          # Matching and risk analysis
├── src/store.mjs           # Local persistence
├── test/                   # Automated tests
├── server.mjs              # Local server and official-board connectors
└── Start-SignalDesk.command
```

## Privacy

The server binds to `127.0.0.1` by default, so it is available only on the local Mac. Do not change the host binding unless you understand the network implications.

## Public repository safety

`data/state.json` is ignored by Git because it can contain personal job-search records and recruiter drafts. The app automatically creates a blank local state file when one does not exist. Commit `data/state.example.json`, not your live tracker.

## Deploy on Render

This repository includes `render.yaml` for a Node web service. Connect the GitHub repository to Render and create a Blueprint or Web Service. The application uses Render's assigned `PORT` and binds publicly through `HOST=0.0.0.0`.

For a free portfolio demo, remember that tracker changes are temporary because free Render services use an ephemeral filesystem. Keep your real tracker locally. Persistent hosted tracking requires a database or a paid persistent disk.
