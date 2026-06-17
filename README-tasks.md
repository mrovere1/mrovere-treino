# Channel SE Tasks — App de tarefas + Daily Briefs

App de controle das atividades do Channel SE, publicado em **`www.mrovere.com/tasks.html`** e embutido no portal no módulo **MROVERE Tasks** (`#/mrovere-tasks`).

- **Persistência:** Google Drive via **Google Apps Script** (planilha `Channel SE Tasks (MROVERE)` no seu Drive)
- **Sem `localStorage` para dados** — no portal o endpoint vem do perfil Firebase; standalone usa a URL salva localmente
- **Repo do site:** `mrovere1/mrovere-treino` (branch `main`, GitHub Pages)

---

## 📁 Arquivos

**No repo do site (`mrovere1/mrovere-treino`):**

| Arquivo | Função |
|---|---|
| `tasks.html` | App completo: aba **Tasks** + aba **Daily Briefs** |
| `src/roles.js` | Visibilidade do módulo (`requiresProfileFlag: "tasksEndpoint"`) |
| `src/tasks-dashboard.js` | Embute `tasks.html` no portal + injeta o endpoint via `postMessage` |
| `apps-script/Code.gs` | Backend Apps Script (espelho — cole no script.google.com) |
| `data/briefs/attention-today.html` | Brief do cowork **com a camada híbrida** (publicado pelo pipeline) |
| `scripts/publish_brief.py` | Pipeline: Drive → repo (usado pela Action e manual) |
| `.github/workflows/sync-daily-brief.yml` | Action diária que roda o pipeline |

**Local (`app-mrovere/partner-dashboard/`):**

| Arquivo | Função |
|---|---|
| `apps-script/Code.gs` | Espelho do backend |
| `scripts/publish_brief.py` | Cópia local p/ rodar manual |
| `scripts/.env` | `GITHUB_TOKEN`, `APPS_SCRIPT_URL`, `TABLEAU_*` — **nunca commitar** |

---

## 🗂️ Aba Tasks

- **Campos:** categoria (Cliente / Parceiro / Tenable), prioridade (Alta/Média/Baixa), **status**, data alvo, título, descrição
- **Editar:** clique no título → modal (muda todos os campos)
- **Subtasks (profundidade ilimitada):** campo `parentId`; árvore com indentação, expandir/recolher, **＋** (nova subtask), progresso do pai (ex.: `2/4`), reparent no modal; excluir pai remove a subárvore
- **Status (label):** espelha a marcação do morning brief

  | Status | Significado |
  |---|---|
  | `new` | nova neste ciclo |
  | `active` | mantida de reports anteriores ("herdado") |
  | `resurfaced` | sumiu e reapareceu |
  | `done` | concluída |

- **Concluir:** checkbox → vai para *Concluídas* (toggle "Mostrar concluídas")
- **Filtros/ordenação:** categoria, prioridade, status, busca; colunas ordenáveis
- **Salvar:** mudanças ficam **locais** até **Salvar no Drive** (barra inferior) ou **Cmd/Ctrl+S**; sair com alteração não salva dispara alerta (`beforeunload`)
- **Reparo automático:** linhas antigas salvas antes da coluna `status` (desalinhadas) são realinhadas no carregamento

**Esquema da planilha** (aba `Tasks`):
`id · createdAt · targetDate · category · priority · status · title · description · done · doneAt · parentId`
Aba `Meta`: `B1` = JSON de `briefChecks` (inclui `_done` dos itens de brief concluídos).

---

## 📰 Aba Daily Briefs (híbrida)

A aba renderiza o **HTML do cowork** (`attention-today-updated.html`) num iframe, com uma **camada híbrida** injetada:

- **＋ task** em cada action item → cria uma task (mapeia `partner→parceiro`, `customer→cliente`, senão `tenable`; `high/medium/low → alta/média/baixa`; `summary→descrição`; due date convertido) e dispensa o item
- **✓ concluir** → marca o item como concluído
- **Itens concluídos/convertidos não reaparecem no próximo report** — usa o `id` estável que o cowork dá a cada item (inclusive herdados), guardado em `briefChecks._done` no Drive
- Persiste de verdade ao clicar **Salvar no Drive**

> Bridge via `postMessage` entre `tasks.html` (pai) e o iframe do brief.

---

## 🔌 Persistência & visibilidade (Firebase)

A URL do Apps Script é atrelada à **identidade Firebase**, não ao navegador. **Sem role nova.**

| Campo em `users/{uid}` (Firestore) | Função |
|---|---|
| `tasksEndpoint` | URL do web app; **sem ela o módulo não aparece** |
| `tasksToken` | token opcional (se `SECRET` no `Code.gs`) |

- `src/roles.js`: módulo só aparece para quem tem `tasksEndpoint`
- `src/tasks-dashboard.js`: injeta o endpoint no iframe (`postMessage`, same-origin)
- `tasks.html`: no portal ignora `localStorage`; clicar no chip **"Drive"** abre a tela p/ colar/corrigir a URL (override local)
- Regra Firestore: ler só o próprio doc — `allow get: if signedIn() && request.auth.uid == userId;`

---

## ⚙️ Pipeline do Daily Brief (Drive → repo)

O cowork gera `attention-today-updated.html` no Drive (`Computers > My Mac > outputs`) com **id novo a cada dia** → o pipeline busca **por nome** via Apps Script.

1. **Apps Script** — rota `?action=brief` no `Code.gs` (`getLatestBrief_` via `DriveApp`) devolve o HTML mais recente. Requer escopo Drive → rode `authorizeDrive()` uma vez no editor.
2. **`publish_brief.py`** — GET no Apps Script → injeta a camada híbrida → commita `data/briefs/attention-today.html` (GitHub API). Idempotente; `--force`, `--dry-run`.
3. **Action `sync-daily-brief.yml`** — schedule **09:00 e 11:00 (SP)** + `workflow_dispatch`. Secrets do repo: `APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN` (opcional).

**Rodar manual (qualquer hora):**
```bash
cd ~/Documents/app-mrovere/partner-dashboard/scripts
.venv/bin/python3 publish_brief.py          # publica se mudou
.venv/bin/python3 publish_brief.py --force   # força
```

---

## 🔧 Setup (1x)

1. **Apps Script:** colar `Code.gs` → Implantar como App da Web (executar como Eu; acesso "Qualquer pessoa com o link") → rodar `authorizeDrive()` p/ conceder o Drive → copiar a URL `…/exec`
2. **Firebase:** `users/{uid}` → campo `tasksEndpoint` = URL (e `tasksToken` se usar `SECRET`)
3. **Repo secrets** (Settings → Secrets → Actions → **Repository secrets**): `APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`
4. **`.env` local:** `APPS_SCRIPT_URL`, `GITHUB_TOKEN`

A planilha `Channel SE Tasks (MROVERE)` é criada sozinha no Drive na primeira gravação.

---

## 📌 Backlog

- [ ] Tema: HTML do cowork usa paleta antiga (light) — gerar/aplicar dark 2026
- [ ] Histórico de briefs por dia (hoje só o `updated` mais recente)
- [ ] Cowork atribuir `new`/`active`/`resurfaced` automaticamente

---

*Atualizado: 2026-06-17 — Marcelo Rovere, Channel SE Tenable Brasil*
