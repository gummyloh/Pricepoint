"""Tests for the Schneider Electric quotation PDF parser (backend/schneider_pdf.py).

`parse_schneider_pdf` is exercised end-to-end against a synthetic PDF built
with reportlab (mirroring the real Schneider Malaysia CPQ layout), and the
pure `parse_schneider_tables` function is unit tested directly against
hand-built text/table fixtures for edge cases that are awkward to encode as
an actual PDF (missing headers, blank cells, unrelated tables, etc).

Requires `reportlab` (test-only, generates the fixture PDF) in addition to
the app's `pdfplumber` dependency — not part of backend/requirements.txt.
"""
import io

import pytest

from schneider_pdf import parse_schneider_pdf, parse_schneider_tables

LINE_ITEM_HEADER = [
    "No.",
    "MPG",
    "Reference",
    "Description",
    "MOQ",
    "Qty",
    "Unit Net Price MYR",
    "Total Net Price MYR",
]


def _build_schneider_pdf(
    quote_number="2026-1554379",
    date_str="15-03-2026",
    project_name="Petronas Chemical Plant Upgrade",
    line_rows=None,
) -> bytes:
    """Render a synthetic Schneider-layout quotation PDF via reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    if line_rows is None:
        line_rows = [
            ["1", "MPG1", "LV429630", "Compact NSX100F breaker", "1", "2", "1,250.00", "2,500.00"],
            ["2", "MPG2", "XB4BA31", "Push button switch", "1", "10", "45.50", "455.00"],
        ]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph("Schneider Electric Malaysia Sdn Bhd", styles["Title"]),
        Paragraph(f"Quote Number: {quote_number}", styles["Normal"]),
        Paragraph(f"Date: {date_str}", styles["Normal"]),
        Paragraph(f"Project Name: {project_name}", styles["Normal"]),
        Spacer(1, 12),
    ]
    table = Table([LINE_ITEM_HEADER] + line_rows)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
            ]
        )
    )
    elements.append(table)
    doc.build(elements)
    return buf.getvalue()


# -------------------- End-to-end: real PDF via pdfplumber --------------------
class TestParseSchneiderPdf:
    def test_extracts_header_fields(self):
        pdf_bytes = _build_schneider_pdf()
        result = parse_schneider_pdf(pdf_bytes)
        assert result["cpq_number"] == "2026-1554379"
        assert result["cpq_date"] == "2026-03-15"
        assert result["customer"] == "Petronas Chemical Plant Upgrade"

    def test_extracts_line_items(self):
        pdf_bytes = _build_schneider_pdf()
        result = parse_schneider_pdf(pdf_bytes)
        rows = result["rows"]
        assert len(rows) == 2

        r1 = rows[0]
        assert r1["part_no"] == "LV429630"
        assert r1["description"] == "Compact NSX100F breaker"
        assert r1["qty"] == "2"
        assert r1["cpq_price"] == "1250.00"  # comma stripped
        assert r1["unit_price"] == ""  # left blank for the user to fill
        assert r1["cpq_number"] == "2026-1554379"
        assert r1["cpq_date"] == "2026-03-15"
        assert r1["customer"] == "Petronas Chemical Plant Upgrade"

        r2 = rows[1]
        assert r2["part_no"] == "XB4BA31"
        assert r2["description"] == "Push button switch"
        assert r2["qty"] == "10"
        assert r2["cpq_price"] == "45.50"

    def test_different_quote_number_and_date(self):
        pdf_bytes = _build_schneider_pdf(
            quote_number="2025-9988771",
            date_str="01-12-2025",
            project_name="Shell Refinery Expansion",
            line_rows=[["1", "MPG9", "ABC-999", "Contactor", "1", "1", "99.00", "99.00"]],
        )
        result = parse_schneider_pdf(pdf_bytes)
        assert result["cpq_number"] == "2025-9988771"
        assert result["cpq_date"] == "2025-12-01"
        assert result["customer"] == "Shell Refinery Expansion"
        assert result["rows"][0]["part_no"] == "ABC-999"

    def test_no_line_items_returns_empty_rows(self):
        pdf_bytes = _build_schneider_pdf(line_rows=[])
        result = parse_schneider_pdf(pdf_bytes)
        assert result["rows"] == []
        # Header fields still parsed even with no line items
        assert result["cpq_number"] == "2026-1554379"


# -------------------- Pure function: hand-built text/tables --------------------
class TestParseSchneiderTables:
    def test_basic_parse(self):
        text = (
            "Quote Number: 2026-1554379\n"
            "Date: 15-03-2026\n"
            "Project Name: Petronas Chemical Plant Upgrade\n"
        )
        tables = [
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "LV429630", "Compact NSX100F breaker", "1", "2", "1,250.00", "2,500.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert result["cpq_number"] == "2026-1554379"
        assert result["cpq_date"] == "2026-03-15"
        assert result["customer"] == "Petronas Chemical Plant Upgrade"
        assert len(result["rows"]) == 1
        assert result["rows"][0]["cpq_price"] == "1250.00"

    def test_blank_qty_defaults_to_one(self):
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "PART-1", "Widget", "1", "", "10.00", "10.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert result["rows"][0]["qty"] == "1"

    def test_rows_without_reference_are_skipped(self):
        """Summary/subtotal rows with no Reference value should be dropped."""
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "PART-1", "Widget", "1", "2", "10.00", "20.00"],
                ["", "", "", "Subtotal", "", "", "", "20.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert len(result["rows"]) == 1
        assert result["rows"][0]["part_no"] == "PART-1"

    def test_unrelated_tables_are_ignored(self):
        """A table without Reference/Description headers isn't treated as line items."""
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [
            [["Terms", "Value"], ["Payment", "30 days"]],
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "PART-1", "Widget", "1", "2", "10.00", "20.00"],
            ],
        ]
        result = parse_schneider_tables(text, tables)
        assert len(result["rows"]) == 1
        assert result["rows"][0]["part_no"] == "PART-1"

    def test_none_cells_do_not_crash(self):
        """pdfplumber returns None (not "") for genuinely empty table cells —
        e.g. blank Description or Qty in a real-world quote. Must not crash."""
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "PART-1", None, "1", None, "10.00", "10.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert len(result["rows"]) == 1
        row = result["rows"][0]
        assert row["part_no"] == "PART-1"
        assert row["description"] == ""
        assert row["qty"] == "1"  # blank Qty cell defaults to 1

    def test_none_part_no_cell_is_skipped(self):
        """A row with a None Reference cell (e.g. a section header) is skipped,
        not treated as a crash or a valid part."""
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [
            [
                LINE_ITEM_HEADER,
                [None, None, None, "Category: Circuit Breakers", None, None, None, None],
                ["1", "MPG1", "PART-1", "Widget", "1", "2", "10.00", "20.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert len(result["rows"]) == 1
        assert result["rows"][0]["part_no"] == "PART-1"

    def test_missing_header_fields_yield_blank_strings(self):
        text = "Some unrelated document text with no recognizable header fields."
        tables = [
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "PART-1", "Widget", "1", "2", "10.00", "20.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert result["cpq_number"] == ""
        assert result["cpq_date"] == ""
        assert result["customer"] == ""
        # Line items are still parsed independently of header extraction
        assert len(result["rows"]) == 1

    def test_no_tables_returns_no_rows(self):
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        result = parse_schneider_tables(text, [])
        assert result["rows"] == []
        assert result["cpq_number"] == "Q1"

    def test_empty_table_rows_are_ignored(self):
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [None, [], [LINE_ITEM_HEADER]]
        result = parse_schneider_tables(text, tables)
        assert result["rows"] == []

    def test_unit_price_always_blank(self):
        """unit_price (list price) is never in the PDF — always left for the user."""
        text = "Quote Number: Q1\nDate: 01-01-2026\nProject Name: Acme\n"
        tables = [
            [
                LINE_ITEM_HEADER,
                ["1", "MPG1", "PART-1", "Widget", "1", "2", "10.00", "20.00"],
            ]
        ]
        result = parse_schneider_tables(text, tables)
        assert result["rows"][0]["unit_price"] == ""
