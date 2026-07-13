"""Backend API tests for FARG Price Lookup App.

Covers: auth (bootstrap, login, me, logout, invite), price-records CRUD,
batch, by-part, stats, users, and import preview/commit.
"""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get(
    "REACT_APP_BACKEND_URL"
) else None

# Fallback: read frontend/.env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@farg.com"
ADMIN_PASSWORD = "admin123"


# -------------------- Fixtures --------------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def created_ids():
    """Collect record ids to cleanup at end of session."""
    ids = []
    yield ids


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_session, created_ids):
    yield
    for rid in created_ids:
        try:
            admin_session.delete(f"{API}/price-records/{rid}")
        except Exception:
            pass


# -------------------- Auth --------------------
class TestAuth:
    def test_bootstrap_status(self):
        r = requests.get(f"{API}/auth/bootstrap-status")
        assert r.status_code == 200
        data = r.json()
        assert "has_users" in data
        assert data["has_users"] is True  # admin seeded

    def test_register_closed(self):
        r = requests.post(
            f"{API}/auth/register",
            json={"email": "new@farg.com", "password": "abc123", "name": "New"},
        )
        # Should be 403 since users exist
        assert r.status_code == 403
        assert "closed" in r.json().get("detail", "").lower()

    def test_login_wrong_password(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpass"},
        )
        assert r.status_code == 401
        assert "invalid" in r.json().get("detail", "").lower()

    def test_login_success_sets_httponly_cookie(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, r.text
        user = r.json()
        assert user["email"] == ADMIN_EMAIL
        # Backend UserPublic uses alias "_id" — serializes as either id or _id
        assert "id" in user or "_id" in user
        # Cookie inspection
        cookies = r.cookies
        assert "access_token" in cookies, f"cookies: {cookies}"
        # Check HttpOnly flag from Set-Cookie header
        set_cookie = r.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie or "httponly" in set_cookie.lower()

    def test_me_authenticated(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # After logout, /auth/me should fail
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# -------------------- Users / Invite --------------------
class TestUsers:
    def test_list_users(self, admin_session):
        r = admin_session.get(f"{API}/users")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert any(u["email"] == ADMIN_EMAIL for u in rows)
        # No password_hash leaked
        for u in rows:
            assert "password_hash" not in u

    def test_invite_user(self, admin_session):
        email = f"test_invite_{uuid.uuid4().hex[:8]}@farg.com"
        r = admin_session.post(
            f"{API}/auth/invite",
            json={
                "email": email,
                "password": "invitedpass",
                "name": "Invited",
                "role": "admin",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["email"] == email

        # Verify appears in list
        r2 = admin_session.get(f"{API}/users")
        assert r2.status_code == 200
        assert any(u["email"] == email for u in r2.json())

        # Invited user should be able to login
        r3 = requests.post(
            f"{API}/auth/login",
            json={"email": email, "password": "invitedpass"},
        )
        assert r3.status_code == 200


# -------------------- Price Records --------------------
class TestPriceRecords:
    def test_create_record_and_get(self, admin_session, created_ids):
        payload = {
            "part_no": "TEST-PART-1",
            "unit_price": 1000.0,
            "cpq_number": f"TEST-CPQ-{uuid.uuid4().hex[:6]}",
            "cpq_date": "2025-01-15",
            "customer": "TEST Customer A",
            "cpq_price": 800.0,
            "notes": "test note",
        }
        r = admin_session.post(f"{API}/price-records", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["part_no"] == payload["part_no"]
        assert data["unit_price"] == 1000.0
        assert data["cpq_price"] == 800.0
        # Discount = (1000-800)/1000 = 20%
        assert data["discount_pct"] == 20.0
        assert "id" in data
        created_ids.append(data["id"])

        # GET by id
        r2 = admin_session.get(f"{API}/price-records/{data['id']}")
        assert r2.status_code == 200
        assert r2.json()["part_no"] == payload["part_no"]

    def test_list_with_search(self, admin_session, created_ids):
        # Create a searchable record
        cpq_no = f"TEST-SEARCH-{uuid.uuid4().hex[:6]}"
        r = admin_session.post(
            f"{API}/price-records",
            json={
                "part_no": "TEST-SEARCHPART",
                "unit_price": 500,
                "cpq_number": cpq_no,
                "cpq_date": "2025-02-01",
                "customer": "SearchCust",
                "cpq_price": 400,
            },
        )
        assert r.status_code == 200
        created_ids.append(r.json()["id"])

        # search by part
        r1 = admin_session.get(f"{API}/price-records", params={"q": "TEST-SEARCHPART"})
        assert r1.status_code == 200
        assert any(d["part_no"] == "TEST-SEARCHPART" for d in r1.json())

        # search by cpq
        r2 = admin_session.get(f"{API}/price-records", params={"q": cpq_no})
        assert r2.status_code == 200
        assert any(d["cpq_number"] == cpq_no for d in r2.json())

        # search by customer
        r3 = admin_session.get(f"{API}/price-records", params={"q": "SearchCust"})
        assert r3.status_code == 200
        assert any(d["customer"] == "SearchCust" for d in r3.json())

        # empty q returns all
        r4 = admin_session.get(f"{API}/price-records")
        assert r4.status_code == 200
        assert len(r4.json()) >= 1

    def test_batch_create(self, admin_session, created_ids):
        cpq_no = f"TEST-BATCH-{uuid.uuid4().hex[:6]}"
        payload = {
            "cpq_number": cpq_no,
            "cpq_date": "2025-03-01",
            "lines": [
                {
                    "part_no": "TEST-BATCH-P1",
                    "unit_price": 100,
                    "customer": "CustB",
                    "cpq_price": 90,
                    "notes": "",
                },
                {
                    "part_no": "TEST-BATCH-P2",
                    "unit_price": 200,
                    "customer": "CustB",
                    "cpq_price": 150,
                    "notes": "x",
                },
            ],
        }
        r = admin_session.post(f"{API}/price-records/batch", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 2

        # Verify via search
        r2 = admin_session.get(f"{API}/price-records", params={"q": cpq_no})
        assert r2.status_code == 200
        rows = r2.json()
        assert len(rows) == 2
        for row in rows:
            created_ids.append(row["id"])

    def test_by_part(self, admin_session, created_ids):
        # create two records for same part
        part = f"TEST-PARTBP-{uuid.uuid4().hex[:5]}"
        for price in [(1000, 800, "2025-01-01"), (1000, 700, "2025-02-01")]:
            r = admin_session.post(
                f"{API}/price-records",
                json={
                    "part_no": part,
                    "unit_price": price[0],
                    "cpq_number": f"CPQ-{uuid.uuid4().hex[:4]}",
                    "cpq_date": price[2],
                    "customer": "C",
                    "cpq_price": price[1],
                },
            )
            assert r.status_code == 200
            created_ids.append(r.json()["id"])

        r = admin_session.get(f"{API}/price-records/by-part/{part}")
        assert r.status_code == 200
        data = r.json()
        assert data["part_no"] == part
        assert data["latest_unit_price"] == 1000
        assert len(data["records"]) == 2
        # sorted by cpq_date desc
        assert data["records"][0]["cpq_date"] >= data["records"][1]["cpq_date"]

    def test_by_part_404(self, admin_session):
        r = admin_session.get(f"{API}/price-records/by-part/NOEXIST-XYZ-999")
        assert r.status_code == 404

    def test_update_record(self, admin_session, created_ids):
        # create
        r = admin_session.post(
            f"{API}/price-records",
            json={
                "part_no": "TEST-UPD",
                "unit_price": 500,
                "cpq_number": f"CPQ-U-{uuid.uuid4().hex[:4]}",
                "cpq_date": "2025-04-01",
                "customer": "C",
                "cpq_price": 400,
            },
        )
        assert r.status_code == 200
        rid = r.json()["id"]
        created_ids.append(rid)

        # update
        r2 = admin_session.patch(
            f"{API}/price-records/{rid}",
            json={"cpq_price": 350, "notes": "updated"},
        )
        assert r2.status_code == 200
        data = r2.json()
        assert data["cpq_price"] == 350
        assert data["notes"] == "updated"

        # GET to confirm persistence
        r3 = admin_session.get(f"{API}/price-records/{rid}")
        assert r3.json()["cpq_price"] == 350
        assert r3.json()["notes"] == "updated"

    def test_delete_record(self, admin_session):
        r = admin_session.post(
            f"{API}/price-records",
            json={
                "part_no": "TEST-DEL",
                "unit_price": 100,
                "cpq_number": f"CPQ-D-{uuid.uuid4().hex[:4]}",
                "cpq_date": "2025-04-02",
                "customer": "C",
                "cpq_price": 90,
            },
        )
        assert r.status_code == 200
        rid = r.json()["id"]

        r2 = admin_session.delete(f"{API}/price-records/{rid}")
        assert r2.status_code == 200

        r3 = admin_session.get(f"{API}/price-records/{rid}")
        assert r3.status_code == 404


# -------------------- Stats --------------------
class TestStats:
    def test_stats(self, admin_session):
        r = admin_session.get(f"{API}/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ("total_records", "distinct_parts", "distinct_customers", "distinct_cpq"):
            assert k in data
            assert isinstance(data[k], int)


# -------------------- Import --------------------
class TestImport:
    def test_import_preview_and_commit(self, admin_session, created_ids):
        csv_content = (
            "Part No,Unit Price,CPQ,Date,Customer,CPQ Price,Notes\n"
            "TEST-IMP-1,100,CPQ-IMP-A,2025-05-01,ImpCust,80,n1\n"
            "TEST-IMP-2,200,CPQ-IMP-A,2025-05-01,ImpCust,150,n2\n"
        )
        files = {
            "file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv"),
        }
        # Preview uses multipart - must not set Content-Type header manually
        sess = requests.Session()
        sess.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        r = sess.post(f"{API}/import/preview", files=files)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "columns" in data
        assert "sample_rows" in data
        assert data["row_count"] == 2
        assert set(["Part No", "Unit Price", "CPQ", "Date", "Customer", "CPQ Price"]).issubset(
            set(data["columns"])
        )

        # Commit rows (client transforms preview -> ImportRow shape)
        rows_payload = [
            {
                "part_no": "TEST-IMP-1",
                "unit_price": 100,
                "cpq_number": "CPQ-IMP-A",
                "cpq_date": "2025-05-01",
                "customer": "ImpCust",
                "cpq_price": 80,
                "notes": "n1",
            },
            {
                "part_no": "TEST-IMP-2",
                "unit_price": 200,
                "cpq_number": "CPQ-IMP-A",
                "cpq_date": "2025-05-01",
                "customer": "ImpCust",
                "cpq_price": 150,
                "notes": "n2",
            },
        ]
        r2 = admin_session.post(f"{API}/import/commit", json={"rows": rows_payload})
        assert r2.status_code == 200, r2.text
        assert r2.json()["inserted"] == 2

        # Verify inserted
        r3 = admin_session.get(f"{API}/price-records", params={"q": "CPQ-IMP-A"})
        assert r3.status_code == 200
        rows = r3.json()
        assert len(rows) >= 2
        for row in rows:
            if row["part_no"].startswith("TEST-IMP"):
                created_ids.append(row["id"])

    def test_import_invalid_file_type(self, admin_session):
        files = {"file": ("bad.txt", io.BytesIO(b"garbage"), "text/plain")}
        sess = requests.Session()
        sess.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        r = sess.post(f"{API}/import/preview", files=files)
        assert r.status_code == 400


# -------------------- Auth required --------------------
class TestAuthRequired:
    def test_price_records_unauth(self):
        r = requests.get(f"{API}/price-records")
        assert r.status_code == 401

    def test_stats_unauth(self):
        r = requests.get(f"{API}/stats")
        assert r.status_code == 401
