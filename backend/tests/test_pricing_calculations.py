"""Unit tests for discount/price calculation helpers in server.py.

Pure-function tests, no live database or server required — server.py reads
DATABASE_URL at import time (for the lazy connection pool) but never
connects unless a request is handled, so a dummy value is enough to import it.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import pytest

from server import compute_discount, serialize_price_record


class TestComputeDiscount:
    def test_normal_discount(self):
        assert compute_discount(100.0, 80.0) == 20.0

    def test_rounds_to_two_decimal_places(self):
        assert compute_discount(30.0, 20.0) == 33.33

    def test_zero_unit_price_returns_zero_instead_of_dividing_by_zero(self):
        assert compute_discount(0.0, 50.0) == 0.0

    def test_none_unit_price_returns_zero(self):
        assert compute_discount(None, 50.0) == 0.0

    def test_cpq_price_higher_than_unit_price_gives_negative_discount(self):
        assert compute_discount(100.0, 120.0) == -20.0

    def test_equal_prices_gives_zero_discount(self):
        assert compute_discount(50.0, 50.0) == 0.0


class TestSerializePriceRecord:
    def _row(self, **overrides):
        base = {
            "id": "abc-123", "part_no": "A9F74220", "unit_price": 100.0,
            "cpq_number": "CPQ-1", "cpq_date": None, "customer": "Acme",
            "cpq_price": 80.0, "qty": 5, "description": "MCB", "notes": None,
            "principal": "Farg", "created_by": None, "created_by_name": None,
            "created_at": None, "updated_at": None,
        }
        base.update(overrides)
        return base

    def test_computes_discount_pct_consistently_with_compute_discount(self):
        row = self._row(unit_price=100.0, cpq_price=75.0)
        record = serialize_price_record(row)
        assert record["discount_pct"] == compute_discount(100.0, 75.0)
        assert record["discount_pct"] == 25.0

    def test_none_unit_price_defaults_to_zero_not_none(self):
        row = self._row(unit_price=None)
        record = serialize_price_record(row)
        assert record["unit_price"] == 0.0
        assert record["discount_pct"] == 0.0

    def test_none_cpq_price_defaults_to_zero(self):
        row = self._row(cpq_price=None)
        record = serialize_price_record(row)
        assert record["cpq_price"] == 0.0

    def test_missing_qty_defaults_to_one(self):
        row = self._row(qty=None)
        record = serialize_price_record(row)
        assert record["qty"] == 1

    def test_blank_optional_text_fields_default_to_empty_string(self):
        row = self._row(part_no=None, customer=None, description=None, notes=None)
        record = serialize_price_record(row)
        assert record["part_no"] == ""
        assert record["customer"] == ""
        assert record["description"] == ""
        assert record["notes"] == ""
