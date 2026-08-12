# LINOS Hotel

Greenfield hotel linen operations platform for room assignments, piece-level clean/soiled accountability, evidence capture, and (Phase 2) room-to-store / laundry reconciliation.

This repository does **not** fork the hospital LINOS codebase. It reuses architectural patterns only: server-enforced capabilities, append-only stock ledger, dual acknowledgement readiness, idempotent writes, and property scoping.

## Quick start

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) and sign in with a demo user:

| Email | Role (UI) |
|---|---|
| `supervisor@linos.hotel` | Supervisor A (Lead) |
| `supervisor2@linos.hotel` | Supervisor B (sample) |
| `agent1@linos.hotel` | Housekeeper 01 |
| `agent2@linos.hotel` | Housekeeper 02 |
| `porter@linos.hotel` | Porter |
| `store@linos.hotel` | Store Agent |

Full demo roster (synthetic): **35 housekeepers** (`agent1@`, `agent2@`, `hk03@`…`hk35@linos.hotel`) and **4 supervisors** (`supervisor@`…`supervisor4@linos.hotel`) with one initial default floor per housekeeper across bands A–D. Supervisors/admins can edit defaults later. The login picker stays short; use the emails above or README for the rest.

## Architecture

```text
Browser SPA (public/)
  -> /api adapter (Netlify function or portable server)
  -> src/core/service.mjs (authority + workflows)
  -> in-memory store (local/demo) or PostgreSQL migrations
```

See [`AGENTS.md`](AGENTS.md) for coding-agent boundaries.

## Phase 1 scope

- Morning Board daily round: Supervisor manually confirms occupied rooms using the % occupancy generator (`/rounds/generate-morning`), CSV / manual / legacy rule fill, then makes the round active for assignment. Booking/PMS linkage is a future integration. A planned plain-English **morning briefing** composer (`docs/MORNING_BRIEFING.md`) will prefill those same forms for approval.
- Assignment floor×room grid + by-housekeeper lists (suggested minimum rooms/housekeeper is calculated from rooms ÷ available housekeepers; editable and not an absolute cap)
- Cart load from room stock (suggest = fitted + open extras; Float / buffer column)
- Fitted linen in/out (capped), Guest request extras / kits, exceptions, online photo evidence
- Standing guest extras carried into each daily room round until stopped or checkout; Housekeepers record daily clean-in, soiled-out, partial, DND, and not-changed outcomes on the same room page
- Supervisor verification (shows extras) and guest-claim status tracking (no auto-charge)
- Dashboard room linen snapshot (occupied rooms begin red **Soiled / service required** and stay that way until Housekeeper submission; fitted comparison remains red / green / blue after service)

Phase 2 room-to-store collection is now available in the service/API and the role-aware **Linen transfers** view. Laundry dispatch/return tables are scaffolded in `netlify/database/migrations/0001_linos_hotel_schema.sql` and remain the next custody slice.

## Demo data notice

The Seri Pacific seed is **synthetic and approximate** for demonstration only. It must not be presented as official hotel inventory.

## Docs

- [`docs/LINOS-Hotel-User-Manual.pdf`](docs/LINOS-Hotel-User-Manual.pdf) — user manual with screenshots (rebuild: `python3 scripts/build-user-manual-pdf.py`)
- [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md)
- [`docs/PHASE0_OPS_CHECKLIST.md`](docs/PHASE0_OPS_CHECKLIST.md)
- [`docs/HOSPITAL_TO_HOTEL_MIGRATION.md`](docs/HOSPITAL_TO_HOTEL_MIGRATION.md)

## Postgres (optional)

```bash
export DATABASE_URL=postgres://...
npm run db:migrate
```

Local demo mode does not require Postgres; the portable server uses the in-memory store.
