/**
 * Starter packs and pure helpers for Superadmin Hotel Setup (non-demo hotels).
 * Demo Seri Pacific seeding stays in seed.mjs.
 */

import { newId, ROLES } from "./model.mjs";

export const SETUP_STARTER_ROOM_TYPES = Object.freeze([
  { code: "SUP", name: "Superior", family: "Superior" },
  { code: "DLX", name: "Deluxe", family: "Deluxe" },
  { code: "CLB", name: "Club", family: "Club" },
  { code: "STE", name: "Suite", family: "Suite" }
]);

export const SETUP_STARTER_BEDS = Object.freeze([
  { code: "KING", name: "King" },
  { code: "TWIN", name: "Twin" }
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

/** Qty by linen code for King / Twin base (before room-type scale). */
export const SETUP_BASE_QTY = Object.freeze({
  KING: { FS: 1, FSH: 1, DP: 1, PB: 4, BT: 2, HT: 2, FT: 2, BM: 1, CUR: 1 },
  TWIN: { FS: 2, FSH: 2, DP: 2, PB: 4, BT: 2, HT: 2, FT: 2, BM: 1, CUR: 1 }
});

export const SETUP_TYPE_MULT = Object.freeze({
  Superior: 1,
  Deluxe: 1,
  Club: 1.5,
  Suite: 2
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
