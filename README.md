# Apps MROVERE

Apps MROVERE replaces the old training PWA with a modular internal portal built around three operational modules:

- Partner Dashboard
- IRIS Dashboard
- MROVERE Tasks

The app is static-first, runs in the browser, uses Firebase Authentication with email and password, and loads large operational data locally through workbook and JSON imports.

Salesforce integration is intentionally disabled in this version. It will be revisited later when admin access and authentication flow are available.

## Folder structure

```text
.
├── index.html
├── manifest.webmanifest
├── sw.js
├── README.md
├── docs/
│   └── setup-firebase.md
├── icons/
│   └── icon.svg
├── src/
│   ├── app.js
│   ├── firebase.js
│   ├── auth.js
│   ├── roles.js
│   ├── router.js
│   ├── storage.js
│   ├── partner-dashboard.js
│   ├── partner-excel.js
│   ├── partner-templates.js
│   ├── iris-dashboard.js
│   ├── iris-storage.js
│   ├── tasks-dashboard.js
│   └── admin.js
├── styles/
├── data/
│   ├── partner/
│   ├── iris/
│   └── tasks/
└── tools/
```

## Local run

The portal should be served through a local web server because browsers block workbook fetches when the app is opened through `file://`.

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Firebase setup summary

1. Create a new Firebase project.
2. Enable Authentication with Email/Password.
3. Create Firestore.
4. Paste the project configuration into `src/firebase.js`.
5. Create users manually in Firebase Authentication.
6. Create matching Firestore profile documents under `users/{uid}`.

Full instructions and example rules are documented in [docs/setup-firebase.md](docs/setup-firebase.md).

## Roles

- `admin`
  Can access all modules, import IRIS data, manage templates, manage tasks, and read the Admin page.
- `readonly`
  Can access Partner Dashboard and IRIS Dashboard only.

Users are blocked when:

- they authenticate without a Firestore profile
- their `users/{uid}` document exists but `active !== true`

## Partner Dashboard

The Partner Dashboard loads the Excel workbook dynamically at runtime. Do not hardcode workbook rows into the app.

Expected source files:

- `data/partner/Focus Partner Tracking BR.xlsx`
- `data/partner/EM Service Delivery Accreditation Track.docx`
- `data/partner/accreditation-requirements.json`

### Update the Excel workbook

1. Replace `data/partner/Focus Partner Tracking BR.xlsx` with the latest workbook from Drive.
2. Reload the portal in the browser.
3. Open Partner Dashboard again to parse the updated workbook.

### Google Drive source files

The current static app reads files from the same static origin as the app, so the reliable v1 flow is to place approved copies in the repository paths above.

Direct browser reads from a shared Google Drive folder are not enabled in this version because they would require one of these additional patterns:

- A public/export URL with CORS-compatible access, which is usually not appropriate for internal files.
- Google Drive API OAuth in the frontend, which adds user consent, scopes, token handling, and more security review.
- A backend or scheduled job that downloads from Drive and publishes sanitized files into `data/partner/`.

Recommended v1 flow: keep the Drive folder as the source of truth, download the latest Excel/Word files, place them under `data/partner/`, test locally, then commit only approved non-sensitive files.

### Update accreditation requirements

The runtime rule source is `data/partner/accreditation-requirements.json`.

When the Word document changes:

1. Review `EM Service Delivery Accreditation Track.docx`.
2. Update `accreditation-requirements.json` to reflect the new rules.
3. Reload the portal and confirm the certification calculations.

### Email templates

Partner templates are versioned locally in IndexedDB and repository templates are loaded from `data/partner/templates/templates.json`.

- Admin users can create templates, edit templates, save changes, save new versions, export JSON, and copy a GitHub Action payload.
- Readonly users can view templates and copy content.
- The Email Templates view lets users choose a partner before previewing or copying a template.
- Partner-specific variables fill completed courses, missing courses, maturity summary, contact name, and next steps.
- To promote browser-edited templates into the repository, use the `Save partner email template` GitHub Action.

### Publish a new email template permanently

1. Open `Partner Dashboard > Email Templates`.
2. Click `New template`, then fill `Template name`, `Subject`, and `Body`.
3. Click `Save` or `Save new version` to keep a local browser copy.
4. Click `Copy GitHub payload`.
5. Click `Open save workflow`.
6. In GitHub, click `Run workflow`.
7. Paste the copied payload into `payload_json`.
8. Click `Run workflow`.
9. Wait for the workflow to commit the new file under `data/partner/templates/` and update `data/partner/templates/templates.json`.
10. Reload the portal after the GitHub Pages deploy finishes.

This flow avoids storing a GitHub token in the browser. The browser only prepares the JSON payload; GitHub Actions performs the repository write securely.

## IRIS Dashboard

The IRIS module is optimized for local snapshots and large datasets.

### Automatic file loading

