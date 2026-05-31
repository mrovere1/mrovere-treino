import { clearStore, getRecord, putRecord } from "./storage.js";

const tasksState = {
  activeTab: "claude",
  claudeFeed: null,
  slackFeed: null,
  todos: [],
  deletedTodoIds: [],
  filters: {
    status: "open",
    priority: "all",
    source: "all",
    partner: "",
    activityType: "all",
    period: "all"
  },
  notes: {
    detailNotes: {},
    meetingNotes: {}
  },
  editingTodoId: null
};

export async function renderTasksDashboard(container, userContext) {
  container.innerHTML = `<div class="loading-state">Loading task feeds...</div>`;

  tasksState.claudeFeed = await loadClaudeTasks();
  tasksState.slackFeed = await loadSlackTasks();
  tasksState.todos = await loadSavedTodos();
  tasksState.deletedTodoIds = await loadDeletedTodoIds();
  tasksState.notes = await loadTaskNotes();
  const changed = syncFeedTodosToLocalHistory();
  if (changed) {
    await saveTasksState();
  }

  drawTasksModule(container, userContext);
}

export async function loadClaudeTasks() {
  try {
    const response = await fetch(`./data/tasks/claude_tasks.json?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (response.ok) {
      const data = await response.json();
      await putRecord("tasksState", { key: "claudeFeed", value: data });
      return data;
    }
  } catch {
    // Fall back to the last imported/saved feed when the static file is unavailable.
  }

  const stored = await getRecord("tasksState", "claudeFeed");
  return stored?.value || null;
}

export async function loadSlackTasks() {
  try {
    const response = await fetch(`./data/tasks/slack_tasks.json?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (response.ok) {
      const data = await response.json();
      await putRecord("tasksState", { key: "slackFeed", value: data });
      return data;
    }
  } catch {
    // Fall back to the last imported/saved feed when the static file is unavailable.
  }

  const stored = await getRecord("tasksState", "slackFeed");
  return stored?.value || null;
}

export async function importTasksJson(source, file) {
  const payload = JSON.parse(await file.text());
  const key = source === "claude" ? "claudeFeed" : "slackFeed";
  await putRecord("tasksState", { key, value: payload });
  return payload;
}

export function renderTaskSummary() {
  const allTodos = getMergedTodos();
  const open = allTodos.filter((todo) => todo.status !== "done").length;
  const completed = allTodos.filter((todo) => todo.status === "done").length;
  const currentPeriod = getCurrentQuarter();
  const quarterCompleted = allTodos.filter(
    (todo) => todo.status === "done" && getTodoPeriod(todo) === currentPeriod
  ).length;

  return `
    <section class="grid-cards">
      <article class="stat-card panel">
        <h3>Open todos</h3>
        <div class="stat-value">${open}</div>
      </article>
      <article class="stat-card panel">
        <h3>Completed history</h3>
        <div class="stat-value">${completed}</div>
      </article>
      <article class="stat-card panel">
        <h3>${currentPeriod} completed</h3>
        <div class="stat-value">${quarterCompleted}</div>
      </article>
      <article class="stat-card panel">
        <h3>Important emails</h3>
        <div class="stat-value">${tasksState.claudeFeed?.importantEmails?.length || 0}</div>
      </article>
    </section>
  `;
}

export function renderImportantEmails() {
  if (!tasksState.claudeFeed?.importantEmails?.length) {
    return '<div class="empty-state">No Claude tasks file was found. Import a JSON file or configure the daily routine output.</div>';
  }

  return `
    <div class="table-wrap">
      <table class="important-email-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          ${tasksState.claudeFeed.importantEmails
            .map(
              (item) => `
                <tr>
                  <td class="important-email-title">
                    <strong>${escapeHtml(item.subject)}</strong>
                    <span>${escapeHtml(item.from || "Unknown sender")}</span>
                    <span class="pill ${item.priority === "high" ? "warning" : ""}">${escapeHtml(item.priority || "normal")}</span>
                  </td>
                  <td>
                    <p>${escapeHtml(item.summary || item.reason || "")}</p>
                    <p class="muted">Suggested action: ${escapeHtml(item.suggestedAction || "None")}</p>
                    <button
                      class="button secondary compact-button"
                      data-detail-open="${escapeHtml(getEmailKey(item))}"
                      data-detail-title="${escapeHtml(item.subject || "Important email")}"
                      data-detail-content="${escapeHtml(formatEmailDetails(item))}"
                      type="button"
                    >
                      Read / edit details
                    </button>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderMeetingsToday() {
  const meetings = tasksState.claudeFeed?.meetingsToday || [];
  if (!meetings.length) {
    return '<div class="empty-state">No meetings were provided for today.</div>';
  }

  return renderMeetingCards(meetings, "today");
}

export function renderMeetingsThisWeek() {
  const meetings = tasksState.claudeFeed?.meetingsThisWeek || [];
  if (!meetings.length) {
    return '<div class="empty-state">No meetings were provided for this week.</div>';
  }

  return renderMeetingCards(meetings, "week");
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
            <article class="todo-item ${todo.status === "done" ? "done" : ""}">
              <header>
                <div>
                  <strong>${escapeHtml(todo.title)}</strong>
                  <div class="todo-meta">
                    ${renderTodoMeta(todo)}
                  </div>
                </div>
                <div class="toolbar">
                  <span class="pill ${todo.priority === "high" ? "warning" : ""}">${escapeHtml(todo.priority || "normal")}</span>
                  <button class="button ${todo.status === "done" ? "secondary" : "primary"} todo-done-button" data-todo-toggle="${todo.id}" type="button">
                    ${todo.status === "done" ? "Reopen" : "Done"}
                  </button>
                </div>
              </header>
              <div>${escapeHtml(todo.description || "")}</div>
              <div class="field todo-comment-field">
                <label for="todo-comment-${escapeHtml(todo.id)}">Completion comment</label>
                <textarea id="todo-comment-${escapeHtml(todo.id)}" data-todo-comment="${escapeHtml(todo.id)}" rows="2" placeholder="Write what was done before clicking Done.">${escapeHtml(todo.completionComment || "")}</textarea>
              </div>
              <footer>
                <div class="muted">${renderTodoFooter(todo)}</div>
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
    partnerName: formData.partnerName,
    activityType: formData.activityType,
    period: formData.period || getCurrentQuarter(),
    tags: normalizeTags(formData.tags),
    completionComment: formData.completionComment,
    completedAt: formData.status === "done" ? new Date().toISOString() : "",
    createdAt: new Date().toISOString(),
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
    tags: normalizeTags(updates.tags),
    completedAt:
      updates.status === "done" && existing?.status !== "done"
        ? new Date().toISOString()
        : updates.status === "open"
          ? ""
          : existing?.completedAt || "",
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
    completedAt: existing.status === "done" ? "" : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function updateTodoComment(todoId, completionComment) {
  const existing = getMergedTodos().find((todo) => todo.id === todoId);
  if (!existing) {
    return;
  }

  upsertLocalTodo({
    ...existing,
    completionComment,
    updatedAt: new Date().toISOString()
  });
}

export async function saveTasksState() {
  await putRecord("tasksState", { key: "todos", items: tasksState.todos });
  await putRecord("tasksState", { key: "deletedTodoIds", items: tasksState.deletedTodoIds });
  await putRecord("tasksState", { key: "notes", value: tasksState.notes });
}

export function exportTasksJson() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      claudeFeed: tasksState.claudeFeed,
      slackFeed: tasksState.slackFeed,
      todos: tasksState.todos,
      notes: tasksState.notes
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
    if (syncFeedTodosToLocalHistory()) {
      await saveTasksState();
    }
    drawTasksModule(container, userContext);
  });

  container.querySelector("#slack-import-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    tasksState.slackFeed = await importTasksJson("slack", file);
    if (syncFeedTodosToLocalHistory()) {
      await saveTasksState();
    }
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
    tasksState.notes = {
      detailNotes: {},
      meetingNotes: {}
    };
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
            <label for="todo-partner">Partner or customer</label>
            <input id="todo-partner" name="partnerName" placeholder="Partner, customer, or account" />
          </div>
          <div class="field">
            <label for="todo-activity-type">Activity type</label>
            <select id="todo-activity-type" name="activityType">
              ${renderTodoOptions(getActivityTypes(), "partner-follow-up")}
            </select>
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
          <div class="field">
            <label for="todo-period">Reporting period</label>
            <input id="todo-period" name="period" placeholder="${getCurrentQuarter()}" />
          </div>
          <div class="field">
            <label for="todo-tags">Flags / tags</label>
            <input id="todo-tags" name="tags" placeholder="renewal, enablement, follow-up" />
          </div>
          <div class="field form-grid-wide">
            <label for="todo-completion-comment">Completion comment</label>
            <textarea id="todo-completion-comment" name="completionComment" rows="2" placeholder="What was done? This is saved in the activity history."></textarea>
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
          <div class="field">
            <label for="todo-filter-activity-type">Activity type</label>
            <select id="todo-filter-activity-type">
              ${renderTodoOptions(["all", ...getActivityTypes()], tasksState.filters.activityType)}
            </select>
          </div>
          <div class="field">
            <label for="todo-filter-period">Period</label>
            <select id="todo-filter-period">
              ${renderTodoOptions(getAvailablePeriods(), tasksState.filters.period)}
            </select>
          </div>
          <div class="field">
            <label for="todo-filter-partner">Partner or customer</label>
            <input id="todo-filter-partner" value="${escapeHtml(tasksState.filters.partner)}" placeholder="Search partner/customer" />
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
      ${renderClaudeHistorySummaries()}
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

  wireClaudeTaskEvents(tabContent, container, userContext);
}

function renderClaudeHistorySummaries() {
  const summaries = [
    {
      key: "claude-email-history-summary",
      title: "Important email history summary",
      content:
        tasksState.claudeFeed?.importantEmailHistorySummary ||
        tasksState.claudeFeed?.emailHistorySummary ||
        tasksState.claudeFeed?.importantEmailsHistory ||
        ""
    },
    {
      key: "claude-meeting-history-summary",
      title: "Weekly meeting history summary",
      content:
        tasksState.claudeFeed?.meetingsWeekHistorySummary ||
        tasksState.claudeFeed?.weeklyMeetingsSummary ||
        tasksState.claudeFeed?.meetingsHistorySummary ||
        ""
    }
  ].filter((summary) => hasSummaryContent(summary.content) || tasksState.notes.detailNotes[summary.key]);

  if (!summaries.length) {
    return "";
  }

  return `
    <section class="tasks-feed-grid">
      ${summaries
        .map((summary) => {
          const content = stringifySummary(summary.content);
          const saved = tasksState.notes.detailNotes[summary.key];
          const preview = saved || content;

          return `
            <article class="panel task-card">
              <h3>${escapeHtml(summary.title)}</h3>
              <p>${escapeHtml(truncateText(preview, 220))}</p>
              <button
                class="button secondary compact-button"
                data-detail-open="${escapeHtml(summary.key)}"
                data-detail-title="${escapeHtml(summary.title)}"
                data-detail-content="${escapeHtml(content)}"
                type="button"
              >
                Read / edit details
              </button>
            </article>
          `;
        })
        .join("")}
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
      source: String(data.get("source") || "manual"),
      partnerName: String(data.get("partnerName") || "").trim(),
      activityType: String(data.get("activityType") || "partner-follow-up"),
      period: String(data.get("period") || getCurrentQuarter()).trim(),
      tags: String(data.get("tags") || "").trim(),
      completionComment: String(data.get("completionComment") || "").trim()
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

  tabContent.querySelector("#todo-filter-activity-type")?.addEventListener("change", (event) => {
    tasksState.filters.activityType = event.target.value;
    drawTasksModule(container, userContext);
  });

  tabContent.querySelector("#todo-filter-period")?.addEventListener("change", (event) => {
    tasksState.filters.period = event.target.value;
    drawTasksModule(container, userContext);
  });

  tabContent.querySelector("#todo-filter-partner")?.addEventListener("input", (event) => {
    tasksState.filters.partner = event.target.value;
    drawTasksModule(container, userContext);
  });

  tabContent.querySelectorAll("[data-todo-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const comment = tabContent.querySelector(`[data-todo-comment="${cssEscape(button.dataset.todoToggle)}"]`)?.value || "";
      updateTodoComment(button.dataset.todoToggle, comment.trim());
      toggleTodoStatus(button.dataset.todoToggle);
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

function wireClaudeTaskEvents(tabContent, container, userContext) {
  tabContent.querySelectorAll("[data-meeting-note-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.meetingNoteSave;
      const note = tabContent.querySelector(`[data-meeting-note="${cssEscape(key)}"]`)?.value || "";
      tasksState.notes.meetingNotes = {
        ...tasksState.notes.meetingNotes,
        [key]: note.trim()
      };
      await saveTasksState();
      drawTasksModule(container, userContext);
    });
  });

  tabContent.querySelectorAll("[data-detail-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openEditableDetailModal({
        key: button.dataset.detailOpen,
        title: button.dataset.detailTitle || "Details",
        content: button.dataset.detailContent || "",
        container,
        userContext
      });
    });
  });
}

function openEditableDetailModal({ key, title, content, container, userContext }) {
  const existingModal = document.querySelector(".task-modal-backdrop");
  existingModal?.remove();

  const savedContent = tasksState.notes.detailNotes[key];
  const modal = document.createElement("div");
  modal.className = "task-modal-backdrop";
  modal.innerHTML = `
    <section class="task-modal panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header>
        <h3>${escapeHtml(title)}</h3>
        <button class="button secondary compact-button" data-modal-close type="button">Close</button>
      </header>
      <textarea data-modal-detail rows="14">${escapeHtml(savedContent || content)}</textarea>
      <footer>
        <p class="muted">Saved locally in this browser for your working notes and reporting history.</p>
        <button class="button primary" data-modal-save type="button">Save details</button>
      </footer>
    </section>
  `;

  modal.querySelector("[data-modal-close]").addEventListener("click", () => {
    modal.remove();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });

  modal.querySelector("[data-modal-save]").addEventListener("click", async () => {
    const detail = modal.querySelector("[data-modal-detail]").value.trim();
    tasksState.notes.detailNotes = {
      ...tasksState.notes.detailNotes,
      [key]: detail
    };
    await saveTasksState();
    modal.remove();
    drawTasksModule(container, userContext);
  });

  document.body.append(modal);
}

async function loadSavedTodos() {
  const stored = await getRecord("tasksState", "todos");
  return stored?.items || [];
}

async function loadDeletedTodoIds() {
  const stored = await getRecord("tasksState", "deletedTodoIds");
  return stored?.items || [];
}

async function loadTaskNotes() {
  const stored = await getRecord("tasksState", "notes");
  return {
    detailNotes: stored?.value?.detailNotes || {},
    meetingNotes: stored?.value?.meetingNotes || {}
  };
}

function getMergedTodos() {
  const feedTodos = [
    ...(tasksState.claudeFeed?.todos || []).map((todo) =>
      normalizeTodo(todo, "claude-routine", tasksState.claudeFeed?.generatedAt)
    ),
    ...(tasksState.slackFeed?.todos || []).map((todo) =>
      normalizeTodo(todo, "slack-bot", tasksState.slackFeed?.generatedAt)
    )
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
    const matchesActivityType =
      tasksState.filters.activityType === "all" || getTodoActivityType(todo) === tasksState.filters.activityType;
    const matchesPeriod =
      tasksState.filters.period === "all" || getTodoPeriod(todo) === tasksState.filters.period;
    const partnerNeedle = tasksState.filters.partner.trim().toLowerCase();
    const matchesPartner =
      !partnerNeedle || getTodoPartner(todo).toLowerCase().includes(partnerNeedle);

    return matchesStatus && matchesPriority && matchesSource && matchesActivityType && matchesPeriod && matchesPartner;
  }).sort(sortTodos);
}

function renderMeetingCards(meetings, scope) {
  return `
    <section class="tasks-feed-grid">
      ${meetings
        .map((meeting) => {
          const key = getMeetingKey(meeting, scope);
          const note = tasksState.notes.meetingNotes[key] ?? meeting.preparationNotes ?? "";

          return `
            <article class="panel task-card">
              <h3>${escapeHtml(meeting.title)}</h3>
              <p class="muted">${escapeHtml(meeting.start || "")} to ${escapeHtml(meeting.end || "")}</p>
              <div class="field meeting-note-field">
                <label for="meeting-note-${escapeHtml(key)}">Preparation notes</label>
                <textarea id="meeting-note-${escapeHtml(key)}" data-meeting-note="${escapeHtml(key)}" rows="4">${escapeHtml(note)}</textarea>
              </div>
              <div class="toolbar">
                <button class="button secondary compact-button" data-meeting-note-save="${escapeHtml(key)}" type="button">Save note</button>
                <button
                  class="button secondary compact-button"
                  data-detail-open="${escapeHtml(key)}"
                  data-detail-title="${escapeHtml(meeting.title || "Meeting details")}"
                  data-detail-content="${escapeHtml(formatMeetingDetails(meeting, note))}"
                  type="button"
                >
                  Read / edit details
                </button>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function fillTodoForm(tabContent, todo) {
  tabContent.querySelector("#todo-title").value = todo.title || "";
  tabContent.querySelector("#todo-description").value = todo.description || "";
  tabContent.querySelector("#todo-partner").value = getTodoPartner(todo);
  tabContent.querySelector("#todo-activity-type").value = getTodoActivityType(todo);
  tabContent.querySelector("#todo-priority").value = todo.priority || "medium";
  tabContent.querySelector("#todo-due-date").value = todo.dueDate || "";
  tabContent.querySelector("#todo-status").value = todo.status || "open";
  tabContent.querySelector("#todo-source").value = todo.source || "manual";
  tabContent.querySelector("#todo-period").value = getTodoPeriod(todo);
  tabContent.querySelector("#todo-tags").value = (todo.tags || []).join(", ");
  tabContent.querySelector("#todo-completion-comment").value = todo.completionComment || "";
}

function renderTaskTab(tab, label) {
  return `<button class="tab-button ${tasksState.activeTab === tab ? "active" : ""}" data-tasks-tab="${tab}" type="button">${label}</button>`;
}

function renderTodoOptions(values, selected) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(formatOptionLabel(value))}</option>`
    )
    .join("");
}

function syncFeedTodosToLocalHistory() {
  const feedTodos = [
    ...(tasksState.claudeFeed?.todos || []).map((todo) =>
      normalizeTodo(todo, "claude-routine", tasksState.claudeFeed?.generatedAt)
    ),
    ...(tasksState.slackFeed?.todos || []).map((todo) =>
      normalizeTodo(todo, "slack-bot", tasksState.slackFeed?.generatedAt)
    )
  ];

  if (!feedTodos.length) {
    return false;
  }

  let changed = false;
  const localById = new Map(tasksState.todos.map((todo) => [todo.id, todo]));

  feedTodos.forEach((feedTodo) => {
    const existing = localById.get(feedTodo.id);
    if (!existing) {
      tasksState.todos = [...tasksState.todos, feedTodo];
      localById.set(feedTodo.id, feedTodo);
      changed = true;
      return;
    }

    const nextTodo = mergeFeedTodo(existing, feedTodo);
    if (JSON.stringify(existing) !== JSON.stringify(nextTodo)) {
      tasksState.todos = tasksState.todos.map((todo) => (todo.id === nextTodo.id ? nextTodo : todo));
      localById.set(nextTodo.id, nextTodo);
      changed = true;
    }
  });

  return changed;
}

function mergeFeedTodo(existing, feedTodo) {
  return {
    ...feedTodo,
    ...existing,
    title: existing.title || feedTodo.title,
    description: existing.description || feedTodo.description,
    priority: existing.priority || feedTodo.priority,
    dueDate: existing.dueDate || feedTodo.dueDate,
    source: existing.source || feedTodo.source,
    partnerName: existing.partnerName || feedTodo.partnerName,
    activityType: existing.activityType || feedTodo.activityType,
    period: existing.period || feedTodo.period,
    tags: existing.tags?.length ? existing.tags : feedTodo.tags,
    completionComment: existing.completionComment || feedTodo.completionComment,
    sourceUpdatedAt: feedTodo.sourceUpdatedAt,
    updatedAt: existing.updatedAt || feedTodo.updatedAt
  };
}

function normalizeTodo(todo, source = "manual", generatedAt = "") {
  const dueDate = todo.dueDate || todo.date || "";
  const period = todo.period || getQuarterFromDate(dueDate || generatedAt || new Date().toISOString());
  const activityType = todo.activityType || inferActivityType(todo);
  const partnerName = todo.partnerName || todo.partner || todo.customer || todo.account || "";
  const status = todo.status || "open";

  return {
    id: todo.id || `${source}-${simpleHash([todo.title, todo.description, dueDate, generatedAt].join("|"))}`,
    title: todo.title || todo.subject || "Untitled task",
    description: todo.description || todo.summary || todo.reason || "",
    priority: todo.priority || "medium",
    dueDate,
    status,
    source: todo.source || source,
    partnerName,
    activityType,
    period,
    tags: normalizeTags(todo.tags || todo.flags || []),
    completionComment: todo.completionComment || todo.comment || "",
    completedAt: status === "done" ? todo.completedAt || new Date().toISOString() : todo.completedAt || "",
    createdAt: todo.createdAt || generatedAt || new Date().toISOString(),
    updatedAt: todo.updatedAt || generatedAt || new Date().toISOString(),
    sourceUpdatedAt: generatedAt || todo.updatedAt || ""
  };
}

function renderTodoMeta(todo) {
  const tags = normalizeTags(todo.tags);
  return [
    `<span class="todo-chip">${escapeHtml(todo.status === "done" ? "Done" : "Open")}</span>`,
    getTodoPartner(todo) ? `<span class="todo-chip">${escapeHtml(getTodoPartner(todo))}</span>` : "",
    `<span class="todo-chip">${escapeHtml(formatOptionLabel(getTodoActivityType(todo)))}</span>`,
    `<span class="todo-chip">${escapeHtml(getTodoPeriod(todo))}</span>`,
    ...tags.map((tag) => `<span class="todo-chip flag">${escapeHtml(tag)}</span>`)
  ]
    .filter(Boolean)
    .join("");
}

function renderTodoFooter(todo) {
  const completed = todo.completedAt ? ` | Completed: ${formatDate(todo.completedAt)}` : "";
  const comment = todo.completionComment ? ` | Comment: ${escapeHtml(todo.completionComment)}` : "";
  return `Source: ${escapeHtml(todo.source || "manual")} | Due: ${escapeHtml(todo.dueDate || "-")}${completed}${comment}`;
}

function getActivityTypes() {
  return [
    "partner-follow-up",
    "customer-meeting",
    "email",
    "enablement",
    "renewal",
    "escalation",
    "internal",
    "admin",
    "other"
  ];
}

function getAvailablePeriods() {
  const periods = new Set(["all", getCurrentQuarter()]);
  getMergedTodos().forEach((todo) => periods.add(getTodoPeriod(todo)));
  return Array.from(periods).filter(Boolean);
}

function getTodoPartner(todo) {
  return todo.partnerName || todo.partner || todo.customer || todo.account || "";
}

function getTodoActivityType(todo) {
  return todo.activityType || inferActivityType(todo);
}

function getTodoPeriod(todo) {
  return todo.period || getQuarterFromDate(todo.dueDate || todo.completedAt || todo.createdAt || new Date().toISOString());
}

function inferActivityType(todo) {
  const text = `${todo.title || ""} ${todo.description || ""} ${todo.subject || ""}`.toLowerCase();
  if (text.includes("renewal")) return "renewal";
  if (text.includes("meeting") || text.includes("sync")) return "customer-meeting";
  if (text.includes("email") || text.includes("reply")) return "email";
  if (text.includes("enablement") || text.includes("training") || text.includes("course")) return "enablement";
  if (text.includes("escalation") || text.includes("urgent")) return "escalation";
  if (text.includes("partner")) return "partner-follow-up";
  return "other";
}

function getCurrentQuarter() {
  return getQuarterFromDate(new Date().toISOString());
}

function getQuarterFromDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  }
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sortTodos(a, b) {
  if (a.status !== b.status) {
    return a.status === "done" ? 1 : -1;
  }
  const dateA = a.dueDate || "9999-12-31";
  const dateB = b.dueDate || "9999-12-31";
  return dateA.localeCompare(dateB);
}

function formatOptionLabel(value) {
  if (value === "all") {
    return "All";
  }
  return String(value || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return String(value).slice(0, 10);
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getEmailKey(item) {
  return `email-${item.id || simpleHash([item.subject, item.from, item.summary, item.reason].join("|"))}`;
}

function getMeetingKey(meeting, scope) {
  return `meeting-${scope}-${meeting.id || simpleHash([meeting.title, meeting.start, meeting.end].join("|"))}`;
}

function formatEmailDetails(item) {
  return [
    `Subject: ${item.subject || "Untitled email"}`,
    `From: ${item.from || "Unknown sender"}`,
    `Priority: ${item.priority || "normal"}`,
    "",
    "Summary:",
    item.summary || item.reason || "",
    "",
    "Suggested action:",
    item.suggestedAction || "None",
    item.historySummary ? `\nHistory:\n${stringifySummary(item.historySummary)}` : ""
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

function formatMeetingDetails(meeting, note) {
  return [
    `Title: ${meeting.title || "Untitled meeting"}`,
    `Start: ${meeting.start || "-"}`,
    `End: ${meeting.end || "-"}`,
    meeting.attendees?.length ? `Attendees: ${meeting.attendees.join(", ")}` : "",
    "",
    "Preparation notes:",
    note || meeting.preparationNotes || "",
    meeting.historySummary ? `\nHistory:\n${stringifySummary(meeting.historySummary)}` : ""
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

function hasSummaryContent(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return Boolean(String(value || "").trim());
}

function stringifySummary(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "object" ? JSON.stringify(item, null, 2) : String(item)))
      .join("\n\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value || "");
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trim()}...`;
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replaceAll('"', '\\"');
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
