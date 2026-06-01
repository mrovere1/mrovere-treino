#!/usr/bin/env python3
"""
IRIS container scraper for the Apps MROVERE portal.

This script keeps the cookie-based workflow and writes outputs to:
- data/iris/latest.json
- data/iris/<timestamp>.json

Optional enrichment mode fetches per-container details or usage payloads when
an additional endpoint is available. Failures are logged without stopping the
whole run.
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

BASE_URL = "https://iris.tenablesecurity.com"
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "iris"
LATEST_PATH = DATA_DIR / "latest.json"
FAILURE_LOG = DATA_DIR / "usage_failures.log"
PAGE_SIZE = 200

CONTAINER_ENDPOINTS = [
    "/api/v3/containers",
    "/api/v2/containers",
    "/api/v1/containers",
    "/api/containers",
]

USAGE_SUFFIXES = ["/usage", "/metrics", ""]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("iris-scraper")


def build_session(cookie: str) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Cookie": cookie,
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Apps MROVERE IRIS scraper",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE_URL}/containers",
        }
    )
    return session


def read_cookie(args: argparse.Namespace) -> str:
    if args.cookie:
      return args.cookie.strip()
    if args.cookie_file:
      return Path(args.cookie_file).read_text(encoding="utf-8").strip()
    raise SystemExit("Provide --cookie or --cookie-file.")


def fetch_json(session: requests.Session, url: str, params: dict[str, Any] | None = None) -> Any:
    response = session.get(url, params=params, timeout=45)
    if response.status_code == 401:
        raise SystemExit("Unauthorized. The IRIS cookie appears to be expired.")
    response.raise_for_status()
    return response.json()


def detect_container_endpoint(session: requests.Session) -> str:
    for endpoint in CONTAINER_ENDPOINTS:
        try:
            payload = fetch_json(session, BASE_URL + endpoint, {"limit": 1, "page": 1})
        except Exception:
            continue

        if isinstance(payload, (list, dict)):
            log.info("Using container endpoint: %s", endpoint)
            return endpoint

    raise SystemExit("Unable to find a working IRIS container endpoint.")


def normalize_container(raw: dict[str, Any]) -> dict[str, Any]:
    def pick(*keys: str) -> Any:
        for key in keys:
            if raw.get(key) not in (None, ""):
                return raw[key]
        return ""

    usage = pick("usage", "metrics", "consumption") or {}
    if not isinstance(usage, dict):
        usage = {}

    products = pick("products", "licenses", "plan") or []
    if isinstance(products, str):
        products = [products]

    return {
        "id": pick("id", "uuid", "container_id"),
        "name": pick("name", "container_name", "display_name"),
        "account": pick("account", "account_name", "customer", "tenant"),
        "account_id": pick("account_id", "accountId", "customer_id"),
        "region": pick("region", "datacenter", "dc"),
        "status": pick("status", "state"),
        "products": products,
        "features": pick("features", "modules", "capabilities") or [],
        "usage": usage,
        "expires_at": pick("expires_at", "expiresAt", "expiration_date"),
        "updated_at": pick("updated_at", "updatedAt", "last_updated"),
        "_raw": raw,
    }


def extract_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return payload.get("containers") or payload.get("items") or payload.get("data") or payload.get("results") or []
    return []


def fetch_containers(session: requests.Session, endpoint: str) -> list[dict[str, Any]]:
    containers: list[dict[str, Any]] = []
    page = 1

    while True:
        payload = fetch_json(
            session,
            BASE_URL + endpoint,
            {
                "limit": PAGE_SIZE,
                "size": PAGE_SIZE,
                "per_page": PAGE_SIZE,
                "page": page,
            },
        )
        batch = extract_list(payload)
        if not batch:
            break

        containers.extend(normalize_container(item) for item in batch)
        log.info("Fetched page %s with %s containers", page, len(batch))
        if len(batch) < PAGE_SIZE:
            break

        page += 1
        time.sleep(0.2)

    return containers


def try_fetch_usage(session: requests.Session, endpoint: str, container: dict[str, Any]) -> tuple[str, dict[str, Any] | None, str | None]:
    container_id = container.get("id")
    if not container_id:
        return "", None, "missing-id"

    for suffix in USAGE_SUFFIXES:
        url = f"{BASE_URL}{endpoint}/{container_id}{suffix}"
        try:
            payload = fetch_json(session, url)
            if isinstance(payload, dict):
                return container_id, payload, None
        except Exception as error:  # noqa: PERF203
            last_error = str(error)
            continue

    return container_id, None, last_error


def enrich_usage(session: requests.Session, endpoint: str, containers: list[dict[str, Any]], workers: int) -> list[dict[str, Any]]:
    failures: list[str] = []
    by_id = {container["id"]: container for container in containers if container.get("id")}

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(try_fetch_usage, session, endpoint, container): container.get("id")
            for container in containers
        }
        for future in as_completed(futures):
            container_id, payload, error = future.result()
            if payload is not None and container_id in by_id:
                existing_usage = by_id[container_id].get("usage") or {}
                by_id[container_id]["usage"] = {**existing_usage, **payload}
            elif error:
                failures.append(f"{container_id or 'unknown'}: {error}")

    if failures:
        FAILURE_LOG.write_text("\n".join(failures), encoding="utf-8")
        log.warning("Usage enrichment completed with %s failures", len(failures))

    return containers


def save_snapshot(containers: list[dict[str, Any]]) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    snapshot = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "total": len(containers),
        "containers": containers,
    }
    snapshot_path = DATA_DIR / f"{timestamp}.json"
    snapshot_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    LATEST_PATH.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    return snapshot_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch IRIS containers into data/iris/latest.json")
    parser.add_argument("--cookie", help="Raw Cookie header value")
    parser.add_argument("--cookie-file", help="Text file containing the cookie string")
    parser.add_argument("--endpoint", help="Override the container endpoint")
    parser.add_argument("--enrich-usage", action="store_true", help="Attempt per-container usage enrichment")
    parser.add_argument("--workers", type=int, default=8, help="Parallel workers for usage enrichment")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cookie = read_cookie(args)
    session = build_session(cookie)
    endpoint = args.endpoint or detect_container_endpoint(session)
    containers = fetch_containers(session, endpoint)

    if args.enrich_usage:
        containers = enrich_usage(session, endpoint, containers, args.workers)

    snapshot_path = save_snapshot(containers)
    print(json.dumps({"saved": str(snapshot_path), "latest": str(LATEST_PATH), "total": len(containers)}, indent=2))


if __name__ == "__main__":
    main()
