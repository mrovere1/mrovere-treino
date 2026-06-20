# Apps MROVERE

Apps MROVERE is an internal static web portal that replaced the previous training PWA. It provides authenticated access to operational dashboards and local data workflows used by MROVERE.

Current production entry point:

- Custom domain: `www.mrovere.com`
- GitHub Pages source: `main` branch, repository root
- App shell: `index.html`
- Firebase Auth: email/password
- Firestore profiles: `users/{uid}`

Salesforce integration is intentionally disabled in this version. It will be revisited later when admin access and a supported authentication flow are available.

## Current App Status

The application is deployed as a static SPA with vanilla JavaScript ES modules, CDN dependencies, Firebase Authentication, Firestore-backed user profiles, local IndexedDB storage, and role-aware modules.

Main modules:

- Partner Dashboard
- IRIS Dashboard
- MROVERE Tasks
- POV Tracker
- Admin

Role behavior:

- `admin` users can access all modules, including POV Tracker.
- `se` users can access Home and POV Tracker. Backend ownership limits them to POVs they created.
- `readonly` users can access Partner Dashboard and IRIS Dashboard only.
- Users without a Firestore profile are blocked after authentication.
- Users with `active !== true` are blocked and signed out.

All visible app UI copy should remain in English.

## Folder Structure

```text
.
├── CNAME
├── index.html
├── manifest.webmanifest
├── sw.js
├── README.md
├── docs/
│   ├── automation-options.md
│   └── setup-firebase.md
├── icons/
│   └── icon.svg
├── src/
│   ├── app.js
│   ├── auth.js
│   ├── firebase.js
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
│   │   ├── Focus Partner Tracking BR.xlsx
│   │   ├── EM Service Delivery Accreditation Track.docx
│   │   ├── accreditation-requirements.json
│   │   └── templates/
│   ├── iris/
│   └── tasks/
├── tools/
└── .github/
    └── workflows/
```

## Local Run

Serve the app through a local HTTP server. Do not open `index.html` through `file://`, because browser security restrictions can block workbook and JSON fetches.

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

If the public site or local browser keeps showing old content, hard refresh the page and unregister the old service worker from browser DevTools.

## Firebase Setup

The app uses Firebase Authentication plus Firestore profile documents.

Required Firebase setup:

1. Create a Firebase project.
2. Create a Web App inside the Firebase project.
3. Enable Authentication > Email/Password.
4. Create Firestore Database.
5. Copy the Web App config into `src/firebase.js`.
6. Create each user manually in Firebase Authentication.
7. Create a matching Firestore profile at `users/{uid}`.

Profile shape:

