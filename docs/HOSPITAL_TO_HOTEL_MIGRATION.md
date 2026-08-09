# Hospital → Hotel migration checklist

LINOS Hotel is a **greenfield** schema. Prefer parallel hotel tables over in-place rename of hospital tables.

When a hospital LINOS codebase or database is supplied, follow this checklist before dropping legacy fields.

## 1. Archive first

- [ ] Export hospital operational history (`pg_dump` or approved extract)
- [ ] Confirm retention / legal hold requirements
- [ ] Store checksums and restore rehearsal notes
- [ ] Do **not** drop columns until export, reconciliation, and retention are confirmed

## 2. Concept map

| Remove / retire | Hotel replacement |
|---|---|
| Hospital, ward, unit, bed, patient | Property, floor/station, room |
| Patient / admission / discharge identifiers | Room task + housekeeping/PMS status |
| Medical record or diagnosis data | None |
| Infection / isolation fields | Hotel exception or special handling only if needed |
| Nurse, ward supervisor, clinical roles | Station agent, station supervisor, porter, store agent |
| Hospital collection rounds | Hotel daily room linen rounds |
| Hospital bag or weight-based workflows | Piece-counted station transfers |
| Patient billing or clinical incident actions | Controlled hotel guest-claim incident |
| Generic manual count screen | Counts embedded in cart, room, transfer, dispatch, return |
| Hospital-specific reports / terminology | Hotel ops and laundry-reconciliation reports |

## 3. Pattern reuse (keep)

These hospital-platform patterns are intentionally mirrored in Hotel:

- Server-enforced capability checks
- Append-only stock / transaction ledger with reversals
- Dual acknowledgement readiness for handovers
- Idempotent commits
- Property/facility scoping
- Audit events for privileged actions

## 4. Explicit non-goals for migration

- Do not migrate patient-identifying data into hotel rooms
- Do not auto-map hospital “manual count” screens into a standalone hotel count module
- Do not carry clinical incident billing into guest folio charging

## 5. Cutover sequence (when hospital DB is in scope)

1. Freeze hospital writes for the migration window (or use read-only replica export)
2. Archive and verify restore
3. Deploy hotel schema (`0001_linos_hotel_schema.sql`)
4. Manually configure property/station/room/linen masters from verified hotel data
5. Run Phase 1 pilot on 1–2 floors
6. Only after retention sign-off, schedule legacy hospital object retirement

## 6. Acceptance before dropping legacy objects

- [ ] Hotel pilot acceptance targets met (see product brief §8)
- [ ] Archive restore tested
- [ ] No open legal/retention dependency on live hospital tables
- [ ] Stakeholder written approval to drop/retire hospital fields
