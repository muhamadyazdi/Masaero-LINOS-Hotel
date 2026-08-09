import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/core/memoryStore.mjs";
import { HotelService } from "../src/core/service.mjs";
import {
  parseCsv,
  assertNoGuestPiiHeaders,
  DEFAULT_ROOMS_PER_AGENT,
  roleLabel,
  ROLES
} from "../src/core/model.mjs";
import { DEMO_ROOM_PLAN } from "../src/core/seed.mjs";

function setup() {
  const store = createMemoryStore();
  const service = new HotelService(store);
  service.ensureDemo();
  const supervisor = { email: "supervisor@linos.hotel", sub: "local:supervisor@linos.hotel" };
  const agent1 = { email: "agent1@linos.hotel", sub: "local:agent1@linos.hotel" };
  const agent2 = { email: "agent2@linos.hotel", sub: "local:agent2@linos.hotel" };
  return { store, service, supervisor, agent1, agent2 };
}

/** Required params for rule-based assignment (replaces one-click auto-assign). */
function assignmentRules(overrides = {}) {
  return {
    confirm: true,
    rules: {
      rooms_per_housekeeper: DEFAULT_ROOMS_PER_AGENT,
      prefer_default_floors: true,
      keep_floor_clusters: true,
      allow_soft_overfill: true,
      max_floors_per_housekeeper: 0,
      amendments_notes: "",
      confirm: true,
      ...overrides
    }
  };
}

test("role labels never say Station", () => {
  assert.equal(roleLabel("Station Supervisor"), "Supervisor");
  assert.equal(roleLabel("Station Agent"), "Housekeeper");
  assert.ok(!roleLabel("Station Agent").includes("Station"));
});

test("starter workspace creates hotel-native topology", () => {
  const { service } = setup();
  const session = service.session({ email: "supervisor@linos.hotel" }, "");
  assert.equal(session.property.is_demo, false);
  assert.equal(session.property.location_model, "hotel_room_store_laundry");
  assert.equal(session.property.demo_disclaimer, "Masaero LINOS Hotel starter workspace.");
  assert.match(session.property.positioning, /Masaero LINOS Hotel/i);
  assert.equal(session.user.role_label, "Supervisor");

  const master = service.masterData(service.resolveAccess({ email: "supervisor@linos.hotel" }, ""));
  assert.equal(master.rooms.length, DEMO_ROOM_PLAN.total);
  assert.equal(master.familyCounts.Superior, 280);
  assert.equal(master.familyCounts.Deluxe, 168);
  assert.equal(master.familyCounts.Club, 50);
  assert.equal(master.familyCounts.Presidential, 2);
  assert.ok(master.stores.length >= 1);
  assert.ok(master.laundryProviders.length >= 1);
  assert.ok(master.amenityLocations.some((a) => a.code === "CLUB-LOUNGE"));
  assert.ok(!master.stations);
  assert.ok(master.rooms.every((r) => !r.station_id));
  assert.ok(master.rooms[0].required_linen.length > 0);
  assert.ok(master.extraKits?.length >= 5);
});

test("demo staff roster has 35 housekeepers and 4 supervisors", () => {
  const { store, service } = setup();
  service.ensureDemo();
  const users = store.list("users", (u) => u.is_active);
  const hk = users.filter((u) => u.role_name === ROLES.STATION_AGENT);
  const sv = users.filter((u) => u.role_name === ROLES.STATION_SUPERVISOR);
  assert.equal(hk.length, 35);
  assert.equal(sv.length, 4);
  assert.ok(users.some((u) => u.email === "agent1@linos.hotel"));
  assert.ok(users.some((u) => u.email === "agent2@linos.hotel"));
  assert.ok(users.some((u) => u.email === "hk35@linos.hotel"));
  assert.ok(users.some((u) => u.email === "supervisor4@linos.hotel"));
  const housekeepers = users.filter((u) => u.role_name === ROLES.STATION_AGENT);
  assert.ok(housekeepers.every((u) => service.defaultFloorsForUser(u.id).length === 1));
  const floorsA = store.list(
    "user_floor_assignments",
    (a) => a.user_id === store.find("users", (u) => u.email === "agent1@linos.hotel").id
  );
  assert.ok(floorsA.every((f) => f.floor_number >= 5 && f.floor_number <= 11));
});

test("InstalledInRoom seeded to fitted qty", () => {
  const { service, store } = setup();
  const access = service.resolveAccess({ email: "supervisor@linos.hotel" }, "");
  const room = store.list("rooms", (r) => r.property_id === access.property.id)[0];
  const fitted = service.requiredLinenForRoom(room);
  assert.ok(fitted.length > 0);
  for (const line of fitted) {
    const bal = store.find(
      "stock_balances",
      (s) =>
        s.room_id === room.id &&
        s.linen_item_id === line.linen_item_id &&
        s.bucket === "InstalledInRoom"
    );
    assert.equal(bal?.quantity, line.quantity);
  }
});

test("furnishings include curtains with family-varying quantities", () => {
  const { service } = setup();
  const master = service.masterData(service.resolveAccess({ email: "supervisor@linos.hotel" }, ""));
  const codes = new Set(master.linenItems.map((i) => i.code));
  for (const code of ["CUR", "SHR", "BLK", "RUN", "CC"]) assert.ok(codes.has(code), code);

  const superior = master.rooms.find((r) => r.category?.family === "Superior");
  const club = master.rooms.find((r) => r.category?.family === "Club");
  const suite = master.rooms.find((r) => r.category?.family === "Suite");
  const presidential = master.rooms.find((r) => r.category?.family === "Presidential");

  const curQty = (room) => room.required_linen.find((l) => l.code === "CUR")?.quantity;
  assert.equal(curQty(superior), 1);
  assert.equal(curQty(club), 2);
  assert.equal(curQty(suite), 3);
  assert.equal(curQty(presidential), 4);
  assert.ok(superior.required_linen.every((l) => l.quantity > 0));
});

test("CSV import rejects guest PII by default", () => {
  const { headers } = parseCsv("room_number,guest_name\n1501,Ada");
  assert.throws(() => assertNoGuestPiiHeaders(headers, false), /Guest PII/);
});

