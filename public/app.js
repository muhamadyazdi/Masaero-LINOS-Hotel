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
  authMode: "register",
  assignParams: {
    rooms_per_housekeeper: null,
    prefer_default_floors: true,
    keep_floor_clusters: true,
    allow_soft_overfill: true,
    max_floors_per_housekeeper: 2,
    amendments_notes: ""
  },
  assignParamsSaved: false
};

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

const SETUP_STEPS = [
  { id: 1, key: "profile", label: "Hotel profile" },
  { id: 2, key: "types", label: "Room types & beds" },
  { id: 3, key: "catalogue", label: "Linen catalogue" },
  { id: 4, key: "standards", label: "Fitted standards" },
  { id: 5, key: "rooms", label: "Bulk rooms" },
  { id: 6, key: "ops", label: "Store & staff" },
  { id: 7, key: "review", label: "Review & go live" }
];

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
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error?.message || `Request failed (${res.status})`);
  }
  return data;
}

async function login(email, password = "") {
  const data = await api("/auth/local", { method: "POST", body: { email, password } });
  state.token = data.token;
  localStorage.setItem("linos_hotel_token", state.token);
  await bootstrap();
}

async function registerTrial(body) {
  const data = await api("/auth/register", { method: "POST", body });
  state.token = data.token;
  localStorage.setItem("linos_hotel_token", state.token);
  state.activePropertyId = data.session?.property?.id || data.property?.id || "";
  if (state.activePropertyId) localStorage.setItem("linos_hotel_property_id", state.activePropertyId);
  await bootstrap();
  state.view = "hotel-setup";
  await loadSetupState();
  render();
}

