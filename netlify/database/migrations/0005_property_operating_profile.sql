-- Operating profile for small-first hospitality with scale-up packs,
-- plus optional laundry partner metadata (AeroSparkle is optional).

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_staff_profile TEXT,
  ADD COLUMN IF NOT EXISTS property_kind TEXT NOT NULL DEFAULT 'hotel',
  ADD COLUMN IF NOT EXISTS property_scale TEXT NOT NULL DEFAULT 'small',
  ADD COLUMN IF NOT EXISTS features_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE laundry_providers
  ADD COLUMN IF NOT EXISTS partner_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_ref TEXT,
  ADD COLUMN IF NOT EXISTS config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE properties
SET property_kind = COALESCE(NULLIF(property_kind, ''), 'hotel'),
    property_scale = CASE
      WHEN is_demo THEN 'large'
      ELSE COALESCE(NULLIF(property_scale, ''), 'small')
    END
WHERE TRUE;

UPDATE laundry_providers
SET partner_type = COALESCE(NULLIF(partner_type, ''), 'manual')
WHERE TRUE;
