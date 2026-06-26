#!/usr/bin/env python3
"""Build hexa-prompt-cookbook.html from an editable Excel workbook.

The workbook is intentionally simple:
- Page Settings: key/value rows for optional title and subtitle edits.
- Capabilities: category definitions used by the filter chips.
- Use Cases: one row per card.
- Prompts: one row per example prompt.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + ord(ch.upper()) - ord("A") + 1
    return idx - 1


def text_or_empty(node: ET.Element | None) -> str:
    if node is None or node.text is None:
        return ""
    return node.text


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        raw = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ET.fromstring(raw)
    values: list[str] = []
    for item in root.findall("main:si", NS):
        parts = [text_or_empty(t) for t in item.findall(".//main:t", NS)]
        values.append("".join(parts))
    return values


def load_sheet_paths(zf: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    rel_targets = {}
    for rel in rels.findall("pkgrel:Relationship", NS):
        rel_targets[rel.attrib["Id"]] = rel.attrib["Target"].lstrip("/")

    sheet_paths = {}
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = rel_targets[rel_id]
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheet_paths[name] = target
    return sheet_paths


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        idx = int(text_or_empty(cell.find("main:v", NS)) or 0)
        return shared_strings[idx] if idx < len(shared_strings) else ""
    if cell_type == "inlineStr":
        return "".join(text_or_empty(t) for t in cell.findall(".//main:t", NS))
    return text_or_empty(cell.find("main:v", NS))


def read_sheet(zf: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[str]]:
    root = ET.fromstring(zf.read(sheet_path))
    rows = []
    max_width = 0

    for row in root.findall("main:sheetData/main:row", NS):
        values: list[str] = []
        for cell in row.findall("main:c", NS):
            idx = col_index(cell.attrib["r"])
            while len(values) <= idx:
                values.append("")
            values[idx] = cell_value(cell, shared_strings)
        max_width = max(max_width, len(values))
        rows.append(values)

    for row in rows:
        row.extend([""] * (max_width - len(row)))
    return rows


def read_table(rows: list[list[str]], first_header: str) -> list[dict[str, str]]:
    if not rows:
        return []
    header_index = None
    for idx, row in enumerate(rows):
        if row and str(row[0]).strip() == first_header:
            header_index = idx
            break
    if header_index is None:
        raise ValueError(f"Could not find table header row starting with '{first_header}'")

    headers = [str(cell).strip() for cell in rows[header_index]]
    records = []
    for row in rows[header_index + 1:]:
        if not any(str(cell).strip() for cell in row):
            continue
        record = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            record[header] = str(row[idx]).strip() if idx < len(row) else ""
        records.append(record)
    return records


def is_active(value: str) -> bool:
    return str(value).strip().lower() not in {"false", "0", "no", "n", "inactive", "disabled"}


def int_value(value: str, fallback: int) -> int:
    try:
        return int(float(str(value).strip()))
    except ValueError:
        return fallback


def build_content(workbook_path: Path) -> tuple[dict[str, str], list[dict], list[dict]]:
    with zipfile.ZipFile(workbook_path) as zf:
        shared_strings = load_shared_strings(zf)
        sheet_paths = load_sheet_paths(zf)

        missing = {"Page Settings", "Capabilities", "Use Cases", "Prompts"} - set(sheet_paths)
        if missing:
            raise ValueError(f"Workbook is missing required sheet(s): {', '.join(sorted(missing))}")

        settings_rows = read_table(read_sheet(zf, sheet_paths["Page Settings"], shared_strings), "key")
        capability_rows = read_table(read_sheet(zf, sheet_paths["Capabilities"], shared_strings), "id")
        use_case_rows = read_table(read_sheet(zf, sheet_paths["Use Cases"], shared_strings), "use_case_id")
        prompt_rows = read_table(read_sheet(zf, sheet_paths["Prompts"], shared_strings), "use_case_id")

    settings = {row.get("key", ""): row.get("value", "") for row in settings_rows if row.get("key")}

    categories = []
    valid_category_ids = set()
    for idx, row in enumerate(capability_rows, start=1):
        if not is_active(row.get("active", "true")):
            continue
        cat_id = row.get("id", "")
        if not cat_id:
            continue
        valid_category_ids.add(cat_id)
        categories.append(
            {
                "id": cat_id,
                "name": row.get("name", ""),
                "icon": row.get("icon", ""),
                "color": row.get("color", ""),
                "desc": row.get("desc", ""),
                "_sort": int_value(row.get("sort_order", ""), idx),
            }
        )

    prompt_map: dict[str, list[dict[str, str]]] = {}
    for idx, row in enumerate(prompt_rows, start=1):
        if not is_active(row.get("active", "true")):
            continue
        use_case_id = row.get("use_case_id", "")
        prompt_text = row.get("prompt_text", "")
        if not use_case_id or not prompt_text:
            continue
        prompt_map.setdefault(use_case_id, []).append(
            {
                "text": prompt_text,
                "_sort": int_value(row.get("prompt_order", ""), idx),
            }
        )

    use_cases = []
    for idx, row in enumerate(use_case_rows, start=1):
        if not is_active(row.get("active", "true")):
            continue
        use_case_id = row.get("use_case_id", "")
        category_id = row.get("category_id", "")
        if not use_case_id or not category_id:
            continue
        if category_id not in valid_category_ids:
            raise ValueError(f"Use case '{use_case_id}' references unknown category '{category_id}'")
        prompts = sorted(prompt_map.get(use_case_id, []), key=lambda item: item["_sort"])
        use_cases.append(
            {
                "n": row.get("title", ""),
                "c": category_id,
                "desc": row.get("description", ""),
                "prompts": [{"text": prompt["text"]} for prompt in prompts],
                "_sort": int_value(row.get("sort_order", ""), idx),
            }
        )

    categories.sort(key=lambda item: item["_sort"])
    use_cases.sort(key=lambda item: item["_sort"])

    for item in categories + use_cases:
        item.pop("_sort", None)

    return settings, categories, use_cases


def replace_js_array(source: str, name: str, value: list[dict]) -> str:
    replacement = f"const {name} = {json.dumps(value, ensure_ascii=False, indent=2)};"
    pattern = re.compile(rf"const {name} = \[[\s\S]*?\];")
    next_source, count = pattern.subn(replacement, source, count=1)
    if count != 1:
        raise ValueError(f"Could not replace JavaScript array: {name}")
    return next_source


def apply_settings(source: str, settings: dict[str, str]) -> str:
    page_title = settings.get("page_title", "").strip()
    header_title = settings.get("header_title", "").strip()
    subtitle = settings.get("subtitle", "").strip()

    if page_title:
        source = re.sub(r"<title>.*?</title>", f"<title>{html.escape(page_title)}</title>", source, count=1)
    if header_title:
        source = re.sub(r"<h1>.*?</h1>", f"<h1>{html.escape(header_title)}</h1>", source, count=1)
    if subtitle:
        source = re.sub(
            r"<p>Real-world use cases and ready-to-use prompts organized by capability .*?</p>",
            f"<p>{html.escape(subtitle)}</p>",
            source,
            count=1,
        )
    return source


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Hexa Prompt Cookbook HTML from Excel.")
    parser.add_argument("--workbook", default="data/hexa/hexa-prompt-cookbook.xlsx")
    parser.add_argument("--html", default="hexa-prompt-cookbook.html")
    args = parser.parse_args()

    workbook_path = Path(args.workbook)
    html_path = Path(args.html)

    settings, categories, use_cases = build_content(workbook_path)
    source = html_path.read_text(encoding="utf-8")
    source = apply_settings(source, settings)
    source = replace_js_array(source, "CATEGORIES", categories)
    source = replace_js_array(source, "UCS", use_cases)
    html_path.write_text(source, encoding="utf-8")

    prompt_total = sum(len(use_case.get("prompts", [])) for use_case in use_cases)
    print(f"Updated {html_path} from {workbook_path}")
    print(f"Capabilities: {len(categories)} | Use cases: {len(use_cases)} | Prompts: {prompt_total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
