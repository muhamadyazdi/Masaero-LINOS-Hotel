import {
  DEFAULT_ROOMS_PER_AGENT,
  DEMO_STAFF_PROFILE,
  ROLES,
  newId,
  nowIso,
  sumStandardPieces
} from "./model.mjs";

export const DEMO_DISCLAIMER =
  "Synthetic demonstration workspace. Room counts, floors, linen standards, and stock quantities are approximate demo data only and must not be treated as official hotel inventory.";

export const PROPERTY_POSITIONING = "Hotel linen operations workspace powered by Masaero LINOS Hotel.";

/** Starter workspace room mix — totals 561 rooms. */
export const DEMO_ROOM_PLAN = Object.freeze({
  total: 561,
  families: {
    Superior: 280,
    Deluxe: 168,
    "Premier Deluxe": 45,
    Club: 50,
    Suite: 16,
    Presidential: 2
  },
  // Superior lower → Deluxe → Premier Deluxe → Club (~29–30) → Suites/Presidential at top
  floors: [
    { family: "Superior", floors: range(5, 18), perFloor: 20 }, // 14×20=280
    { family: "Deluxe", floors: range(19, 26), perFloor: 21 }, // 8×21=168
    { family: "Premier Deluxe", floors: [27], perFloor: 23 },
    { family: "Premier Deluxe", floors: [28], perFloor: 22 },
    { family: "Club", floors: [29, 30], perFloor: 25 }, // 50
    { family: "Suite", floors: [31], perFloor: 16 },
    { family: "Presidential", floors: [32], perFloor: 2 }
  ]
});

/** Floor bands for 35 housekeepers + 4 supervisors. Housekeepers receive one initial floor within each band. */
export const DEMO_STAFF_BANDS = Object.freeze([
  { code: "A", label: "Superior low", floors: range(5, 11), supervisorEmail: "supervisor@linos.hotel", hkFrom: 1, hkTo: 9 },
  { code: "B", label: "Superior mid", floors: range(12, 18), supervisorEmail: "supervisor2@linos.hotel", hkFrom: 10, hkTo: 18 },
  { code: "C", label: "Deluxe", floors: range(19, 26), supervisorEmail: "supervisor3@linos.hotel", hkFrom: 19, hkTo: 29 },
  { code: "D", label: "Upper", floors: range(27, 32), supervisorEmail: "supervisor4@linos.hotel", hkFrom: 30, hkTo: 35 }
]);

function range(from, to) {
  const out = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
}

function wipeAll(store) {
  for (const name of Object.keys(store.raw)) store.raw[name].length = 0;
}

function hotelLocationModelOk(store, propertyId) {
  const property = store.find("properties", (p) => p.id === propertyId);
  if (!property || property.location_model !== "hotel_room_store_laundry") return false;
  if (store.raw.stations?.length) return false;
  const rooms = store.list("rooms", (r) => r.property_id === propertyId);
  const stores = store.list("stores", (s) => s.property_id === propertyId);
  return rooms.length === DEMO_ROOM_PLAN.total && stores.length > 0 && rooms.every((r) => !r.station_id);
}

function hkEmail(n) {
  if (n === 1) return "agent1@linos.hotel";
  if (n === 2) return "agent2@linos.hotel";
  return `hk${String(n).padStart(2, "0")}@linos.hotel`;
}

function hkDisplayName(n) {
  return `Housekeeper ${String(n).padStart(2, "0")}`;
}

function supervisorDisplayName(band) {
  if (band.code === "A") return "Supervisor A (Lead)";
  return `Supervisor ${band.code}`;
}