test("full Phase 1 room flow: generate, assign, cart, service, verify", () => {
  const { service, supervisor, agent1, store } = setup();

  const generated = service.generateFromRules(supervisor, "", { rule_code: "STAYOVER" });
  assert.ok(generated.added > 0);
  const roundId = generated.round.id;

  const released = service.releaseRound(supervisor, "", { round_id: roundId });
  assert.equal(released.round.status, "Active");

  const assigned = service.runAssignment(supervisor, "", {
    round_id: roundId,
    ...assignmentRules()
  });
  assert.equal(assigned.board.unassigned.length, 0);
  assert.equal(assigned.board.planning_rooms_per_agent, DEFAULT_ROOMS_PER_AGENT);

  const agentWithRooms = assigned.board.byAgent.find((b) => b.room_count > 0);
  assert.ok(agentWithRooms);
  // Pin work to agent1 for the remainder of the flow (35 HK roster).
  assignAllTo(service, supervisor, roundId, "agent1@linos.hotel");

  const cart = service.issueCart(agent1, "", { round_id: roundId });
  assert.equal(cart.cart.status, "Issued");
  assert.equal(cart.cart.source, "room_stock");
  assert.ok(cart.lines.length > 0);

  const mine = service.myTasks(agent1, "", roundId);
  const task = mine.tasks[0];
  const beforeInstalled = store
    .list("stock_balances", (s) => s.room_id === task.room_id && s.bucket === "InstalledInRoom")
    .reduce((sum, s) => sum + s.quantity, 0);

  service.startTask(agent1, "", { task_id: task.id });
  service.updateRoomCounts(agent1, "", { task_id: task.id, matches_standard: true });

  const submitted = service.submitTask(agent1, "", { task_id: task.id });
  assert.equal(submitted.task.status, "Submitted");

  const soiled = store
    .list("stock_balances", (s) => s.bucket === "SoiledAtRoom" && s.room_id === task.room_id)
    .some((s) => s.quantity > 0);
  assert.equal(soiled, true);

  const afterInstalled = store
    .list("stock_balances", (s) => s.room_id === task.room_id && s.bucket === "InstalledInRoom")
    .reduce((sum, s) => sum + s.quantity, 0);
  assert.equal(afterInstalled, beforeInstalled);

  const fittedTx = store.list(
    "linen_transactions",
    (t) => t.room_task_id === task.id && t.reason === "Fitted soiled linen out" && t.status === "Posted"
  );
  assert.ok(fittedTx.length > 0);
  assert.equal(fittedTx[0].from_bucket, "InstalledInRoom");

  const verified = service.verifyTask(supervisor, "", { task_id: task.id });
  assert.equal(verified.task.status, "Verified");
});

function assignAllTo(service, supervisor, roundId, agentEmail) {
  const agent = service.store.find("users", (u) => u.email === agentEmail);
  const tasks = service.listTasks(roundId).map((t) => t.id);
  return service.assignTasks(supervisor, "", {
    round_id: roundId,
    agent_id: agent.id,
    task_ids: tasks
  });
}

test("cart issue draws clean stock from each room", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "VIP" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  const mine = service.myTasks(agent1, "", generated.round.id);
  assert.ok(mine.tasks.length > 0);
  const before = mine.tasks.map((t) => ({
    room_id: t.room_id,
    qty: service.store
      .list("stock_balances", (s) => s.room_id === t.room_id && s.bucket === "CleanAtRoom")
      .reduce((sum, s) => sum + s.quantity, 0)
  }));
  service.issueCart(agent1, "", { round_id: generated.round.id });
  for (const row of before) {
    const after = service.store
      .list("stock_balances", (s) => s.room_id === row.room_id && s.bucket === "CleanAtRoom")
      .reduce((sum, s) => sum + s.quantity, 0);
    assert.ok(after < row.qty, "room clean stock should decrease");
  }
});

test("exception requires evidence before submit", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "VIP" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  service.issueCart(agent1, "", { round_id: generated.round.id });

  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];
  const category = service.store.find("exception_categories", (c) => c.code === "DAMAGED");
  service.reportException(agent1, "", {
    task_id: task.id,
    exception_category_id: category.id,
    quantity: 1,
    mark_guest_claim: true
  });

  assert.throws(
    () => service.submitTask(agent1, "", { task_id: task.id }),
    (err) => err.code === "ERR-EVID-003"
  );

  service.uploadEvidence(agent1, "", {
    task_id: task.id,
    data_base64: Buffer.from("fake-image").toString("base64"),
    file_name: "stain.jpg",
    content_type: "image/jpeg"
  });

  const submitted = service.submitTask(agent1, "", { task_id: task.id });
  assert.equal(submitted.task.status, "Submitted");
});

test("agent cannot verify rooms", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "CHECKOUT" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];
  service.updateRoomCounts(agent1, "", { task_id: task.id, matches_standard: true });
  service.submitTask(agent1, "", { task_id: task.id });
  assert.throws(
    () => service.verifyTask(agent1, "", { task_id: task.id }),
    (err) => err.status === 403
  );
});

test("minimum planning value does not block assignments above the minimum", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "STAYOVER" });
  const tasks = generated.tasks.slice(0, 18).map((t) => t.id);
  const result = service.assignTasks(supervisor, "", {
    round_id: generated.round.id,
    agent_id: service.store.find("users", (u) => u.email === "agent1@linos.hotel").id,
    task_ids: tasks
  });
  assert.equal(result.warning, null);
  assert.ok(result.board.byAgent.find((b) => b.agent.email === agent1.email).room_count >= 16);
});

test("assignment board suggests rooms per housekeeper from workload and available staff", () => {
  const { service, supervisor } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "STAYOVER" });
  const board = service.assignmentBoard(service.resolveAccess(supervisor, ""), generated.round.id);
  assert.equal(board.assignment_workload_rooms, generated.tasks.length);
  assert.equal(board.available_housekeepers, 35);
  assert.equal(
    board.suggested_rooms_per_housekeeper,
    Math.ceil(generated.tasks.length / board.available_housekeepers)
  );
});