```json
{
  "email": "user@example.com",
  "name": "User Name",
  "role": "admin",
  "active": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

Supported roles:

- `admin`
- `se`
- `readonly`

Full setup, profile creation, test steps, and Firestore rules are documented in [docs/setup-firebase.md](docs/setup-firebase.md).

## GitHub Pages and Domain

The repository is published through GitHub Pages.

Repository files involved:

- `CNAME`: custom domain configuration.
- `index.html`: app entry point.
- `manifest.webmanifest`: PWA metadata.
- `sw.js`: service worker with conservative caching.

Expected domain configuration:

- `www.mrovere.com` should point to `mrovere1.github.io`.
- GitHub Pages should use the `main` branch and repository root.
- HTTPS should be enabled in GitHub Pages.

DNS propagation depends on the DNS provider TTL. The repository cannot force global DNS propagation, but a GitHub Pages rebuild can be triggered by pushing a harmless commit or rerunning a workflow that writes to `main`.

## GitHub Workflows

This repository currently has two operational GitHub Actions workflows.

### 1. Sync partner workbook from Google Drive

Workflow file:

```text
.github/workflows/sync-partner-workbook.yml
```

Purpose:

- Downloads the current Partner workbook from Google Drive.
- Saves it into the repository.
- Commits directly to `main` only when the workbook changed, or when manually forced.

Schedule:

```text
0 10 * * *
```

This is `10:00 UTC`, which is `07:00` in Sao Paulo during the current timezone offset.

Manual trigger:

- GitHub > Actions > Sync partner workbook from Google Drive > Run workflow.
- Optional `force` input can create a commit even when the file is unchanged.

Current Drive source:

```text
Google Drive > app-mrovere > partners
```

Important implementation detail:

- The workflow does not browse the Drive folder by name.
- It downloads a specific file by Google Drive file ID.
- Moving the same file inside Drive is usually safe because the file ID stays the same.
- Replacing the workbook with a brand-new Drive file requires updating the `FILE_ID` in the workflow.

Current workflow target:

```text
data/partner/Focus Partner Tracking BR.xlsx
```

Current file ID in the workflow:

```text
1hekmNC50aaZNnSS5rt5WyTGc-9V90nhQ
```

Validation:

- The workflow checks the downloaded file magic bytes for XLSX zip format (`PK` / `504b`).
- If Google Drive returns an HTML error page instead of the workbook, the workflow fails before committing.

Security note:

- This workflow currently uses a public/export-style Drive download URL.
- If the Drive sharing model changes or the file stops being downloadable by that URL, the workflow should be migrated to a Google service account or OAuth-based Drive API flow using GitHub Actions secrets.

### 2. Save partner email template

Workflow file:

```text
.github/workflows/save-partner-template.yml
```

Purpose:

- Receives a template payload copied from the Partner Dashboard.
- Validates file name and required fields.
- Writes or updates one template JSON file under `data/partner/templates/`.
- Rebuilds `data/partner/templates/templates.json`.
- Commits directly to `main`.

Manual trigger:

- GitHub > Actions > Save partner email template > Run workflow.
- Paste the JSON payload into `payload_json`.

Why this flow exists:

- The app is static and cannot safely write repository files by itself.
- The browser only prepares the JSON payload.
- GitHub Actions performs the repository write using GitHub-managed credentials.
- No GitHub token is stored in frontend JavaScript.

## Partner Dashboard

The Partner Dashboard is loaded inside the authenticated portal shell and parses the current Excel workbook at runtime.

Source workbook:

```text
data/partner/Focus Partner Tracking BR.xlsx
```

Source Word reference:

```text
data/partner/EM Service Delivery Accreditation Track.docx
```

Runtime accreditation rules:

```text
data/partner/accreditation-requirements.json
```

The app does not hardcode partner rows into JavaScript. It reads the workbook using SheetJS from the browser.

Current Partner Dashboard tabs:

- Overview
- Courses
- Maturity
- Guardian
- Email Templates

### Workbook Sync Flow

The operational source of the workbook is Google Drive:

```text
Google Drive > app-mrovere > partners
```

The GitHub Action downloads the workbook each morning and writes it to:

```text
data/partner/Focus Partner Tracking BR.xlsx
```

The app reads that repository file when Partner Dashboard opens.

Typical daily flow:

1. Update the workbook in Google Drive.
2. Wait for the scheduled sync at `07:00` Sao Paulo time, or trigger the workflow manually.
3. Confirm the workflow completed successfully.
4. Wait for GitHub Pages to rebuild.
5. Reload `www.mrovere.com`.
6. Open Partner Dashboard.

Local manual fallback:

1. Download the latest workbook from Google Drive.
2. Replace `data/partner/Focus Partner Tracking BR.xlsx`.
3. Run the app locally with `python3 -m http.server 8080`.
4. Test Partner Dashboard.
5. Commit and push only if the workbook is approved for repository storage.

### Courses Tab

The Courses tab calculates accreditation progress from the workbook plus `accreditation-requirements.json`.

Program progress is calculated from 11 criteria:

- Intro CERT: 6 criteria.
- Specialist CERT: 4 criteria.
- EM Theory: 1 criterion.

The formal accreditation column is derived from the course/theory stages and is not double-counted in the overall progress.

Progress bar colors:

- `0-15`: red
- `16-60`: orange
- `61-99`: green
- `100`: complete

### Maturity Tab

The Maturity tab reads maturity values from the workbook at runtime.

Table grouping:

- EM Delivery (Deployment): EM, VM/WAS, CS, TPM
- Pre-Sales Delivery (PoV): EM, VM/WAS, CS, TPM

Maturity colors:

- `HIGH`: green
- `MEDIUM`: orange
- `LOW`: red

### Guardian Tab

The Guardian tab is fed by the same workbook.

Expected workbook sheet:

```text
Guardian
```

Expected columns:

- `Name` or `Guardian Name`
- `Email`
- `Partner`
- `Specialist Course`
- `TCSA`
- `TCSE`
- `TCDE`
- `Obs`

The parser is tolerant of the current workbook typo `Specialist Couse` because it searches for a header containing `specialist`.

Guardian requirements shown in the app:

- Specialist Course
- TCSA
- TCSE
- TCDE

Guardian progress:

- `0/4`: Pending
- `1/4` to `3/4`: In progress
- `4/4`: Ready

The Guardian tab also attempts to match the candidate partner name against the Partner Dashboard partner list so it can show the partner tier badge.

### Accreditation Requirements Updates

The app does not parse the Word document live. Instead, the Word document is the business reference and this JSON file is the runtime rule source:

```text
data/partner/accreditation-requirements.json
```

When the accreditation program changes:

1. Review `data/partner/EM Service Delivery Accreditation Track.docx`.
2. Update `data/partner/accreditation-requirements.json`.
3. Test the Courses tab with the latest workbook.
4. Commit and push the JSON update.

## Partner Email Templates

Repository templates are stored under:

```text
data/partner/templates/
```

Template index:

```text
data/partner/templates/templates.json
```

The app loads repository templates plus browser-local IndexedDB templates, then sorts them alphabetically.

Admin capabilities:

- Create a new template.
- Edit a template.
- Save a local browser copy.
- Save a local version.
- Copy a GitHub Action payload.
- Open the save workflow.
- Export JSON.

Readonly capabilities:

- View templates.
- Select partner context.
- Preview rendered content.
- Copy rendered content.

### Permanent Template Publishing Flow

Use this when a template created in the app should survive future sessions and be available to all users after deployment.

1. Open `Partner Dashboard > Email Templates`.
2. Create or edit the template.
3. Select a partner to preview variables.
4. Click `Save` or `Save new version` to keep a local browser copy.
5. Click `Copy GitHub payload`.
6. Click `Open save workflow`.
7. In GitHub Actions, click `Run workflow`.
8. Paste the copied payload into `payload_json`.
9. Run the workflow.
10. Wait for the commit and GitHub Pages rebuild.
11. Reload the app.

### Template Variables

Supported partner-aware variables include:

- `{{partner_name}}`
- `{{contact_name}}`
- `{{completed_courses}}`
- `{{missing_courses}}`
- `{{intro_completed_courses}}`
- `{{intro_missing_courses}}`
- `{{specialist_completed_courses}}`
- `{{specialist_missing_courses}}`
- `{{em_theory_completed_courses}}`
- `{{em_theory_missing_courses}}`
- `{{all_completed_courses}}`
- `{{all_missing_courses}}`
- `{{program_progress_percentage}}`
- `{{maturity_level}}`
- `{{next_steps}}`
- `{{course_prerequisites}}`

The specialist missing-course variable handles grouped requirements. For the `2 of 3` rule, it reports how many additional courses are still needed and lists only the remaining options.

## IRIS Dashboard

The IRIS module is optimized for large local snapshots.

Automatic local/static file paths:

```text
data/iris/latest.json
data/iris/accounts_latest.json
```

Sample files committed to the repository:

```text
data/iris/latest.sample.json
data/iris/accounts_latest.sample.json
```

Real IRIS snapshot files are intentionally ignored by git.

Admin actions:

- Import containers JSON.
- Import accounts JSON.
- Reload latest files.
- Clear local IRIS data.

Readonly behavior:

- View dashboards only.
- No import or clear actions.

Performance approach:

- IndexedDB for local persistence.
- In-memory filtering after load.
- Debounced search.
- AND/OR advanced filters.
- Pagination with page sizes 25, 50, and 100.
- Current-page-only DOM rendering.
- Details panel opens after clicking a row.
- Configurable table columns.

IRIS tools:

```text
tools/iris_scraper.py
tools/iris_accounts_scraper.py
tools/iris_cookie_helper.py
```

Expected scraper outputs:

```text
data/iris/latest.json
data/iris/accounts_latest.json
```

Do not commit cookies, secrets, or real IRIS snapshots.

## MROVERE Tasks

MROVERE Tasks is currently admin-only.

Supported local/static feeds:

```text
data/tasks/claude_tasks.json
data/tasks/slack_tasks.json
```

Sample files committed to the repository:

```text
data/tasks/claude_tasks.sample.json
data/tasks/slack_tasks.sample.json
```

The app tries to load static feed files first. If they do not exist, it falls back to browser-local imported data.

Todo behavior:

- Feed files can be replaced daily.
- Todo history is incremental in IndexedDB.
- Stable todo `id` values are required to preserve status cleanly.
- Completed items leave the default open list but remain available in local history/reporting views.

Recommended todo shape:

```json
{
  "id": "2026-06-13-claude-partner-follow-up",
  "title": "Follow up with partner",
  "description": "Send next steps and confirm owner.",
  "priority": "high",
  "eventDate": "2026-06-13",
  "dueDate": "2026-06-13",
  "status": "open",
  "source": "claude-routine",
  "partnerName": "Partner Name",
  "activityType": "partner-follow-up",
  "period": "2026-Q2",
  "tags": ["partner", "enablement", "follow-up"],
  "completionComment": ""
}
```

Recommended fields for reporting:

- `eventDate`: when the email, meeting, Slack message, or demand happened.
- `partnerName`: partner, customer, or account name.
- `activityType`: activity category.
- `period`: reporting period, such as `2026-Q2`.
- `tags`: future report filters.
- `completionComment`: what was done before marking the task done.

Claude feed enhancements supported by the UI:

- Important email history summaries.
- Meeting week history summaries.
- Editable meeting preparation notes.
- Editable detail pop-ups for long-form summaries.

## Local Storage and IndexedDB

`src/storage.js` abstracts local persistence.

IndexedDB database:

```text
mrovere-apps
```

IndexedDB stores:

- `irisContainers`
- `irisAccounts`
- `irisMeta`
- `partnerTemplateVersions`
- `tasksState`

LocalStorage is reserved for lightweight preferences such as sidebar state, selected tabs, and simple UI state.

## Service Worker and Caching

The service worker uses conservative caching.

Cache name:

```text
mrovere-apps-cache-v1
```

The service worker should not cache:

- Real IRIS JSON snapshots.
- Firebase Auth/network calls.
- External API endpoints.
- Imported sensitive data.

If stale content appears after deployment, unregister the service worker or hard refresh the app.

## Secrets and Sensitive Data

Do not commit:

- `.env` files.
- Cookie files.
- Firebase private credentials.
- Google private credentials.
- Real IRIS snapshots.
- IRIS diff folders.
- Logs with sensitive data.
- `node_modules`.
- Python cache files.
- Temporary Office lock files.

The `.gitignore` excludes the main sensitive paths, but every commit should still be reviewed before pushing.

## Operational Runbooks

### Update Partner Workbook From Google Drive

Preferred flow:

1. Update the workbook in `Google Drive > app-mrovere > partners`.
2. Let the scheduled workflow run at `07:00` Sao Paulo time.
3. Or trigger `Sync partner workbook from Google Drive` manually.
4. Confirm the workflow succeeded.
5. Confirm a commit was created only if the workbook changed.
6. Reload the public app after GitHub Pages rebuilds.

If a new workbook file is created in Drive:

1. Copy the new Google Drive file ID.
2. Edit `FILE_ID` in `.github/workflows/sync-partner-workbook.yml`.
3. Run the workflow manually.
4. Confirm `data/partner/Focus Partner Tracking BR.xlsx` changed correctly.

### Publish a Partner Email Template

1. Create or edit the template in the app.
2. Click `Copy GitHub payload`.
3. Open the `Save partner email template` workflow.
4. Paste the payload.
5. Run the workflow.
6. Reload the app after deployment.

### Update Firebase Config

1. Open Firebase Console.
2. Open Project settings.
3. Select the Web App.
4. Copy the Firebase config.
5. Paste it into `src/firebase.js`.
6. Test login locally.
7. Commit and push the config update.

### Import IRIS Data

1. Generate the IRIS JSON files using the tools under `tools/`.
2. Save outputs locally as `data/iris/latest.json` and `data/iris/accounts_latest.json`, or import through the UI.
3. Do not commit real IRIS JSON files.
4. Open IRIS Dashboard and confirm counts/metadata.

### Feed MROVERE Tasks

1. Ask Claude routine or Slack automation to generate JSON.
2. Save it as `data/tasks/claude_tasks.json` or `data/tasks/slack_tasks.json`.
3. Open MROVERE Tasks.
4. Confirm new todos appear.
5. Keep todo IDs stable between daily runs.

## Additional Documentation

- Firebase setup and Firestore rules: [docs/setup-firebase.md](docs/setup-firebase.md)
- Automation design notes: [docs/automation-options.md](docs/automation-options.md)
- Partner template folder notes: [data/partner/templates/README.md](data/partner/templates/README.md)

## Known Limitations

- The app is static and cannot write directly to the repository without GitHub Actions or another trusted automation layer.
- The Partner workbook sync currently depends on a fixed Google Drive file ID.
- The accreditation Word document is not parsed live by the browser.
- Accreditation runtime logic depends on `accreditation-requirements.json`.
- Real IRIS data is local/browser-local and not globally synced between users.
- Tasks history is browser-local unless a future backend or repository workflow is added.
- Firebase user creation remains manual by design for the current Spark/free-plan friendly setup.
- Salesforce integration remains disabled.
