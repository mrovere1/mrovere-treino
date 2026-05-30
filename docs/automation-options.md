# Automation Options

This document describes safe automation paths for files that the static Apps MROVERE frontend cannot write by itself.

## Why the browser cannot write repository files directly

The app runs as static frontend code. Browser JavaScript can read static files served by the web server and can save browser-local data in IndexedDB/localStorage, but it cannot safely write files back into the GitHub repository or local project folder.

For repository writes, use a trusted automation layer:

- GitHub Actions
- GitHub App
- Local scheduled script
- Small backend service

## Partner templates: automatic repository copies

The Partner Dashboard can create and edit templates in the browser, but those edits are browser-local first.

Recommended options:

1. Export from the app and commit manually.
   - Safest first phase.
   - Admin edits templates in the app.
   - Admin exports JSON.
   - Save the file under `data/partner/templates/`.
   - Commit and push.

2. Add a small backend endpoint later.
   - The app sends template JSON to a backend.
   - Backend validates the user/session.
   - Backend commits the file to GitHub through a GitHub App.
   - Best long-term UX, but requires hosting a backend.

3. GitHub Actions with `workflow_dispatch`.
   - Admin exports template JSON.
   - Admin triggers a GitHub Action manually and uploads/pastes the JSON.
   - Action writes to `data/partner/templates/`.
   - Useful, but less smooth than a backend.

Do not put a GitHub personal access token in frontend JavaScript.

## Google Drive to repository sync

Goal: download sanitized source files from the shared Google Drive folder and publish them into repo paths:

- `data/partner/Focus Partner Tracking BR.xlsx`
- `data/partner/EM Service Delivery Accreditation Track.docx`
- optionally derived `data/partner/accreditation-requirements.json`

Recommended scheduled architecture:

1. Create a Google Cloud service account or OAuth client with read access to the Drive folder.
2. Share the Drive folder with the service account email, if using a service account.
3. Store Google credentials as GitHub Actions secrets.
4. Create a GitHub Actions workflow scheduled daily or manually triggered.
5. The workflow downloads files by Drive file ID.
6. The workflow saves files into `data/partner/`.
7. The workflow optionally runs a validation script.
8. The workflow commits changes to a branch such as `drive-sync/partner-data`.
9. The workflow opens or updates a pull request.
10. A human reviews the diff and merges when safe.

Suggested secrets:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `PARTNER_EXCEL_FILE_ID`
- `PARTNER_WORD_FILE_ID`

Suggested workflow permissions:

```yaml
permissions:
  contents: write
  pull-requests: write
```

Recommended safety rules:

- Never sync cookies, raw IRIS snapshots, or secrets from Drive.
- Prefer pull requests over direct commits to `main`.
- Keep the workflow scoped to explicit file IDs, not an entire Drive folder.
- Validate file size and extension before committing.

## Claude and Slack task feeds

The static app now always tries to load these files first:

- `data/tasks/claude_tasks.json`
- `data/tasks/slack_tasks.json`

If the files exist, they are loaded and saved into IndexedDB. If they do not exist, the app falls back to the last imported local browser copy.

Recommended automation options:

1. Local Claude Code routine writes `data/tasks/claude_tasks.json` in the checkout.
2. A local scheduled task commits the generated file to a branch.
3. A Slack bot posts task JSON to a backend.
4. Backend or GitHub App writes `data/tasks/slack_tasks.json`.
5. A GitHub Action opens a PR for review.

For v1, avoid direct production writes from bots to `main`.
