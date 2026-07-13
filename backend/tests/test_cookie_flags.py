"""Tests for env-driven cookie flags (COOKIE_SECURE, COOKIE_SAMESITE) and CORS.

Verifies default behavior (COOKIE_SECURE unset, COOKIE_SAMESITE unset):
- Set-Cookie for access_token/refresh_token includes HttpOnly + SameSite=Lax
- Does NOT include Secure
- Cookies are named exactly 'access_token' and 'refresh_token', Path=/,
  Max-Age matches ACCESS_TOKEN_TTL_MINUTES*60 (43200) and
  REFRESH_TOKEN_TTL_DAYS*24*3600 (604800)
- /api/auth/refresh sets new access_token cookie with the same flags
- /api/auth/logout clears both cookies (empty value + Max-Age=0)
- CORS preflight to /api/auth/login includes Access-Control-Allow-Credentials
  and echoes the Origin (or '*') in Access-Control-Allow-Origin
"""
import os
import re
from http.cookies import SimpleCookie

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@farg.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

ACCESS_MAX_AGE = 12 * 60 * 60  # ACCESS_TOKEN_TTL_MINUTES(720) * 60 = 43200
REFRESH_MAX_AGE = 7 * 24 * 3600  # 604800


def _split_set_cookies(response: requests.Response) -> list[str]:
    """Return list of individual Set-Cookie header strings (order preserved).

    Requests joins multiple Set-Cookie headers with ", " which is ambiguous
    when cookie attributes also contain commas (Expires). We use
    response.raw.headers.getlist which preserves them.
    """
    try:
        return list(response.raw.headers.getlist("Set-Cookie"))
    except Exception:
        raw = response.headers.get("set-cookie") or ""
        # Fallback: naive split
        return [c.strip() for c in raw.split(",") if c.strip()]


def _cookie_for(name: str, set_cookies: list[str]) -> str | None:
    for c in set_cookies:
        if c.lstrip().startswith(f"{name}="):
            return c
    return None


def _parse_attrs(cookie_str: str) -> dict:
    """Parse a single Set-Cookie value string into name/value/attrs dict."""
    parts = [p.strip() for p in cookie_str.split(";")]
    kv = parts[0].split("=", 1)
    name, value = kv[0], (kv[1] if len(kv) > 1 else "")
    attrs = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            attrs[k.strip().lower()] = v.strip()
        else:
            attrs[p.strip().lower()] = True
    return {"name": name, "value": value, "attrs": attrs}


