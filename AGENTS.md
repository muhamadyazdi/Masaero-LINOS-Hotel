# AGENTS.md — LINOS Hotel

Guidance for coding agents working in this repository.

## Product

**LINOS Hotel** is a greenfield hotel linen operations platform focused on:

- Daily room linen rounds and housekeeper assignment
- **Hotel-native locations:** rooms are stock points; store and laundry are custody parties. UI never says "Station" (labels: Housekeeper / Supervisor).
- Piece-level clean/soiled accountability via append-only ledger
- Fitted set (Admin) vs room extras (guest request) — extras never inflate fitted config
- Exception evidence capture
- Room-to-store collection and laundry reconciliation (Phase 2 workflows)

It does **not** fork the hospital LINOS codebase. It reuses architectural patterns only: server-enforced capabilities, append-only ledger, dual acknowledgement, idempotent commits, property scoping.

## Architecture (keep this split)

```text
public/                     Responsive SPA (modular JS)
netlify/functions/api.mjs   Thin host adapter
scripts/portable-server.mjs Local / non-Netlify host
src/core/service.mjs        Authority + workflow rules (source of truth)
src/core/repository.mjs     PostgreSQL persistence
src/core/memoryStore.mjs    In-memory store for local/demo/tests
src/core/model.mjs          Roles, capabilities, statuses
src/adapters/postgres.mjs   DB connection helper
netlify/database/migrations/ Ordered SQL
docs/                       Data dictionary, Phase 0, hospital migration
```

**Rule:** Business authority lives in `src/core/service.mjs`. Menu visibility is never authorization.

## Roles

| Internal key | UI label |
|---|---|
| Superadmin / Admin | Superadmin / Admin |
| Station Supervisor | Supervisor |
| Station Agent | Housekeeper |
| Porter | Porter |
| Store Agent | Store Agent |

## Fitted vs extras

- **Fitted set** (`room_linen_standards` + `room_linen_requirements`) is the hard ceiling for standard install (`room_task_linen_lines`).
- **Extras** live on `room_task_extra_lines` (kits via `extra_kits`). “Matches standard” resets fitted only and never clears extras.
- **Standing extras** live on `standing_extra_requests`; each active request produces a daily room-task extra line until stopped or checkout. Daily clean-in, soiled-out, partial, DND, and not-changed outcomes are recorded on the normal Housekeeper room page.
- **Daily room service state:** the Supervisor’s manually confirmed occupied rooms on the first daily round begin as `soiled` / service required in the Dashboard and assignment grid. The state clears only when the Housekeeper submits the room service record; `partial` remains visibly partial, while DND/not-changed and other incomplete outcomes remain soiled for follow-up. PMS/booking occupancy linkage is future scope.
- Cart suggest = fitted + open extras; cart `extra_qty` UI = Float / buffer (unattributed).
- Dashboard snapshot: `InstalledInRoom` vs fitted → insufficient (red) / normal (green) / extra (blue).

## Phase boundaries

- **Phase 1:** room ops MVP (rounds, assignment floor grid, cart, room counts, guest request extras, verification, evidence, linen snapshot dashboard)
- **Phase 2:** room-to-store collection (backend + role-aware UI now in progress), then laundry dispatch/return UI (schema scaffolded in migration 0001)
- Offline sync deferred; basic online photo evidence is in Phase 1

## Hotel setup vs Admin

- **Hotel setup** (nav: Superadmin only): one-time onboarding wizard to create a hotel — profile, room types, linen catalogue, fitted standards, bulk rooms, store/staff bootstrap, readiness.
- Incomplete Superadmins land on Hotel setup (first failing readiness step) after login; ready properties land on Dashboard.
- **Admin** (`admin.configure`): day-to-day operational config — room grid, fitted linen per room, default floors. Supervisors use Admin after setup.
- `/setup/properties` is scoped: Free Version Superadmins see only their own hotel. Platform operators (`LINOS_BOOTSTRAP_ADMIN_EMAILS`) can list all properties.

## Demo data

The Masaero LINOS Hotel seed (`is_demo: true`, plan `demo`) is **synthetic / approximate** for demonstration only. Never present estimated room counts or linen quantities as official hotel data. UI shows the demo disclaimer; Free Version banner is for commercial free tenants only.

Demo staffing: **35 housekeepers + 4 supervisors** with one initial default floor per housekeeper across floor bands (`ensureDemoStaffRoster`, profile `hk35_sv4_v2`); supervisors/admins can edit defaults later. Keep `agent1@` / `agent2@` / `supervisor@` for tests. Sign-in keeps commercial credentials separate from a collapsed **Try the demo workspace** picker.

## Working agreements

1. Do not weaken server enforcement for client convenience.
2. Posted linen transactions are immutable; corrections use reversals/adjustments with reason.
3. Guest PII is not imported by default.
4. No automatic guest charging — guest-claim and guest-request extras are status/inventory tracking only.
5. Prefer small, reversible changes.
6. Update this file when architecture or auth rules change.
