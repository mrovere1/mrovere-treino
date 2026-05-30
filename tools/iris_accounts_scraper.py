#!/usr/bin/env python3
"""
IRIS accounts scraper for the Apps MROVERE portal.

The script reads account identifiers from data/iris/latest.json, fetches account
details, and saves:
- data/iris/accounts_latest.json
- data/iris/accounts_<timestamp>.json
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

BASE_URL = "https://iris.tenablesecurity.com"
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "iris"
CONTAINERS_PATH = DATA_DIR / "latest.json"
LATEST_ACCOUNTS_PATH = DATA_DIR / "accounts_latest.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("iris-accounts")


def build_session(cookie: str) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Cookie": cookie,
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Apps MROVERE IRIS accounts scraper",
            "Referer": f"{BASE_URL}/accounts",
        }
    )
    return session


def read_cookie(args: argparse.Namespace) -> str:
    if args.cookie:
        return args.cookie.strip()
    if args.cookie_file:
        return Path(args.cookie_file).read_text(encoding="utf-8").strip()
    raise SystemExit("Provide --cookie or --cookie-file.")


def extract_account_ids(path: Path) -> dict[str, list[str]]:
  if not path.exists():
    raise SystemExit(f"Container snapshot not found: {path}")

  payload = json.loads(path.read_text(encoding="utf-8"))
  containers = payload.get("containers") or payload.get("items") or payload.get("data") or []
  mapping: dict[str, list[str]] = {}
  for container in containers:
    account_id = str(container.get("account_id") or container.get("accountId") or "").strip()
    container_id = str(container.get("id") or container.get("uuid") or "").strip()
    if account_id:
      mapping.setdefault(account_id, []).append(container_id)
  return mapping


def fetch_account(session: requests.Session, account_id: str, container_ids: list[str]) -> dict[str, Any]:
  response = session.get(f"{BASE_URL}/accounts/{account_id}", timeout=45)
  if response.status_code == 401:
    raise SystemExit("Unauthorized. The IRIS cookie appears to be expired.")
  if response.status_code == 404:
    return {"id": account_id, "containerIds": container_ids, "_error": "404"}
  response.raise_for_status()

  try:
    payload = response.json()
    return normalize_account(payload, account_id, container_ids)
  except ValueError:
    return normalize_account_from_html(response.text, account_id, container_ids)


def normalize_account(payload: dict[str, Any], account_id: str, container_ids: list[str]) -> dict[str, Any]:
  def pick(*keys: str) -> Any:
    for key in keys:
      if payload.get(key) not in (None, ""):
        return payload[key]
    return ""

  return {
    "id": account_id,
    "name": pick("name", "accountName"),
    "billingCountry": pick("billingCountry", "country"),
    "billingCity": pick("billingCity", "city"),
    "type": pick("type", "accountType"),
    "industry": pick("industry"),
    "accountOwnerName": pick("accountOwnerName", "ownerName"),
    "renewalOwnerName": pick("renewalOwnerName"),
    "resourceManagerName": pick("resourceManagerName"),
    "containerIds": container_ids,
    "_raw": payload,
  }


def normalize_account_from_html(html: str, account_id: str, container_ids: list[str]) -> dict[str, Any]:
  match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
  if not match:
    return {"id": account_id, "containerIds": container_ids, "_error": "missing-next-data"}

  payload = json.loads(match.group(1))
  page_props = payload.get("props", {}).get("pageProps", {})
  account = page_props.get("account", {})
  raw = account.get("_raw", {})
  return {
    "id": account_id,
    "name": account.get("name", ""),
    "billingCountry": raw.get("BillingCountry", "") or account.get("billingCountry", ""),
    "billingCity": raw.get("BillingCity", "") or account.get("billingCity", ""),
    "type": account.get("type", ""),
    "industry": raw.get("Industry", "") or account.get("industry", ""),
    "accountOwnerName": account.get("accountOwnerName", ""),
    "renewalOwnerName": account.get("renewalOwnerName", ""),
    "resourceManagerName": account.get("resourceManagerName", ""),
    "containerIds": container_ids,
    "_raw": account,
  }


def save_snapshot(accounts: list[dict[str, Any]]) -> Path:
  DATA_DIR.mkdir(parents=True, exist_ok=True)
  timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
  payload = {
    "captured_at": datetime.now(timezone.utc).isoformat(),
    "total": len(accounts),
    "accounts": accounts,
  }
  snapshot_path = DATA_DIR / f"accounts_{timestamp}.json"
  snapshot_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
  LATEST_ACCOUNTS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
  return snapshot_path


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Fetch IRIS account pages into data/iris/accounts_latest.json")
  parser.add_argument("--cookie", help="Raw Cookie header value")
  parser.add_argument("--cookie-file", help="Text file containing the cookie string")
  parser.add_argument("--containers", default=str(CONTAINERS_PATH), help="Path to latest container snapshot")
  parser.add_argument("--workers", type=int, default=8, help="Parallel workers")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  session = build_session(read_cookie(args))
  account_map = extract_account_ids(Path(args.containers))
  accounts: list[dict[str, Any]] = []

  with ThreadPoolExecutor(max_workers=args.workers) as executor:
    futures = {
      executor.submit(fetch_account, session, account_id, container_ids): account_id
      for account_id, container_ids in account_map.items()
    }
    for future in as_completed(futures):
      accounts.append(future.result())

  snapshot_path = save_snapshot(sorted(accounts, key=lambda item: item.get("name", "")))
  print(json.dumps({"saved": str(snapshot_path), "latest": str(LATEST_ACCOUNTS_PATH), "total": len(accounts)}, indent=2))


if __name__ == "__main__":
  main()