/** Build cold-seed + upsert staff definition (35 HK + 4 SV). */
export function demoStaffDefinition(bootstrapEmail = "muhamadyazdi@gmail.com") {
  const staff = [
    {
      email: bootstrapEmail,
      display_name: "Platform Superadmin",
      role_name: ROLES.SUPERADMIN,
      is_superadmin: true,
      is_admin: true,
      band: null
    },
    { email: "porter@linos.hotel", display_name: "Porter", role_name: ROLES.PORTER, band: null },
    { email: "store@linos.hotel", display_name: "Store Agent", role_name: ROLES.STORE_AGENT, band: null }
  ];

  for (const band of DEMO_STAFF_BANDS) {
    staff.push({
      email: band.supervisorEmail,
      display_name: supervisorDisplayName(band),
      role_name: ROLES.STATION_SUPERVISOR,
      is_admin: band.code === "A",
      band: band.code,
      floors: band.floors
    });
    for (let n = band.hkFrom; n <= band.hkTo; n += 1) {
      const initialFloor = band.floors[(n - band.hkFrom) % band.floors.length] || band.floors[0];
      staff.push({
        email: hkEmail(n),
        display_name: hkDisplayName(n),
        role_name: ROLES.STATION_AGENT,
        band: band.code,
        floors: [initialFloor],
        hk_number: n
      });
    }
  }
  return staff;
}

export function ensureDemoStaffRoster(store, propertyId, { bootstrapEmail = "muhamadyazdi@gmail.com" } = {}) {
  const property = store.find("properties", (p) => p.id === propertyId);
  if (!property) return { ok: false, reason: "no_property" };

  const definition = demoStaffDefinition(bootstrapEmail);
  const profileMatches = property.demo_staff_profile === DEMO_STAFF_PROFILE;
  const upserted = [];
  for (const def of definition) {
    const email = def.email.toLowerCase();
    let user = store.find("users", (u) => u.email === email && u.property_id === propertyId);
    if (!user) {
      user = store.insert("users", {
        id: newId("user"),
        property_id: propertyId,
        email,
        display_name: def.display_name,
        role_name: def.role_name,
        is_active: true,
        is_admin: Boolean(def.is_admin),
        is_superadmin: Boolean(def.is_superadmin),
        password_hash: null,
        staff_band: def.band || null,
        hk_number: def.hk_number || null
      });
    } else {
      user = store.update("users", user.id, {
        display_name: def.display_name,
        role_name: def.role_name,
        is_active: true,
        is_admin: Boolean(def.is_admin),
        is_superadmin: Boolean(def.is_superadmin),
        staff_band: def.band || null,
        hk_number: def.hk_number || null
      });
    }
    upserted.push(user);
  }

  // Full band rebuild only on profile bump; otherwise preserve supervisor-edited default floors.
  if (!profileMatches) {
    store.remove(
      "user_floor_assignments",
      (a) =>
        a.property_id === propertyId &&
        [ROLES.STATION_AGENT, ROLES.STATION_SUPERVISOR].includes(a.role_name)
    );
    for (const def of definition) {
      if (!def.floors?.length) continue;
      const user = store.find("users", (u) => u.email === def.email.toLowerCase() && u.property_id === propertyId);
      if (!user) continue;
      for (const floor of def.floors) {
        store.insert("user_floor_assignments", {
          id: newId("ufa"),
          user_id: user.id,
          property_id: propertyId,
          floor_number: floor,
          role_name: user.role_name
        });
      }
    }
    store.update("properties", propertyId, {
      demo_staff_profile: DEMO_STAFF_PROFILE,
      updated_at: nowIso()
    });
  } else {
    // Seed defaults only for staff who still have no floor rows (e.g. newly added HK).
    for (const def of definition) {
      if (!def.floors?.length) continue;
      const user = store.find("users", (u) => u.email === def.email.toLowerCase() && u.property_id === propertyId);
      if (!user) continue;
      const existing = store.list("user_floor_assignments", (a) => a.user_id === user.id);
      if (existing.length) continue;
      for (const floor of def.floors) {
        store.insert("user_floor_assignments", {
          id: newId("ufa"),
          user_id: user.id,
          property_id: propertyId,
          floor_number: floor,
          role_name: user.role_name
        });
      }
    }
  }

  const housekeepers = upserted.filter((u) => u.role_name === ROLES.STATION_AGENT);
  const supervisors = upserted.filter((u) => u.role_name === ROLES.STATION_SUPERVISOR);
  return {
    ok: true,
    housekeepers: housekeepers.length,
    supervisors: supervisors.length,
    profile: DEMO_STAFF_PROFILE,
    floors_rebuilt: !profileMatches
  };
}