async function bootstrap() {
  const query = {};
  if (state.activePropertyId) query.propertyId = state.activePropertyId;
  const data = await api("/bootstrap", { query });
  state.session = data.session;
  state.master = data.master;
  state.round = data.todayRound;
  state.dashboard = data.dashboard;
  if (data.session?.property?.id) {
    state.activePropertyId = data.session.property.id;
    localStorage.setItem("linos_hotel_property_id", state.activePropertyId);
  }
  if (state.round) {
    state.tasks = (await api("/rounds/today")).tasks || [];
  }
  if (state.session?.user?.is_superadmin) {
    try {
      state.setupProperties = (await api("/setup/properties")).properties || [];
    } catch {
      state.setupProperties = [];
    }
  }
  if (isHousekeeperMode()) {
    state.view = "agent";
    await loadMyTasks();
  }
  render();
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
  $("#app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <p class="eyebrow">Masaero</p>
        <h1>Masaero LINOS Hotel</h1>
        <p class="lede">Simple room linen operations for independent hotels, small resorts, and hosted properties.</p>
        <div class="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" class="auth-tab ${register ? "active" : ""}" id="auth-register-tab">Start free trial</button>
          <button type="button" class="auth-tab ${register ? "" : "active"}" id="auth-login-tab">Sign in</button>
        </div>
        ${
          register
            ? `<form id="trial-form" class="stack">
                <label>Your name <input name="display_name" autocomplete="name" required placeholder="Alex Tan" /></label>
                <label>Work email <input name="email" type="email" autocomplete="email" required placeholder="alex@yourhotel.com" /></label>
                <label>Hotel or property name <input name="hotel_name" required placeholder="Harbour View Hotel" /></label>
                <label>Password <input name="password" type="password" minlength="8" autocomplete="new-password" required placeholder="At least 8 characters" /></label>
                <button class="btn" type="submit">Create free trial</button>
                <p class="form-hint">Start with a 14-day free trial. You can configure rooms, linen, and staff after signing in.</p>
              </form>`
            : `<form id="login-form" class="stack">
                <label>Work email <input name="email" type="email" autocomplete="email" required placeholder="you@yourhotel.com" /></label>
                <label>Password <input name="password" type="password" autocomplete="current-password" placeholder="Your password" /></label>
                <button class="btn" type="submit">Sign in</button>
              </form>`
        }
      </div>
    </div>
  `;
  $("#auth-register-tab")?.addEventListener("click", () => {
    state.authMode = "register";
    renderLogin();
  });
  $("#auth-login-tab")?.addEventListener("click", () => {
    state.authMode = "login";
    renderLogin();
  });
  $("#trial-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await registerTrial({
        display_name: String(fd.get("display_name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        hotel_name: String(fd.get("hotel_name") || "").trim(),
        password: String(fd.get("password") || "")
      });
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await login(String(fd.get("email") || "").trim(), String(fd.get("password") || ""));
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function navItems() {
  if (isHousekeeperMode()) return [["agent", "My rooms"]];
  const items = [];
  if (can("dashboard.supervisor") || can("dashboard.agent") || can("dashboard.store") || can("dashboard.porter")) {
    items.push(["dashboard", "Dashboard"]);
  }
  if (can("round.create") || can("task.assign")) items.push(["round", "Morning board"]);
  if (can("task.assign") || can("admin.assignments")) items.push(["assign", "Assignment"]);
  if (can("cart.issue") || can("task.view.assigned") || can("room.service")) items.push(["agent", "My rooms"]);
  if (can("room.verify")) items.push(["verify", "Verification"]);
  if (can("transfer.view")) items.push(["transfers", "Linen transfers"]);
  if (can("admin.configure")) items.push(["admin", "Admin"]);
  if (isSuperadmin()) items.push(["hotel-setup", "Hotel setup"]);
  items.push(["feedback", "Feedback"]);
  return items;
}

function renderTransfers() {
  const collections = state.collections || [];
  const stores = state.master?.stores || [];
  const canCollect = can("transfer.collect");
  const canReceive = can("transfer.receive");
  return `
    <section class="panel">
      <h2>Linen transfers</h2>
      <p class="lede">Move counted soiled linen from rooms to the store, then reconcile receipt variances.</p>
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
              state.round?.id ? "No active store is configured." : "Open today’s morning board before preparing a collection."
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

  return `
    <section class="panel">
      <h2>Operations dashboard</h2>
      <p class="lede">Today’s room progress, verification pressure, and exception register.</p>
      ${propertyDisclaimer()}
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
  if (!p?.trial_ends_at || p.subscription_plan !== "free_trial") return "";
  return `
    <div class="trial-banner">
      <strong>Free trial</strong> · ${p.trial_days_remaining ?? ""} day(s) remaining.
      Configure your property and invite your operations team from Hotel setup.
    </div>
  `;
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
      <p class="form-hint">Your message is sent to the Masaero product owner and tracked with the LINOS Hotel work queue.</p>
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
    planning_housekeepers_needed: Math.ceil(changeTasks / 15) || 0
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
      <h2>Daily round — morning board ${round ? `<span class="badge ${isActive ? "ok" : "info"}">${round.status}</span>` : `<span class="badge">Opening…</span>`}</h2>
      <p class="lede">07:00 AM linen workload${round ? ` for ${round.service_date}` : ""}. Guest names are not imported. Active means housekeepers can be assigned.</p>
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
  const activeAgents = (board.byAgent || []).filter((b) => b.room_count > 0 || board.unassigned.length);
  const planning = board.planning_rooms_per_agent;
  const suggestedRooms = board.suggested_rooms_per_housekeeper || 15;
  const suggestionRooms = board.assignment_workload_rooms ?? board.unassigned.length;
  const suggestionHousekeepers = board.available_housekeepers ?? (board.byAgent || []).length;
  const params = state.assignParams || {};
  const paramsReady = Boolean(state.assignParamsSaved);

  return `
    <section class="panel">
      <h2>Assignment board</h2>
      <p class="lede">Set assignment parameters first, then run assignment. LINOS suggests a minimum of <strong>${suggestedRooms} rooms/housekeeper</strong> from ${suggestionRooms} rooms and ${suggestionHousekeepers} available housekeepers. You can change it; assignments may exceed the minimum. Manual assign/reassign remains available below.</p>
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
      <h2>Assignment parameters</h2>
      <p class="lede">Enter the proposed default and any rule amendments. Save parameters, then instruct the system to assign using those rules. One-click auto-assign is not available.</p>
      <form id="assign-params-form" class="grid-2">
        <label>Rooms per housekeeper (minimum)
          <input name="rooms_per_housekeeper" type="number" min="1" max="80" required value="${
            params.rooms_per_housekeeper ?? suggestedRooms ?? planning ?? 15
          }" />
          <span class="field-hint">Suggested minimum: ${suggestedRooms} (${suggestionRooms} rooms ÷ ${suggestionHousekeepers} available housekeepers). You may change it.</span>
        </label>
        <label>Max floors per housekeeper
          <input name="max_floors_per_housekeeper" type="number" min="0" max="40" value="${
            params.max_floors_per_housekeeper ?? 2
          }" />
          <span class="field-hint">0 = no limit</span>
        </label>
        <label class="room-form-active span-2">
          <span class="room-form-check">
            <input name="prefer_default_floors" type="checkbox" ${
              params.prefer_default_floors !== false ? "checked" : ""
            } />
            Prefer each housekeeper’s default floors
          </span>
        </label>
        <label class="room-form-active span-2">
          <span class="room-form-check">
            <input name="keep_floor_clusters" type="checkbox" ${
              params.keep_floor_clusters !== false ? "checked" : ""
            } />
            Keep rooms on the same floor clustered to one housekeeper where possible
          </span>
        </label>
        <label class="room-form-active span-2">
          <span class="room-form-check">
            <input name="allow_soft_overfill" type="checkbox" ${
              params.allow_soft_overfill !== false ? "checked" : ""
            } />
            Keep floor clusters together and allow assignments above the minimum (avoids tiny leftover blocks)
          </span>
        </label>
        <label class="span-2">Amendments / notes for this run
          <textarea name="amendments_notes" rows="2" placeholder="e.g. Floor 29 Club to HK 30–32; VIP suites stay with Supervisor A">${
            params.amendments_notes || ""
          }</textarea>
        </label>
        <div class="row span-2">
          <button class="btn" type="submit">Save parameters</button>
          ${
            paramsReady
              ? `<span class="badge ok">Parameters saved — ready to run</span>`
              : `<span class="lede">Save parameters before running assignment.</span>`
          }
        </div>
      </form>
      <div class="assign-run-box">
        <p class="lede">${
          paramsReady
            ? `Ready: minimum ${params.rooms_per_housekeeper} rooms/HK · default floors ${
                params.prefer_default_floors !== false ? "on" : "off"
              } · floor clusters ${params.keep_floor_clusters !== false ? "on" : "off"}${
                params.amendments_notes ? ` · note: ${params.amendments_notes}` : ""
              }`
            : "Run is disabled until you save parameters above."
        }</p>
        <button class="btn" type="button" id="run-assignment" ${paramsReady ? "" : "disabled"}>
          Run assignment with these rules
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
      <h2>My rooms</h2>
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
                <thead><tr><th>Item</th><th>Suggested</th><th>Load</th><th>Float / buffer</th><th>Return unused</th></tr></thead>
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
      <h2>Verification queue</h2>
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

  return `
    <section class="panel hotel-config-panel">
      <h2>Hotel configuration</h2>
      <p class="lede">Rooms are stock points for clean linen replenishment. Click a room in the floor grid to change its room type and fitted linen.</p>
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
      state.dashboard = (await api("/dashboard")).dashboard;
      if (state.view === "dashboard") {
        const app = $("#app");
        if (!app) return;
        // Soft refresh snapshot panel only when still on dashboard
        render();
      }
    } catch {
      /* ignore poll errors */
    }
  }, 50000);
}

function renderHotelSetup() {
  const step = state.setupStep || 1;
  const s = state.setupState;
  const p = s?.property || state.session?.property;
  const readiness = s?.readiness || { checks: [], ready: false, counts: {} };
  const cats = s?.roomCategories || [];
  const beds = s?.bedConfigs || [];
  const linen = s?.linenItems || [];
  const floors = s?.floors || [];

  const rail = SETUP_STEPS.map(
    (st) =>
      `<button type="button" class="setup-step-btn ${st.id === step ? "active" : ""} ${
        st.id < step ? "done" : ""
      }" data-setup-step="${st.id}"><span class="setup-step-num">${st.id}</span>${st.label}</button>`
  ).join("");

  let body = "";
  if (step === 1) {
    const creating = state.setupForceCreate || !p;
    body = `
      <h3>Hotel profile</h3>
      <p class="lede">Create a new hotel or update the profile for the property you are configuring. You can add more properties later.</p>
      <form id="setup-profile-form" class="grid-2">
        <label>Hotel name <input name="name" required value="${creating ? "" : p?.name || ""}" placeholder="e.g. Harbour View Hotel" /></label>
        <label>Code <input name="code" value="${creating ? "" : p?.code || ""}" placeholder="Auto from name if blank" ${
          creating ? "" : "readonly"
        } /></label>
        <label>Timezone <input name="timezone" value="${creating ? "Asia/Kuala_Lumpur" : p?.timezone || "Asia/Kuala_Lumpur"}" /></label>
        <label>Star rating <input name="star_rating" type="number" min="1" max="5" step="1" value="${
          creating ? "" : p?.star_rating ?? ""
        }" placeholder="5" /></label>
        <label class="span-2">Address <input name="address_line" value="${creating ? "" : p?.address_line || ""}" /></label>
        <label class="span-2">Positioning notes <textarea name="positioning" rows="2">${
          creating ? "" : p?.positioning || ""
        }</textarea></label>
        <label>Photo retention (days) <input name="photo_retention_days" type="number" min="30" value="${
          creating ? 365 : p?.photo_retention_days ?? 365
        }" /></label>
        <label class="room-form-active">Guest PII import
          <span class="room-form-check"><input name="allow_guest_pii_import" type="checkbox" ${
            !creating && p?.allow_guest_pii_import ? "checked" : ""
          } /> Allow CSV guest fields</span>
        </label>
        <div class="row span-2">
          <button class="btn" type="submit">${creating ? "Create hotel" : "Save profile"}</button>
          ${
            !creating
              ? `<button class="btn secondary" type="button" id="setup-new-hotel">Create another hotel</button>`
              : `<span class="lede">Creating a hotel switches you onto that property for the remaining steps.</span>`
          }
        </div>
      </form>`;
  } else if (step === 2) {
    body = `
      <h3>Room types &amp; beds</h3>
      <p class="lede">Define the room types (Superior, Deluxe…) and bed configs used for fitted linen standards.</p>
      <div class="row" style="margin-bottom:1rem">
        <button class="btn" type="button" id="setup-apply-types-beds">Apply starter types &amp; beds</button>
      </div>
      <div class="grid-2">
        <div>
          <h4>Room types (${cats.length})</h4>
          <ul class="setup-list">${
            cats.map((c) => `<li><strong>${c.name}</strong> · ${c.code}</li>`).join("") ||
            "<li class='muted'>None yet — use starters</li>"
          }</ul>
        </div>
        <div>
          <h4>Bed configs (${beds.length})</h4>
          <ul class="setup-list">${
            beds.map((b) => `<li><strong>${b.name}</strong> · ${b.code}</li>`).join("") ||
            "<li class='muted'>None yet — use starters</li>"
          }</ul>
        </div>
      </div>`;
  } else if (step === 3) {
    body = `
      <h3>Linen catalogue</h3>
      <p class="lede">Core pieces for daily changeouts. Start from the starter pack, then refine later in Admin if needed.</p>
      <div class="row" style="margin-bottom:1rem">
        <button class="btn" type="button" id="setup-apply-linen">Apply starter linen catalogue</button>
      </div>
      <ul class="setup-list">${
        linen.map((i) => `<li><strong>${i.code}</strong> — ${i.name}</li>`).join("") ||
        "<li class='muted'>No items yet</li>"
      }</ul>`;
  } else if (step === 4) {
    body = `
      <h3>Fitted standards</h3>
      <p class="lede">Quantities per room type × bed. Defaults scale Club/Suite higher than Superior.</p>
      <div class="row" style="margin-bottom:1rem">
        <button class="btn" type="button" id="setup-apply-standards">Generate default standards matrix</button>
      </div>
      <p class="lede">${s?.roomLinenStandards?.length || 0} standard lines saved.</p>`;
  } else if (step === 5) {
    const catOpts = cats
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
    const bedOpts = beds
      .map((b) => `<option value="${b.id}">${b.name}</option>`)
      .join("");
    body = `
      <h3>Bulk room builder</h3>
      <p class="lede">Generate rooms as {floor}{01..N}. Existing room numbers are skipped. Fine-tune individual rooms later on Admin.</p>
      <form id="setup-bulk-rooms-form" class="grid-2">
        <label>Floor from <input name="floor_from" type="number" min="1" required value="5" /></label>
        <label>Floor to <input name="floor_to" type="number" min="1" required value="8" /></label>
        <label>Rooms per floor <input name="rooms_per_floor" type="number" min="1" max="80" required value="20" /></label>
        <label>Default room type <select name="default_category_id" required>${catOpts}</select></label>
        <label>Default bed <select name="default_bed_config_id" required>${bedOpts}</select></label>
        <div class="row span-2">
          <button class="btn" type="submit" ${!cats.length || !beds.length ? "disabled" : ""}>Generate rooms</button>
        </div>
      </form>
      <p class="lede" style="margin-top:0.75rem">Active rooms: <strong>${s?.roomsCount || 0}</strong>${
        floors.length ? ` · Floors ${floors[0]}–${floors[floors.length - 1]}` : ""
      }</p>`;
  } else if (step === 6) {
    body = `
      <h3>Store, laundry &amp; starter staff</h3>
      <p class="lede">Creates the main linen store, laundry stub, exception categories, scheduling rules, and starter housekeepers with floors split evenly.</p>
      <form id="setup-ops-form" class="grid-2">
        <label>Store name <input name="store_name" value="${s?.stores?.[0]?.name || "Main Linen Store"}" /></label>
        <label>Laundry partner <input name="laundry_name" value="${
          s?.laundryProviders?.[0]?.name || "Laundry Partner"
        }" /></label>
        <label>Housekeepers <input name="housekeeper_count" type="number" min="1" max="80" value="8" /></label>
        <label>Supervisors <input name="supervisor_count" type="number" min="1" max="20" value="2" /></label>
        <label>Opening store stock / item <input name="store_stock_per_item" type="number" min="0" value="500" /></label>
        <div class="row span-2">
          <button class="btn" type="submit">Bootstrap ops</button>
        </div>
      </form>
      <p class="lede" style="margin-top:0.75rem">
        Stores: ${s?.stores?.length || 0} · Housekeepers: ${s?.housekeepersCount || 0} · Supervisors: ${
          s?.supervisorsCount || 0
        }
      </p>`;
  } else {
    const checks = (readiness.checks || [])
      .map(
        (c) =>
          `<li class="${c.ok ? "ok" : "missing"}"><span>${c.ok ? "✓" : "○"}</span> ${c.label}</li>`
      )
      .join("");
    body = `
      <h3>Review &amp; go live</h3>
      <p class="lede">When every check passes, morning board, assignment, and cart can run on this hotel. Day-to-day room and linen tweaks stay on Admin.</p>
      <ul class="setup-readiness">${checks}</ul>
      <div class="grid-3" style="margin-top:1rem">
        <div class="stat"><strong>${readiness.counts?.rooms || 0}</strong><span>Rooms</span></div>
        <div class="stat"><strong>${readiness.counts?.housekeepers || 0}</strong><span>Housekeepers</span></div>
        <div class="stat"><strong>${readiness.counts?.linen_items || 0}</strong><span>Linen items</span></div>
      </div>
      <div class="row" style="margin-top:1.25rem">
        <button class="btn" type="button" id="setup-open-admin" ${readiness.ready ? "" : "disabled"}>
          Open Admin to fine-tune rooms
        </button>
        <button class="btn secondary" type="button" id="setup-open-morning" ${readiness.ready ? "" : "disabled"}>
          Go to Morning board
        </button>
      </div>
      ${
        readiness.ready
          ? `<p class="lede setup-ready-note">This hotel is ready for ops. Use Admin for room-level fitted linen and default floors.</p>`
          : `<p class="lede">Complete the missing steps above, then return here.</p>`
      }`;
  }

  const canNext = step < 7;
  const canBack = step > 1;

  return `
    <section class="panel hotel-setup-panel">
      <h2>Hotel setup</h2>
      <p class="lede">Superadmin onboarding — set up a hotel once, then run daily ops. Reopen anytime to finish steps or create another hotel.</p>
      <div class="setup-rail" aria-label="Setup steps">${rail}</div>
      <div class="setup-body">${body}</div>
      <div class="setup-nav row">
        <button class="btn secondary" type="button" id="setup-back" ${canBack ? "" : "disabled"}>Back</button>
        <button class="btn" type="button" id="setup-next" ${canNext ? "" : "disabled"}>Next</button>
      </div>
    </section>
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
    state.setupStep = Math.min(7, (state.setupStep || 1) + 1);
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
        allow_guest_pii_import: fd.get("allow_guest_pii_import") === "on"
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
      state.setupProperties = (await api("/setup/properties")).properties || [];
      toast(creating ? "Hotel created" : "Hotel profile saved");
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

  $("#setup-apply-types-beds")?.addEventListener("click", async () => {
    try {
      await api("/setup/room-types", { method: "POST", body: { use_starters: true } });
      await api("/setup/beds", { method: "POST", body: { use_starters: true } });
      state.setupState = await loadSetupState();
      toast("Starter room types and beds applied");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-apply-linen")?.addEventListener("click", async () => {
    try {
      const data = await api("/setup/linen-items", { method: "POST", body: { use_starters: true } });
      state.setupState = data;
      toast("Starter linen catalogue applied");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-apply-standards")?.addEventListener("click", async () => {
    try {
      const data = await api("/setup/standards", {
        method: "POST",
        body: { use_defaults: true, replace: true }
      });
      state.setupState = data;
      toast("Default fitted standards generated");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-bulk-rooms-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const data = await api("/setup/rooms/bulk", {
        method: "POST",
        body: {
          floor_from: Number(fd.get("floor_from")),
          floor_to: Number(fd.get("floor_to")),
          rooms_per_floor: Number(fd.get("rooms_per_floor")),
          default_category_id: fd.get("default_category_id"),
          default_bed_config_id: fd.get("default_bed_config_id")
        }
      });
      state.setupState = data;
      toast(`Created ${data.created} rooms` + (data.skipped ? ` · skipped ${data.skipped}` : ""));
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-ops-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const data = await api("/setup/ops-bootstrap", {
        method: "POST",
        body: {
          store_name: String(fd.get("store_name") || "").trim(),
          laundry_name: String(fd.get("laundry_name") || "").trim(),
          housekeeper_count: Number(fd.get("housekeeper_count") || 8),
          supervisor_count: Number(fd.get("supervisor_count") || 2),
          store_stock_per_item: Number(fd.get("store_stock_per_item") || 500)
        }
      });
      state.setupState = data;
      toast("Ops bootstrap complete");
      state.setupStep = 7;
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
      rooms_per_housekeeper: Number(fd.get("rooms_per_housekeeper")),
      max_floors_per_housekeeper: Number(fd.get("max_floors_per_housekeeper") || 0),
      prefer_default_floors: fd.get("prefer_default_floors") === "on",
      keep_floor_clusters: fd.get("keep_floor_clusters") === "on",
      allow_soft_overfill: fd.get("allow_soft_overfill") === "on",
      amendments_notes: String(fd.get("amendments_notes") || "").trim()
    };
    if (
      !Number.isInteger(state.assignParams.rooms_per_housekeeper) ||
      state.assignParams.rooms_per_housekeeper < 1
    ) {
      toast("Enter a valid rooms-per-housekeeper value.", true);
      return;
    }
    state.assignParamsSaved = true;
    toast("Assignment parameters saved — you can run assignment now");
    render();
  });

  $("#run-assignment")?.addEventListener("click", async () => {
    try {
      if (!state.assignParamsSaved || !state.assignParams) {
        throw new Error("Save assignment parameters first.");
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
      if (data.rules?.rooms_per_housekeeper) {
        state.assignParams.rooms_per_housekeeper = data.rules.rooms_per_housekeeper;
      }
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
    btn.addEventListener("click", () => {
      state.selectedSnapshotRoomId = btn.getAttribute("data-snapshot-room") || "";
      render();
      $("#snapshot-detail-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
