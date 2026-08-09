import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { LinosError } from "./errors.mjs";
import {
  DEFAULT_ROOMS_PER_AGENT,
  DISPLAY_TIMEZONE,
  EXTRA_REASON_CODES,
  EXTRA_SOURCES,
  GUEST_CLAIM_STATUSES,
  MORNING_BOARD_DEFAULTS,
  OPEN_EXTRA_STATUSES,
  ROLES,
  SERVICE_OUTCOMES,
  SERVICE_OUTCOME_LABELS,
  assertNoGuestPiiHeaders,
  capabilitiesForUser,
  clampPct,
  formatDisplayDateTime,
  hasCapability,
  hashSeedString,
  newId,
  nowIso,
  parseCsv,
  roleLabel,
  seededShuffle,
  todayDateString
} from "./model.mjs";
import { seedDemoProperty } from "./seed.mjs";
import {
  buildDefaultStandardsMatrix,
  defaultFeaturesFor,
  insertStarterExceptions,
  insertStarterRules,
  isSmallScale,
  laundryOperationsLabel,
  linenMatrixForCategoryBed,
  normalizeFeatures,
  normalizeLaundryPartnerType,
  normalizePropertyKind,
  normalizePropertyScale,
  opsDefaultsForScale,
  parseFeaturesJson,
  planBulkRooms,
  planSimpleRooms,
  setupStaffEmail,
  singleFloorDefaults,
  slugCode,
  spaceLabel,
  splitFloorsAcrossStaff,
  startersForKind
} from "./hotelSetup.mjs";

export class HotelService {
  constructor(store) {
    this.store = store;
  }

  ensureDemo() {
    if (this.store.list("properties", () => true).length) return { ok: true, existing: true };
    return seedDemoProperty(this.store, {
      bootstrapEmail: process.env.LINOS_BOOTSTRAP_ADMIN_EMAILS?.split(",")[0]?.trim() || "muhamadyazdi@gmail.com"
    });
  }

  hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const digest = scryptSync(String(password), salt, 32).toString("hex");
    return `${salt}:${digest}`;
  }

  passwordMatches(password, encoded) {
    if (!encoded) return true;
    const [salt, expected] = String(encoded).split(":");
    if (!salt || !expected) return false;
    const actual = scryptSync(String(password || ""), salt, 32);
    const expectedBytes = Buffer.from(expected, "hex");
    return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
  }

  resolveAccess(identity, propertyId = "") {
    this.ensureDemo();
    const email = String(identity?.email || "").toLowerCase();
    if (!email) throw new LinosError(401, "ERR-AUTH-001", "Sign in is required.");

    const user = this.store.find("users", (u) => u.email === email && u.is_active);
    if (!user) throw new LinosError(403, "ERR-AUTH-002", `No active LINOS Hotel user for ${email}.`);

    const assignments = this.store.list("user_floor_assignments", (a) => a.user_id === user.id);
    const capabilities = capabilitiesForUser(user, assignments);
    const property =
      this.store.find("properties", (p) => p.id === (propertyId || user.property_id)) ||
      this.store.find("properties", (p) => p.id === user.property_id);

    if (!property) throw new LinosError(403, "ERR-AUTH-003", "No accessible property for this user.");
    if (user.property_id && user.property_id !== property.id && !user.is_superadmin) {
      throw new LinosError(403, "ERR-AUTH-004", "You are not a member of this property.");
    }

    return { user, assignments, capabilities, property, identity };
  }

  require(access, capability) {
    if (!hasCapability(access.capabilities, capability)) {
      throw new LinosError(403, "ERR-AUTHZ-001", `Missing capability: ${capability}`);
    }
  }

  audit(access, action, entity_type, entity_id, details = {}) {
    return this.store.insert("audit_events", {
      id: newId("aud"),
      property_id: access.property.id,
      actor_id: access.user.id,
      actor_email: access.user.email,
      action,
      entity_type,
      entity_id,
      details
    });
  }

  withIdempotency(idempotencyKey, access, fn) {
    if (!idempotencyKey) return fn();
    const existing = this.store.find("idempotency_keys", (row) => row.key === idempotencyKey);
    if (existing) return existing.response_json;
    const result = fn();
    this.store.insert("idempotency_keys", {
      id: idempotencyKey,
      key: idempotencyKey,
      property_id: access.property.id,
      actor_id: access.user.id,
      response_json: result
    });
    return result;
  }

  publicUser(user) {
    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role_name: user.role_name,
      role_label: roleLabel(user.role_name),
      is_admin: user.is_admin,
      is_superadmin: user.is_superadmin,
      property_id: user.property_id,
      staff_band: user.staff_band || null,
      hk_number: user.hk_number ?? null
    };
  }

  defaultFloorsForUser(userId) {
    return this.store
      .list("user_floor_assignments", (a) => a.user_id === userId)
      .map((a) => Number(a.floor_number))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  requireFloorAssignmentEdit(access) {
    if (
      !hasCapability(access.capabilities, "admin.assignments") &&
      !hasCapability(access.capabilities, "task.assign")
    ) {
      throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: admin.assignments");
    }
  }

  listHousekeeperDefaultFloors(identity, propertyId) {
    const access = this.resolveAccess(identity, propertyId);
    this.requireFloorAssignmentEdit(access);
    const floors = [
      ...new Set(
        this.store
          .list("rooms", (r) => r.property_id === access.property.id && r.is_active)
          .map((r) => r.floor_number)
      )
    ].sort((a, b) => a - b);
    const housekeepers = this.store
      .list(
        "users",
        (u) => u.property_id === access.property.id && u.role_name === ROLES.STATION_AGENT && u.is_active
      )
      .map((u) => ({
        ...this.publicUser(u),
        default_floors: this.defaultFloorsForUser(u.id)
      }))
      .sort(
        (a, b) =>
          (a.hk_number ?? 999) - (b.hk_number ?? 999) ||
          String(a.display_name).localeCompare(String(b.display_name))
      );
    return { ok: true, floors, housekeepers };
  }

  updateHousekeeperDefaultFloors(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.requireFloorAssignmentEdit(access);
    return this.withIdempotency(idempotencyKey, access, () => {
      const user = this.store.find(
        "users",
        (u) =>
          u.id === body.user_id &&
          u.property_id === access.property.id &&
          u.role_name === ROLES.STATION_AGENT &&
          u.is_active
      );
      if (!user) throw new LinosError(404, "ERR-USER-404", "Housekeeper not found.");

      const rawFloors = Array.isArray(body.floors) ? body.floors : [];
      const floors = [
        ...new Set(rawFloors.map((f) => Number(f)).filter((n) => Number.isInteger(n) && n > 0))
      ].sort((a, b) => a - b);

      this.store.remove("user_floor_assignments", (a) => a.user_id === user.id);
      for (const floor_number of floors) {
        this.store.insert("user_floor_assignments", {
          id: newId("ufa"),
          user_id: user.id,
          property_id: access.property.id,
          floor_number,
          role_name: user.role_name
        });
      }

      this.audit(access, "staff.default_floors", "user", user.id, { floors });
      return {
        ok: true,
        user: { ...this.publicUser(user), default_floors: floors },
        ...this.listHousekeeperDefaultFloors(identity, propertyId)
      };
    });
  }

  publicProperty(property) {
    const trialEndsAt = property.trial_ends_at || null;
    const trialDaysRemaining = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
      : null;
    const propertyKind = normalizePropertyKind(property.property_kind);
    const propertyScale = normalizePropertyScale(
      property.property_scale || (property.is_demo ? "large" : "small")
    );
    const features = parseFeaturesJson(property.features_json, propertyScale, propertyKind);
    return {
      id: property.id,
      code: property.code,
      name: property.name,
      timezone: property.timezone,
      is_demo: property.is_demo,
      demo_disclaimer: property.demo_disclaimer,
      positioning: property.positioning || null,
      star_rating: property.star_rating || null,
      address_line: property.address_line || null,
      allow_guest_pii_import: property.allow_guest_pii_import,
      photo_retention_days: property.photo_retention_days,
      location_model: property.location_model || "hotel_room_store_laundry",
      subscription_plan: property.subscription_plan || "free",
      subscription_status: property.subscription_status || "active",
      trial_started_at: property.trial_started_at || null,
      trial_ends_at: trialEndsAt,
      trial_days_remaining: trialDaysRemaining,
      property_kind: propertyKind,
      property_scale: propertyScale,
      features,
      space_label: spaceLabel(propertyKind)
    };
  }

  propertyFeatures(property) {
    const kind = normalizePropertyKind(property?.property_kind);
    const scale = normalizePropertyScale(property?.property_scale || (property?.is_demo ? "large" : "small"));
    return parseFeaturesJson(property?.features_json, scale, kind);
  }

  authenticateLocal(email, password = "") {
    this.ensureDemo();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) throw new LinosError(400, "ERR-AUTH-010", "Email is required.");
    const user = this.store.find("users", (u) => u.email === normalizedEmail && u.is_active);
    if (!user) throw new LinosError(401, "ERR-AUTH-011", "No account was found for that email.");
    if (!this.passwordMatches(password, user.password_hash)) {
      throw new LinosError(401, "ERR-AUTH-012", "The email or password is incorrect.");
    }
    return {
      ok: true,
      token: `local:${normalizedEmail}`,
      session: this.session({ email: normalizedEmail, sub: `local:${normalizedEmail}`, source: "local-login" }, user.property_id || "")
    };
  }

  createTrialAccount(body = {}) {
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || body.name || "").trim();
    const hotelName = String(body.hotel_name || body.hotelName || "").trim();
    const password = String(body.password || "");
    const passwordConfirmation = String(body.password_confirmation || body.passwordConfirm || "");
    const propertyKind = normalizePropertyKind(body.property_kind || body.propertyKind || "hotel");
    const propertyScale = normalizePropertyScale(body.property_scale || body.propertyScale || "small");
    const features = normalizeFeatures(body.features, propertyScale, propertyKind);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new LinosError(400, "ERR-TRIAL-001", "Enter a valid work email.");
    if (displayName.length < 2) throw new LinosError(400, "ERR-TRIAL-002", "Enter your name.");
    if (hotelName.length < 2) throw new LinosError(400, "ERR-TRIAL-003", "Enter your hotel or property name.");
    if (password.length < 8) throw new LinosError(400, "ERR-TRIAL-004", "Use a password of at least 8 characters.");
    if (password !== passwordConfirmation) throw new LinosError(400, "ERR-TRIAL-005", "The passwords do not match.");
    if (this.store.find("users", (u) => u.email === email && u.is_active)) {
      throw new LinosError(409, "ERR-TRIAL-006", "An account already exists for that email.");
    }

    const baseCode = slugCode(hotelName, "HOTEL");
    let code = baseCode;
    let suffix = 2;
    while (this.store.find("properties", (p) => p.code === code)) {
      code = `${baseCode.slice(0, 20)}-${suffix}`;
      suffix += 1;
    }
    const starters = startersForKind(propertyKind);
    const property = this.store.insert("properties", {
      id: newId("prop"),
      code,
      name: hotelName,
      timezone: String(body.timezone || "Asia/Kuala_Lumpur").trim() || "Asia/Kuala_Lumpur",
      is_demo: false,
      demo_disclaimer: null,
      positioning: String(
        body.positioning || "Independent linen operations for small hotels, spas, and hospitality"
      ).trim(),
      star_rating: body.star_rating != null && body.star_rating !== "" ? Number(body.star_rating) : null,
      address_line: String(body.address_line || "").trim() || null,
      allow_guest_pii_import: false,
      photo_retention_days: 365,
      location_model: "hotel_room_store_laundry",
      subscription_plan: "free",
      subscription_status: "active",
      trial_started_at: null,
      trial_ends_at: null,
      property_kind: propertyKind,
      property_scale: propertyScale,
      features_json: features
    });
    const user = this.store.insert("users", {
      id: newId("user"),
      property_id: property.id,
      email,
      display_name: displayName,
      role_name: ROLES.SUPERADMIN,
      is_active: true,
      is_admin: true,
      is_superadmin: true,
      password_hash: this.hashPassword(password),
      staff_band: null,
      hk_number: null
    });
    const starterStore = this.store.insert("stores", {
      id: newId("str"),
      property_id: property.id,
      code: "MAIN",
      name: "Main Linen Store",
      is_active: true
    });
    this.store.insert("laundry_providers", {
      id: newId("lp"),
      property_id: property.id,
      code: "MAIN",
      name: "In-house laundry",
      standard_turnaround_hours: 24,
      express_turnaround_hours: 8,
      is_active: true,
      partner_type: "in_house",
      external_ref: null,
      config_json: {}
    });
    if (propertyKind === "spa") {
      this.store.insert("amenity_locations", {
        id: newId("amn"),
        property_id: property.id,
        code: "SPA",
        name: "Spa",
        kind: "spa",
        floor_number: null,
        is_active: true,
        notes: "Spa amenity stub for small hospitality linen ops."
      });
    }
    const categories = starters.roomTypes.map((row) =>
      this.store.insert("room_categories", {
        id: newId("cat"),
        property_id: property.id,
        code: row.code,
        name: row.name,
        family: row.family
      })
    );
    const beds = starters.beds.map((row) =>
      this.store.insert("bed_configs", {
        id: newId("bed"),
        property_id: property.id,
        code: row.code,
        name: row.name
      })
    );
    const linenItems = starters.linenItems.map((row) =>
      this.store.insert("linen_items", {
        id: newId("lin"),
        property_id: property.id,
        code: row.code,
        name: row.name,
        unit: "piece",
        sort_order: row.sort_order,
        is_active: true
      })
    );
    for (const standard of buildDefaultStandardsMatrix(categories, beds, linenItems)) {
      this.store.insert("room_linen_standards", {
        id: newId("rls"),
        property_id: property.id,
        ...standard
      });
    }
    insertStarterExceptions(this.store, property.id);
    insertStarterRules(this.store, property.id);
    this.audit(
      { property, user },
      "account.free_version_started",
      "property",
      property.id,
      {
        owner_email: email,
        plan: "free",
        store_id: starterStore.id,
        property_kind: propertyKind,
        property_scale: propertyScale
      }
    );
    return {
      ok: true,
      token: `local:${email}`,
      session: this.session({ email, sub: `local:${email}`, source: "trial-registration" }, property.id),
      property: this.publicProperty(property),
      plan: { name: "Free Version", status: "active" }
    };
  }

  submitFeedback(identity, body = {}) {
    const access = this.resolveAccess(identity, body.property_id || "");
    const message = String(body.message || "").trim();
    if (message.length < 10) throw new LinosError(400, "ERR-FEEDBACK-001", "Please enter at least 10 characters.");
    if (message.length > 5000) throw new LinosError(400, "ERR-FEEDBACK-002", "Feedback must be 5,000 characters or less.");
    const feedback = this.store.insert("feedback", {
      id: newId("fb"),
      property_id: access.property.id,
      user_id: access.user.id,
      user_email: access.user.email,
      category: String(body.category || "General").trim().slice(0, 80),
      message,
      created_at: nowIso(),
      status: "received",
      linear_issue_id: null,
      linear_issue_url: null
    });
    return { ok: true, feedback };
  }

  session(identity, propertyId) {
    const access = this.resolveAccess(identity, propertyId);
    return {
      ok: true,
      user: this.publicUser(access.user),
      property: this.publicProperty(access.property),
      capabilities: access.capabilities,
      assignments: access.assignments,
      displayTimezone: access.property.timezone || DISPLAY_TIMEZONE,
      serverTime: nowIso(),
      serverTimeLocal: formatDisplayDateTime(nowIso(), access.property.timezone)
    };
  }

  bootstrap(identity, propertyId) {
    const access = this.resolveAccess(identity, propertyId);
    return {
      ok: true,
      session: this.session(identity, propertyId),
      master: this.masterData(access),
      todayRound: this.getRoundForDate(access, todayDateString(access.property.timezone)),
      // Dashboard (esp. room linen snapshot) is large; load it after first paint via /dashboard.
      dashboard: null
    };
  }

  standardsForRoom(room) {
    return this.store.list(
      "room_linen_standards",
      (s) => s.category_id === room.category_id && s.bed_config_id === room.bed_config_id
    );
  }

  catalogueLinenForRoom(room) {
    const items = this.store
      .list("linen_items", (i) => i.property_id === room.property_id && i.is_active)
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name));
    const stdByItem = new Map(this.standardsForRoom(room).map((s) => [s.linen_item_id, s]));
    const ovByItem = new Map(
      this.store
        .list("room_linen_requirements", (r) => r.room_id === room.id)
        .map((r) => [r.linen_item_id, r])
    );
    return items.map((item) => {
      const standard = stdByItem.get(item.id);
      const override = ovByItem.get(item.id);
      const standard_quantity = Number(standard?.quantity || 0);
      let included;
      let quantity;
      if (override) {
        included = Boolean(override.included);
        quantity = Number(override.quantity || 0);
      } else {
        quantity = standard_quantity;
        included = standard_quantity > 0;
      }
      return {
        linen_item_id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit || "piece",
        quantity,
        included,
        standard_quantity,
        has_override: Boolean(override),
        override_id: override?.id || null,
        sort_order: item.sort_order ?? 100
      };
    });
  }

  estimatedPiecesForRoom(room) {
    return this.requiredLinenForRoom(room).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  requiredLinenForRoom(room) {
    return this.catalogueLinenForRoom(room)
      .filter((line) => line.included && Number(line.quantity || 0) > 0)
      .map((line) => ({
        linen_item_id: line.linen_item_id,
        code: line.code,
        name: line.name,
        unit: line.unit,
        quantity: Number(line.quantity || 0),
        sort_order: line.sort_order
      }));
  }

  masterData(access) {
    const pid = access.property.id;
    const rooms = this.store
      .list("rooms", (r) => r.property_id === pid && r.is_active)
      .sort((a, b) => a.floor_number - b.floor_number || a.room_number.localeCompare(b.room_number));
    const categories = this.store.list("room_categories", (c) => c.property_id === pid);
    const beds = this.store.list("bed_configs", (b) => b.property_id === pid);
    const familyCounts = {};
    for (const room of rooms) {
      const cat = categories.find((c) => c.id === room.category_id);
      const family = cat?.family || "Unknown";
      familyCounts[family] = (familyCounts[family] || 0) + 1;
    }
    const floors = [...new Set(rooms.map((r) => r.floor_number))].sort((a, b) => a - b);

    const roomsDetailed = rooms.map((room) => {
      const category = categories.find((c) => c.id === room.category_id);
      const bed = beds.find((b) => b.id === room.bed_config_id);
      const required_linen = this.requiredLinenForRoom(room);
      return {
        ...room,
        category,
        bed_config: bed,
        required_linen,
        required_pieces: required_linen.reduce((sum, line) => sum + line.quantity, 0)
      };
    });

    return {
      locationModel: access.property.location_model || "hotel_room_store_laundry",
      familyCounts,
      floors,
      rooms: roomsDetailed,
      roomCategories: categories,
      bedConfigs: beds,
      linenItems: this.store.list("linen_items", (i) => i.property_id === pid && i.is_active),
      roomLinenStandards: this.store.list("room_linen_standards", (s) => s.property_id === pid),
      roomLinenRequirements: this.store.list("room_linen_requirements", (r) => r.property_id === pid),
      stores: this.store.list("stores", (s) => s.property_id === pid && s.is_active),
      laundryProviders: this.store.list("laundry_providers", (p) => p.property_id === pid),
      amenityLocations: this.store.list("amenity_locations", (a) => a.property_id === pid),
      exceptionCategories: this.store.list("exception_categories", (e) => e.property_id === pid),
      extraKits: this.listExtraKits(pid),
      agents: this.store
        .list(
          "users",
          (u) => u.property_id === pid && u.role_name === ROLES.STATION_AGENT && u.is_active
        )
        .map((u) => ({ ...this.publicUser(u), default_floors: this.defaultFloorsForUser(u.id) })),
      supervisors: this.store
        .list(
          "users",
          (u) => u.property_id === pid && u.role_name === ROLES.STATION_SUPERVISOR && u.is_active
        )
        .map((u) => ({ ...this.publicUser(u), default_floors: this.defaultFloorsForUser(u.id) })),
      schedulingRules: this.store.list("scheduling_rules", (r) => r.property_id === pid && r.is_active),
      users: this.store.list("users", (u) => u.property_id === pid && u.is_active).map((u) => this.publicUser(u)),
      // Stock detail is served by operational endpoints and the dashboard snapshot.
      // Keeping the full per-room ledger out of bootstrap avoids oversized serverless responses.
    };
  }

  getRoundForDate(access, serviceDate, shift = "AM") {
    return this.store.find(
      "daily_rounds",
      (r) => r.property_id === access.property.id && r.service_date === serviceDate && r.shift === shift
    );
  }

  listTasks(roundId) {
    const round = this.store.find("daily_rounds", (r) => r.id === roundId);
    if (round) this.ensureStandingExtraLinesForRound(round);
    return this.store.list("room_tasks", (t) => t.daily_round_id === roundId).map((task) => this.enrichTask(task));
  }

  standingExtraView(request) {
    const room = this.store.find("rooms", (r) => r.id === request.room_id);
    const item = this.store.find("linen_items", (i) => i.id === request.linen_item_id);
    const kit = request.kit_id ? this.store.find("extra_kits", (k) => k.id === request.kit_id) : null;
    return {
      ...request,
      room: room ? { id: room.id, room_number: room.room_number, floor_number: room.floor_number } : null,
      item: item ? { id: item.id, code: item.code, name: item.name } : null,
      kit: kit ? { id: kit.id, code: kit.code, name: kit.name } : null
    };
  }

  ensureStandingExtraLinesForRound(round) {
    if (!round) return;
    const requests = this.store.list(
      "standing_extra_requests",
      (request) =>
        request.property_id === round.property_id &&
        request.status === "Active" &&
        String(request.start_service_date || "") <= String(round.service_date || "") &&
        (!request.stopped_service_date || String(request.stopped_service_date) >= String(round.service_date || ""))
    );
    const tasks = this.store.list("room_tasks", (task) => task.daily_round_id === round.id);
    for (const request of requests) {
      const task = tasks.find((candidate) => candidate.room_id === request.room_id);
      if (!task) continue;
      const existing = this.store.find(
        "room_task_extra_lines",
        (line) => line.room_task_id === task.id && line.standing_extra_request_id === request.id
      );
      if (existing) continue;
      this.store.insert("room_task_extra_lines", {
        id: newId("rtx"),
        property_id: round.property_id,
        room_task_id: task.id,
        room_id: request.room_id,
        daily_round_id: round.id,
        linen_item_id: request.linen_item_id,
        quantity: request.quantity,
        clean_in_qty: 0,
        soiled_out_qty: 0,
        not_changed_qty: request.quantity,
        replenishment_outcome: null,
        reason_code: request.reason_code,
        reason_note: request.reason_note,
        requested_by_user_id: request.requested_by_user_id,
        requested_source: request.requested_source,
        approved_by_user_id: null,
        status: "Requested",
        kit_id: request.kit_id,
        kit_instance_id: null,
        standing_extra_request_id: request.id
      });
    }
  }

  roomServiceState(task) {
    const occupied = Boolean(
        task &&
        task.task_reason !== "guest_extra" &&
        (["occupied_checkout", "occupied_stayover", "dnd", "no_service"].includes(task.occupancy_status) ||
          ["checkout", "stayover"].includes(task.task_reason))
    );
    const completedService = Boolean(task && ["Submitted", "Verified"].includes(task.status));
    const incompleteOutcome = [
      "partial",
      "not_changed",
      "dnd",
      "guest_declined",
      "room_unavailable",
      "other"
    ].includes(task?.service_outcome);
    const serviceRequired = Boolean(occupied && (!completedService || incompleteOutcome));
    return {
      occupied,
      service_required: serviceRequired,
      service_state: serviceRequired
        ? task?.service_outcome === "partial" && completedService
          ? "partial"
          : "soiled"
        : completedService
          ? "serviced"
          : "not_scheduled"
    };
  }

  enrichTask(task) {
    const room = this.store.find("rooms", (r) => r.id === task.room_id);
    const agent = task.assigned_agent_id
      ? this.store.find("users", (u) => u.id === task.assigned_agent_id)
      : null;
    const extra_lines = this.store
      .list("room_task_extra_lines", (l) => l.room_task_id === task.id)
      .map((line) => this.enrichExtraLine(line));
    const roomService = this.roomServiceState(task);
    return {
      ...task,
      room,
      ...roomService,
      assigned_agent: agent ? this.publicUser(agent) : null,
      linen_lines: this.store.list("room_task_linen_lines", (l) => l.room_task_id === task.id),
      extra_lines,
      standing_extras: this.store
        .list(
          "standing_extra_requests",
          (request) => request.property_id === task.property_id && request.room_id === task.room_id && request.status === "Active"
        )
        .map((request) => this.standingExtraView(request)),
      service_outcome_label: task.service_outcome ? SERVICE_OUTCOME_LABELS[task.service_outcome] || task.service_outcome : null,
      extras_open_count: extra_lines.filter((l) => OPEN_EXTRA_STATUSES.includes(l.status)).length,
      extras_installed_count: extra_lines.filter((l) => l.status === "Installed").length,
      exceptions: this.store.list("room_exceptions", (e) => e.room_task_id === task.id),
      evidence: this.store
        .list("evidence", (e) => e.room_task_id === task.id && e.status === "Active")
        .map((e) => this.publicEvidence(e)),
      overdue: this.isTaskOverdue(task)
    };
  }

  enrichExtraLine(line) {
    const item = this.store.find("linen_items", (i) => i.id === line.linen_item_id);
    const kit = line.kit_id ? this.store.find("extra_kits", (k) => k.id === line.kit_id) : null;
    return {
      ...line,
      item: item ? { id: item.id, code: item.code, name: item.name } : null,
      kit: kit ? { id: kit.id, code: kit.code, name: kit.name } : null,
      standing_request: line.standing_extra_request_id
        ? this.store.find("standing_extra_requests", (request) => request.id === line.standing_extra_request_id)
        : null
    };
  }

  listExtraKits(propertyId) {
    return this.store
      .list("extra_kits", (k) => k.property_id === propertyId && k.is_active)
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100))
      .map((kit) => ({
        ...kit,
        lines: this.store.list("extra_kit_lines", (l) => l.kit_id === kit.id).map((line) => ({
          ...line,
          item: this.store.find("linen_items", (i) => i.id === line.linen_item_id)
        }))
      }));
  }

  isTaskOverdue(task) {
    if (["Verified", "Skipped"].includes(task.status)) return false;
    if (!task.assigned_at) return false;
    return Date.now() - new Date(task.assigned_at).getTime() > 8 * 60 * 60 * 1000;
  }

  publicEvidence(row) {
    return {
      id: row.id,
      room_task_id: row.room_task_id,
      room_exception_id: row.room_exception_id,
      file_name: row.file_name,
      content_type: row.content_type,
      byte_size: row.byte_size,
      status: row.status,
      captured_at: row.captured_at,
      uploaded_by: row.uploaded_by,
      has_data: Boolean(row.data_base64)
    };
  }

  createOrUpdateRound(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "round.create");
    return this.withIdempotency(idempotencyKey, access, () => {
      const serviceDate = body.service_date || todayDateString(access.property.timezone);
      const shift = body.shift || "AM";
      let round = this.getRoundForDate(access, serviceDate, shift);
      if (!round) {
        round = this.store.insert("daily_rounds", {
          id: newId("rnd"),
          property_id: access.property.id,
          service_date: serviceDate,
          shift,
          status: "Draft",
          planning_rooms_per_agent: Number(body.planning_rooms_per_agent || DEFAULT_ROOMS_PER_AGENT),
          created_by: access.user.id,
          notes: body.notes || null,
          version: 1
        });
        this.audit(access, "round.create", "daily_round", round.id, { serviceDate, shift });
      }
      return { ok: true, round, tasks: this.listTasks(round.id) };
    });
  }

  importRoundCsv(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "round.create");
    return this.withIdempotency(idempotencyKey, access, () => {
      const { headers, records } = parseCsv(body.csv_text || "");
      try {
        assertNoGuestPiiHeaders(headers, access.property.allow_guest_pii_import);
      } catch (error) {
        throw new LinosError(400, "ERR-CSV-PII", error.message);
      }
      if (!records.length) throw new LinosError(400, "ERR-CSV-001", "CSV contained no room rows.");

      const created = this.createOrUpdateRound(identity, propertyId, {
        service_date: body.service_date,
        shift: body.shift
      });
      const round = created.round;
      if (!["Draft", "Released"].includes(round.status)) {
        throw new LinosError(409, "ERR-ROUND-001", "Only Draft or Released rounds accept imports.");
      }

      const rooms = this.store.list("rooms", (r) => r.property_id === access.property.id && r.is_active);
      const byNumber = new Map(rooms.map((r) => [r.room_number, r]));
      const added = [];
      const skipped = [];

      for (const record of records) {
        const roomNumber = String(record.room_number || record.room || "").trim();
        const room = byNumber.get(roomNumber);
        if (!room) {
          skipped.push({ room_number: roomNumber, reason: "unknown_room" });
          continue;
        }
        const existing = this.store.find(
          "room_tasks",
          (t) => t.daily_round_id === round.id && t.room_id === room.id
        );
        if (existing) {
          skipped.push({ room_number: roomNumber, reason: "already_on_round" });
          continue;
        }
        added.push(
          this.insertRoomTask(access, round, room, {
            task_reason: record.task_reason || record.reason || "checkout",
            priority: Number(record.priority || 100),
            special_instructions: record.special_instructions || record.notes || null,
            occupancy_status: record.occupancy_status || record.occupancy || null
          })
        );
      }

      this.audit(access, "round.import_csv", "daily_round", round.id, {
        added: added.length,
        skipped: skipped.length
      });
      return { ok: true, round, added: added.length, skipped, tasks: this.listTasks(round.id) };
    });
  }

  addRoomsToRound(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "round.create");
    return this.withIdempotency(idempotencyKey, access, () => {
      const created = this.createOrUpdateRound(identity, propertyId, body);
      const round = created.round;
      const roomIds = Array.isArray(body.room_ids) ? body.room_ids : [];
      if (!roomIds.length) throw new LinosError(400, "ERR-ROUND-002", "Select at least one room.");
      let added = 0;
      for (const roomId of roomIds) {
        const room = this.store.find("rooms", (r) => r.id === roomId && r.property_id === access.property.id);
        if (!room) continue;
        const existing = this.store.find(
          "room_tasks",
          (t) => t.daily_round_id === round.id && t.room_id === room.id
        );
        if (existing) continue;
        this.insertRoomTask(access, round, room, {
          task_reason: body.task_reason || "special",
          priority: Number(body.priority || 100),
          special_instructions: body.special_instructions || null,
          occupancy_status: body.occupancy_status || null
        });
        added += 1;
      }
      this.audit(access, "round.add_rooms", "daily_round", round.id, { added });
      return { ok: true, round, added, tasks: this.listTasks(round.id) };
    });
  }

  generateFromRules(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "round.create");
    return this.withIdempotency(idempotencyKey, access, () => {
      const created = this.createOrUpdateRound(identity, propertyId, body);
      const round = created.round;
      const ruleCode = body.rule_code || "STAYOVER";
      const rule = this.store.find(
        "scheduling_rules",
        (r) => r.property_id === access.property.id && r.code === ruleCode && r.is_active
      );
      if (!rule) throw new LinosError(400, "ERR-RULE-001", "Unknown scheduling rule.");

      const rooms = this.store.list("rooms", (r) => r.property_id === access.property.id && r.is_active);
      // Legacy demo generator: limited pattern sample (prefer /rounds/generate-morning)
      const selected = rooms.filter((room) => {
        const num = Number(String(room.room_number).slice(-2));
        if (rule.task_reason === "checkout") return num % 3 === 0 && room.floor_number <= 10;
        if (rule.task_reason === "vip") return num === 1 && [15, 20, 29, 31].includes(room.floor_number);
        return num % 2 === 0 && room.floor_number >= 5 && room.floor_number <= 8;
      });

      let added = 0;
      for (const room of selected) {
        const existing = this.store.find(
          "room_tasks",
          (t) => t.daily_round_id === round.id && t.room_id === room.id
        );
        if (existing) continue;
        this.insertRoomTask(access, round, room, {
          task_reason: rule.task_reason,
          priority: rule.priority,
          special_instructions: `Generated by rule ${rule.code}`
        });
        added += 1;
      }
      this.audit(access, "round.generate_rules", "daily_round", round.id, { rule: rule.code, added });
      return { ok: true, round, added, tasks: this.listTasks(round.id) };
    });
  }

  /**
   * Morning Board generator: every occupied room gets a linen-change task.
   * Vacant rooms are excluded. Checkout % only labels checkout vs stayover.
   * DND / no-service are rare Skipped exceptions on the board.
   */
  generateMorningBoard(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "round.create");
    return this.withIdempotency(idempotencyKey, access, () => {
      const occupancyPct = clampPct(body.occupancy_pct, MORNING_BOARD_DEFAULTS.occupancy_pct);
      const checkoutPct = clampPct(
        body.checkout_pct_of_occupied,
        MORNING_BOARD_DEFAULTS.checkout_pct_of_occupied
      );
      const vipPct = clampPct(body.vip_pct_of_occupied, MORNING_BOARD_DEFAULTS.vip_pct_of_occupied);
      const dndPct = clampPct(body.dnd_pct_of_stayover, MORNING_BOARD_DEFAULTS.dnd_pct_of_stayover);
      const noServicePct = clampPct(
        body.no_service_pct_of_occupied,
        MORNING_BOARD_DEFAULTS.no_service_pct_of_occupied
      );
      const mode = body.mode === "merge" ? "merge" : "replace";

      const created = this.createOrUpdateRound(identity, propertyId, body);
      const round = created.round;
      if (!["Draft", "Released"].includes(round.status)) {
        throw new LinosError(409, "ERR-ROUND-001", "Only Draft or Released rounds accept morning generation.");
      }

      const rules = this.schedulingRulesByReason(access.property.id);
      const rooms = this.store
        .list("rooms", (r) => r.property_id === access.property.id && r.is_active)
        .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), "en", { numeric: true }));

      const seedBase =
        body.seed != null && body.seed !== ""
          ? Number(body.seed)
          : hashSeedString(`${access.property.id}|${round.service_date}|${round.shift}`);
      if (!Number.isFinite(seedBase)) {
        throw new LinosError(400, "ERR-ROUND-005", "Morning board seed must be a number.");
      }
      const shuffled = seededShuffle(rooms, seedBase >>> 0);

      const totalRooms = shuffled.length;
      const occupiedCount = Math.round((totalRooms * occupancyPct) / 100);
      const vacantCount = totalRooms - occupiedCount;
      const checkoutCount = Math.round((occupiedCount * checkoutPct) / 100);
      const stayoverCount = occupiedCount - checkoutCount;
      const vipCount = Math.min(occupiedCount, Math.round((occupiedCount * vipPct) / 100));
      const dndCount = Math.min(stayoverCount, Math.round((stayoverCount * dndPct) / 100));
      const noServiceCount = Math.min(
        occupiedCount,
        Math.round((occupiedCount * noServicePct) / 100)
      );

      const occupied = shuffled.slice(0, occupiedCount);
      const checkouts = occupied.slice(0, checkoutCount);
      const stayovers = occupied.slice(checkoutCount);

      const dndSet = new Set(
        seededShuffle(stayovers, (seedBase ^ 0x27d4eb2d) >>> 0)
          .slice(0, dndCount)
          .map((r) => r.id)
      );
      const noServiceCandidates = occupied.filter((r) => !dndSet.has(r.id));
      const noServiceSet = new Set(
        seededShuffle(noServiceCandidates, (seedBase ^ 0x85ebca6b) >>> 0)
          .slice(0, noServiceCount)
          .map((r) => r.id)
      );
      const vipCandidates = occupied.filter((r) => !dndSet.has(r.id) && !noServiceSet.has(r.id));
      const vipSet = new Set(
        seededShuffle(vipCandidates, (seedBase ^ 0x9e3779b9) >>> 0)
          .slice(0, Math.min(vipCount, vipCandidates.length))
          .map((r) => r.id)
      );

      if (mode === "replace") {
        this.clearRoundTasks(round.id);
      }

      let added = 0;
      let skippedExisting = 0;
      const plans = [];

      for (const room of checkouts) {
        plans.push(this.morningTaskPlan(room, "checkout", { dndSet, noServiceSet, vipSet, rules }));
      }
      for (const room of stayovers) {
        plans.push(this.morningTaskPlan(room, "stayover", { dndSet, noServiceSet, vipSet, rules }));
      }

      for (const plan of plans) {
        const existing = this.store.find(
          "room_tasks",
          (t) => t.daily_round_id === round.id && t.room_id === plan.room.id
        );
        if (existing) {
          skippedExisting += 1;
          continue;
        }
        this.insertRoomTask(access, round, plan.room, plan.fields);
        added += 1;
      }

      const tasks = this.listTasks(round.id);
      const summary = this.summarizeMorningBoard(tasks, {
        occupancy_pct: occupancyPct,
        checkout_pct_of_occupied: checkoutPct,
        vip_pct_of_occupied: vipPct,
        dnd_pct_of_stayover: dndPct,
        no_service_pct_of_occupied: noServicePct,
        mode,
        seed: seedBase >>> 0,
        total_rooms: totalRooms,
        vacant: vacantCount,
        occupied: occupiedCount,
        planned_checkout: checkoutCount,
        planned_stayover: stayoverCount,
        planned_vip: vipCount,
        planned_dnd: dndCount,
        planned_no_service: noServiceSet.size,
        added,
        skipped_existing: skippedExisting
      });

      this.audit(access, "round.generate_morning", "daily_round", round.id, {
        mode,
        occupancyPct,
        checkoutPct,
        added,
        vacant: vacantCount,
        occupied: occupiedCount
      });

      return { ok: true, round, added, summary, tasks };
    });
  }

  schedulingRulesByReason(propertyId) {
    const rules = this.store.list(
      "scheduling_rules",
      (r) => r.property_id === propertyId && r.is_active
    );
    const byCode = Object.fromEntries(rules.map((r) => [r.code, r]));
    const byReason = Object.fromEntries(rules.map((r) => [r.task_reason, r]));
    return {
      checkout: byCode.CHECKOUT || byReason.checkout || { task_reason: "checkout", priority: 10 },
      stayover: byCode.STAYOVER || byReason.stayover || { task_reason: "stayover", priority: 20 },
      vip: byCode.VIP || byReason.vip || { task_reason: "vip", priority: 5 }
    };
  }

  morningTaskPlan(room, baseReason, { dndSet, noServiceSet, vipSet, rules }) {
    const isDnd = dndSet.has(room.id);
    const isNoService = noServiceSet.has(room.id);
    const isVip = vipSet.has(room.id);
    const baseRule = baseReason === "checkout" ? rules.checkout : rules.stayover;
    const occupancy_status = isDnd
      ? "dnd"
      : isNoService
        ? "no_service"
        : baseReason === "checkout"
          ? "occupied_checkout"
          : "occupied_stayover";

    if (isDnd || isNoService) {
      return {
        room,
        fields: {
          task_reason: baseRule.task_reason || baseReason,
          priority: baseRule.priority ?? 100,
          occupancy_status,
          status: "Skipped",
          skip_reason: isDnd ? "dnd" : "no_service",
          special_instructions: isDnd ? "DND — no linen service" : "No service — guest refusal / hold"
        }
      };
    }

    const vip = isVip;
    return {
      room,
      fields: {
        task_reason: vip ? rules.vip.task_reason || "vip" : baseRule.task_reason || baseReason,
        priority: vip ? (rules.vip.priority ?? 5) : (baseRule.priority ?? 100),
        occupancy_status,
        status: "Unassigned",
        special_instructions: vip
          ? `VIP · ${baseReason === "checkout" ? "Checkout" : "Stayover"} linen change`
          : `Morning board · ${baseReason === "checkout" ? "Checkout" : "Stayover"} linen change`
      }
    };
  }

  clearRoundTasks(roundId) {
    const tasks = this.store.list("room_tasks", (t) => t.daily_round_id === roundId);
    const taskIds = new Set(tasks.map((t) => t.id));
    const carts = this.store.list("cart_loads", (c) => c.daily_round_id === roundId);
    const cartIds = new Set(carts.map((c) => c.id));
    if (cartIds.size) {
      this.store.remove("cart_load_lines", (l) => cartIds.has(l.cart_load_id));
      this.store.remove("cart_loads", (c) => c.daily_round_id === roundId);
    }
    if (!taskIds.size) return;
    this.store.remove("room_task_linen_lines", (l) => taskIds.has(l.room_task_id));
    this.store.remove("room_task_extra_lines", (l) => taskIds.has(l.room_task_id));
    this.store.remove("room_exceptions", (e) => taskIds.has(e.room_task_id));
    this.store.remove("evidence", (e) => taskIds.has(e.room_task_id));
    this.store.remove("room_tasks", (t) => t.daily_round_id === roundId);
  }

  summarizeMorningBoard(tasks, meta = {}) {
    let checkout = 0;
    let stayover = 0;
    let vip = 0;
    let skipped = 0;
    let changeTasks = 0;
    let unassigned = 0;
    let estPieces = 0;

    for (const t of tasks) {
      const occ = t.occupancy_status || "";
      if (occ === "occupied_checkout") checkout += 1;
      else if (occ === "occupied_stayover") stayover += 1;
      if (t.task_reason === "vip" || String(t.special_instructions || "").startsWith("VIP")) vip += 1;
      if (t.status === "Skipped") {
        skipped += 1;
      } else {
        changeTasks += 1;
        if (t.status === "Unassigned") unassigned += 1;
        estPieces += Number(t.estimated_linen_pieces || 0);
      }
    }

    return {
      ...meta,
      change_tasks: changeTasks,
      checkout,
      stayover,
      vip,
      skipped,
      vacant: meta.vacant ?? 0,
      estimated_linen_pieces: estPieces,
      unassigned,
      service_rooms: tasks.length,
      planning_housekeepers_needed: changeTasks > 0 ? 1 : 0
    };
  }

  insertRoomTask(access, round, room, fields) {
    const extrasOnly = fields.task_reason === "guest_extra";
    const task = this.store.insert("room_tasks", {
      id: newId("task"),
      property_id: access.property.id,
      daily_round_id: round.id,
      room_id: room.id,
      status: fields.status || "Unassigned",
      task_reason: fields.task_reason,
      priority: fields.priority ?? 100,
      special_instructions: fields.special_instructions || room.special_notes || null,
      occupancy_status: fields.occupancy_status || null,
      skip_reason: fields.skip_reason || null,
      estimated_linen_pieces: extrasOnly ? 0 : this.estimatedPiecesForRoom(room),
      version: 1
    });
    for (const line of this.requiredLinenForRoom(room)) {
      const qty = line.quantity;
      this.store.insert("room_task_linen_lines", {
        id: newId("rtl"),
        room_task_id: task.id,
        linen_item_id: line.linen_item_id,
        standard_qty: qty,
        linen_out_qty: extrasOnly ? 0 : qty,
        linen_in_qty: extrasOnly ? 0 : qty,
        unused_return_qty: 0,
        missing_qty: 0,
        damaged_qty: 0,
        stained_qty: 0,
        other_discrepancy_qty: 0
      });
    }
    return this.enrichTask(task);
  }

  releaseRound(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "round.release");
    return this.withIdempotency(idempotencyKey, access, () => {
      const round = this.store.find("daily_rounds", (r) => r.id === body.round_id);
      if (!round || round.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-ROUND-404", "Round not found.");
      }
      if (!["Draft", "Released"].includes(round.status)) {
        throw new LinosError(409, "ERR-ROUND-003", "Round cannot be released from current status.");
      }
      const tasks = this.listTasks(round.id);
      if (!tasks.length) throw new LinosError(400, "ERR-ROUND-004", "Add rooms before releasing the round.");
      const updated = this.store.update("daily_rounds", round.id, {
        status: "Active",
        released_by: access.user.id,
        released_at: nowIso(),
        version: round.version + 1
      });
      this.audit(access, "round.release", "daily_round", round.id, { taskCount: tasks.length });
      return {
        ok: true,
        round: updated,
        tasks: this.listTasks(round.id),
        board: this.assignmentBoard(access, round.id)
      };
    });
  }

  assignmentBoard(access, roundId) {
    const round = this.store.find("daily_rounds", (r) => r.id === roundId);
    const tasks = this.listTasks(roundId);
    const agents = this.store
      .list(
        "users",
        (u) => u.property_id === access.property.id && u.role_name === ROLES.STATION_AGENT && u.is_active
      )
      .map((u) => this.publicUser(u));

    const byAgent = agents.map((agent) => {
      const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
      const default_floors = this.defaultFloorsForUser(agent.id);
      return {
        agent: { ...agent, default_floors },
        default_floors,
        room_count: agentTasks.length,
        estimated_linen_pieces: agentTasks.reduce((sum, t) => sum + Number(t.estimated_linen_pieces || 0), 0),
        tasks: agentTasks
      };
    });

    const propertyFloors = [
      ...new Set(
        this.store
          .list("rooms", (r) => r.property_id === access.property.id && r.is_active)
          .map((r) => r.floor_number)
      )
    ].sort((a, b) => a - b);
    const followUp = tasks.filter((task) => task.service_required && task.status !== "Verified");
    const unassigned = tasks.filter((task) => task.status === "Unassigned" && !task.assigned_agent_id);
    const availableHousekeepers = byAgent.length;
    const evenSplitTarget = availableHousekeepers
      ? Math.max(1, Math.ceil(unassigned.length / availableHousekeepers))
      : unassigned.length || 0;

    return {
      round,
      even_split_target: evenSplitTarget,
      assignment_workload_rooms: unassigned.length,
      available_housekeepers: availableHousekeepers,
      // Only Unassigned work is auto-assignable. Skipped (DND / no service) must stay out.
      unassigned,
      reassigned: tasks.filter((t) => t.status === "Assigned" && t.version > 1),
      skipped: tasks.filter((t) => t.status === "Skipped"),
      overdue: tasks.filter((t) => t.overdue),
      follow_up: followUp,
      byAgent,
      property_floors: propertyFloors,
      totals: {
        rooms: tasks.length,
        estimated_linen_pieces: tasks.reduce((sum, t) => sum + Number(t.estimated_linen_pieces || 0), 0),
        follow_up: followUp.length
      }
    };
  }

  getAssignmentBoard(identity, propertyId, roundId) {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "task.view");
    return { ok: true, board: this.assignmentBoard(access, roundId) };
  }

  assignTasks(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "task.assign");
    return this.withIdempotency(idempotencyKey, access, () => {
      const agent = this.store.find(
        "users",
        (u) => u.id === body.agent_id && u.property_id === access.property.id && u.is_active
      );
      if (!agent) throw new LinosError(404, "ERR-USER-404", "Agent not found.");
      const taskIds = Array.isArray(body.task_ids) ? body.task_ids : [];
      if (!taskIds.length) throw new LinosError(400, "ERR-TASK-001", "Select tasks to assign.");

      const updated = [];
      for (const taskId of taskIds) {
        const task = this.store.find("room_tasks", (t) => t.id === taskId);
        if (!task || task.property_id !== access.property.id) continue;
        if (["Verified", "Skipped"].includes(task.status)) continue;
        const wasAssigned = Boolean(task.assigned_agent_id);
        const next = this.store.update("room_tasks", task.id, {
          assigned_agent_id: agent.id,
          assigned_at: nowIso(),
          status: task.status === "ReturnedForCorrection" ? "ReturnedForCorrection" : "Assigned",
          version: task.version + (wasAssigned && task.assigned_agent_id !== agent.id ? 1 : 0) + 1
        });
        updated.push(this.enrichTask(next));
      }

      const board = this.assignmentBoard(access, body.round_id || updated[0]?.daily_round_id);
      const agentBucket = board.byAgent.find((b) => b.agent.id === agent.id);
      this.audit(access, "task.assign", "user", agent.id, {
        taskIds,
        room_count: agentBucket?.room_count,
        even_split_target: board.even_split_target
      });
      return {
        ok: true,
        updated,
        warning: null,
        board
      };
    });
  }

  /**
   * Parse assignment options. Confirm required; even floor-first split is the default.
   */
  parseAssignmentRules(body = {}) {
    const raw = body.rules && typeof body.rules === "object" ? body.rules : body;
    if (!raw.confirm && !body.confirm) {
      throw new LinosError(
        400,
        "ERR-TASK-010",
        "Confirm assignment before running. Rooms are split evenly, floor-first."
      );
    }
    return {
      prefer_default_floors: raw.prefer_default_floors !== false && raw.prefer_default_floors !== "false",
      amendments_notes: String(raw.amendments_notes || "").trim().slice(0, 2000),
      confirm: true
    };
  }

  assignRuleChunk(agentState, chunk, floor) {
    for (const task of chunk) {
      this.store.update("room_tasks", task.id, {
        assigned_agent_id: agentState.agent.id,
        assigned_at: nowIso(),
        status: "Assigned",
        version: task.version + 1
      });
    }
    agentState.room_count += chunk.length;
    agentState.quotaRemaining = Math.max(0, (agentState.quotaRemaining || 0) - chunk.length);
    agentState.floorsWorking.add(floor);
  }

  /**
   * Even floor-first assignment.
   * Each housekeeper (or owner when no HKs) gets roughly the same room count.
   * Prefer each worker’s default floor first; spill only when that floor is exhausted / quota remains.
   */
  runAssignment(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    if (
      !hasCapability(access.capabilities, "task.assign") &&
      !hasCapability(access.capabilities, "admin.assignments")
    ) {
      throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: task.assign");
    }
    return this.withIdempotency(idempotencyKey, access, () => {
      const round = this.store.find("daily_rounds", (r) => r.id === body.round_id);
      if (!round) {
        throw new LinosError(404, "ERR-ROUND-404", "Round not found. Activate today’s morning board first.");
      }
      const rules = this.parseAssignmentRules(body, round);

      const board = this.assignmentBoard(access, round.id);
      const pendingCount = board.unassigned.length;
      if (!pendingCount) {
        return {
          ok: true,
          assigned: 0,
          rules,
          message: "All change rooms are already assigned (skipped rooms stay unassigned).",
          board: this.assignmentBoard(access, round.id)
        };
      }

      let agentBuckets = board.byAgent;
      if (!agentBuckets.length) {
        const features = this.propertyFeatures(access.property);
        const owners = this.store.list(
          "users",
          (u) =>
            u.property_id === access.property.id &&
            u.is_active &&
            (u.is_superadmin || u.is_admin || u.role_name === ROLES.SUPERADMIN)
        );
        if (features.owner_mode && owners.length) {
          agentBuckets = owners.map((owner) => ({
            agent: this.publicUser(owner),
            room_count: 0,
            tasks: []
          }));
        }
      }
      if (!agentBuckets.length) {
        throw new LinosError(400, "ERR-TASK-002", "No housekeepers available. Add staff or enable owner mode.");
      }

      const agents = agentBuckets.map((b) => {
        const bandedFloors = new Set(
          this.store
            .list("user_floor_assignments", (a) => a.user_id === b.agent.id)
            .map((a) => a.floor_number)
        );
        const floorsWorking = new Set(
          b.tasks.map((t) => t.room?.floor_number).filter((f) => f != null && f !== undefined)
        );
        const homeFloor =
          rules.prefer_default_floors && bandedFloors.size
            ? [...bandedFloors].sort((a, b) => a - b)[0]
            : null;
        return {
          agent: b.agent,
          room_count: b.room_count,
          bandedFloors,
          floorsWorking,
          homeFloor,
          quotaRemaining: 0
        };
      });

      const alreadyAssigned = agents.reduce((sum, a) => sum + a.room_count, 0);
      const totalAfter = alreadyAssigned + pendingCount;
      const base = Math.floor(totalAfter / agents.length);
      const rem = totalAfter % agents.length;
      agents.forEach((agent, index) => {
        const target = base + (index < rem ? 1 : 0);
        agent.quotaRemaining = Math.max(0, target - agent.room_count);
      });

      const evenTarget = Math.ceil(totalAfter / agents.length);
      this.store.update("daily_rounds", round.id, {
        planning_rooms_per_agent: evenTarget
      });

      const byFloor = new Map();
      for (const task of board.unassigned) {
        const floor = task.room?.floor_number ?? 0;
        if (!byFloor.has(floor)) byFloor.set(floor, []);
        byFloor.get(floor).push(task);
      }
      for (const floorTasks of byFloor.values()) {
        floorTasks.sort((a, b) =>
          String(a.room?.room_number || "").localeCompare(String(b.room?.room_number || ""))
        );
      }

      const pickEvenAgent = (floor, { homeOnly = false } = {}) => {
        const candidates = agents.filter((a) => {
          if (a.quotaRemaining <= 0) return false;
          if (homeOnly) {
            return a.homeFloor === floor || a.bandedFloors.has(floor);
          }
          return true;
        });
        if (!candidates.length) return null;
        candidates.sort((a, b) => {
          const aHome = a.homeFloor === floor || a.bandedFloors.has(floor) ? 0 : 1;
          const bHome = b.homeFloor === floor || b.bandedFloors.has(floor) ? 0 : 1;
          const aOn = a.floorsWorking.has(floor) ? 0 : 1;
          const bOn = b.floorsWorking.has(floor) ? 0 : 1;
          return (
            aHome - bHome ||
            aOn - bOn ||
            a.room_count - b.room_count ||
            String(a.agent.email || "").localeCompare(String(b.agent.email || ""))
          );
        });
        return candidates[0];
      };

      let assigned = 0;
      for (const floor of [...byFloor.keys()].sort((a, b) => a - b)) {
        let remaining = byFloor.get(floor);

        // Pass A: keep each housekeeper on their home / default floor first.
        while (remaining.length) {
          const chosen = pickEvenAgent(floor, { homeOnly: true });
          if (!chosen) break;
          const take = Math.min(remaining.length, chosen.quotaRemaining);
          const chunk = remaining.slice(0, take);
          remaining = remaining.slice(take);
          this.assignRuleChunk(chosen, chunk, floor);
          assigned += chunk.length;
        }

        // Pass B: spill leftover rooms on this floor to anyone still under even quota.
        while (remaining.length) {
          const chosen = pickEvenAgent(floor, { homeOnly: false });
          if (!chosen) break;
          const take = Math.min(remaining.length, chosen.quotaRemaining);
          const chunk = remaining.slice(0, take);
          remaining = remaining.slice(take);
          this.assignRuleChunk(chosen, chunk, floor);
          assigned += chunk.length;
        }

        byFloor.set(floor, remaining);
      }

      this.audit(access, "task.rule_assign", "daily_round", round.id, {
        assigned,
        rules,
        even_split_target: evenTarget
      });
      return {
        ok: true,
        assigned,
        rules,
        even_split_target: evenTarget,
        message: assigned
          ? `Assigned ${assigned} room${assigned === 1 ? "" : "s"} evenly (about ${evenTarget} per housekeeper), floor-first. You can amend assignments below.`
          : "No rooms were assigned.",
        board: this.assignmentBoard(access, round.id)
      };
    });
  }

  skipTask(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "task.skip");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.store.find("room_tasks", (t) => t.id === body.task_id);
      if (!task || task.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-TASK-404", "Task not found.");
      }
      if (!body.reason) throw new LinosError(400, "ERR-TASK-003", "Skip reason is required.");
      const updated = this.store.update("room_tasks", task.id, {
        status: "Skipped",
        skip_reason: body.reason,
        version: task.version + 1
      });
      this.audit(access, "task.skip", "room_task", task.id, { reason: body.reason });
      return { ok: true, task: this.enrichTask(updated) };
    });
  }

  suggestCart(identity, propertyId, body = {}) {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "cart.view");
    const agentId = body.agent_id || access.user.id;
    const round = this.store.find("daily_rounds", (r) => r.id === body.round_id);
    if (!round) throw new LinosError(404, "ERR-ROUND-404", "Round not found.");
    const tasks = this.listTasks(round.id).filter(
      (t) => t.assigned_agent_id === agentId && !["Verified", "Skipped"].includes(t.status)
    );
    const qtyByItem = new Map();
    const byRoom = [];
    let openExtrasPieces = 0;
    for (const task of tasks) {
      const roomQty = new Map();
      for (const line of task.linen_lines) {
        const qty = Number(line.standard_qty || 0);
        if (qty > 0) roomQty.set(line.linen_item_id, (roomQty.get(line.linen_item_id) || 0) + qty);
      }
      for (const extra of task.extra_lines || []) {
        if (!OPEN_EXTRA_STATUSES.includes(extra.status)) continue;
        const qty = Number(extra.quantity || 0);
        if (qty <= 0) continue;
        roomQty.set(extra.linen_item_id, (roomQty.get(extra.linen_item_id) || 0) + qty);
        openExtrasPieces += qty;
      }
      const roomLines = [];
      for (const [linen_item_id, qty] of roomQty.entries()) {
        qtyByItem.set(linen_item_id, (qtyByItem.get(linen_item_id) || 0) + qty);
        roomLines.push({
          linen_item_id,
          suggested_qty: qty,
          item: this.store.find("linen_items", (i) => i.id === linen_item_id)
        });
      }
      byRoom.push({
        task_id: task.id,
        room_id: task.room_id,
        room_number: task.room?.room_number,
        floor_number: task.room?.floor_number,
        open_extras: (task.extra_lines || []).filter((e) => OPEN_EXTRA_STATUSES.includes(e.status)),
        lines: roomLines
      });
    }
    const lines = [...qtyByItem.entries()].map(([linen_item_id, suggested_qty]) => {
      const item = this.store.find("linen_items", (i) => i.id === linen_item_id);
      return {
        linen_item_id,
        item,
        suggested_qty,
        loaded_qty: suggested_qty,
        extra_qty: 0,
        returned_unused_qty: 0
      };
    });
    return {
      ok: true,
      agent_id: agentId,
      location_model: "hotel_room_store_laundry",
      room_count: tasks.length,
      open_extras_pieces: openExtrasPieces,
      by_room: byRoom,
      lines
    };
  }

  issueCart(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "cart.issue");
    return this.withIdempotency(idempotencyKey, access, () => {
      const suggestion = this.suggestCart(identity, propertyId, body);
      const agentId = suggestion.agent_id;
      if (access.user.id !== agentId && !hasCapability(access.capabilities, "task.assign")) {
        throw new LinosError(403, "ERR-CART-001", "Agents may only issue their own cart.");
      }
      if (!suggestion.room_count) throw new LinosError(400, "ERR-CART-002", "No assigned rooms for cart load.");

      const linesIn = Array.isArray(body.lines) && body.lines.length ? body.lines : suggestion.lines;
      const mainStore = this.store.find("stores", (s) => s.property_id === access.property.id && s.is_active);
      const cart = this.store.insert("cart_loads", {
        id: newId("cart"),
        property_id: access.property.id,
        daily_round_id: body.round_id,
        agent_id: agentId,
        status: "Issued",
        source: body.source || "room_stock",
        store_id: body.source === "store" ? mainStore?.id || null : null,
        issued_at: nowIso(),
        notes: body.notes || null,
        version: 1
      });

      for (const line of linesIn) {
        this.store.insert("cart_load_lines", {
          id: newId("cll"),
          cart_load_id: cart.id,
          linen_item_id: line.linen_item_id,
          suggested_qty: Number(line.suggested_qty || 0),
          loaded_qty: Number(line.loaded_qty ?? line.suggested_qty ?? 0),
          extra_qty: Number(line.extra_qty || 0),
          returned_unused_qty: Number(line.returned_unused_qty || 0)
        });
      }

      const scaleByItem = new Map();
      for (const line of linesIn) {
        const suggested = Number(line.suggested_qty || 0);
        const net =
          Number(line.loaded_qty ?? suggested) +
          Number(line.extra_qty || 0) -
          Number(line.returned_unused_qty || 0);
        scaleByItem.set(line.linen_item_id, suggested > 0 ? net / suggested : 0);
      }

      for (const roomPlan of suggestion.by_room) {
        for (const roomLine of roomPlan.lines) {
          const scale = scaleByItem.get(roomLine.linen_item_id) ?? 1;
          const qty = Math.round(Number(roomLine.suggested_qty || 0) * scale);
          if (qty <= 0) continue;
          if (cart.source === "store" && mainStore) {
            this.postMovement(access, {
              linen_item_id: roomLine.linen_item_id,
              quantity: qty,
              from_bucket: "CleanAtStore",
              to_bucket: "CleanOnCart",
              from_store_id: mainStore.id,
              to_room_id: null,
              room_id: roomPlan.room_id,
              store_id: mainStore.id,
              cart_load_id: cart.id,
              reference_type: "cart_load",
              reference_id: cart.id,
              reason: `Cart issue from store for room ${roomPlan.room_number}`
            });
          } else {
            this.postMovement(access, {
              linen_item_id: roomLine.linen_item_id,
              quantity: qty,
              from_bucket: "CleanAtRoom",
              to_bucket: "CleanOnCart",
              from_room_id: roomPlan.room_id,
              to_room_id: null,
              room_id: roomPlan.room_id,
              cart_load_id: cart.id,
              reference_type: "cart_load",
              reference_id: cart.id,
              reason: `Cart replenishment from room ${roomPlan.room_number} stock`
            });
          }
        }
      }

      // Open room extras covered by this cart move Requested → Loaded.
      for (const roomPlan of suggestion.by_room) {
        for (const extra of roomPlan.open_extras || []) {
          if (extra.status === "Requested") {
            this.store.update("room_task_extra_lines", extra.id, { status: "Loaded" });
          }
        }
      }

      this.audit(access, "cart.issue", "cart_load", cart.id, {
        agentId,
        room_count: suggestion.room_count,
        source: cart.source,
        open_extras_pieces: suggestion.open_extras_pieces || 0
      });
      return {
        ok: true,
        cart,
        by_room: suggestion.by_room,
        lines: this.store.list("cart_load_lines", (l) => l.cart_load_id === cart.id)
      };
    });
  }

  postMovement(access, fields) {
    const quantity = Number(fields.quantity || 0);
    if (!quantity) return null;

    const fromRoom = fields.from_room_id !== undefined ? fields.from_room_id : null;
    const toRoom = fields.to_room_id !== undefined ? fields.to_room_id : fields.room_id || null;
    const fromStore = fields.from_store_id !== undefined ? fields.from_store_id : null;
    const toStore = fields.to_store_id !== undefined ? fields.to_store_id : null;
    const fromLaundry =
      fields.from_laundry_provider_id !== undefined ? fields.from_laundry_provider_id : null;
    const toLaundry = fields.to_laundry_provider_id !== undefined ? fields.to_laundry_provider_id : null;

    if (fields.from_bucket) {
      this.store.adjustStock({
        property_id: access.property.id,
        linen_item_id: fields.linen_item_id,
        bucket: fields.from_bucket,
        room_id: fromRoom,
        store_id: fromStore,
        laundry_provider_id: fromLaundry,
        cart_load_id: fields.from_bucket === "CleanOnCart" ? null : fields.cart_load_id || null,
        delta: -quantity
      });
    }
    this.store.adjustStock({
      property_id: access.property.id,
      linen_item_id: fields.linen_item_id,
      bucket: fields.to_bucket,
      room_id: fields.to_bucket === "CleanOnCart" ? null : toRoom,
      store_id: toStore,
      laundry_provider_id: toLaundry,
      cart_load_id: null,
      delta: quantity
    });

    return this.store.insert("linen_transactions", {
      id: newId("mtx"),
      property_id: access.property.id,
      linen_item_id: fields.linen_item_id,
      quantity,
      from_bucket: fields.from_bucket || null,
      to_bucket: fields.to_bucket,
      from_room_id: fromRoom,
      to_room_id: toRoom,
      from_store_id: fromStore,
      to_store_id: toStore,
      from_laundry_provider_id: fromLaundry,
      to_laundry_provider_id: toLaundry,
      room_id: fields.room_id || toRoom || fromRoom,
      store_id: fields.store_id || toStore || fromStore,
      laundry_provider_id: fields.laundry_provider_id || toLaundry || fromLaundry,
      cart_load_id: fields.cart_load_id || null,
      room_task_id: fields.room_task_id || null,
      reference_type: fields.reference_type,
      reference_id: fields.reference_id,
      status: "Posted",
      reason: fields.reason || null,
      actor_id: access.user.id,
      reverses_transaction_id: fields.reverses_transaction_id || null
    });
  }

  myTasks(identity, propertyId, roundId) {
    const access = this.resolveAccess(identity, propertyId);
    const canViewAll = hasCapability(access.capabilities, "task.view");
    if (!canViewAll) this.require(access, "task.view.assigned");
    const round =
      this.store.find("daily_rounds", (r) => r.id === roundId) ||
      this.getRoundForDate(access, todayDateString(access.property.timezone));
    if (!round) return { ok: true, round: null, tasks: [] };
    let tasks = this.listTasks(round.id);
    if (!canViewAll) tasks = tasks.filter((t) => t.assigned_agent_id === access.user.id);
    tasks.sort((a, b) => {
      if (a.room.floor_number !== b.room.floor_number) return a.room.floor_number - b.room.floor_number;
      return a.room.room_number.localeCompare(b.room.room_number);
    });
    return { ok: true, round, tasks };
  }

  requireAgentTask(access, taskId) {
    const task = this.store.find("room_tasks", (t) => t.id === taskId);
    if (!task || task.property_id !== access.property.id) {
      throw new LinosError(404, "ERR-TASK-404", "Task not found.");
    }
    const canSupervise = hasCapability(access.capabilities, "room.verify");
    if (!canSupervise && task.assigned_agent_id !== access.user.id) {
      throw new LinosError(403, "ERR-TASK-005", "This room is not assigned to you.");
    }
    return task;
  }

  startTask(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "room.service");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.requireAgentTask(access, body.task_id);
      if (!["Assigned", "ReturnedForCorrection", "InProgress"].includes(task.status)) {
        throw new LinosError(409, "ERR-TASK-010", "Task cannot be started from current status.");
      }
      const updated = this.store.update("room_tasks", task.id, {
        status: "InProgress",
        started_at: task.started_at || nowIso(),
        version: task.version + 1
      });
      return { ok: true, task: this.enrichTask(updated) };
    });
  }

  updateRoomCounts(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "room.service");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.requireAgentTask(access, body.task_id);
      if (["Verified", "Skipped"].includes(task.status)) {
        throw new LinosError(409, "ERR-TASK-011", "Verified or skipped rooms cannot be edited.");
      }
      if (task.status === "Assigned") {
        this.store.update("room_tasks", task.id, {
          status: "InProgress",
          started_at: nowIso(),
          version: task.version + 1
        });
      }

      if (body.matches_standard) {
        // Fitted lines only — never clears or invents extras.
        const existing = this.store.list("room_task_linen_lines", (l) => l.room_task_id === task.id);
        for (const line of existing) {
          this.store.update("room_task_linen_lines", line.id, {
            linen_out_qty: line.standard_qty,
            linen_in_qty: line.standard_qty,
            unused_return_qty: 0,
            missing_qty: 0,
            damaged_qty: 0,
            stained_qty: 0,
            other_discrepancy_qty: 0
          });
        }
      } else {
        for (const line of Array.isArray(body.lines) ? body.lines : []) {
          const current = this.store.find(
            "room_task_linen_lines",
            (l) => l.room_task_id === task.id && l.linen_item_id === line.linen_item_id
          );
          if (!current) continue;
          const ceiling = Number(current.standard_qty || 0);
          const outQty = Number(line.linen_out_qty ?? current.linen_out_qty);
          const inQty = Number(line.linen_in_qty ?? current.linen_in_qty);
          if (outQty > ceiling || inQty > ceiling) {
            throw new LinosError(
              400,
              "ERR-TASK-020",
              `Fitted linen for ${this.store.find("linen_items", (i) => i.id === current.linen_item_id)?.code || "item"} cannot exceed standard qty ${ceiling}. Record overage as a Guest request / room extra.`
            );
          }
          if (outQty < 0 || inQty < 0) {
            throw new LinosError(400, "ERR-TASK-021", "Fitted linen quantities cannot be negative.");
          }
          this.store.update("room_task_linen_lines", current.id, {
            linen_out_qty: outQty,
            linen_in_qty: inQty,
            unused_return_qty: Number(line.unused_return_qty ?? current.unused_return_qty),
            missing_qty: Number(line.missing_qty ?? current.missing_qty),
            damaged_qty: Number(line.damaged_qty ?? current.damaged_qty),
            stained_qty: Number(line.stained_qty ?? current.stained_qty),
            other_discrepancy_qty: Number(line.other_discrepancy_qty ?? current.other_discrepancy_qty)
          });
        }
      }

      if (body.reason) {
        this.audit(access, "room.counts_adjust", "room_task", task.id, {
          reason: body.reason,
          matches_standard: Boolean(body.matches_standard)
        });
      }
      return { ok: true, task: this.enrichTask(this.store.find("room_tasks", (t) => t.id === task.id)) };
    });
  }

  reportException(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "exception.report");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.requireAgentTask(access, body.task_id);
      const category = this.store.find(
        "exception_categories",
        (c) => c.id === body.exception_category_id && c.property_id === access.property.id
      );
      if (!category) throw new LinosError(400, "ERR-EXC-001", "Exception category required.");
      const exception = this.store.insert("room_exceptions", {
        id: newId("rex"),
        property_id: access.property.id,
        room_task_id: task.id,
        linen_item_id: body.linen_item_id || null,
        exception_category_id: category.id,
        quantity: Number(body.quantity || 1),
        status: "Reported",
        notes: body.notes || null,
        guest_claim_status: body.mark_guest_claim ? "Reported" : null,
        reported_by: access.user.id
      });
      this.audit(access, "exception.report", "room_exception", exception.id, {
        category: category.code,
        quantity: exception.quantity
      });
      return { ok: true, exception, task: this.enrichTask(task) };
    });
  }

  uploadEvidence(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "evidence.upload");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.requireAgentTask(access, body.task_id);
      const data = String(body.data_base64 || "");
      if (!data) throw new LinosError(400, "ERR-EVID-001", "Photo data is required.");
      if (data.length > 2_500_000) {
        throw new LinosError(400, "ERR-EVID-002", "Photo exceeds upload size limit. Compress and retry.");
      }
      const evidence = this.store.insert("evidence", {
        id: newId("evi"),
        property_id: access.property.id,
        room_task_id: task.id,
        room_exception_id: body.room_exception_id || null,
        uploaded_by: access.user.id,
        content_type: body.content_type || "image/jpeg",
        file_name: body.file_name || `evidence-${Date.now()}.jpg`,
        byte_size: Number(body.byte_size || Math.floor(data.length * 0.75)),
        storage_kind: "inline",
        data_base64: data,
        status: "Active",
        captured_at: body.captured_at || nowIso()
      });
      this.audit(access, "evidence.upload", "evidence", evidence.id, {
        task_id: task.id,
        file_name: evidence.file_name
      });
      return { ok: true, evidence: this.publicEvidence(evidence) };
    });
  }

  getEvidenceData(identity, propertyId, evidenceId) {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "evidence.view");
    const evidence = this.store.find("evidence", (e) => e.id === evidenceId);
    if (!evidence || evidence.property_id !== access.property.id) {
      throw new LinosError(404, "ERR-EVID-404", "Evidence not found.");
    }
    if (evidence.status === "Deleted") throw new LinosError(410, "ERR-EVID-410", "Evidence deleted.");
    return { ok: true, evidence: { ...this.publicEvidence(evidence), data_base64: evidence.data_base64 } };
  }

  applyStandingExtraUpdates(access, task, inputs, serviceOutcome) {
    const lines = this.store.list(
      "room_task_extra_lines",
      (line) => line.room_task_id === task.id && line.standing_extra_request_id
    );
    const byId = new Map((Array.isArray(inputs) ? inputs : []).map((line) => [line.id, line]));
    for (const line of lines) {
      if (line.replenishment_outcome === "initial_install") continue;
      const request = this.store.find(
        "standing_extra_requests",
        (candidate) => candidate.id === line.standing_extra_request_id
      );
      if (!request) continue;
      const input = byId.get(line.id) || {};
      const expected = Number(request.quantity || line.quantity || 0);
      const installed = Number(request.current_installed_qty || 0);
      const cleanIn = Math.max(
        0,
        Number(input.clean_in_qty ?? (installed < expected ? expected - installed : expected))
      );
      const soiledOut = Math.max(
        0,
        Number(input.soiled_out_qty ?? (installed > 0 ? Math.min(expected, installed) : 0))
      );
      const notChanged = Math.max(0, Number(input.not_changed_qty ?? Math.max(0, expected - cleanIn)));
      if (![cleanIn, soiledOut, notChanged].every(Number.isFinite)) {
        throw new LinosError(400, "ERR-EXTRA-020", "Standing extra quantities must be valid numbers.");
      }
      if (cleanIn > expected || soiledOut > installed || soiledOut + notChanged > expected) {
        throw new LinosError(400, "ERR-EXTRA-021", `Standing extra quantities exceed the daily requirement for ${request.reason_code}.`);
      }
      if (soiledOut > 0) {
        this.postMovement(access, {
          linen_item_id: line.linen_item_id,
          quantity: soiledOut,
          from_bucket: "InstalledInRoom",
          to_bucket: "SoiledAtRoom",
          from_room_id: task.room_id,
          to_room_id: task.room_id,
          room_id: task.room_id,
          room_task_id: task.id,
          reference_type: "room_task_extra_daily",
          reference_id: line.id,
          reason: `Standing extra soiled out: ${request.reason_code}`
        });
      }
      if (cleanIn > 0) {
        this.postMovement(access, {
          linen_item_id: line.linen_item_id,
          quantity: cleanIn,
          from_bucket: "CleanOnCart",
          to_bucket: "InstalledInRoom",
          from_room_id: null,
          to_room_id: task.room_id,
          room_id: task.room_id,
          room_task_id: task.id,
          reference_type: "room_task_extra_daily",
          reference_id: line.id,
          reason: `Standing extra replenished: ${request.reason_code}`
        });
      }
      this.store.update("standing_extra_requests", request.id, {
        current_installed_qty: Math.max(0, installed - soiledOut + cleanIn)
      });
      this.store.update("room_task_extra_lines", line.id, {
        clean_in_qty: cleanIn,
        soiled_out_qty: soiledOut,
        not_changed_qty: notChanged,
        replenishment_outcome: input.replenishment_outcome || serviceOutcome,
        status:
          cleanIn > 0 || soiledOut > 0
            ? "Installed"
            : serviceOutcome === "dnd"
              ? "Deferred"
              : "NotChanged"
      });
    }
  }

  reverseTransaction(access, tx, reason) {
    this.postMovement(access, {
      linen_item_id: tx.linen_item_id,
      quantity: tx.quantity,
      from_bucket: tx.to_bucket,
      to_bucket: tx.from_bucket || "WrittenOff",
      from_room_id: tx.to_room_id || null,
      to_room_id: tx.from_room_id || null,
      from_store_id: tx.to_store_id || null,
      to_store_id: tx.from_store_id || null,
      from_laundry_provider_id: tx.to_laundry_provider_id || null,
      to_laundry_provider_id: tx.from_laundry_provider_id || null,
      room_id: tx.room_id,
      store_id: tx.store_id,
      laundry_provider_id: tx.laundry_provider_id,
      cart_load_id: tx.cart_load_id,
      room_task_id: tx.room_task_id,
      reference_type: tx.reference_type,
      reference_id: tx.reference_id,
      reason,
      reverses_transaction_id: tx.id
    });
    this.store.update("linen_transactions", tx.id, { status: "Reversed" });
  }

  submitTask(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "room.submit");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.requireAgentTask(access, body.task_id);
      if (!["InProgress", "Assigned", "ReturnedForCorrection"].includes(task.status)) {
        throw new LinosError(409, "ERR-TASK-012", "Task cannot be submitted from current status.");
      }
      const lines = this.store.list("room_task_linen_lines", (l) => l.room_task_id === task.id);
      if (!lines.length) throw new LinosError(400, "ERR-TASK-013", "Room has no linen lines.");

      const serviceOutcome = body.service_outcome || "changed";
      if (!SERVICE_OUTCOMES.includes(serviceOutcome)) {
        throw new LinosError(400, "ERR-TASK-014", "Unknown room service outcome.");
      }
      if (
        ["not_changed", "dnd", "guest_declined", "room_unavailable", "other"].includes(serviceOutcome) &&
        !String(body.service_outcome_reason || body.service_outcome_note || "").trim()
      ) {
        throw new LinosError(400, "ERR-TASK-015", "A reason is required when the room is not fully changed.");
      }

      const exceptions = this.store.list("room_exceptions", (e) => e.room_task_id === task.id);
      for (const exception of exceptions) {
        const category = this.store.find("exception_categories", (c) => c.id === exception.exception_category_id);
        if (category?.requires_evidence) {
          const photos = this.store.list(
            "evidence",
            (e) =>
              e.room_task_id === task.id &&
              e.status === "Active" &&
              (e.room_exception_id === exception.id || !e.room_exception_id)
          );
          if (!photos.length) {
            throw new LinosError(
              400,
              "ERR-EVID-003",
              `Exception ${category.name} requires photographic evidence before submit.`
            );
          }
        }
      }

      const prior = this.store.list(
        "linen_transactions",
        (t) =>
          t.room_task_id === task.id &&
          t.status === "Posted" &&
          ["room_task", "room_task_extra_daily"].includes(t.reference_type)
      );
      for (const tx of prior) this.reverseTransaction(access, tx, "Resubmit after correction");

      this.applyStandingExtraUpdates(access, task, body.extra_lines, serviceOutcome);

      for (const line of lines) {
        const ceiling = Number(line.standard_qty || 0);
        if (Number(line.linen_out_qty || 0) > ceiling || Number(line.linen_in_qty || 0) > ceiling) {
          throw new LinosError(
            400,
            "ERR-TASK-020",
            "Fitted linen out/in cannot exceed standard qty. Record overage as a room extra."
          );
        }
        if (line.linen_out_qty > 0) {
          this.postMovement(access, {
            linen_item_id: line.linen_item_id,
            quantity: line.linen_out_qty,
            from_bucket: "InstalledInRoom",
            to_bucket: "SoiledAtRoom",
            from_room_id: task.room_id,
            to_room_id: task.room_id,
            room_id: task.room_id,
            room_task_id: task.id,
            reference_type: "room_task",
            reference_id: task.id,
            reason: "Fitted soiled linen out"
          });
        }
        if (line.linen_in_qty > 0) {
          this.postMovement(access, {
            linen_item_id: line.linen_item_id,
            quantity: line.linen_in_qty,
            from_bucket: "CleanOnCart",
            to_bucket: "InstalledInRoom",
            from_room_id: null,
            to_room_id: task.room_id,
            room_id: task.room_id,
            room_task_id: task.id,
            reference_type: "room_task",
            reference_id: task.id,
            reason: "Fitted clean linen in"
          });
        }
        if (line.unused_return_qty > 0) {
          this.postMovement(access, {
            linen_item_id: line.linen_item_id,
            quantity: line.unused_return_qty,
            from_bucket: "CleanOnCart",
            to_bucket: "CleanAtRoom",
            from_room_id: null,
            to_room_id: task.room_id,
            room_id: task.room_id,
            room_task_id: task.id,
            reference_type: "room_task",
            reference_id: task.id,
            reason: "Unused clean returned to room stock"
          });
        }
        const quarantine = Number(line.damaged_qty || 0) + Number(line.stained_qty || 0);
        if (quarantine > 0) {
          this.postMovement(access, {
            linen_item_id: line.linen_item_id,
            quantity: quarantine,
            from_bucket: "SoiledAtRoom",
            to_bucket: "Quarantined",
            from_room_id: task.room_id,
            to_room_id: task.room_id,
            room_id: task.room_id,
            room_task_id: task.id,
            reference_type: "room_task",
            reference_id: task.id,
            reason: "Damaged/stained quarantine"
          });
        }
      }

      // Install open extras on submit (fitted + extras as separate ledger txs).
      const openExtras = this.store.list(
        "room_task_extra_lines",
        (l) => l.room_task_id === task.id && !l.standing_extra_request_id && OPEN_EXTRA_STATUSES.includes(l.status)
      );
      for (const extra of openExtras) {
        const qty = Number(extra.clean_in_qty || extra.quantity || 0);
        if (qty > 0) {
          this.postMovement(access, {
            linen_item_id: extra.linen_item_id,
            quantity: qty,
            from_bucket: "CleanOnCart",
            to_bucket: "InstalledInRoom",
            from_room_id: null,
            to_room_id: task.room_id,
            room_id: task.room_id,
            room_task_id: task.id,
            reference_type: "room_task",
            reference_id: task.id,
            reason: `Extra install: ${extra.reason_code}`
          });
        }
        this.store.update("room_task_extra_lines", extra.id, {
          status: "Installed",
          clean_in_qty: qty
        });
      }

      const updated = this.store.update("room_tasks", task.id, {
        status: "Submitted",
        submitted_at: nowIso(),
        service_outcome: serviceOutcome,
        service_outcome_reason: body.service_outcome_reason || null,
        service_outcome_note: body.service_outcome_note || null,
        service_outcome_by: access.user.id,
        service_outcome_at: nowIso(),
        return_reason: null,
        version: task.version + 1
      });
      this.audit(access, "room.submit", "room_task", task.id, {
        extras_installed: openExtras.length,
        service_outcome: serviceOutcome,
        service_outcome_reason: body.service_outcome_reason || null
      });
      return { ok: true, task: this.enrichTask(updated) };
    });
  }

  verificationQueue(identity, propertyId, roundId) {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "room.verify");
    const round =
      this.store.find("daily_rounds", (r) => r.id === roundId) ||
      this.getRoundForDate(access, todayDateString(access.property.timezone));
    if (!round) return { ok: true, round: null, queue: [] };
    return { ok: true, round, queue: this.listTasks(round.id).filter((t) => t.status === "Submitted") };
  }

  verifyTask(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "room.verify");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.store.find("room_tasks", (t) => t.id === body.task_id);
      if (!task || task.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-TASK-404", "Task not found.");
      }
      if (task.status !== "Submitted") {
        throw new LinosError(409, "ERR-TASK-014", "Only submitted rooms can be verified.");
      }
      const updated = this.store.update("room_tasks", task.id, {
        status: "Verified",
        verified_at: nowIso(),
        verified_by: access.user.id,
        version: task.version + 1
      });
      if (Array.isArray(body.confirm_exception_ids)) {
        for (const exceptionId of body.confirm_exception_ids) {
          const exception = this.store.find("room_exceptions", (e) => e.id === exceptionId);
          if (!exception) continue;
          this.store.update("room_exceptions", exception.id, {
            status: "Confirmed",
            confirmed_by: access.user.id
          });
        }
      }
      this.audit(access, "room.verify", "room_task", task.id, {});
      return { ok: true, task: this.enrichTask(updated) };
    });
  }

  returnTask(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "room.return");
    return this.withIdempotency(idempotencyKey, access, () => {
      const task = this.store.find("room_tasks", (t) => t.id === body.task_id);
      if (!task || task.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-TASK-404", "Task not found.");
      }
      if (task.status !== "Submitted") {
        throw new LinosError(409, "ERR-TASK-015", "Only submitted rooms can be returned.");
      }
      if (!body.reason) throw new LinosError(400, "ERR-TASK-016", "Return reason is required.");
      const updated = this.store.update("room_tasks", task.id, {
        status: "ReturnedForCorrection",
        return_reason: body.reason,
        version: task.version + 1
      });
      this.audit(access, "room.return", "room_task", task.id, { reason: body.reason });
      return { ok: true, task: this.enrichTask(updated) };
    });
  }

  updateGuestClaim(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "exception.guest_claim");
    return this.withIdempotency(idempotencyKey, access, () => {
      const exception = this.store.find("room_exceptions", (e) => e.id === body.exception_id);
      if (!exception || exception.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-EXC-404", "Exception not found.");
      }
      const status = body.guest_claim_status;
      if (!GUEST_CLAIM_STATUSES.includes(status)) {
        throw new LinosError(400, "ERR-EXC-002", "Invalid guest-claim status.");
      }
      const updated = this.store.update("room_exceptions", exception.id, {
        guest_claim_status: status,
        status: status === "Closed" ? "Resolved" : exception.status === "Reported" ? "Confirmed" : exception.status,
        confirmed_by: exception.confirmed_by || access.user.id
      });
      this.audit(access, "exception.guest_claim", "room_exception", exception.id, {
        guest_claim_status: status,
        auto_charge: false
      });
      return { ok: true, exception: updated };
    });
  }

  dashboard(accessOrIdentity, propertyId) {
    const access =
      accessOrIdentity.user && accessOrIdentity.property
        ? accessOrIdentity
        : this.resolveAccess(accessOrIdentity, propertyId);
    const round = this.getRoundForDate(access, todayDateString(access.property.timezone));
    const tasks = round ? this.listTasks(round.id) : [];
    const byFloor = {};
    for (const task of tasks) {
      const floor = task.room?.floor_number ?? "unknown";
      if (!byFloor[floor]) {
        byFloor[floor] = {
          floor,
          total: 0,
          verified: 0,
          submitted: 0,
          in_progress: 0,
          unassigned: 0,
          skipped: 0
        };
      }
      byFloor[floor].total += 1;
      if (task.status === "Verified") byFloor[floor].verified += 1;
      if (task.status === "Submitted") byFloor[floor].submitted += 1;
      if (task.status === "InProgress" || task.status === "ReturnedForCorrection") byFloor[floor].in_progress += 1;
      if (task.status === "Unassigned") byFloor[floor].unassigned += 1;
      if (task.status === "Skipped") byFloor[floor].skipped += 1;
    }
    const exceptions = tasks.flatMap((t) => t.exceptions || []);
    return {
      round,
      alerts: {
        unassigned: tasks.filter((t) => t.status === "Unassigned").length,
        overdue: tasks.filter((t) => t.overdue).length,
        awaiting_verification: tasks.filter((t) => t.status === "Submitted").length,
        returned_for_correction: tasks.filter((t) => t.status === "ReturnedForCorrection").length
      },
      progress: {
        total: tasks.length,
        verified: tasks.filter((t) => t.status === "Verified").length,
        submitted: tasks.filter((t) => t.status === "Submitted").length,
        in_progress: tasks.filter((t) =>
          ["InProgress", "Assigned", "ReturnedForCorrection"].includes(t.status)
        ).length,
        skipped: tasks.filter((t) => t.status === "Skipped").length
      },
      byFloor: Object.values(byFloor).sort((a, b) => Number(a.floor) - Number(b.floor)),
      exceptions: exceptions.map((e) => ({
        ...e,
        category: this.store.find("exception_categories", (c) => c.id === e.exception_category_id)
      })),
      roomLinenSnapshot: this.buildRoomLinenSnapshot(access, tasks)
    };
  }

  buildRoomLinenSnapshot(access, roundTasks = null, { includeLineDetails = false, roomId = "" } = {}) {
    const pid = access.property.id;
    const rooms = this.store
      .list("rooms", (r) => r.property_id === pid && r.is_active && (!roomId || r.id === roomId))
      .sort((a, b) => a.floor_number - b.floor_number || a.room_number.localeCompare(b.room_number));
    const installed = this.store.list(
      "stock_balances",
      (s) => s.property_id === pid && s.bucket === "InstalledInRoom"
    );
    const installedByRoom = new Map();
    for (const row of installed) {
      if (!row.room_id) continue;
      if (!installedByRoom.has(row.room_id)) installedByRoom.set(row.room_id, new Map());
      installedByRoom.get(row.room_id).set(row.linen_item_id, Number(row.quantity || 0));
    }
    const openExtras = this.store.list(
      "room_task_extra_lines",
      (l) => l.property_id === pid && ["Requested", "Loaded", "Installed"].includes(l.status)
    );
    const extrasByRoom = new Map();
    for (const extra of openExtras) {
      if (!extrasByRoom.has(extra.room_id)) extrasByRoom.set(extra.room_id, []);
      extrasByRoom.get(extra.room_id).push(this.enrichExtraLine(extra));
    }

    const summary = { soiled: 0, partial: 0, insufficient: 0, normal: 0, extra: 0, unconfigured: 0 };
    const taskByRoom = new Map(
      (Array.isArray(roundTasks) ? roundTasks : []).map((task) => [task.room_id, task])
    );
    const snapshotRooms = rooms.map((room) => {
      const fitted = this.requiredLinenForRoom(room);
      const bal = installedByRoom.get(room.id) || new Map();
      const itemIds = new Set([
        ...fitted.map((f) => f.linen_item_id),
        ...[...bal.keys()].filter((id) => Number(bal.get(id) || 0) > 0)
      ]);
      const lines = [];
      let shortItemCount = 0;
      let extraPieceTotal = 0;
      let hasShort = false;
      let hasExtra = false;
      for (const linenItemId of itemIds) {
        const item = this.store.find("linen_items", (i) => i.id === linenItemId);
        const fittedLine = fitted.find((f) => f.linen_item_id === linenItemId);
        const fitted_qty = Number(fittedLine?.quantity || 0);
        const installed_qty = Number(bal.get(linenItemId) || 0);
        const extra_qty =
          fitted_qty > 0 ? Math.max(0, installed_qty - fitted_qty) : installed_qty > 0 ? installed_qty : 0;
        const short_qty = fitted_qty > 0 ? Math.max(0, fitted_qty - installed_qty) : 0;
        let item_status = "ignore";
        if (fitted_qty > 0 && installed_qty < fitted_qty) item_status = "short";
        else if (extra_qty > 0) item_status = "extra";
        else if (fitted_qty > 0 && installed_qty === fitted_qty) item_status = "normal";
        if (item_status === "ignore") continue;
        if (item_status === "short") {
          hasShort = true;
          shortItemCount += 1;
        }
        if (item_status === "extra") {
          hasExtra = true;
          extraPieceTotal += extra_qty;
        }
        lines.push({
          linen_item_id: linenItemId,
          code: item?.code || "",
          name: item?.name || "",
          fitted_qty,
          installed_qty,
          extra_qty,
          short_qty,
          item_status
        });
      }
      lines.sort((a, b) => a.code.localeCompare(b.code));
      let status = "unconfigured";
      if (!fitted.length && !lines.length) status = "unconfigured";
      else if (hasShort) status = "insufficient";
      else if (hasExtra) status = "extra";
      else if (fitted.length && lines.every((l) => l.item_status === "normal" || l.item_status === "ignore")) {
        status = "normal";
      } else if (fitted.length && !hasShort && !hasExtra) status = "normal";
      const task = taskByRoom.get(room.id);
      const roomService = this.roomServiceState(task);
      const { occupied, service_required: serviceRequired, service_state: serviceState } = roomService;
      const displayedStatus = serviceRequired ? serviceState : status;
      summary[displayedStatus] = (summary[displayedStatus] || 0) + 1;
      return {
        room_id: room.id,
        room_number: room.room_number,
        floor_number: room.floor_number,
        category_id: room.category_id,
        bed_config_id: room.bed_config_id,
        status: displayedStatus,
        base_status: status,
        occupied,
        service_required: serviceRequired,
        service_state: serviceState,
        service_task_status: task?.status || null,
        service_outcome: task?.service_outcome || null,
        service_outcome_reason: task?.service_outcome_reason || task?.service_outcome_note || null,
        short_item_count: shortItemCount,
        extra_piece_total: extraPieceTotal,
        fitted_piece_total: fitted.reduce((s, f) => s + Number(f.quantity || 0), 0),
        installed_piece_total: lines.reduce((s, l) => s + Number(l.installed_qty || 0), 0),
        // Line detail is only needed for the selected-room panel; omit from grid payloads.
        lines: includeLineDetails || roomId ? lines : [],
        recent_extras:
          includeLineDetails || roomId ? (extrasByRoom.get(room.id) || []).slice(0, 12) : []
      };
    });

    return {
      asOf: nowIso(),
      summary,
      rooms: snapshotRooms
    };
  }

  getRoomLinenSnapshotRoom(identity, propertyId, roomId) {
    const access = this.resolveAccess(identity, propertyId);
    const allowed =
      hasCapability(access.capabilities, "dashboard.supervisor") ||
      hasCapability(access.capabilities, "dashboard.agent") ||
      hasCapability(access.capabilities, "dashboard.management") ||
      hasCapability(access.capabilities, "dashboard.store") ||
      hasCapability(access.capabilities, "dashboard.porter");
    if (!allowed) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: dashboard");
    if (!roomId) throw new LinosError(400, "ERR-DASH-001", "roomId is required.");
    const round = this.getRoundForDate(access, todayDateString(access.property.timezone));
    const tasks = round ? this.listTasks(round.id) : [];
    const snap = this.buildRoomLinenSnapshot(access, tasks, { includeLineDetails: true, roomId });
    const room = snap.rooms[0] || null;
    if (!room) throw new LinosError(404, "ERR-DASH-002", "Room not found in linen snapshot.");
    return { ok: true, room, asOf: snap.asOf };
  }

  collectionLineView(line) {
    const room = line.room_id ? this.store.find("rooms", (r) => r.id === line.room_id) : null;
    const item = this.store.find("linen_items", (i) => i.id === line.linen_item_id);
    return {
      ...line,
      room: room ? { id: room.id, room_number: room.room_number, floor_number: room.floor_number } : null,
      item: item ? { id: item.id, code: item.code, name: item.name, unit: item.unit } : null
    };
  }

  collectionView(collection) {
    return {
      ...collection,
      lines: this.store
        .list("store_collection_lines", (l) => l.store_collection_id === collection.id)
        .map((line) => this.collectionLineView(line))
        .sort((a, b) =>
          String(a.room?.room_number || "").localeCompare(String(b.room?.room_number || "")) ||
          String(a.item?.code || "").localeCompare(String(b.item?.code || ""))
        )
    };
  }

  listStoreCollections(identity, propertyId, query = {}) {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "transfer.view");
    const roundId = query.roundId || query.round_id || "";
    const collections = this.store
      .list(
        "store_collections",
        (c) => c.property_id === access.property.id && (!roundId || c.daily_round_id === roundId)
      )
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .map((collection) => this.collectionView(collection));
    return { ok: true, collections };
  }

  collectionRoundContext(access, body = {}) {
    const roundId = body.daily_round_id || body.round_id || "";
    const round = this.store.find(
      "daily_rounds",
      (r) => r.id === roundId && r.property_id === access.property.id
    );
    if (!round) throw new LinosError(404, "ERR-COLLECT-001", "Round not found.");
    if (!["Active", "Closed"].includes(round.status)) {
      throw new LinosError(409, "ERR-COLLECT-002", "The round must be active before collection can be prepared.");
    }
    return { round, roundTasks: this.store.list("room_tasks", (t) => t.daily_round_id === round.id) };
  }

  collectionStore(access, storeId) {
    const store = this.store.find(
      "stores",
      (s) => s.id === storeId && s.property_id === access.property.id && s.is_active
    );
    if (!store) throw new LinosError(404, "ERR-COLLECT-003", "Active store not found.");
    return store;
  }

  prepareStoreCollection(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "transfer.collect");
    return this.withIdempotency(idempotencyKey, access, () => {
      const { round, roundTasks } = this.collectionRoundContext(access, body);
      const store = this.collectionStore(access, body.store_id);
      const floor = body.floor_number === undefined || body.floor_number === "" ? null : Number(body.floor_number);
      if (floor !== null && !Number.isInteger(floor)) {
        throw new LinosError(400, "ERR-COLLECT-004", "floor_number must be an integer.");
      }
      const roomIds = new Set(
        roundTasks
          .filter((task) => task.status !== "Skipped")
          .map((task) => task.room_id)
          .filter((roomId) => {
            if (floor === null) return true;
            return this.store.find("rooms", (room) => room.id === roomId)?.floor_number === floor;
          })
      );
      const balances = this.store.list(
        "stock_balances",
        (row) =>
          row.property_id === access.property.id &&
          row.bucket === "SoiledAtRoom" &&
          row.room_id &&
          roomIds.has(row.room_id) &&
          Number(row.quantity || 0) > 0
      );
      if (!balances.length) {
        throw new LinosError(400, "ERR-COLLECT-005", "No soiled linen is waiting in the selected rooms.");
      }
      const collection = this.store.insert("store_collections", {
        id: newId("col"),
        property_id: access.property.id,
        store_id: store.id,
        daily_round_id: round.id,
        floor_number: floor,
        status: "Prepared",
        prepared_by: access.user.id,
        collected_by: null,
        received_by: null,
        prepared_at: nowIso(),
        collected_at: null,
        received_at: null,
        reconciled_at: null,
        notes: body.notes || null,
        version: 1
      });
      for (const balance of balances) {
        this.store.insert("store_collection_lines", {
          id: newId("coll").replace(/^coll/, "cln"),
          store_collection_id: collection.id,
          room_id: balance.room_id,
          linen_item_id: balance.linen_item_id,
          expected_qty: Number(balance.quantity || 0),
          collected_qty: 0,
          received_qty: 0,
          variance_qty: 0
        });
      }
      this.audit(access, "transfer.collection.prepare", "store_collection", collection.id, {
        round_id: round.id,
        floor_number: floor,
        line_count: balances.length
      });
      return { ok: true, collection: this.collectionView(collection) };
    });
  }

  collectionLineUpdates(collection, bodyLines, field, fallbackField) {
    const lines = this.store.list("store_collection_lines", (l) => l.store_collection_id === collection.id);
    const input = new Map(
      (Array.isArray(bodyLines) ? bodyLines : [])
        .map((line) => [line.line_id || line.id, line])
        .filter(([id]) => id)
    );
    return lines.map((line) => {
      const supplied = input.get(line.id);
      const raw = supplied?.[field] ?? line[fallbackField];
      const quantity = Number(raw || 0);
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new LinosError(400, "ERR-COLLECT-006", "Collection quantities must be non-negative integers.");
      }
      return { line, quantity };
    });
  }

  stockQuantity(propertyId, linenItemId, bucket, roomId = null, storeId = null) {
    return Number(
      this.store.find(
        "stock_balances",
        (row) =>
          row.property_id === propertyId &&
          row.linen_item_id === linenItemId &&
          row.bucket === bucket &&
          (row.room_id || null) === (roomId || null) &&
          (row.store_id || null) === (storeId || null)
      )?.quantity || 0
    );
  }

  collectStoreCollection(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "transfer.collect");
    return this.withIdempotency(idempotencyKey, access, () => {
      const collection = this.store.find("store_collections", (c) => c.id === body.collection_id);
      if (!collection || collection.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-COLLECT-007", "Collection not found.");
      }
      if (collection.status !== "Prepared") {
        throw new LinosError(409, "ERR-COLLECT-008", "Only prepared collections can be collected.");
      }
      const updates = this.collectionLineUpdates(collection, body.lines, "collected_qty", "expected_qty");
      for (const { line, quantity } of updates) {
        if (quantity > line.expected_qty) {
          throw new LinosError(400, "ERR-COLLECT-009", "Collected quantity cannot exceed expected quantity.");
        }
        const available = this.stockQuantity(
          access.property.id,
          line.linen_item_id,
          "SoiledAtRoom",
          line.room_id
        );
        if (quantity > available) {
          throw new LinosError(409, "ERR-COLLECT-010", "Collected quantity exceeds the room’s available soiled stock.");
        }
        if (quantity > 0) {
          this.postMovement(access, {
            linen_item_id: line.linen_item_id,
            quantity,
            from_bucket: "SoiledAtRoom",
            to_bucket: "SoiledAtStore",
            from_room_id: line.room_id,
            to_room_id: null,
            room_id: line.room_id,
            store_id: collection.store_id,
            to_store_id: collection.store_id,
            reference_type: "store_collection",
            reference_id: collection.id,
            reason: `Soiled room collection${collection.floor_number ? ` floor ${collection.floor_number}` : ""}`
          });
        }
        this.store.update("store_collection_lines", line.id, { collected_qty: quantity });
      }
      const updated = this.store.update("store_collections", collection.id, {
        status: "Collected",
        collected_by: access.user.id,
        collected_at: nowIso(),
        version: collection.version + 1
      });
      this.audit(access, "transfer.collection.collect", "store_collection", collection.id, {
        line_count: updates.length
      });
      return { ok: true, collection: this.collectionView(updated) };
    });
  }

  receiveStoreCollection(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "transfer.receive");
    return this.withIdempotency(idempotencyKey, access, () => {
      const collection = this.store.find("store_collections", (c) => c.id === body.collection_id);
      if (!collection || collection.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-COLLECT-011", "Collection not found.");
      }
      if (collection.status !== "Collected") {
        throw new LinosError(409, "ERR-COLLECT-012", "Only collected collections can be received.");
      }
      const updates = this.collectionLineUpdates(collection, body.lines, "received_qty", "collected_qty");
      for (const { line, quantity } of updates) {
        const collected = Number(line.collected_qty || 0);
        if (quantity > collected) {
          throw new LinosError(400, "ERR-COLLECT-013", "Received quantity cannot exceed collected quantity.");
        }
        this.store.update("store_collection_lines", line.id, {
          received_qty: quantity,
          variance_qty: quantity - Number(line.expected_qty || 0)
        });
      }
      const updated = this.store.update("store_collections", collection.id, {
        status: "Received",
        received_by: access.user.id,
        received_at: nowIso(),
        version: collection.version + 1
      });
      this.audit(access, "transfer.collection.receive", "store_collection", collection.id, {
        line_count: updates.length
      });
      return { ok: true, collection: this.collectionView(updated) };
    });
  }

  reconcileStoreCollection(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "transfer.receive");
    return this.withIdempotency(idempotencyKey, access, () => {
      const collection = this.store.find("store_collections", (c) => c.id === body.collection_id);
      if (!collection || collection.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-COLLECT-014", "Collection not found.");
      }
      if (collection.status !== "Received") {
        throw new LinosError(409, "ERR-COLLECT-015", "Only received collections can be reconciled.");
      }
      const lines = this.store.list("store_collection_lines", (l) => l.store_collection_id === collection.id);
      const variances = [];
      for (const line of lines) {
        if (!line.variance_qty) continue;
        const existing = this.store.find(
          "variances",
          (v) => v.reference_type === "store_collection_line" && v.reference_id === line.id && v.status === "Open"
        );
        if (!existing) {
          variances.push(
            this.store.insert("variances", {
              id: newId("var"),
              property_id: access.property.id,
              reference_type: "store_collection_line",
              reference_id: line.id,
              linen_item_id: line.linen_item_id,
              quantity: line.variance_qty,
              status: "Open",
              reason: body.reason || "Room-to-store collection variance",
              approved_by: null,
              closed_at: null
            })
          );
        }
      }
      const updated = this.store.update("store_collections", collection.id, {
        status: "Reconciled",
        reconciled_at: nowIso(),
        notes: body.notes || collection.notes,
        version: collection.version + 1
      });
      this.audit(access, "transfer.collection.reconcile", "store_collection", collection.id, {
        variance_count: variances.length
      });
      return { ok: true, collection: this.collectionView(updated), variances };
    });
  }

  getDashboard(identity, propertyId) {
    const access = this.resolveAccess(identity, propertyId);
    const allowed =
      hasCapability(access.capabilities, "dashboard.supervisor") ||
      hasCapability(access.capabilities, "dashboard.agent") ||
      hasCapability(access.capabilities, "dashboard.management") ||
      hasCapability(access.capabilities, "dashboard.store") ||
      hasCapability(access.capabilities, "dashboard.porter");
    if (!allowed) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: dashboard");
    return { ok: true, dashboard: this.dashboard(access) };
  }

  saveMasterEntity(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    this.require(access, "admin.configure");
    return this.withIdempotency(idempotencyKey, access, () => {
      const entity = body.entity;
      const allowed = {
        rooms: ["room_number", "floor_number", "category_id", "bed_config_id", "is_active", "special_notes"],
        linen_items: ["code", "name", "unit", "sort_order", "is_active"],
        room_linen_standards: ["category_id", "bed_config_id", "linen_item_id", "quantity"],
        room_linen_requirements: ["room_id", "linen_item_id", "quantity", "included"],
        room_par_levels: ["room_id", "linen_item_id", "par_quantity"],
        stores: ["code", "name", "is_active"]
      };
      if (!allowed[entity]) throw new LinosError(400, "ERR-ADMIN-001", "Unsupported entity.");
      const patch = { property_id: access.property.id };
      for (const key of allowed[entity]) {
        if (body.record?.[key] !== undefined) patch[key] = body.record[key];
      }

      let saved;
      if (entity === "rooms" && !body.record?.id) {
        const roomNumber = String(patch.room_number || "").trim();
        if (!roomNumber) throw new LinosError(400, "ERR-ADMIN-002", "Room number is required.");
        saved = this.store.insert("rooms", {
          id: newId("room"),
          ...patch,
          room_number: roomNumber
        });
        for (const standard of this.standardsForRoom(saved)) {
          const fittedQty = Number(standard.quantity || 0);
          const par = fittedQty * 2;
          storeOrSkipPar(this.store, saved.id, standard.linen_item_id, par);
          this.store.adjustStock({
            property_id: access.property.id,
            linen_item_id: standard.linen_item_id,
            bucket: "CleanAtRoom",
            room_id: saved.id,
            delta: par
          });
          if (fittedQty > 0) {
            this.store.adjustStock({
              property_id: access.property.id,
              linen_item_id: standard.linen_item_id,
              bucket: "InstalledInRoom",
              room_id: saved.id,
              delta: fittedQty
            });
          }
        }
      } else if (entity === "room_linen_requirements") {
        saved = this.upsertRoomLinenRequirement(access, body.record || {}, patch);
      } else if (entity === "rooms" && body.record?.id) {
        const previous = this.store.find("rooms", (r) => r.id === body.record.id);
        if (!previous || previous.property_id !== access.property.id) {
          throw new LinosError(404, "ERR-ADMIN-004", "Room not found.");
        }
        saved = this.store.update("rooms", body.record.id, patch);
        // Room-type change: drop per-room linen overrides so fitted set follows the new type standards.
        if (patch.category_id && patch.category_id !== previous.category_id) {
          this.store.remove("room_linen_requirements", (r) => r.room_id === saved.id);
        }
      } else if (body.record?.id) {
        saved = this.store.update(entity, body.record.id, patch);
      } else {
        saved = this.store.insert(entity, { id: newId(entity.slice(0, 3)), ...patch });
      }

      this.audit(access, "admin.save", entity, saved.id, { fields: Object.keys(patch) });
      return { ok: true, entity, record: saved, master: this.masterData(access) };
    });
  }

  upsertRoomLinenRequirement(access, record, patch) {
    const roomId = record.room_id || patch.room_id;
    const linenItemId = record.linen_item_id || patch.linen_item_id;
    if (!roomId || !linenItemId) {
      throw new LinosError(400, "ERR-ADMIN-003", "room_id and linen_item_id are required.");
    }
    const room = this.store.find("rooms", (r) => r.id === roomId && r.property_id === access.property.id);
    if (!room) throw new LinosError(404, "ERR-ADMIN-004", "Room not found.");
    const item = this.store.find(
      "linen_items",
      (i) => i.id === linenItemId && i.property_id === access.property.id
    );
    if (!item) throw new LinosError(404, "ERR-ADMIN-005", "Linen item not found.");

    const included = patch.included !== undefined ? Boolean(patch.included) : true;
    let quantity = patch.quantity !== undefined ? Number(patch.quantity) : undefined;
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0)) {
      throw new LinosError(400, "ERR-ADMIN-006", "Quantity must be a non-negative number.");
    }

    const existing =
      (record.id && this.store.find("room_linen_requirements", (r) => r.id === record.id)) ||
      this.store.find(
        "room_linen_requirements",
        (r) => r.room_id === roomId && r.linen_item_id === linenItemId
      );

    const next = {
      property_id: access.property.id,
      room_id: roomId,
      linen_item_id: linenItemId,
      included,
      quantity: quantity !== undefined ? quantity : existing ? Number(existing.quantity || 0) : 0
    };
    if (!included) next.quantity = Number(next.quantity || 0);
    if (included && next.quantity <= 0) {
      const std = this.standardsForRoom(room).find((s) => s.linen_item_id === linenItemId);
      next.quantity = Number(std?.quantity || 1);
    }

    if (existing) {
      return this.store.update("room_linen_requirements", existing.id, {
        ...next,
        updated_at: nowIso()
      });
    }
    return this.store.insert("room_linen_requirements", {
      id: newId("rlr"),
      ...next
    });
  }

  requireSuperadmin(identity, propertyId = "") {
    const access = this.resolveAccess(identity, propertyId);
    if (!access.user.is_superadmin) {
      throw new LinosError(403, "ERR-AUTHZ-001", "Hotel setup is limited to Superadmin.");
    }
    return access;
  }

  platformOperatorEmails() {
    return String(process.env.LINOS_BOOTSTRAP_ADMIN_EMAILS || "muhamadyazdi@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  isPlatformOperator(user) {
    return this.platformOperatorEmails().includes(String(user?.email || "").toLowerCase());
  }

  setupStarters(propertyKind = "hotel") {
    const starters = startersForKind(propertyKind);
    return {
      ok: true,
      property_kind: normalizePropertyKind(propertyKind),
      roomTypes: starters.roomTypes,
      beds: starters.beds,
      linenItems: starters.linenItems
    };
  }

  listSetupProperties(identity) {
    const access = this.requireSuperadmin(identity, "");
    const platform = this.isPlatformOperator(access.user);
    const properties = this.store
      .list("properties", (p) => platform || p.id === access.user.property_id)
      .map((p) => this.publicProperty(p))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { ok: true, properties };
  }

  getSetupState(identity, propertyId) {
    const access = this.requireSuperadmin(identity, propertyId);
    const pid = access.property.id;
    const categories = this.store.list("room_categories", (c) => c.property_id === pid);
    const beds = this.store.list("bed_configs", (b) => b.property_id === pid);
    const linenItems = this.store
      .list("linen_items", (i) => i.property_id === pid)
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));
    const standards = this.store.list("room_linen_standards", (s) => s.property_id === pid);
    const rooms = this.store
      .list("rooms", (r) => r.property_id === pid)
      .sort(
        (a, b) =>
          Number(a.floor_number) - Number(b.floor_number) ||
          String(a.room_number).localeCompare(String(b.room_number))
      );
    const activeRooms = rooms.filter((r) => r.is_active);
    const catById = new Map(categories.map((c) => [c.id, c]));
    const bedById = new Map(beds.map((b) => [b.id, b]));
    const roomRows = rooms.map((r) => ({
      id: r.id,
      room_number: r.room_number,
      floor_number: r.floor_number,
      category_id: r.category_id,
      bed_config_id: r.bed_config_id,
      category_name: catById.get(r.category_id)?.name || "—",
      bed_name: bedById.get(r.bed_config_id)?.name || "—",
      is_active: r.is_active !== false
    }));
    const stores = this.store.list("stores", (s) => s.property_id === pid && s.is_active);
    const laundry = this.store.list("laundry_providers", (p) => p.property_id === pid).map((row) => ({
      ...row,
      partner_type: normalizeLaundryPartnerType(row.partner_type),
      partner_label: laundryOperationsLabel(row.partner_type)
    }));
    const housekeepers = this.store.list(
      "users",
      (u) => u.property_id === pid && u.role_name === ROLES.STATION_AGENT && u.is_active
    );
    const supervisors = this.store.list(
      "users",
      (u) => u.property_id === pid && u.role_name === ROLES.STATION_SUPERVISOR && u.is_active
    );
    const exceptions = this.store.list("exception_categories", (e) => e.property_id === pid);
    const rules = this.store.list("scheduling_rules", (r) => r.property_id === pid);
    const pub = this.publicProperty(access.property);
    return {
      ok: true,
      property: pub,
      roomCategories: categories,
      bedConfigs: beds,
      linenItems,
      roomLinenStandards: standards,
      rooms: roomRows,
      roomsCount: activeRooms.length,
      floors: [...new Set(activeRooms.map((r) => r.floor_number))].sort((a, b) => a - b),
      stores,
      laundryProviders: laundry,
      housekeepersCount: housekeepers.length,
      supervisorsCount: supervisors.length,
      exceptionCategories: exceptions,
      schedulingRules: rules,
      readiness: this.computeSetupReadiness(pid),
      opsDefaults: opsDefaultsForScale(pub.property_scale),
      isSmallSetup: isSmallScale(pub.property_scale)
    };
  }

  computeSetupReadiness(propertyId) {
    const property = this.store.find("properties", (p) => p.id === propertyId);
    const features = this.propertyFeatures(property || {});
    const spaces = spaceLabel(property?.property_kind);
    const categories = this.store.list("room_categories", (c) => c.property_id === propertyId);
    const beds = this.store.list("bed_configs", (b) => b.property_id === propertyId);
    const linenItems = this.store.list(
      "linen_items",
      (i) => i.property_id === propertyId && i.is_active
    );
    const standards = this.store.list("room_linen_standards", (s) => s.property_id === propertyId);
    const rooms = this.store.list("rooms", (r) => r.property_id === propertyId && r.is_active);
    const stores = this.store.list("stores", (s) => s.property_id === propertyId && s.is_active);
    const housekeepers = this.store.list(
      "users",
      (u) => u.property_id === propertyId && u.role_name === ROLES.STATION_AGENT && u.is_active
    );
    const operators = this.store.list(
      "users",
      (u) =>
        u.property_id === propertyId &&
        u.is_active &&
        (u.is_superadmin ||
          u.is_admin ||
          u.role_name === ROLES.STATION_SUPERVISOR ||
          u.role_name === ROLES.STATION_AGENT)
    );
    const pairsCovered = new Set(standards.map((s) => `${s.category_id}:${s.bed_config_id}`));
    const neededPairs = [];
    for (const c of categories) {
      for (const b of beds) neededPairs.push(`${c.id}:${b.id}`);
    }
    const standardsCoverTypes =
      categories.length > 0 &&
      beds.length > 0 &&
      neededPairs.some((pair) => pairsCovered.has(pair));

    const operatorOk = features.owner_mode ? operators.length >= 1 : housekeepers.length >= 1;
    const checks = [
      { id: "property", label: "Property profile", ok: Boolean(property) },
      { id: "room_types", label: "At least one room / space type", ok: categories.length >= 1 },
      { id: "beds", label: "At least one bed / layout config", ok: beds.length >= 1 },
      { id: "linen", label: "At least one linen item", ok: linenItems.length >= 1 },
      { id: "standards", label: "What’s normally in the room", ok: standardsCoverTypes },
      { id: "rooms", label: `At least one active ${spaces.replace(/s$/, "")}`, ok: rooms.length >= 1 },
      { id: "store", label: "Active linen store", ok: stores.length >= 1 },
      {
        id: "operators",
        label: features.owner_mode ? "Owner or staff ready" : "At least one housekeeper",
        ok: operatorOk
      }
    ];
    const ready = checks.every((c) => c.ok);
    return {
      ready,
      checks,
      counts: {
        room_types: categories.length,
        beds: beds.length,
        linen_items: linenItems.length,
        standards: standards.length,
        rooms: rooms.length,
        stores: stores.length,
        housekeepers: housekeepers.length,
        operators: operators.length
      }
    };
  }

  getSetupReadiness(identity, propertyId) {
    const access = this.requireSuperadmin(identity, propertyId);
    return { ok: true, readiness: this.computeSetupReadiness(access.property.id) };
  }

  createSetupProperty(identity, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, "");
    return this.withIdempotency(idempotencyKey, access, () => {
      const name = String(body.name || "").trim();
      if (!name) throw new LinosError(400, "ERR-SETUP-001", "Property name is required.");
      const code = slugCode(body.code || name);
      if (this.store.find("properties", (p) => p.code === code)) {
        throw new LinosError(409, "ERR-SETUP-002", `Property code ${code} already exists.`);
      }
      const propertyKind = normalizePropertyKind(body.property_kind || "hotel");
      const propertyScale = normalizePropertyScale(body.property_scale || "small");
      const features = normalizeFeatures(body.features, propertyScale, propertyKind);
      const property = this.store.insert("properties", {
        id: newId("prop"),
        code,
        name,
        timezone: String(body.timezone || "Asia/Kuala_Lumpur").trim() || "Asia/Kuala_Lumpur",
        is_demo: Boolean(body.is_demo),
        demo_disclaimer: body.is_demo ? String(body.demo_disclaimer || "") : null,
        positioning: String(body.positioning || "").trim() || null,
        star_rating: body.star_rating != null ? Number(body.star_rating) : null,
        address_line: String(body.address_line || "").trim() || null,
        allow_guest_pii_import: Boolean(body.allow_guest_pii_import),
        photo_retention_days: Number(body.photo_retention_days || 365),
        location_model: "hotel_room_store_laundry",
        subscription_plan: body.is_demo ? "demo" : "free",
        subscription_status: "active",
        property_kind: propertyKind,
        property_scale: propertyScale,
        features_json: features
      });
      this.audit(
        { ...access, property },
        "setup.property.create",
        "property",
        property.id,
        { code, name, property_kind: propertyKind, property_scale: propertyScale }
      );
      return { ok: true, property: this.publicProperty(property), ...this.getSetupState(identity, property.id) };
    });
  }

  updateSetupProperty(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const current = access.property;
      const patch = {};
      if (body.name != null) patch.name = String(body.name).trim();
      if (body.timezone != null) patch.timezone = String(body.timezone).trim() || "Asia/Kuala_Lumpur";
      if (body.address_line !== undefined) patch.address_line = String(body.address_line || "").trim() || null;
      if (body.positioning !== undefined) patch.positioning = String(body.positioning || "").trim() || null;
      if (body.star_rating !== undefined) {
        patch.star_rating = body.star_rating === "" || body.star_rating == null ? null : Number(body.star_rating);
      }
      if (body.allow_guest_pii_import !== undefined) {
        patch.allow_guest_pii_import = Boolean(body.allow_guest_pii_import);
      }
      if (body.photo_retention_days !== undefined) {
        patch.photo_retention_days = Number(body.photo_retention_days || 365);
      }
      if (body.property_kind !== undefined) {
        patch.property_kind = normalizePropertyKind(body.property_kind);
      }
      if (body.property_scale !== undefined) {
        patch.property_scale = normalizePropertyScale(body.property_scale);
      }
      const nextKind = patch.property_kind || normalizePropertyKind(current.property_kind);
      const nextScale = patch.property_scale || normalizePropertyScale(current.property_scale || "small");
      if (body.apply_scale_defaults) {
        patch.features_json = defaultFeaturesFor(nextScale, nextKind);
      } else if (body.features !== undefined) {
        patch.features_json = normalizeFeatures(
          { ...this.propertyFeatures(current), ...body.features },
          nextScale,
          nextKind
        );
      } else if (patch.property_scale || patch.property_kind) {
        // Keep explicit features when scale/kind change unless defaults requested.
        patch.features_json = normalizeFeatures(this.propertyFeatures(current), nextScale, nextKind);
      }
      if (patch.name === "") throw new LinosError(400, "ERR-SETUP-001", "Property name is required.");
      const property = this.store.update("properties", access.property.id, patch);
      this.audit(access, "setup.property.update", "property", property.id, { fields: Object.keys(patch) });
      return { ok: true, property: this.publicProperty(property), ...this.getSetupState(identity, property.id) };
    });
  }

  saveSetupRoomTypes(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      let items = Array.isArray(body.room_types) ? body.room_types : null;
      if (!items?.length && body.use_starters) {
        items = [...startersForKind(access.property.property_kind).roomTypes];
      }
      if (!items?.length) throw new LinosError(400, "ERR-SETUP-010", "Provide room_types or use_starters.");

      const saved = [];
      for (const row of items) {
        const code = slugCode(row.code || row.name, "TYPE");
        const name = String(row.name || row.family || code).trim();
        const family = String(row.family || name).trim();
        let existing = row.id
          ? this.store.find("room_categories", (c) => c.id === row.id && c.property_id === pid)
          : this.store.find("room_categories", (c) => c.property_id === pid && c.code === code);
        if (existing) {
          saved.push(this.store.update("room_categories", existing.id, { code, name, family }));
        } else {
          saved.push(
            this.store.insert("room_categories", {
              id: newId("cat"),
              property_id: pid,
              code,
              name,
              family
            })
          );
        }
      }
      this.audit(access, "setup.room_types", "property", pid, { count: saved.length });
      return { ok: true, roomCategories: saved, ...this.getSetupState(identity, pid) };
    });
  }

  saveSetupBeds(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      let items = Array.isArray(body.beds) ? body.beds : null;
      if (!items?.length && body.use_starters) {
        items = [...startersForKind(access.property.property_kind).beds];
      }
      if (!items?.length) throw new LinosError(400, "ERR-SETUP-011", "Provide beds or use_starters.");

      const saved = [];
      for (const row of items) {
        const code = slugCode(row.code || row.name, "BED");
        const name = String(row.name || code).trim();
        let existing = row.id
          ? this.store.find("bed_configs", (b) => b.id === row.id && b.property_id === pid)
          : this.store.find("bed_configs", (b) => b.property_id === pid && b.code === code);
        if (existing) {
          saved.push(this.store.update("bed_configs", existing.id, { code, name }));
        } else {
          saved.push(
            this.store.insert("bed_configs", {
              id: newId("bed"),
              property_id: pid,
              code,
              name
            })
          );
        }
      }
      this.audit(access, "setup.beds", "property", pid, { count: saved.length });
      return { ok: true, bedConfigs: saved, ...this.getSetupState(identity, pid) };
    });
  }

  saveSetupLinenItems(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      let items = Array.isArray(body.linen_items) ? body.linen_items : null;
      if (!items?.length && body.use_starters) {
        items = [...startersForKind(access.property.property_kind).linenItems];
      }
      if (!items?.length) throw new LinosError(400, "ERR-SETUP-012", "Provide linen_items or use_starters.");

      const saved = [];
      for (const [idx, row] of items.entries()) {
        const code = slugCode(row.code || row.name, `L${idx + 1}`);
        const name = String(row.name || code).trim();
        const sort_order = Number(row.sort_order ?? (idx + 1) * 10);
        let existing = row.id
          ? this.store.find("linen_items", (i) => i.id === row.id && i.property_id === pid)
          : this.store.find("linen_items", (i) => i.property_id === pid && i.code === code);
        if (existing) {
          saved.push(
            this.store.update("linen_items", existing.id, {
              code,
              name,
              unit: row.unit || "piece",
              sort_order,
              is_active: row.is_active !== false
            })
          );
        } else {
          saved.push(
            this.store.insert("linen_items", {
              id: newId("lin"),
              property_id: pid,
              code,
              name,
              unit: row.unit || "piece",
              sort_order,
              is_active: row.is_active !== false
            })
          );
        }
      }
      this.audit(access, "setup.linen_items", "property", pid, { count: saved.length });
      return { ok: true, linenItems: saved, ...this.getSetupState(identity, pid) };
    });
  }

  saveSetupStandards(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      const categories = this.store.list("room_categories", (c) => c.property_id === pid);
      const beds = this.store.list("bed_configs", (b) => b.property_id === pid);
      const linenItems = this.store.list("linen_items", (i) => i.property_id === pid && i.is_active);
      if (!categories.length || !beds.length || !linenItems.length) {
        throw new LinosError(
          400,
          "ERR-SETUP-013",
          "Save room types, beds, and linen catalogue before fitted standards."
        );
      }

      let lines = Array.isArray(body.standards) ? body.standards : null;
      if (!lines?.length && body.use_defaults) {
        lines = buildDefaultStandardsMatrix(categories, beds, linenItems);
      }
      if (!lines?.length) throw new LinosError(400, "ERR-SETUP-014", "Provide standards or use_defaults.");

      if (body.replace) {
        this.store.remove("room_linen_standards", (s) => s.property_id === pid);
      }

      const saved = [];
      for (const row of lines) {
        const quantity = Number(row.quantity || 0);
        if (!row.category_id || !row.bed_config_id || !row.linen_item_id) continue;
        if (!Number.isFinite(quantity) || quantity < 0) continue;
        const existing = this.store.find(
          "room_linen_standards",
          (s) =>
            s.property_id === pid &&
            s.category_id === row.category_id &&
            s.bed_config_id === row.bed_config_id &&
            s.linen_item_id === row.linen_item_id
        );
        if (quantity === 0) {
          if (existing) this.store.remove("room_linen_standards", (s) => s.id === existing.id);
          continue;
        }
        if (existing) {
          saved.push(this.store.update("room_linen_standards", existing.id, { quantity }));
        } else {
          saved.push(
            this.store.insert("room_linen_standards", {
              id: newId("rls"),
              property_id: pid,
              category_id: row.category_id,
              bed_config_id: row.bed_config_id,
              linen_item_id: row.linen_item_id,
              quantity
            })
          );
        }
      }
      this.audit(access, "setup.standards", "property", pid, { count: saved.length });
      return { ok: true, roomLinenStandards: saved, ...this.getSetupState(identity, pid) };
    });
  }

  bulkCreateSetupRooms(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      let planned;
      try {
        if (body.mode === "simple" || body.simple) {
          planned = planSimpleRooms({
            roomCount: body.room_count,
            floorNumber: body.floor_number ?? 1,
            defaultCategoryId: body.default_category_id,
            defaultBedConfigId: body.default_bed_config_id,
            roomNames: body.room_names || []
          });
        } else {
          planned = planBulkRooms({
            floorFrom: body.floor_from,
            floorTo: body.floor_to,
            roomsPerFloor: body.rooms_per_floor,
            defaultCategoryId: body.default_category_id,
            defaultBedConfigId: body.default_bed_config_id,
            floorOverrides: body.floor_overrides || []
          });
        }
      } catch (err) {
        throw new LinosError(400, "ERR-SETUP-020", err.message || "Invalid room plan.");
      }

      const created = [];
      const skipped = [];
      for (const plan of planned) {
        const exists = this.store.find(
          "rooms",
          (r) => r.property_id === pid && r.room_number === plan.room_number
        );
        if (exists) {
          skipped.push(plan.room_number);
          continue;
        }
        const room = this.store.insert("rooms", {
          id: newId("room"),
          property_id: pid,
          room_number: plan.room_number,
          floor_number: plan.floor_number,
          category_id: plan.category_id,
          bed_config_id: plan.bed_config_id,
          is_active: true,
          special_notes: null
        });
        const standards = this.store.list(
          "room_linen_standards",
          (s) => s.category_id === room.category_id && s.bed_config_id === room.bed_config_id
        );
        for (const standard of standards) {
          const fittedQty = Number(standard.quantity || 0);
          const par = fittedQty * 2;
          storeOrSkipPar(this.store, room.id, standard.linen_item_id, par);
          this.store.adjustStock({
            property_id: pid,
            linen_item_id: standard.linen_item_id,
            bucket: "CleanAtRoom",
            room_id: room.id,
            delta: par
          });
          if (fittedQty > 0) {
            this.store.adjustStock({
              property_id: pid,
              linen_item_id: standard.linen_item_id,
              bucket: "InstalledInRoom",
              room_id: room.id,
              delta: fittedQty
            });
          }
        }
        created.push(room);
      }
      this.audit(access, "setup.rooms.bulk", "property", pid, {
        created: created.length,
        skipped: skipped.length
      });
      return {
        ok: true,
        created: created.length,
        skipped: skipped.length,
        rooms: created,
        ...this.getSetupState(identity, pid)
      };
    });
  }

  setupOpsBootstrap(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      const property = access.property;
      const scaleDefaults = opsDefaultsForScale(property.property_scale || "small");
      const ownerOnly =
        body.owner_only != null ? Boolean(body.owner_only) : Boolean(scaleDefaults.owner_only);
      const storeName = String(body.store_name || "Main Linen Store").trim();
      let storeLoc = this.store.find("stores", (s) => s.property_id === pid && s.code === "MAIN");
      if (!storeLoc) {
        storeLoc = this.store.insert("stores", {
          id: newId("str"),
          property_id: pid,
          code: "MAIN",
          name: storeName,
          is_active: true
        });
      } else if (body.store_name) {
        storeLoc = this.store.update("stores", storeLoc.id, { name: storeName, is_active: true });
      }

      const partnerType = normalizeLaundryPartnerType(
        body.partner_type ?? body.laundry_partner_type ?? scaleDefaults.partner_type
      );
      const defaultLaundryName = laundryOperationsLabel(partnerType);
      const laundryName = String(body.laundry_name || defaultLaundryName).trim();
      const externalRef = String(body.external_ref || body.aerosparkle_ref || "").trim() || null;
      const laundryPatch = {
        name: laundryName,
        is_active: true,
        partner_type: partnerType,
        external_ref: partnerType === "in_house" ? null : externalRef,
        config_json: body.laundry_config && typeof body.laundry_config === "object" ? body.laundry_config : {}
      };
      let laundry = this.store.find("laundry_providers", (p) => p.property_id === pid && p.code === "MAIN");
      if (!laundry) {
        laundry = this.store.insert("laundry_providers", {
          id: newId("lp"),
          property_id: pid,
          code: "MAIN",
          standard_turnaround_hours: 24,
          express_turnaround_hours: 8,
          ...laundryPatch
        });
      } else {
        laundry = this.store.update("laundry_providers", laundry.id, laundryPatch);
      }

      const exceptions = insertStarterExceptions(this.store, pid);
      const rules = insertStarterRules(this.store, pid);

      const linenItems = this.store.list("linen_items", (i) => i.property_id === pid && i.is_active);
      const storeStock = Number(body.store_stock_per_item ?? scaleDefaults.store_stock_per_item);
      for (const item of linenItems) {
        this.store.adjustStock({
          property_id: pid,
          linen_item_id: item.id,
          bucket: "CleanAtStore",
          store_id: storeLoc.id,
          delta: storeStock
        });
      }

      const floors = [
        ...new Set(
          this.store
            .list("rooms", (r) => r.property_id === pid && r.is_active)
            .map((r) => r.floor_number)
        )
      ].sort((a, b) => a - b);

      const hkCount = Math.max(
        0,
        Math.min(80, Number(body.housekeeper_count ?? (ownerOnly ? 0 : scaleDefaults.housekeeper_count)))
      );
      const svCount = Math.max(
        0,
        Math.min(20, Number(body.supervisor_count ?? (ownerOnly ? 0 : scaleDefaults.supervisor_count)))
      );
      const createSupportRoles =
        body.create_support_roles != null ? Boolean(body.create_support_roles) : !ownerOnly;
      const hkBands = singleFloorDefaults(floors.length ? floors : [1], Math.max(hkCount, 1));
      const svBands = splitFloorsAcrossStaff(floors.length ? floors : [1], Math.max(svCount, 1));

      const createdUsers = [];
      for (let i = 1; i <= svCount; i += 1) {
        const email = setupStaffEmail(property.code, "supervisor", i);
        let user = this.store.find("users", (u) => u.email === email);
        if (!user) {
          user = this.store.insert("users", {
            id: newId("user"),
            property_id: pid,
            email,
            display_name: `Supervisor ${i}`,
            role_name: ROLES.STATION_SUPERVISOR,
            is_active: true,
            is_admin: i === 1,
            is_superadmin: false,
            staff_band: String.fromCharCode(64 + i),
            hk_number: null
          });
          createdUsers.push(user);
        }
        this.store.remove("user_floor_assignments", (a) => a.user_id === user.id);
        for (const floor_number of svBands[i - 1] || []) {
          this.store.insert("user_floor_assignments", {
            id: newId("ufa"),
            user_id: user.id,
            property_id: pid,
            floor_number,
            role_name: user.role_name
          });
        }
      }

      for (let i = 1; i <= hkCount; i += 1) {
        const email = setupStaffEmail(property.code, "housekeeper", i);
        let user = this.store.find("users", (u) => u.email === email);
        if (!user) {
          user = this.store.insert("users", {
            id: newId("user"),
            property_id: pid,
            email,
            display_name: `Housekeeper ${String(i).padStart(2, "0")}`,
            role_name: ROLES.STATION_AGENT,
            is_active: true,
            is_admin: false,
            is_superadmin: false,
            staff_band: null,
            hk_number: i
          });
          createdUsers.push(user);
        }
        this.store.remove("user_floor_assignments", (a) => a.user_id === user.id);
        for (const floor_number of hkBands[i - 1] || []) {
          this.store.insert("user_floor_assignments", {
            id: newId("ufa"),
            user_id: user.id,
            property_id: pid,
            floor_number,
            role_name: user.role_name
          });
        }
      }

      if (createSupportRoles) {
        for (const role of ["store", "porter"]) {
          const email = setupStaffEmail(property.code, role, 1);
          if (!this.store.find("users", (u) => u.email === email)) {
            createdUsers.push(
              this.store.insert("users", {
                id: newId("user"),
                property_id: pid,
                email,
                display_name: role === "store" ? "Store Agent" : "Porter",
                role_name: role === "store" ? ROLES.STORE_AGENT : ROLES.PORTER,
                is_active: true,
                is_admin: false,
                is_superadmin: false
              })
            );
          }
        }
      }

      const currentFeatures = this.propertyFeatures(property);
      const nextFeatures = normalizeFeatures(
        {
          ...currentFeatures,
          owner_mode: ownerOnly || (hkCount === 0 && svCount === 0),
          team_mode: !ownerOnly && (hkCount > 0 || svCount > 0 || currentFeatures.team_mode),
          laundry_partner: partnerType !== "in_house"
        },
        property.property_scale || "small",
        property.property_kind || "hotel"
      );
      this.store.update("properties", pid, { features_json: nextFeatures });

      this.audit(access, "setup.ops_bootstrap", "property", pid, {
        store_id: storeLoc.id,
        housekeepers: hkCount,
        supervisors: svCount,
        owner_only: ownerOnly,
        partner_type: partnerType
      });
      return {
        ok: true,
        store: storeLoc,
        laundry,
        exceptionCategories: exceptions,
        schedulingRules: rules,
        staff_created: createdUsers.length,
        features: nextFeatures,
        ...this.getSetupState(identity, pid)
      };
    });
  }

  getLaundryPickupBrief(identity, propertyId) {
    const access = this.resolveAccess(identity, propertyId);
    if (
      !hasCapability(access.capabilities, "transfer.view") &&
      !hasCapability(access.capabilities, "admin.configure") &&
      !access.user.is_superadmin
    ) {
      throw new LinosError(403, "ERR-AUTHZ-001", "Laundry brief requires transfer or admin access.");
    }
    const pid = access.property.id;
    const laundry =
      this.store.find("laundry_providers", (p) => p.property_id === pid && p.code === "MAIN") ||
      this.store.list("laundry_providers", (p) => p.property_id === pid)[0] ||
      null;
    const soiledAtStore = this.store
      .list("stock_balances", (b) => b.property_id === pid && b.bucket === "SoiledAtStore")
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const soiledAtRoom = this.store
      .list("stock_balances", (b) => b.property_id === pid && b.bucket === "SoiledAtRoom")
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const bookingUrl = process.env.AEROSPARKLE_BOOKING_URL || "https://aerosparkle.com/";
    const summary = [
      `Property: ${access.property.name}`,
      access.property.address_line ? `Address: ${access.property.address_line}` : null,
      `Soiled at store: ${soiledAtStore} pieces`,
      `Soiled in rooms: ${soiledAtRoom} pieces`,
      laundry?.partner_type === "aerosparkle" ? "Laundry operations: AeroSparkle" : null,
      laundry?.partner_type === "other" ? "Laundry operations: Other 3rd party" : null,
      laundry?.external_ref ? `Account ref: ${laundry.external_ref}` : null
    ]
      .filter(Boolean)
      .join("\n");
    const partnerType = normalizeLaundryPartnerType(laundry?.partner_type || "in_house");
    return {
      ok: true,
      brief: {
        partner_type: partnerType,
        partner_label: laundryOperationsLabel(partnerType),
        laundry_name: laundry?.name || null,
        external_ref: laundry?.external_ref || null,
        booking_url: bookingUrl,
        soiled_at_store: soiledAtStore,
        soiled_at_room: soiledAtRoom,
        summary
      }
    };
  }

  updateSetupRoom(identity, propertyId, roomId, body = {}, idempotencyKey = "") {
    const access = this.requireSuperadmin(identity, propertyId || body.property_id);
    return this.withIdempotency(idempotencyKey, access, () => {
      const pid = access.property.id;
      const room = this.store.find("rooms", (r) => r.id === roomId && r.property_id === pid);
      if (!room) throw new LinosError(404, "ERR-SETUP-030", "Room not found.");
      const patch = {};
      if (body.room_number != null) {
        const roomNumber = String(body.room_number).trim();
        if (!roomNumber) throw new LinosError(400, "ERR-SETUP-031", "Room number is required.");
        const clash = this.store.find(
          "rooms",
          (r) => r.property_id === pid && r.room_number === roomNumber && r.id !== room.id
        );
        if (clash) throw new LinosError(409, "ERR-SETUP-032", `Room ${roomNumber} already exists.`);
        patch.room_number = roomNumber;
      }
      if (body.floor_number != null) {
        const floor = Number(body.floor_number);
        if (!Number.isInteger(floor) || floor < 1) {
          throw new LinosError(400, "ERR-SETUP-033", "floor_number must be an integer >= 1.");
        }
        patch.floor_number = floor;
      }
      if (body.category_id != null) {
        const category = this.store.find(
          "room_categories",
          (c) => c.id === body.category_id && c.property_id === pid
        );
        if (!category) throw new LinosError(400, "ERR-SETUP-034", "Invalid room type.");
        patch.category_id = category.id;
      }
      if (body.bed_config_id != null) {
        const bed = this.store.find(
          "bed_configs",
          (b) => b.id === body.bed_config_id && b.property_id === pid
        );
        if (!bed) throw new LinosError(400, "ERR-SETUP-035", "Invalid bed / layout.");
        patch.bed_config_id = bed.id;
      }
      if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

      const categoryChanged =
        (patch.category_id && patch.category_id !== room.category_id) ||
        (patch.bed_config_id && patch.bed_config_id !== room.bed_config_id);
      if (categoryChanged) {
        const used = this.store.find(
          "room_tasks",
          (t) => t.room_id === room.id && ["Submitted", "Verified", "InProgress"].includes(t.status)
        );
        if (used) {
          throw new LinosError(
            409,
            "ERR-SETUP-036",
            "This room already has service history. Change fitted linen in Admin instead."
          );
        }
      }

      const updated = this.store.update("rooms", room.id, patch);
      if (categoryChanged) {
        this.store.remove("room_linen_requirements", (req) => req.room_id === room.id);
        const nextCategoryId = updated.category_id;
        const nextBedId = updated.bed_config_id;
        const standards = this.store.list(
          "room_linen_standards",
          (s) => s.category_id === nextCategoryId && s.bed_config_id === nextBedId
        );
        for (const standard of standards) {
          const fittedQty = Number(standard.quantity || 0);
          const par = fittedQty * 2;
          storeOrSkipPar(this.store, room.id, standard.linen_item_id, par);
          const installed = this.store.find(
            "stock_balances",
            (b) =>
              b.property_id === pid &&
              b.room_id === room.id &&
              b.linen_item_id === standard.linen_item_id &&
              b.bucket === "InstalledInRoom"
          );
          const cleanAtRoom = this.store.find(
            "stock_balances",
            (b) =>
              b.property_id === pid &&
              b.room_id === room.id &&
              b.linen_item_id === standard.linen_item_id &&
              b.bucket === "CleanAtRoom"
          );
          const installedDelta = fittedQty - Number(installed?.quantity || 0);
          const cleanDelta = par - Number(cleanAtRoom?.quantity || 0);
          if (installedDelta) {
            this.store.adjustStock({
              property_id: pid,
              linen_item_id: standard.linen_item_id,
              bucket: "InstalledInRoom",
              room_id: room.id,
              delta: installedDelta
            });
          }
          if (cleanDelta) {
            this.store.adjustStock({
              property_id: pid,
              linen_item_id: standard.linen_item_id,
              bucket: "CleanAtRoom",
              room_id: room.id,
              delta: cleanDelta
            });
          }
        }
      }
      this.audit(access, "setup.room.update", "room", room.id, { fields: Object.keys(patch) });
      return { ok: true, room: updated, ...this.getSetupState(identity, pid) };
    });
  }

  deactivateSetupRoom(identity, propertyId, roomId, idempotencyKey = "") {
    return this.updateSetupRoom(identity, propertyId, roomId, { is_active: false }, idempotencyKey);
  }

  getSetupLinenMatrix(identity, propertyId, query = {}) {
    const access = this.requireSuperadmin(identity, propertyId);
    const pid = access.property.id;
    const categoryId = query.categoryId || query.category_id || "";
    const bedConfigId = query.bedConfigId || query.bed_config_id || "";
    if (!categoryId || !bedConfigId) {
      throw new LinosError(400, "ERR-SETUP-040", "category_id and bed_config_id are required.");
    }
    const linenItems = this.store
      .list("linen_items", (i) => i.property_id === pid && i.is_active)
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));
    const standards = this.store.list("room_linen_standards", (s) => s.property_id === pid);
    return {
      ok: true,
      category_id: categoryId,
      bed_config_id: bedConfigId,
      lines: linenMatrixForCategoryBed(linenItems, standards, categoryId, bedConfigId)
    };
  }

  handle(identity, method, path, body = {}, query = {}, headers = {}) {
    const propertyId = query.propertyId || headers["x-linos-property-id"] || "";
    const idem = headers["x-idempotency-key"] || body.idempotency_key || "";

    if (method === "GET" && path === "/session") return this.session(identity, propertyId);
    if (method === "GET" && path === "/bootstrap") return this.bootstrap(identity, propertyId);
    if (method === "GET" && path === "/setup/starters") {
      const access = this.requireSuperadmin(identity, propertyId);
      const kind = query.propertyKind || query.kind || access.property?.property_kind || "hotel";
      return this.setupStarters(kind);
    }
    if (method === "GET" && path === "/setup/properties") return this.listSetupProperties(identity);
    if (method === "GET" && path === "/setup/state") return this.getSetupState(identity, propertyId);
    if (method === "GET" && path === "/setup/readiness") return this.getSetupReadiness(identity, propertyId);
    if (method === "POST" && path === "/setup/property") {
      return this.createSetupProperty(identity, body, idem);
    }
    if (method === "PATCH" && path === "/setup/property") {
      return this.updateSetupProperty(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/setup/room-types") {
      return this.saveSetupRoomTypes(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/setup/beds") {
      return this.saveSetupBeds(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/setup/linen-items") {
      return this.saveSetupLinenItems(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/setup/standards") {
      return this.saveSetupStandards(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/setup/rooms/bulk") {
      return this.bulkCreateSetupRooms(identity, propertyId, body, idem);
    }
    if (method === "PATCH" && path.startsWith("/setup/rooms/")) {
      return this.updateSetupRoom(identity, propertyId, path.split("/")[3], body, idem);
    }
    if (method === "DELETE" && path.startsWith("/setup/rooms/")) {
      return this.deactivateSetupRoom(identity, propertyId, path.split("/")[3], idem);
    }
    if (method === "GET" && path === "/setup/linen-matrix") {
      return this.getSetupLinenMatrix(identity, propertyId, query);
    }
    if (method === "POST" && path === "/setup/ops-bootstrap") {
      return this.setupOpsBootstrap(identity, propertyId, body, idem);
    }
    if (method === "GET" && path === "/setup/laundry-brief") {
      return this.getLaundryPickupBrief(identity, propertyId);
    }
    if (method === "GET" && path === "/master") {
      const access = this.resolveAccess(identity, propertyId);
      return { ok: true, master: this.masterData(access) };
    }
    if (method === "GET" && path === "/dashboard") return this.getDashboard(identity, propertyId);
    if (method === "GET" && path === "/dashboard/room-linen") {
      return this.getRoomLinenSnapshotRoom(identity, propertyId, query.roomId || "");
    }
    if (method === "GET" && path === "/rounds/today") {
      const access = this.resolveAccess(identity, propertyId);
      const round = this.getRoundForDate(access, todayDateString(access.property.timezone), query.shift || "AM");
      return { ok: true, round, tasks: round ? this.listTasks(round.id) : [] };
    }
    if (method === "GET" && path.startsWith("/rounds/") && path.endsWith("/board")) {
      return this.getAssignmentBoard(identity, propertyId, path.split("/")[2]);
    }
    if (method === "GET" && path === "/tasks/mine") return this.myTasks(identity, propertyId, query.roundId);
    if (method === "GET" && path === "/verification/queue") {
      return this.verificationQueue(identity, propertyId, query.roundId);
    }
    if (method === "GET" && path === "/cart/suggest") return this.suggestCart(identity, propertyId, query);
    if (method === "GET" && path.startsWith("/evidence/") && path.endsWith("/data")) {
      return this.getEvidenceData(identity, propertyId, path.split("/")[2]);
    }

    if (method === "POST" && path === "/rounds") return this.createOrUpdateRound(identity, propertyId, body, idem);
    if (method === "POST" && path === "/rounds/import-csv") return this.importRoundCsv(identity, propertyId, body, idem);
    if (method === "POST" && path === "/rounds/add-rooms") return this.addRoomsToRound(identity, propertyId, body, idem);
    if (method === "POST" && path === "/rounds/generate") return this.generateFromRules(identity, propertyId, body, idem);
    if (method === "POST" && path === "/rounds/generate-morning") {
      return this.generateMorningBoard(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/rounds/release") return this.releaseRound(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/assign") return this.assignTasks(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/assign-by-rules") {
      return this.runAssignment(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/tasks/auto-assign") {
      return this.runAssignment(identity, propertyId, body, idem);
    }
    if (method === "GET" && path === "/staff/default-floors") {
      return this.listHousekeeperDefaultFloors(identity, propertyId);
    }
    if (method === "POST" && path === "/staff/default-floors") {
      return this.updateHousekeeperDefaultFloors(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/tasks/skip") return this.skipTask(identity, propertyId, body, idem);
    if (method === "POST" && path === "/cart/issue") return this.issueCart(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/start") return this.startTask(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/counts") return this.updateRoomCounts(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/submit") return this.submitTask(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/verify") return this.verifyTask(identity, propertyId, body, idem);
    if (method === "POST" && path === "/tasks/return") return this.returnTask(identity, propertyId, body, idem);
    if (method === "POST" && path === "/exceptions") return this.reportException(identity, propertyId, body, idem);
    if (method === "POST" && path === "/exceptions/guest-claim") {
      return this.updateGuestClaim(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/evidence") return this.uploadEvidence(identity, propertyId, body, idem);
    if (method === "POST" && path === "/admin/entity") return this.saveMasterEntity(identity, propertyId, body, idem);
    if (method === "POST" && path === "/extras/guest-request") {
      return this.guestRequestExtras(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/extras/standing-request") {
      return this.standingGuestRequest(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/extras/standing-stop") {
      return this.stopStandingExtra(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/extras/cancel") return this.cancelExtra(identity, propertyId, body, idem);
    if (method === "POST" && path === "/extras/collect") return this.collectExtra(identity, propertyId, body, idem);
    if (method === "GET" && path === "/extras/kits") {
      const access = this.resolveAccess(identity, propertyId);
      return { ok: true, kits: this.listExtraKits(access.property.id) };
    }
    if (method === "GET" && path === "/transfers/collections") {
      return this.listStoreCollections(identity, propertyId, query);
    }
    if (method === "POST" && path === "/transfers/collections/prepare") {
      return this.prepareStoreCollection(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/transfers/collections/collect") {
      return this.collectStoreCollection(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/transfers/collections/receive") {
      return this.receiveStoreCollection(identity, propertyId, body, idem);
    }
    if (method === "POST" && path === "/transfers/collections/reconcile") {
      return this.reconcileStoreCollection(identity, propertyId, body, idem);
    }

    throw new LinosError(404, "ERR-HTTP-404", `Unknown route ${method} ${path}`);
  }

  resolveGuestRequestTask(access, room, round) {
    let task = this.store.find(
      "room_tasks",
      (t) => t.daily_round_id === round.id && t.room_id === room.id
    );
    if (task) return this.enrichTask(task);

    const created = this.insertRoomTask(access, round, room, {
      task_reason: "guest_extra",
      priority: 5,
      special_instructions: "Guest request / mid-day extra linen"
    });
    const assigned = this.store.update("room_tasks", created.id, {
      assigned_agent_id: access.user.id,
      assigned_at: nowIso(),
      status: "Assigned",
      version: created.version + 1
    });
    return this.enrichTask(assigned);
  }

  expandGuestRequestLines(access, body) {
    const lines = [];
    if (body.kit_code || body.kit_id) {
      const kit = this.store.find(
        "extra_kits",
        (k) =>
          k.property_id === access.property.id &&
          k.is_active &&
          (k.id === body.kit_id || k.code === body.kit_code)
      );
      if (!kit) throw new LinosError(404, "ERR-EXTRA-001", "Extra kit not found.");
      const kitLines = this.store.list("extra_kit_lines", (l) => l.kit_id === kit.id);
      if (!kitLines.length) throw new LinosError(400, "ERR-EXTRA-002", "Kit has no lines.");
      const kitInstanceId = newId("kinst");
      for (const kl of kitLines) {
        lines.push({
          linen_item_id: kl.linen_item_id,
          quantity: Number(kl.quantity || 0) * Number(body.quantity || 1),
          reason_code: body.reason_code || kit.default_reason_code || "GuestRequest",
          kit_id: kit.id,
          kit_instance_id: kitInstanceId
        });
      }
      return lines;
    }
    const items = Array.isArray(body.items) ? body.items : body.linen_item_id ? [body] : [];
    if (!items.length) throw new LinosError(400, "ERR-EXTRA-003", "Provide kit_code or items.");
    for (const item of items) {
      const linenItem = this.store.find(
        "linen_items",
        (i) =>
          i.property_id === access.property.id &&
          (i.id === item.linen_item_id || i.code === item.code)
      );
      if (!linenItem) throw new LinosError(404, "ERR-EXTRA-004", "Linen item not found.");
      const qty = Number(item.quantity || 1);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new LinosError(400, "ERR-EXTRA-005", "Extra quantity must be positive.");
      }
      lines.push({
        linen_item_id: linenItem.id,
        quantity: qty,
        reason_code: body.reason_code || item.reason_code || "GuestRequest",
        kit_id: null,
        kit_instance_id: null
      });
    }
    return lines;
  }

  standingGuestRequest(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    const canService =
      hasCapability(access.capabilities, "room.service") ||
      hasCapability(access.capabilities, "room.verify");
    if (!canService) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: room.service");

    return this.withIdempotency(idempotencyKey, access, () => {
      const room = this.store.find(
        "rooms",
        (r) => r.id === body.room_id && r.property_id === access.property.id && r.is_active
      );
      if (!room) throw new LinosError(404, "ERR-EXTRA-006", "Room not found.");
      let round =
        this.store.find("daily_rounds", (r) => r.id === body.round_id) ||
        this.getRoundForDate(access, todayDateString(access.property.timezone));
      if (!round) throw new LinosError(400, "ERR-EXTRA-012", "No round for today. A supervisor must open the daily round first.");
      if (round.status === "Closed") throw new LinosError(409, "ERR-EXTRA-007", "Round is closed.");
      if (round.status === "Draft") {
        if (!hasCapability(access.capabilities, "round.release")) {
          throw new LinosError(409, "ERR-EXTRA-013", "Round is not active yet.");
        }
        round = this.store.update("daily_rounds", round.id, {
          status: "Active",
          released_by: access.user.id,
          released_at: nowIso(),
          version: round.version + 1
        });
      }
      const task = this.resolveGuestRequestTask(access, room, round);
      if (!hasCapability(access.capabilities, "room.verify") && task.assigned_agent_id !== access.user.id) {
        throw new LinosError(403, "ERR-TASK-005", "This room is not assigned to you.");
      }
      const expanded = this.expandGuestRequestLines(access, body);
      const created = [];
      for (const spec of expanded) {
        const request = this.store.insert("standing_extra_requests", {
          id: newId("sxr"),
          property_id: access.property.id,
          room_id: room.id,
          linen_item_id: spec.linen_item_id,
          kit_id: spec.kit_id,
          quantity: spec.quantity,
          current_installed_qty: 0,
          reason_code: EXTRA_REASON_CODES.includes(spec.reason_code) ? spec.reason_code : "GuestRequest",
          reason_note: body.reason_note || null,
          requested_source: EXTRA_SOURCES.includes(body.requested_source) ? body.requested_source : "guest",
          status: "Active",
          start_service_date: body.start_service_date || round.service_date,
          stopped_service_date: null,
          stopped_by_user_id: null,
          stop_reason: null,
          requested_by_user_id: access.user.id
        });
        this.ensureStandingExtraLinesForRound(round);
        const line = this.store.find(
          "room_task_extra_lines",
          (candidate) => candidate.room_task_id === task.id && candidate.standing_extra_request_id === request.id
        );
        if (body.deliver_now && line) {
          const qty = Number(request.quantity || 0);
          this.postMovement(access, {
            linen_item_id: request.linen_item_id,
            quantity: qty,
            from_bucket: "CleanAtRoom",
            to_bucket: "InstalledInRoom",
            from_room_id: room.id,
            to_room_id: room.id,
            room_id: room.id,
            room_task_id: task.id,
            reference_type: "standing_extra_request",
            reference_id: request.id,
            reason: `Standing extra initial install: ${request.reason_code}`
          });
          this.store.update("room_task_extra_lines", line.id, {
            status: "Installed",
            clean_in_qty: qty,
            not_changed_qty: 0,
            replenishment_outcome: "initial_install"
          });
          this.store.update("standing_extra_requests", request.id, { current_installed_qty: qty });
        }
        created.push(this.standingExtraView(request));
      }
      this.audit(access, "room.standing_extra.add", "room", room.id, {
        round_id: round.id,
        request_ids: created.map((request) => request.id),
        deliver_now: Boolean(body.deliver_now)
      });
      return { ok: true, task: this.enrichTask(this.store.find("room_tasks", (t) => t.id === task.id)), requests: created };
    });
  }

  stopStandingExtra(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    const canService =
      hasCapability(access.capabilities, "room.service") ||
      hasCapability(access.capabilities, "room.verify");
    if (!canService) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: room.service");
    return this.withIdempotency(idempotencyKey, access, () => {
      const request = this.store.find("standing_extra_requests", (row) => row.id === body.standing_extra_id);
      if (!request || request.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-EXTRA-014", "Standing extra request not found.");
      }
      const room = this.store.find("rooms", (r) => r.id === request.room_id);
      if (!hasCapability(access.capabilities, "room.verify")) {
        const task = this.store.find(
          "room_tasks",
          (candidate) => candidate.room_id === request.room_id && candidate.daily_round_id === body.round_id
        );
        if (!task || task.assigned_agent_id !== access.user.id) {
          throw new LinosError(403, "ERR-TASK-005", "This room is not assigned to you.");
        }
      }
      if (request.status !== "Active") {
        return { ok: true, request: this.standingExtraView(request), already_stopped: true };
      }
      const currentInstalled = Number(request.current_installed_qty || 0);
      const collectQty = Math.max(0, Number(body.collect_qty ?? currentInstalled));
      if (collectQty > currentInstalled) {
        throw new LinosError(400, "ERR-EXTRA-015", "Collected quantity cannot exceed the installed standing-extra quantity.");
      }
      const currentTask = body.round_id
        ? this.store.find(
            "room_tasks",
            (candidate) => candidate.room_id === request.room_id && candidate.daily_round_id === body.round_id
          )
        : null;
      const currentLine = currentTask
        ? this.store.find(
            "room_task_extra_lines",
            (line) => line.room_task_id === currentTask.id && line.standing_extra_request_id === request.id
          )
        : null;
      if (collectQty > 0) {
        this.postMovement(access, {
          linen_item_id: request.linen_item_id,
          quantity: collectQty,
          from_bucket: "InstalledInRoom",
          to_bucket: "SoiledAtRoom",
          from_room_id: request.room_id,
          to_room_id: request.room_id,
          room_id: request.room_id,
          room_task_id: currentTask?.id || null,
          reference_type: "standing_extra_stop",
          reference_id: request.id,
          reason: `Standing extra stopped: ${body.reason || "No longer required"}`
        });
        if (currentLine) {
          this.store.update("room_task_extra_lines", currentLine.id, {
            status: "Collected",
            soiled_out_qty: collectQty,
            not_changed_qty: Math.max(0, Number(currentLine.quantity || request.quantity) - collectQty),
            replenishment_outcome: "stopped"
          });
        }
      }
      const updated = this.store.update("standing_extra_requests", request.id, {
        status: "Stopped",
        current_installed_qty: Math.max(0, currentInstalled - collectQty),
        stopped_service_date: body.stop_service_date || todayDateString(access.property.timezone),
        stopped_by_user_id: access.user.id,
        stop_reason: String(body.reason || "No longer required").slice(0, 500)
      });
      this.audit(access, "room.standing_extra.stop", "standing_extra_request", request.id, {
        room_id: room?.id,
        reason: updated.stop_reason,
        collected_qty: collectQty
      });
      return { ok: true, request: this.standingExtraView(updated), collected_qty: collectQty };
    });
  }

  guestRequestExtras(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    const canService =
      hasCapability(access.capabilities, "room.service") ||
      hasCapability(access.capabilities, "room.verify");
    if (!canService) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: room.service");

    return this.withIdempotency(idempotencyKey, access, () => {
      const room = this.store.find(
        "rooms",
        (r) => r.id === body.room_id && r.property_id === access.property.id && r.is_active
      );
      if (!room) throw new LinosError(404, "ERR-EXTRA-006", "Room not found.");

      let round =
        this.store.find("daily_rounds", (r) => r.id === body.round_id) ||
        this.getRoundForDate(access, todayDateString(access.property.timezone));
      if (!round) {
        throw new LinosError(
          400,
          "ERR-EXTRA-012",
          "No round for today. A supervisor must open the daily round first."
        );
      }
      if (round.status === "Closed") {
        throw new LinosError(409, "ERR-EXTRA-007", "Round is closed.");
      }
      if (round.status === "Draft") {
        if (!hasCapability(access.capabilities, "round.release")) {
          throw new LinosError(409, "ERR-EXTRA-013", "Round is not active yet.");
        }
        this.store.update("daily_rounds", round.id, {
          status: "Active",
          released_by: access.user.id,
          released_at: nowIso(),
          version: round.version + 1
        });
        round = this.store.find("daily_rounds", (r) => r.id === round.id);
      }

      const task = this.resolveGuestRequestTask(access, room, round);
      if (!hasCapability(access.capabilities, "room.verify") && task.assigned_agent_id !== access.user.id) {
        throw new LinosError(403, "ERR-TASK-005", "This room is not assigned to you.");
      }

      const reason_code = EXTRA_REASON_CODES.includes(body.reason_code) ? body.reason_code : null;
      const source = EXTRA_SOURCES.includes(body.requested_source) ? body.requested_source : "guest";
      const deliverNow = Boolean(body.deliver_now);
      const expanded = this.expandGuestRequestLines(access, {
        ...body,
        reason_code: reason_code || body.reason_code
      });

      const created = [];
      for (const spec of expanded) {
        const code = EXTRA_REASON_CODES.includes(spec.reason_code) ? spec.reason_code : "GuestRequest";
        let line = this.store.insert("room_task_extra_lines", {
          id: newId("rtx"),
          property_id: access.property.id,
          room_task_id: task.id,
          room_id: room.id,
          daily_round_id: round.id,
          linen_item_id: spec.linen_item_id,
          quantity: spec.quantity,
          clean_in_qty: deliverNow ? spec.quantity : 0,
          soiled_out_qty: 0,
          reason_code: code,
          reason_note: body.reason_note || null,
          requested_by_user_id: access.user.id,
          requested_source: source,
          approved_by_user_id: null,
          status: deliverNow ? "Installed" : "Requested",
          kit_id: spec.kit_id,
          kit_instance_id: spec.kit_instance_id
        });

        if (deliverNow) {
          this.postMovement(access, {
            linen_item_id: spec.linen_item_id,
            quantity: spec.quantity,
            from_bucket: "CleanAtRoom",
            to_bucket: "InstalledInRoom",
            from_room_id: room.id,
            to_room_id: room.id,
            room_id: room.id,
            room_task_id: task.id,
            reference_type: "room_task_extra",
            reference_id: line.id,
            reason: `Extra install: ${code}`
          });
        }
        created.push(this.enrichExtraLine(line));
      }

      this.audit(access, deliverNow ? "room.extra.deliver" : "room.extra.add", "room_task", task.id, {
        room_id: room.id,
        deliver_now: deliverNow,
        lines: created.map((l) => ({ id: l.id, item: l.item?.code, qty: l.quantity, reason: l.reason_code }))
      });

      return {
        ok: true,
        task: this.enrichTask(this.store.find("room_tasks", (t) => t.id === task.id)),
        extras: created,
        deliver_now: deliverNow
      };
    });
  }

  cancelExtra(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    const canService =
      hasCapability(access.capabilities, "room.service") ||
      hasCapability(access.capabilities, "room.verify");
    if (!canService) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: room.service");

    return this.withIdempotency(idempotencyKey, access, () => {
      const line = this.store.find("room_task_extra_lines", (l) => l.id === body.extra_line_id);
      if (!line || line.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-EXTRA-008", "Extra line not found.");
      }
      if (!["Requested", "Loaded"].includes(line.status)) {
        throw new LinosError(409, "ERR-EXTRA-009", "Only requested/loaded extras can be cancelled.");
      }
      const task = this.requireAgentTask(access, line.room_task_id);
      const updated = this.store.update("room_task_extra_lines", line.id, { status: "Cancelled" });
      this.audit(access, "room.extra.cancel", "room_task_extra_line", line.id, {
        task_id: task.id,
        reason: body.reason || null
      });
      return { ok: true, extra: this.enrichExtraLine(updated), task: this.enrichTask(task) };
    });
  }

  collectExtra(identity, propertyId, body = {}, idempotencyKey = "") {
    const access = this.resolveAccess(identity, propertyId);
    const canService =
      hasCapability(access.capabilities, "room.service") ||
      hasCapability(access.capabilities, "room.verify");
    if (!canService) throw new LinosError(403, "ERR-AUTHZ-001", "Missing capability: room.service");

    return this.withIdempotency(idempotencyKey, access, () => {
      const line = this.store.find("room_task_extra_lines", (l) => l.id === body.extra_line_id);
      if (!line || line.property_id !== access.property.id) {
        throw new LinosError(404, "ERR-EXTRA-008", "Extra line not found.");
      }
      if (line.status !== "Installed") {
        throw new LinosError(409, "ERR-EXTRA-010", "Only installed extras can be collected.");
      }
      const task = this.requireAgentTask(access, line.room_task_id);
      const qty = Number(body.quantity || line.quantity || 0);
      if (qty <= 0) throw new LinosError(400, "ERR-EXTRA-011", "Collect quantity must be positive.");

      this.postMovement(access, {
        linen_item_id: line.linen_item_id,
        quantity: qty,
        from_bucket: "InstalledInRoom",
        to_bucket: "SoiledAtRoom",
        from_room_id: line.room_id,
        to_room_id: line.room_id,
        room_id: line.room_id,
        room_task_id: task.id,
        reference_type: "room_task_extra",
        reference_id: line.id,
        reason: `Extra soiled collect: ${line.reason_code}`
      });
      const updated = this.store.update("room_task_extra_lines", line.id, {
        status: "Collected",
        soiled_out_qty: qty
      });
      this.audit(access, "room.extra.collect", "room_task_extra_line", line.id, {
        task_id: task.id,
        quantity: qty
      });
      return { ok: true, extra: this.enrichExtraLine(updated), task: this.enrichTask(task) };
    });
  }
}

function storeOrSkipPar(store, roomId, linenItemId, par) {
  const existing = store.find(
    "room_par_levels",
    (p) => p.room_id === roomId && p.linen_item_id === linenItemId
  );
  if (existing) {
    store.update("room_par_levels", existing.id, { par_quantity: par });
  } else {
    store.insert("room_par_levels", {
      id: newId("par"),
      room_id: roomId,
      linen_item_id: linenItemId,
      par_quantity: par
    });
  }
}