test("return for correction allows resubmit with ledger reversal", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "STAYOVER" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  service.issueCart(agent1, "", { round_id: generated.round.id });
  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];
  service.updateRoomCounts(agent1, "", { task_id: task.id, matches_standard: true });
  service.submitTask(agent1, "", { task_id: task.id });
  service.returnTask(supervisor, "", { task_id: task.id, reason: "Counts look high" });
  const returned = service.store.find("room_tasks", (t) => t.id === task.id);
  assert.equal(returned.status, "ReturnedForCorrection");
  service.submitTask(agent1, "", { task_id: task.id });
  const resubmitted = service.store.find("room_tasks", (t) => t.id === task.id);
  assert.equal(resubmitted.status, "Submitted");
  const reversed = service.store.list(
    "linen_transactions",
    (t) => t.room_task_id === task.id && t.status === "Reversed"
  );
  assert.ok(reversed.length > 0);
});

test("idempotent assign replay returns same payload", () => {
  const { service, supervisor } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "VIP" });
  const agent = service.store.find("users", (u) => u.email === "agent2@linos.hotel");
  const taskIds = generated.tasks.slice(0, 2).map((t) => t.id);
  const key = "idem-assign-1";
  const first = service.assignTasks(
    supervisor,
    "",
    { round_id: generated.round.id, agent_id: agent.id, task_ids: taskIds },
    key
  );
  const second = service.assignTasks(
    supervisor,
    "",
    { round_id: generated.round.id, agent_id: agent.id, task_ids: taskIds },
    key
  );
  assert.deepEqual(second, first);
});

test("admin can amend room particulars via saveMasterEntity", () => {
  const { service, supervisor } = setup();
  const access = service.resolveAccess(supervisor, "");
  const room = service.masterData(access).rooms[0];
  assert.ok(room);

  const saved = service.saveMasterEntity(supervisor, "", {
    entity: "rooms",
    record: {
      id: room.id,
      room_number: room.room_number,
      floor_number: room.floor_number,
      category_id: room.category_id,
      bed_config_id: room.bed_config_id,
      special_notes: "Amended for VIP stay",
      is_active: true
    }
  });
  assert.equal(saved.record.id, room.id);
  assert.equal(saved.record.special_notes, "Amended for VIP stay");

  const refreshed = service.masterData(access).rooms.find((r) => r.id === room.id);
  assert.equal(refreshed.special_notes, "Amended for VIP stay");
});

test("room-level linen requirements override category standards for one room", () => {
  const { service, supervisor } = setup();
  const access = service.resolveAccess(supervisor, "");
  const master = service.masterData(access);
  const room = master.rooms.find((r) => r.category?.family === "Superior");
  assert.ok(room);
  const bathrobe = master.linenItems.find((i) => i.code === "BR");
  const curtain = master.linenItems.find((i) => i.code === "CUR");
  assert.ok(bathrobe && curtain);

  assert.equal(
    room.required_linen.some((l) => l.linen_item_id === bathrobe.id),
    false
  );
  const beforeCurtain = room.required_linen.find((l) => l.linen_item_id === curtain.id)?.quantity;
  assert.equal(beforeCurtain, 1);

  service.saveMasterEntity(supervisor, "", {
    entity: "room_linen_requirements",
    record: { room_id: room.id, linen_item_id: bathrobe.id, included: true, quantity: 2 }
  });
  service.saveMasterEntity(supervisor, "", {
    entity: "room_linen_requirements",
    record: { room_id: room.id, linen_item_id: curtain.id, included: false, quantity: 0 }
  });

  const updated = service.masterData(access).rooms.find((r) => r.id === room.id);
  assert.equal(updated.required_linen.find((l) => l.linen_item_id === bathrobe.id)?.quantity, 2);
  assert.equal(
    updated.required_linen.some((l) => l.linen_item_id === curtain.id),
    false
  );

  const sibling = service
    .masterData(access)
    .rooms.find((r) => r.id !== room.id && r.category_id === room.category_id && r.bed_config_id === room.bed_config_id);
  assert.ok(sibling);
  assert.equal(
    sibling.required_linen.some((l) => l.linen_item_id === bathrobe.id),
    false
  );
  assert.equal(sibling.required_linen.find((l) => l.linen_item_id === curtain.id)?.quantity, 1);

  const catalogue = service.catalogueLinenForRoom(updated);
  assert.ok(catalogue.length === master.linenItems.length);
  assert.equal(catalogue.find((l) => l.linen_item_id === bathrobe.id)?.included, true);
  assert.equal(catalogue.find((l) => l.linen_item_id === curtain.id)?.included, false);
});

test("fitted ceiling blocks over-standard counts; matches_standard leaves extras", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "VIP" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];
  const line = task.linen_lines[0];

  assert.throws(
    () =>
      service.updateRoomCounts(agent1, "", {
        task_id: task.id,
        lines: [
          {
            linen_item_id: line.linen_item_id,
            linen_out_qty: line.standard_qty,
            linen_in_qty: line.standard_qty + 1
          }
        ]
      }),
    (err) => err.code === "ERR-TASK-020"
  );

  service.guestRequestExtras(agent1, "", {
    room_id: task.room_id,
    round_id: generated.round.id,
    kit_code: "PILLOW",
    deliver_now: false
  });
  service.updateRoomCounts(agent1, "", { task_id: task.id, matches_standard: true });
  const refreshed = service.enrichTask(service.store.find("room_tasks", (t) => t.id === task.id));
  assert.ok(refreshed.extra_lines.some((e) => e.status === "Requested"));
  assert.ok(refreshed.linen_lines.every((l) => l.linen_in_qty === l.standard_qty));
});

test("cart suggest includes open extras", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "VIP" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];
  const before = service.suggestCart(agent1, "", { round_id: generated.round.id });
  service.guestRequestExtras(agent1, "", {
    room_id: task.room_id,
    round_id: generated.round.id,
    kit_code: "TOWEL_BATH",
    deliver_now: false
  });
  const after = service.suggestCart(agent1, "", { round_id: generated.round.id });
  assert.ok(after.open_extras_pieces >= 1);
  assert.ok(after.open_extras_pieces > (before.open_extras_pieces || 0));
});

