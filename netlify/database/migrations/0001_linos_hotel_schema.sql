-- LINOS Hotel schema (hotel-native locations)
-- Rooms hold clean/soiled room stock. Store and laundry are custody parties
-- (patterned on hospital store↔laundry LR/LD), not hospital ward/site stations.
-- Timestamps in UTC; display Asia/Kuala_Lumpur.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  demo_disclaimer TEXT,
  allow_guest_pii_import BOOLEAN NOT NULL DEFAULT FALSE,
  photo_retention_days INTEGER NOT NULL DEFAULT 365,
  location_model TEXT NOT NULL DEFAULT 'hotel_room_store_laundry',
  positioning TEXT,
  star_rating INTEGER,
  address_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  property_id TEXT REFERENCES properties(id),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent/supervisor routing scope by floor (NOT a stock site)
CREATE TABLE IF NOT EXISTS user_floor_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  floor_number INTEGER NOT NULL,
  role_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, floor_number, role_name)
);

CREATE TABLE IF NOT EXISTS room_categories (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  family TEXT NOT NULL,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS bed_configs (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (property_id, code)
);

-- Guest room = clean replenishment stock point (replaces hospital ward/site station)
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  floor_number INTEGER NOT NULL,
  category_id TEXT NOT NULL REFERENCES room_categories(id),
  bed_config_id TEXT NOT NULL REFERENCES bed_configs(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  special_notes TEXT,
  amenities_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, room_number)
);

-- Future-capable non-room locations (Club lounge, F&B, spa, etc.) — not Phase 1 room tasks
CREATE TABLE IF NOT EXISTS amenity_locations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  floor_number INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS linen_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece',
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS room_linen_standards (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES room_categories(id),
  bed_config_id TEXT NOT NULL REFERENCES bed_configs(id),
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  UNIQUE (category_id, bed_config_id, linen_item_id)
);

CREATE TABLE IF NOT EXISTS room_par_levels (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  par_quantity INTEGER NOT NULL CHECK (par_quantity >= 0),
  UNIQUE (room_id, linen_item_id)
);

-- Hotel linen store (custody party; hospital-style store location)
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (property_id, code)
);

