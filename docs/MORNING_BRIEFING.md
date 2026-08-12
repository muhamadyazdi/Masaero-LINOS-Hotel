# Morning briefing composer

Design for a plain-English input on the **Morning Board** (small properties: **Today’s rooms**) that turns a supervisor’s spoken or typed briefing into **filled forms for approval**. It does not post occupancy, extras, or ledger rows on its own.

Example:

> today occupancy 80%, room 2008 needs extra towel

Expected result: occupancy % is filled at 80, room 2008 is pinned occupied with a bath-towel extra draft, and the supervisor still taps **Generate** / **Add extra** (or one **Approve briefing** that runs the same existing APIs).

## Why this exists

The 07:00 list is still a **manual occupancy decision** (no PMS link). Today that means number fields, CSV, or clicking rooms. Supervisors already think in one sentence: occupancy, a few named rooms, extras, DND.

The Operations Dashboard snapshot is a **read** surface (soiled / fitted / extras). The briefing belongs on the **build** surface: Morning Board / Today’s rooms. Dashboard may later offer a compact “Tell LINOS…” box that deep-links to the board with the same draft.

## Non-negotiables

These follow `AGENTS.md` and the current service:

1. **Draft then approve.** Parse never writes. Apply only after the supervisor reviews the structured draft.
2. **Existing APIs stay the authority.** Occupancy still goes through `POST /rounds/generate-morning` (plus a small pin-rooms extension). Extras still go through `/extras/guest-request` or `/extras/standing-request`. The parser is not a second workflow engine.
3. **Capabilities stay on those routes.** `round.create` for occupancy generation; `room.verify` (supervisor) or `room.service` (housekeeper) for extras. Menu visibility is not authz.
4. **No auto-activate.** Applying extras on a Draft round today auto-releases the round. Briefing apply must **not** do that. Extras queue on the draft until **Make active for assignment**.
5. **Extras never inflate fitted config.** Kits resolve to `room_task_extra_lines` / `standing_extra_requests` only.
6. **No guest PII, no guest charging.** Do not parse or store guest names. Do not treat extras as a bill.
7. **Ambiguity stays visible.** “Towel” without bath/hand/face is unresolved until the supervisor picks a kit. Unknown room numbers never invent rooms.

## Current surfaces the composer must fill

| Supervisor says | Today’s form | Gap |
|---|---|---|
| Occupancy 80% | Morning Board occupancy % → `generate-morning` | None; prefill the input |
| Checkout 40% | Checkout % of occupied | None; prefill the input |
| Room 2008 extra towel | Guest request sheet (Housekeeper **My rooms**, not the board) | Need a **supervisor extras draft** on the morning board; “towel” is ambiguous across `TOWEL_BATH` / `TOWEL_HAND` / `TOWEL_FACE` |
| Room 2008 occupied / checkout / DND | CSV or manual add-rooms; generator **shuffles** occupied rooms by % | Named rooms can miss the 80% sample. Need **pin rooms** on generate |
| Replace vs merge | Radio on Build morning list | Prefill mode; default `replace` |

Housekeeper guest-request presets already map to kits: `EXTRA_BED`, `PILLOW`, `TOWEL_BATH`, `TOWEL_HAND`, `TOWEL_FACE`. Default extra frequency in that form is **every day until stopped** (standing).

## UX

Place a composer **above** the occupancy % fields on Build morning list (hidden once the round is Active).

```text
Tell LINOS today’s list
[ today occupancy 80%, room 2008 needs extra towel                    ]
[ Preview draft ]
```

Optional later: browser **Web Speech API** into the same textarea. No server speech-to-text in the first slice.

### Draft briefing panel

After parse, show a review card — not a chat transcript:

- **Occupancy** 80% → fills `#morning-occupancy`
- **Checkout** (if said) → fills `#morning-checkout`; else leave current default (40)
- **Mode** replace/merge if said; else current radio
- **Pinned rooms** e.g. 2008 occupied (so the generator cannot drop it)
- **Extras** Room 2008 · Extra bath towel ×1 · every day until stopped  
  Unresolved chip: “towel” → Bath / Hand / Face
