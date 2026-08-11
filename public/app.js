const state = {
  token: localStorage.getItem("linos_hotel_token") || "",
  session: null,
  master: null,
  round: null,
  tasks: [],
  board: null,
  dashboard: null,
  myTasks: [],
  queue: [],
  collections: [],
  cartSuggest: null,
  activeTaskId: null,
  view: "dashboard",
  selectedRoomId: "",
  selectedSnapshotRoomId: "",
  selectedAssignTaskId: "",
  roomFilterFloor: "",
  roomFilterFamily: "",
  snapshotFilterFloor: "",
  assignFilterFloor: "",
  assignUnassignedOnly: false,
  defaultFloorsEditUserId: "",
  guestRequestOpen: false,
  guestRequestRoomId: "",
  dashboardPollTimer: null,
  clockTimer: null,
  morningOccupancy: 80,
  morningCheckout: 40,
  morningMode: "replace",
  morningSummary: null,
  roundTaskFilter: "all",
  roundFilterFloor: "",
  openAfterActivate: true,
  otherWaysOpen: false,
  activePropertyId: localStorage.getItem("linos_hotel_property_id") || "",
  setupStep: 1,
  setupState: null,
  setupProperties: [],
  setupBulkPreview: null,
  setupForceCreate: false,
  authMode: "login",
  authBusy: false,
  dashboardLoading: false,
  demoPickerOpen: false,
  loginEmailDraft: "",
  loginPasswordDraft: "",
  assignParams: {
    prefer_default_floors: true,
    amendments_notes: ""
  },
  assignParamsSaved: false,
  setupRoomDraft: null,
  setupEditingRoomId: null,
  setupExceptionRoomId: null,
  setupExceptionDraft: null,
  setupMatrixCategoryId: "",
  setupMatrixBedId: "",
  laundryBrief: null,
  setupGuideDismissed: {},
  setupGuideKey: null,
  infoPopover: null
};

/** Layman explanations for info-icon popovers. */
const HELP_TERMS = Object.freeze({
  morning_board: {
    title: "Morning board",
    body: "Today’s list of rooms that need linen service. A Supervisor (or you, if you run the place yourself) marks which rooms are occupied, then activates the list so work can be assigned."
  },
  todays_rooms: {
    title: "Today’s rooms",
    body: "The simple name for your daily service list — which rooms need clean linen today. Same idea as a morning board, without the big-hotel wording."
  },
  assignment: {
    title: "Assignment",
    body: "Who cleans which rooms today. LINOS splits rooms evenly and prefers each housekeeper’s usual floor first. You can always change the list afterward."
  },
  my_rooms: {
    title: "My rooms",
    body: "The housekeeper’s (or owner’s) personal list of rooms to service — record what went out soiled, what went back clean, and any guest extras."
  },
  verification: {
    title: "Verification",
    body: "A Supervisor double-checks a finished room. Useful when you have a team; small owner-run places can leave this off."
  },
  linen_transfers: {
    title: "Linen transfers",
    body: "Moving counted soiled linen from rooms to your store (and later to laundry). Turn this on when you use porters or a linen store."
  },
  laundry_operations: {
    title: "Laundry Operations",
    body: "How dirty linen gets washed: in-house, via AeroSparkle, or another third party. You can change this later — it is not required to start."
  },
  fitted: {
    title: "What’s normally in the room",
    body: "The standard set of sheets, towels, and other pieces that belong in that room type. Guest extras are separate and never change this baseline."
  },
  float_buffer: {
    title: "Float / buffer",
    body: "Extra clean pieces on the cart that are not tied to a specific room — a small spare stash for the round."
  },
  soiled: {
    title: "Soiled / service required",
    body: "An occupied room that still needs today’s linen service. It stays marked until the housekeeper records the room, or until a follow-up is done."
  },
  extras: {
    title: "Guest extras",
    body: "Extra pillows, towels, or kits a guest asked for. These are tracked separately and never inflate the room’s normal fitted set."
  },
  cart: {
    title: "Cart",
    body: "The clean linen load prepared for a housekeeper’s rooms. Suggest = normal room needs + open extras; float is spare buffer."
  },
  housekeeper: {
    title: "Housekeeper",
    body: "The person who services guest rooms and records linen in and out. In a small property this may be you."
  },
  supervisor: {
    title: "Supervisor",
    body: "Runs the daily board, assigns rooms, and can verify finished work. On a small property the owner often wears this hat too."
  },
  hotel_setup: {
    title: "Hotel setup",
    body: "One-time wizard to describe your place, add rooms, choose laundry handling, and confirm you’re ready for daily ops. You can reopen it anytime to amend."
  },
  admin: {
    title: "Admin",
    body: "Day-to-day tweaks after setup — room details, what’s in each room, default floors, and growing into team features."
  },
  occupancy: {
    title: "Occupancy",
    body: "Which rooms have guests today. You confirm this on the morning board (no booking system link yet)."
  },
  owner_mode: {
    title: "Owner mode",
    body: "You run daily rooms yourself without a housekeeper team. You can invite staff later from Hotel setup or Admin."
  }
});

const SETUP_GUIDES = Object.freeze({
  profile: {
    title: "Step guide: Your place",
    body: "Tell us the basics — name, what kind of place you run, and size. This only shapes the starter defaults. You can change everything later."
  },
  types: {
    title: "Step guide: Your room types",
    body: "How many kinds of room does your hotel have? List each type (Superior, Suite…) and the bed layouts you use. Starters are fine to begin — amend anytime."
  },
  catalogue: {
    title: "Step guide: Linen pieces",
    body: "These are the sheet and towel pieces you track. The standard-linen step can load a starter pack; add or rename pieces if your hotel uses different names."
  },
  standards: {
    title: "Step guide: Standard linen by type",
    body: "For each room type, set the normal fitted linen. Walk type by type, adjust quantities, then save. Guest extras stay separate later."
  },
  rooms: {
    title: "Step guide: Rooms & exceptions",
    body: "Add your rooms with a type and bed. Most rooms follow the type standard. If one room is different, mark it as an exception and amend its linen."
  },
  ops: {
    title: "Step guide: Team & laundry",
    body: "Choose whether you run rooms yourself or add starter staff, and how laundry is handled (in-house, AeroSparkle, or another partner). Nothing here is permanent."
  },
  review: {
    title: "Step guide: Linen needs & go live",
    body: "See every linen type and the total quantity your rooms require. Confirm when it looks right — you can amend later from Hotel setup or Admin."
  }
});

const ROOM_FAMILY_ORDER = ["Superior", "Deluxe", "Premier Deluxe", "Club", "Suite", "Presidential"];

function familySlug(family) {
  return String(family || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

/** Effective catalogue for one room: category×bed standard + room-level overrides. */
function catalogueForRoom(room) {
  if (!room) return [];
  const items = state.master?.linenItems || [];
  const standards = (state.master?.roomLinenStandards || []).filter(
    (s) => s.category_id === room.category_id && s.bed_config_id === room.bed_config_id
  );
  const overrides = (state.master?.roomLinenRequirements || []).filter((r) => r.room_id === room.id);
  const stdByItem = new Map(standards.map((s) => [s.linen_item_id, s]));
  const ovByItem = new Map(overrides.map((o) => [o.linen_item_id, o]));
  return items
    .slice()
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name))
    .map((item) => {
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
        quantity,
        included,
        standard_quantity,
        has_override: Boolean(override),
        override_id: override?.id || null
      };
    });
}

const SETUP_STEPS_STANDARD = [
  { id: 1, key: "profile", label: "Hotel profile" },
  { id: 2, key: "types", label: "Room types" },
  { id: 3, key: "standards", label: "Standard linen" },
  { id: 4, key: "rooms", label: "Rooms & exceptions" },
  { id: 5, key: "ops", label: "Team & laundry" },
  { id: 6, key: "review", label: "Linen needs" }
];

const SETUP_STEPS_SMALL = [
  { id: 1, key: "profile", label: "Your place" },
  { id: 2, key: "rooms", label: "Rooms & exceptions" },
  { id: 3, key: "ops", label: "Team & laundry" },
  { id: 4, key: "review", label: "Linen needs" }
];

const DEMO_LOGIN_USERS = [
  { email: "muhamadyazdi@gmail.com", label: "Platform Superadmin" },
  { email: "supervisor@linos.hotel", label: "Supervisor A (Lead)" },
  { email: "agent1@linos.hotel", label: "Housekeeper 01" },
  { email: "porter@linos.hotel", label: "Porter" },
  { email: "store@linos.hotel", label: "Store Agent" }
];

const READINESS_STEP_BY_CHECK_STANDARD = {
  property: 1,
  room_types: 2,
  beds: 2,
  linen: 3,
  standards: 3,
  rooms: 4,
  store: 5,
  operators: 5,
  housekeepers: 5
};

const READINESS_STEP_BY_CHECK_SMALL = {
  property: 1,
  room_types: 2,
  beds: 2,
  linen: 2,
  standards: 2,
  rooms: 2,
  store: 3,
  operators: 3,
  housekeepers: 3
};

function propertyFeatures(property = state.session?.property) {
  return (
    property?.features || {
      owner_mode: true,
      team_mode: false,
      floor_mode: false,
      custody_mode: false,
      laundry_partner: false
    }
  );
}

function isSmallProperty(property = state.setupState?.property || state.session?.property) {
  if (!property) return true;
  if (property.is_demo) return false;
  return (property.property_scale || "small") === "small";
}

function setupStepsFor(property = state.setupState?.property || state.session?.property) {
  return isSmallProperty(property) ? SETUP_STEPS_SMALL : SETUP_STEPS_STANDARD;
}

function firstFailingSetupStep(readiness, property = state.setupState?.property || state.session?.property) {
  const failing = (readiness?.checks || []).find((check) => !check.ok);
  const map = isSmallProperty(property) ? READINESS_STEP_BY_CHECK_SMALL : READINESS_STEP_BY_CHECK_STANDARD;
  const last = setupStepsFor(property).length;
  if (!failing) return last;
  return map[failing.id] || 1;
}

function todayBoardLabel(property = state.session?.property) {
  return isSmallProperty(property) && !propertyFeatures(property).team_mode ? "Today’s rooms" : "Morning board";
}

function todayBoardHelpKey(property = state.session?.property) {
  return isSmallProperty(property) && !propertyFeatures(property).team_mode ? "todays_rooms" : "morning_board";
}

function infoTip(termKey, label = "") {
  const term = HELP_TERMS[termKey];
  if (!term) return label;
  const tip = `<button type="button" class="info-tip" data-info="${termKey}" aria-label="What is ${escapeAttr(
    term.title
  )}?" title="What is this?">i</button>`;
  return label ? `<span class="with-info">${label}${tip}</span>` : tip;
}

function labeledInfo(label, termKey) {
  return infoTip(termKey, label);
}

function renderInfoPopover() {
  const key = state.infoPopover;
  const term = key ? HELP_TERMS[key] : null;
  if (!term) return "";
  return `
    <div class="help-overlay" id="info-popover-overlay" data-close-info="1">
      <div class="help-card" role="dialog" aria-modal="true" aria-labelledby="info-popover-title">
        <h3 id="info-popover-title">${escapeAttr(term.title)}</h3>
        <p>${escapeAttr(term.body)}</p>
        <div class="row"><button class="btn" type="button" id="info-popover-close">Got it</button></div>
      </div>
    </div>`;
}

function renderSetupGuideModal(stepKey) {
  const guide = SETUP_GUIDES[stepKey];
  if (!guide) return "";
  if (state.setupGuideDismissed[stepKey]) return "";
  if (state.setupGuideKey !== stepKey) return "";
  return `
    <div class="help-overlay" id="setup-guide-overlay">
      <div class="help-card help-card-guide" role="dialog" aria-modal="true" aria-labelledby="setup-guide-title">
        <p class="eyebrow">Quick guide</p>
        <h3 id="setup-guide-title">${escapeAttr(guide.title)}</h3>
        <p>${escapeAttr(guide.body)}</p>
        <div class="row">
          <button class="btn" type="button" id="setup-guide-continue" data-guide-key="${stepKey}">Continue</button>
          <button class="btn secondary" type="button" id="setup-guide-skip-all">Skip all guides</button>
        </div>
      </div>
    </div>`;
}

function openSetupGuideForStep(stepKey) {
  if (!SETUP_GUIDES[stepKey]) {
    state.setupGuideKey = null;
    return;
  }
  if (state.setupGuideDismissed[stepKey] || state.setupGuideDismissed.__all) {
    state.setupGuideKey = null;
    return;
  }
  state.setupGuideKey = stepKey;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function isSuperadmin() {
  return Boolean(state.session?.user?.is_superadmin) || can("*");
}

function housekeeperInitials(agent) {
  if (!agent) return "";
  const m = String(agent.display_name || "").match(/(\d+)/);
  if (m) return `H${m[1].padStart(2, "0")}`;
  const parts = String(agent.display_name || agent.email || "?").split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

/** Compact display for default floors, e.g. 5–11, 15. */
function formatFloorList(floors) {
  const sorted = [...new Set((floors || []).map(Number).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  if (!sorted.length) return "None";
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = prev = n;
  }
  return parts.join(", ");
}

function canEditDefaultFloors() {
  return can("admin.assignments") || can("task.assign");
}

function renderDefaultFloorsPanel(board = null) {
  const fromBoard = (board?.byAgent || []).map((b) => ({
    id: b.agent.id,
    display_name: b.agent.display_name,
    hk_number: b.agent.hk_number,
    default_floors: b.default_floors || b.agent.default_floors || []
  }));
  const agents = (fromBoard.length ? fromBoard : state.master?.agents || [])
    .slice()
    .sort(
      (a, b) =>
        (a.hk_number ?? 999) - (b.hk_number ?? 999) ||
        String(a.display_name).localeCompare(String(b.display_name))
    );
  const propertyFloors = board?.property_floors || state.master?.floors || [];
  const editId = state.defaultFloorsEditUserId || agents[0]?.id || "";
  const editing = agents.find((a) => a.id === editId) || agents[0] || null;
  const selectedFloors = new Set(editing?.default_floors || []);
  const editable = canEditDefaultFloors();
  if (!agents.length) {
    return `<section class="panel"><h2>Default floors</h2><p class="lede">No housekeepers available.</p></section>`;
  }

  return `
    <section class="panel">
      <h2>Default floors</h2>
      <p class="lede">Each housekeeper starts with one default floor (used when assignment rules prefer default floors). Supervisors and admins can edit the defaults to add or change floors. Manual assign/reassign for today’s round is always allowed. ${
        editable ? "Supervisors and admins can edit defaults below." : ""
      }</p>
      <div class="grid-2" style="margin-top:0.75rem;gap:1rem">
        <div style="max-height:16rem;overflow:auto">
          <table>
            <thead><tr><th>Housekeeper</th><th>Default floors</th>${editable ? "<th></th>" : ""}</tr></thead>
            <tbody>
              ${agents
                .map(
                  (a) => `
                <tr>
                  <td>${a.display_name}</td>
                  <td>${formatFloorList(a.default_floors)}</td>
                  ${
                    editable
                      ? `<td><button type="button" class="btn secondary default-floors-edit" data-user="${a.id}">Edit</button></td>`
                      : ""
                  }
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        ${
          editable && editing
            ? `<form id="default-floors-form" class="stack" data-user="${editing.id}">
                <label>Housekeeper
                  <select id="default-floors-user">
                    ${agents
                      .map(
                        (a) =>
                          `<option value="${a.id}" ${a.id === editing.id ? "selected" : ""}>${a.display_name}</option>`
                      )
                      .join("")}
                  </select>
                </label>
                <fieldset class="stack" style="border:1px solid var(--line);padding:0.75rem;border-radius:6px">
                  <legend>Default floors</legend>
                  <div class="chip-row" style="flex-wrap:wrap;gap:0.35rem">
                    ${propertyFloors
                      .map(
                        (f) => `
                      <label class="chip-btn ${selectedFloors.has(f) ? "active" : ""}" style="cursor:pointer">
                        <input type="checkbox" name="floors" value="${f}" ${selectedFloors.has(f) ? "checked" : ""} style="margin-right:0.3rem" />
                        ${f}
                      </label>`
                      )
                      .join("")}
                  </div>
                </fieldset>
                <button class="btn" type="submit">Save default floors</button>
              </form>`
            : ""
        }
      </div>
    </section>`;
}

function snapshotStatusClass(status) {
  if (status === "soiled") return "snap-soiled";
  if (status === "partial") return "snap-partial";
  if (status === "insufficient") return "snap-insufficient";
  if (status === "extra") return "snap-extra";
  if (status === "normal") return "snap-normal";
  return "snap-unconfigured";
}

function assignStatusClass(status) {
  const map = {
    Unassigned: "assign-unassigned",
    Assigned: "assign-assigned",
    InProgress: "assign-progress",
    Submitted: "assign-submitted",
    Verified: "assign-verified",
    Skipped: "assign-skipped",
    ReturnedForCorrection: "assign-returned"
  };
  return map[status] || "assign-unassigned";
}

function assignmentCellClass(cell) {
  if (cell.service_state === "soiled") return "assign-soiled";
  if (cell.service_state === "partial") return "assign-partial";
  return assignStatusClass(cell.status);
}

function roomServiceIcon(cell) {
  if (cell.service_state === "soiled") {
    return `<span class="room-service-icon room-service-soiled" title="Soiled — service required" aria-label="Soiled — service required">!</span>`;
  }
  if (cell.service_state === "partial") {
    return `<span class="room-service-icon room-service-partial" title="Partially serviced" aria-label="Partially serviced">~</span>`;
  }
  return "";
}

/** Shared floor×room grid renderer for Admin / Dashboard / Assignment. */
function renderFloorRoomGrid({ cells, selectedId, selectedKey = "id", ariaLabel = "Rooms by floor", cellClass, cellLabel, cellTitle, dataAttr = "data-cell-id" }) {
  const byFloor = new Map();
  for (const cell of cells) {
    const floor = cell.floor_number;
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor).push(cell);
  }
  for (const list of byFloor.values()) {
    list.sort((a, b) =>
      String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true })
    );
  }
  const floorNumbers = [...byFloor.keys()].sort((a, b) => b - a);
  if (!floorNumbers.length) {
    return `<p class="lede">No rooms match the filter.</p>`;
  }
  return `
    <div class="floor-grid-scroll" tabindex="0">
      <div class="floor-grid" role="grid" aria-label="${ariaLabel}">
        ${floorNumbers
          .map((floor) => {
            const floorCells = byFloor.get(floor) || [];
            return `
            <div class="floor-row" role="row" data-floor="${floor}">
              <div class="floor-label" role="rowheader">
                <span class="floor-label-num">Fl ${floor}</span>
                <span class="floor-label-count">${floorCells.length}</span>
              </div>
              <div class="floor-rooms" role="presentation">
                ${floorCells
                  .map((cell) => {
                    const id = cell[selectedKey];
                    const selected = selectedId === id;
                    const cls = typeof cellClass === "function" ? cellClass(cell) : cellClass || "";
                    const label = typeof cellLabel === "function" ? cellLabel(cell) : cell.room_number;
                    const title = typeof cellTitle === "function" ? cellTitle(cell) : `Room ${cell.room_number}`;
                    return `<button type="button" class="room-cell ${cls}${selected ? " selected" : ""}" ${dataAttr}="${id}" role="gridcell" title="${title}" aria-pressed="${selected ? "true" : "false"}">${label}</button>`;
                  })
                  .join("")}
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function $(sel, root = document) {
  return root.querySelector(sel);
}

function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

function can(cap) {
  const caps = state.session?.capabilities || [];
  return caps.includes("*") || caps.includes(cap);
}

function isHousekeeperMode() {
  return can("task.view.assigned") && !can("room.verify") && !can("task.assign");
}

async function api(path, { method = "GET", body, query } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, v);
    });
  }
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${state.token}`
  };
  const propertyId = state.activePropertyId || state.session?.property?.id;
  if (propertyId) headers["x-linos-property-id"] = propertyId;
  if (method !== "GET") headers["x-idempotency-key"] = crypto.randomUUID();

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Request failed (${res.status}). Please try again.`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error?.message || `Request failed (${res.status})`);
  }
  return data;
}

async function login(email, password = "") {
  const data = await api("/auth/local", { method: "POST", body: { email, password } });
  state.token = data.token;
  localStorage.setItem("linos_hotel_token", state.token);
  state.authBusy = false;
  state.demoPickerOpen = false;
  state.loginEmailDraft = "";
  state.loginPasswordDraft = "";
  await bootstrap();
}

async function refreshDashboard({ soft = false } = {}) {
  if (!state.token) return;
  if (!soft) state.dashboardLoading = true;
  try {
    state.dashboard = (await api("/dashboard")).dashboard;
  } finally {
    if (!soft) state.dashboardLoading = false;
  }
}

async function registerTrial(body) {
  try {
    const data = await api("/auth/register", { method: "POST", body });
    state.token = data.token;
    localStorage.setItem("linos_hotel_token", state.token);
    state.activePropertyId = data.session?.property?.id || data.property?.id || "";
    if (state.activePropertyId) localStorage.setItem("linos_hotel_property_id", state.activePropertyId);
    await bootstrap({ preferSetup: true });
  } finally {
    state.authBusy = false;
  }
}

async function applySetupLanding({ preferSetup = false } = {}) {
  if (!isSuperadmin()) return false;
  try {
    const data = await loadSetupState();
    const readiness = data?.readiness;
    if (preferSetup || (readiness && !readiness.ready)) {
      state.view = "hotel-setup";
      state.setupStep = firstFailingSetupStep(readiness);
      return true;
    }
  } catch {
    if (preferSetup) {
      state.view = "hotel-setup";
      state.setupStep = 1;
      return true;
    }
  }
  return false;
}

async function bootstrap({ preferSetup = false } = {}) {
  const query = {};
  if (state.activePropertyId) query.propertyId = state.activePropertyId;
  const data = await api("/bootstrap", { query });
  state.session = data.session;
  state.master = data.master;
  state.round = data.todayRound;
  state.dashboard = data.dashboard || null;
  if (data.session?.property?.id) {
    state.activePropertyId = data.session.property.id;
    localStorage.setItem("linos_hotel_property_id", state.activePropertyId);
  }
  if (state.round) {
    state.tasks = (await api("/rounds/today")).tasks || [];
  }
  if (isHousekeeperMode()) {
    state.view = "agent";
    await loadMyTasks();
  } else {
    await applySetupLanding({ preferSetup });
  }
  render();
  if (!state.dashboard && !isHousekeeperMode() && state.view === "dashboard") {
    try {
      await refreshDashboard();
      if (state.view === "dashboard") render();
    } catch (err) {
      toast(err.message, true);
    }
  }
}

async function loadSetupState() {
  if (!isSuperadmin()) return null;
  const props = await api("/setup/properties");
  state.setupProperties = props.properties || [];
  const data = await api("/setup/state");
  state.setupState = data;
  return data;
}

async function switchProperty(propertyId) {
  state.activePropertyId = propertyId || "";
  if (propertyId) localStorage.setItem("linos_hotel_property_id", propertyId);
  else localStorage.removeItem("linos_hotel_property_id");
  state.round = null;
  state.board = null;
  state.tasks = [];
  state.morningSummary = null;
  await bootstrap();
}

/** Load today's AM round; soft-create Draft when supervisor can build the morning board. */
async function ensureMorningRound() {
  const today = await api("/rounds/today");
  if (today.round) {
    state.round = today.round;
    state.tasks = today.tasks || [];
    return today;
  }
  if (can("round.create")) {
    const created = await api("/rounds", { method: "POST", body: {} });
    state.round = created.round;
    state.tasks = created.tasks || [];
    state.morningSummary = null;
    return created;
  }
  state.round = null;
  state.tasks = [];
  return today;
}

function logout() {
  state.token = "";
  localStorage.removeItem("linos_hotel_token");
  localStorage.removeItem("linos_hotel_property_id");
  state.session = null;
  state.activePropertyId = "";
  state.setupState = null;
  state.authBusy = false;
  state.demoPickerOpen = false;
  state.loginEmailDraft = "";
  state.loginPasswordDraft = "";
  state.authMode = "login";
  render();
}

function badgeClass(status) {
  if (["Verified", "Issued", "Active", "Confirmed", "Resolved"].includes(status)) return "ok";
  if (["Submitted", "Assigned", "InProgress", "Reported"].includes(status)) return "info";
  if (["ReturnedForCorrection", "Unassigned"].includes(status)) return "warn";
  if (["Skipped"].includes(status)) return "danger";
  return "";
}

function itemName(id) {
  return state.master?.linenItems?.find((i) => i.id === id)?.name || id;
}

function renderLogin() {
  const register = state.authMode !== "login";
  const demoOpen = state.demoPickerOpen;
  $("#app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <p class="eyebrow">Masaero</p>
        <h1>Masaero LINOS Hotel</h1>
        <p class="lede">Room linen operations for small hotels, spas, and hospitality — scalable to full hotel teams.</p>
        <div class="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" class="auth-tab ${register ? "active" : ""}" id="auth-register-tab" ${
            state.authBusy ? "disabled" : ""
          }>Start Free Version</button>
          <button type="button" class="auth-tab ${register ? "" : "active"}" id="auth-login-tab" ${
            state.authBusy ? "disabled" : ""
          }>Sign in</button>
        </div>
        ${
          register
            ? `<form id="trial-form" class="stack">
                <label>Your name <input name="display_name" autocomplete="name" required placeholder="Alex Tan" /></label>
                <label>Work email <input name="email" type="email" autocomplete="email" required placeholder="alex@yourhotel.com" /></label>
                <label>Property name <input name="hotel_name" required placeholder="Harbour View Inn" /></label>
                <label>What kind of place?
                  <select name="property_kind">
                    <option value="hotel">Small hotel</option>
                    <option value="boutique">Boutique hotel</option>
                    <option value="spa">Spa</option>
                    <option value="hosted">Hosted / Airbnb-style</option>
                    <option value="other">Other hospitality</option>
                  </select>
                </label>
                <label>Password <input name="password" type="password" minlength="8" autocomplete="new-password" required placeholder="At least 8 characters" /></label>
                <label>Re-enter password <input name="password_confirmation" type="password" minlength="8" autocomplete="new-password" required placeholder="Type the password again" /></label>
                <button class="btn" type="submit" ${state.authBusy ? "disabled" : ""}>${
                  state.authBusy ? "Creating Free Version…" : "Create Free Version"
                }</button>
                <p class="form-hint">Create your free workspace, then add rooms and start today’s service. Team and laundry partner tools unlock when you need them.</p>
              </form>`
            : `<form id="login-form" class="stack">
                <label>Work email <input id="login-email" name="email" type="email" autocomplete="email" required placeholder="you@yourhotel.com" value="${escapeAttr(
                  state.loginEmailDraft
                )}" /></label>
                <label>Password <input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Your password" value="${escapeAttr(
                  state.loginPasswordDraft
                )}" /></label>
                <button class="btn" type="submit" ${state.authBusy ? "disabled" : ""}>${
                  state.authBusy ? "Signing in…" : "Sign in"
                }</button>
                <div class="demo-login">
                  <button type="button" class="demo-login-toggle" id="demo-picker-toggle" ${
                    state.authBusy ? "disabled" : ""
                  } aria-expanded="${demoOpen ? "true" : "false"}">
                    ${demoOpen ? "Hide demo accounts" : "Try the demo workspace"}
                  </button>
                  ${
                    demoOpen
                      ? `<div class="demo-login-panel">
                          <p class="form-hint">Synthetic Masaero demo data. Demo accounts use a blank password.</p>
                          <ul class="demo-login-list">
                            ${DEMO_LOGIN_USERS.map(
                              (u) =>
                                `<li><button type="button" class="demo-login-user" data-demo-email="${u.email}">${u.label}<span>${u.email}</span></button></li>`
                            ).join("")}
                          </ul>
                        </div>`
                      : ""
                  }
                </div>
              </form>`
        }
      </div>
    </div>
  `;
  $("#auth-register-tab")?.addEventListener("click", () => {
    if (state.authBusy) return;
    state.authMode = "register";
    state.demoPickerOpen = false;
    renderLogin();
  });
  $("#auth-login-tab")?.addEventListener("click", () => {
    if (state.authBusy) return;
    state.authMode = "login";
    renderLogin();
  });
  $("#demo-picker-toggle")?.addEventListener("click", () => {
    if (state.authBusy) return;
    state.demoPickerOpen = !state.demoPickerOpen;
    const email = $("#login-email");
    const password = $("#login-password");
    state.loginEmailDraft = email ? email.value : state.loginEmailDraft;
    state.loginPasswordDraft = password ? password.value : state.loginPasswordDraft;
    renderLogin();
  });
  document.querySelectorAll("[data-demo-email]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.authBusy) return;
      state.loginEmailDraft = btn.getAttribute("data-demo-email") || "";
      state.loginPasswordDraft = "";
      const email = $("#login-email");
      const password = $("#login-password");
      if (email) email.value = state.loginEmailDraft;
      if (password) password.value = "";
    });
  });
  $("#trial-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      display_name: String(fd.get("display_name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      hotel_name: String(fd.get("hotel_name") || "").trim(),
      property_kind: String(fd.get("property_kind") || "hotel"),
      property_scale: "small",
      password: String(fd.get("password") || ""),
      password_confirmation: String(fd.get("password_confirmation") || "")
    };
    state.authBusy = true;
    renderLogin();
    try {
      await registerTrial(payload);
    } catch (err) {
      toast(err.message, true);
      state.authBusy = false;
      renderLogin();
    }
  });
  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.loginEmailDraft = String(fd.get("email") || "").trim();
    state.loginPasswordDraft = String(fd.get("password") || "");
    state.authBusy = true;
    renderLogin();
    try {
      await login(state.loginEmailDraft, state.loginPasswordDraft);
    } catch (err) {
      toast(err.message, true);
      state.authBusy = false;
      renderLogin();
    }
  });
}

