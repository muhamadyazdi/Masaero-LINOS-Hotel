/**
 * Starter packs and pure helpers for Superadmin Hotel Setup (non-demo hotels).
 * Demo Masaero seeding stays in seed.mjs.
 */

import { newId, ROLES } from "./model.mjs";

export const PROPERTY_KINDS = Object.freeze(["hotel", "boutique", "spa", "hosted", "other"]);
export const PROPERTY_SCALES = Object.freeze(["small", "standard", "large"]);
/** Canonical laundry operations modes. Legacy none→in_house, manual→other. */
export const LAUNDRY_PARTNER_TYPES = Object.freeze(["in_house", "aerosparkle", "other"]);

export const SETUP_STARTER_ROOM_TYPES = Object.freeze([
  { code: "SUP", name: "Superior", family: "Superior" },
  { code: "DLX", name: "Deluxe", family: "Deluxe" },
  { code: "CLB", name: "Club", family: "Club" },
  { code: "STE", name: "Suite", family: "Suite" }
]);

export const SETUP_STARTER_ROOM_TYPES_SPA = Object.freeze([
  { code: "TRT", name: "Treatment Room", family: "Treatment" },
  { code: "STE", name: "Suite", family: "Suite" }
]);

export const SETUP_STARTER_ROOM_TYPES_HOSTED = Object.freeze([
  { code: "UNT", name: "Guest unit", family: "Unit" },
  { code: "STE", name: "Suite", family: "Suite" }
]);

export const SETUP_STARTER_BEDS = Object.freeze([
  { code: "KING", name: "King" },
  { code: "TWIN", name: "Twin" }
]);

export const SETUP_STARTER_BEDS_SPA = Object.freeze([
  { code: "TABLE", name: "Treatment table" },
  { code: "KING", name: "King" }
]);

export const SETUP_STARTER_LINEN = Object.freeze([
  { code: "FS", name: "Fitted Sheet", sort_order: 10 },
  { code: "FSH", name: "Flat Sheet", sort_order: 20 },
  { code: "DP", name: "Duvet Cover", sort_order: 30 },
  { code: "PB", name: "Pillowcase", sort_order: 40 },
  { code: "BT", name: "Bath Towel", sort_order: 50 },
  { code: "HT", name: "Hand Towel", sort_order: 60 },
  { code: "FT", name: "Face Towel", sort_order: 70 },
  { code: "BM", name: "Bath Mat", sort_order: 80 },
  { code: "CUR", name: "Curtains (set)", sort_order: 110 }
]);

export const SETUP_STARTER_LINEN_SPA = Object.freeze([
  { code: "BT", name: "Bath Towel", sort_order: 10 },
  { code: "HT", name: "Hand Towel", sort_order: 20 },
  { code: "FT", name: "Face Towel", sort_order: 30 },
  { code: "BM", name: "Bath Mat", sort_order: 40 },
  { code: "RB", name: "Bathrobe", sort_order: 50 },
  { code: "FS", name: "Fitted Sheet", sort_order: 60 },
  { code: "PB", name: "Pillowcase", sort_order: 70 }
]);

/** Qty by linen code for King / Twin / Table base (before room-type scale). */
export const SETUP_BASE_QTY = Object.freeze({
  KING: { FS: 1, FSH: 1, DP: 1, PB: 4, BT: 2, HT: 2, FT: 2, BM: 1, CUR: 1, RB: 2 },
  TWIN: { FS: 2, FSH: 2, DP: 2, PB: 4, BT: 2, HT: 2, FT: 2, BM: 1, CUR: 1, RB: 2 },
  TABLE: { BT: 4, HT: 4, FT: 4, BM: 2, RB: 2, FS: 0, PB: 0 }
});

export const SETUP_TYPE_MULT = Object.freeze({
  Superior: 1,
  Deluxe: 1,
  Club: 1.5,
  Suite: 2,
  Treatment: 1,
  Unit: 1
});

