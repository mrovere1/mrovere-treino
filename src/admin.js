import { collection, db, getDocs, orderBy, query } from "./firebase.js";

export async function renderAdminModule(container) {
  container.innerHTML = `<div class="loading-state">Loading user profiles...</div>`;

  try {
    const snapshot = await getDocs(query(collection(db, "users"), orderBy("name")));
    const users = snapshot.docs.map((record) => ({
      id: record.id,
      ...record.data()
    }));

    container.innerHTML = `
      <div class="dashboard-shell">
        <section class="module-header">
          <div>
            <h2>Admin</h2>
            <p>
              User onboarding stays manual in Firebase Console for this version. This
              page reads Firestore profiles and summarizes the operating process.
            </p>
          </div>
        </section>
        <section class="grid-cards">
          <article class="stat-card panel">
            <h3>Profiles</h3>
            <div class="stat-value">${users.length}</div>
          </article>
          <article class="stat-card panel">
            <h3>Active</h3>
            <div class="stat-value">${users.filter((user) => user.active === true).length}</div>
          </article>
          <article class="stat-card panel">
            <h3>Admins</h3>
            <div class="stat-value">${users.filter((user) => user.role === "admin").length}</div>
          </article>
        </section>
        <section class="panel" style="padding: 1rem;">
          <div class="section-heading">
            <h3>Manual creation process</h3>
          </div>
          <ol class="muted">
            <li>Create the user in Firebase Authentication with email and password.</li>
            <li>Copy the generated UID from the Authentication user details.</li>
            <li>Create the Firestore document <code>users/{uid}</code>.</li>
            <li>Set <code>name</code>, <code>email</code>, <code>role</code>, and <code>active</code>.</li>
            <li>Ask the user to sign in after the Firestore profile exists.</li>
          </ol>
        </section>
        <section class="panel card-table">
          <header>
            <div>
              <h3>Firestore user profiles</h3>
              <p class="muted">The portal blocks users who authenticate without a matching active profile document.</p>
            </div>
          </header>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>UID</th>
                </tr>
              </thead>
              <tbody>
                ${users
                  .map(
                    (user) => `
                      <tr>
                        <td>${escapeHtml(user.name || "-")}</td>
                        <td>${escapeHtml(user.email || "-")}</td>
                        <td>${escapeHtml(user.role || "readonly")}</td>
                        <td>${user.active === true ? '<span class="pill success">Active</span>' : '<span class="pill danger">Inactive</span>'}</td>
                        <td><code>${escapeHtml(user.id)}</code></td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `
      <div class="error-state">
        Unable to read Firestore users. Confirm the Firebase configuration and Firestore
        rules for admin access.
      </div>
    `;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
