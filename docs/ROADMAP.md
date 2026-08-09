# LINOS Hotel build roadmap

## Product direction

LINOS Hotel is the operating record for room linen work: who serviced a room, what fitted linen moved, what extras were requested, and where soiled pieces are now. The product should make the next physical handoff unambiguous without turning demo estimates into hotel truth.

## Delivery sequence

### Slice 1 — Room operations baseline (existing)

- Morning board generation and release
- Floor-aware housekeeper assignment
- Cart issue, fitted counts, extras, evidence, and supervisor verification
- Standing guest extras carried into each daily room task with same-page partial/DND/not-changed recording and second-shift follow-up visibility
- Room snapshot against the Admin fitted ceiling

### Slice 2 — Room → store custody (current build)

- Prepare counted soiled collection by round and optional floor
- Porter collection with room/item-level quantities
- Store receipt with received quantity and variance
- Reconciliation that opens an auditable variance and preserves the ledger

### Slice 3 — Store → laundry loop

- Create and dispatch a numbered laundry load
- Store and laundry acknowledgement
- Return acceptance against the dispatch
- Clean, loss, damage, and rejection posting with approval boundaries

### Slice 4 — Durable deployment and controls

- Wire the service to the PostgreSQL schema for deployed persistence
- Add migration/health checks that fail clearly when a production deployment is still memory-backed
- Add real authentication and property membership provisioning
- Add structured audit export and retention controls for photo evidence

### Slice 5 — Shift usability

- Porter/store work queues with scan-friendly compact layouts
- Exception and variance worklists
- Responsive mobile testing at the operating floor viewport
- Offline sync only after the online custody model is stable

## Operating guardrails

- Server capabilities remain the authorization boundary.
- Posted linen movements are append-only; corrections reverse or adjust with a reason.
- Fitted standards and guest extras remain separate ledgers.
- Property scope is required on every workflow.
- Synthetic Seri Pacific values remain visibly demo-only.

## Current release gate

The Phase 2 room-to-store backend and role-aware UI are being built first. The app is not production-ready while deployed persistence still uses the in-memory adapter; that is the next infrastructure gate after the custody loop is verified.
