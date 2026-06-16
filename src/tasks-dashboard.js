// tasks-dashboard.js — embeds /tasks.html and hands it the per-user
// Google Apps Script endpoint from the Firebase profile (never localStorage).

let activeMessageHandler = null;

export async function renderTasksDashboard(container, userContext) {
  const endpoint = userContext?.profile?.tasksEndpoint || "";
  const token = userContext?.profile?.tasksToken || "";

  container.innerHTML = `
    <div style="height:calc(100vh - 140px);min-height:640px;overflow:hidden;border-radius:6px;border:1px solid var(--line)">
      <iframe
        id="tasks-frame"
        src="/tasks.html?v=${Date.now()}"
        style="width:100%;height:100%;border:none;display:block"
        title="Channel SE Tasks"
      ></iframe>
    </div>
  `;

  const frame = container.querySelector("#tasks-frame");

  const sendConfig = () => {
    frame?.contentWindow?.postMessage(
      { type: "tasks-config", endpoint, token },
      window.location.origin
    );
  };

  // The iframe announces readiness; reply with the per-user config.
  if (activeMessageHandler) {
    window.removeEventListener("message", activeMessageHandler);
  }
  activeMessageHandler = (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (event.data?.type === "tasks-ready") {
      sendConfig();
    }
  };
  window.addEventListener("message", activeMessageHandler);

  // Fallback: also push config once the frame has loaded.
  frame?.addEventListener("load", sendConfig);
}

// Keep named exports that other modules may import.
export function renderTaskSummary()      { return ''; }
export function renderImportantEmails()  { return ''; }
export function renderMeetingsToday()    { return ''; }
export function renderMeetingsThisWeek() { return ''; }
export function renderTodoList()         { return ''; }
export async function loadClaudeTasks()  { return null; }
export async function loadSlackTasks()   { return null; }
export function exportTasksJson()        { return '{}'; }
export async function saveTasksState()   {}