function navItems() {
  if (isHousekeeperMode()) return [["agent", "My rooms"]];
  const features = propertyFeatures();
  const items = [];
  if (can("dashboard.supervisor") || can("dashboard.agent") || can("dashboard.store") || can("dashboard.porter")) {
    items.push(["dashboard", "Dashboard"]);
  }
  if (can("round.create") || can("task.assign")) items.push(["round", todayBoardLabel()]);
  if ((can("task.assign") || can("admin.assignments")) && features.team_mode) {
    items.push(["assign", "Assignment"]);
  }
  if (can("cart.issue") || can("task.view.assigned") || can("room.service")) items.push(["agent", "My rooms"]);
  if (can("room.verify") && features.team_mode) items.push(["verify", "Verification"]);
  if (can("transfer.view") && (features.custody_mode || features.laundry_partner)) {
    items.push(["transfers", features.custody_mode ? "Linen transfers" : "Laundry"]);
  }
  if (can("admin.configure")) items.push(["admin", "Admin"]);
  if (isSuperadmin()) items.push(["hotel-setup", "Hotel setup"]);
  items.push(["feedback", "Feedback"]);
  return items;
}

function renderTransfers() {
  const features = propertyFeatures();
  const collections = state.collections || [];
  const stores = state.master?.stores || [];
  const canCollect = can("transfer.collect");
  const canReceive = can("transfer.receive");
  const brief = state.laundryBrief;
  const laundryPanel =
    features.laundry_partner || isSuperadmin()
      ? `<section class="panel">
          <h2>${labeledInfo("Laundry Operations", "laundry_operations")}</h2>
          <p class="lede">In-house, AeroSparkle, or another 3rd party. Share a pickup brief when using an external service.</p>
          ${
            brief
              ? `<pre class="laundry-brief">${escapeAttr(brief.summary)}</pre>
                 <div class="row" style="margin-top:0.75rem">
                   <button class="btn secondary" type="button" id="copy-laundry-brief">Copy pickup brief</button>
                   <a class="btn" href="${escapeAttr(brief.booking_url)}" target="_blank" rel="noopener">Open AeroSparkle</a>
                 </div>`
              : `<button class="btn" type="button" id="load-laundry-brief">Prepare pickup brief</button>`
          }
        </section>`
      : "";
  if (!features.custody_mode) {
    return (
      laundryPanel ||
      `<section class="panel"><h2>Laundry</h2><p class="lede">Enable custody mode in Admin to use room-to-store collections, or connect a laundry partner in Hotel setup.</p></section>`
    );
  }
  return `
    ${laundryPanel}
    <section class="panel">
      <h2>${labeledInfo("Linen transfers", "linen_transfers")}</h2>
      <p class="lede">Move counted ${labeledInfo("soiled", "soiled")} linen from rooms to the store, then reconcile receipt variances.</p>
      <div class="callout"><strong>Custody flow:</strong> Prepared → Collected → Received → Reconciled. Each collection line remains tied to its room and linen item.</div>
      ${
        canCollect && state.round?.id && stores.length
          ? `<form id="prepare-collection-form" class="row" style="margin-top:1rem;align-items:end">
              <label>Store<select name="store_id">${stores
                .map((store) => `<option value="${store.id}">${store.name}</option>`)
                .join("")}</select></label>
              <label>Floor (optional)<input name="floor_number" type="number" min="1" placeholder="All floors" /></label>
              <button class="btn" type="submit">Prepare room collection</button>
            </form>`
          : `<p class="lede" style="margin-top:1rem">${
              state.round?.id
                ? "No active store is configured."
                : `Open ${todayBoardLabel().toLowerCase()} before preparing a collection.`
            }</p>`
      }
    </section>
    <section class="panel">
      <h2>Collections</h2>
      ${
        collections.length
          ? collections
              .map(
                (collection) => `
                <article class="transfer-card">
                  <div class="row space-between">
                    <div><strong>${collection.floor_number ? `Floor ${collection.floor_number}` : "All floors"}</strong><span class="muted"> · ${collection.lines.length} lines · ${collection.notes || "No notes"}</span></div>
                    <span class="badge ${badgeClass(collection.status)}">${collection.status}</span>
                  </div>
                  <table>
                    <thead><tr><th>Room</th><th>Item</th><th>Expected</th><th>Collected</th><th>Received</th><th>Variance</th></tr></thead>
                    <tbody>${collection.lines
                      .map(
                        (line) => `<tr><td>${line.room?.room_number || "—"}</td><td>${line.item?.name || line.item?.code || "—"}</td><td>${line.expected_qty}</td><td>${line.collected_qty}</td><td>${line.received_qty}</td><td>${line.variance_qty}</td></tr>`
                      )
                      .join("")}</tbody>
                  </table>
                  <div class="row" style="margin-top:.75rem">
                    ${collection.status === "Prepared" && canCollect ? `<button class="btn" data-collect="${collection.id}">Confirm collection</button>` : ""}
                    ${collection.status === "Collected" && canReceive ? `<button class="btn" data-receive="${collection.id}">Receive at store</button>` : ""}
                    ${collection.status === "Received" && canReceive ? `<button class="btn warn" data-reconcile="${collection.id}">Reconcile collection</button>` : ""}
                  </div>
                </article>`
              )
              .join("")
          : `<p class="lede">No collections for this round yet.</p>`
      }
    </section>`;
}