const EXTRA_KIT_DEFS = Object.freeze([
  {
    code: "EXTRA_BED",
    name: "Extra bed",
    default_reason_code: "ExtraBed",
    sort_order: 10,
    lines: [
      ["FS", 1],
      ["FSH", 1],
      ["DP", 1],
      ["PB", 2],
      ["BT", 1],
      ["HT", 1],
      ["FT", 1],
      ["BM", 1]
    ]
  },
  { code: "PILLOW", name: "Extra pillow", default_reason_code: "ExtraPillow", sort_order: 20, lines: [["PB", 1]] },
  {
    code: "TOWEL_BATH",
    name: "Extra bath towel",
    default_reason_code: "ExtraTowel",
    sort_order: 30,
    lines: [["BT", 1]]
  },
  {
    code: "TOWEL_HAND",
    name: "Extra hand towel",
    default_reason_code: "ExtraTowel",
    sort_order: 40,
    lines: [["HT", 1]]
  },
  {
    code: "TOWEL_FACE",
    name: "Extra face towel",
    default_reason_code: "ExtraTowel",
    sort_order: 50,
    lines: [["FT", 1]]
  }
]);

export function ensureExtraKits(store, propertyId) {
  const items = store.list("linen_items", (i) => i.property_id === propertyId);
  const byCode = Object.fromEntries(items.map((i) => [i.code, i]));
  let created = 0;
  for (const def of EXTRA_KIT_DEFS) {
    let kit = store.find("extra_kits", (k) => k.property_id === propertyId && k.code === def.code);
    if (!kit) {
      kit = store.insert("extra_kits", {
        id: newId("kit"),
        property_id: propertyId,
        code: def.code,
        name: def.name,
        default_reason_code: def.default_reason_code,
        is_active: true,
        sort_order: def.sort_order
      });
      created += 1;
    } else {
      store.update("extra_kits", kit.id, {
        name: def.name,
        default_reason_code: def.default_reason_code,
        is_active: true,
        sort_order: def.sort_order
      });
    }
    store.remove("extra_kit_lines", (l) => l.kit_id === kit.id);
    for (const [code, qty] of def.lines) {
      const item = byCode[code];
      if (!item) continue;
      store.insert("extra_kit_lines", {
        id: newId("ekl"),
        kit_id: kit.id,
        linen_item_id: item.id,
        quantity: qty
      });
    }
  }
  return { ok: true, kits: EXTRA_KIT_DEFS.length, created };
}

/** Ensure InstalledInRoom opening balances equal fitted qty when missing. */
export function ensureInstalledInRoomBalances(store, propertyId) {
  const rooms = store.list("rooms", (r) => r.property_id === propertyId && r.is_active);
  const standards = store.list("room_linen_standards", (s) => s.property_id === propertyId);
  const requirements = store.list("room_linen_requirements", (r) => r.property_id === propertyId);
  let credited = 0;

  for (const room of rooms) {
    const stdForRoom = standards.filter(
      (s) => s.category_id === room.category_id && s.bed_config_id === room.bed_config_id
    );
    const ovByItem = new Map(
      requirements.filter((r) => r.room_id === room.id).map((r) => [r.linen_item_id, r])
    );
    const fitted = [];
    for (const std of stdForRoom) {
      const ov = ovByItem.get(std.linen_item_id);
      if (ov) {
        if (ov.included && Number(ov.quantity || 0) > 0) {
          fitted.push({ linen_item_id: std.linen_item_id, quantity: Number(ov.quantity) });
        }
      } else if (Number(std.quantity || 0) > 0) {
        fitted.push({ linen_item_id: std.linen_item_id, quantity: Number(std.quantity) });
      }
    }
    for (const [linenItemId, ov] of ovByItem) {
      if (fitted.some((f) => f.linen_item_id === linenItemId)) continue;
      if (ov.included && Number(ov.quantity || 0) > 0) {
        fitted.push({ linen_item_id: linenItemId, quantity: Number(ov.quantity) });
      }
    }

    for (const line of fitted) {
      const existing = store.find(
        "stock_balances",
        (s) =>
          s.property_id === propertyId &&
          s.room_id === room.id &&
          s.linen_item_id === line.linen_item_id &&
          s.bucket === "InstalledInRoom"
      );
      if (existing) continue;
      store.adjustStock({
        property_id: propertyId,
        linen_item_id: line.linen_item_id,
        bucket: "InstalledInRoom",
        room_id: room.id,
        delta: line.quantity
      });
      credited += 1;
    }
  }
  return { ok: true, balances_created: credited };
}

