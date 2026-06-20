import {
  auth,
  browserLocalPersistence,
  db,
  doc,
  getDoc,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "./firebase.js";

export const AUTH_PROFILE_MISSING_MESSAGE =
  "Authenticated user, but no profile was configured. Please request access from the administrator.";

const FRIENDLY_AUTH_ERRORS = {
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/missing-password": "Please enter your password.",
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/network-request-failed": "Network error. Check your connection and try again."
};

export async function initializeAuthPersistence() {
  await setPersistence(auth, browserLocalPersistence);
}

export async function signInWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  await signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getFriendlyAuthError(error) {
  return FRIENDLY_AUTH_ERRORS[error?.code] || error?.message || "Unable to sign in right now.";
}

export async function resolveUserContext(firebaseUser) {
  const profileReference = doc(db, "users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileReference);

  if (!profileSnapshot.exists()) {
    await signOut(auth);
    throw new Error(AUTH_PROFILE_MISSING_MESSAGE);
  }

  const profile = profileSnapshot.data();
  if (profile.active !== true) {
    await signOut(auth);
    throw new Error("This user profile is inactive. Please contact the administrator.");
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: profile.name || firebaseUser.email || "Unknown user",
    role: profile.role || "readonly",
    active: profile.active === true,
    getIdToken: (forceRefresh = false) => firebaseUser.getIdToken(forceRefresh),
    profile
  };
}

export function renderLoginScreen(root, options) {
  const { errorMessage = "", loading = false, email = "", onSubmit } = options;

  root.innerHTML = `
    <section class="auth-shell">
      <div class="auth-card panel">
        <article class="auth-hero">
          <span class="auth-kicker">Apps MROVERE</span>
          <h1>One portal for partner, IRIS, and task operations.</h1>
          <p>
            Sign in with your Firebase email and password to access the dashboards
            available for your role.
          </p>
          <div class="auth-highlights">
            <article>
              <strong>Partner Dashboard</strong>
              <p class="muted">Workbook-driven partner progress, maturity, and template workflows.</p>
            </article>
            <article>
              <strong>IRIS Dashboard</strong>
              <p class="muted">Fast local analysis for containers, accounts, usage, and snapshots.</p>
            </article>
            <article>
              <strong>MROVERE Tasks</strong>
              <p class="muted">Daily follow-ups and action tracking for operational execution.</p>
            </article>
          </div>
        </article>
        <article class="auth-form">
          <h2>Sign in</h2>
          <p>Use the email and password configured in Firebase Authentication.</p>
          <form id="login-form" class="content-stack">
            <div class="field">
              <label for="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                value="${escapeHtml(email)}"
                autocomplete="username"
                required
              />
            </div>
            <div class="field">
              <label for="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
              />
            </div>
            <div class="auth-feedback ${errorMessage ? "error" : ""}">
              ${errorMessage ? escapeHtml(errorMessage) : ""}
            </div>
            <button class="button primary" type="submit" ${loading ? "disabled" : ""}>
              ${loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p class="auth-footer">
            User creation is managed manually in Firebase Console for this version.
          </p>
        </article>
      </div>
    </section>
  `;

  root.querySelector("#login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit?.({
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || "")
    });
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
