# Channel SE Tasks — App de tarefas + Daily Briefs

App de controle de atividades do Channel SE, publicado em **`www.mrovere.com/tasks.html`** e embutido no portal dentro do módulo **MROVERE Tasks** (`#/mrovere-tasks`).

- **Persistência:** Google Drive via **Google Apps Script** (planilha `Channel SE Tasks (MROVERE)` no seu Drive)
- **Sem `localStorage` para dados** — o navegador guarda apenas a URL do endpoint
- **Repositório do site:** `mrovere1/mrovere-treino` (branch `main`, GitHub Pages)

---

## 📁 Arquivos

| Arquivo | Função |
|---|---|
| `tasks.html` (raiz do repo do site) | App completo: aba Tasks + aba Daily Briefs |
| `apps-script/Code.gs` | Backend Apps Script (espelho — cole no script.google.com) |
| `data/briefs/*.md` + `index.json` | Morning briefs lidos pela aba Daily Briefs |

---

## 🔗 Setup da persistência (1x, ~2 min)

1. Abra **[script.google.com](https://script.google.com)** → **Novo projeto**
2. Cole **todo** o conteúdo de `apps-script/Code.gs` em `Code.gs` (substituindo o padrão) → salve
3. **Implantar** → **Nova implantação** → tipo **App da Web**
   - **Executar como:** Eu (sua conta)
   - **Quem pode acessar:** Qualquer pessoa com o link
4. Autorize os acessos quando o Google pedir
5. Copie a **URL do app da Web** (`https://script.google.com/macros/s/…/exec`)
6. No app de tasks, na tela de conexão, cole a URL → **Conectar**

A planilha **`Channel SE Tasks (MROVERE)`** é criada automaticamente no seu Drive na primeira gravação. Você pode abri-la e ver/editar as tasks direto no Drive (abas `Tasks` e `Meta`).

### Segurança opcional (token)

A URL do app da Web já é secreta. Para reforçar:
1. No `Code.gs`, defina `const SECRET = '<valor-aleatório>';`
2. Reimplante (Implantar → Gerenciar implantações → editar → Nova versão)
3. No app, cole o mesmo valor no campo **Token**

> ⚠️ A URL e o token **não** ficam no repositório — só no navegador (`localStorage`) e na planilha.

---

## 🧭 Uso

### Aba Tasks
- **Adicionar:** categoria (Cliente / Parceiro / Tenable), prioridade, **status**, data alvo, título e descrição
- **Editar:** clique no título → modal de edição (muda categoria, prioridade, status, data alvo, título, descrição)
- **Concluir:** checkbox na linha → vira `done` e vai para a seção *Concluídas* (toggle "Mostrar concluídas")
- **Filtros:** categoria, prioridade, status, busca textual; colunas ordenáveis (clicar no cabeçalho)
- **Salvar:** mudanças ficam **locais** até clicar **Salvar no Drive** (barra inferior) ou **Cmd/Ctrl+S**
- **Proteção:** ao tentar sair com alterações não salvas, o navegador exibe alerta

### Status da task (label)
Espelha a marcação que o morning brief gera a cada report:

| Status | Significado | Origem no brief |
|---|---|---|
| `new` | Task nova neste ciclo | task nova no report |
| `active` | Task que se mantém de reports anteriores | label "herdado" |
| `resurfaced` | Task que sumiu e **reapareceu** | reaparição |
| `done` | Concluída | — |

> O preenchimento automático a partir do brief é responsabilidade do gerador do morning brief (rotina Claude/cowork). No app, o status é um campo editável de primeira classe.

### Aba Daily Briefs
- Lê os arquivos de `~/Documents/claude/daily-briefs/reports/` publicados em `data/briefs/`
- Sidebar com cada brief; checkbox por item (atenção, e-mails, action items, slack)
- Barra de progresso por brief; botão **+ task** converte um item do brief em task
- O estado dos checkboxes é salvo junto com as tasks (no Drive)

---

## 🔄 Atualizar o app

`tasks.html` e `apps-script/Code.gs` são commitados no repo `mrovere1/mrovere-treino` via GitHub API (mesmo fluxo do Excel do partner dashboard). Commit no `main` → GitHub Pages publica em ~1-2 min.

Os briefs são publicados copiando os `.md` para `data/briefs/` e atualizando `data/briefs/index.json`.

---

*Atualizado: 2026-06-15 — Marcelo Rovere, Channel SE Tenable Brasil*
