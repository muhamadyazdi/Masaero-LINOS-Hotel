-- Standing guest extras and daily room-service outcomes.
-- A standing request is the ongoing need; room_task_extra_lines is the daily action.

CREATE TABLE IF NOT EXISTS standing_extra_requests (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  kit_id TEXT REFERENCES extra_kits(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  current_installed_qty INTEGER NOT NULL DEFAULT 0 CHECK (current_installed_qty >= 0),
  reason_code TEXT NOT NULL,
  reason_note TEXT,
  requested_source TEXT NOT NULL DEFAULT 'guest',
  status TEXT NOT NULL DEFAULT 'Active',
  start_service_date DATE NOT NULL,
  stopped_service_date DATE,
  stopped_by_user_id TEXT REFERENCES users(id),
  stop_reason TEXT,
  requested_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standing_extra_requests_room_status
  ON standing_extra_requests (property_id, room_id, status);

ALTER TABLE room_task_extra_lines
  ADD COLUMN IF NOT EXISTS standing_extra_request_id TEXT REFERENCES standing_extra_requests(id),
  ADD COLUMN IF NOT EXISTS not_changed_qty INTEGER NOT NULL DEFAULT 0 CHECK (not_changed_qty >= 0),
  ADD COLUMN IF NOT EXISTS replenishment_outcome TEXT;

CREATE INDEX IF NOT EXISTS idx_room_task_extra_lines_standing
  ON room_task_extra_lines (standing_extra_request_id, daily_round_id);

ALTER TABLE room_tasks
  ADD COLUMN IF NOT EXISTS service_outcome TEXT,
  ADD COLUMN IF NOT EXISTS service_outcome_reason TEXT,
  ADD COLUMN IF NOT EXISTS service_outcome_note TEXT,
  ADD COLUMN IF NOT EXISTS service_outcome_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS service_outcome_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_room_tasks_service_outcome
  ON room_tasks (daily_round_id, service_outcome);