-- Laundry custody party (hospital-style laundry location / provider)
CREATE TABLE IF NOT EXISTS laundry_providers (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  standard_turnaround_hours INTEGER NOT NULL DEFAULT 24,
  express_turnaround_hours INTEGER NOT NULL DEFAULT 8,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS exception_categories (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  requires_evidence BOOLEAN NOT NULL DEFAULT TRUE,
  guest_claim_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS scheduling_rules (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  task_reason TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS daily_rounds (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  shift TEXT NOT NULL DEFAULT 'AM',
  status TEXT NOT NULL DEFAULT 'Draft',
  planning_rooms_per_agent INTEGER NOT NULL DEFAULT 15,
  created_by TEXT REFERENCES users(id),
  released_by TEXT REFERENCES users(id),
  released_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, service_date, shift)
);

CREATE TABLE IF NOT EXISTS room_tasks (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  daily_round_id TEXT NOT NULL REFERENCES daily_rounds(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  status TEXT NOT NULL DEFAULT 'Unassigned',
  task_reason TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  special_instructions TEXT,
  occupancy_status TEXT,
  assigned_agent_id TEXT REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by TEXT REFERENCES users(id),
  skip_reason TEXT,
  return_reason TEXT,
  estimated_linen_pieces INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (daily_round_id, room_id)
);

CREATE TABLE IF NOT EXISTS cart_loads (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  daily_round_id TEXT NOT NULL REFERENCES daily_rounds(id),
  agent_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  -- room_stock = draw from each assigned room; store = issue from linen store
  source TEXT NOT NULL DEFAULT 'room_stock',
  store_id TEXT REFERENCES stores(id),
  issued_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_load_lines (
  id TEXT PRIMARY KEY,
  cart_load_id TEXT NOT NULL REFERENCES cart_loads(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  suggested_qty INTEGER NOT NULL DEFAULT 0,
  loaded_qty INTEGER NOT NULL DEFAULT 0,
  extra_qty INTEGER NOT NULL DEFAULT 0,
  returned_unused_qty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_task_linen_lines (
  id TEXT PRIMARY KEY,
  room_task_id TEXT NOT NULL REFERENCES room_tasks(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  standard_qty INTEGER NOT NULL DEFAULT 0,
  linen_out_qty INTEGER NOT NULL DEFAULT 0,
  linen_in_qty INTEGER NOT NULL DEFAULT 0,
  unused_return_qty INTEGER NOT NULL DEFAULT 0,
  missing_qty INTEGER NOT NULL DEFAULT 0,
  damaged_qty INTEGER NOT NULL DEFAULT 0,
  stained_qty INTEGER NOT NULL DEFAULT 0,
  other_discrepancy_qty INTEGER NOT NULL DEFAULT 0,
  UNIQUE (room_task_id, linen_item_id)
);

CREATE TABLE IF NOT EXISTS room_exceptions (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_task_id TEXT NOT NULL REFERENCES room_tasks(id) ON DELETE CASCADE,
  linen_item_id TEXT REFERENCES linen_items(id),
  exception_category_id TEXT NOT NULL REFERENCES exception_categories(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Reported',
  notes TEXT,
  guest_claim_status TEXT,
  reported_by TEXT REFERENCES users(id),
  confirmed_by TEXT REFERENCES users(id),
  resolved_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_task_id TEXT REFERENCES room_tasks(id) ON DELETE CASCADE,
  room_exception_id TEXT REFERENCES room_exceptions(id) ON DELETE SET NULL,
  uploaded_by TEXT REFERENCES users(id),
  content_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  storage_kind TEXT NOT NULL DEFAULT 'inline',
  storage_key TEXT,
  data_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only ledger. Location refs mirror hospital from/to locations without ward sites.
CREATE TABLE IF NOT EXISTS linen_transactions (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity INTEGER NOT NULL,
  from_bucket TEXT,
  to_bucket TEXT NOT NULL,
  from_room_id TEXT REFERENCES rooms(id),
  to_room_id TEXT REFERENCES rooms(id),
  from_store_id TEXT REFERENCES stores(id),
  to_store_id TEXT REFERENCES stores(id),
  from_laundry_provider_id TEXT REFERENCES laundry_providers(id),
  to_laundry_provider_id TEXT REFERENCES laundry_providers(id),
  room_id TEXT REFERENCES rooms(id),
  store_id TEXT REFERENCES stores(id),
  laundry_provider_id TEXT REFERENCES laundry_providers(id),
  cart_load_id TEXT REFERENCES cart_loads(id),
  room_task_id TEXT REFERENCES room_tasks(id),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Posted',
  reason TEXT,
  actor_id TEXT REFERENCES users(id),
  reverses_transaction_id TEXT REFERENCES linen_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_balances (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  bucket TEXT NOT NULL,
  room_id TEXT REFERENCES rooms(id),
  store_id TEXT REFERENCES stores(id),
  laundry_provider_id TEXT REFERENCES laundry_providers(id),
  cart_load_id TEXT REFERENCES cart_loads(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  property_id TEXT REFERENCES properties(id),
  actor_id TEXT REFERENCES users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  property_id TEXT,
  actor_id TEXT,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 2: soiled room → store collection (hospital SLC pattern, piece-counted)
CREATE TABLE IF NOT EXISTS store_collections (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id),
  daily_round_id TEXT REFERENCES daily_rounds(id),
  floor_number INTEGER,
  status TEXT NOT NULL DEFAULT 'Prepared',
  prepared_by TEXT REFERENCES users(id),
  collected_by TEXT REFERENCES users(id),
  received_by TEXT REFERENCES users(id),
  prepared_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_collection_lines (
  id TEXT PRIMARY KEY,
  store_collection_id TEXT NOT NULL REFERENCES store_collections(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id),
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  expected_qty INTEGER NOT NULL DEFAULT 0,
  collected_qty INTEGER NOT NULL DEFAULT 0,
  received_qty INTEGER NOT NULL DEFAULT 0,
  variance_qty INTEGER NOT NULL DEFAULT 0
);

-- Phase 2: store → laundry dispatch (hospital LR pattern)
CREATE TABLE IF NOT EXISTS laundry_dispatches (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id),
  laundry_provider_id TEXT NOT NULL REFERENCES laundry_providers(id),
  dispatch_number TEXT NOT NULL,
  dispatch_type TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'Draft',
  sent_at TIMESTAMPTZ,
  expected_return_at TIMESTAMPTZ,
  vehicle_ref TEXT,
  driver_ref TEXT,
  acknowledged_store_by TEXT REFERENCES users(id),
  acknowledged_laundry_by TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, dispatch_number)
);

CREATE TABLE IF NOT EXISTS laundry_dispatch_lines (
  id TEXT PRIMARY KEY,
  laundry_dispatch_id TEXT NOT NULL REFERENCES laundry_dispatches(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity_sent INTEGER NOT NULL DEFAULT 0,
  accepted_clean_returned INTEGER NOT NULL DEFAULT 0,
  approved_loss INTEGER NOT NULL DEFAULT 0,
  approved_damage INTEGER NOT NULL DEFAULT 0
);

-- Phase 2: laundry → store return (hospital LD pattern)
CREATE TABLE IF NOT EXISTS laundry_returns (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id),
  laundry_provider_id TEXT REFERENCES laundry_providers(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  received_at TIMESTAMPTZ,
  accepted_by TEXT REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS laundry_return_allocations (
  id TEXT PRIMARY KEY,
  laundry_return_id TEXT NOT NULL REFERENCES laundry_returns(id) ON DELETE CASCADE,
  laundry_dispatch_id TEXT NOT NULL REFERENCES laundry_dispatches(id),
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  rejected_qty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variances (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  linen_item_id TEXT REFERENCES linen_items(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Open',
  reason TEXT,
  approved_by TEXT REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms(property_id, floor_number);
CREATE INDEX IF NOT EXISTS idx_room_tasks_round ON room_tasks(daily_round_id);
CREATE INDEX IF NOT EXISTS idx_room_tasks_agent ON room_tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_room_tasks_status ON room_tasks(status);
CREATE INDEX IF NOT EXISTS idx_stock_room ON stock_balances(room_id, bucket);
CREATE INDEX IF NOT EXISTS idx_stock_store ON stock_balances(store_id, bucket);
CREATE INDEX IF NOT EXISTS idx_linen_tx_property ON linen_transactions(property_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_property ON audit_events(property_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence(room_task_id);