When the dashboard opens, it tries to load:

- `data/iris/latest.json`
- `data/iris/accounts_latest.json`

If those files are present, they are imported automatically into IndexedDB for fast local filtering and pagination.

### Manual import

Admins can also import JSON files through the UI:

- Import containers JSON
- Import accounts JSON
- Reload latest files
- Clear local IRIS data
- Advanced search supports multiple filter rows with `AND` or `OR` logic.
- Container table columns can be shown, hidden, and reordered in the browser.
- Container/account details open only after clicking a row.

### Update IRIS snapshots

1. Generate new files with the tools under `tools/`.
2. Save the outputs to:
   - `data/iris/latest.json`
   - `data/iris/accounts_latest.json`
3. Reload the portal or use `Reload latest files`.

### Scraper tools

- `tools/iris_scraper.py`
- `tools/iris_accounts_scraper.py`
- `tools/iris_cookie_helper.py`

These scripts keep the cookie-based workflow and write outputs into the new `data/iris/` paths.

## MROVERE Tasks

This module is admin-only in the current version.

Supported local feeds:

- `data/tasks/claude_tasks.json`
- `data/tasks/slack_tasks.json`

If those files do not exist, the app shows a friendly message and still lets admins import JSON manually.

### Task feed update flow

1. Generate `claude_tasks.json` or `slack_tasks.json` externally.
2. Copy them into `data/tasks/`, or use the import buttons in the portal.
3. Open MROVERE Tasks.
4. New feed todos are added to the local activity history by stable `id`.
5. Click `Done` on a task to remove it from the default open list while keeping it in completed history.
6. Use filters for status, source, activity type, reporting period, and partner/customer.

The app always tries to load `data/tasks/claude_tasks.json` and `data/tasks/slack_tasks.json` first. If those files are unavailable, it falls back to the last browser-local imported copy.

Feed uploads are incremental from the app perspective: the latest JSON file can be replaced daily, but every todo seen by the browser is saved into IndexedDB. Local event date, status, completion date, completion comment, partner/customer flag, activity type, period, and tags are preserved for quarterly reporting as long as the todo keeps the same `id`.

Claude meeting preparation notes and long-form email/meeting summaries can also be edited in the app. Those edits are saved locally in IndexedDB so they are not lost when the daily JSON feed is refreshed.

Recommended todo fields:

```json
{
  "id": "stable-unique-id",
  "title": "Follow up with partner",
  "description": "Send next steps and confirm owner.",
  "priority": "high",
  "eventDate": "2026-05-29",
  "dueDate": "2026-05-29",
  "status": "open",
  "source": "claude-routine",
  "partnerName": "Partner Name",
  "activityType": "partner-follow-up",
  "period": "2026-Q2",
  "tags": ["partner", "enablement", "follow-up"],
  "completionComment": ""
}
```

Keep `id` stable across daily Claude/Slack runs. A good pattern is `YYYY-MM-DD-source-partner-short-topic` or another deterministic id generated by the routine.

Claude can also send optional summary fields for the editable detail pop-ups:

- `importantEmailHistorySummary`
- `meetingsWeekHistorySummary`

### Can Slack or Claude write directly to GitHub?

Yes, but do not put a long-lived GitHub token in a browser or Slack bot without guardrails.

Recommended options:

- GitHub Actions workflow: Slack/Claude writes or uploads an artifact, then a GitHub Action commits `data/tasks/claude_tasks.json` or `data/tasks/slack_tasks.json` into a branch or directly into a controlled data branch.
- GitHub App: best long-term option for a Slack bot because permissions can be scoped to one repository and specific contents access.
- Manual import: safest first phase. Export JSON from Claude or Slack and import it in the Tasks UI.
- Local scheduled routine: Claude Code can generate `data/tasks/claude_tasks.json` in the local checkout, then you review and push.

For this static v1, the app itself does not write directly to GitHub. It reads local/static JSON files and browser imports.

See `docs/automation-options.md` for the recommended GitHub Actions and Google Drive sync patterns.

## Deployment

Because the app is static, it can be deployed to any static host that supports HTTPS. Examples:

- Firebase Hosting
- GitHub Pages with custom configuration
- Internal static web hosting

Remember to:

- update `firebaseConfig`
- apply Firestore rules
- keep real IRIS snapshots and cookies out of git

## Secrets and sensitive data

Do not commit:

- `.env` files
- cookie files
- real IRIS snapshots
- large local diff files
- any authentication secrets

The repository `.gitignore` already excludes the main sensitive paths, but review before every commit.

## Known limitations

- The Partner workbook and Word source file are expected to be placed locally in `data/partner/`.
- Accreditation rules are read from the derived JSON file, not parsed live from `.docx`.
- Firebase user creation is manual by design for the Spark plan.
- IRIS data is browser-local and not synced globally between users.
- Salesforce integration remains disabled in this release.