- **Warnings** unknown rooms, extras on vacant rooms, replace will wipe the current board

Buttons:

- **Fill forms** — write the draft into the existing inputs and extras list; do not POST
- **Approve briefing** — POST the **reviewed JSON**, not the raw sentence
- **Discard**

Replace still needs the existing confirm dialog before generate.

Small / owner-mode properties use the same composer on **Today’s rooms**.

## Structured draft (source of truth)

Parser output is JSON. The UI and apply path consume this, never free text.

```json
{
  "source_text": "today occupancy 80%, room 2008 needs extra towel",
  "occupancy": {
    "occupancy_pct": 80,
    "checkout_pct_of_occupied": null,
    "mode": null
  },
  "pin_rooms": [
    { "room_number": "2008", "occupancy_status": "occupied_stayover" }
  ],
  "extras": [
    {
      "room_number": "2008",
      "kit_code": null,
      "quantity": 1,
      "frequency": "standing",
      "unresolved": "towel_kind"
    }
  ],
  "unresolved": [
    {
      "span": "extra towel",
      "reason": "towel_kind",
      "suggestions": ["TOWEL_BATH", "TOWEL_HAND", "TOWEL_FACE"]
    }
  ],
  "warnings": []
}
```

`occupancy_status` values stay the existing set: `occupied_checkout`, `occupied_stayover`, `dnd`, `no_service` (vacant = omit from board).

Default extra frequency: **standing** (matches today’s guest-request form). “Today only” / “one time” → `one_time`.

Default ambiguous towel: suggest **bath towel** (`TOWEL_BATH`) but do not auto-select until the supervisor confirms.

## Parser: deterministic first, optional LLM later

There is no LLM in the stack today (Netlify function + portable Node server, no vendor SDK). Morning language is small. A vendor model as the only parser would fail without keys, add latency, and can invent room numbers.

### Slice A — constrained parser (ship this)

Pure module, e.g. `src/core/briefingParser.mjs`, no I/O:

- Occupancy: `occupancy 80%`, `80 percent occupied`, `80% occupancy`
- Checkout: `checkout 40%`, `40% checkout`
- Mode: `replace` / `merge` / `keep existing`
- Room numbers: property room list only (`2008`, `room 2008`, `rm 2008`)
- Occupancy pins: `2008 checkout`, `2008 DND`, `2008 VIP`, `2008 vacant`, `2008 stayover`
- Extras: kit names and aliases (`extra towel`, `bath towel`, `hand towel`, `face towel`, `pillow`, `extra bed`) plus `×N` / `2 towels`
- Frequency: `every day`, `until checkout`, `today only`

Unknown clauses go to `unresolved`. Never drop them silently.

`POST /rounds/briefing/parse` (capability `round.create`) resolves room numbers against the property, attaches `room_id`, and returns the draft. **No writes.**

### Slice B — optional LLM adapter (later, same schema)

Behind env (off by default), e.g. `LINOS_BRIEFING_LLM_URL` + API key. Server-only. Prompt context is **catalogue only**: room numbers, kit codes/names, linen item names. No guest names, no ledger, no other properties.

The model may only emit the draft schema. Invalid JSON, unknown rooms, or unknown kits fail closed into `unresolved`. Apply still uses the reviewed draft and existing service methods.

Use the LLM only when the deterministic parser leaves unresolved clauses, or as a second opinion the UI can show. Tests and demo/CI stay on the deterministic parser.

## Apply path

Two layers:

1. **Fill forms** (client): occupancy inputs, mode radios, extras draft list, pin-room chips.
2. **Approve briefing** (server): `POST /rounds/briefing/apply` accepts the **edited draft** (idempotent). Order:

   1. Reject if any `unresolved` remains (unless the supervisor explicitly dropped those clauses).
   2. `generateMorningBoard` with occupancy % plus **pin_rooms** (new).
   3. Queue extras on the draft round **without** releasing it.
   4. Return the same round + tasks + extra drafts the board already shows.
   5. Supervisor still **Make active for assignment**.