function shell(content) {
  const user = state.session.user;
  const property = state.session.property;
  const props = state.setupProperties || [];
  const showSwitcher = isSuperadmin() && props.length > 1;
  return `
    <div class="app-shell${isHousekeeperMode() ? " housekeeper-shell" : ""}">
      <header class="topbar">
        <div>
            <p class="brand">Masaero LINOS Hotel<small>${property.name}</small></p>
          ${
            showSwitcher
              ? `<label class="property-switcher">Property
                  <select id="property-switcher" aria-label="Switch property">
                    ${props
                      .map(
                        (p) =>
                          `<option value="${p.id}" ${p.id === property.id ? "selected" : ""}>${p.name}${
                            ""
                          }</option>`
                      )
                      .join("")}
                  </select>
                </label>`
              : ""
          }
        </div>
        <div class="topbar-meta">
          <div>${user.display_name} · ${user.role_label || user.role_name}</div>
          <div id="topbar-clock" aria-live="polite">${formatLiveClock()}</div>
          <button class="btn secondary" id="logout-btn" style="margin-top:0.4rem">Sign out</button>
        </div>
      </header>
      <nav class="nav">
        ${navItems()
          .map(
            ([id, label]) =>
              `<button data-view="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`
          )
          .join("")}
      </nav>
      <main class="main">${content}</main>
      ${renderInfoPopover()}
    </div>
  `;
}

function formatLiveClock() {
  const timeZone = state.session?.property?.timezone || "Asia/Kuala_Lumpur";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date());
}

function startLiveClock() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = setInterval(() => {
    const node = $("#topbar-clock");
    if (!node || !state.session) return;
    node.textContent = formatLiveClock();
  }, 1000);
}

function stopLiveClock() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = null;
}

function renderDashboard() {
  const d = state.dashboard || { alerts: {}, progress: {}, byFloor: [], exceptions: [], roomLinenSnapshot: null };
  const snap = d.roomLinenSnapshot || { summary: {}, rooms: [] };
  let rooms = snap.rooms || [];
  if (state.snapshotFilterFloor) {
    rooms = rooms.filter((r) => String(r.floor_number) === String(state.snapshotFilterFloor));
  }
  const selected =
    rooms.find((r) => r.room_id === state.selectedSnapshotRoomId) ||
    (snap.rooms || []).find((r) => r.room_id === state.selectedSnapshotRoomId) ||
    null;
  const floors = [...new Set((snap.rooms || []).map((r) => r.floor_number))].sort((a, b) => b - a);
  const summary = snap.summary || {};
  const loadingNote = state.dashboardLoading || !state.dashboard
    ? `<p class="lede">Loading room linen snapshot…</p>`
    : "";

  return `
    <section class="panel">
      <h2>Operations dashboard</h2>
      <p class="lede">Today’s room progress, ${labeledInfo("verification", "verification")} pressure, and exception register. Occupied rooms show ${labeledInfo(
        "soiled / service required",
        "soiled"
      )} until recorded.</p>
      ${loadingNote}
      ${propertyDisclaimer()}
      ${dashboardSetupEmptyState()}
      <div class="grid-3" style="margin-top:1rem">
        <div class="stat"><strong>${d.progress.total || 0}</strong><span>Rooms on round</span></div>
        <div class="stat"><strong>${d.progress.verified || 0}</strong><span>Verified</span></div>
        <div class="stat"><strong>${d.alerts.awaiting_verification || 0}</strong><span>Awaiting verification</span></div>
        <div class="stat"><strong>${d.alerts.unassigned || 0}</strong><span>Unassigned</span></div>
        <div class="stat"><strong>${d.alerts.overdue || 0}</strong><span>Overdue</span></div>
        <div class="stat"><strong>${d.alerts.returned_for_correction || 0}</strong><span>Returned for correction</span></div>
      </div>
    </section>
    <section class="panel hotel-config-panel snapshot-panel">
      <h2>Room linen snapshot</h2>
      <p class="lede">Occupied rooms start the round as <strong>Soiled / service required</strong>. The icon clears only after the Housekeeper records the room service.</p>
      <div class="grid-3" style="margin-top:0.75rem">
        <div class="stat"><strong>${summary.soiled || 0}</strong><span>Soiled / service required</span></div>
        <div class="stat"><strong>${summary.partial || 0}</strong><span>Partially serviced</span></div>
        <div class="stat"><strong>${summary.insufficient || 0}</strong><span>Insufficient</span></div>
        <div class="stat"><strong>${summary.normal || 0}</strong><span>Normal</span></div>
        <div class="stat"><strong>${summary.extra || 0}</strong><span>Extra linen</span></div>
      </div>
      <div class="hotel-config-toolbar row" style="margin-top:1rem">
        <label>Floor
          <select id="snapshot-filter-floor">
            <option value="">All floors</option>
            ${floors
              .map(
                (f) =>
                  `<option value="${f}" ${String(state.snapshotFilterFloor) === String(f) ? "selected" : ""}>${f}</option>`
              )
              .join("")}
          </select>
        </label>
        <span class="lede hotel-config-count">${rooms.length} rooms · refreshed on open · polls ~50s</span>
      </div>
      <div class="family-legend" aria-label="Linen status legend">
        <span class="family-chip snap-chip snap-soiled"><i class="family-swatch" aria-hidden="true"></i>Soiled / service required</span>
        <span class="family-chip snap-chip snap-partial"><i class="family-swatch" aria-hidden="true"></i>Partially serviced</span>
        <span class="family-chip snap-chip snap-insufficient"><i class="family-swatch" aria-hidden="true"></i>Insufficient</span>
        <span class="family-chip snap-chip snap-normal"><i class="family-swatch" aria-hidden="true"></i>Normal</span>
        <span class="family-chip snap-chip snap-extra"><i class="family-swatch" aria-hidden="true"></i>Extra linen</span>
      </div>
      <div class="hotel-config-layout">
        ${renderFloorRoomGrid({
          cells: rooms,
          selectedId: state.selectedSnapshotRoomId,
          selectedKey: "room_id",
          ariaLabel: "Room linen snapshot by floor",
          dataAttr: "data-snapshot-room",
          cellClass: (cell) => snapshotStatusClass(cell.status),
          cellLabel: (cell) => `${roomServiceIcon(cell)}<span class="room-cell-num">${cell.room_number}</span>`,
          cellTitle: (cell) =>
            `Room ${cell.room_number} · ${cell.status}${cell.service_outcome_reason ? ` · ${cell.service_outcome_reason}` : ""}${cell.extra_piece_total ? ` · +${cell.extra_piece_total} extra` : ""}${cell.short_item_count ? ` · ${cell.short_item_count} short` : ""}`
        })}
        ${renderSnapshotDetail(selected)}
      </div>
    </section>
    <section class="panel">
      <h2>Progress by floor</h2>
      <table>
        <thead><tr><th>Floor</th><th>Total</th><th>In progress</th><th>Submitted</th><th>Verified</th><th>Unassigned</th><th>Skipped</th></tr></thead>
        <tbody>
          ${(d.byFloor || [])
            .map(
              (f) => `<tr>
                <td>${f.floor}</td><td>${f.total}</td><td>${f.in_progress}</td><td>${f.submitted}</td>
                <td>${f.verified}</td><td>${f.unassigned}</td><td>${f.skipped}</td>
              </tr>`
            )
            .join("") || `<tr><td colspan="7">No active round yet.</td></tr>`}
        </tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Exception register</h2>
      <table>
        <thead><tr><th>Status</th><th>Category</th><th>Qty</th><th>Guest claim</th><th>Notes</th></tr></thead>
        <tbody>
          ${(d.exceptions || [])
            .map(
              (e) => `<tr>
                <td><span class="badge ${badgeClass(e.status)}">${e.status}</span></td>
                <td>${e.category?.name || ""}</td>
                <td>${e.quantity}</td>
                <td>${e.guest_claim_status || "—"}</td>
                <td>${e.notes || ""}</td>
              </tr>`
            )
            .join("") || `<tr><td colspan="5">No exceptions recorded.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;
}

function renderSnapshotDetail(room) {
  if (!room) {
    return `
      <aside class="room-detail-panel" id="snapshot-detail-focus" aria-live="polite">
        <h3>Room linen detail</h3>
        <p class="lede">Select a room to see fitted vs installed vs extras.</p>
      </aside>`;
  }
  const fittedLines = (room.lines || []).filter((l) => l.fitted_qty > 0);
  const extraLines = (room.lines || []).filter((l) => l.extra_qty > 0);
  return `
    <aside class="room-detail-panel" id="snapshot-detail-focus" aria-live="polite">
      <div class="room-detail-head">
        <h3>Room ${room.room_number}</h3>
        <span class="badge ${room.status === "soiled" || room.status === "insufficient" ? "danger" : room.status === "partial" || room.status === "extra" ? "info" : "ok"}">${room.status === "soiled" ? "Soiled — service required" : room.status === "partial" ? "Partially serviced" : room.status}</span>
      </div>
      ${room.service_outcome_reason ? `<div class="handover-note"><strong>Service note</strong><span>${room.service_outcome_reason}</span></div>` : ""}
      <dl class="room-detail-meta">
        <div><dt>Floor</dt><dd>${room.floor_number}</dd></div>
        <div><dt>Fitted pcs</dt><dd>${room.fitted_piece_total}</dd></div>
        <div><dt>Installed pcs</dt><dd>${room.installed_piece_total}</dd></div>
        <div><dt>Extra pcs</dt><dd>${room.extra_piece_total}</dd></div>
      </dl>
      <h4>Fitted</h4>
      <table>
        <thead><tr><th>Item</th><th>Fitted</th><th>Installed</th><th>Short</th></tr></thead>
        <tbody>
          ${fittedLines
            .map(
              (l) =>
                `<tr><td>${l.name}</td><td>${l.fitted_qty}</td><td>${Math.min(l.installed_qty, l.fitted_qty)}</td><td>${l.short_qty || "—"}</td></tr>`
            )
            .join("") || `<tr><td colspan="4">No fitted lines configured.</td></tr>`}
        </tbody>
      </table>
      <h4 style="margin-top:0.85rem">Extras</h4>
      <table>
        <thead><tr><th>Item</th><th>Extra qty</th><th>Reason</th></tr></thead>
        <tbody>
          ${
            extraLines
              .map((l) => {
                const reason =
                  (room.recent_extras || []).find((e) => e.linen_item_id === l.linen_item_id)?.reason_code ||
                  "—";
                return `<tr><td>${l.name}</td><td>${l.extra_qty}</td><td>${reason}</td></tr>`;
              })
              .join("") || `<tr><td colspan="3">No extras installed.</td></tr>`
          }
        </tbody>
      </table>
    </aside>`;
}

function propertyDisclaimer() {
  const p = state.session?.property;
  if (!p) return "";
  if (p.is_demo || p.demo_disclaimer) {
    return `
      <div class="disclaimer">
        <strong>Demo workspace</strong> · ${p.demo_disclaimer || "Synthetic demonstration data only."}
      </div>`;
  }
  if (p.subscription_plan === "free") {
    return `
      <div class="plan-banner">
        <strong>Free Version</strong> · Add your ${p.space_label || "rooms"} in Hotel setup, then run ${todayBoardLabel(p).toLowerCase()}.
      </div>`;
  }
  return "";
}

function dashboardSetupEmptyState() {
  if (!isSuperadmin()) return "";
  const roomCount =
    state.setupState?.readiness?.counts?.rooms ??
    state.master?.rooms?.length ??
    0;
  const ready = state.setupState?.readiness?.ready;
  if (ready || roomCount > 0) return "";
  const spaces = state.session?.property?.space_label || "rooms";
  return `
    <div class="empty-setup-card">
      <h3>Finish setup to start daily ops</h3>
      <p class="lede">Add your ${spaces}, confirm linen starters, then open ${todayBoardLabel()}.</p>
      <button class="btn" type="button" id="dashboard-open-setup">Continue Hotel setup</button>
    </div>`;
}

function renderFeedback() {
  return `
    <section class="panel feedback-panel">
      <h2>Send feedback</h2>
      <p class="lede">Tell the Masaero team what is working, what is confusing, or what would make daily linen operations easier.</p>
      <form id="feedback-form" class="stack">
        <label>Topic
          <select name="category">
            <option>Product idea</option>
            <option>Something is not working</option>
            <option>Usability</option>
            <option>Other</option>
          </select>
        </label>
        <label>Your message
          <textarea name="message" rows="7" minlength="10" maxlength="5000" required placeholder="Tell us what happened or what you would like to see..."></textarea>
        </label>
        <button class="btn" type="submit">Send feedback</button>
      </form>
      <p class="form-hint">Your message is sent to the Masaero product owner and, once workspace routing is enabled, tracked in the LINOS Hotel work queue.</p>
    </section>
  `;
}

function morningBoardSummary(tasks = state.tasks || [], vacantHint = null) {
  if (state.morningSummary) return state.morningSummary;
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
    else if (!occ && t.task_reason === "checkout") checkout += 1;
    else if (!occ && t.task_reason === "stayover") stayover += 1;
    if (t.task_reason === "vip" || String(t.special_instructions || "").startsWith("VIP")) vip += 1;
    if (t.status === "Skipped") skipped += 1;
    else {
      changeTasks += 1;
      if (t.status === "Unassigned") unassigned += 1;
      estPieces += Number(t.estimated_linen_pieces || 0);
    }
  }
  const totalRooms = state.master?.rooms?.length || 0;
  const vacant =
    vacantHint != null
      ? vacantHint
      : Math.max(0, totalRooms - tasks.length);
  return {
    change_tasks: changeTasks,
    checkout,
    stayover,
    vip,
    skipped,
    vacant,
    estimated_linen_pieces: estPieces,
    unassigned,
    service_rooms: tasks.length,
    planning_housekeepers_needed: changeTasks > 0 ? Math.min(changeTasks, Math.max(1, (state.master?.housekeepers || state.board?.available_housekeepers || 1))) : 0,
    even_split_rooms: changeTasks > 0
      ? Math.ceil(changeTasks / Math.max(1, state.master?.housekeepers?.length || state.board?.available_housekeepers || 1))
      : 0
  };
}

function roundStepState() {
  const round = state.round;
  const tasks = state.tasks || [];
  const open = Boolean(round);
  const build = tasks.length > 0;
  const active = round?.status === "Active" || round?.status === "Closed";
  return {
    open: open ? "done" : "current",
    build: !open ? "todo" : build ? "done" : "current",
    review: !build ? "todo" : active ? "done" : "current",
    activate: active ? "done" : build ? "current" : "todo"
  };
}

function filteredRoundTasks() {
  const filter = state.roundTaskFilter || "all";
  const floor = state.roundFilterFloor;
  return (state.tasks || []).filter((t) => {
    if (floor && String(t.room?.floor_number) !== String(floor)) return false;
    if (filter === "all") return true;
    if (filter === "checkout") return t.occupancy_status === "occupied_checkout" || t.task_reason === "checkout";
    if (filter === "stayover") return t.occupancy_status === "occupied_stayover" || t.task_reason === "stayover";
    if (filter === "vip") {
      return t.task_reason === "vip" || String(t.special_instructions || "").startsWith("VIP");
    }
    if (filter === "skipped") return t.status === "Skipped";
    return true;
  });
}

function occupancyLabel(task) {
  const occ = task.occupancy_status || "";
  if (occ === "occupied_checkout") return "Checkout";
  if (occ === "occupied_stayover") return "Stayover";
  if (occ === "dnd") return "DND";
  if (occ === "no_service") return "No service";
  if (occ === "vacant") return "Vacant";
  return task.task_reason || "—";
}

function renderRound() {
  const rooms = state.master?.rooms || [];
  const rules = state.master?.schedulingRules || [];
  const round = state.round;
  const isActive = round?.status === "Active" || round?.status === "Closed";
  const canBuild = can("round.create") && !isActive;
  const canActivate = can("round.release") && !isActive;
  const summary = morningBoardSummary();
  const steps = roundStepState();
  const floors = [...new Set(rooms.map((r) => r.floor_number))].sort((a, b) => a - b);
  const filtered = filteredRoundTasks();
  const hkNeeded = summary.planning_housekeepers_needed || 0;

  return `
    <section class="panel">
      <h2>Daily round — ${labeledInfo(todayBoardLabel(), todayBoardHelpKey())} ${round ? `<span class="badge ${isActive ? "ok" : "info"}">${round.status}</span>` : `<span class="badge">Opening…</span>`}</h2>
      <p class="lede">07:00 AM linen workload${round ? ` for ${round.service_date}` : ""}. Guest names are not imported. Active means ${labeledInfo("housekeepers", "housekeeper")} can be assigned. ${infoTip("occupancy")}</p>
      ${propertyDisclaimer()}
      <ol class="step-strip">
        <li class="step ${steps.open}"><span>1</span> Open</li>
        <li class="step ${steps.build}"><span>2</span> Build</li>
        <li class="step ${steps.review}"><span>3</span> Review</li>
        <li class="step ${steps.activate}"><span>4</span> Activate</li>
      </ol>
      ${
        round
          ? `<p class="lede" style="margin-top:0.75rem">${round.service_date} · ${round.shift} · planning ${round.planning_rooms_per_agent || 15} rooms/housekeeper${summary.change_tasks ? ` · ~${hkNeeded} housekeepers for ${summary.change_tasks} change tasks` : ""}</p>`
          : `<p class="lede">Opening today’s AM draft…</p>`
      }
    </section>

    ${
      isActive
        ? `<section class="panel">
        <h2>Board is active</h2>
        <p class="lede">Generators are locked. Assign housekeepers from the Assignment board.</p>
        <div class="row">
          <button class="btn" id="goto-assign">Go to Assignment</button>
        </div>
      </section>`
        : canBuild
          ? `<section class="panel morning-build">
        <h2>Build morning list</h2>
        <p class="helper-copy">The Supervisor confirms occupancy here for today’s round (manual/no PMS link yet). Every <strong>occupied</strong> room starts <strong>Soiled / service required</strong> and stays that way until the Housekeeper records service. Checkout % only marks checkout vs stayover — both are change tasks. Vacant rooms stay off the service list.</p>
        <div class="grid-2 morning-pcts">
          <label>Occupancy %
            <input type="number" id="morning-occupancy" min="0" max="100" value="${state.morningOccupancy}" />
          </label>
          <label>Checkout % of occupied
            <input type="number" id="morning-checkout" min="0" max="100" value="${state.morningCheckout}" />
          </label>
        </div>
        <div class="row" style="margin-top:0.85rem">
          <label class="inline-check"><input type="radio" name="morning-mode" value="replace" ${state.morningMode === "replace" ? "checked" : ""}/> Replace board</label>
          <label class="inline-check"><input type="radio" name="morning-mode" value="merge" ${state.morningMode === "merge" ? "checked" : ""}/> Merge missing rooms</label>
        </div>
        <div class="row" style="margin-top:1rem">
          <button class="btn" id="generate-morning">Generate morning board</button>
        </div>
      </section>`
          : ""
    }

    <section class="panel">
      <h2>Board mix</h2>
      <div class="chip-row summary-chips">
        <span class="stat-chip"><strong>${summary.change_tasks}</strong> Change tasks</span>
        <span class="stat-chip"><strong>${summary.checkout}</strong> Checkout</span>
        <span class="stat-chip"><strong>${summary.stayover}</strong> Stayover</span>
        <span class="stat-chip"><strong>${summary.vip}</strong> VIP</span>
        <span class="stat-chip"><strong>${summary.skipped}</strong> Skipped</span>
        <span class="stat-chip muted"><strong>${summary.vacant}</strong> Vacant (not on list)</span>
        <span class="stat-chip"><strong>${summary.estimated_linen_pieces}</strong> Est. pieces</span>
        <span class="stat-chip"><strong>${summary.unassigned}</strong> Unassigned</span>
      </div>
      ${
        canActivate
          ? `<div class="row activate-row">
          <button class="btn warn" id="release-round" ${summary.change_tasks || (state.tasks || []).length ? "" : "disabled"}>Make active for assignment</button>
          <label class="inline-check"><input type="checkbox" id="open-after-activate" ${state.openAfterActivate ? "checked" : ""}/> Open Assignment after</label>
        </div>
        <p class="helper-copy">Activating locks the morning list for ops and opens housekeeper assignment.</p>`
          : ""
      }
    </section>

    <section class="panel">
      <h2>Review ${round ? `<span class="badge info">${(state.tasks || []).length} rooms</span>` : ""}</h2>
      <div class="chip-row">
        ${[
          ["all", "All"],
          ["checkout", "Checkout"],
          ["stayover", "Stayover"],
          ["vip", "VIP"],
          ["skipped", "Skipped"]
        ]
          .map(
            ([id, label]) =>
              `<button type="button" class="chip-btn ${state.roundTaskFilter === id ? "active" : ""}" data-round-filter="${id}">${label}</button>`
          )
          .join("")}
        <label class="floor-filter">Floor
          <select id="round-floor-filter">
            <option value="">All floors</option>
            ${floors.map((f) => `<option value="${f}" ${String(state.roundFilterFloor) === String(f) ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Room</th><th>Floor</th><th>Occupancy</th><th>Reason</th><th>Priority</th><th>Est. pcs</th><th>Status</th><th>Housekeeper</th></tr></thead>
          <tbody>
            ${
              filtered
                .map(
                  (t) => `<tr>
                  <td>${t.room?.room_number || ""}</td>
                  <td>${t.room?.floor_number || ""}</td>
                  <td>${occupancyLabel(t)}</td>
                  <td>${t.task_reason}${t.skip_reason ? ` <span class="badge danger">${t.skip_reason}</span>` : ""}</td>
                  <td>${t.priority ?? ""}</td>
                  <td>${t.status === "Skipped" ? "—" : t.estimated_linen_pieces}</td>
                  <td><span class="badge ${badgeClass(t.status)}">${t.status}</span></td>
                  <td>${t.assigned_agent?.display_name || "—"}</td>
                </tr>`
                )
                .join("") || `<tr><td colspan="8">No tasks yet — generate the morning board.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>

    ${
      canBuild
        ? `<section class="panel">
      <button type="button" class="linkish" id="toggle-other-ways">${state.otherWaysOpen ? "▾" : "▸"} Other ways to fill</button>
      <div id="other-ways" class="${state.otherWaysOpen ? "" : "hidden"}" style="margin-top:0.85rem">
        <div class="grid-2">
          <form id="csv-form" class="stack">
            <label>CSV import (room_number, task_reason, priority, special_instructions, occupancy_status)
              <textarea name="csv" rows="6" placeholder="room_number,task_reason,priority&#10;1501,checkout,10"></textarea>
            </label>
            <button class="btn secondary" type="submit">Import CSV</button>
          </form>
          <form id="manual-form" class="stack">
            <label>Manual room selection
              <select name="room_ids" multiple size="7">
                ${rooms
                  .map((r) => `<option value="${r.id}">${r.room_number} · Fl ${r.floor_number}</option>`)
                  .join("")}
              </select>
            </label>
            <label>Task reason
              <select name="task_reason">
                ${rules.map((r) => `<option value="${r.task_reason}">${r.name}</option>`).join("")}
              </select>
            </label>
            <button class="btn secondary" type="submit">Add selected rooms</button>
          </form>
        </div>
        <div class="row" style="margin-top:0.85rem;align-items:end">
          <label>Legacy single-rule generator
            <select id="rule-code">
              ${rules.map((r) => `<option value="${r.code}">${r.name}</option>`).join("")}
            </select>
          </label>
          <button class="btn secondary" id="generate-rules">Generate from rule</button>
        </div>
      </div>
    </section>`
        : ""
    }
  `;
}

function assignBoardTasks(board) {
  const tasks = [];
  for (const bucket of board.byAgent || []) {
    for (const t of bucket.tasks || []) tasks.push(t);
  }
  for (const t of board.unassigned || []) tasks.push(t);
  const seen = new Set();
  return tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function renderAssign() {
  const board = state.board;
  if (!board) {
    return `<section class="panel"><h2>Assignment board</h2><p class="lede">Open or release a round first.</p>
      <button class="btn" id="load-board">Load board</button></section>`;
  }
  let cells = assignBoardTasks(board).map((t) => ({
    ...t,
    room_number: t.room?.room_number,
    floor_number: t.room?.floor_number
  }));
  if (state.assignFilterFloor) {
    cells = cells.filter((t) => String(t.floor_number) === String(state.assignFilterFloor));
  }
  if (state.assignUnassignedOnly) {
    cells = cells.filter((t) => t.status === "Unassigned" && !t.assigned_agent_id);
  }
  const floors = [...new Set(assignBoardTasks(board).map((t) => t.room?.floor_number).filter(Boolean))].sort(
    (a, b) => b - a
  );
  const selected =
    assignBoardTasks(board).find((t) => t.id === state.selectedAssignTaskId) || null;
  const suggestionRooms = board.assignment_workload_rooms ?? board.unassigned.length;
  const suggestionHousekeepers = board.available_housekeepers ?? (board.byAgent || []).length;
  const evenSplit = board.even_split_target || (suggestionHousekeepers
    ? Math.ceil(suggestionRooms / Math.max(1, suggestionHousekeepers))
    : suggestionRooms);
  const params = state.assignParams || {};
  const paramsReady = Boolean(state.assignParamsSaved);
  const activeAgents = board.byAgent || [];

  return `
    <section class="panel">
      <h2>${labeledInfo("Assignment", "assignment")} board</h2>
      <p class="lede">Rooms are split <strong>evenly</strong> (about <strong>${evenSplit}</strong> each across ${suggestionHousekeepers} ${labeledInfo(
        "housekeepers",
        "housekeeper"
      )}) and each person is filled on their default floor first. Confirm below, then amend any assignments manually.</p>
      <div class="row">
        <button class="btn secondary" id="refresh-board">Refresh</button>
      </div>
      <div class="grid-3" style="margin-top:1rem">
        <div class="stat"><strong>${board.totals.rooms}</strong><span>Rooms</span></div>
        <div class="stat"><strong>${board.totals.estimated_linen_pieces}</strong><span>Est. linen pieces</span></div>
        <div class="stat"><strong>${board.unassigned.length}</strong><span>Unassigned</span></div>
      </div>
    </section>
    <section class="panel handover-panel">
      <h2>Rooms still requiring service</h2>
      <p class="lede">This live list matches the Soiled / partial icons in the grid. Review or reassign rooms to the next available Housekeeper when appropriate.</p>
      <div class="grid-3">
        <div class="stat"><strong>${(board.follow_up || []).length}</strong><span>Follow-up rooms</span></div>
        <div class="stat"><strong>${(board.follow_up || []).filter((t) => t.service_outcome === "dnd").length}</strong><span>DND / later</span></div>
        <div class="stat"><strong>${(board.follow_up || []).filter((t) => t.service_outcome === "not_changed").length}</strong><span>Not changed</span></div>
      </div>
      <div class="handover-list">
        ${(board.follow_up || []).map((task) => `<button type="button" class="handover-room" data-assign-task="${task.id}">
          <strong>Room ${task.room?.room_number}</strong>
          <span>${task.service_outcome_label || task.service_outcome || (task.service_state === "soiled" ? "Not yet serviced" : "Follow-up")} · ${task.service_outcome_reason || "Needs supervisor review"}</span>
          <small>${task.assigned_agent?.display_name || "Unassigned"} · ${task.status}</small>
        </button>`).join("") || `<p class="lede">No follow-up rooms reported.</p>`}
      </div>
    </section>
    <section class="panel assign-params-panel">
      <h2>Run assignment</h2>
      <p class="lede">Even split · floor-first. Confirm preferences, run, then edit quantities or room assignments below.</p>
      <form id="assign-params-form" class="grid-2">
        <label class="room-form-active span-2">
          <span class="room-form-check">
            <input name="prefer_default_floors" type="checkbox" ${
              params.prefer_default_floors !== false ? "checked" : ""
            } />
            Prefer each housekeeper’s default floor first
          </span>
        </label>
        <label class="span-2">Amendments / notes for this run
          <textarea name="amendments_notes" rows="2" placeholder="e.g. Keep VIP suites with Supervisor A">${
            params.amendments_notes || ""
          }</textarea>
        </label>
        <div class="row span-2">
          <button class="btn" type="submit">Confirm assignment settings</button>
          ${
            paramsReady
              ? `<span class="badge ok">Ready — about ${evenSplit} rooms each</span>`
              : `<span class="lede">Confirm settings before running assignment.</span>`
          }
        </div>
      </form>
      <div class="assign-run-box">
        <p class="lede">${
          paramsReady
            ? `Ready: even split (~${evenSplit}/person) · default floors ${
                params.prefer_default_floors !== false ? "on" : "off"
              }${params.amendments_notes ? ` · note: ${params.amendments_notes}` : ""}`
            : "Run is disabled until you confirm settings above."
        }</p>
        <button class="btn" type="button" id="run-assignment" ${paramsReady ? "" : "disabled"}>
          Run even floor-first assignment
        </button>
      </div>
    </section>
    ${renderDefaultFloorsPanel(board)}
    <section class="panel hotel-config-panel assign-overview-panel">
      <h2>Assignments overview</h2>
      <p class="lede">Floor × room grid for this round. Occupied rooms begin as <strong>Soiled / service required</strong> and stay that way until the Housekeeper records service.</p>
      <div class="hotel-config-toolbar row">
        <label>Floor
          <select id="assign-filter-floor">
            <option value="">All floors</option>
            ${floors
              .map(
                (f) =>
                  `<option value="${f}" ${String(state.assignFilterFloor) === String(f) ? "selected" : ""}>${f}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="row" style="align-items:center;gap:0.4rem">
          <input type="checkbox" id="assign-unassigned-only" ${state.assignUnassignedOnly ? "checked" : ""} />
          Unassigned only
        </label>
        <span class="lede hotel-config-count">${cells.length} tasks shown</span>
      </div>
      <div class="family-legend" aria-label="Assignment status legend">
        <span class="family-chip assign-chip assign-soiled"><i class="family-swatch"></i>Soiled / service required</span>
        <span class="family-chip assign-chip assign-partial"><i class="family-swatch"></i>Partially serviced</span>
        <span class="family-chip assign-chip assign-unassigned"><i class="family-swatch"></i>Unassigned</span>
        <span class="family-chip assign-chip assign-assigned"><i class="family-swatch"></i>Assigned</span>
        <span class="family-chip assign-chip assign-submitted"><i class="family-swatch"></i>Submitted</span>
        <span class="family-chip assign-chip assign-verified"><i class="family-swatch"></i>Verified</span>
        <span class="family-chip assign-chip"><i class="family-swatch"></i>Initials = housekeeper</span>
      </div>
      <div class="hotel-config-layout assign-overview-layout">
        ${renderFloorRoomGrid({
          cells,
          selectedId: state.selectedAssignTaskId,
          selectedKey: "id",
          ariaLabel: "Round assignments by floor",
          dataAttr: "data-assign-task",
          cellClass: (cell) => assignmentCellClass(cell),
          cellLabel: (cell) =>
            `${roomServiceIcon(cell)}<span class="room-cell-num">${cell.room_number}</span><span class="room-cell-sub">${
              cell.assigned_agent ? housekeeperInitials(cell.assigned_agent) : "—"
            }</span>`,
          cellTitle: (cell) =>
            `Room ${cell.room_number} · ${cell.service_state === "soiled" ? "Soiled — service required" : cell.service_state === "partial" ? "Partially serviced" : cell.status} · ${cell.assigned_agent?.display_name || "Unassigned"}`
        })}
        ${renderAssignDetail(selected, board)}
      </div>
    </section>
    <section class="panel">
      <h2>By housekeeper</h2>
      ${activeAgents
        .map(
          (bucket) => `
        <div class="task-card" style="margin-bottom:0.75rem">
          <div class="row" style="justify-content:space-between">
            <h3>${bucket.agent.display_name}</h3>
            <span class="badge ${bucket.under_minimum_default ? "warn" : "ok"}">
              ${bucket.room_count} rooms · ${bucket.estimated_linen_pieces} pcs
            </span>
          </div>
          <p class="lede" style="margin:0.25rem 0 0.6rem">Default floors: ${formatFloorList(
            bucket.default_floors || bucket.agent?.default_floors
          )}</p>
          <form class="assign-form row" data-agent="${bucket.agent.id}">
            <label style="flex:1">Unassigned rooms
              <select name="task_ids" multiple size="4">
                ${board.unassigned
                  .map(
                    (t) =>
                      `<option value="${t.id}">${t.room.room_number} · Fl ${t.room.floor_number} · ${t.estimated_linen_pieces} pcs</option>`
                  )
                  .join("")}
              </select>
            </label>
            <button class="btn secondary" type="submit">Assign selected</button>
          </form>
          <table>
            <tbody>
              ${bucket.tasks
                .map(
                  (t) =>
                    `<tr><td>${t.room.room_number}</td><td>${t.task_reason}</td><td>${t.estimated_linen_pieces} pcs</td><td><span class="badge ${badgeClass(t.status)}">${t.status}</span></td></tr>`
                )
                .join("") || `<tr><td>No rooms assigned.</td></tr>`}
            </tbody>
          </table>
        </div>`
        )
        .join("") ||
          `<p class="lede">No housekeepers with rooms yet. Set parameters and run assignment, or assign from the overview panel.</p>`
      }
    </section>
  `;
}

function renderAssignDetail(task, board) {
  if (!task) {
    return `
      <aside class="room-detail-panel" id="assign-detail-focus" aria-live="polite">
        <h3>Task detail</h3>
        <p class="lede">Select a room cell to assign or reassign a housekeeper.</p>
      </aside>`;
  }
  const agents = (board.byAgent || []).map((b) => b.agent);
  return `
    <aside class="room-detail-panel" id="assign-detail-focus" aria-live="polite">
      <div class="room-detail-head">
        <h3>Room ${task.room?.room_number}</h3>
        <span class="badge ${badgeClass(task.status)}">${task.status}</span>
      </div>
      <dl class="room-detail-meta">
        <div><dt>Floor</dt><dd>${task.room?.floor_number}</dd></div>
        <div><dt>Reason</dt><dd>${task.task_reason}</dd></div>
        <div><dt>Est. pcs</dt><dd>${task.estimated_linen_pieces}</dd></div>
        <div><dt>Housekeeper</dt><dd>${task.assigned_agent?.display_name || "Unassigned"}</dd></div>
      </dl>
      ${task.service_outcome ? `<div class="handover-note"><strong>${task.service_outcome_label || task.service_outcome}</strong><span>${task.service_outcome_reason || task.service_outcome_note || "No message recorded"}</span></div>` : ""}
      ${
        can("task.assign")
          ? `<form id="assign-detail-form" class="stack" data-task="${task.id}">
              <label>Assign / reassign
                <select name="agent_id" required>
                  ${agents
                    .map(
                      (a) =>
                        `<option value="${a.id}" ${task.assigned_agent_id === a.id ? "selected" : ""}>${a.display_name}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <button class="btn" type="submit">Save assignment</button>
            </form>`
          : ""
      }
      ${
        can("task.skip") && !["Verified", "Skipped"].includes(task.status)
          ? `<button class="btn danger" id="assign-skip-task" data-task="${task.id}" style="margin-top:0.6rem">Skip room</button>`
          : ""
      }
    </aside>`;
}

function openExtrasNeedingTopUp() {
  let pcs = 0;
  for (const t of state.myTasks || []) {
    for (const e of t.extra_lines || []) {
      if (e.status === "Requested") pcs += Number(e.quantity || 0);
    }
  }
  return pcs;
}

function renderGuestRequestSheet() {
  if (!state.guestRequestOpen) return "";
  const rooms = [
    ...new Map(
      [
        ...(state.myTasks || []).map((t) => [t.room_id, t.room]),
        ...(state.master?.rooms || []).map((r) => [r.id, r])
      ].filter(([, r]) => r)
    ).values()
  ].slice(0, 80);
  const defaultRoom =
    state.guestRequestRoomId ||
    state.myTasks.find((t) => t.id === state.activeTaskId)?.room_id ||
    state.myTasks[0]?.room_id ||
    "";
  return `
    <section class="panel guest-request-sheet" id="guest-request-sheet">
      <h2>Guest request</h2>
      <p class="lede">Record extra bed / linen for a room. Does not change the fitted Admin set.</p>
      <form id="guest-request-form" class="stack">
        <label>Room
          <select name="room_id" required>
            ${rooms
              .map(
                (r) =>
                  `<option value="${r.id}" ${r.id === defaultRoom ? "selected" : ""}>${r.room_number} · Fl ${r.floor_number}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="chip-row" id="guest-request-presets">
          <button type="button" class="chip-btn" data-kit="EXTRA_BED">Extra bed</button>
          <button type="button" class="chip-btn" data-kit="PILLOW">+1 Pillow</button>
          <button type="button" class="chip-btn" data-kit="TOWEL_BATH">+1 Bath towel</button>
          <button type="button" class="chip-btn" data-kit="TOWEL_HAND">+1 Hand towel</button>
          <button type="button" class="chip-btn" data-kit="TOWEL_FACE">+1 Face towel</button>
          <button type="button" class="chip-btn" data-other="1">Other…</button>
        </div>
      <input type="hidden" name="kit_code" id="guest-kit-code" value="" />
        <div id="guest-other-fields" class="grid-2 hidden">
          <label>Item
            <select name="linen_item_id">
              ${(state.master?.linenItems || [])
                .map((i) => `<option value="${i.id}">${i.name}</option>`)
                .join("")}
            </select>
          </label>
          <label>Qty <input name="quantity" type="number" min="1" value="1" /></label>
        </div>
        <label>How often?
          <select name="request_frequency">
            <option value="standing" selected>Every day until stopped</option>
            <option value="one_time">Today only</option>
          </select>
        </label>
        <label class="collapsed-note">Add note <input name="reason_note" placeholder="Optional" /></label>
        <div class="row">
          <button class="btn secondary" type="submit" name="mode" value="request">Add to room</button>
          <button class="btn" type="submit" name="mode" value="deliver">Delivered</button>
          <button class="btn secondary" type="button" id="guest-request-cancel">Close</button>
        </div>
      </form>
    </section>`;
}

function renderAgent() {
  if (isHousekeeperMode()) return renderHousekeeperMode();
  const active = state.myTasks.find((t) => t.id === state.activeTaskId) || state.myTasks[0];
  const topUp = openExtrasNeedingTopUp();
  return `
    <section class="panel">
      <h2>${labeledInfo("My rooms", "my_rooms")}</h2>
      <p class="lede">Floor-optimised sequence, cart confirmation, and rapid linen entry.</p>
      <div class="row">
        <button class="btn" id="guest-request-open">Guest request</button>
        <button class="btn secondary" id="load-my-tasks">Refresh my rooms</button>
        <button class="btn secondary" id="suggest-cart">Suggest cart</button>
        <button class="btn warn" id="issue-cart">Confirm & issue cart</button>
      </div>
      ${
        topUp > 0
          ? `<div class="banner warn-banner" style="margin-top:0.85rem">Extras need top-up (${topUp} pcs). Suggest &amp; issue cart, or deliver from Float / buffer.</div>`
          : ""
      }
      ${renderGuestRequestSheet()}
      ${
        state.cartSuggest
          ? `<div class="task-card" style="margin-top:1rem">
              <h3>Cart suggestion · ${state.cartSuggest.room_count} rooms${
                state.cartSuggest.open_extras_pieces
                  ? ` · ${state.cartSuggest.open_extras_pieces} extra pcs`
                  : ""
              }</h3>
              <table>
                <thead><tr><th>Item</th><th>Suggested</th><th>Load</th><th>${labeledInfo("Float / buffer", "float_buffer")}</th><th>Return unused</th></tr></thead>
                <tbody>
                  ${state.cartSuggest.lines
                    .map(
                      (l, idx) => `<tr data-idx="${idx}">
                        <td>${l.item?.name || itemName(l.linen_item_id)}</td>
                        <td>${l.suggested_qty}</td>
                        <td><input class="cart-loaded" type="number" min="0" value="${l.loaded_qty}" /></td>
                        <td><input class="cart-extra" type="number" min="0" value="${l.extra_qty}" /></td>
                        <td><input class="cart-return" type="number" min="0" value="${l.returned_unused_qty}" /></td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : ""
      }
    </section>
    <section class="panel">
      <h2>Assigned sequence</h2>
      <div class="stack">
        ${state.myTasks
          .map(
            (t) => `
          <button class="task-card" data-open-task="${t.id}" style="text-align:left;cursor:pointer;width:100%">
            <div class="row" style="justify-content:space-between">
              <h3>Room ${t.room.room_number}</h3>
              <span class="badge ${badgeClass(t.status)}">${t.status}</span>
            </div>
            <div>Floor ${t.room.floor_number} · ${t.task_reason} · ${t.estimated_linen_pieces} pcs</div>
            ${
              (t.extra_lines || []).length
                ? `<div class="badge info">Extras ×${(t.extra_lines || []).filter((e) => e.status !== "Cancelled").length}</div>`
                : ""
            }
            ${t.special_instructions ? `<div style="color:var(--muted)">${t.special_instructions}</div>` : ""}
            ${t.return_reason ? `<div class="badge warn">Return: ${t.return_reason}</div>` : ""}
          </button>`
          )
          .join("") || `<p>No assigned rooms.</p>`}
      </div>
    </section>
    ${active ? renderRoomEditor(active) : ""}
  `;
}

function renderHousekeeperMode() {
  const tasks = state.myTasks || [];
  const completed = tasks.filter((task) => ["Verified", "Skipped"].includes(task.status)).length;
  const remaining = tasks.filter((task) => !["Verified", "Skipped", "Submitted"].includes(task.status));
  const active = tasks.find((task) => task.id === state.activeTaskId) || remaining[0] || tasks[0];
  const nextTask = remaining.find((task) => task.id !== active?.id) || remaining[0];
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const cartReady = Boolean(state.cartSuggest);

  return `
    <section class="hk-welcome">
      <div>
        <p class="hk-kicker">Today’s work</p>
        <h1>My rooms</h1>
        <p class="hk-progress-text">${completed} of ${tasks.length} rooms completed</p>
      </div>
      <div class="hk-progress-ring" aria-label="${progress}% complete"><strong>${progress}%</strong></div>
    </section>
    <section class="hk-cart-card">
      <div>
        <p class="hk-kicker">Before you start</p>
        <h2>${cartReady ? "Cart is ready to issue" : "Prepare your cart"}</h2>
        <p>${cartReady ? `${state.cartSuggest.room_count} rooms · ${state.cartSuggest.lines.length} linen items` : "Get the suggested linen for your assigned rooms."}</p>
      </div>
      ${
        cartReady
          ? `<button class="hk-action hk-action-primary" id="issue-cart">Issue cart</button>`
          : `<button class="hk-action hk-action-primary" id="suggest-cart">Prepare cart</button>`
      }
    </section>
    ${active ? renderHousekeeperRoom(active, nextTask) : `<section class="hk-empty"><strong>No rooms assigned yet</strong><span>Ask your Supervisor when your rooms are ready.</span></section>`}
    <section class="hk-queue-section">
      <div class="hk-section-heading"><h2>My room list</h2><span>${tasks.length} rooms</span></div>
      <div class="hk-queue">
        ${tasks
          .map(
            (task) => `<button class="hk-queue-item ${task.id === active?.id ? "active" : ""}" data-open-task="${task.id}">
              <span class="hk-room-number">${task.room.room_number}</span>
              <span class="hk-room-meta">Floor ${task.room.floor_number}${task.special_instructions ? ` · ${task.special_instructions}` : ""}</span>
              <span class="badge ${badgeClass(task.status)}">${task.status === "InProgress" ? "In progress" : task.status}</span>
            </button>`
          )
          .join("") || `<p class="hk-muted">Your assigned rooms will appear here.</p>`}
      </div>
    </section>`;
}

function renderHousekeeperRoom(task, nextTask) {
  const extras = (task.extra_lines || []).filter((extra) => extra.status !== "Cancelled");
  const standingExtras = extras.filter(
    (extra) =>
      extra.standing_extra_request_id &&
      extra.standing_request?.status === "Active" &&
      extra.replenishment_outcome !== "initial_install"
  );
  const installedTodayExtras = extras.filter(
    (extra) =>
      extra.standing_extra_request_id &&
      extra.standing_request?.status === "Active" &&
      extra.replenishment_outcome === "initial_install"
  );
  const oneTimeExtras = extras.filter((extra) => !extra.standing_extra_request_id);
  const isSubmitted = task.status === "Submitted";
  const isDone = ["Verified", "Skipped"].includes(task.status);
  const isStarted = task.status === "InProgress";
  const canEdit = !isSubmitted && !isDone;
  const taskTitle = task.task_reason === "guest_extra" ? "Guest request" : "Room service";
  return `
    <section class="hk-room" id="room-editor">
      <div class="hk-room-header">
        <div>
          <p class="hk-kicker">${taskTitle}</p>
          <h2>Room ${task.room.room_number}</h2>
          <p>Floor ${task.room.floor_number}${task.room.category?.family ? ` · ${task.room.category.family}` : ""}</p>
        </div>
        <span class="hk-status hk-status-${task.status.toLowerCase().replace(/[^a-z]+/g, "-")}">${task.status === "InProgress" ? "In progress" : task.status}</span>
      </div>
      ${task.special_instructions ? `<div class="hk-instruction"><strong>Note</strong><span>${task.special_instructions}</span></div>` : ""}
      ${
        isSubmitted
          ? `<div class="hk-success"><strong>Room submitted</strong><span>Your Supervisor will verify this room.</span>${nextTask ? `<button class="hk-action hk-action-primary" data-open-task="${nextTask.id}">Go to next room ${nextTask.room.room_number}</button>` : ""}</div>`
          : isDone
            ? `<div class="hk-success"><strong>Room complete</strong><span>This room has been closed.</span></div>`
            : `<div class="hk-primary-actions">
                ${["Assigned", "ReturnedForCorrection"].includes(task.status) ? `<button class="hk-action hk-action-primary" id="start-task" data-task="${task.id}">Start room</button>` : ""}
                ${isStarted && task.task_reason !== "guest_extra" ? `<button class="hk-action hk-action-confirm" id="matches-standard" data-task="${task.id}">✓ Matches standard</button>` : ""}
                ${isStarted ? `<button class="hk-action hk-action-submit" id="submit-task" data-task="${task.id}">Submit room</button>` : ""}
              </div>`
      }
      ${
        canEdit
          ? `${renderStandingExtraSection(task, standingExtras, installedTodayExtras)}
            <section class="hk-secondary-block">
              <h3>Add a guest extra</h3>
              <p>Use a daily extra when the guest needs it every day. Stop it when the guest checks out or no longer needs it.</p>
              <div class="hk-choice-grid">
                <button class="hk-choice" type="button" data-standing-kit="PILLOW" data-room="${task.room_id}"><span>＋</span>Daily pillow</button>
                <button class="hk-choice" type="button" data-standing-kit="TOWEL_BATH" data-room="${task.room_id}"><span>＋</span>Daily bath towel</button>
                <button class="hk-choice" type="button" data-standing-kit="EXTRA_BED" data-room="${task.room_id}"><span>＋</span>Daily extra bed</button>
                <button class="hk-choice" type="button" data-guest-for-room="${task.room_id}"><span>⋯</span>Other request</button>
              </div>
              ${oneTimeExtras.length ? `<h4 class="hk-subheading">One-time extras</h4><ul class="extras-list">${oneTimeExtras
                .map((extra) => `<li><span>${extra.kit?.name || extra.item?.name || itemName(extra.linen_item_id)} ×${extra.quantity}</span><span class="badge info">${extra.status}</span></li>`)
                .join("")}</ul>` : ""}
            </section>
            <section class="hk-secondary-block hk-outcome-block">
              <h3>Room result</h3>
              <label>What happened today?
                <select id="service-outcome" data-task="${task.id}">
                  <option value="changed" ${task.service_outcome === "changed" || !task.service_outcome ? "selected" : ""}>Changed as scheduled</option>
                  <option value="partial" ${task.service_outcome === "partial" ? "selected" : ""}>Partially changed</option>
                  <option value="not_changed" ${task.service_outcome === "not_changed" ? "selected" : ""}>Not changed</option>
                  <option value="dnd" ${task.service_outcome === "dnd" ? "selected" : ""}>DND — change later</option>
                  <option value="guest_declined" ${task.service_outcome === "guest_declined" ? "selected" : ""}>Guest declined today</option>
                  <option value="room_unavailable" ${task.service_outcome === "room_unavailable" ? "selected" : ""}>Room unavailable</option>
                  <option value="other" ${task.service_outcome === "other" ? "selected" : ""}>Other — supervisor follow-up</option>
                </select>
              </label>
              <label>Message for Supervisor <input id="service-outcome-note" value="${task.service_outcome_reason || task.service_outcome_note || ""}" placeholder="Optional for a normal change" /></label>
            </section>`
          : ""
      }
      ${
        canEdit
          ? `<details class="hk-details"><summary>Adjust counts manually</summary>
              <p>Use this only when the room does not match the standard.</p>
              <table><thead><tr><th>Item</th><th>Std</th><th>Out</th><th>In</th></tr></thead><tbody>${task.linen_lines
                .map(
                  (line) => `<tr data-line-item="${line.linen_item_id}" data-standard="${line.standard_qty}"><td>${itemName(line.linen_item_id)}</td><td>${line.standard_qty}</td>${qtyCell(line, "linen_out_qty", line.standard_qty)}${qtyCell(line, "linen_in_qty", line.standard_qty)}</tr>`
                )
                .join("")}</tbody></table>
              <button class="btn secondary" id="save-counts" data-task="${task.id}">Save counts</button>
            </details>
            <details class="hk-details"><summary>Report a problem or take a photo</summary>
              <form id="exception-form" class="stack">
                <input type="hidden" name="task_id" value="${task.id}" />
                <label>What happened?<select name="exception_category_id">${(state.master?.exceptionCategories || []).map((category) => `<option value="${category.id}">${category.name}</option>`).join("")}</select></label>
                <label>Item<select name="linen_item_id"><option value="">Not item-specific</option>${(state.master?.linenItems || []).map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}</select></label>
                <label>Quantity<input name="quantity" type="number" min="1" value="1" inputmode="numeric" /></label>
                <label>Note<input name="notes" placeholder="Short note (optional)" /></label>
                <button class="btn secondary" type="submit">Save problem</button>
              </form>
              <form id="evidence-form" class="stack hk-photo-form">
                <input type="hidden" name="task_id" value="${task.id}" />
                <label>Photo<input type="file" name="photo" accept="image/*" capture="environment" /></label>
                <button class="btn secondary" type="submit">Take photo</button>
              </form>
            </details>`
          : ""
      }
      ${renderGuestRequestSheet()}
    </section>`;
}

function standingExtraDefaults(extra) {
  const request = extra.standing_request || {};
  const expected = Number(request.quantity || extra.quantity || 0);
  const installed = Number(request.current_installed_qty || 0);
  const pending = !extra.replenishment_outcome && ["Requested", "Loaded"].includes(extra.status);
  return {
    expected,
    clean: pending ? Math.max(0, expected - Math.min(expected, installed)) : Number(extra.clean_in_qty ?? 0),
    soiled: pending ? Math.min(expected, installed) : Number(extra.soiled_out_qty ?? 0),
    unchanged: pending ? 0 : Number(extra.not_changed_qty ?? 0)
  };
}

function renderStandingExtraSection(task, standingExtras, installedTodayExtras = []) {
  return `<section class="hk-secondary-block hk-standing-block">
    <div class="hk-section-heading"><h3>Daily guest extras</h3><span>${standingExtras.length} active</span></div>
    <p>These extras stay active every day until stopped. Record only what was replenished today.</p>
    ${installedTodayExtras.length ? `<div class="hk-installed-note">Installed today: ${installedTodayExtras.map((extra) => `${extra.item?.name || itemName(extra.linen_item_id)} ×${extra.quantity}`).join(", ")}</div>` : ""}
    ${standingExtras.map((extra) => {
      const d = standingExtraDefaults(extra);
      const label = extra.kit?.name || extra.item?.name || itemName(extra.linen_item_id);
      return `<article class="hk-standing-line" data-standing-line="${extra.id}">
        <div class="hk-standing-head"><strong>${label}</strong><span>Need ${d.expected} · ${extra.standing_request?.status || "Active"}</span></div>
        <div class="hk-standing-actions">
          <button type="button" class="hk-choice hk-extra-action" data-extra-mode="all" data-extra-line="${extra.id}">Replenish all</button>
          <button type="button" class="hk-choice hk-extra-action" data-extra-mode="none" data-extra-line="${extra.id}">Not today</button>
          <button type="button" class="hk-choice hk-extra-action" data-extra-mode="dnd" data-extra-line="${extra.id}">DND / later</button>
        </div>
        <details class="hk-details"><summary>Adjust quantities</summary>
          <div class="hk-qty-grid">
            <label>Clean in<input class="standing-clean-in" type="number" min="0" max="${d.expected}" value="${d.clean}" /></label>
            <label>Soiled out<input class="standing-soiled-out" type="number" min="0" max="${d.expected}" value="${d.soiled}" /></label>
            <label>Not changed<input class="standing-not-changed" type="number" min="0" max="${d.expected}" value="${d.unchanged}" /></label>
          </div>
        </details>
        <button type="button" class="btn secondary hk-stop-extra" data-standing-extra="${extra.standing_request_id}">Stop future daily replenishment</button>
      </article>`;
    }).join("") || `<p class="hk-muted">No daily guest extras in this room.</p>`}
  </section>`;
}

function renderRoomEditor(task) {
  const cats = state.master?.exceptionCategories || [];
  const extrasOnly = task.task_reason === "guest_extra";
  const extras = (task.extra_lines || []).filter((e) => e.status !== "Cancelled");
  return `
    <section class="panel" id="room-editor">
      <h2>Room ${task.room.room_number}</h2>
      <p class="lede">${
        extrasOnly
          ? "Guest-request task — deliver extras below. Expand fitted changeout only if needed."
          : "Fitted linen out / in capped at standard. Use Guest request for anything above fitted."
      }</p>
      <div class="row">
        <button class="btn" data-guest-for-room="${task.room_id}">Guest request</button>
        <button class="btn secondary" id="start-task" data-task="${task.id}">Start</button>
        ${
          extrasOnly
            ? ""
            : `<button class="btn" id="matches-standard" data-task="${task.id}">Matches standard</button>`
        }
        <button class="btn warn" id="submit-task" data-task="${task.id}">Submit for verification</button>
      </div>
      <div class="extras-strip" style="margin-top:1rem">
        <h3>Extras in this room</h3>
        <div class="chip-row">
          <button type="button" class="chip-btn" data-quick-kit="EXTRA_BED" data-room="${task.room_id}">Extra bed</button>
          <button type="button" class="chip-btn" data-quick-kit="PILLOW" data-room="${task.room_id}">+1 Pillow</button>
          <button type="button" class="chip-btn" data-quick-kit="TOWEL_BATH" data-room="${task.room_id}">+1 Bath</button>
          <button type="button" class="chip-btn" data-quick-kit="TOWEL_HAND" data-room="${task.room_id}">+1 Hand</button>
          <button type="button" class="chip-btn" data-guest-for-room="${task.room_id}">Other</button>
        </div>
        <ul class="extras-list">
          ${extras
            .map(
              (e) =>
                `<li>
                  <span>${e.kit?.name || e.item?.name || itemName(e.linen_item_id)} ×${e.quantity}</span>
                  <span class="badge info">${e.reason_code}</span>
                  <span class="badge ${badgeClass(e.status)}">${e.status}</span>
                  ${
                    ["Requested", "Loaded"].includes(e.status)
                      ? `<button type="button" class="btn secondary" data-cancel-extra="${e.id}">Cancel</button>`
                      : ""
                  }
                  ${
                    e.status === "Installed"
                      ? `<button type="button" class="btn secondary" data-collect-extra="${e.id}">Collect</button>`
                      : ""
                  }
                </li>`
            )
            .join("") || `<li class="muted">No extras yet.</li>`}
        </ul>
      </div>
      ${
        extrasOnly
          ? `<details style="margin-top:1rem"><summary>Full changeout (fitted)</summary>`
          : ""
      }
      <table style="margin-top:1rem">
        <thead><tr><th>Item</th><th>Std</th><th>Out</th><th>In</th><th>Unused</th><th>Missing</th><th>Damaged</th><th>Stained</th></tr></thead>
        <tbody>
          ${task.linen_lines
            .map(
              (line) => `
            <tr data-line-item="${line.linen_item_id}" data-standard="${line.standard_qty}">
              <td>${itemName(line.linen_item_id)}</td>
              <td>${line.standard_qty}</td>
              ${qtyCell(line, "linen_out_qty", line.standard_qty)}
              ${qtyCell(line, "linen_in_qty", line.standard_qty)}
              ${qtyCell(line, "unused_return_qty")}
              ${qtyCell(line, "missing_qty")}
              ${qtyCell(line, "damaged_qty")}
              ${qtyCell(line, "stained_qty")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="row" style="margin-top:0.75rem">
        <button class="btn secondary" id="save-counts" data-task="${task.id}">Save counts</button>
      </div>
      ${extrasOnly ? `</details>` : ""}
      <hr style="border:none;border-top:1px solid var(--line);margin:1.2rem 0" />
      <h3>Exception & evidence</h3>
      <form id="exception-form" class="grid-2">
        <input type="hidden" name="task_id" value="${task.id}" />
        <label>Category
          <select name="exception_category_id">
            ${cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select>
        </label>
        <label>Linen item
          <select name="linen_item_id">
            <option value="">—</option>
            ${(state.master?.linenItems || [])
              .map((i) => `<option value="${i.id}">${i.name}</option>`)
              .join("")}
          </select>
        </label>
        <label>Quantity <input name="quantity" type="number" min="1" value="1" /></label>
        <label>Notes <input name="notes" placeholder="Describe the issue" /></label>
        <label class="row" style="align-items:center">
          <input type="checkbox" name="mark_guest_claim" /> Potentially guest-chargeable (tracking only)
        </label>
        <button class="btn secondary" type="submit">Report exception</button>
      </form>
      <form id="evidence-form" class="stack" style="margin-top:1rem">
        <input type="hidden" name="task_id" value="${task.id}" />
        <label>Photo evidence
          <input type="file" name="photo" accept="image/*" capture="environment" />
        </label>
        <button class="btn secondary" type="submit">Upload photo</button>
      </form>
      <div class="row" style="margin-top:0.75rem">
        ${(task.evidence || [])
          .map((e) => `<span class="badge info">${e.file_name}</span>`)
          .join("") || "<span class='badge'>No photos yet</span>"}
      </div>
    </section>
  `;
}

function qtyCell(line, field, max = null) {
  const maxAttr = max != null ? ` max="${max}" data-max="${max}"` : "";
  return `<td>
    <div class="qty">
      <button type="button" data-delta="-1" data-field="${field}">−</button>
      <input data-field="${field}" type="number" min="0"${maxAttr} value="${line[field]}" />
      <button type="button" data-delta="1" data-field="${field}">+</button>
    </div>
  </td>`;
}

function renderVerify() {
  return `
    <section class="panel">
      <h2>${labeledInfo("Verification", "verification")} queue</h2>
      <p class="lede">Review counts and evidence. Guest claims remain a controlled separate process — LINOS never auto-charges.</p>
      <button class="btn secondary" id="refresh-queue">Refresh queue</button>
      <div class="stack" style="margin-top:1rem">
        ${(state.queue || [])
          .map(
            (t) => `
          <div class="task-card">
            <div class="row" style="justify-content:space-between">
              <h3>Room ${t.room.room_number}</h3>
              <div class="row">
                ${(t.extra_lines || []).filter((e) => e.status !== "Cancelled").length
                  ? `<span class="badge info">Extras ×${(t.extra_lines || []).filter((e) => e.status !== "Cancelled").length}</span>`
                  : ""}
                <span class="badge info">${t.status}</span>
              </div>
            </div>
            <div>${t.assigned_agent?.display_name || "—"} · ${t.task_reason}</div>
            ${t.service_outcome ? `<div class="handover-note"><strong>${t.service_outcome_label || t.service_outcome}</strong><span>${t.service_outcome_reason || t.service_outcome_note || "No message recorded"}</span></div>` : ""}
            <table>
              <thead><tr><th>Item</th><th>Out</th><th>In</th><th>Missing</th><th>Damaged</th><th>Stained</th></tr></thead>
              <tbody>
                ${t.linen_lines
                  .map(
                    (l) =>
                      `<tr><td>${itemName(l.linen_item_id)}</td><td>${l.linen_out_qty}</td><td>${l.linen_in_qty}</td><td>${l.missing_qty}</td><td>${l.damaged_qty}</td><td>${l.stained_qty}</td></tr>`
                  )
                  .join("")}
              </tbody>
            </table>
            ${
              (t.extra_lines || []).filter((e) => e.status !== "Cancelled").length
                ? `<h4 style="margin:0.6rem 0 0.3rem">Extras</h4>
              <table>
                <thead><tr><th>Item</th><th>Qty</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>
                  ${(t.extra_lines || [])
                    .filter((e) => e.status !== "Cancelled")
                    .map(
                      (e) =>
                        `<tr><td>${e.kit?.name || e.item?.name || itemName(e.linen_item_id)}</td><td>${e.quantity}</td><td>${e.reason_code}</td><td>${e.status}</td></tr>`
                    )
                    .join("")}
                </tbody>
              </table>`
                : ""
            }
            <div class="row" style="margin:0.5rem 0">
              ${(t.exceptions || [])
                .map(
                  (e) =>
                    `<span class="badge warn">${state.master?.exceptionCategories?.find((c) => c.id === e.exception_category_id)?.name || "Exception"} × ${e.quantity}${e.guest_claim_status ? " · claim " + e.guest_claim_status : ""}</span>`
                )
                .join("")}
              ${(t.evidence || []).map((e) => `<span class="badge info">${e.file_name}</span>`).join("")}
            </div>
            <div class="row">
              <button class="btn" data-verify="${t.id}">Confirm verified</button>
              <button class="btn danger" data-return="${t.id}">Return for correction</button>
              ${(t.exceptions || [])
                .filter((e) => e.guest_claim_status)
                .map(
                  (e) =>
                    `<button class="btn secondary" data-claim="${e.id}" data-status="SupervisorConfirmed">Confirm claim evidence</button>`
                )
                .join("")}
            </div>
          </div>`
          )
          .join("") || `<p>Queue is clear.</p>`}
      </div>
    </section>
  `;
}

function renderRoomDetailPanel(room) {
  if (!room) {
    return `
      <aside class="room-detail-panel" id="room-detail-focus" aria-live="polite">
        <h3>Room details</h3>
        <p class="lede">Select a room in the grid to see room type, bed config, notes, and fitted linen for this room.</p>
      </aside>`;
  }
  const roomType = room.category?.family || room.category?.name || "—";
  const categories = state.master?.roomCategories || [];
  const catalogue = catalogueForRoom(room);
  const included = catalogue.filter((l) => l.included && Number(l.quantity || 0) > 0);
  const pieces = included.reduce((s, l) => s + Number(l.quantity || 0), 0);
  return `
    <aside class="room-detail-panel" id="room-detail-focus" aria-live="polite">
      <div class="room-detail-head">
        <h3>Room ${room.room_number}</h3>
        <span class="family-chip family-${familySlug(roomType)}">${roomType}</span>
      </div>
      <form id="room-type-form" class="room-type-form" data-room-id="${room.id}">
        <label>Room type
          <select id="room-type-select" name="category_id" aria-label="Change room type">
            ${categories
              .map(
                (c) =>
                  `<option value="${c.id}" ${room.category_id === c.id ? "selected" : ""}>${c.name || c.family}</option>`
              )
              .join("")}
          </select>
        </label>
        <button class="btn secondary" type="submit" id="save-room-type">Update type</button>
      </form>
      <dl class="room-detail-meta">
        <div><dt>Floor</dt><dd>${room.floor_number}</dd></div>
        <div><dt>Bed config</dt><dd>${room.bed_config?.name || "—"}</dd></div>
      </dl>
      ${
        room.special_notes
          ? `<p class="room-detail-notes"><strong>Special notes</strong><br/>${room.special_notes}</p>`
          : `<p class="room-detail-notes muted">No special notes.</p>`
      }
      <div class="room-detail-linen-head">
        <h4>Fitted linen for this room</h4>
        <span class="badge info">${pieces} pcs · ${included.length} included</span>
      </div>
      <p class="lede room-detail-linen-lede">Tick items in the fitted set for this room. Unticked rows are not part of the install (shown muted). Quantities default from room type × bed. Guest extras are on My rooms, not here.</p>
      <div class="room-detail-linen-scroll">
        <form id="room-linen-form" data-room-id="${room.id}" class="room-linen-form">
          <table class="room-linen-check-table">
            <thead><tr><th>In set</th><th>Item</th><th>Code</th><th>Qty</th></tr></thead>
            <tbody>
              ${catalogue
                .map((line) => {
                  const qtyVal = line.included
                    ? line.quantity
                    : line.standard_quantity > 0
                      ? line.standard_quantity
                      : 1;
                  return `
                  <tr class="${line.included ? "" : "is-excluded"}" data-item-id="${line.linen_item_id}">
                    <td>
                      <label class="room-linen-check">
                        <input type="checkbox" class="room-linen-included" data-item-id="${line.linen_item_id}" ${
                          line.included ? "checked" : ""
                        } />
                        <span class="sr-only">${line.included ? "In" : "Not in"} fitted set: ${line.name}</span>
                      </label>
                    </td>
                    <td>${line.name}${line.has_override ? ` <span class="badge warn">room</span>` : ""}</td>
                    <td>${line.code}</td>
                    <td>
                      <input type="number" class="room-linen-qty" data-item-id="${line.linen_item_id}" min="0" step="1" value="${qtyVal}" ${
                        line.included ? "" : "disabled"
                      } />
                    </td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </form>
      </div>
    </aside>`;
}

function renderAdminFloorRoomGrid(filteredRooms) {
  return renderFloorRoomGrid({
    cells: filteredRooms,
    selectedId: state.selectedRoomId,
    selectedKey: "id",
    ariaLabel: "Rooms by floor",
    dataAttr: "data-room-id",
    cellClass: (room) => `family-${familySlug(room.category?.family || "Unknown")}`,
    cellLabel: (room) => room.room_number,
    cellTitle: (room) =>
      `Room ${room.room_number} · ${room.category?.family || room.category?.name || "Unknown"} · ${
        room.bed_config?.name || ""
      }`
  });
}

function renderAdmin() {
  const rooms = state.master?.rooms || [];
  const items = state.master?.linenItems || [];
  const categories = state.master?.roomCategories || [];
  const beds = state.master?.bedConfigs || [];
  const amenities = state.master?.amenityLocations || [];
  const floors = state.master?.floors || [];
  const familyCounts = state.master?.familyCounts || {};
  const roomTypes = ROOM_FAMILY_ORDER.filter((f) => familyCounts[f] != null).concat(
    Object.keys(familyCounts).filter((f) => !ROOM_FAMILY_ORDER.includes(f))
  );

  let filtered = rooms;
  if (state.roomFilterFloor) {
    filtered = filtered.filter((r) => String(r.floor_number) === String(state.roomFilterFloor));
  }
  if (state.roomFilterFamily) {
    filtered = filtered.filter((r) => r.category?.family === state.roomFilterFamily);
  }

  const selectedRoom =
    rooms.find((r) => r.id === state.selectedRoomId) ||
    filtered.find((r) => r.id === state.selectedRoomId) ||
    null;

  const p = state.session?.property;
  const features = propertyFeatures(p);
  const growPanel = isSuperadmin()
    ? `<section class="panel">
        <h2>Grow this property</h2>
        <p class="lede">Start small, then unlock hotel-scale packs. Server capabilities stay enforced — this only changes what the team sees.</p>
        <form id="scale-packs-form" class="grid-2">
          <label>Operating scale
            <select name="property_scale">
              <option value="small" ${(p?.property_scale || "small") === "small" ? "selected" : ""}>Small</option>
              <option value="standard" ${p?.property_scale === "standard" ? "selected" : ""}>Standard</option>
              <option value="large" ${p?.property_scale === "large" ? "selected" : ""}>Large / 5★</option>
            </select>
          </label>
          <label class="room-form-check"><input type="checkbox" name="apply_scale_defaults" /> Apply recommended packs for scale</label>
          <label class="room-form-check"><input type="checkbox" name="team_mode" ${features.team_mode ? "checked" : ""} /> Team mode (assignment + verification)</label>
          <label class="room-form-check"><input type="checkbox" name="floor_mode" ${features.floor_mode ? "checked" : ""} /> Floors &amp; carts</label>
          <label class="room-form-check"><input type="checkbox" name="custody_mode" ${features.custody_mode ? "checked" : ""} /> Store custody collections</label>
          <label class="room-form-check"><input type="checkbox" name="laundry_partner" ${features.laundry_partner ? "checked" : ""} /> Laundry Operations (external)</label>
          <label class="room-form-check"><input type="checkbox" name="owner_mode" ${features.owner_mode ? "checked" : ""} /> Owner mode</label>
          <div class="row span-2"><button class="btn" type="submit">Save packs</button></div>
        </form>
      </section>`
    : "";

  return `
    ${growPanel}
    <section class="panel hotel-config-panel">
      <h2>${labeledInfo("Admin", "admin")} · Hotel configuration</h2>
      <p class="lede">Rooms are stock points for clean linen replenishment. Click a room in the floor grid to change its room type and ${labeledInfo(
        "what’s normally in the room",
        "fitted"
      )}.</p>
      ${propertyDisclaimer()}
      <div class="grid-2" style="margin-top:1rem">
        <div class="stat"><strong>${rooms.length}</strong><span>Rooms</span></div>
        <div class="stat"><strong>${items.length}</strong><span>Linen &amp; furnishing items</span></div>
      </div>

      <div class="hotel-config-toolbar row" style="margin-top:1.1rem">
        <label>Floor
          <select id="filter-floor">
            <option value="">All floors</option>
            ${floors
              .slice()
              .sort((a, b) => b - a)
              .map(
                (f) =>
                  `<option value="${f}" ${String(state.roomFilterFloor) === String(f) ? "selected" : ""}>${f}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>Room type
          <select id="filter-family">
            <option value="">All room types</option>
            ${roomTypes
              .map(
                (f) =>
                  `<option value="${f}" ${state.roomFilterFamily === f ? "selected" : ""}>${f} (${familyCounts[f] || 0})</option>`
              )
              .join("")}
          </select>
        </label>
        <span class="lede hotel-config-count">${filtered.length} rooms shown · highest floor at top</span>
      </div>

      <div class="family-legend" aria-label="Room type legend">
        ${roomTypes
          .map(
            (f) =>
              `<span class="family-chip family-${familySlug(f)}"><i class="family-swatch" aria-hidden="true"></i>${f}</span>`
          )
          .join("")}
      </div>

      <div class="hotel-config-layout">
        ${renderAdminFloorRoomGrid(filtered)}
        ${renderRoomDetailPanel(selectedRoom)}
      </div>
    </section>
    <section class="panel" id="room-particulars-panel">
      <h2>${selectedRoom ? `Edit room ${selectedRoom.room_number}` : "Add / Edit room particulars"}</h2>
      <p class="lede">
        ${
          selectedRoom
            ? "Amending particulars for the room selected in the floor grid. Required linen changeout qty is edited in the room detail panel (not here)."
            : "Create a new room, or select one in the floor grid / picker below to amend particulars."
        }
      </p>
      <form id="room-form" class="grid-2" data-mode="${selectedRoom ? "edit" : "create"}">
        <input type="hidden" name="id" value="${selectedRoom?.id || ""}" />
        <label>Room picker
          <select id="room-form-picker" aria-label="Select room to edit">
            <option value="">— New room —</option>
            ${rooms
              .map(
                (r) =>
                  `<option value="${r.id}" ${selectedRoom?.id === r.id ? "selected" : ""}>${r.room_number} · Fl ${r.floor_number}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="room-form-active">Active
          <span class="room-form-check">
            <input name="is_active" type="checkbox" ${!selectedRoom || selectedRoom.is_active !== false ? "checked" : ""} />
            In service
          </span>
        </label>
        <label>Room number <input name="room_number" required placeholder="1501" value="${selectedRoom?.room_number || ""}" /></label>
        <label>Floor <input name="floor_number" type="number" required value="${selectedRoom?.floor_number ?? 15}" /></label>
        <label>Room type
          <select name="category_id">${categories
            .map(
              (c) =>
                `<option value="${c.id}" ${selectedRoom?.category_id === c.id ? "selected" : ""}>${c.name}</option>`
            )
            .join("")}</select>
        </label>
        <label>Bed config
          <select name="bed_config_id">${beds
            .map(
              (b) =>
                `<option value="${b.id}" ${selectedRoom?.bed_config_id === b.id ? "selected" : ""}>${b.name}</option>`
            )
            .join("")}</select>
        </label>
        <label class="span-2">Special notes
          <textarea name="special_notes" rows="2" placeholder="Near lift, VIP, connecting door…">${
            selectedRoom?.special_notes || ""
          }</textarea>
        </label>
        <div class="row span-2 room-form-actions">
          <button class="btn" type="submit">${selectedRoom ? "Save changes" : "Create room"}</button>
          ${
            selectedRoom
              ? `<button class="btn secondary" type="button" id="room-form-new">New room</button>`
              : ""
          }
        </div>
      </form>
    </section>
    ${canEditDefaultFloors() ? renderDefaultFloorsPanel() : ""}
    <section class="panel">
      <h2>Catalogue &amp; amenity stubs</h2>
      <p class="lede">Linen catalogue and future amenity locations (not used in room rounds). Per-room changeout qty is configured via the room detail linen checkboxes.</p>
      <div class="grid-2">
        <div>
          <h3>Linen &amp; furnishings</h3>
          <ul>${items.map((i) => `<li>${i.code} — ${i.name}</li>`).join("")}</ul>
        </div>
        <div>
          <h3>Future amenity locations</h3>
          <ul>${amenities.map((a) => `<li>${a.code} — ${a.name}${a.is_active ? "" : " (inactive stub)"}</li>`).join("")}</ul>
        </div>
      </div>
    </section>
  `;
}

function stopDashboardPoll() {
  if (state.dashboardPollTimer) {
    clearInterval(state.dashboardPollTimer);
    state.dashboardPollTimer = null;
  }
}

function startDashboardPoll() {
  stopDashboardPoll();
  state.dashboardPollTimer = setInterval(async () => {
    if (state.view !== "dashboard" || !state.token) {
      stopDashboardPoll();
      return;
    }
    try {
      await refreshDashboard({ soft: true });
      if (state.view === "dashboard") render();
    } catch {
      /* ignore poll errors */
    }
  }, 50000);
}

function activeSetupLinenItems(s) {
  return (s?.linenItems || [])
    .filter((i) => i.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name));
}

function setupStandardsLinesFor(s, categoryId, bedId) {
  const standards = (s?.roomLinenStandards || []).filter(
    (row) => row.category_id === categoryId && row.bed_config_id === bedId
  );
  const byItem = new Map(standards.map((row) => [row.linen_item_id, Number(row.quantity || 0)]));
  return activeSetupLinenItems(s).map((item) => ({
    linen_item_id: item.id,
    code: item.code,
    name: item.name,
    quantity: byItem.get(item.id) || 0
  }));
}

function ensureSetupMatrixSelection(s) {
  const cats = s?.roomCategories || [];
  const beds = s?.bedConfigs || [];
  if (!cats.length || !beds.length) {
    state.setupMatrixCategoryId = "";
    state.setupMatrixBedId = "";
    return;
  }
  if (!cats.some((c) => c.id === state.setupMatrixCategoryId)) {
    state.setupMatrixCategoryId = cats[0].id;
  }
  if (!beds.some((b) => b.id === state.setupMatrixBedId)) {
    state.setupMatrixBedId = beds[0].id;
  }
}

function setupTypesBedsEditorHtml(cats, beds) {
  const typeRows =
    (cats.length
      ? cats
      : [{ id: "", code: "", name: "", family: "" }]
    )
      .map(
        (c, idx) => `<tr data-row-kind="type">
        <td><input name="type_code_${idx}" value="${escapeAttr(c.code || "")}" placeholder="SUP" required /></td>
        <td><input name="type_name_${idx}" value="${escapeAttr(c.name || "")}" placeholder="Superior" required /></td>
        <td><input name="type_family_${idx}" value="${escapeAttr(c.family || c.name || "")}" placeholder="Superior" /></td>
        <td><input type="hidden" name="type_id_${idx}" value="${escapeAttr(c.id || "")}" /></td>
      </tr>`
      )
      .join("");
  const bedRows =
    (beds.length ? beds : [{ id: "", code: "", name: "" }])
      .map(
        (b, idx) => `<tr data-row-kind="bed">
        <td><input name="bed_code_${idx}" value="${escapeAttr(b.code || "")}" placeholder="KING" required /></td>
        <td><input name="bed_name_${idx}" value="${escapeAttr(b.name || "")}" placeholder="King" required /></td>
        <td><input type="hidden" name="bed_id_${idx}" value="${escapeAttr(b.id || "")}" /></td>
      </tr>`
      )
      .join("");
  return `
      <h3>How many room types do you have?</h3>
      <p class="lede">List each kind of room (Superior, Suite…). Add bed layouts your hotel uses. Next you’ll set the standard linen for each type.</p>
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="types">Show step guide</button>
      <div class="row" style="margin-bottom:1rem">
        <button class="btn secondary" type="button" id="setup-apply-types-beds">Use starter room types</button>
      </div>
      <p class="setup-count-pill"><strong>${cats.length || 0}</strong> room type${cats.length === 1 ? "" : "s"} · <strong>${
        beds.length || 0
      }</strong> bed layout${beds.length === 1 ? "" : "s"}</p>
      <form id="setup-types-form" class="setup-master-block">
        <div class="row setup-master-head">
          <h4>Your room types</h4>
          <button class="btn secondary" type="button" id="setup-add-type-row">Add type</button>
        </div>
        <table class="setup-edit-table" id="setup-types-table">
          <thead><tr><th>Code</th><th>Name</th><th>Family</th><th class="sr-only">Id</th></tr></thead>
          <tbody>${typeRows}</tbody>
        </table>
        <div class="row" style="margin-top:0.75rem">
          <button class="btn" type="submit">Save room types</button>
        </div>
      </form>
      <form id="setup-beds-form" class="setup-master-block">
        <div class="row setup-master-head">
          <h4>Bed / layouts</h4>
          <button class="btn secondary" type="button" id="setup-add-bed-row">Add layout</button>
        </div>
        <table class="setup-edit-table" id="setup-beds-table">
          <thead><tr><th>Code</th><th>Name</th><th class="sr-only">Id</th></tr></thead>
          <tbody>${bedRows}</tbody>
        </table>
        <div class="row" style="margin-top:0.75rem">
          <button class="btn" type="submit">Save bed layouts</button>
        </div>
      </form>`;
}

function setupCatalogueEditorHtml(linen, { embedded = false } = {}) {
  const rows =
    (linen.length ? linen : [{ id: "", code: "", name: "", sort_order: 10 }])
      .map(
        (i, idx) => `<tr data-row-kind="linen">
        <td><input name="linen_code_${idx}" value="${escapeAttr(i.code || "")}" placeholder="FS" required /></td>
        <td><input name="linen_name_${idx}" value="${escapeAttr(i.name || "")}" placeholder="Fitted Sheet" required /></td>
        <td><input name="linen_sort_${idx}" type="number" min="0" step="1" value="${Number(i.sort_order ?? (idx + 1) * 10)}" /></td>
        <td><input type="hidden" name="linen_id_${idx}" value="${escapeAttr(i.id || "")}" /></td>
      </tr>`
      )
      .join("");
  const body = `
      <form id="setup-catalogue-form" class="setup-master-block">
        <div class="row setup-master-head">
          <h4>Pieces we track (${linen.length})</h4>
          <button class="btn secondary" type="button" id="setup-add-linen-row">Add piece</button>
        </div>
        <p class="lede">Rename or add items if needed. Quantities are set per room type below.</p>
        <div class="row" style="margin-bottom:0.75rem">
          <button class="btn secondary" type="button" id="setup-apply-linen">Load starter linen pieces</button>
        </div>
        <table class="setup-edit-table" id="setup-catalogue-table">
          <thead><tr><th>Code</th><th>Name</th><th>Sort</th><th class="sr-only">Id</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row" style="margin-top:0.75rem">
          <button class="btn" type="submit">Save linen pieces</button>
        </div>
      </form>`;
  if (embedded) {
    return `<details class="setup-advanced setup-catalogue-embed" ${linen.length ? "" : "open"}>
      <summary>Linen pieces we track ${linen.length ? `(${linen.length})` : "(needed next)"}</summary>
      ${body}
    </details>`;
  }
  return `
      <h3>Linen pieces</h3>
      <p class="lede">Sheet and towel pieces you count. Load starters, then amend if needed.</p>
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="catalogue">Show step guide</button>
      ${body}`;
}

function setupTypeConfigured(s, categoryId) {
  const beds = s?.bedConfigs || [];
  const standards = s?.roomLinenStandards || [];
  return beds.some((bed) =>
    standards.some(
      (row) =>
        row.category_id === categoryId &&
        row.bed_config_id === bed.id &&
        Number(row.quantity || 0) > 0
    )
  );
}

function setupStandardsEditorHtml(s) {
  const cats = s?.roomCategories || [];
  const beds = s?.bedConfigs || [];
  const linen = activeSetupLinenItems(s);
  const standardLines = s?.roomLinenStandards || [];
  ensureSetupMatrixSelection(s);
  const categoryId = state.setupMatrixCategoryId;
  const bedId = state.setupMatrixBedId;
  const lines = categoryId && bedId ? setupStandardsLinesFor(s, categoryId, bedId) : [];
  const catName = cats.find((c) => c.id === categoryId)?.name || "";
  const configuredCount = cats.filter((c) => setupTypeConfigured(s, c.id)).length;

  const typeCards = cats
    .map((cat) => {
      const configured = setupTypeConfigured(s, cat.id);
      const selected = cat.id === categoryId;
      const bedBits = beds
        .map((bed) => {
          const pair = standardLines.filter(
            (row) =>
              row.category_id === cat.id &&
              row.bed_config_id === bed.id &&
              Number(row.quantity) > 0
          );
          const pieces = pair.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
          return `${escapeAttr(bed.name)}: ${pair.length ? `${pieces} pcs` : "—"}`;
        })
        .join(" · ");
      return `<button type="button" class="setup-type-card ${selected ? "is-selected" : ""} ${
        configured ? "is-configured" : ""
      }" data-matrix-pick="${escapeAttr(cat.id)}|${escapeAttr(
        selected ? bedId || beds[0]?.id || "" : beds[0]?.id || ""
      )}">
        <strong>${escapeAttr(cat.name)}</strong>
        <span class="muted">${configured ? "Standard set" : "Not set yet"}</span>
        <span class="setup-type-card-meta">${bedBits || "No bed layouts yet"}</span>
      </button>`;
    })
    .join("");

  const bedTabs = beds
    .map(
      (bed) => `<button type="button" class="setup-bed-tab ${bed.id === bedId ? "is-selected" : ""}" data-matrix-pick="${escapeAttr(
        categoryId
      )}|${escapeAttr(bed.id)}">${escapeAttr(bed.name)}</button>`
    )
    .join("");

  const matrixBody = lines.length
    ? lines
        .map(
          (line) => `<tr>
            <td>${escapeAttr(line.name)} <span class="muted">${escapeAttr(line.code)}</span></td>
            <td><input name="std_qty_${line.linen_item_id}" type="number" min="0" max="40" value="${line.quantity}" data-linen-item-id="${escapeAttr(
              line.linen_item_id
            )}" /></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="2" class="muted">Load starter linen pieces first, then set quantities.</td></tr>`;

  const canGenerate = cats.length && beds.length;
  return `
      <h3>${labeledInfo("Standard linen for each room type", "fitted")}</h3>
      <p class="lede">For each category, what is the normal fitted set? Choose a room type, check each bed layout, then save.</p>
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="standards">Show step guide</button>
      <div class="row" style="margin:0.85rem 0">
        <button class="btn" type="button" id="setup-apply-standards" ${canGenerate ? "" : "disabled"}>
          ${linen.length ? "Fill default quantities for all types" : "Load starter pieces & default quantities"}
        </button>
      </div>
      <p class="setup-count-pill"><strong>${configuredCount}</strong> of <strong>${cats.length || 0}</strong> room types have a standard set</p>
      ${setupCatalogueEditorHtml(linen, { embedded: true })}
      ${
        cats.length && beds.length
          ? `<div class="setup-master-block">
        <h4>1. Choose a room type</h4>
        <div class="setup-type-card-grid">${typeCards}</div>
      </div>
      <form id="setup-standards-form" class="setup-master-block">
        <h4>2. Set linen for ${escapeAttr(catName) || "this type"}</h4>
        <div class="setup-bed-tabs" role="tablist">${bedTabs}</div>
        <table class="setup-linen-matrix" id="setup-standards-matrix">
          <thead><tr><th>Item</th><th>Qty in room</th></tr></thead>
          <tbody>${matrixBody}</tbody>
        </table>
        <div class="row" style="margin-top:0.85rem">
          <button class="btn" type="submit" ${!lines.length ? "disabled" : ""}>Save standard for ${escapeAttr(
            catName
          )} · ${escapeAttr(beds.find((b) => b.id === bedId)?.name || "")}</button>
        </div>
      </form>`
          : `<p class="lede">Add room types and bed layouts first, then return here.</p>`
      }`;
}

function setupExceptionEditorHtml(s, roomId) {
  const draft = state.setupExceptionDraft;
  if (!roomId || !draft?.lines?.length || draft.room_id !== roomId) return "";
  const room = (s?.rooms || []).find((r) => r.id === roomId);
  return `
    <div class="setup-linen-confirm panel-inner" id="setup-exception-editor">
      <h4>Exception linen · Room ${escapeAttr(room?.room_number || "")}</h4>
      <p class="lede">This room differs from <strong>${escapeAttr(room?.category_name || "its type")}</strong> · ${escapeAttr(
        room?.bed_name || ""
      )}. Amend quantities, or reset to the type standard.</p>
      <form id="setup-exception-form" data-room-id="${escapeAttr(roomId)}">
        <table class="setup-linen-matrix">
          <thead><tr><th>Item</th><th>Type standard</th><th>This room</th></tr></thead>
          <tbody>
            ${draft.lines
              .map(
                (line) => `<tr>
                  <td>${escapeAttr(line.name)} <span class="muted">${escapeAttr(line.code)}</span></td>
                  <td>${Number(line.standard_quantity || 0)}</td>
                  <td><input name="qty_${line.linen_item_id}" type="number" min="0" max="40" required value="${
                    line.quantity
                  }" data-linen-item-id="${escapeAttr(line.linen_item_id)}" /></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <div class="row" style="margin-top:0.85rem">
          <button class="btn" type="submit">Save exception</button>
          <button class="btn secondary" type="button" id="setup-exception-reset">Use type standard</button>
          <button class="btn secondary" type="button" id="setup-exception-cancel">Cancel</button>
        </div>
      </form>
    </div>`;
}

function setupSavedRoomsHtml(s, spaces) {
  const rooms = (s?.rooms || []).filter((r) => r.is_active !== false);
  const cats = s?.roomCategories || [];
  const beds = s?.bedConfigs || [];
  const editingId = state.setupEditingRoomId;
  const exceptionId = state.setupExceptionRoomId;
  const exceptionCount = rooms.filter((r) => r.has_linen_exception).length;
  if (!rooms.length) {
    return `<div class="setup-saved-rooms"><h4>Your ${spaces}</h4><p class="lede">None yet — add rooms above. Afterwards you can mark any room that needs different linen.</p></div>`;
  }
  const rows = rooms
    .map((room) => {
      if (editingId === room.id) {
        const catOpts = cats
          .map(
            (c) =>
              `<option value="${c.id}" ${c.id === room.category_id ? "selected" : ""}>${c.name}</option>`
          )
          .join("");
        const bedOpts = beds
          .map(
            (b) =>
              `<option value="${b.id}" ${b.id === room.bed_config_id ? "selected" : ""}>${b.name}</option>`
          )
          .join("");
        return `<tr class="setup-room-edit-row"><td colspan="6">
          <form class="grid-2 setup-amend-room-form" data-room-id="${room.id}">
            <label>Number <input name="room_number" required value="${escapeAttr(room.room_number)}" /></label>
            <label>Floor <input name="floor_number" type="number" min="1" required value="${room.floor_number}" /></label>
            <label>Type <select name="category_id" required>${catOpts}</select></label>
            <label>Bed / layout <select name="bed_config_id" required>${bedOpts}</select></label>
            <div class="row span-2">
              <button class="btn" type="submit">Save changes</button>
              <button class="btn secondary" type="button" data-cancel-edit-room="${room.id}">Cancel</button>
            </div>
          </form>
        </td></tr>`;
      }
      return `<tr class="${room.has_linen_exception ? "is-exception" : ""} ${
        exceptionId === room.id ? "is-selected" : ""
      }">
        <td>${escapeAttr(room.room_number)}</td>
        <td>${room.floor_number}</td>
        <td>${escapeAttr(room.category_name)}</td>
        <td>${escapeAttr(room.bed_name)}</td>
        <td>${
          room.has_linen_exception
            ? `<span class="badge warn">Exception</span>`
            : `<span class="muted">Follows type</span>`
        }</td>
        <td class="row">
          <button class="btn secondary" type="button" data-edit-room="${room.id}">Amend room</button>
          <button class="btn secondary" type="button" data-exception-room="${room.id}">${
            room.has_linen_exception ? "Edit linen" : "Make exception"
          }</button>
          <button class="btn warn" type="button" data-remove-room="${room.id}">Remove</button>
        </td>
      </tr>`;
    })
    .join("");
  return `
    <div class="setup-saved-rooms">
      <h4>Your ${spaces} (${rooms.length})</h4>
      <p class="lede">Most rooms follow their type standard. Amend any room that is an exception — ${exceptionCount} exception${
        exceptionCount === 1 ? "" : "s"
      } so far.</p>
      ${setupExceptionEditorHtml(s, exceptionId)}
      <table class="setup-rooms-table">
        <thead><tr><th>Room</th><th>Floor</th><th>Type</th><th>Bed</th><th>Linen</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function setupLinenConfirmHtml(draft, s) {
  if (!draft?.lines?.length) return "";
  const catName =
    (s?.roomCategories || []).find((c) => c.id === draft.category_id)?.name || "Room type";
  const bedName = (s?.bedConfigs || []).find((b) => b.id === draft.bed_config_id)?.name || "Layout";
  return `
    <div class="setup-linen-confirm panel-inner">
      <h4>Confirm what’s in the room</h4>
      <p class="lede">Review and amend linen quantities for <strong>${escapeAttr(catName)}</strong> · ${escapeAttr(
        bedName
      )} before saving rooms.</p>
      <form id="setup-linen-confirm-form">
        <table class="setup-linen-matrix">
          <thead><tr><th>Item</th><th>Qty</th></tr></thead>
          <tbody>
            ${draft.lines
              .map(
                (line) => `<tr>
                  <td>${escapeAttr(line.name)} <span class="muted">${escapeAttr(line.code)}</span></td>
                  <td><input name="qty_${line.linen_item_id}" type="number" min="0" max="40" required value="${
                    line.quantity
                  }" /></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <div class="row" style="margin-top:0.85rem">
          <button class="btn" type="submit">Confirm linen &amp; save rooms</button>
          <button class="btn secondary" type="button" id="setup-linen-confirm-cancel">Cancel</button>
        </div>
      </form>
    </div>`;
}

function setupOpsFormHtml(s, small) {
  const ops = s?.opsDefaults || {};
  const laundry = s?.laundryProviders?.[0] || {};
  const partnerType = laundry.partner_type || ops.partner_type || "in_house";
  const ownerOnly = small ? true : false;
  const laundryName =
    laundry.name ||
    (partnerType === "aerosparkle" ? "AeroSparkle" : partnerType === "other" ? "Other 3rd party" : "In-house laundry");
  return `
      <h3>Team &amp; laundry</h3>
      <p class="lede">${
        small
          ? "Owner-operated by default. Add housekeepers later when you grow. Choose how laundry is handled."
          : "Creates the linen store, laundry operations mode, and starter staff with one default floor each."
      }</p>
      <form id="setup-ops-form" class="grid-2">
        <label>Store name <input name="store_name" value="${s?.stores?.[0]?.name || "Main Linen Store"}" /></label>
        <label>Opening store stock / item <input name="store_stock_per_item" type="number" min="0" value="${
          ops.store_stock_per_item ?? (small ? 40 : 500)
        }" /></label>
        <fieldset class="span-2 setup-partner-fieldset">
          <legend>${labeledInfo("Laundry Operations", "laundry_operations")}</legend>
          <label class="room-form-check"><input type="radio" name="partner_type" value="in_house" ${
            partnerType === "in_house" ? "checked" : ""
          } /> In-house</label>
          <label class="room-form-check"><input type="radio" name="partner_type" value="aerosparkle" ${
            partnerType === "aerosparkle" ? "checked" : ""
          } /> AeroSparkle</label>
          <label class="room-form-check"><input type="radio" name="partner_type" value="other" ${
            partnerType === "other" ? "checked" : ""
          } /> Other 3rd party</label>
          <div class="row" style="margin-top:0.5rem">
            <button class="btn secondary" type="button" id="setup-connect-aerosparkle">Connect AeroSparkle</button>
          </div>
        </fieldset>
        <label>Display name <input name="laundry_name" value="${escapeAttr(laundryName)}" /></label>
        <label>Account / site ref <input name="external_ref" value="${escapeAttr(
          laundry.external_ref || ""
        )}" placeholder="For AeroSparkle or 3rd party" /></label>
        <label class="room-form-active span-2">Owner-operated
          <span class="room-form-check"><input name="owner_only" type="checkbox" ${
            ownerOnly ? "checked" : ""
          } id="setup-owner-only" /> I run daily rooms myself (no starter housekeepers)</span>
        </label>
        <label>Housekeepers <input name="housekeeper_count" type="number" min="0" max="80" value="${
          ownerOnly ? 0 : ops.housekeeper_count ?? 8
        }" /></label>
        <label>Supervisors <input name="supervisor_count" type="number" min="0" max="20" value="${
          ownerOnly ? 0 : ops.supervisor_count ?? 2
        }" /></label>
        <div class="row span-2">
          <button class="btn" type="submit">Save team &amp; laundry</button>
        </div>
      </form>
      <p class="lede" style="margin-top:0.75rem">
        Stores: ${s?.stores?.length || 0} · Housekeepers: ${s?.housekeepersCount || 0} · Supervisors: ${
          s?.supervisorsCount || 0
        }
      </p>`;
}

function setupLinenDemandHtml(s, p) {
  const demand = s?.linenDemand || [];
  const typeSummaries = s?.typeSummaries || [];
  const rooms = readinessRoomsCount(s);
  const exceptionCount = s?.exceptionRoomCount || 0;
  const typeRows = typeSummaries.length
    ? typeSummaries
        .map((t) => {
          const beds = (t.beds || [])
            .filter((b) => b.configured)
            .map((b) => `${escapeAttr(b.bed_name)} ${b.piece_count} pcs`)
            .join(" · ");
          return `<tr>
            <td>${escapeAttr(t.name)}</td>
            <td>${t.room_count}</td>
            <td>${beds || (t.configured ? "Set" : "Not set")}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="muted">No room types yet</td></tr>`;
  const demandRows = demand.length
    ? demand
        .map(
          (row) => `<tr>
            <td>${escapeAttr(row.name)} <span class="muted">${escapeAttr(row.code)}</span></td>
            <td>${row.room_count}</td>
            <td><strong>${row.total_quantity}</strong></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="muted">Add rooms with fitted standards to see totals.</td></tr>`;
  return `
      <div class="setup-confirm-summary">
        <h4>Room types</h4>
        <p class="lede">${typeSummaries.length} type${typeSummaries.length === 1 ? "" : "s"} · ${rooms} ${
          p?.space_label || "rooms"
        } · ${exceptionCount} linen exception${exceptionCount === 1 ? "" : "s"}</p>
        <table class="setup-rooms-table">
          <thead><tr><th>Type</th><th>Rooms</th><th>Standard linen</th></tr></thead>
          <tbody>${typeRows}</tbody>
        </table>
      </div>
      <div class="setup-confirm-summary" style="margin-top:1rem">
        <h4>Linen types &amp; quantity required</h4>
        <p class="lede">Total fitted pieces across all active rooms (exceptions included). This is what your hotel needs installed.</p>
        <table class="setup-rooms-table setup-linen-demand">
          <thead><tr><th>Linen type</th><th>Rooms using it</th><th>Total qty</th></tr></thead>
          <tbody>${demandRows}</tbody>
        </table>
        <p class="setup-count-pill" style="margin-top:0.75rem"><strong>${
          s?.linenDemandTotal || 0
        }</strong> total fitted pieces · <strong>${demand.length}</strong> linen type${
          demand.length === 1 ? "" : "s"
        }</p>
      </div>`;
}

function readinessRoomsCount(s) {
  return s?.roomsCount || (s?.rooms || []).filter((r) => r.is_active !== false).length || 0;
}

function setupReviewHtml(readiness, p, s) {
  const checks = (readiness.checks || [])
    .map(
      (c) =>
        `<li class="${c.ok ? "ok" : "missing"}"><span>${c.ok ? "✓" : "○"}</span> ${c.label}</li>`
    )
    .join("");
  const features = propertyFeatures(p);
  const laundry = s?.laundryProviders?.[0];
  const laundryLabel =
    laundry?.partner_label ||
    (features.laundry_partner ? "External laundry" : "In-house");
  const confirmed = Boolean(p?.setup_confirmed);
  const boardLabel = todayBoardLabel(p);
  return `
      <h3>Linen needs &amp; go live ${infoTip("hotel_setup")}</h3>
      <p class="lede">You should now see every room type, any exceptions, and the linen quantity your hotel requires. Confirm when it looks right.</p>
      <ul class="setup-readiness">${checks}</ul>
      ${setupLinenDemandHtml(s, p)}
      <div class="setup-confirm-summary" style="margin-top:1rem">
        <h4>Operations</h4>
        <dl class="setup-summary-dl">
          <div><dt>Place</dt><dd>${escapeAttr(p?.name || "—")} · ${escapeAttr(p?.property_kind || "hotel")} · ${escapeAttr(
            p?.property_scale || "small"
          )}</dd></div>
          <div><dt>Team</dt><dd>${
            features.owner_mode
              ? "Owner-operated (you can add housekeepers later)"
              : `${s?.housekeepersCount || 0} housekeepers · ${s?.supervisorsCount || 0} supervisors`
          }</dd></div>
          <div><dt>${labeledInfo("Laundry Operations", "laundry_operations")}</dt><dd>${escapeAttr(laundryLabel)}${
            laundry?.external_ref ? ` · ref ${escapeAttr(laundry.external_ref)}` : ""
          }</dd></div>
          <div><dt>Next daily screen</dt><dd>${labeledInfo(boardLabel, todayBoardHelpKey(p))}</dd></div>
        </dl>
      </div>
      ${
        readiness.ready
          ? confirmed
            ? `<p class="lede setup-ready-note">Setup confirmed. You can still amend details anytime.</p>
               <div class="row" style="margin-top:1.25rem">
                 <button class="btn" type="button" id="setup-open-morning">Go to ${boardLabel}</button>
                 <button class="btn secondary" type="button" id="setup-open-admin">Open Admin to fine-tune</button>
               </div>`
            : `<form id="setup-confirm-form" class="setup-confirm-form">
                 <label class="room-form-check">
                   <input name="confirm_setup" type="checkbox" required />
                   I confirm the room types, linen standards, and quantities look right. I know I can amend later.
                 </label>
                 <div class="row">
                   <button class="btn" type="submit" ${readiness.ready ? "" : "disabled"}>Confirm setup &amp; continue</button>
                   <button class="btn secondary" type="button" id="setup-open-admin">Amend in Admin first</button>
                 </div>
               </form>`
          : `<p class="lede">Complete the missing steps above, then return here to see full linen needs and confirm.</p>`
      }`;
}

function renderHotelSetup() {
  const s = state.setupState;
  const p = s?.property || state.session?.property;
  const small = isSmallProperty(p);
  const steps = setupStepsFor(p);
  const step = Math.min(state.setupStep || 1, steps.length);
  const readiness = s?.readiness || { checks: [], ready: false, counts: {} };
  const cats = s?.roomCategories || [];
  const beds = s?.bedConfigs || [];
  const linen = s?.linenItems || [];
  const floors = s?.floors || [];
  const spaces = p?.space_label || "rooms";
  const kind = p?.property_kind || "hotel";
  const scale = p?.property_scale || (small ? "small" : "standard");

  const rail = steps
    .map(
      (st) =>
        `<button type="button" class="setup-step-btn ${st.id === step ? "active" : ""} ${
          st.id < step ? "done" : ""
        }" data-setup-step="${st.id}"><span class="setup-step-num">${st.id}</span>${st.label}</button>`
    )
    .join("");

  let body = "";
  const key = steps.find((st) => st.id === step)?.key || "profile";
  openSetupGuideForStep(key);

  if (key === "profile") {
    const creating = state.setupForceCreate || !p;
    body = `
      <h3>${small ? "Your place" : "Hotel profile"} ${infoTip("hotel_setup")}</h3>
      <p class="lede">${
        small
          ? "Tell us what you run. Starter linen is ready — next you’ll add rooms and choose laundry handling."
          : "Create a new property or update the profile you are configuring."
      }</p>
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="profile">Show step guide</button>
      <form id="setup-profile-form" class="grid-2">
        <label>Property name <input name="name" required value="${creating ? "" : p?.name || ""}" placeholder="e.g. Harbour View Inn" /></label>
        <label>Code <input name="code" value="${creating ? "" : p?.code || ""}" placeholder="Auto from name if blank" ${
          creating ? "" : "readonly"
        } /></label>
        <label>What kind of place?
          <select name="property_kind">
            ${["hotel", "boutique", "spa", "hosted", "other"]
              .map(
                (k) =>
                  `<option value="${k}" ${(!creating ? kind : "hotel") === k ? "selected" : ""}>${
                    k === "hotel"
                      ? "Small hotel"
                      : k === "boutique"
                        ? "Boutique hotel"
                        : k === "spa"
                          ? "Spa"
                          : k === "hosted"
                            ? "Hosted / Airbnb-style"
                            : "Other hospitality"
                  }</option>`
              )
              .join("")}
          </select>
        </label>
        <label>Operating scale
          <select name="property_scale">
            <option value="small" ${scale === "small" ? "selected" : ""}>Small (owner / few rooms)</option>
            <option value="standard" ${scale === "standard" ? "selected" : ""}>Standard (team + floors)</option>
            <option value="large" ${scale === "large" ? "selected" : ""}>Large / 5★ (full packs)</option>
          </select>
        </label>
        <label>Timezone <input name="timezone" value="${creating ? "Asia/Kuala_Lumpur" : p?.timezone || "Asia/Kuala_Lumpur"}" /></label>
        <label class="span-2">Address <input name="address_line" value="${creating ? "" : p?.address_line || ""}" /></label>
        <details class="span-2 setup-advanced">
          <summary>Advanced</summary>
          <div class="grid-2" style="margin-top:0.75rem">
            <label>Star rating <input name="star_rating" type="number" min="1" max="5" step="1" value="${
              creating ? "" : p?.star_rating ?? ""
            }" placeholder="Optional" /></label>
            <label>Photo retention (days) <input name="photo_retention_days" type="number" min="30" value="${
              creating ? 365 : p?.photo_retention_days ?? 365
            }" /></label>
            <label class="span-2">Positioning notes <textarea name="positioning" rows="2">${
              creating ? "" : p?.positioning || ""
            }</textarea></label>
            <label class="room-form-active span-2">Guest PII import
              <span class="room-form-check"><input name="allow_guest_pii_import" type="checkbox" ${
                !creating && p?.allow_guest_pii_import ? "checked" : ""
              } /> Allow CSV guest fields</span>
            </label>
          </div>
        </details>
        <div class="row span-2">
          <button class="btn" type="submit">${creating ? "Create property" : "Save profile"}</button>
          ${
            !creating
              ? `<button class="btn secondary" type="button" id="setup-new-hotel">Create another property</button>`
              : `<span class="lede">Creating a property switches you onto it for the remaining steps.</span>`
          }
        </div>
      </form>`;
  } else if (key === "types") {
    body = setupTypesBedsEditorHtml(cats, beds);
  } else if (key === "standards") {
    body = setupStandardsEditorHtml(s);
  } else if (key === "rooms") {
    const catOpts = cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    const bedOpts = beds.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
    const confirmBlock = setupLinenConfirmHtml(state.setupRoomDraft, s);
    const savedBlock = setupSavedRoomsHtml(s, spaces);
    if (small) {
      body = `
      <h3>Add your ${spaces}, then mark exceptions</h3>
      <p class="lede">Give each ${spaces.replace(/s$/, "")} a type and bed. Most follow the type standard — amend any room that needs different linen.</p>
      <div class="row" style="margin-bottom:1rem">
        <button class="btn secondary setup-guide-again" type="button" data-show-guide="rooms">Show step guide</button>
        <button class="btn secondary" type="button" id="setup-ensure-starters">Refresh linen starters</button>
      </div>
      ${
        confirmBlock ||
        `<form id="setup-simple-rooms-form" class="grid-2">
        <label>How many ${spaces}? <input name="room_count" type="number" min="1" max="80" required value="6" /></label>
        <label>Floor / level <input name="floor_number" type="number" min="1" required value="1" /></label>
        <label>Default type <select name="default_category_id" required>${catOpts}</select></label>
        <label>Default bed / layout <select name="default_bed_config_id" required>${bedOpts}</select></label>
        <label class="span-2">Optional names (comma-separated) <input name="room_names" placeholder="Garden, Pool, Suite 1" /></label>
        <div class="row span-2">
          <button class="btn" type="submit" ${!cats.length || !beds.length ? "disabled" : ""}>Continue to linen confirm</button>
        </div>
      </form>`
      }
      ${savedBlock}`;
    } else {
      body = `
      <h3>Add your rooms, then mark exceptions</h3>
      <p class="lede">Generate rooms by floor with a default type and bed. Confirm the type’s linen, then amend any exception rooms below.</p>
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="rooms">Show step guide</button>
      ${
        confirmBlock ||
        `<form id="setup-bulk-rooms-form" class="grid-2">
        <label>Floor from <input name="floor_from" type="number" min="1" required value="${
          scale === "large" ? 5 : 2
        }" /></label>
        <label>Floor to <input name="floor_to" type="number" min="1" required value="${
          scale === "large" ? 8 : 4
        }" /></label>
        <label>Rooms per floor <input name="rooms_per_floor" type="number" min="1" max="80" required value="${
          scale === "large" ? 20 : 10
        }" /></label>
        <label>Default room type <select name="default_category_id" required>${catOpts}</select></label>
        <label>Default bed <select name="default_bed_config_id" required>${bedOpts}</select></label>
        <div class="row span-2">
          <button class="btn" type="submit" ${!cats.length || !beds.length ? "disabled" : ""}>Continue to linen confirm</button>
        </div>
      </form>`
      }
      ${savedBlock}`;
    }
  } else if (key === "ops") {
    body = `${setupOpsFormHtml(s, small)}
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="ops" style="margin-top:0.75rem">Show step guide</button>`;
  } else {
    body = `${setupReviewHtml(readiness, p, s)}
      <button class="btn secondary setup-guide-again" type="button" data-show-guide="review" style="margin-top:0.75rem">Show step guide</button>`;
  }

  const canNext = step < steps.length;
  const canBack = step > 1;

  return `
    <section class="panel hotel-setup-panel">
      <h2>${labeledInfo("Hotel setup", "hotel_setup")}</h2>
      <p class="lede">Room types → standard linen per type → rooms &amp; exceptions → linen quantity you need. Pop-up guides explain each step in plain language.</p>
      <div class="setup-rail" aria-label="Setup steps">${rail}</div>
      <div class="setup-body">${body}</div>
      <div class="setup-nav row">
        <button class="btn secondary" type="button" id="setup-back" ${canBack ? "" : "disabled"}>Back</button>
        <button class="btn" type="button" id="setup-next" ${canNext ? "" : "disabled"}>Next</button>
      </div>
    </section>
    ${renderSetupGuideModal(key)}
  `;
}

function render() {
  if (!state.token || !state.session) {
    stopDashboardPoll();
    stopLiveClock();
    renderLogin();
    return;
  }
  let content = "";
  if (state.view === "dashboard") content = renderDashboard();
  else if (state.view === "round") content = renderRound();
  else if (state.view === "assign") content = renderAssign();
  else if (state.view === "agent") content = renderAgent();
  else if (state.view === "verify") content = renderVerify();
  else if (state.view === "transfers") content = renderTransfers();
  else if (state.view === "admin") content = renderAdmin();
  else if (state.view === "hotel-setup") content = renderHotelSetup();
  else if (state.view === "feedback") content = renderFeedback();
  else content = renderDashboard();

  $("#app").innerHTML = shell(content);
  bindEvents();
  startLiveClock();
  if (state.view === "dashboard") startDashboardPoll();
  else stopDashboardPoll();
}

function selectedOptions(select) {
  return [...select.selectedOptions].map((o) => o.value);
}

function bindEvents() {
  $("#logout-btn")?.addEventListener("click", logout);

  $("#dashboard-open-setup")?.addEventListener("click", async () => {
    if (!isSuperadmin()) return;
    try {
      await loadSetupState();
      state.view = "hotel-setup";
      state.setupStep = firstFailingSetupStep(state.setupState?.readiness);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#feedback-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const result = await api("/feedback", {
        method: "POST",
        body: {
          category: String(fd.get("category") || "Other"),
          message: String(fd.get("message") || "").trim()
        }
      });
      e.target.reset();
      toast(result.linear?.issue?.url || result.feedback?.linear_issue_url ? "Thanks — your feedback was sent to the Masaero product owner." : "Thanks — your feedback was received.");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#property-switcher")?.addEventListener("change", async (e) => {
    try {
      await switchProperty(e.target.value);
      toast("Switched property");
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll(".nav [data-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.view = btn.dataset.view;
      try {
        if (state.view === "dashboard") {
          state.dashboard = (await api("/dashboard")).dashboard;
          if (isSuperadmin()) {
            try {
              await loadSetupState();
            } catch {
              /* empty-state CTA can fall back to master room count */
            }
          }
        }
        if (state.view === "round") {
          await ensureMorningRound();
        }
        if (state.view === "assign" && state.round) {
          state.board = (await api(`/rounds/${state.round.id}/board`)).board;
        }
        if (state.view === "agent") {
          await loadMyTasks();
        }
        if (state.view === "verify") {
          state.queue = (await api("/verification/queue", { query: { roundId: state.round?.id } })).queue;
        }
        if (state.view === "transfers") {
          await loadCollections();
          if (propertyFeatures().laundry_partner || isSuperadmin()) {
            try {
              state.laundryBrief = (await api("/setup/laundry-brief")).brief;
            } catch {
              state.laundryBrief = null;
            }
          }
        }
        if (state.view === "admin") {
          state.master = (await api("/master")).master;
        }
        if (state.view === "hotel-setup") {
          if (!isSuperadmin()) throw new Error("Hotel setup is limited to Superadmin.");
          await loadSetupState();
        }
      } catch (err) {
        toast(err.message, true);
      }
      render();
    });
  });

  $("#load-laundry-brief")?.addEventListener("click", async () => {
    try {
      state.laundryBrief = (await api("/setup/laundry-brief")).brief;
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#copy-laundry-brief")?.addEventListener("click", async () => {
    try {
      const text = state.laundryBrief?.summary || "";
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      toast("Pickup brief copied");
    } catch (err) {
      toast(err.message || "Could not copy brief", true);
    }
  });

  $("#scale-packs-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const data = await api("/setup/property", {
        method: "PATCH",
        body: {
          property_scale: String(fd.get("property_scale") || "small"),
          apply_scale_defaults: fd.get("apply_scale_defaults") === "on",
          features: {
            team_mode: fd.get("team_mode") === "on",
            floor_mode: fd.get("floor_mode") === "on",
            custody_mode: fd.get("custody_mode") === "on",
            laundry_partner: fd.get("laundry_partner") === "on",
            owner_mode: fd.get("owner_mode") === "on"
          }
        }
      });
      state.setupState = data;
      if (state.session?.property && data.property) {
        state.session.property = { ...state.session.property, ...data.property };
      }
      toast("Operating packs saved");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#prepare-collection-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await api("/transfers/collections/prepare", {
        method: "POST",
        body: {
          round_id: state.round?.id,
          store_id: String(fd.get("store_id") || ""),
          floor_number: String(fd.get("floor_number") || "").trim() || undefined
        }
      });
      await loadCollections();
      toast("Room collection prepared");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll("[data-collect]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/transfers/collections/collect", {
          method: "POST",
          body: { collection_id: btn.dataset.collect }
        });
        await loadCollections();
        toast("Collection marked collected");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  document.querySelectorAll("[data-receive]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/transfers/collections/receive", {
          method: "POST",
          body: { collection_id: btn.dataset.receive }
        });
        await loadCollections();
        toast("Collection received at store");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  document.querySelectorAll("[data-reconcile]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const data = await api("/transfers/collections/reconcile", {
          method: "POST",
          body: { collection_id: btn.dataset.reconcile }
        });
        await loadCollections();
        toast(`${data.variances?.length || 0} variance(s) opened`);
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  document.querySelectorAll("[data-setup-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.setupStep = Number(btn.dataset.setupStep) || 1;
      render();
    });
  });
  $("#setup-back")?.addEventListener("click", () => {
    state.setupStep = Math.max(1, (state.setupStep || 1) - 1);
    render();
  });
  $("#setup-next")?.addEventListener("click", () => {
    const max = setupStepsFor(state.setupState?.property || state.session?.property).length;
    state.setupStep = Math.min(max, (state.setupStep || 1) + 1);
    render();
  });

  $("#setup-profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        code: String(fd.get("code") || "").trim(),
        timezone: String(fd.get("timezone") || "Asia/Kuala_Lumpur").trim(),
        address_line: String(fd.get("address_line") || "").trim(),
        positioning: String(fd.get("positioning") || "").trim(),
        star_rating: fd.get("star_rating") ? Number(fd.get("star_rating")) : null,
        photo_retention_days: Number(fd.get("photo_retention_days") || 365),
        allow_guest_pii_import: fd.get("allow_guest_pii_import") === "on",
        property_kind: String(fd.get("property_kind") || "hotel"),
        property_scale: String(fd.get("property_scale") || "small"),
        apply_scale_defaults: true
      };
      const current = state.setupState?.property || state.session?.property;
      const creating = state.setupForceCreate || !current;
      let data;
      if (!creating) {
        data = await api("/setup/property", { method: "PATCH", body: payload });
      } else {
        data = await api("/setup/property", { method: "POST", body: payload });
        state.setupForceCreate = false;
        if (data.property?.id) {
          state.activePropertyId = data.property.id;
          localStorage.setItem("linos_hotel_property_id", data.property.id);
          await bootstrap();
        }
      }
      state.setupState = data;
      if (state.session?.property) {
        state.session.property = { ...state.session.property, ...data.property };
      }
      state.setupProperties = (await api("/setup/properties")).properties || [];
      toast(creating ? "Property created" : "Property profile saved");
      state.setupStep = 2;
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-new-hotel")?.addEventListener("click", () => {
    state.setupForceCreate = true;
    state.setupStep = 1;
    render();
  });

  function appendSetupEditRow(tableId, kind) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    const idx = tbody.querySelectorAll("tr").length;
    const tr = document.createElement("tr");
    tr.dataset.rowKind = kind;
    if (kind === "type") {
      tr.innerHTML = `<td><input name="type_code_${idx}" value="" placeholder="SUP" required /></td>
        <td><input name="type_name_${idx}" value="" placeholder="Superior" required /></td>
        <td><input name="type_family_${idx}" value="" placeholder="Superior" /></td>
        <td><input type="hidden" name="type_id_${idx}" value="" /></td>`;
    } else if (kind === "bed") {
      tr.innerHTML = `<td><input name="bed_code_${idx}" value="" placeholder="KING" required /></td>
        <td><input name="bed_name_${idx}" value="" placeholder="King" required /></td>
        <td><input type="hidden" name="bed_id_${idx}" value="" /></td>`;
    } else {
      tr.innerHTML = `<td><input name="linen_code_${idx}" value="" placeholder="FS" required /></td>
        <td><input name="linen_name_${idx}" value="" placeholder="Fitted Sheet" required /></td>
        <td><input name="linen_sort_${idx}" type="number" min="0" step="1" value="${(idx + 1) * 10}" /></td>
        <td><input type="hidden" name="linen_id_${idx}" value="" /></td>`;
    }
    tbody.appendChild(tr);
    tr.querySelector("input")?.focus();
  }

  $("#setup-add-type-row")?.addEventListener("click", () => appendSetupEditRow("setup-types-table", "type"));
  $("#setup-add-bed-row")?.addEventListener("click", () => appendSetupEditRow("setup-beds-table", "bed"));
  $("#setup-add-linen-row")?.addEventListener("click", () => appendSetupEditRow("setup-catalogue-table", "linen"));

  $("#setup-apply-types-beds")?.addEventListener("click", async () => {
    try {
      await api("/setup/room-types", { method: "POST", body: { use_starters: true } });
      await api("/setup/beds", { method: "POST", body: { use_starters: true } });
      state.setupState = await loadSetupState();
      toast("Starter room types and beds applied — edit the tables below if needed");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-types-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const room_types = [];
      for (const [key, value] of fd.entries()) {
        const m = String(key).match(/^type_code_(\d+)$/);
        if (!m) continue;
        const idx = m[1];
        const code = String(value || "").trim();
        const name = String(fd.get(`type_name_${idx}`) || "").trim();
        if (!code && !name) continue;
        room_types.push({
          id: String(fd.get(`type_id_${idx}`) || "").trim() || undefined,
          code,
          name,
          family: String(fd.get(`type_family_${idx}`) || name).trim()
        });
      }
      if (!room_types.length) throw new Error("Add at least one room type");
      const data = await api("/setup/room-types", { method: "POST", body: { room_types } });
      state.setupState = data;
      toast(`Saved ${room_types.length} room type${room_types.length === 1 ? "" : "s"}`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-beds-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const beds = [];
      for (const [key, value] of fd.entries()) {
        const m = String(key).match(/^bed_code_(\d+)$/);
        if (!m) continue;
        const idx = m[1];
        const code = String(value || "").trim();
        const name = String(fd.get(`bed_name_${idx}`) || "").trim();
        if (!code && !name) continue;
        beds.push({
          id: String(fd.get(`bed_id_${idx}`) || "").trim() || undefined,
          code,
          name
        });
      }
      if (!beds.length) throw new Error("Add at least one bed config");
      const data = await api("/setup/beds", { method: "POST", body: { beds } });
      state.setupState = data;
      toast(`Saved ${beds.length} bed config${beds.length === 1 ? "" : "s"}`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-apply-linen")?.addEventListener("click", async () => {
    try {
      const data = await api("/setup/linen-items", { method: "POST", body: { use_starters: true } });
      state.setupState = data;
      toast("Starter linen catalogue applied — amend the table below if needed");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-catalogue-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const linen_items = [];
      for (const [key, value] of fd.entries()) {
        const m = String(key).match(/^linen_code_(\d+)$/);
        if (!m) continue;
        const idx = m[1];
        const code = String(value || "").trim();
        const name = String(fd.get(`linen_name_${idx}`) || "").trim();
        if (!code && !name) continue;
        linen_items.push({
          id: String(fd.get(`linen_id_${idx}`) || "").trim() || undefined,
          code,
          name,
          sort_order: Number(fd.get(`linen_sort_${idx}`) ?? (linen_items.length + 1) * 10)
        });
      }
      if (!linen_items.length) throw new Error("Add at least one linen item");
      const data = await api("/setup/linen-items", { method: "POST", body: { linen_items } });
      state.setupState = data;
      toast(`Saved ${linen_items.length} catalogue item${linen_items.length === 1 ? "" : "s"}`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-apply-standards")?.addEventListener("click", async () => {
    try {
      const linenCount = activeSetupLinenItems(state.setupState).length;
      if (!linenCount) {
        await api("/setup/linen-items", { method: "POST", body: { use_starters: true } });
      }
      const data = await api("/setup/standards", {
        method: "POST",
        body: { use_defaults: true, replace: true }
      });
      state.setupState = data;
      ensureSetupMatrixSelection(data);
      toast("Standard linen filled for each room type — walk the types below to amend");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll("[data-matrix-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [categoryId, bedId] = String(btn.getAttribute("data-matrix-pick") || "").split("|");
      if (!categoryId || !bedId) return;
      state.setupMatrixCategoryId = categoryId;
      state.setupMatrixBedId = bedId;
      render();
    });
  });

  $("#setup-standards-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const categoryId = state.setupMatrixCategoryId;
      const bedId = state.setupMatrixBedId;
      if (!categoryId || !bedId) throw new Error("Choose a room type and bed");
      const standards = [...e.target.querySelectorAll("input[data-linen-item-id]")].map((input) => ({
        category_id: categoryId,
        bed_config_id: bedId,
        linen_item_id: input.getAttribute("data-linen-item-id"),
        quantity: Number(input.value || 0)
      }));
      const data = await api("/setup/standards", {
        method: "POST",
        body: { standards, replace: false }
      });
      state.setupState = data;
      const beds = data.bedConfigs || [];
      const idx = beds.findIndex((b) => b.id === bedId);
      if (idx >= 0 && idx < beds.length - 1) {
        state.setupMatrixBedId = beds[idx + 1].id;
        toast("Saved — next bed layout for this type");
      } else {
        const cats = data.roomCategories || [];
        const catIdx = cats.findIndex((c) => c.id === categoryId);
        const nextCat = cats.slice(catIdx + 1).find((c) => !setupTypeConfigured(data, c.id)) || cats[catIdx + 1];
        if (nextCat) {
          state.setupMatrixCategoryId = nextCat.id;
          state.setupMatrixBedId = beds[0]?.id || "";
          toast("Saved — continue with the next room type");
        } else {
          toast("Standard linen saved for this room type");
        }
      }
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll("[data-exception-room]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const roomId = btn.getAttribute("data-exception-room");
        if (!roomId) return;
        state.setupEditingRoomId = null;
        const data = await api(`/setup/rooms/${roomId}/fitted`);
        state.setupExceptionRoomId = roomId;
        state.setupExceptionDraft = { room_id: roomId, lines: data.lines || [] };
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#setup-exception-cancel")?.addEventListener("click", () => {
    state.setupExceptionRoomId = null;
    state.setupExceptionDraft = null;
    render();
  });

  $("#setup-exception-reset")?.addEventListener("click", async () => {
    try {
      const roomId = state.setupExceptionRoomId;
      if (!roomId) return;
      const data = await api(`/setup/rooms/${roomId}/fitted`, {
        method: "POST",
        body: { reset_to_standard: true }
      });
      state.setupState = data;
      state.setupExceptionRoomId = null;
      state.setupExceptionDraft = null;
      toast("Room now follows its type standard");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-exception-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const roomId = e.target.getAttribute("data-room-id") || state.setupExceptionRoomId;
      if (!roomId) throw new Error("Choose a room");
      const lines = [...e.target.querySelectorAll("input[data-linen-item-id]")].map((input) => ({
        linen_item_id: input.getAttribute("data-linen-item-id"),
        quantity: Number(input.value || 0),
        included: Number(input.value || 0) > 0
      }));
      const data = await api(`/setup/rooms/${roomId}/fitted`, {
        method: "POST",
        body: { lines }
      });
      state.setupState = data;
      state.setupExceptionRoomId = null;
      state.setupExceptionDraft = null;
      toast("Exception linen saved for this room");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  async function beginRoomLinenConfirm(createBody) {
    const categoryId = createBody.default_category_id;
    const bedId = createBody.default_bed_config_id;
    const matrix = await api("/setup/linen-matrix", {
      query: { category_id: categoryId, bed_config_id: bedId }
    });
    if (!(matrix.lines || []).some((line) => Number(line.quantity) > 0)) {
      await api("/setup/standards", { method: "POST", body: { use_defaults: true, replace: false } });
      const again = await api("/setup/linen-matrix", {
        query: { category_id: categoryId, bed_config_id: bedId }
      });
      state.setupRoomDraft = {
        createBody,
        category_id: categoryId,
        bed_config_id: bedId,
        lines: again.lines || []
      };
    } else {
      state.setupRoomDraft = {
        createBody,
        category_id: categoryId,
        bed_config_id: bedId,
        lines: matrix.lines || []
      };
    }
    render();
  }

  $("#setup-bulk-rooms-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await beginRoomLinenConfirm({
        floor_from: Number(fd.get("floor_from")),
        floor_to: Number(fd.get("floor_to")),
        rooms_per_floor: Number(fd.get("rooms_per_floor")),
        default_category_id: fd.get("default_category_id"),
        default_bed_config_id: fd.get("default_bed_config_id")
      });
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-ensure-starters")?.addEventListener("click", async () => {
    try {
      await api("/setup/room-types", { method: "POST", body: { use_starters: true } });
      await api("/setup/beds", { method: "POST", body: { use_starters: true } });
      await api("/setup/linen-items", { method: "POST", body: { use_starters: true } });
      const data = await api("/setup/standards", {
        method: "POST",
        body: { use_defaults: true, replace: true }
      });
      state.setupState = data;
      toast("Linen starters refreshed");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-simple-rooms-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (!(state.setupState?.roomCategories || []).length || !(state.setupState?.bedConfigs || []).length) {
        await api("/setup/room-types", { method: "POST", body: { use_starters: true } });
        await api("/setup/beds", { method: "POST", body: { use_starters: true } });
        await api("/setup/linen-items", { method: "POST", body: { use_starters: true } });
        await api("/setup/standards", { method: "POST", body: { use_defaults: true, replace: true } });
        state.setupState = await loadSetupState();
      }
      const fd = new FormData(e.target);
      const names = String(fd.get("room_names") || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      await beginRoomLinenConfirm({
        mode: "simple",
        room_count: Number(fd.get("room_count") || 6),
        floor_number: Number(fd.get("floor_number") || 1),
        default_category_id: fd.get("default_category_id") || state.setupState?.roomCategories?.[0]?.id,
        default_bed_config_id: fd.get("default_bed_config_id") || state.setupState?.bedConfigs?.[0]?.id,
        room_names: names
      });
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-linen-confirm-cancel")?.addEventListener("click", () => {
    state.setupRoomDraft = null;
    render();
  });

  $("#setup-linen-confirm-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const draft = state.setupRoomDraft;
      if (!draft?.createBody) throw new Error("Nothing to confirm.");
      const fd = new FormData(e.target);
      const standards = (draft.lines || []).map((line) => ({
        category_id: draft.category_id,
        bed_config_id: draft.bed_config_id,
        linen_item_id: line.linen_item_id,
        quantity: Number(fd.get(`qty_${line.linen_item_id}`) || 0)
      }));
      if (!standards.some((row) => row.quantity > 0)) {
        throw new Error("Set at least one linen quantity greater than zero.");
      }
      await api("/setup/standards", {
        method: "POST",
        body: { standards, replace: false }
      });
      const data = await api("/setup/rooms/bulk", {
        method: "POST",
        body: draft.createBody
      });
      state.setupState = data;
      state.setupRoomDraft = null;
      toast(`Saved ${data.created} ${state.session?.property?.space_label || "rooms"}`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll("[data-edit-room]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.setupEditingRoomId = btn.getAttribute("data-edit-room");
      state.setupExceptionRoomId = null;
      state.setupExceptionDraft = null;
      render();
    });
  });
  document.querySelectorAll("[data-cancel-edit-room]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.setupEditingRoomId = null;
      render();
    });
  });
  document.querySelectorAll(".setup-amend-room-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        const roomId = form.getAttribute("data-room-id");
        const data = await api(`/setup/rooms/${roomId}`, {
          method: "PATCH",
          body: {
            room_number: String(fd.get("room_number") || "").trim(),
            floor_number: Number(fd.get("floor_number")),
            category_id: fd.get("category_id"),
            bed_config_id: fd.get("bed_config_id")
          }
        });
        state.setupState = data;
        state.setupEditingRoomId = null;
        toast("Room updated");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
  document.querySelectorAll("[data-remove-room]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const roomId = btn.getAttribute("data-remove-room");
        if (!window.confirm("Remove this room from active ops?")) return;
        const data = await api(`/setup/rooms/${roomId}`, { method: "DELETE" });
        state.setupState = data;
        toast("Room removed");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#setup-connect-aerosparkle")?.addEventListener("click", () => {
    const aerosparkle = document.querySelector('input[name="partner_type"][value="aerosparkle"]');
    if (aerosparkle) aerosparkle.checked = true;
    const nameInput = document.querySelector('#setup-ops-form input[name="laundry_name"]');
    if (nameInput && !String(nameInput.value || "").trim()) nameInput.value = "AeroSparkle";
    window.open("https://aerosparkle.com/", "_blank", "noopener");
    toast("AeroSparkle selected — finish connect details, then save");
  });

  document.querySelectorAll("[data-info]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.infoPopover = btn.getAttribute("data-info");
      render();
    });
  });
  $("#info-popover-close")?.addEventListener("click", () => {
    state.infoPopover = null;
    render();
  });
  $("#info-popover-overlay")?.addEventListener("click", (e) => {
    if (e.target?.dataset?.closeInfo) {
      state.infoPopover = null;
      render();
    }
  });

  document.querySelectorAll("[data-show-guide]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-show-guide");
      if (!key) return;
      delete state.setupGuideDismissed[key];
      delete state.setupGuideDismissed.__all;
      state.setupGuideKey = key;
      render();
    });
  });
  $("#setup-guide-continue")?.addEventListener("click", () => {
    const key = $("#setup-guide-continue")?.getAttribute("data-guide-key");
    if (key) state.setupGuideDismissed[key] = true;
    state.setupGuideKey = null;
    render();
  });
  $("#setup-guide-skip-all")?.addEventListener("click", () => {
    state.setupGuideDismissed = { __all: true };
    state.setupGuideKey = null;
    render();
  });

  $("#setup-confirm-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      if (fd.get("confirm_setup") !== "on") {
        throw new Error("Tick the box to confirm your overall setup.");
      }
      const data = await api("/setup/property", {
        method: "PATCH",
        body: { setup_confirmed: true }
      });
      state.setupState = data;
      if (state.session?.property && data.property) {
        state.session.property = { ...state.session.property, ...data.property };
      }
      toast("Setup confirmed — you can amend it anytime");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-ops-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const ownerOnly = fd.get("owner_only") === "on";
      const data = await api("/setup/ops-bootstrap", {
        method: "POST",
        body: {
          store_name: String(fd.get("store_name") || "").trim(),
          laundry_name: String(fd.get("laundry_name") || "").trim(),
          partner_type: String(fd.get("partner_type") || "in_house"),
          external_ref: String(fd.get("external_ref") || "").trim(),
          owner_only: ownerOnly,
          housekeeper_count: Number(fd.get("housekeeper_count") || 0),
          supervisor_count: Number(fd.get("supervisor_count") || 0),
          store_stock_per_item: Number(fd.get("store_stock_per_item") || 40)
        }
      });
      state.setupState = data;
      if (state.session?.property && data.property) {
        state.session.property = { ...state.session.property, ...data.property };
      }
      toast("Team & laundry operations saved");
      state.setupStep = setupStepsFor(data.property || state.session?.property).length;
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-open-admin")?.addEventListener("click", async () => {
    state.view = "admin";
    try {
      state.master = (await api("/master")).master;
    } catch (err) {
      toast(err.message, true);
    }
    render();
  });

  $("#setup-open-morning")?.addEventListener("click", async () => {
    state.view = "round";
    try {
      await ensureMorningRound();
    } catch (err) {
      toast(err.message, true);
    }
    render();
  });

  $("#generate-morning")?.addEventListener("click", async () => {
    try {
      const occupancy = Number($("#morning-occupancy")?.value ?? state.morningOccupancy);
      const checkout = Number($("#morning-checkout")?.value ?? state.morningCheckout);
      const mode =
        document.querySelector('input[name="morning-mode"]:checked')?.value || state.morningMode || "replace";
      state.morningOccupancy = occupancy;
      state.morningCheckout = checkout;
      state.morningMode = mode;
      if (mode === "replace" && (state.tasks || []).length) {
        const ok = window.confirm("Replace the current morning board with a new generated plan?");
        if (!ok) return;
      }
      const data = await api("/rounds/generate-morning", {
        method: "POST",
        body: {
          occupancy_pct: occupancy,
          checkout_pct_of_occupied: checkout,
          vip_pct_of_occupied: 3,
          dnd_pct_of_stayover: 4,
          no_service_pct_of_occupied: 1,
          mode
        }
      });
      state.round = data.round;
      state.tasks = data.tasks;
      state.morningSummary = data.summary || null;
      const s = data.summary || {};
      toast(
        `Generated ${s.change_tasks ?? data.added} change tasks (${s.checkout ?? "?"} checkout / ${s.stayover ?? "?"} stayover / ${s.vip ?? "?"} VIP / ${s.skipped ?? "?"} skipped).`
      );
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#generate-rules")?.addEventListener("click", async () => {
    try {
      const data = await api("/rounds/generate", {
        method: "POST",
        body: { rule_code: $("#rule-code")?.value || "STAYOVER", round_id: state.round?.id }
      });
      state.round = data.round;
      state.tasks = data.tasks;
      state.morningSummary = null;
      toast(`Added ${data.added} rooms from rule`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#release-round")?.addEventListener("click", async () => {
    try {
      if (!state.round) throw new Error("Open today’s round first");
      state.openAfterActivate = Boolean($("#open-after-activate")?.checked);
      const data = await api("/rounds/release", { method: "POST", body: { round_id: state.round.id } });
      state.round = data.round;
      state.tasks = data.tasks;
      state.board = data.board;
      toast("Morning board active for assignment");
      if (state.openAfterActivate) {
        state.view = "assign";
      }
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#goto-assign")?.addEventListener("click", async () => {
    try {
      state.view = "assign";
      if (state.round) {
        state.board = (await api(`/rounds/${state.round.id}/board`)).board;
      }
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#toggle-other-ways")?.addEventListener("click", () => {
    state.otherWaysOpen = !state.otherWaysOpen;
    render();
  });

  document.querySelectorAll("[data-round-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.roundTaskFilter = btn.dataset.roundFilter;
      render();
    });
  });

  $("#round-floor-filter")?.addEventListener("change", (e) => {
    state.roundFilterFloor = e.target.value;
    render();
  });

  $("#morning-occupancy")?.addEventListener("change", (e) => {
    state.morningOccupancy = Number(e.target.value) || 80;
  });
  $("#morning-checkout")?.addEventListener("change", (e) => {
    state.morningCheckout = Number(e.target.value) || 40;
  });
  document.querySelectorAll('input[name="morning-mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.morningMode = el.value;
    });
  });
  $("#open-after-activate")?.addEventListener("change", (e) => {
    state.openAfterActivate = e.target.checked;
  });

  $("#csv-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const csv_text = new FormData(e.target).get("csv");
      const data = await api("/rounds/import-csv", { method: "POST", body: { csv_text } });
      state.round = data.round;
      state.tasks = data.tasks;
      state.morningSummary = null;
      toast(`Imported ${data.added} rooms`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#manual-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const data = await api("/rounds/add-rooms", {
        method: "POST",
        body: {
          room_ids: selectedOptions(e.target.room_ids),
          task_reason: fd.get("task_reason")
        }
      });
      state.round = data.round;
      state.tasks = data.tasks;
      state.morningSummary = null;
      toast(`Added ${data.added} rooms`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#load-board")?.addEventListener("click", async () => {
    try {
      if (!state.round) {
        const today = await api("/rounds/today");
        state.round = today.round;
      }
      if (!state.round) throw new Error("Create a round first");
      state.board = (await api(`/rounds/${state.round.id}/board`)).board;
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#assign-params-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.assignParams = {
      prefer_default_floors: fd.get("prefer_default_floors") === "on",
      amendments_notes: String(fd.get("amendments_notes") || "").trim()
    };
    state.assignParamsSaved = true;
    toast("Assignment settings confirmed — you can run assignment now");
    render();
  });

  $("#run-assignment")?.addEventListener("click", async () => {
    try {
      if (!state.assignParamsSaved || !state.assignParams) {
        throw new Error("Confirm assignment settings first.");
      }
      if (!state.round?.id) {
        const today = await api("/rounds/today");
        state.round = today.round;
      }
      if (!state.round?.id) {
        throw new Error("Activate today’s morning board first, then return here to assign.");
      }
      const data = await api("/tasks/assign-by-rules", {
        method: "POST",
        body: {
          round_id: state.round.id,
          confirm: true,
          rules: { ...state.assignParams, confirm: true }
        }
      });
      state.board = data.board;
      toast(data.message || (data.assigned ? `Assigned ${data.assigned} rooms` : "Assignment complete"));
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#refresh-board")?.addEventListener("click", async () => {
    state.board = (await api(`/rounds/${state.round.id}/board`)).board;
    render();
  });

  document.querySelectorAll(".default-floors-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.defaultFloorsEditUserId = btn.dataset.user;
      render();
      $("#default-floors-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  $("#default-floors-user")?.addEventListener("change", (e) => {
    state.defaultFloorsEditUserId = e.target.value;
    render();
  });

  $("#default-floors-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const form = e.target;
      const floors = [...form.querySelectorAll('input[name="floors"]:checked')].map((el) => Number(el.value));
      const data = await api("/staff/default-floors", {
        method: "POST",
        body: { user_id: form.dataset.user, floors }
      });
      if (state.master) {
        state.master.agents = data.housekeepers;
      }
      if (state.view === "assign" && state.round?.id) {
        state.board = (await api(`/rounds/${state.round.id}/board`)).board;
      } else if (state.view === "admin") {
        state.master = (await api("/master")).master;
      }
      toast("Default floors saved");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll(".assign-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const data = await api("/tasks/assign", {
          method: "POST",
          body: {
            round_id: state.round.id,
            agent_id: form.dataset.agent,
            task_ids: selectedOptions(form.task_ids)
          }
        });
        state.board = data.board;
        if (data.warning) toast(data.warning);
        else toast("Assigned");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#load-my-tasks")?.addEventListener("click", async () => {
    await loadMyTasks();
    render();
  });

  $("#suggest-cart")?.addEventListener("click", async () => {
    try {
      if (!state.round) throw new Error("No round");
      state.cartSuggest = await api("/cart/suggest", { query: { round_id: state.round.id } });
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#issue-cart")?.addEventListener("click", async () => {
    try {
      if (!state.cartSuggest) throw new Error("Suggest a cart first");
      const rows = [...document.querySelectorAll("[data-idx]")];
      const lines = rows.map((row, idx) => {
        const base = state.cartSuggest.lines[idx];
        return {
          linen_item_id: base.linen_item_id,
          suggested_qty: base.suggested_qty,
          loaded_qty: Number($(".cart-loaded", row).value || 0),
          extra_qty: Number($(".cart-extra", row).value || 0),
          returned_unused_qty: Number($(".cart-return", row).value || 0)
        };
      });
      await api("/cart/issue", {
        method: "POST",
        body: { round_id: state.round.id, lines, source: "room_stock" }
      });
      toast("Cart issued from room stock");
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.querySelectorAll("[data-open-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTaskId = btn.dataset.openTask;
      render();
      $("#room-editor")?.scrollIntoView({ behavior: "smooth" });
    });
  });

  document.querySelectorAll("#room-editor .qty button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cell = btn.closest(".qty");
      const input = $("input", cell);
      const next = Math.max(0, Number(input.value || 0) + Number(btn.dataset.delta));
      const max = input.dataset.max != null ? Number(input.dataset.max) : null;
      input.value = max != null ? Math.min(max, next) : next;
    });
  });

  $("#guest-request-open")?.addEventListener("click", () => {
    state.guestRequestOpen = true;
    state.guestRequestRoomId =
      state.myTasks.find((t) => t.id === state.activeTaskId)?.room_id || state.myTasks[0]?.room_id || "";
    render();
  });
  $("#guest-request-cancel")?.addEventListener("click", () => {
    state.guestRequestOpen = false;
    render();
  });
  document.querySelectorAll("[data-guest-for-room]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.guestRequestOpen = true;
      state.guestRequestRoomId = btn.dataset.guestForRoom || "";
      render();
      $("#guest-request-sheet")?.scrollIntoView({ behavior: "smooth" });
    });
  });
  document.querySelectorAll("[data-standing-kit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/extras/standing-request", {
          method: "POST",
          body: {
            room_id: btn.dataset.room,
            kit_code: btn.dataset.standingKit,
            deliver_now: false,
            requested_source: "guest",
            round_id: state.round?.id
          }
        });
        await loadMyTasks();
        toast("Daily guest extra added");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
  document.querySelectorAll("#guest-request-presets [data-kit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#guest-kit-code").value = btn.dataset.kit;
      $("#guest-other-fields")?.classList.add("hidden");
      document.querySelectorAll("#guest-request-presets .chip-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  document.querySelectorAll("#guest-request-presets [data-other]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#guest-kit-code").value = "";
      $("#guest-other-fields")?.classList.remove("hidden");
      document.querySelectorAll("#guest-request-presets .chip-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  document.querySelectorAll("[data-quick-kit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/extras/guest-request", {
          method: "POST",
          body: {
            room_id: btn.dataset.room,
            kit_code: btn.dataset.quickKit,
            deliver_now: false,
            requested_source: "guest",
            round_id: state.round?.id
          }
        });
        await loadMyTasks();
        toast("Guest request added");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
  $("#guest-request-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const submitter = e.submitter;
      const deliverNow = submitter?.value === "deliver";
      const kitCode = String(fd.get("kit_code") || "");
      const body = {
        room_id: fd.get("room_id"),
        deliver_now: deliverNow,
        requested_source: "guest",
        reason_note: fd.get("reason_note") || null,
        round_id: state.round?.id
      };
      if (kitCode) {
        body.kit_code = kitCode;
      } else {
        body.items = [{ linen_item_id: fd.get("linen_item_id"), quantity: Number(fd.get("quantity") || 1) }];
        body.reason_code = "Other";
      }
      if (!kitCode && $("#guest-other-fields")?.classList.contains("hidden")) {
        throw new Error("Choose Extra bed, a +1 preset, or Other");
      }
      const standing = fd.get("request_frequency") !== "one_time";
      await api(standing ? "/extras/standing-request" : "/extras/guest-request", { method: "POST", body });
      state.guestRequestOpen = false;
      await loadMyTasks();
      toast(standing ? "Daily guest extra added" : deliverNow ? "Extra delivered to room" : "Guest request recorded");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });
  document.querySelectorAll("[data-cancel-extra]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/extras/cancel", { method: "POST", body: { extra_line_id: btn.dataset.cancelExtra } });
        await loadMyTasks();
        toast("Extra cancelled");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
  document.querySelectorAll("[data-collect-extra]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/extras/collect", { method: "POST", body: { extra_line_id: btn.dataset.collectExtra } });
        await loadMyTasks();
        toast("Extra collected");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#snapshot-filter-floor")?.addEventListener("change", (e) => {
    state.snapshotFilterFloor = e.target.value;
    render();
  });
  document.querySelectorAll("[data-snapshot-room]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const roomId = btn.getAttribute("data-snapshot-room") || "";
      state.selectedSnapshotRoomId = roomId;
      render();
      $("#snapshot-detail-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (!roomId || !state.dashboard?.roomLinenSnapshot) return;
      const existing = (state.dashboard.roomLinenSnapshot.rooms || []).find((r) => r.room_id === roomId);
      if (existing?.lines?.length) return;
      try {
        const detail = await api("/dashboard/room-linen", { query: { roomId } });
        const rooms = state.dashboard.roomLinenSnapshot.rooms || [];
        const idx = rooms.findIndex((r) => r.room_id === roomId);
        if (idx >= 0) rooms[idx] = { ...rooms[idx], ...detail.room };
        else rooms.push(detail.room);
        state.dashboard.roomLinenSnapshot.rooms = rooms;
        if (state.selectedSnapshotRoomId === roomId && state.view === "dashboard") render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#assign-filter-floor")?.addEventListener("change", (e) => {
    state.assignFilterFloor = e.target.value;
    render();
  });
  $("#assign-unassigned-only")?.addEventListener("change", (e) => {
    state.assignUnassignedOnly = e.target.checked;
    render();
  });
  document.querySelectorAll("[data-assign-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedAssignTaskId = btn.getAttribute("data-assign-task") || "";
      render();
      $("#assign-detail-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  $("#assign-detail-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const data = await api("/tasks/assign", {
        method: "POST",
        body: {
          round_id: state.round.id,
          agent_id: fd.get("agent_id"),
          task_ids: [e.target.dataset.task]
        }
      });
      state.board = data.board;
      if (data.warning) toast(data.warning);
      else toast("Assigned");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#assign-skip-task")?.addEventListener("click", async (e) => {
    const reason = prompt("Skip reason");
    if (!reason) return;
    try {
      await api("/tasks/skip", { method: "POST", body: { task_id: e.target.dataset.task, reason } });
      state.board = (await api(`/rounds/${state.round.id}/board`)).board;
      toast("Room skipped");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#start-task")?.addEventListener("click", async (e) => {
    try {
      await api("/tasks/start", { method: "POST", body: { task_id: e.target.dataset.task } });
      await loadMyTasks();
      toast("Task started");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#matches-standard")?.addEventListener("click", async (e) => {
    try {
      await api("/tasks/counts", {
        method: "POST",
        body: { task_id: e.target.dataset.task, matches_standard: true }
      });
      await loadMyTasks();
      toast("Counts set to standard");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#save-counts")?.addEventListener("click", async (e) => {
    try {
      const lines = [...document.querySelectorAll("#room-editor tr[data-line-item]")].map((row) => {
        const read = (field) => Number($(`.qty input[data-field="${field}"]`, row).value || 0);
        return {
          linen_item_id: row.dataset.lineItem,
          linen_out_qty: read("linen_out_qty"),
          linen_in_qty: read("linen_in_qty"),
          unused_return_qty: read("unused_return_qty"),
          missing_qty: read("missing_qty"),
          damaged_qty: read("damaged_qty"),
          stained_qty: read("stained_qty")
        };
      });
      await api("/tasks/counts", {
        method: "POST",
        body: { task_id: e.target.dataset.task, lines, reason: "Agent count update" }
      });
      await loadMyTasks();
      toast("Counts saved");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#submit-task")?.addEventListener("click", async (e) => {
    try {
      const outcome = $("#service-outcome")?.value || "changed";
      const lines = [...document.querySelectorAll("#room-editor tr[data-line-item]")].map((row) => {
        const read = (field) => Number($(`.qty input[data-field="${field}"]`, row)?.value || 0);
        return {
          linen_item_id: row.dataset.lineItem,
          linen_out_qty: read("linen_out_qty"),
          linen_in_qty: read("linen_in_qty"),
          unused_return_qty: read("unused_return_qty"),
          missing_qty: read("missing_qty"),
          damaged_qty: read("damaged_qty"),
          stained_qty: read("stained_qty")
        };
      });
      const extra_lines = [...document.querySelectorAll("[data-standing-line]")].map((row) => ({
        id: row.dataset.standingLine,
        clean_in_qty: Number($(".standing-clean-in", row)?.value || 0),
        soiled_out_qty: Number($(".standing-soiled-out", row)?.value || 0),
        not_changed_qty: Number($(".standing-not-changed", row)?.value || 0),
        replenishment_outcome: outcome
      }));
      await api("/tasks/submit", {
        method: "POST",
        body: {
          task_id: e.target.dataset.task,
          lines,
          extra_lines,
          service_outcome: outcome,
          service_outcome_reason: $("#service-outcome-note")?.value || null
        }
      });
      await loadMyTasks();
      toast("Submitted for verification");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#service-outcome")?.addEventListener("change", (e) => {
    if (["not_changed", "dnd", "guest_declined", "room_unavailable"].includes(e.target.value)) {
      document.querySelectorAll('#room-editor tr[data-line-item] input[data-field="linen_out_qty"], #room-editor tr[data-line-item] input[data-field="linen_in_qty"]').forEach((input) => {
        input.value = 0;
      });
      if (!$("#service-outcome-note").value) {
        $("#service-outcome-note").value = e.target.options[e.target.selectedIndex].textContent;
      }
    }
  });

  document.querySelectorAll("[data-extra-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest("[data-standing-line]");
      if (!row) return;
      const expected = Number($(".standing-clean-in", row)?.max || 0);
      const mode = btn.dataset.extraMode;
      const request = (state.myTasks || []).flatMap((task) => task.extra_lines || []).find((extra) => extra.id === row.dataset.standingLine)?.standing_request || {};
      const installed = Number(request.current_installed_qty || 0);
      const clean = mode === "all" ? Math.max(0, expected - Math.min(expected, installed)) : 0;
      const soiled = mode === "all" ? Math.min(expected, installed) : 0;
      $(".standing-clean-in", row).value = clean;
      $(".standing-soiled-out", row).value = soiled;
      $(".standing-not-changed", row).value = mode === "all" ? 0 : expected;
      if (mode === "dnd") {
        $("#service-outcome").value = "dnd";
        $("#service-outcome-note").value = "DND — change later";
      } else if (mode === "none") {
        $("#service-outcome").value = "not_changed";
        $("#service-outcome-note").value = "Guest extra not replenished today";
      }
      if (["dnd", "none"].includes(mode)) {
        document.querySelectorAll('#room-editor tr[data-line-item] input[data-field="linen_out_qty"], #room-editor tr[data-line-item] input[data-field="linen_in_qty"]').forEach((input) => {
          input.value = 0;
        });
      }
    });
  });

  document.querySelectorAll(".hk-stop-extra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reason = prompt("Why should this daily extra stop?") || "No longer required";
      try {
        const data = await api("/extras/standing-stop", {
          method: "POST",
          body: {
            standing_extra_id: btn.dataset.standingExtra,
            round_id: state.round?.id,
            reason
          }
        });
        await loadMyTasks();
        toast(`Future daily replenishment stopped${data.collected_qty ? ` · ${data.collected_qty} piece(s) collected` : ""}`);
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#exception-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await api("/exceptions", {
        method: "POST",
        body: {
          task_id: fd.get("task_id"),
          exception_category_id: fd.get("exception_category_id"),
          linen_item_id: fd.get("linen_item_id") || null,
          quantity: Number(fd.get("quantity") || 1),
          notes: fd.get("notes"),
          mark_guest_claim: fd.get("mark_guest_claim") === "on"
        }
      });
      await loadMyTasks();
      toast("Exception reported");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#evidence-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const file = fd.get("photo");
      if (!(file instanceof File) || !file.size) throw new Error("Choose a photo");
      const dataUrl = await compressImage(file);
      await api("/evidence", {
        method: "POST",
        body: {
          task_id: fd.get("task_id"),
          file_name: file.name,
          content_type: file.type || "image/jpeg",
          data_base64: dataUrl.split(",")[1],
          byte_size: file.size
        }
      });
      await loadMyTasks();
      toast("Photo uploaded");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#refresh-queue")?.addEventListener("click", async () => {
    state.queue = (await api("/verification/queue", { query: { roundId: state.round?.id } })).queue;
    render();
  });

  document.querySelectorAll("[data-verify]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const task = state.queue.find((t) => t.id === btn.dataset.verify);
        await api("/tasks/verify", {
          method: "POST",
          body: {
            task_id: btn.dataset.verify,
            confirm_exception_ids: (task?.exceptions || []).map((e) => e.id)
          }
        });
        state.queue = (await api("/verification/queue", { query: { roundId: state.round?.id } })).queue;
        toast("Room verified");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  document.querySelectorAll("[data-return]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reason = prompt("Reason for return");
      if (!reason) return;
      try {
        await api("/tasks/return", {
          method: "POST",
          body: { task_id: btn.dataset.return, reason }
        });
        state.queue = (await api("/verification/queue", { query: { roundId: state.round?.id } })).queue;
        toast("Returned for correction");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  document.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/exceptions/guest-claim", {
          method: "POST",
          body: { exception_id: btn.dataset.claim, guest_claim_status: btn.dataset.status }
        });
        state.queue = (await api("/verification/queue", { query: { roundId: state.round?.id } })).queue;
        toast("Guest-claim status updated (no auto-charge)");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#filter-floor")?.addEventListener("change", (e) => {
    state.roomFilterFloor = e.target.value;
    render();
  });
  $("#filter-family")?.addEventListener("change", (e) => {
    state.roomFilterFamily = e.target.value;
    render();
  });
  document.querySelectorAll(".room-cell[data-room-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedRoomId = btn.dataset.roomId || "";
      render();
      $("#room-detail-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  document.querySelectorAll(".handover-room[data-assign-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedAssignTaskId = btn.dataset.assignTask || "";
      render();
      $("#assign-detail-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  async function saveRoomLinenRequirement(roomId, linenItemId, included, quantity) {
    const qty = Number(quantity);
    const data = await api("/admin/entity", {
      method: "POST",
      body: {
        entity: "room_linen_requirements",
        record: {
          room_id: roomId,
          linen_item_id: linenItemId,
          included: Boolean(included),
          quantity: Number.isFinite(qty) ? Math.max(0, qty) : 0
        }
      }
    });
    if (data.master) state.master = data.master;
    return data;
  }

  $("#room-type-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const roomId = form.dataset.roomId;
    const categoryId = form.querySelector("#room-type-select")?.value;
    if (!roomId || !categoryId) return;
    try {
      const room = (state.master?.rooms || []).find((r) => r.id === roomId);
      const data = await api("/admin/entity", {
        method: "POST",
        body: {
          entity: "rooms",
          record: {
            id: roomId,
            room_number: room?.room_number,
            floor_number: room?.floor_number,
            category_id: categoryId,
            bed_config_id: room?.bed_config_id,
            special_notes: room?.special_notes ?? null,
            is_active: room?.is_active !== false
          }
        }
      });
      state.master = data.master;
      state.selectedRoomId = roomId;
      const next = (data.master?.rooms || []).find((r) => r.id === roomId);
      toast(`Room type updated to ${next?.category?.name || "selected type"}`);
      render();
    } catch (err) {
      toast(err.message || "Could not update room type", true);
    }
  });

  document.querySelectorAll(".room-linen-included").forEach((input) => {
    input.addEventListener("change", async () => {
      const form = $("#room-linen-form");
      const roomId = form?.dataset.roomId;
      const itemId = input.dataset.itemId;
      if (!roomId || !itemId) return;
      const qtyInput = document.querySelector(`.room-linen-qty[data-item-id="${itemId}"]`);
      const included = input.checked;
      if (qtyInput) {
        qtyInput.disabled = !included;
        if (included && Number(qtyInput.value || 0) <= 0) qtyInput.value = "1";
      }
      try {
        await saveRoomLinenRequirement(roomId, itemId, included, included ? qtyInput?.value || 1 : 0);
        toast(included ? "Added to fitted set" : "Removed from fitted set");
        render();
      } catch (err) {
        toast(err.message || "Could not update linen item", true);
        input.checked = !included;
        if (qtyInput) qtyInput.disabled = !input.checked;
      }
    });
  });

  document.querySelectorAll(".room-linen-qty").forEach((input) => {
    input.addEventListener("change", async () => {
      const form = $("#room-linen-form");
      const roomId = form?.dataset.roomId;
      const itemId = input.dataset.itemId;
      const check = document.querySelector(`.room-linen-included[data-item-id="${itemId}"]`);
      if (!roomId || !itemId || !check?.checked) return;
      try {
        await saveRoomLinenRequirement(roomId, itemId, true, input.value);
        toast("Room quantity saved");
        render();
      } catch (err) {
        toast(err.message || "Could not save quantity", true);
      }
    });
  });

  $("#room-form-picker")?.addEventListener("change", (e) => {
    state.selectedRoomId = e.target.value || "";
    render();
    if (state.selectedRoomId) {
      $("#room-detail-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      $("#room-particulars-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  $("#room-form-new")?.addEventListener("click", () => {
    state.selectedRoomId = "";
    render();
    $("#room-particulars-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $("#room-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const id = String(fd.get("id") || "").trim();
      const notes = String(fd.get("special_notes") || "").trim();
      const record = {
        room_number: String(fd.get("room_number") || "").trim(),
        floor_number: Number(fd.get("floor_number")),
        category_id: fd.get("category_id"),
        bed_config_id: fd.get("bed_config_id"),
        special_notes: notes || null,
        is_active: fd.get("is_active") === "on"
      };
      if (id) record.id = id;
      const data = await api("/admin/entity", {
        method: "POST",
        body: { entity: "rooms", record }
      });
      state.master = data.master;
      state.selectedRoomId = data.record?.id || id || "";
      toast(id ? `Saved room ${record.room_number}` : `Created room ${record.room_number}`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

async function loadMyTasks() {
  const data = await api("/tasks/mine", { query: { roundId: state.round?.id } });
  state.round = data.round || state.round;
  state.myTasks = data.tasks || [];
  if (isHousekeeperMode()) {
    const next = state.myTasks.find((task) => !["Verified", "Skipped", "Submitted"].includes(task.status));
    const current = state.myTasks.find((task) => task.id === state.activeTaskId);
    if (!current || ["Verified", "Skipped", "Submitted"].includes(current.status)) {
      state.activeTaskId = next?.id || state.myTasks[0]?.id || null;
    }
    return;
  }
  if (state.activeTaskId) {
    const still = state.myTasks.find((t) => t.id === state.activeTaskId);
    if (!still) state.activeTaskId = state.myTasks[0]?.id || null;
  } else {
    state.activeTaskId = state.myTasks[0]?.id || null;
  }
}

async function loadCollections() {
  const data = await api("/transfers/collections", { query: { roundId: state.round?.id } });
  state.collections = data.collections || [];
}

function compressImage(file, maxWidth = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function init() {
  if (!state.token) {
    renderLogin();
    return;
  }
  try {
    await bootstrap();
  } catch {
    logout();
  }
}

init();