test("guest request deliver_now installs extras and blues snapshot", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateFromRules(supervisor, "", { rule_code: "VIP" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];

  const result = service.guestRequestExtras(agent1, "", {
    room_id: task.room_id,
    round_id: generated.round.id,
    kit_code: "PILLOW",
    deliver_now: true
  });
  assert.equal(result.deliver_now, true);
  assert.ok(result.extras.every((e) => e.status === "Installed"));

  const access = service.resolveAccess(supervisor, "");
  const snap = service.dashboard(access).roomLinenSnapshot;
  const roomSnap = snap.rooms.find((r) => r.room_id === task.room_id);
  assert.ok(roomSnap);
  assert.equal(roomSnap.status, "extra");
  assert.ok(roomSnap.extra_piece_total >= 1);
});

test("standing guest extras recur daily and hand over DND rooms", () => {
  const { service, supervisor, agent1, agent2, store } = setup();
  const first = service.generateFromRules(supervisor, "", { rule_code: "VIP", service_date: "2026-08-07" });
  service.releaseRound(supervisor, "", { round_id: first.round.id });
  assignAllTo(service, supervisor, first.round.id, "agent1@linos.hotel");
  const firstTask = service.myTasks(agent1, "", first.round.id).tasks[0];

  const standing = service.standingGuestRequest(agent1, "", {
    room_id: firstTask.room_id,
    round_id: first.round.id,
    kit_code: "PILLOW",
    deliver_now: false
  });
  const firstExtra = standing.task.extra_lines.find((line) => line.standing_extra_request_id);
  assert.ok(firstExtra);
  assert.equal(firstExtra.status, "Requested");

  service.issueCart(agent1, "", { round_id: first.round.id });
  service.startTask(agent1, "", { task_id: firstTask.id });
  service.updateRoomCounts(agent1, "", { task_id: firstTask.id, matches_standard: true });
  const firstExtraQty = firstExtra.quantity;
  const firstSubmitted = service.submitTask(agent1, "", {
    task_id: firstTask.id,
    service_outcome: "partial",
    service_outcome_reason: "Guest asked to keep one pillow unchanged",
    extra_lines: [
      {
        id: firstExtra.id,
        clean_in_qty: 1,
        soiled_out_qty: 0,
        not_changed_qty: Math.max(0, firstExtraQty - 1),
        replenishment_outcome: "partial"
      }
    ]
  });
  assert.equal(firstSubmitted.task.service_outcome, "partial");
  const request = store.find("standing_extra_requests", (row) => row.id === firstExtra.standing_extra_request_id);
  assert.equal(request.status, "Active");
  assert.equal(request.current_installed_qty, 1);

  const second = service.createOrUpdateRound(supervisor, "", { service_date: "2026-08-08", shift: "AM" });
  service.addRoomsToRound(supervisor, "", {
    service_date: "2026-08-08",
    shift: "AM",
    room_ids: [firstTask.room_id],
    task_reason: "stayover"
  });
  service.releaseRound(supervisor, "", { round_id: second.round.id });
  const secondTask = service.listTasks(second.round.id)[0];
  const secondExtra = secondTask.extra_lines.find((line) => line.standing_extra_request_id === request.id);
  assert.ok(secondExtra, "active standing extra should be carried into the next round");

  const agent2User = store.find("users", (user) => user.email === agent2.email);
  service.assignTasks(supervisor, "", {
    round_id: second.round.id,
    agent_id: agent2User.id,
    task_ids: [secondTask.id]
  });
  service.startTask(agent2, "", { task_id: secondTask.id });
  service.submitTask(agent2, "", {
    task_id: secondTask.id,
    service_outcome: "dnd",
    service_outcome_reason: "DND sign displayed — change later",
    lines: secondTask.linen_lines.map((line) => ({
      linen_item_id: line.linen_item_id,
      linen_out_qty: 0,
      linen_in_qty: 0,
      unused_return_qty: 0,
      missing_qty: 0,
      damaged_qty: 0,
      stained_qty: 0
    })),
    extra_lines: [
      {
        id: secondExtra.id,
        clean_in_qty: 0,
        soiled_out_qty: 0,
        not_changed_qty: secondExtra.quantity,
        replenishment_outcome: "dnd"
      }
    ]
  });
  const board = service.assignmentBoard(service.resolveAccess(supervisor, ""), second.round.id);
  assert.equal(board.follow_up.length, 1);
  assert.equal(board.follow_up[0].service_outcome, "dnd");
  assert.match(board.follow_up[0].service_outcome_reason, /DND/);

  service.stopStandingExtra(supervisor, "", {
    standing_extra_id: request.id,
    round_id: second.round.id,
    reason: "Guest checked out"
  });
  const third = service.createOrUpdateRound(supervisor, "", { service_date: "2026-08-09", shift: "AM" });
  service.addRoomsToRound(supervisor, "", {
    service_date: "2026-08-09",
    shift: "AM",
    room_ids: [firstTask.room_id],
    task_reason: "checkout"
  });
  assert.equal(service.listTasks(third.round.id)[0].extra_lines.some((line) => line.standing_extra_request_id), false);
});

test("dashboard roomLinenSnapshot has status rules", () => {
  const { service, supervisor } = setup();
  const access = service.resolveAccess(supervisor, "");
  const dash = service.dashboard(access);
  assert.ok(dash.roomLinenSnapshot);
  assert.ok(dash.roomLinenSnapshot.rooms.length === DEMO_ROOM_PLAN.total);
  assert.ok(dash.roomLinenSnapshot.summary.normal > 0);
  const sample = dash.roomLinenSnapshot.rooms.find((r) => r.status === "normal");
  assert.ok(sample);
  assert.ok(sample.lines.every((l) => l.item_status !== "short"));
});