export const SETUP_EXCEPTION_DEFAULTS = Object.freeze([
  ["MISSING", "Missing linen", true, true],
  ["DAMAGED", "Damaged linen", true, true],
  ["STAINED", "Abnormally stained", true, false],
  ["OTHER", "Other discrepancy", false, false]
]);

export const SETUP_RULE_DEFAULTS = Object.freeze([
  ["CHECKOUT", "Checkout change", "checkout", 10],
  ["STAYOVER", "Stayover change day", "stayover", 20],
  ["VIP", "VIP request", "vip", 5],
  ["SPECIAL", "Special instruction", "special", 15]
]);

export function normalizePropertyKind(value) {
  const kind = String(value || "hotel").trim().toLowerCase();
  return PROPERTY_KINDS.includes(kind) ? kind : "hotel";
}

export function normalizePropertyScale(value) {
  const scale = String(value || "small").trim().toLowerCase();
  if (scale === "mid" || scale === "medium") return "standard";
  if (scale === "enterprise") return "large";
  return PROPERTY_SCALES.includes(scale) ? scale : "small";
}

export function normalizeLaundryPartnerType(value) {
  const raw = String(value || "in_house").trim().toLowerCase();
  if (raw === "none") return "in_house";
  if (raw === "manual") return "other";
  return LAUNDRY_PARTNER_TYPES.includes(raw) ? raw : "in_house";
}

export function laundryOperationsLabel(partnerType) {
  const type = normalizeLaundryPartnerType(partnerType);
  if (type === "aerosparkle") return "AeroSparkle";
  if (type === "other") return "Other 3rd party";
  return "In-house";
}

/** Build editable linen qty rows for a category × bed from catalogue + standards. */
export function linenMatrixForCategoryBed(linenItems, standards, categoryId, bedConfigId) {
  const byItem = new Map(
    (standards || [])
      .filter((s) => s.category_id === categoryId && s.bed_config_id === bedConfigId)
      .map((s) => [s.linen_item_id, Number(s.quantity || 0)])
  );
  return (linenItems || [])
    .filter((item) => item.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100))
    .map((item) => ({
      linen_item_id: item.id,
      code: item.code,
      name: item.name,
      quantity: byItem.has(item.id) ? byItem.get(item.id) : 0
    }));
}

export function defaultFeaturesFor(scale, kind = "hotel") {
  const normalizedScale = normalizePropertyScale(scale);
  const normalizedKind = normalizePropertyKind(kind);
  if (normalizedScale === "large") {
    return {
      owner_mode: false,
      team_mode: true,
      floor_mode: true,
      custody_mode: true,
      laundry_partner: true
    };
  }
  if (normalizedScale === "standard") {
    return {
      owner_mode: normalizedKind === "hosted",
      team_mode: normalizedKind !== "hosted",
      floor_mode: true,
      custody_mode: false,
      laundry_partner: false
    };
  }
  return {
    owner_mode: true,
    team_mode: false,
    floor_mode: false,
    custody_mode: false,
    laundry_partner: false
  };
}

export function normalizeFeatures(features = {}, scale = "small", kind = "hotel") {
  const defaults = defaultFeaturesFor(scale, kind);
  const src = features && typeof features === "object" ? features : {};
  return {
    owner_mode: src.owner_mode != null ? Boolean(src.owner_mode) : defaults.owner_mode,
    team_mode: src.team_mode != null ? Boolean(src.team_mode) : defaults.team_mode,
    floor_mode: src.floor_mode != null ? Boolean(src.floor_mode) : defaults.floor_mode,
    custody_mode: src.custody_mode != null ? Boolean(src.custody_mode) : defaults.custody_mode,
    laundry_partner: src.laundry_partner != null ? Boolean(src.laundry_partner) : defaults.laundry_partner
  };
}

export function parseFeaturesJson(value, scale = "small", kind = "hotel") {
  if (value == null) return defaultFeaturesFor(scale, kind);
  if (typeof value === "string") {
    try {
      return normalizeFeatures(JSON.parse(value), scale, kind);
    } catch {
      return defaultFeaturesFor(scale, kind);
    }
  }
  return normalizeFeatures(value, scale, kind);
}

