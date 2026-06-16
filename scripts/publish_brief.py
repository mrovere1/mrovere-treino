#!/usr/bin/env python3
"""
publish_brief.py — Drive (via Apps Script) → repo

Busca o "attention-today-updated.html" mais recente do Google Drive através do
seu Apps Script (rota ?action=brief), injeta a camada híbrida (+task / concluir /
filtro de concluídos) e commita em data/briefs/attention-today.html no repo do app.

Roda igual local (manual) e no GitHub Action.

Variáveis de ambiente:
  APPS_SCRIPT_URL    (obrigatório)  URL do web app do Apps Script (…/exec)
  APPS_SCRIPT_TOKEN  (opcional)     token, se você definiu SECRET no Code.gs
  GITHUB_TOKEN       (obrigatório)  PAT/Action token com contents:write
  GITHUB_REPO        (default mrovere1/mrovere-treino)
  BRIEF_REPO_PATH    (default data/briefs/attention-today.html)

Uso:
  python publish_brief.py            # publica se mudou
  python publish_brief.py --force    # publica mesmo sem mudança
  python publish_brief.py --dry-run  # só mostra, não commita
"""

import argparse
import base64
import os
import sys
from urllib.parse import quote

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

# ── Hybrid layer injected before </body> (mantém igual ao tasks.html) ──────────
LAYER = r"""
<!-- ░░ MROVERE hybrid layer — +task, persist-done, hide-completed ░░ -->
<style>
.ait{position:relative}
.hx-actions{position:absolute;top:6px;right:6px;display:flex;gap:4px;opacity:0;transition:opacity .12s;z-index:5}
.ait:hover .hx-actions{opacity:1}
.hx-btn{border:none;border-radius:5px;font-size:10px;font-weight:700;padding:3px 8px;cursor:pointer;line-height:1.4}
.hx-task{background:#00A1D5;color:#fff}.hx-task:hover{background:#0089b5}
.hx-done{background:#00C48C;color:#04361f}.hx-done:hover{background:#00b07d}
</style>
<script>
(function(){
  "use strict";
  var ORIGIN=location.origin, embedded=window.parent&&window.parent!==window, doneIds={}, master=null;
  var origRender=window.renderActions;
  function snap(){ if(!master&&typeof actionItems!=='undefined') master=actionItems.slice(); }
  function filt(){ snap(); if(master) actionItems=master.filter(function(a){return !doneIds[a.id];}); }
  function rerender(){ filt(); if(origRender) origRender(); decorate();
    if(typeof renderStats==='function') renderStats(); if(typeof renderBanner==='function') renderBanner(); }
  function decorate(){
    var body=document.getElementById('acBody'); if(!body) return;
    var els=body.querySelectorAll('.ait');
    for(var i=0;i<els.length;i++){ (function(el){
      if(el.querySelector('.hx-actions')) return;
      var id=el.id.replace(/^ai-/,'');
      var w=document.createElement('div'); w.className='hx-actions';
      var t=document.createElement('button'); t.className='hx-btn hx-task'; t.textContent='＋ task';
      t.onclick=function(e){e.stopPropagation();toTask(id);};
      var d=document.createElement('button'); d.className='hx-btn hx-done'; d.textContent='✓ concluir';
      d.onclick=function(e){e.stopPropagation();markDone(id);};
      w.appendChild(t); w.appendChild(d); el.appendChild(w);
    })(els[i]); }
  }
  function markDone(id){ doneIds[id]=true; post({type:'brief-done',id:id}); rerender(); }
  function toTask(id){ var it=(master||[]).find(function(a){return a.id===id;});
    if(!it&&typeof actionItems!=='undefined') it=actionItems.find(function(a){return a.id===id;});
    if(it){ doneIds[id]=true; post({type:'brief-to-task',item:it}); rerender(); } }
  window.tog=function(id){ markDone(id); };
  function post(m){ if(embedded){ try{ parent.postMessage(m,ORIGIN); }catch(e){} } }
  window.addEventListener('message',function(e){ if(e.origin!==ORIGIN) return;
    if(e.data&&e.data.type==='brief-state'){ doneIds=e.data.doneIds||{}; rerender(); } });
  function boot(){ snap(); post({type:'brief-ready'}); if(!embedded) rerender(); }
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded',boot);
})();
</script>
"""

GITHUB_API = "https://api.github.com"


def fetch_brief_html() -> str:
    url = os.getenv("APPS_SCRIPT_URL", "").strip()
    token = os.getenv("APPS_SCRIPT_TOKEN", "").strip()
    if not url:
        sys.exit("❌ APPS_SCRIPT_URL não definido (.env ou env).")

    full = url + (("&" if "?" in url else "?") + "action=brief")
    if token:
        full += "&token=" + quote(token)

    resp = requests.get(full, timeout=90, allow_redirects=True)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        sys.exit(f"❌ Apps Script retornou erro: {data.get('error')}")
    brief = data.get("brief")
    if not brief or not brief.get("html"):
        sys.exit("❌ Nenhum 'attention-today-updated.html' encontrado no Drive.")
    print(f"   Drive: {brief['name']} (modificado {brief.get('modified')})")
    return brief["html"]


def inject_layer(html: str) -> str:
    if "MROVERE hybrid layer" in html:
        return html  # já transformado
    if "</body>" not in html:
        sys.exit("❌ HTML do cowork sem </body>.")
    return html.replace("</body>", LAYER + "\n</body>", 1)


def gh_headers():
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token:
        sys.exit("❌ GITHUB_TOKEN não definido.")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def get_current(repo: str, path: str):
    url = f"{GITHUB_API}/repos/{repo}/contents/{quote(path, safe='/')}"
    r = requests.get(url, headers=gh_headers(), timeout=30)
    if r.status_code == 200:
        j = r.json()
        return j["sha"], base64.b64decode(j["content"]).decode("utf-8", "replace")
    return None, None


def commit(repo: str, path: str, content: str, sha):
    url = f"{GITHUB_API}/repos/{repo}/contents/{quote(path, safe='/')}"
    payload = {
        "message": "sync: daily brief from Google Drive (cowork + hybrid layer)",
        "content": base64.b64encode(content.encode("utf-8")).decode(),
    }
    if sha:
        payload["sha"] = sha
    r = requests.put(url, headers=gh_headers(), json=payload, timeout=60)
    r.raise_for_status()
    return r.json()["commit"]["sha"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="commita mesmo sem mudança")
    ap.add_argument("--dry-run", action="store_true", help="não commita")
    args = ap.parse_args()

    repo = os.getenv("GITHUB_REPO", "mrovere1/mrovere-treino")
    path = os.getenv("BRIEF_REPO_PATH", "data/briefs/attention-today.html")

    print("📥 Buscando brief mais recente no Drive (via Apps Script)…")
    enhanced = inject_layer(fetch_brief_html())
    print(f"   HTML final: {len(enhanced)} chars")

    sha, current = get_current(repo, path)
    if current == enhanced and not args.force:
        print("✅ Sem mudança — nada a publicar (use --force para forçar).")
        return

    if args.dry_run:
        print(f"   [dry-run] Publicaria {path} ({'novo' if sha is None else 'atualizado'}).")
        return

    commit_sha = commit(repo, path, enhanced, sha)
    print(f"✅ Publicado {path} → {commit_sha[:7]}")
    print(f"   https://github.com/{repo}/commit/{commit_sha}")
    print("   → GitHub Pages atualiza em ~1-2 min.")


if __name__ == "__main__":
    main()
