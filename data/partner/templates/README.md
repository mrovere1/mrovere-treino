# Partner Email Templates

This folder is the repository location for partner email template backups and seed files.

The web app can create, edit, preview, copy, version, and export templates in the browser. Because this is a static app, browser edits are saved to IndexedDB first.

Permanent repository templates are indexed in:

- `templates.json`

To promote a browser-edited template into the repository, use the `Save partner email template` GitHub Action:

1. Open `Partner Dashboard > Email Templates`.
2. Save the template locally.
3. Click `Copy GitHub payload`.
4. Click `Open save workflow`.
5. Paste the payload into `payload_json` and run the workflow.

The workflow writes one template file in this folder and rebuilds `templates.json`.

Do not store credentials or customer-sensitive notes in template files.