export function isSmallScale(scale) {
  return normalizePropertyScale(scale) === "small";
}

export function startersForKind(kind) {
  const normalized = normalizePropertyKind(kind);
  if (normalized === "spa") {
    return {
      roomTypes: SETUP_STARTER_ROOM_TYPES_SPA,
      beds: SETUP_STARTER_BEDS_SPA,
      linenItems: SETUP_STARTER_LINEN_SPA
    };
  }
  if (normalized === "hosted") {
    return {
      roomTypes: SETUP_STARTER_ROOM_TYPES_HOSTED,
      beds: SETUP_STARTER_BEDS,
      linenItems: SETUP_STARTER_LINEN
    };
  }
  if (normalized === "boutique") {
    return {
      roomTypes: SETUP_STARTER_ROOM_TYPES.filter((row) => ["SUP", "DLX", "STE"].includes(row.code)),
      beds: SETUP_STARTER_BEDS,
      linenItems: SETUP_STARTER_LINEN
    };
  }
  return {
    roomTypes: SETUP_STARTER_ROOM_TYPES,
    beds: SETUP_STARTER_BEDS,
    linenItems: SETUP_STARTER_LINEN
  };
}

export function opsDefaultsForScale(scale) {
  const normalized = normalizePropertyScale(scale);
  if (normalized === "large") {
    return {
      owner_only: false,
      housekeeper_count: 8,
      supervisor_count: 2,
      store_stock_per_item: 500,
      partner_type: "other"
    };
  }
  if (normalized === "standard") {
    return {
      owner_only: false,
      housekeeper_count: 4,
      supervisor_count: 1,
      store_stock_per_item: 150,
      partner_type: "in_house"
    };
  }
  return {
    owner_only: true,
    housekeeper_count: 0,
    supervisor_count: 0,
    store_stock_per_item: 40,
    partner_type: "in_house"
  };
}

export function roomBuilderDefaultsForScale(scale) {
  const normalized = normalizePropertyScale(scale);
  if (normalized === "large") {
    return { floor_from: 5, floor_to: 8, rooms_per_floor: 20 };
  }
  if (normalized === "standard") {
    return { floor_from: 2, floor_to: 4, rooms_per_floor: 10 };
  }
  return { floor_from: 1, floor_to: 1, rooms_per_floor: 6 };
}

export function spaceLabel(kind) {
  const normalized = normalizePropertyKind(kind);
  if (normalized === "spa") return "treatment rooms";
  if (normalized === "hosted") return "units";
  return "rooms";
}

export function slugCode(value, fallback = "HTL") {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (raw || fallback).slice(0, 24);
}

export function buildDefaultStandardsMatrix(categories, beds, linenItems) {
  const lines = [];
  for (const category of categories) {
    const mult = SETUP_TYPE_MULT[category.family] || SETUP_TYPE_MULT[category.name] || 1;
    for (const bed of beds) {
      const base = SETUP_BASE_QTY[bed.code] || SETUP_BASE_QTY.KING;
      for (const item of linenItems) {
        const raw = base[item.code];
        if (raw == null) continue;
        const quantity = Math.max(0, Math.ceil(Number(raw) * mult));
        if (!quantity) continue;
        lines.push({
          category_id: category.id,
          bed_config_id: bed.id,
          linen_item_id: item.id,
          quantity
        });
      }
    }
  }
  return lines;
}

