import { clearStore, getRecord, putRecord } from "./storage.js";

const tasksState = {
  activeTab: "claude",
  claudeFeed: null,
  slackFeed: null,
  todos: [],
  deletedTodoIds: [],
  filters: {
    status: "all",
    priority: "all",
    source: "all"
  },
  editingTodoId: null
};

export async function renderTasksDashboard(container, userContext) {
  container.innerHTML = `<div class="loading-state">Loading task feeds...</div>`;

  tasksState.claudeFeed = await loadClaudeTasks();
  tasksState.slackFeed = await loadSlackTasks();
  tasksState.todos = await loadSavedTodos();
  tasksState.deletedTodoIds = await loadDeletedTodoIds();

  drawTasksModule(container, userContext);
}

export async function loadClaudeTasks() {
  const stored = await getRecord("tasksState", "claudeFeed");
  if (stored?.value) {
    return stored.value;
  }

  try {
    const response = await fetch("./data/tasks/claude_tasks.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    await putRecord("tasksState", { key: "claudeFeed", value: data });
    return data;
  } catch {
    return null;
  }
}

export async function loadSlackTasks() {
  const stored = await getRecord("tasksState", "slackFeed");
  if (stored?.value) {
    return stored.value;
  }

  try {
    const response = await fetch("./data/tasks/slack_tasks.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    await putRecord("tasksState", { key: "slackFeed", value: data });
    return data;
  } catch {
    return null;
  }
}

export async function importTasksJson(source, file) {
  const payload = JSON.parse(await file.text());
  const key = source === "claude" ? "claudeFeed" : "slackFeed";
  await putRecord("tasksState", { key, value: payload });
  return payload;
}

export function renderTaskSummary() {
  const allTodos = getMergedTodos();
  const completed = allTodos.filter((todo) => todo.status === "done").length;

  return `
    <section class="grid-cards">
      <article class="stat-card panel">
        <h3>Todos</h3>
        <div class="stat-value">${allTodos.length}</div>
      </article>
      <article class="stat-card panel">
        <h3>Completed</h3>
        <div class="stat-value">${completed}</div>
      </article>
      <article class="stat-card panel">
        <h3>Important emails</h3>
        <div class="stat-value">${tasksState.claudeFeed?.importantEmails?.length || 0}</div>
      </article>
      <article class="stat-card panel">
        <h3>Slack channels</h3>
        <div class="stat-value">${tasksState.slackFeed?.channels?.length || 0}</div>
      </article>
    </section>
  `;
}

export function renderImportantEmails() {
  if (!tasksState.claudeFeed?.importantEmails?.length) {
    return '<div class="empty-state">No Claude tasks file was found. Import a JSON file or configure the daily routine output.</div>';
  }

  return `
    <section class="tasks-feed-grid">
      ${tasksState.claudeFeed.importantEmails
        .map(
          (item) => `
            <article class="panel task-card">
              <span class="pill ${item.priority === "high" ? "warning" : ""}">${escapeHtml(item.priority || "normal")}</span>
              <h3>${escapeHtml(item.subject)}</h3>
              <p class="muted">From ${escapeHtml(item.from)}</p>
              <p>${escapeHtml(item.reason || "")}</p>
              <p class="muted">Suggested action: ${escapeHtml(item.suggestedAction || "None")}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

export function renderMeetingsToday() {
  const meetings = tasksState.claudeFeed?.meetingsToday || [];
  if (!meetings.length) {
    return '<div class="empty-state">No meetings were provided for today.</div>';
  }

  return renderMeetingCards(meetings);
}

export function renderMeetingsThisWeek() {
  const meetings = tasksState.claudeFeed?.meetingsThisWeek || [];
  if (!meetings.length) {
    return '<div class="empty-state">No meetings were provided for this week.</div>';
  }

  return renderMeetingCards(meetings);
}

export function renderTodoList() {
  const todos = getFilteredTodos();
  if (!todos.length) {
    return '<div class="empty-state">No todos match the current filters.</div>';
  }

  return `
    <div class="todo-list">
      ${todos
        .map(
          (todo) => `
            <article class="todo-item">
              <header>
                <label>
                  <input class="todo-checkbox" type="checkbox" data-todo-toggle="${todo.id}" ${todo.status === "done" ? "checked" : ""} />
                  <strong>${escapeHtml(todo.title)}</strong>
                </label>
                <span class="pill ${todo.priority === "high" ? "warning" : ""}">${escapeHtml(todo.priority || "normal")}</span>
              </header>
              <div>${escapeHtml(todo.description || "")}</div>
              <footer>
                <div class="muted">Source: ${escapeHtml(todo.source || "manual")} | Due: ${escapeHtml(todo.dueDate || "-")}</div>
                <div class="toolbar">
                  <button class="button secondary" data-todo-edit="${todo.id}" type="button">Edit</button>
                  <button class="button danger" data-todo-delete="${todo.id}" type="button">Delete</button>
                </div>
              </footer>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function createTodoItem(formData) {
  const todo = {
    id: `todo-${crypto.randomUUID()}`,
    title: formData.title,
    description: formData.description,
    priority: formData.priority,
    dueDate: formData.dueDate,
    status: formData.status,
    source: formData.source,
    updatedAt: new Date().toISOString()
  };

  tasksState.todos = [...tasksState.todos, todo];
  return todo;
}

export function editTodoItem(todoId, updates) {
  const existing = getMergedTodos().find((todo) => todo.id === todoId);
  const nextTodo = {
    ...(existing || {}),
    ...updates,
    id: todoId,
    updatedAt: new Date().toISOString()
  };
  upsertLocalTodo(nextTodo);
}

export function toggleTodoStatus(todoId) {
  const existing = getMergedTodos().find((todo) => todo.id === todoId);
  if (!existing) {
    return;
  }

  upsertLocalTodo({
    ...existing,
    status: existing.status === "done" ? "open" : "done",
    updatedAt: new Date().toISOString()
  });
}

export async function saveTasksState() {
  await putRecord("tasksState", { key: "todos", items: tasksState.todos });
  await putRecord("tasksState", { key: "deletedTodoIds", items: tasksState.deletedTodoIds });
}

export function exportTasksJson() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      claudeFeed: tasksState.claudeFeed,
      slackFeed: tasksState.slackFeed,
      todos: tasksState.todos
    },
    null,
    2
  );
}

function drawTasksModule(container, userContext) {
  container.innerHTML = `
    <div class="dashboard-shell">
      <section class="module-header">
        <div>
          <h2>MROVERE Tasks</h2>
          <p>
            Local task feeds can be imported from Claude and Slack routines, while the
            editable todo list is stored in IndexedDB for this browser.
          </p>
        </div>
        <div class="toolbar">
          <label class="button secondary">
            Import Claude JSON
            <input id="claude-import-input" type="file" accept="application/json" class="hidden" />
          </label>
          <label class="button secondary">
            Import Slack JSON
            <input id="slack-import-input" type="file" accept="application/json" class="hidden" />
          </label>
          <button id="tasks-export-button" class="button secondary" type="button">Export JSON</button>
          <button id="tasks-clear-button" class="button danger" type="button">Clear local tasks</button>
        </div>
      </section>
      ${renderTaskSummary()}
      <section class="tab-strip">
        ${renderTaskTab("claude", "Claude Tasks")}
        ${renderTaskTab("slack", "Slack Tasks")}
        ${renderTaskTab("todos", "Todo List")}
      </section>
      <section id="tasks-tab-content"></section>
    </div>
  `;

  container.querySelectorAll("[data-tasks-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      tasksState.activeTab = button.dataset.tasksTab;
      drawTasksModule(container, userContext);
    });
  });

  container.querySelector("#claude-import-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    tasksState.claudeFeed = await importTasksJson("claude", file);
    drawTasksModule(container, userContext);
  });

  container.querySelector("#slack-import-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    tasksState.slackFeed = await importTasksJson("slack", file);
    drawTasksModule(container, userContext);
  });

  container.querySelector("#tasks-export-button")?.addEventListener("click", () => {
    const blob = new Blob([exportTasksJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mrovere-tasks-export.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector("#tasks-clear-button")?.addEventListener("click", async () => {
    await clearStore("tasksState");
    tasksState.claudeFeed = null;
    tasksState.slackFeed = null;
    tasksState.todos = [];
    tasksState.deletedTodoIds = [];
    drawTasksModule(container, userContext);
  });

  renderTasksTabContent(container.querySelector("#tasks-tab-content"), container, userContext);
}

function renderTasksTabContent(tabContent, container, userContext) {
  if (tasksState.activeTab === "slack") {
    tabContent.innerHTML = renderSlackTasks();
    return;
  }

  if (tasksState.activeTab === "todos") {
    tabContent.innerHTML = `
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading">
          <h3>Create or update todo</h3>
        </div>
        <form id="todo-form" class="form-grid">
          <div class="field">
            <label for="todo-title">Title</label>
            <input id="todo-title" name="title" required />
          </div>
          <div class="field">
            <label for="todo-description">Description</label>
            <input id="todo-description" name="description" />
          </div>
          <div class="field">
            <label for="todo-priority">Priority</label>
            <select id="todo-priority" name="priority">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div class="field">
            <label for="todo-due-date">Due date</label>
            <input id="todo-due-date" name="dueDate" type="date" />
          </div>
          <div class="field">
            <label for="todo-status">Status</label>
            <select id="todo-status" name="status">
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div class="field">
            <label for="todo-source">Source</label>
            <select id="todo-source" name="source">
              <option value="manual">Manual</option>
              <option value="claude-routine">Claude</option>
              <option value="slack-bot">Slack</option>
            </select>
          </div>
          <div class="field" style="align-self: end;">
            <button class="button primary" type="submit">${tasksState.editingTodoId ? "Save todo" : "Create todo"}</button>
          </div>
        </form>
      </section>
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading">
          <h3>Filters</h3>
        </div>
        <div class="iris-filters">
          <div class="field">
            <label for="todo-filter-status">Status</label>
            <select id="todo-filter-status">
              ${renderTodoOptions(["all", "open", "done"], tasksState.filters.status)}
            </select>
          </div>
          <div class="field">
            <label for="todo-filter-priority">Priority</label>
            <select id="todo-filter-priority">
              ${renderTodoOptions(["all", "low", "medium", "high"], tasksState.filters.priority)}
            </select>
          </div>
          <div class="field">
            <label for="todo-filter-source">Source</label>
            <select id="todo-filter-source">
              ${renderTodoOptions(["all", "manual", "claude-routine", "slack-bot"], tasksState.filters.source)}
            </select>
          </div>
        </div>
      </section>
      ${renderTodoList()}
    `;

    wireTodoEvents(tabContent, container, userContext);
    return;
  }

  tabContent.innerHTML = `
    <section class="content-stack">
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading"><h3>Important emails</h3></div>
        ${renderImportantEmails()}
      </section>
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading"><h3>Meetings today</h3></div>
        ${renderMeetingsToday()}
      </section>
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading"><h3>Meetings this week</h3></div>
        ${renderMeetingsThisWeek()}
      </section>
    </section>
  `;
}

function renderSlackTasks() {
  if (!tasksState.slackFeed?.channels?.length) {
    return '<div class="empty-state">No Slack tasks file was found. Import a JSON file or configure the Slack bot output.</div>';
  }

  return `
    <section class="tasks-feed-grid">
      ${tasksState.slackFeed.channels
        .map(
          (channel) => `
            <article class="panel task-card">
              <h3>#${escapeHtml(channel.channelName)}</h3>
              <div class="content-stack">
                ${(channel.importantMessages || [])
                  .map(
                    (message) => `
                      <div class="panel" style="padding: 0.8rem;">
                        <span class="pill">${escapeHtml(message.priority || "normal")}</span>
                        <p>${escapeHtml(message.text)}</p>
                        <p class="muted">${escapeHtml(message.author || "Unknown")}</p>
                        <p class="muted">Suggested action: ${escapeHtml(message.suggestedAction || "None")}</p>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function wireTodoEvents(tabContent, container, userContext) {
  const form = tabContent.querySelector("#todo-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      title: String(data.get("title") || "").trim(),
      description: String(data.get("description") || "").trim(),
      priority: String(data.get("priority") || "medium"),
      dueDate: String(data.get("dueDate") || ""),
      status: String(data.get("status") || "open"),
      source: String(data.get("source") || "manual")
    };

    if (tasksState.editingTodoId) {
      editTodoItem(tasksState.editingTodoId, payload);
      tasksState.editingTodoId = null;
    } else {
      createTodoItem(payload);
    }

    await saveTasksState();
    drawTasksModule(container, userContext);
  });

  tabContent.querySelector("#todo-filter-status")?.addEventListener("change", (event) => {
    tasksState.filters.status = event.target.value;
    drawTasksModule(container, userContext);
  });

  tabContent.querySelector("#todo-filter-priority")?.addEventListener("change", (event) => {
    tasksState.filters.priority = event.target.value;
    drawTasksModule(container, userContext);
  });

  tabContent.querySelector("#todo-filter-source")?.addEventListener("change", (event) => {
    tasksState.filters.source = event.target.value;
    drawTasksModule(container, userContext);
  });

  tabContent.querySelectorAll("[data-todo-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      toggleTodoStatus(checkbox.dataset.todoToggle);
      await saveTasksState();
      drawTasksModule(container, userContext);
    });
  });

  tabContent.querySelectorAll("[data-todo-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const todo = getMergedTodos().find((item) => item.id === button.dataset.todoEdit);
      tasksState.editingTodoId = todo.id;
      fillTodoForm(tabContent, todo);
    });
  });

  tabContent.querySelectorAll("[data-todo-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      tasksState.todos = tasksState.todos.filter((todo) => todo.id !== button.dataset.todoDelete);
      if (!tasksState.deletedTodoIds.includes(button.dataset.todoDelete)) {
        tasksState.deletedTodoIds = [...tasksState.deletedTodoIds, button.dataset.todoDelete];
      }
      await saveTasksState();
      drawTasksModule(container, userContext);
    });
  });
}

async function loadSavedTodos() {
  const stored = await getRecord("tasksState", "todos");
  return stored?.items || [];
}

async function loadDeletedTodoIds() {
  const stored = await getRecord("tasksState", "deletedTodoIds");
  return stored?.items || [];
}

function getMergedTodos() {
  const feedTodos = [
    ...(tasksState.claudeFeed?.todos || []),
    ...(tasksState.slackFeed?.todos || [])
  ];
  const localById = new Map(tasksState.todos.map((todo) => [todo.id, todo]));
  const merged = feedTodos.map((todo) => localById.get(todo.id) || todo);
  const custom = tasksState.todos.filter((todo) => !feedTodos.some((feedTodo) => feedTodo.id === todo.id));
  return [...merged, ...custom].filter((todo) => !tasksState.deletedTodoIds.includes(todo.id));
}

function upsertLocalTodo(todo) {
  const exists = tasksState.todos.some((item) => item.id === todo.id);
  tasksState.todos = exists
    ? tasksState.todos.map((item) => (item.id === todo.id ? todo : item))
    : [...tasksState.todos, todo];
  tasksState.deletedTodoIds = tasksState.deletedTodoIds.filter((id) => id !== todo.id);
}

function getFilteredTodos() {
  return getMergedTodos().filter((todo) => {
    const matchesStatus =
      tasksState.filters.status === "all" || todo.status === tasksState.filters.status;
    const matchesPriority =
      tasksState.filters.priority === "all" || todo.priority === tasksState.filters.priority;
    const matchesSource =
      tasksState.filters.source === "all" || todo.source === tasksState.filters.source;

    return matchesStatus && matchesPriority && matchesSource;
  });
}

function renderMeetingCards(meetings) {
  return `
    <section class="tasks-feed-grid">
      ${meetings
        .map(
          (meeting) => `
            <article class="panel task-card">
              <h3>${escapeHtml(meeting.title)}</h3>
              <p class="muted">${escapeHtml(meeting.start || "")} to ${escapeHtml(meeting.end || "")}</p>
              <p>${escapeHtml(meeting.preparationNotes || "No preparation notes provided.")}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function fillTodoForm(tabContent, todo) {
  tabContent.querySelector("#todo-title").value = todo.title || "";
  tabContent.querySelector("#todo-description").value = todo.description || "";
  tabContent.querySelector("#todo-priority").value = todo.priority || "medium";
  tabContent.querySelector("#todo-due-date").value = todo.dueDate || "";
  tabContent.querySelector("#todo-status").value = todo.status || "open";
  tabContent.querySelector("#todo-source").value = todo.source || "manual";
}

function renderTaskTab(tab, label) {
  return `<button class="tab-button ${tasksState.activeTab === tab ? "active" : ""}" data-tasks-tab="${tab}" type="button">${label}</button>`;
}

function renderTodoOptions(values, selected) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value === "all" ? "All" : value)}</option>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