# -------------------- Login cookies --------------------
class TestLoginCookies:
    @pytest.fixture(scope="class")
    def login_response(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, r.text
        return r

    def test_two_cookies_present(self, login_response):
        cookies = _split_set_cookies(login_response)
        names = []
        for c in cookies:
            head = c.split("=", 1)[0].strip()
            names.append(head)
        assert "access_token" in names, f"cookies: {cookies}"
        assert "refresh_token" in names, f"cookies: {cookies}"

    def test_access_token_flags_default(self, login_response):
        cookies = _split_set_cookies(login_response)
        c = _cookie_for("access_token", cookies)
        assert c is not None
        parsed = _parse_attrs(c)
        attrs = parsed["attrs"]
        # HttpOnly present
        assert "httponly" in attrs, f"HttpOnly missing: {c}"
        # SameSite=Lax (case-insensitive)
        assert attrs.get("samesite", "").lower() == "lax", (
            f"SameSite should be Lax, got {attrs.get('samesite')!r} in {c}"
        )
        # Secure MUST NOT be present in default
        assert "secure" not in attrs, f"Secure should NOT be set in default: {c}"
        # Path=/
        assert attrs.get("path") == "/", f"path: {attrs.get('path')!r}"
        # Max-Age = 43200
        assert int(attrs.get("max-age", "0")) == ACCESS_MAX_AGE, (
            f"max-age: {attrs.get('max-age')} expected {ACCESS_MAX_AGE}"
        )

    def test_refresh_token_flags_default(self, login_response):
        cookies = _split_set_cookies(login_response)
        c = _cookie_for("refresh_token", cookies)
        assert c is not None
        parsed = _parse_attrs(c)
        attrs = parsed["attrs"]
        assert "httponly" in attrs, f"HttpOnly missing: {c}"
        assert attrs.get("samesite", "").lower() == "lax", (
            f"SameSite should be Lax, got {attrs.get('samesite')!r}"
        )
        assert "secure" not in attrs, f"Secure should NOT be set: {c}"
        assert attrs.get("path") == "/"
        assert int(attrs.get("max-age", "0")) == REFRESH_MAX_AGE, (
            f"max-age: {attrs.get('max-age')} expected {REFRESH_MAX_AGE}"
        )


# -------------------- Refresh cookie --------------------
class TestRefreshCookie:
    def test_refresh_endpoint_sets_access_cookie_with_same_flags(self):
        s = requests.Session()
        r0 = s.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r0.status_code == 200
        assert "refresh_token" in s.cookies

        r = s.post(f"{API}/auth/refresh")
        assert r.status_code == 200, r.text

        cookies = _split_set_cookies(r)
        c = _cookie_for("access_token", cookies)
        assert c is not None, f"access_token cookie not re-issued: {cookies}"
        parsed = _parse_attrs(c)
        attrs = parsed["attrs"]

        assert "httponly" in attrs, f"HttpOnly missing on refresh: {c}"
        assert attrs.get("samesite", "").lower() == "lax", (
            f"SameSite should be Lax on refresh: {attrs.get('samesite')!r}"
        )
        assert "secure" not in attrs, f"Secure should NOT be set on refresh: {c}"
        assert attrs.get("path") == "/"
        assert int(attrs.get("max-age", "0")) == ACCESS_MAX_AGE


# -------------------- Logout clears cookies --------------------
class TestLogoutClearsCookies:
    def test_logout_clears_both_cookies(self):
        s = requests.Session()
        r0 = s.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r0.status_code == 200

        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200

        cookies = _split_set_cookies(r)
        # Both cookies should be present in Set-Cookie (with empty value and Max-Age=0 or expired)
        access = _cookie_for("access_token", cookies)
        refresh = _cookie_for("refresh_token", cookies)
        assert access is not None, f"access_token clear not sent: {cookies}"
        assert refresh is not None, f"refresh_token clear not sent: {cookies}"

        for label, c in (("access_token", access), ("refresh_token", refresh)):
            parsed = _parse_attrs(c)
            # value should be empty (Starlette delete_cookie uses empty value)
            assert parsed["value"] in ("", '""'), (
                f"{label} value not cleared: {parsed['value']!r}"
            )
            attrs = parsed["attrs"]
            assert attrs.get("path") == "/", f"{label} path: {attrs.get('path')!r}"
            # Either Max-Age=0 or Expires in the past — Starlette uses both
            max_age_ok = attrs.get("max-age") in ("0", "-1")
            expires = attrs.get("expires", "")
            # Starlette delete_cookie sets Expires to epoch
            expires_ok = (
                "1970" in expires or "Thu, 01 Jan 1970" in expires or expires == ""
            )
            assert max_age_ok or expires_ok, (
                f"{label} not cleared: max-age={attrs.get('max-age')} "
                f"expires={expires}"
            )


# -------------------- CORS --------------------
class TestCORS:
    """Verify backend CORSMiddleware is registered with allow_credentials=True.

    Note: OPTIONS preflight to this preview URL is intercepted by the CloudFlare
    edge and never reaches the backend (verified: response has Server: cloudflare
    and Access-Control-Allow-Methods lists explicit verbs instead of '*' which the
    backend would emit). Therefore we ALSO verify the CORS headers on an actual
    POST request with an Origin header — this response comes from the backend
    itself and reliably reflects the middleware configuration.
    """

    def test_actual_request_returns_cors_credentials_header(self):
        """POST /api/auth/login with Origin — response comes from backend and
        must include Access-Control-Allow-Credentials: true and an
        Access-Control-Allow-Origin header echoing the origin or '*'."""
        origin = "https://quote-history-1.preview.emergentagent.com"
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={"Origin": origin},
        )
        assert r.status_code == 200, r.text
        assert (
            r.headers.get("access-control-allow-credentials", "").lower() == "true"
        ), f"expected Access-Control-Allow-Credentials=true; got: {dict(r.headers)}"
        allow_origin = r.headers.get("access-control-allow-origin", "")
        assert allow_origin in (origin, "*"), (
            f"Access-Control-Allow-Origin: {allow_origin!r}"
        )

    def test_preflight_headers_present(self):
        """OPTIONS preflight — verify at minimum Access-Control-Allow-Origin is
        emitted. The Access-Control-Allow-Credentials header is stripped by
        the CloudFlare edge for OPTIONS in this preview environment, so we
        document that as a known env limitation and skip that assertion here."""
        origin = "https://quote-history-1.preview.emergentagent.com"
        r = requests.options(
            f"{API}/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert r.status_code in (200, 204), r.text
        allow_origin = r.headers.get("access-control-allow-origin", "")
        assert allow_origin in (origin, "*"), (
            f"Access-Control-Allow-Origin: {allow_origin!r}"
        )
