const POV_ORIGIN = "https://mcp.mrovere.com";
const POV_URL = `${POV_ORIGIN}/pov/ui`;
const TOKEN_REFRESH_MS = 45 * 60 * 1000;

let activeMessageHandler = null;
let activeRefreshTimer = null;

export function renderPovDashboard(container, userContext) {
  cleanup();

  container.innerHTML = `
    <div style="height:calc(100vh - 140px);min-height:640px;overflow:hidden;border-radius:6px;border:1px solid var(--line)">
      <iframe
        id="pov-frame"
        src="${POV_URL}"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
        referrerpolicy="no-referrer"
        style="width:100%;height:100%;border:none;display:block"
        title="POV Tracker"
      ></iframe>
    </div>
  `;

  const frame = container.querySelector("#pov-frame");

  const sendAuth = async (forceRefresh = false) => {
    if (!frame?.contentWindow || typeof userContext?.getIdToken !== "function") {
      return;
    }
    const token = await userContext.getIdToken(forceRefresh);
    frame.contentWindow.postMessage({ type: "pov-auth", token }, POV_ORIGIN);
  };

  activeMessageHandler = (event) => {
    if (event.origin !== POV_ORIGIN || event.source !== frame?.contentWindow) {
      return;
    }
    if (event.data?.type === "pov-ready") {
      sendAuth().catch(() => {});
    }
    if (event.data?.type === "pov-auth-required") {
      sendAuth(true).catch(() => {});
    }
  };
  window.addEventListener("message", activeMessageHandler);
  frame?.addEventListener("load", () => sendAuth().catch(() => {}));
  activeRefreshTimer = window.setInterval(() => sendAuth(true).catch(() => {}), TOKEN_REFRESH_MS);
}

function cleanup() {
  if (activeMessageHandler) {
    window.removeEventListener("message", activeMessageHandler);
    activeMessageHandler = null;
  }
  if (activeRefreshTimer) {
    window.clearInterval(activeRefreshTimer);
    activeRefreshTimer = null;
  }
}