export function seedDemoProperty(store, { bootstrapEmail = "muhamadyazdi@gmail.com" } = {}) {
  const existing = store.find("properties", (p) => ["MASAERO-LINOS", "SP-DEMO"].includes(p.code));
  if (existing) {
    if (hotelLocationModelOk(store, existing.id)) {
      store.update("properties", existing.id, {
        is_demo: true,
        demo_disclaimer: DEMO_DISCLAIMER,
        subscription_plan: "demo",
        subscription_status: "active",
        property_kind: "hotel",
        property_scale: "large",
        features_json: {
          owner_mode: false,
          team_mode: true,
          floor_mode: true,
          custody_mode: true,
          laundry_partner: true
        }
      });
      ensureDemoStaffRoster(store, existing.id, { bootstrapEmail });
      ensureExtraKits(store, existing.id);
      ensureInstalledInRoomBalances(store, existing.id);
      return hydrateDemoRefs(store, existing.id);
    }
    wipeAll(store);
  }

  const propertyId = newId("prop");
  store.insert("properties", {
    id: propertyId,
    code: "MASAERO-LINOS",
    name: "Masaero LINOS Hotel",
    timezone: "Asia/Kuala_Lumpur",
    is_demo: true,
    demo_disclaimer: DEMO_DISCLAIMER,
    positioning: PROPERTY_POSITIONING,
    star_rating: 5,
    address_line: "Jalan Putra, Kuala Lumpur",
    allow_guest_pii_import: false,
    photo_retention_days: 365,
    location_model: "hotel_room_store_laundry",
    subscription_plan: "demo",
    subscription_status: "active",
    demo_staff_profile: DEMO_STAFF_PROFILE,
    property_kind: "hotel",
    property_scale: "large",
    features_json: {
      owner_mode: false,
      team_mode: true,
      floor_mode: true,
      custody_mode: true,
      laundry_partner: true
    }
  });

  const storeLoc = store.insert("stores", {
    id: newId("str"),
    property_id: propertyId,
    code: "MAIN",
    name: "Main Linen Store",
    is_active: true
  });

  const laundry = store.insert("laundry_providers", {
    id: newId("lp"),
    property_id: propertyId,
    code: "MAIN",
    name: "Laundry Partner",
    standard_turnaround_hours: 24,
    express_turnaround_hours: 8,
    is_active: true,
    partner_type: "in_house",
    external_ref: null,
    config_json: {}
  });

  // Future-capable amenity / non-room locations (not Phase 1 room-linen workflow)
  const amenityStubs = [
    ["CLUB-LOUNGE", "Club Lounge", "club_lounge", 30, true],
    ["FB-1", "Restaurant / Lounge / Café", "fb", null, false],
    ["FB-2", "Second F&B outlet", "fb", null, false],
    ["FB-3", "Café", "fb", null, false],
    ["SPA", "Teratak Spa", "spa", null, false],
    ["POOL", "Outdoor & kids pool", "pool", null, false],
    ["GYM", "Gym", "gym", null, false],
    ["BALLROOM", "Pacific Ballroom / meeting space", "banquet", null, false],
    ["GUEST-LAUNDRY", "Guest dry cleaning / laundry service (note)", "guest_service", null, false]
  ];
  for (const [code, name, kind, floor_number, is_active] of amenityStubs) {
    store.insert("amenity_locations", {
      id: newId("amn"),
      property_id: propertyId,
      code,
      name,
      kind,
      floor_number,
      is_active,
      notes:
        kind === "guest_service"
          ? "Guest-facing dry cleaning/laundry — separate from soiled linen → store → laundry custody."
          : "Future-capable location stub; not included in Phase 1 room linen rounds."
    });
  }

  const categories = [
    ["SUP", "Superior", "Superior"],
    ["DLX", "Deluxe", "Deluxe"],
    ["PDX", "Premier Deluxe", "Premier Deluxe"],
    ["CLB", "Club", "Club"],
    ["STE", "Suite", "Suite"],
    ["PRS", "Presidential", "Presidential"]
  ].map(([code, name, family]) =>
    store.insert("room_categories", {
      id: newId("cat"),
      property_id: propertyId,
      code,
      name,
      family
    })
  );
  const catByFamily = Object.fromEntries(categories.map((c) => [c.family, c]));

  const beds = [
    ["KING", "King"],
    ["TWIN", "Twin"]
  ].map(([code, name]) =>
    store.insert("bed_configs", {
      id: newId("bed"),
      property_id: propertyId,
      code,
      name
    })
  );
  const king = beds.find((b) => b.code === "KING");
  const twin = beds.find((b) => b.code === "TWIN");

  const linenDefs = [
    ["FS", "Fitted Sheet", 10],
    ["FSH", "Flat Sheet", 20],
    ["DP", "Duvet Cover", 30],
    ["PB", "Pillowcase", 40],
    ["BT", "Bath Towel", 50],
    ["HT", "Hand Towel", 60],
    ["FT", "Face Towel", 70],
    ["BM", "Bath Mat", 80],
    ["BR", "Bathrobe", 90],
    ["SL", "Slippers (pair)", 100],
    // Soft furnishings included in the starter catalogue.
    ["CUR", "Curtains (set)", 110],
    ["SHR", "Sheer Curtains (set)", 120],
    ["BLK", "Blackout Curtains (set)", 130],
    ["RUN", "Bed Runner", 140],
    ["CC", "Cushion Cover", 150]
  ].map(([code, name, sort_order]) =>
    store.insert("linen_items", {
      id: newId("lin"),
      property_id: propertyId,
      code,
      name,
      unit: "piece",
      sort_order,
      is_active: true
    })
  );

  const baseKing = {
    FS: 1,
    FSH: 1,
    DP: 1,
    PB: 4,
    BT: 2,
    HT: 2,
    FT: 2,
    BM: 1,
    BR: 0,
    SL: 0,
    CUR: 1,
    SHR: 1,
    BLK: 1,
    RUN: 1,
    CC: 2
  };
  const baseTwin = {
    FS: 2,
    FSH: 2,
    DP: 2,
    PB: 4,
    BT: 2,
    HT: 2,
    FT: 2,
    BM: 1,
    BR: 0,
    SL: 0,
    CUR: 1,
    SHR: 1,
    BLK: 1,
    RUN: 1,
    CC: 2
  };
  const multipliers = {
    Superior: 1,
    Deluxe: 1,
    "Premier Deluxe": 1.25,
    Club: 1.5,
    Suite: 2,
    Presidential: 3
  };
  const robeFamilies = new Set(["Club", "Suite", "Presidential"]);
  const curtainPackage = {
    Superior: { CUR: 1, SHR: 1, BLK: 1, RUN: 1, CC: 2 },
    Deluxe: { CUR: 1, SHR: 1, BLK: 1, RUN: 1, CC: 2 },
    "Premier Deluxe": { CUR: 1, SHR: 1, BLK: 1, RUN: 1, CC: 3 },
    Club: { CUR: 2, SHR: 2, BLK: 2, RUN: 1, CC: 4 },
    Suite: { CUR: 3, SHR: 2, BLK: 2, RUN: 2, CC: 6 },
    Presidential: { CUR: 4, SHR: 3, BLK: 3, RUN: 2, CC: 8 }
  };
  const furnishingCodes = new Set(["CUR", "SHR", "BLK", "RUN", "CC"]);

  for (const category of categories) {
    for (const bed of beds) {
      if (category.family === "Presidential" && bed.code === "TWIN") continue;
      const matrix = bed.code === "TWIN" ? { ...baseTwin } : { ...baseKing };
      Object.assign(matrix, curtainPackage[category.family] || curtainPackage.Superior);
      const mult = multipliers[category.family] || 1;
      for (const item of linenDefs) {
        let qty = matrix[item.code] || 0;
        if ((item.code === "BR" || item.code === "SL") && robeFamilies.has(category.family)) {
          qty = bed.code === "TWIN" ? 2 : category.family === "Presidential" ? 4 : 2;
        }
        if (!qty) continue;
        const scaleLinen = furnishingCodes.has(item.code) || item.code === "BR" || item.code === "SL";
        store.insert("room_linen_standards", {
          id: newId("rls"),
          property_id: propertyId,
          category_id: category.id,
          bed_config_id: bed.id,
          linen_item_id: item.id,
          quantity: scaleLinen ? qty : Math.ceil(qty * mult)
        });
      }
    }
  }

  for (const item of linenDefs) {
    store.adjustStock({
      property_id: propertyId,
      linen_item_id: item.id,
      bucket: "CleanAtStore",
      store_id: storeLoc.id,
      delta: 2000
    });
  }

  [
    ["MISSING", "Missing linen", true, true],
    ["DAMAGED", "Damaged linen", true, true],
    ["STAINED", "Abnormally stained", true, false],
    ["OTHER", "Other discrepancy", false, false]
  ].forEach(([code, name, requires_evidence, guest_claim_eligible]) => {
    store.insert("exception_categories", {
      id: newId("exc"),
      property_id: propertyId,
      code,
      name,
      requires_evidence,
      guest_claim_eligible
    });
  });

  [
    ["CHECKOUT", "Checkout change", "checkout", 10],
    ["STAYOVER", "Stayover change day", "stayover", 20],
    ["VIP", "VIP request", "vip", 5],
    ["SPECIAL", "Special instruction", "special", 15]
  ].forEach(([code, name, task_reason, priority]) => {
    store.insert("scheduling_rules", {
      id: newId("rule"),
      property_id: propertyId,
      code,
      name,
      task_reason,
      priority,
      is_active: true
    });
  });

  const floorSet = new Set();
  const createdRooms = [];
  const familyCounts = {};

  for (const block of DEMO_ROOM_PLAN.floors) {
    const category = catByFamily[block.family];
    for (const floor of block.floors) {
      floorSet.add(floor);
      for (let n = 1; n <= block.perFloor; n += 1) {
        const roomNumber = `${floor}${String(n).padStart(2, "0")}`;
        let bed = n % 2 === 0 ? twin : king;
        if (block.family === "Presidential") bed = king;
        const suiteNames =
          block.family === "Presidential"
            ? n === 1
              ? "Seri Indah"
              : "Seri Layang"
            : null;
        const room = store.insert("rooms", {
          id: newId("room"),
          property_id: propertyId,
          room_number: roomNumber,
          floor_number: floor,
          category_id: category.id,
          bed_config_id: bed.id,
          is_active: true,
          special_notes: suiteNames || (n === 1 ? "Near lift — quieter service if possible" : null),
          amenities_notes: "Daily housekeeping. Bathrobes/slippers for Club/Suite/Presidential standards."
        });
        createdRooms.push(room);
        familyCounts[block.family] = (familyCounts[block.family] || 0) + 1;

        const standards = store.list(
          "room_linen_standards",
          (s) => s.category_id === category.id && s.bed_config_id === bed.id
        );
        for (const standard of standards) {
          const fittedQty = Number(standard.quantity || 0);
          const par = fittedQty * 2;
          store.insert("room_par_levels", {
            id: newId("par"),
            room_id: room.id,
            linen_item_id: standard.linen_item_id,
            par_quantity: par
          });
          store.adjustStock({
            property_id: propertyId,
            linen_item_id: standard.linen_item_id,
            bucket: "CleanAtRoom",
            room_id: room.id,
            delta: par
          });
          if (fittedQty > 0) {
            store.adjustStock({
              property_id: propertyId,
              linen_item_id: standard.linen_item_id,
              bucket: "InstalledInRoom",
              room_id: room.id,
              delta: fittedQty
            });
          }
        }
      }
    }
  }

  const staffResult = ensureDemoStaffRoster(store, propertyId, { bootstrapEmail });
  const kitsResult = ensureExtraKits(store, propertyId);
  const bootstrapUser = store.find("users", (u) => u.email === bootstrapEmail.toLowerCase());

  store.insert("audit_events", {
    id: newId("aud"),
    property_id: propertyId,
    actor_id: bootstrapUser?.id || null,
    actor_email: bootstrapEmail.toLowerCase(),
    action: "seed.demo",
    entity_type: "property",
    entity_id: propertyId,
    details: {
      disclaimer: DEMO_DISCLAIMER,
      positioning: PROPERTY_POSITIONING,
      rooms: createdRooms.length,
      family_counts: familyCounts,
      floor_range: `${Math.min(...floorSet)}–${Math.max(...floorSet)}`,
      stores: 1,
      laundry_providers: 1,
      location_model: "hotel_room_store_laundry",
      store_id: storeLoc.id,
      laundry_provider_id: laundry.id,
      planning_default: DEFAULT_ROOMS_PER_AGENT,
      housekeepers: staffResult.housekeepers,
      supervisors: staffResult.supervisors,
      staff_bands: DEMO_STAFF_BANDS.map((b) => ({
        code: b.code,
        floors: `${b.floors[0]}–${b.floors[b.floors.length - 1]}`,
        hk: `${b.hkFrom}–${b.hkTo}`
      })),
      extra_kits: kitsResult.kits,
      demo_staff_profile: DEMO_STAFF_PROFILE,
      seeded_at: nowIso()
    }
  });

  return hydrateDemoRefs(store, propertyId);
}