test("morning board: ~80% occupied on board, vacant excluded, uniqueness", () => {
  const { service, supervisor } = setup();
  const total = DEMO_ROOM_PLAN.total;
  const result = service.generateMorningBoard(supervisor, "", {
    occupancy_pct: 80,
    checkout_pct_of_occupied: 40,
    vip_pct_of_occupied: 3,
    dnd_pct_of_stayover: 4,
    no_service_pct_of_occupied: 1,
    mode: "replace",
    seed: 42
  });

  const expectedOccupied = Math.round(total * 0.8);
  const expectedVacant = total - expectedOccupied;
  const expectedCheckout = Math.round(expectedOccupied * 0.4);

  assert.equal(result.tasks.length, expectedOccupied);
  assert.equal(result.summary.vacant, expectedVacant);
  assert.equal(result.summary.occupied, expectedOccupied);
  assert.equal(result.summary.service_rooms, expectedOccupied);
  assert.ok(Math.abs(result.tasks.length / total - 0.8) < 0.01);

  const roomIds = result.tasks.map((t) => t.room_id);
  assert.equal(new Set(roomIds).size, roomIds.length);
  assert.ok(result.tasks.every((t) => t.occupancy_status && t.occupancy_status !== "vacant"));

  // Checkout % labels only — every non-skipped occupied room is a linen-change task
  const change = result.tasks.filter((t) => t.status !== "Skipped");
  const skipped = result.tasks.filter((t) => t.status === "Skipped");
  assert.equal(change.length + skipped.length, expectedOccupied);
  assert.ok(change.every((t) => Number(t.estimated_linen_pieces) > 0));
  assert.ok(skipped.every((t) => ["dnd", "no_service"].includes(t.skip_reason)));

  // Checkout + stayover occupancy labels (VIP overlays keep occupancy_status)
  assert.equal(result.summary.checkout + result.summary.stayover + result.summary.skipped, expectedOccupied);
  assert.equal(result.summary.planned_checkout, expectedCheckout);
  assert.ok(result.summary.vip > 0);
  assert.ok(result.summary.skipped > 0);
  assert.equal(result.summary.change_tasks, change.length);
});

test("morning board: checkout pct labels stayover vs checkout; both get linen change", () => {
  const { service, supervisor } = setup();
  const result = service.generateMorningBoard(supervisor, "", {
    occupancy_pct: 80,
    checkout_pct_of_occupied: 40,
    vip_pct_of_occupied: 0,
    dnd_pct_of_stayover: 0,
    no_service_pct_of_occupied: 0,
    mode: "replace",
    seed: 7
  });
  const occupied = Math.round(DEMO_ROOM_PLAN.total * 0.8);
  const checkout = Math.round(occupied * 0.4);
  const stayover = occupied - checkout;
  assert.equal(result.summary.checkout, checkout);
  assert.equal(result.summary.stayover, stayover);
  assert.equal(result.summary.skipped, 0);
  assert.equal(result.summary.change_tasks, occupied);
  assert.ok(result.tasks.every((t) => t.status === "Unassigned"));
  assert.ok(
    result.tasks.every(
      (t) => t.occupancy_status === "occupied_checkout" || t.occupancy_status === "occupied_stayover"
    )
  );
});

test("occupied morning-board rooms remain soiled until housekeeper records service", () => {
  const { service, supervisor, agent1 } = setup();
  const generated = service.generateMorningBoard(supervisor, "", {
    occupancy_pct: 2,
    checkout_pct_of_occupied: 50,
    vip_pct_of_occupied: 0,
    dnd_pct_of_stayover: 0,
    no_service_pct_of_occupied: 0,
    mode: "replace",
    seed: 17
  });
  const roundId = generated.round.id;
  service.releaseRound(supervisor, "", { round_id: roundId });
  assignAllTo(service, supervisor, roundId, "agent1@linos.hotel");

  const access = service.resolveAccess(supervisor, "");
  const beforeBoard = service.assignmentBoard(access, roundId);
  const beforeTask = beforeBoard.byAgent
    .flatMap((bucket) => bucket.tasks)
    .find((task) => task.occupancy_status === "occupied_checkout" || task.occupancy_status === "occupied_stayover");
  assert.ok(beforeTask);
  assert.equal(beforeTask.service_required, true);
  assert.equal(beforeTask.service_state, "soiled");
  assert.ok(beforeBoard.follow_up.some((task) => task.id === beforeTask.id));

  const beforeSnapshot = service.dashboard(access).roomLinenSnapshot.rooms.find(
    (room) => room.room_id === beforeTask.room_id
  );
  assert.equal(beforeSnapshot.status, "soiled");
  assert.equal(beforeSnapshot.service_required, true);
  assert.equal(beforeSnapshot.base_status, "normal");

  service.issueCart(agent1, "", { round_id: roundId });
  service.startTask(agent1, "", { task_id: beforeTask.id });
  service.updateRoomCounts(agent1, "", { task_id: beforeTask.id, matches_standard: true });
  const submitted = service.submitTask(agent1, "", { task_id: beforeTask.id });
  assert.equal(submitted.task.status, "Submitted");

  const afterSnapshot = service.dashboard(access).roomLinenSnapshot.rooms.find(
    (room) => room.room_id === beforeTask.room_id
  );
  assert.equal(afterSnapshot.service_required, false);
  assert.equal(afterSnapshot.service_state, "serviced");
  assert.notEqual(afterSnapshot.status, "soiled");
});

test("morning board: replace clears prior tasks; merge keeps uniqueness", () => {
  const { service, supervisor } = setup();
  const first = service.generateMorningBoard(supervisor, "", {
    occupancy_pct: 50,
    checkout_pct_of_occupied: 40,
    mode: "replace",
    seed: 1
  });
  assert.ok(first.tasks.length > 0);

  const replaced = service.generateMorningBoard(supervisor, "", {
    occupancy_pct: 80,
    checkout_pct_of_occupied: 40,
    mode: "replace",
    seed: 2
  });
  assert.equal(replaced.tasks.length, Math.round(DEMO_ROOM_PLAN.total * 0.8));
  assert.equal(new Set(replaced.tasks.map((t) => t.room_id)).size, replaced.tasks.length);

  const merged = service.generateMorningBoard(supervisor, "", {
    occupancy_pct: 80,
    checkout_pct_of_occupied: 40,
    mode: "merge",
    seed: 2
  });
  assert.equal(merged.added, 0);
  assert.equal(merged.tasks.length, replaced.tasks.length);
  assert.equal(new Set(merged.tasks.map((t) => t.room_id)).size, merged.tasks.length);
});

