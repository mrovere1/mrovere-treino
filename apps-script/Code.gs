/**
 * MROVERE — Channel SE Tasks · Google Apps Script backend
 * ------------------------------------------------------------------
 * Guarda tasks + estado dos daily briefs numa planilha Google no seu Drive.
 * A planilha é criada automaticamente na primeira chamada ("Channel SE Tasks (MROVERE)").
 *
 * COMO PUBLICAR (1x, ~2 min):
 *   1. https://script.google.com  →  Novo projeto
 *   2. Cole TODO este arquivo em Code.gs (substituindo o conteúdo)
 *   3. Implantar ▸ Nova implantação ▸ tipo: App da Web
 *        - Executar como:        Eu (sua conta)
 *        - Quem pode acessar:    Qualquer pessoa com o link
 *   4. Autorize os acessos quando pedir
 *   5. Copie a "URL do app da Web" e cole no app de tasks (tela de conexão)
 *
 * SEGURANÇA OPCIONAL:
 *   A URL é secreta (capability URL). Para reforçar, defina SECRET abaixo com
 *   um valor aleatório e cole o MESMO valor no campo "token" do app.
 */

const SPREADSHEET_NAME  = 'Channel SE Tasks (MROVERE)';
const SHEET_NAME_TASKS  = 'Tasks';
const SHEET_NAME_META   = 'Meta';
const TASK_COLUMNS      = ['id','createdAt','targetDate','category','priority','status','title','description','done','doneAt'];

// Deixe '' para liberar acesso só pela URL. Defina um valor para exigir token.
const SECRET = '';

// ─── Spreadsheet bootstrap ────────────────────────────────────────────────────

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  let ss = null;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  let tasksSheet = ss.getSheetByName(SHEET_NAME_TASKS);
  if (!tasksSheet) {
    tasksSheet = ss.getSheets()[0];
    tasksSheet.setName(SHEET_NAME_TASKS);
  }
  if (tasksSheet.getLastRow() === 0) {
    tasksSheet.appendRow(TASK_COLUMNS);
    tasksSheet.setFrozenRows(1);
  }
  // Keep the header row in sync with the current schema (cosmetic + safe).
  tasksSheet.getRange(1, 1, 1, TASK_COLUMNS.length)
            .setValues([TASK_COLUMNS])
            .setFontWeight('bold');

  let metaSheet = ss.getSheetByName(SHEET_NAME_META);
  if (!metaSheet) {
    metaSheet = ss.insertSheet(SHEET_NAME_META);
    metaSheet.getRange('A1').setValue('briefChecks');
  }

  return { ss, tasksSheet, metaSheet };
}

// ─── Read / write ─────────────────────────────────────────────────────────────

function readData_() {
  const { tasksSheet, metaSheet } = getSpreadsheet_();
  const values = tasksSheet.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();
  const tasks = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row[0]) continue;

    const t = {};
    TASK_COLUMNS.forEach((c, i) => { t[c] = row[i]; });

    t.done = (t.done === true || String(t.done).toLowerCase() === 'true');

    ['createdAt', 'doneAt'].forEach((k) => {
      if (t[k] instanceof Date) t[k] = t[k].toISOString();
      else t[k] = t[k] ? String(t[k]) : (k === 'doneAt' ? null : '');
    });

    t.targetDate = t.targetDate instanceof Date
      ? Utilities.formatDate(t.targetDate, tz, 'yyyy-MM-dd')
      : (t.targetDate ? String(t.targetDate) : '');

    t.status = t.status ? String(t.status) : (t.done ? 'done' : 'active');

    tasks.push(t);
  }

  let briefChecks = {};
  const blob = metaSheet.getRange('B1').getValue();
  if (blob) { try { briefChecks = JSON.parse(blob); } catch (e) {} }

  return { tasks, briefChecks };
}

function writeData_(data) {
  const { tasksSheet, metaSheet } = getSpreadsheet_();
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  const last = tasksSheet.getLastRow();
  if (last > 1) tasksSheet.deleteRows(2, last - 1);

  if (tasks.length) {
    const rows = tasks.map((t) => TASK_COLUMNS.map((c) => {
      const v = t[c];
      return (v === null || v === undefined) ? '' : v;
    }));
    tasksSheet.getRange(2, 1, rows.length, TASK_COLUMNS.length).setValues(rows);
  }

  metaSheet.getRange('A1').setValue('briefChecks');
  metaSheet.getRange('B1').setValue(JSON.stringify(data.briefChecks || {}));
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    if (SECRET && (!e || !e.parameter || e.parameter.token !== SECRET)) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    return json_({ ok: true, ...readData_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && body.token !== SECRET) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    writeData_(body);
    return json_({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
