#!/usr/bin/env python3
"""
Cookie helper for the IRIS scraping workflow.

Supported modes:
- copy from clipboard
- read from a text file
- extract from a HAR export
- validate and save to cookie.txt next to this script
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

COOKIE_PATH = Path(__file__).resolve().parent / "cookie.txt"
IRIS_HOST = "iris.tenablesecurity.com"


def normalize_cookie(raw: str) -> str:
  value = raw.strip().strip('"').strip("'")
  curl_cookie = re.search(r"(?:-b|--cookie)\s+['\"]([^'\"]+)['\"]", value)
  if curl_cookie:
    value = curl_cookie.group(1)
  header_cookie = re.search(r"Cookie:\s*(.+)$", value, re.IGNORECASE)
  if header_cookie:
    value = header_cookie.group(1)
  value = re.sub(r"\s*;\s*", "; ", value.replace("\r", "; ").replace("\n", "; "))
  return value.strip(" ;")


def read_clipboard() -> str:
  for command in (["pbpaste"], ["xclip", "-o", "-selection", "clipboard"]):
    try:
      result = subprocess.run(command, capture_output=True, check=True)
      return result.stdout.decode("utf-8", errors="replace").strip()
    except Exception:
      continue
  return ""


def read_har(path: Path) -> str:
  payload = json.loads(path.read_text(encoding="utf-8"))
  best_cookie = ""
  best_length = 0
  for entry in payload.get("log", {}).get("entries", []):
    url = entry.get("request", {}).get("url", "")
    if IRIS_HOST not in url:
      continue
    for header in entry.get("request", {}).get("headers", []):
      if header.get("name", "").lower() == "cookie":
        candidate = header.get("value", "")
        if len(candidate) > best_length:
          best_cookie = candidate
          best_length = len(candidate)
  if not best_cookie:
    raise SystemExit("No IRIS cookie was found in the HAR file.")
  return best_cookie


def validate_cookie(cookie: str) -> bool:
  if not cookie:
    print("Cookie is empty.")
    return False
  pairs = [part for part in cookie.split(";") if "=" in part]
  print(f"Cookie looks valid with {len(pairs)} key/value pairs.")
  return len(pairs) > 1


def save_cookie(cookie: str) -> None:
  COOKIE_PATH.write_text(cookie, encoding="utf-8")
  print(f"Saved cookie to {COOKIE_PATH}")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Save a reusable IRIS cookie without logging it to the terminal.")
  parser.add_argument("--from-file", help="Text file containing a cookie string")
  parser.add_argument("--har", help="HAR file exported from browser DevTools")
  parser.add_argument("--check", action="store_true", help="Validate the saved cookie.txt file")
  return parser.parse_args()


def main() -> None:
  args = parse_args()

  if args.check:
    cookie = COOKIE_PATH.read_text(encoding="utf-8").strip()
    validate_cookie(cookie)
    return

  if args.har:
    cookie = normalize_cookie(read_har(Path(args.har)))
  elif args.from_file:
    cookie = normalize_cookie(Path(args.from_file).read_text(encoding="utf-8"))
  else:
    input("Copy the IRIS Cookie header, then press Enter to continue...")
    cookie = normalize_cookie(read_clipboard())

  if not validate_cookie(cookie):
    raise SystemExit("Unable to validate the cookie string.")

  save_cookie(cookie)


if __name__ == "__main__":
  main()