test("morning board: same seed is deterministic", () => {
  const a = setup();
  const b = setup();
  const body = {
    occupancy_pct: 80,
    checkout_pct_of_occupied: 40,
    vip_pct_of_occupied: 3,
    dnd_pct_of_stayover: 4,
    no_service_pct_of_occupied: 1,
    mode: "replace",
    seed: 99
  };
  const left = a.service.generateMorningBoard(a.supervisor, "", body);
  const right = b.service.generateMorningBoard(b.supervisor, "", body);
  assert.deepEqual(
    left.tasks.map((t) => [t.room?.room_number, t.occupancy_status, t.task_reason, t.status]),
    right.tasks.map((t) => [t.room?.room_number, t.occupancy_status, t.task_reason, t.status])
  );
});

test("POST /rounds/generate-morning via handle", () => {
  const { service, supervisor } = setup();
  const data = service.handle(supervisor, "POST", "/rounds/generate-morning", {
    occupancy_pct: 80,
    checkout_pct_of_occupied: 40,
    seed: 3
  });
  assert.equal(data.ok, true);
  assert.ok(data.summary);
  assert.equal(data.tasks.length, Math.round(DEMO_ROOM_PLAN.total * 0.8));
});

function distinctAgentsOnFloor(board, floor) {
  const ids = new Set();
  for (const bucket of board.byAgent) {
    if (bucket.tasks.some((t) => t.room?.floor_number === floor)) ids.add(bucket.agent.id);
  }
  return ids;
}

test("rule assignment: floor with ≤15 rooms goes to one housekeeper", () => {
  const { service, supervisor, store } = setup();
  const rooms = store.list("rooms", (r) => r.floor_number === 5).slice(0, 12);
  assert.equal(rooms.length, 12);
  const created = service.addRoomsToRound(supervisor, "", {
    service_date: "2099-03-01",
    shift: "AM",
    room_ids: rooms.map((r) => r.id),
    task_reason: "stayover"
  });
  const assigned = service.runAssignment(supervisor, "", {
    round_id: created.round.id,
    ...assignmentRules()
  });
  assert.equal(assigned.board.unassigned.length, 0);
  assert.equal(distinctAgentsOnFloor(assigned.board, 5).size, 1);
  const agentId = [...distinctAgentsOnFloor(assigned.board, 5)][0];
  const floors = service.defaultFloorsForUser(agentId);
  assert.ok(floors.includes(5), "prefers housekeeper with floor 5 in default floors");
});

test("rule assignment: large floor clusters into ~planning-sized HK blocks", () => {
  const { service, supervisor, store } = setup();
  const rooms = store.list("rooms", (r) => r.floor_number === 29);
  assert.ok(rooms.length >= 25);
  const created = service.addRoomsToRound(supervisor, "", {
    service_date: "2099-03-02",
    shift: "AM",
    room_ids: rooms.map((r) => r.id),
    task_reason: "stayover"
  });
  const assigned = service.runAssignment(supervisor, "", {
    round_id: created.round.id,
    ...assignmentRules()
  });
  const hkCount = distinctAgentsOnFloor(assigned.board, 29).size;
  assert.ok(hkCount >= 2 && hkCount <= 3, `expected ~2 HKs for 25 rooms, got ${hkCount}`);
  assert.ok(hkCount < 10, "must not spray floor across many housekeepers");

  for (const bucket of assigned.board.byAgent.filter((b) => b.room_count > 0)) {
    const floors = new Set(bucket.tasks.map((t) => t.room.floor_number));
    assert.equal(floors.size, 1, "each active HK should be clustered on one floor in this round");
    const roomNums = bucket.tasks.map((t) => t.room.room_number).sort();
    const sorted = [...roomNums].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    assert.deepEqual(roomNums.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), sorted);
  }
});

test("rule assignment prefers default floors and updates after edit", () => {
  const { service, supervisor, store } = setup();
  const agent1 = store.find("users", (u) => u.email === "agent1@linos.hotel");
  const agent30 = store.find("users", (u) => u.email === "hk32@linos.hotel");
  assert.ok(service.defaultFloorsForUser(agent1.id).includes(5));
  assert.ok(service.defaultFloorsForUser(agent30.id).includes(29));

  const floor5 = store.list("rooms", (r) => r.floor_number === 5).slice(0, 10);
  const roundA = service.addRoomsToRound(supervisor, "", {
    service_date: "2099-03-03",
    shift: "AM",
    room_ids: floor5.map((r) => r.id),
    task_reason: "stayover"
  });
  const first = service.runAssignment(supervisor, "", {
    round_id: roundA.round.id,
    ...assignmentRules()
  });
  const firstAgent = [...distinctAgentsOnFloor(first.board, 5)][0];
  assert.ok(service.defaultFloorsForUser(firstAgent).includes(5));

  // Move agent1 home floors to club; clear other band-A HKs from floor 29 so preference is clear.
  service.updateHousekeeperDefaultFloors(supervisor, "", { user_id: agent1.id, floors: [29, 30] });
  assert.deepEqual(service.defaultFloorsForUser(agent1.id), [29, 30]);

  // Preserve edits across ensureDemo (no profile bump).
  service.ensureDemo();
  assert.deepEqual(service.defaultFloorsForUser(agent1.id), [29, 30]);

  const club = store.list("rooms", (r) => r.floor_number === 29).slice(0, 8);
  const roundB = service.addRoomsToRound(supervisor, "", {
    service_date: "2099-03-04",
    shift: "AM",
    room_ids: club.map((r) => r.id),
    task_reason: "stayover"
  });
  const second = service.runAssignment(supervisor, "", {
    round_id: roundB.round.id,
    ...assignmentRules()
  });
  const clubAgents = distinctAgentsOnFloor(second.board, 29);
  assert.ok(
    clubAgents.has(agent1.id) || [...clubAgents].some((id) => service.defaultFloorsForUser(id).includes(29)),
    "club floor should go to HKs whose defaults include 29"
  );
  // agent1 is now defaulted to 29 — with empty load they are a preferred candidate
  assert.ok(clubAgents.has(agent1.id), "after edit, agent1 should receive floor 29 work");
});

