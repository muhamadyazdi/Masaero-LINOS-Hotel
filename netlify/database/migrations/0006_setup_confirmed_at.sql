-- Track when Superadmin confirmed overall Hotel setup before going live.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS setup_confirmed_at TIMESTAMPTZ;
