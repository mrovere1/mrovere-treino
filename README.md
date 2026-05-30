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

### Update accreditation requirements

The runtime rule source is `data/partner/accreditation-requirements.json`.

When the Word document changes:

1. Review `EM Service Delivery Accreditation Track.docx`.
2. Update `accreditation-requirements.json` to reflect the new rules.
3. Reload the portal and confirm the certification calculations.

### Email templates

Partner templates are versioned locally in IndexedDB.

- Admin users can create templates, edit templates, save changes, save new versions, and export JSON.
- Readonly users can view templates and copy content.

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
4. Manage editable todos locally in the browser.

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
