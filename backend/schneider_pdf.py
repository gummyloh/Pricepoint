"""Parser for Schneider Electric Malaysia CPQ quotation PDFs.

Schneider quotes have a fixed layout: a header block with "Quote Number",
"Date:" (DD-MM-YYYY) and "Project Name", followed by a line-items table with
columns No. / MPG / Reference / Description / MOQ / Qty / "Unit Net Price MYR"
/ "Total Net Price MYR".

Split into a pure function (`parse_schneider_tables`) that operates on
already-extracted text/tables so it can be unit tested without a real PDF,
and a thin `parse_schneider_pdf` wrapper that does the pdfplumber I/O.
"""
import io
import re
from datetime import datetime

import pdfplumber

QUOTE_NUMBER_RE = re.compile(r"Quote Number\s*[:\-]?\s*([A-Za-z0-9\-]+)", re.IGNORECASE)
DATE_RE = re.compile(r"\bDate\s*:\s*(\d{2}-\d{2}-\d{4})", re.IGNORECASE)
PROJECT_NAME_RE = re.compile(r"Project Name\s*[:\-]?\s*(.+)", re.IGNORECASE)

# Normalized line-item table header -> canonical row field
HEADER_ALIASES = {
    "reference": "part_no",
    "description": "description",
    "qty": "qty",
    "unit net price myr": "cpq_price",
}


def _norm_header(cell) -> str:
    return re.sub(r"\s+", " ", (cell or "").strip().lower())


def _clean_number(s) -> str:
    return (s or "").replace(",", "").strip()


def _parse_date(s: str) -> str:
    return datetime.strptime(s, "%d-%m-%Y").strftime("%Y-%m-%d")


def _extract_header_fields(full_text: str):
    qn = QUOTE_NUMBER_RE.search(full_text)
    dt = DATE_RE.search(full_text)
    pn = PROJECT_NAME_RE.search(full_text)
    cpq_number = qn.group(1).strip() if qn else ""
    cpq_date = _parse_date(dt.group(1)) if dt else ""
    customer = pn.group(1).strip().splitlines()[0].strip() if pn else ""
    return cpq_number, cpq_date, customer


def _find_line_item_tables(tables: list):
    """Yield (col_idx, data_rows) for each table that looks like the line-items table."""
    for table in tables:
        if not table:
            continue
        header = [_norm_header(c) for c in table[0]]
        if "reference" not in header or "description" not in header:
            continue
        col_idx = {}
        for key, field in HEADER_ALIASES.items():
            if key in header:
                col_idx[field] = header.index(key)
        if "part_no" in col_idx and "description" in col_idx:
            yield col_idx, table[1:]


def _cell(row: list, idx: int) -> str:
    return row[idx] if idx is not None and idx < len(row) else ""


def parse_schneider_tables(full_text: str, tables: list) -> dict:
    """Pure function: parse already-extracted PDF text + tables into import rows."""
    cpq_number, cpq_date, customer = _extract_header_fields(full_text or "")
    rows = []
    for col_idx, data_rows in _find_line_item_tables(tables or []):
        for r in data_rows:
            part_no = _cell(r, col_idx.get("part_no")).strip()
            if not part_no:
                continue
            description = _cell(r, col_idx.get("description")).strip()
            qty = _clean_number(_cell(r, col_idx.get("qty"))) or "1"
            cpq_price = _clean_number(_cell(r, col_idx.get("cpq_price")))
            rows.append(
                {
                    "part_no": part_no,
                    "description": description,
                    "qty": qty,
                    "unit_price": "",
                    "cpq_number": cpq_number,
                    "cpq_date": cpq_date,
                    "customer": customer,
                    "cpq_price": cpq_price,
                }
            )
    return {
        "cpq_number": cpq_number,
        "cpq_date": cpq_date,
        "customer": customer,
        "rows": rows,
    }


def parse_schneider_pdf(file_bytes: bytes) -> dict:
    """Extract text + tables from a Schneider quotation PDF and parse it."""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        tables = []
        for page in pdf.pages:
            tables.extend(page.extract_tables() or [])
    return parse_schneider_tables(full_text, tables)