test("rule assignment rejects run without confirmed parameters", () => {
  const { service, supervisor, store } = setup();
  const rooms = store.list("rooms", (r) => r.floor_number === 5).slice(0, 4);
  const created = service.addRoomsToRound(supervisor, "", {
    service_date: "2099-03-06",
    shift: "AM",
    room_ids: rooms.map((r) => r.id),
    task_reason: "stayover"
  });
  assert.throws(
    () => service.runAssignment(supervisor, "", { round_id: created.round.id }),
    (err) => err.status === 400 && /parameters|confirm/i.test(err.message)
  );
  assert.throws(
    () =>
      service.handle(supervisor, "POST", "/tasks/auto-assign", {
        round_id: created.round.id
      }),
    (err) => err.status === 400
  );
});

test("supervisors can edit housekeeper default floors via API", () => {
  const { service, supervisor, agent1 } = setup();
  const listed = service.handle(supervisor, "GET", "/staff/default-floors");
  assert.ok(listed.housekeepers.length >= 35);
  assert.ok(listed.floors.includes(5));

  const hk = listed.housekeepers.find((h) => h.email === "agent2@linos.hotel");
  const updated = service.handle(supervisor, "POST", "/staff/default-floors", {
    user_id: hk.id,
    floors: [19, 20, 21]
  });
  assert.deepEqual(updated.user.default_floors, [19, 20, 21]);
  assert.deepEqual(service.defaultFloorsForUser(hk.id), [19, 20, 21]);

  assert.throws(
    () => service.handle(agent1, "POST", "/staff/default-floors", { user_id: hk.id, floors: [5] }),
    (err) => err.status === 403
  );
});

test("rule assignment ignores skipped rooms and reports assigned count", () => {
  const { service, supervisor, store } = setup();
  const rooms = store.list("rooms", (r) => r.floor_number === 5).slice(0, 6);
  const created = service.addRoomsToRound(supervisor, "", {
    service_date: "2099-03-05",
    shift: "AM",
    room_ids: rooms.map((r) => r.id),
    task_reason: "stayover"
  });
  const tasks = store.list("room_tasks", (t) => t.daily_round_id === created.round.id);
  store.update("room_tasks", tasks[0].id, { status: "Skipped", skip_reason: "dnd" });

  const access = service.resolveAccess(supervisor, "");
  const before = service.assignmentBoard(access, created.round.id);
  assert.equal(before.unassigned.length, 5);
  assert.ok(!before.unassigned.some((t) => t.status === "Skipped"));

  const result = service.runAssignment(supervisor, "", {
    round_id: created.round.id,
    ...assignmentRules({ amendments_notes: "Skip DND already marked" })
  });
  assert.equal(result.assigned, 5);
  assert.equal(result.board.unassigned.length, 0);
  const skipped = store.find("room_tasks", (t) => t.id === tasks[0].id);
  assert.equal(skipped.status, "Skipped");
  assert.ok(!skipped.assigned_agent_id, "skipped rooms must not receive an assignee");
});

test("changing room category clears room linen overrides", () => {
  const { service, supervisor, store } = setup();
  const room = store.list("rooms", (r) => r.floor_number === 5)[0];
  const item = store.list("linen_items", (i) => i.is_active)[0];
  const deluxe = store.find("room_categories", (c) => c.family === "Deluxe");
  assert.ok(deluxe);
  assert.notEqual(room.category_id, deluxe.id);

  service.saveMasterEntity(supervisor, "", {
    entity: "room_linen_requirements",
    record: { room_id: room.id, linen_item_id: item.id, included: false, quantity: 0 }
  });
  assert.ok(store.list("room_linen_requirements", (r) => r.room_id === room.id).length >= 1);

  service.saveMasterEntity(supervisor, "", {
    entity: "rooms",
    record: {
      id: room.id,
      room_number: room.room_number,
      floor_number: room.floor_number,
      category_id: deluxe.id,
      bed_config_id: room.bed_config_id,
      is_active: true
    }
  });
  assert.equal(store.find("rooms", (r) => r.id === room.id).category_id, deluxe.id);
  assert.equal(store.list("room_linen_requirements", (r) => r.room_id === room.id).length, 0);
});

test("hotel setup: supervisor cannot access setup APIs", () => {
  const { service, supervisor } = setup();
  assert.throws(
    () => service.handle(supervisor, "GET", "/setup/properties"),
    (err) => err.status === 403
  );
  assert.throws(
    () => service.handle(supervisor, "POST", "/setup/property", { name: "Nope Hotel" }),
    (err) => err.status === 403
  );
});

test("free trial registration creates a commercial hotel workspace", () => {
  const store = createMemoryStore();
  const service = new HotelService(store);
  const result = service.createTrialAccount({
    display_name: "Alex Tan",
    email: "alex@harbourview.example",
    hotel_name: "Harbour View Hotel",
    password: "secure-pass-123"
  });
  assert.equal(result.ok, true);
  assert.equal(result.property.name, "Harbour View Hotel");
  assert.equal(result.property.is_demo, false);
  assert.equal(result.property.subscription_plan, "free_trial");
  assert.equal(result.trial.days, 14);
  assert.equal(store.raw.users.length, 1);
  assert.equal(store.raw.room_categories.length, 4);
  assert.equal(store.raw.rooms.length, 0);
});

test("authenticated users can submit product feedback", () => {
  const { service } = setup();
  const result = service.submitFeedback(
    { email: "supervisor@linos.hotel" },
    { category: "Usability", message: "Remember the supervisor's selected floor." }
  );
  assert.equal(result.ok, true);
  assert.equal(result.feedback.category, "Usability");
  assert.equal(result.feedback.status, "received");
});

