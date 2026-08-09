export const ROLES = Object.freeze({
  SUPERADMIN: "Superadmin",
  ADMIN: "Admin",
  STATION_SUPERVISOR: "Station Supervisor", // internal auth key; UI label = Supervisor
  STATION_AGENT: "Station Agent", // internal auth key; UI label = Housekeeper
  PORTER: "Porter",
  STORE_AGENT: "Store Agent"
});

/** User-facing role labels — never say "Station". */
export const ROLE_LABELS = Object.freeze({
  Superadmin: "Superadmin",
  Admin: "Admin",
  "Station Supervisor": "Supervisor",
  "Station Agent": "Housekeeper",
  Porter: "Porter",
  "Store Agent": "Store Agent"
});

export const EXTRA_REASON_CODES = Object.freeze([
  "ExtraBed",
  "ExtraPillow",
  "ExtraTowel",
  "GuestRequest",
  "Other"
]);

export const EXTRA_STATUSES = Object.freeze([
  "Requested",
  "Loaded",
  "Installed",
  "Collected",
  "Cancelled",
  "NotChanged",
  "Deferred",
  "Stopped"
]);

export const EXTRA_SOURCES = Object.freeze(["guest", "front_desk", "housekeeping", "other"]);

export const OPEN_EXTRA_STATUSES = Object.freeze(["Requested", "Loaded"]);
export const STANDING_EXTRA_STATUSES = Object.freeze(["Active", "Paused", "Stopped", "Completed"]);
export const SERVICE_OUTCOMES = Object.freeze([
  "changed",
  "partial",
  "not_changed",
  "dnd",
  "guest_declined",
  "room_unavailable",
  "other"
]);
export const SERVICE_OUTCOME_LABELS = Object.freeze({
  changed: "Changed as scheduled",
  partial: "Partially changed",
  not_changed: "Not changed",
  dnd: "DND — change later",
  guest_declined: "Guest declined today",
  room_unavailable: "Room unavailable",
  other: "Other — supervisor follow-up"
});

/** Demo staff roster profile bump — ensureDemoStaffRoster rebuilds when this changes. */
export const DEMO_STAFF_PROFILE = "hk35_sv4_v2";

export function roleLabel(roleName) {
  return ROLE_LABELS[roleName] || String(roleName || "").replace(/\bStation\b/g, "Room");
}

export const ROUND_STATUSES = Object.freeze(["Draft", "Released", "Active", "Closed"]);
export const TASK_STATUSES = Object.freeze([
  "Unassigned",
  "Assigned",
  "InProgress",
  "Submitted",
  "Verified",
  "Skipped",
  "ReturnedForCorrection"
]);

/** Morning Board occupancy labels on room_tasks.occupancy_status */
export const OCCUPANCY_STATUSES = Object.freeze([
  "occupied_checkout",
  "occupied_stayover",
  "vacant",
  "dnd",
  "no_service"
]);

/** Skip reasons written at morning generate (DND / no-service exceptions). */
export const MORNING_SKIP_REASONS = Object.freeze(["dnd", "no_service"]);

export const MORNING_BOARD_DEFAULTS = Object.freeze({
  occupancy_pct: 80,
  checkout_pct_of_occupied: 40,
  vip_pct_of_occupied: 3,
  dnd_pct_of_stayover: 4,
  no_service_pct_of_occupied: 1,
  mode: "replace"
});

/** Deterministic PRNG (mulberry32) for reproducible morning board shuffles. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeedString(value) {
  const str = String(value || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededShuffle(items, seed) {
  const arr = items.slice();
  const rand = mulberry32(seed >>> 0);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function clampPct(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}
export const CART_STATUSES = Object.freeze(["Draft", "Issued", "Reconciled"]);
export const EXCEPTION_STATUSES = Object.freeze(["Reported", "Confirmed", "Resolved"]);
export const GUEST_CLAIM_STATUSES = Object.freeze([
  "Reported",
  "SupervisorConfirmed",
  "SubmittedToHotel",
  "ChargeApproved",
  "ChargeRejected",
  "Closed"
]);
export const EVIDENCE_STATUSES = Object.freeze(["Active", "Archived", "Deleted"]);
export const TX_STATUSES = Object.freeze(["Posted", "Reversed"]);

export const INVENTORY_BUCKETS = Object.freeze([
  "CleanAtStore",
  "CleanAtRoom",
  "CleanOnCart",
  "InstalledInRoom",
  "SoiledAtRoom",
  "SoiledAtStore",
  "WithLaundry",
  "Quarantined",
  "WrittenOff"
]);

/** Hotel location kinds — rooms are stock points; store/laundry are custody parties. */
export const LOCATION_KINDS = Object.freeze(["room", "store", "laundry", "cart"]);

