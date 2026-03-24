CREATE TABLE IF NOT EXISTS tenant_ai_keys (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  provider text NOT NULL,
  label text NOT NULL,
  key_enc text NOT NULL,
  masked_value text NOT NULL,
  key_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_used_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_ai_keys_tenant_idx
ON tenant_ai_keys (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_ai_keys_tenant_status_idx
ON tenant_ai_keys (tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_ai_keys_tenant_fingerprint_idx
ON tenant_ai_keys (tenant_id, key_fingerprint);