function hydrateDemoRefs(store, propertyId) {
  const rooms = store.list("rooms", (r) => r.property_id === propertyId);
  const standards = store.list("room_linen_standards", (s) => s.property_id === propertyId);
  const categories = store.list("room_categories", (c) => c.property_id === propertyId);
  const familyCounts = {};
  for (const room of rooms) {
    const cat = categories.find((c) => c.id === room.category_id);
    const family = cat?.family || "Unknown";
    familyCounts[family] = (familyCounts[family] || 0) + 1;
  }
  const floors = [...new Set(rooms.map((r) => r.floor_number))].sort((a, b) => a - b);
  return {
    property: store.find("properties", (p) => p.id === propertyId),
    users: store.list("users", (u) => u.property_id === propertyId),
    stores: store.list("stores", (s) => s.property_id === propertyId),
    laundryProviders: store.list("laundry_providers", (p) => p.property_id === propertyId),
    amenityLocations: store.list("amenity_locations", (a) => a.property_id === propertyId),
    rooms,
    familyCounts,
    floors,
    linenItems: store.list("linen_items", (i) => i.property_id === propertyId),
    estimatedPiecesSample: rooms.slice(0, 1).map((room) =>
      sumStandardPieces(
        standards.filter((s) => s.category_id === room.category_id && s.bed_config_id === room.bed_config_id)
      )
    )[0] || 0
  };
}
