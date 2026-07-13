# FARG Price Lookup App — PRD

## Original Problem Statement
Admins currently keep project/CPQ pricing in Excel. To answer "what have we quoted this part for before," they manually open the file and search for a Part No or CPQ#, then eyeball prices across rows. This app replaces that with a searchable tool: log in, look up a part, and instantly see the list price next to every CPQ price it's ever had, across customers and time periods.

## User Choices Confirmed
- Authentication: **Standard email + password (JWT via httpOnly cookies)**
- Seeded admin: **No** — bootstrap flow (first user via `/register`, then invite-only)
- Currency: **MYR** (rendered as `RM 1,234.56`)
- Excel import: **Generic column-mapping UI**
- Design vibe: **Modern & sleek** (Swiss high-contrast, Cabinet Grotesk + Manrope + JetBrains Mono)

## User Personas
- **Sales/CPQ admin** — needs to quickly compare current list price vs. every CPQ that a part has been quoted at (across customers, dates).
- **Ops/data steward** — bulk-imports historical pricing from Excel/CSV and adds new CPQ records.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT (HS256) via httpOnly cookies. bcrypt hashing. pandas + openpyxl for Excel/CSV parsing.
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn UI + Recharts. Sonner toasts. Cookie-based auth via axios `withCredentials: true`.
- **Routing**: All backend routes prefixed `/api`; frontend uses `REACT_APP_BACKEND_URL`.

## Core Features Implemented (2026-02)
- Bootstrap-aware auth: `/register` open only when zero users; `/login` otherwise. `/api/auth/{bootstrap-status,register,login,logout,me,refresh,invite}`.
- Price record CRUD + batch create (multiple lines under one CPQ#), search (part/CPQ/customer), per-part chronological view, discount% auto-computed.
- Excel/CSV import with server-side parse, auto column-mapping guesses, preview, and commit.
- Dashboard with hero search, stats strip (records/parts/customers/CPQs), sortable results table.
- Part Detail: current list price hero, best-ever CPQ highlight card, price trend chart (Recharts), history table with inline edit dialog + delete.
- Users page: list team members, invite additional admins.
- Split-screen sign-in with abstract-geometric hero image; Cabinet Grotesk display type; JetBrains Mono for numbers.

## Data Model (MongoDB)
- `users`: `{ email(unique), password_hash, name, role, created_at }`
- `price_records`: `{ part_no, unit_price, cpq_number, cpq_date(YYYY-MM-DD), customer, cpq_price, notes, created_by, created_by_name, created_at, updated_at }`
- Indexes: users.email(unique), price_records.{part_no, cpq_number, customer, cpq_date}.

## Testing (iteration 1)
- Backend: 21/21 pytest cases pass (auth guards, CRUD, batch, search, by-part, stats, import preview+commit).
- Frontend: 10/10 Playwright flows pass (bootstrap→register→dashboard, login/wrong, search, add multi-line CPQ, part detail edit + delete, CSV import, invite user, logout).

## Prioritized Backlog
- **P1** — Access control roles (viewer vs admin) once more people use it (open question in spec).
- **P1** — Optional per-customer restrictions per admin (open question).
- **P2** — Export CPQ history to Excel/CSV (mirror the import).
- **P2** — Bulk edit / duplicate a CPQ across customers.
- **P2** — Rate limiting on `/api/auth/login` (currently no lockout after N failures).
- **P3** — Approval workflow for price changes (mentioned as out-of-scope).
- **P3** — Include historic sales-order price alongside CPQ price (mentioned as out-of-scope).

## Next Action Items
1. Add real historical Excel data via `/import` to validate column auto-mapping against real column names.
2. Invite the rest of the CPQ team from the Users page.
3. Consider export + role-based restrictions once >5 users are on board.