Do not call extras with `deliver_now`. Morning extras are **Requested** (or standing Active with today’s line), not installed.

### Pin rooms (required service change)

`generateMorningBoard` today shuffles rooms and takes the first N as occupied. A named extra on 2008 must not depend on that shuffle.

Extend the body with optional `pin_rooms: [{ room_id | room_number, occupancy_status }]`:

- Pinned occupied rooms are **always** on the board (count toward occupancy; if pins exceed the %, pins win and the % is informational).
- Pinned vacant rooms are **never** on the board.
- `dnd` / `no_service` / checkout vs stayover on a pin override the random VIP/DND sprinkle for that room.
- Merge mode: pins add or update those rooms; they do not wipe the rest.

CSV import already accepts `room_number, task_reason, occupancy_status`. Pins are the same idea inside generate, so % occupancy and named exceptions work in one approve.

### Draft extras without auto-release (required service change)

`standingGuestRequest` / `guestRequestExtras` currently flip Draft → Active when the caller has `round.release`. Briefing apply must queue extras on Draft.

Add an explicit `defer_release: true` (or a dedicated queue helper used only by briefing apply) so extras attach to the draft task list and the round stays Draft. Housekeepers still cannot see work until activate.

If 2008 was vacant under the % but pinned occupied, insert the room task first, then the extra line.

## What the first slice does **not** do

- Assign housekeepers or issue carts
- Laundry / store collection
- Auto-activate or auto-deliver
- Guest names, booking references, or PMS occupancy (still future)
- Server-side voice transcription
- Letting the model call generate/extras directly

## Files when implementing

| Area | Change |
|---|---|
| `src/core/briefingParser.mjs` | New. Deterministic parse + kit alias table. Unit-tested. |
| `src/core/service.mjs` | `parseMorningBriefing`, `applyMorningBriefing`; `generateMorningBoard` pin_rooms; extras `defer_release` |
| `src/core/model.mjs` | Optional capability is unnecessary if parse uses `round.create` |
| `public/app.js` | Composer + draft panel on `renderRound`; Fill forms / Approve |
| `public/styles.css` | Compact composer; unresolved chips |
| `test/workflow.test.mjs` | Parser examples; pin_rooms; extras on Draft stay Draft; unknown room unresolved |
| `docs/DATA_DICTIONARY.md` | Briefing parse/apply routes; pin_rooms |
| `AGENTS.md` | One line: briefing is draft-then-approve; parser is not authority |

Keep the SPA modular JS / `service.mjs` split. Do not put occupancy math or extra posting in the browser beyond prefilling forms.

## Test utterances

| Input | Occupancy | Pins | Extras | Unresolved |
|---|---|---|---|---|
| `today occupancy 80%, room 2008 needs extra towel` | 80 | 2008 stayover | qty 1 standing | towel kind |
| `occupancy 80% checkout 40%, 2008 extra bath towel` | 80 / 40 | 2008 stayover | `TOWEL_BATH` ×1 standing | none |
| `2008 DND, 1501 checkout, occupancy 75%` | 75 | DND + checkout | none | none |
| `room 9999 extra pillow` | — | — | — | unknown room |
| `merge, 2008 needs 2 extra pillows today only` | — / merge | 2008 stayover | `PILLOW` ×2 one_time | none |

Same seed + same pins must stay deterministic (existing morning-board seed tests plus pins).

## Rollout

1. Parser module + parse endpoint + UI preview (Fill forms only). Supervisors can still Generate manually.
2. Pin rooms on `generate-morning`.
3. Approve briefing: generate + queue extras, round stays Draft.
4. Optional Web Speech on the textarea.
5. Optional LLM adapter behind env, same schema.

Demo Masaero: keep the synthetic occupancy disclaimer. Briefing text is an operating aid, not hotel-official occupancy.