test("hotel setup: superadmin creates hotel through readiness and morning board", () => {
  const { service, store } = setup();
  const superadmin = { email: "muhamadyazdi@gmail.com", sub: "local:muhamadyazdi@gmail.com" };

  const created = service.handle(superadmin, "POST", "/setup/property", {
    name: "Harbour View Pilot",
    code: "HVP",
    timezone: "Asia/Kuala_Lumpur",
    address_line: "Test Road"
  });
  assert.equal(created.property.code, "HVP");
  assert.equal(created.property.is_demo, false);
  const propertyId = created.property.id;

  service.handle(superadmin, "POST", "/setup/room-types", { use_starters: true }, { propertyId }, {
    "x-linos-property-id": propertyId
  });
  service.handle(superadmin, "POST", "/setup/beds", { use_starters: true }, { propertyId }, {
    "x-linos-property-id": propertyId
  });
  service.handle(superadmin, "POST", "/setup/linen-items", { use_starters: true }, { propertyId }, {
    "x-linos-property-id": propertyId
  });
  service.handle(
    superadmin,
    "POST",
    "/setup/standards",
    { use_defaults: true, replace: true },
    { propertyId },
    { "x-linos-property-id": propertyId }
  );

  const state = service.handle(superadmin, "GET", "/setup/state", {}, { propertyId }, {
    "x-linos-property-id": propertyId
  });
  const categoryId = state.roomCategories[0].id;
  const bedId = state.bedConfigs[0].id;

  const bulk = service.handle(
    superadmin,
    "POST",
    "/setup/rooms/bulk",
    {
      floor_from: 3,
      floor_to: 4,
      rooms_per_floor: 5,
      default_category_id: categoryId,
      default_bed_config_id: bedId
    },
    { propertyId },
    { "x-linos-property-id": propertyId }
  );
  assert.equal(bulk.created, 10);

  service.handle(
    superadmin,
    "POST",
    "/setup/ops-bootstrap",
    {
      store_name: "Harbour Linen Store",
      housekeeper_count: 4,
      supervisor_count: 1,
      store_stock_per_item: 100
    },
    { propertyId },
    { "x-linos-property-id": propertyId }
  );

  const setupHousekeepers = store.list(
    "users",
    (u) => u.property_id === propertyId && u.role_name === ROLES.STATION_AGENT && u.is_active
  );
  assert.equal(setupHousekeepers.length, 4);
  assert.ok(setupHousekeepers.every((u) => service.defaultFloorsForUser(u.id).length === 1));

  const ready = service.handle(superadmin, "GET", "/setup/readiness", {}, { propertyId }, {
    "x-linos-property-id": propertyId
  });
  assert.equal(ready.readiness.ready, true);

  const rooms = store.list("rooms", (r) => r.property_id === propertyId && r.is_active);
  assert.equal(rooms.length, 10);

  // Superadmin has * capabilities — morning board smoke on the new property.
  const morning = service.handle(
    superadmin,
    "POST",
    "/rounds/generate-morning",
    { occupancy_pct: 80, checkout_pct: 40, mode: "replace", service_date: "2099-08-06" },
    { propertyId },
    { "x-linos-property-id": propertyId }
  );
  assert.ok(morning.round);
  assert.ok((morning.tasks || []).length > 0);
});

test("phase 2 room-to-store collection is piece-counted and role enforced", () => {
  const { service, supervisor, agent1, store } = setup();
  const porter = { email: "porter@linos.hotel", sub: "local:porter@linos.hotel" };
  const storeAgent = { email: "store@linos.hotel", sub: "local:store@linos.hotel" };
  const generated = service.generateFromRules(supervisor, "", { rule_code: "STAYOVER" });
  service.releaseRound(supervisor, "", { round_id: generated.round.id });
  assignAllTo(service, supervisor, generated.round.id, "agent1@linos.hotel");
  service.issueCart(agent1, "", { round_id: generated.round.id });

  const task = service.myTasks(agent1, "", generated.round.id).tasks[0];
  service.startTask(agent1, "", { task_id: task.id });
  service.updateRoomCounts(agent1, "", { task_id: task.id, matches_standard: true });
  service.submitTask(agent1, "", { task_id: task.id });
  service.verifyTask(supervisor, "", { task_id: task.id });

  const storeLocation = store.find("stores", (s) => s.is_active);
  const prepared = service.prepareStoreCollection(porter, "", {
    round_id: generated.round.id,
    store_id: storeLocation.id,
    floor_number: task.room.floor_number
  });
  assert.equal(prepared.collection.status, "Prepared");
  assert.ok(prepared.collection.lines.length > 0);
  const firstLine = prepared.collection.lines[0];
  assert.ok(firstLine.expected_qty > 0);

  const collected = service.collectStoreCollection(porter, "", {
    collection_id: prepared.collection.id,
    lines: [{ line_id: firstLine.id, collected_qty: firstLine.expected_qty }]
  });
  assert.equal(collected.collection.status, "Collected");
  assert.equal(collected.collection.lines[0].collected_qty, firstLine.expected_qty);

  assert.throws(
    () => service.receiveStoreCollection(porter, "", { collection_id: prepared.collection.id }),
    (err) => err.status === 403
  );

  const receivedQty = Math.max(0, firstLine.expected_qty - 1);
  const received = service.receiveStoreCollection(storeAgent, "", {
    collection_id: prepared.collection.id,
    lines: [{ line_id: firstLine.id, received_qty: receivedQty }]
  });
  assert.equal(received.collection.status, "Received");
  assert.equal(received.collection.lines[0].variance_qty, receivedQty - firstLine.expected_qty);

  const reconciled = service.reconcileStoreCollection(storeAgent, "", {
    collection_id: prepared.collection.id,
    reason: "Piece count checked at store"
  });
  assert.equal(reconciled.collection.status, "Reconciled");
  assert.equal(reconciled.variances.length, receivedQty === firstLine.expected_qty ? 0 : 1);

  const roomSoiled = store.find(
    "stock_balances",
    (s) =>
      s.room_id === firstLine.room_id &&
      s.linen_item_id === firstLine.linen_item_id &&
      s.bucket === "SoiledAtRoom"
  );
  assert.equal(roomSoiled?.quantity || 0, 0);
  const storeSoiled = store.find(
    "stock_balances",
    (s) =>
      s.store_id === storeLocation.id &&
      s.linen_item_id === firstLine.linen_item_id &&
      s.bucket === "SoiledAtStore"
  );
  assert.equal(storeSoiled?.quantity, firstLine.expected_qty);
});