export const COLLECTION_STATUSES = Object.freeze(["Prepared", "Collected", "Received", "Reconciled"]);
export const TRANSFER_STATUSES = COLLECTION_STATUSES;
export const DISPATCH_STATUSES = Object.freeze(["Draft", "Dispatched", "PartiallyReturned", "Reconciled"]);
export const RETURN_STATUSES = Object.freeze(["Draft", "Accepted", "Posted"]);
export const VARIANCE_STATUSES = Object.freeze(["Open", "Approved", "Rejected", "Closed"]);

export const DEFAULT_ROOMS_PER_AGENT = 15;
export const DISPLAY_TIMEZONE = "Asia/Kuala_Lumpur";

const ROLE_CAPABILITIES = Object.freeze({
  [ROLES.STATION_AGENT]: [
    "property.view",
    "task.view.assigned",
    "cart.view",
    "cart.issue",
    "cart.reconcile",
    "room.service",
    "room.submit",
    "exception.report",
    "evidence.upload",
    "dashboard.agent"
  ],
  [ROLES.STATION_SUPERVISOR]: [
    "property.view",
    "admin.configure",
    "admin.assignments",
    "round.view",
    "round.create",
    "round.release",
    "round.close",
    "task.view",
    "task.assign",
    "task.skip",
    "cart.view",
    "room.view",
    "room.verify",
    "room.return",
    "exception.report",
    "exception.confirm",
    "exception.guest_claim",
    "evidence.upload",
    "evidence.view",
    "dashboard.supervisor",
    "transfer.view",
    "transfer.collect",
    "transfer.receive",
    "writeoff.approve"
  ],
  [ROLES.PORTER]: [
    "property.view",
    "transfer.view",
    "transfer.collect",
    "dashboard.porter"
  ],
  [ROLES.STORE_AGENT]: [
    "property.view",
    "transfer.view",
    "transfer.receive",
    "dispatch.view",
    "dispatch.prepare",
    "return.view",
    "return.accept",
    "stock.view",
    "dashboard.store"
  ],
  [ROLES.ADMIN]: [
    "property.view",
    "admin.configure",
    "admin.users",
    "admin.assignments",
    "round.view",
    "round.create",
    "round.release",
    "task.view",
    "task.assign",
    "task.skip",
    "evidence.view",
    "dashboard.supervisor",
    "dashboard.management"
  ]
});

export function capabilitiesForUser(user, assignments = []) {
  if (!user || !user.is_active) return [];
  if (user.is_superadmin) return ["*"];
  const roles = new Set([user.role_name, ...assignments.map((a) => a.role_name)].filter(Boolean));
  const capabilities = new Set();
  for (const role of roles) {
    for (const capability of ROLE_CAPABILITIES[role] || []) capabilities.add(capability);
  }
  if (user.is_admin) {
    capabilities.add("admin.configure");
    capabilities.add("admin.users");
    capabilities.add("admin.assignments");
    capabilities.add("dashboard.management");
  }
  return [...capabilities].sort();
}

export function hasCapability(capabilities, required) {
  if (!required) return true;
  if (capabilities.includes("*")) return true;
  return capabilities.includes(required);
}

export function newId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayDateString(timeZone = DISPLAY_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function formatDisplayDateTime(iso, timeZone = DISPLAY_TIMEZONE) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const records = rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
  return { headers, records };
}

export const PII_CSV_HEADERS = Object.freeze([
  "guest_name",
  "guest",
  "passenger_name",
  "patient_name",
  "full_name",
  "name"
]);

export function assertNoGuestPiiHeaders(headers, allowGuestPii) {
  if (allowGuestPii) return;
  const blocked = headers.filter((h) => PII_CSV_HEADERS.includes(h));
  if (blocked.length) {
    throw new Error(`Guest PII columns are not imported by default: ${blocked.join(", ")}`);
  }
}

export function sumStandardPieces(standards = []) {
  return standards.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
}
