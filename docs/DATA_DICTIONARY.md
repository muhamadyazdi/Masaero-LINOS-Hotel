# LINOS Hotel Data Dictionary

Timestamps are stored in UTC and displayed in `Asia/Kuala_Lumpur` unless a property overrides `timezone`.

## Master data

| Entity | Purpose | Key fields |
|---|---|---|
| `properties` | Hotel/workspace | `code`, `name`, `is_demo`, `allow_guest_pii_import`, `photo_retention_days`, `demo_staff_profile` |
| `rooms` | Guest room **and** clean replenishment stock point | `room_number`, `floor_number`, `category_id`, `bed_config_id` |
| `stores` | Hotel linen store (custody party) | `code`, `name` |
| `laundry_providers` | Laundry custody party | turnaround hours |
| `amenity_locations` | Future Club lounge / F&B / spa stubs (not Phase 1 room tasks) | `kind`, `is_active` |
| `room_categories` | Superior/Deluxe/… | `family` |
| `bed_configs` | King/Twin/… | `code` |
| `linen_items` | Piece catalogue | `unit`, `sort_order` |
| `room_linen_standards` | Fitted set defaults per category × bed | `quantity` |
| `room_linen_requirements` | Per-room fitted include + qty overrides (hard ceiling for standard install) | `room_id`, `linen_item_id`, `included`, `quantity` |
| `room_par_levels` | Opening / target clean stock at the room (`CleanAtRoom`); seeded ≈ 2× fitted | `par_quantity` |
| `extra_kits` / `extra_kit_lines` | Preset guest-request bundles (extra bed, +1 pillow/towels) | `code`, kit lines |
| `exception_categories` | Missing/damaged/stained/other | `requires_evidence`, `guest_claim_eligible` |
| `scheduling_rules` | Checkout/stayover/VIP/special | `task_reason`, `priority` (used by Morning Board priorities) |

## Operational records

| Entity | Status flow | Notes |
|---|---|---|
| `daily_rounds` | Draft → Released → Active → Closed | Unique per property/date/shift. Assignment UI suggests `ceil(unassigned rooms ÷ active housekeepers)` as the editable minimum planning value; actual assignments may exceed it. UI: Morning Board → **Make active for assignment** (`POST /rounds/release`) |
| `room_tasks` | Unassigned → Assigned → InProgress → Submitted → Verified (+ Skipped, ReturnedForCorrection) | One room per round; `guest_extra` for mid-day requests. Morning Board sets `occupancy_status` (`occupied_checkout` / `occupied_stayover` / `dnd` / `no_service`); vacant rooms are **not** listed. DND/no-service rows are `Skipped` with `skip_reason`. An occupied task is `service_required` / `service_state=soiled` until a Housekeeper records a submission; a submitted `partial` outcome stays `partial`, and DND/not-changed outcomes remain soiled for follow-up. |

### Morning Board (`POST /rounds/generate-morning`)

Demo / no-PMS fill for today’s AM Draft. Defaults: **80%** occupancy, **40%** checkout of occupied, ~3% VIP, ~4% DND of stayover, ~1% no-service.

Occupancy is a Supervisor-entered operating decision in the current release. The generator is a demo/no-PMS aid; a future booking/PMS connector can supply the occupied-room list.

- **Every occupied room gets a linen-change task**; checkout % only labels checkout vs stayover.
- Vacant rooms stay off the service list.
- Modes: `replace` | `merge`. Optional `seed` for deterministic shuffle.
- Legacy `POST /rounds/generate` (single scheduling rule) remains for fixtures.

### Room service state in grids

The Dashboard snapshot and Supervisor assignment grid expose the daily service state alongside fitted-linen status:

- `soiled`: occupied room has not yet been recorded by the Housekeeper, or its latest outcome is DND/not-changed/another incomplete result.
- `partial`: Housekeeper submitted the room but recorded only a partial service.
- `serviced`: Housekeeper submitted or Supervisor verified a complete service record; the grid returns to the fitted-linen status (`normal`, `extra`, or `insufficient`).
- `not_scheduled`: no current round task applies to the room.

