// tasks-dashboard.js — delegates entirely to /tasks.html

export async function renderTasksDashboard(container) {
  container.innerHTML = `
    <div style="height:calc(100vh - 140px);min-height:640px;overflow:hidden;border-radius:6px;border:1px solid var(--line)">
      <iframe
        src="/tasks.html"
        style="width:100%;height:100%;border:none;display:block"
        title="Channel SE Tasks"
      ></iframe>
    </div>
  `;
}

// Keep named exports that other modules may import
export function renderTaskSummary()      { return ''; }
export function renderImportantEmails()  { return ''; }
export function renderMeetingsToday()    { return ''; }
export function renderMeetingsThisWeek() { return ''; }
export function renderTodoList()         { return ''; }
export async function loadClaudeTasks()  { return null; }
export async function loadSlackTasks()   { return null; }
export function exportTasksJson()        { return '{}'; }
export async function saveTasksState()   {}