export function planBulkRooms({
  floorFrom,
  floorTo,
  roomsPerFloor,
  defaultCategoryId,
  defaultBedConfigId,
  floorOverrides = []
}) {
  const from = Number(floorFrom);
  const to = Number(floorTo);
  const perFloor = Number(roomsPerFloor);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    throw new Error("floor_from and floor_to must be integers with floor_to >= floor_from.");
  }
  if (!Number.isInteger(perFloor) || perFloor < 1 || perFloor > 80) {
    throw new Error("rooms_per_floor must be an integer between 1 and 80.");
  }
  if (!defaultCategoryId || !defaultBedConfigId) {
    throw new Error("default_category_id and default_bed_config_id are required.");
  }

  const overrideByFloor = new Map();
  for (const row of floorOverrides || []) {
    const floor = Number(row.floor);
    if (!Number.isInteger(floor)) continue;
    overrideByFloor.set(floor, row);
  }

  const planned = [];
  for (let floor = from; floor <= to; floor += 1) {
    const ov = overrideByFloor.get(floor) || {};
    const count = Number(ov.rooms_per_floor || perFloor);
    const categoryId = ov.category_id || defaultCategoryId;
    const bedId = ov.bed_config_id || defaultBedConfigId;
    for (let n = 1; n <= count; n += 1) {
      planned.push({
        room_number: `${floor}${String(n).padStart(2, "0")}`,
        floor_number: floor,
        category_id: categoryId,
        bed_config_id: bedId
      });
    }
  }
  return planned;
}

/** Simple room/unit list for small hotels, spas, and hosted properties. */
export function planSimpleRooms({
  roomCount,
  floorNumber = 1,
  defaultCategoryId,
  defaultBedConfigId,
  roomNames = []
}) {
  const floor = Number(floorNumber);
  const names = Array.isArray(roomNames)
    ? roomNames.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  const count = names.length ? names.length : Number(roomCount);
  if (!Number.isInteger(floor) || floor < 1) {
    throw new Error("floor_number must be an integer >= 1.");
  }
  if (!Number.isInteger(count) || count < 1 || count > 80) {
    throw new Error("room_count must be an integer between 1 and 80.");
  }
  if (!defaultCategoryId || !defaultBedConfigId) {
    throw new Error("default_category_id and default_bed_config_id are required.");
  }
  const planned = [];
  for (let n = 1; n <= count; n += 1) {
    planned.push({
      room_number: names[n - 1] || `${floor}${String(n).padStart(2, "0")}`,
      floor_number: floor,
      category_id: defaultCategoryId,
      bed_config_id: defaultBedConfigId
    });
  }
  return planned;
}

export function splitFloorsAcrossStaff(floors, staffCount) {
  const sorted = [...new Set(floors.map(Number).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
  const n = Math.max(1, Number(staffCount) || 1);
  const bands = Array.from({ length: n }, () => []);
  sorted.forEach((floor, i) => {
    bands[i % n].push(floor);
  });
  return bands;
}

/** Give each staff member exactly one initial floor; later edits may add more floors. */
export function singleFloorDefaults(floors, staffCount) {
  const sorted = [...new Set(floors.map(Number).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
  const n = Math.max(1, Number(staffCount) || 1);
  const source = sorted.length ? sorted : [1];
  return Array.from({ length: n }, (_, index) => [source[index % source.length]]);
}

export function setupStaffEmail(propertyCode, role, index) {
  const code = slugCode(propertyCode, "HTL").toLowerCase().replace(/-/g, "");
  if (role === "supervisor") return `sv${index}@${code}.setup.linos.hotel`;
  if (role === "store") return `store@${code}.setup.linos.hotel`;
  if (role === "porter") return `porter@${code}.setup.linos.hotel`;
  return `hk${String(index).padStart(2, "0")}@${code}.setup.linos.hotel`;
}

export function insertStarterExceptions(store, propertyId) {
  const existing = store.list("exception_categories", (e) => e.property_id === propertyId);
  if (existing.length) return existing;
  return SETUP_EXCEPTION_DEFAULTS.map(([code, name, requires_evidence, guest_claim_eligible]) =>
    store.insert("exception_categories", {
      id: newId("exc"),
      property_id: propertyId,
      code,
      name,
      requires_evidence,
      guest_claim_eligible
    })
  );
}

export function insertStarterRules(store, propertyId) {
  const existing = store.list("scheduling_rules", (r) => r.property_id === propertyId);
  if (existing.length) return existing;
  return SETUP_RULE_DEFAULTS.map(([code, name, task_reason, priority]) =>
    store.insert("scheduling_rules", {
      id: newId("rule"),
      property_id: propertyId,
      code,
      name,
      task_reason,
      priority,
      is_active: true
    })
  );
}

export { ROLES };