The room icon and red/amber grid colors make `soiled` and `partial` visible before a supervisor opens the room details. The snapshot also returns `base_status`, `service_required`, `service_state`, `service_task_status`, and `service_outcome`.
| `cart_loads` | Draft → Issued → Reconciled | Suggest = fitted Σ + open extras; `extra_qty` = float/buffer only |
| `room_task_linen_lines` | n/a | **Fitted only** — `linen_out/in ≤ standard_qty` |
| `room_task_extra_lines` | Requested → Loaded → Installed → Collected \| Cancelled | Guest/ops over-and-above; never mutates fitted Admin config |
| `standing_extra_requests` | Active → Paused/Stopped/Completed | Ongoing guest/room extra need; daily room-task lines are created from it until checkout or stop instruction |
| `room_exceptions` | Reported → Confirmed → Resolved | Optional `guest_claim_status` |
| `evidence` | Active → Archived/Deleted | Private inline/base64 in Phase 1 |
| `linen_transactions` | Posted / Reversed | Immutable; corrections reverse then re-post |
| `audit_events` | append-only | Includes `room.extra.add` / `deliver` / `cancel` / `collect` |

### Guest-claim statuses

`Reported → SupervisorConfirmed → SubmittedToHotel → ChargeApproved|ChargeRejected → Closed`

LINOS never posts a guest charge automatically. Guest-request extras are status/inventory only (no FD approval/charging in Phase 1).

## Inventory buckets

`CleanAtStore`, `CleanAtRoom`, `CleanOnCart`, `InstalledInRoom`, `SoiledAtRoom`, `SoiledAtStore`, `WithLaundry`, `Quarantined`, `WrittenOff`

- **Dashboard room linen snapshot** compares `InstalledInRoom` to the fitted set (`requiredLinenForRoom`). `CleanAtRoom` is spare replenishment stock and is **not** used for snapshot colors.
- Seed/create initializes `InstalledInRoom` = fitted qty (and `CleanAtRoom` ≈ 2× fitted).
- Fitted submit: soiled = `InstalledInRoom` → `SoiledAtRoom`; clean in = `CleanOnCart` → `InstalledInRoom`.
- Extra deliver/install posts distinct reasons (`Extra install: …`); collect = `InstalledInRoom` → `SoiledAtRoom`.
- Standing extras are serviced on the normal room round. Each day records clean-in, soiled-out, and not-changed quantities. A DND or guest-declined result completes the daily record but leaves the standing request active for the next round.
- The Supervisor assignment board exposes every room whose `service_required` flag remains true—including not-yet-serviced rooms and submitted `not_changed`, `dnd`, guest-declined, room-unavailable, and other outcomes—for second-shift review or reassignment.

Snapshot room colors: **red** if any fitted item short; else **blue** if any extra; else **green** if all fitted match.

## Phase 2 scaffold

| Entity | Status flow |
|---|---|
| `store_collections` | Prepared → Collected → Received → Reconciled |
| `laundry_dispatches` | Draft → Dispatched → PartiallyReturned → Reconciled |
| `laundry_returns` | Draft → Accepted → Posted |
| `variances` | Open → Approved/Rejected → Closed |

Outstanding laundry formula:

```text
Outstanding = Qty Sent − Accepted Clean Returned − Approved Loss − Approved Damage
```

## Roles and capabilities

| Internal role | UI label | Representative capabilities |
|---|---|---|
| Station Agent | **Housekeeper** | `cart.issue`, `room.service`, `room.submit`, `evidence.upload` |
| Station Supervisor | **Supervisor** | `round.*`, `task.assign`, `room.verify`, `exception.guest_claim` |
| Porter | Porter | `transfer.collect` (Phase 2 UI) |
| Store Agent | Store Agent | `transfer.receive`, `dispatch.*`, `return.*` (Phase 2 UI) |
| Admin / Superadmin | Admin / Superadmin | `admin.configure`, `admin.users` |

Server re-checks every write. Menu visibility is not authorization. UI never says “Station”.
