CREATE TABLE IF NOT EXISTS tenant_credit_accounts (
  tenant_id text PRIMARY KEY,
  plan_code text NOT NULL DEFAULT 'FREE',
  balance integer NOT NULL DEFAULT 0,
  included_credits integer NOT NULL DEFAULT 0,
  pending_credits integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_credit_accounts_plan_idx
ON tenant_credit_accounts (plan_code);

CREATE TABLE IF NOT EXISTS tenant_credit_authorizations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  feature_key text NOT NULL,
  usage_context text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  cost integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  message text,
  metadata_json text,
  settled_at timestamp,
  released_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_credit_authorizations_tenant_idx
ON tenant_credit_authorizations (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_credit_authorizations_tenant_status_idx
ON tenant_credit_authorizations (tenant_id, status);

CREATE TABLE IF NOT EXISTS tenant_credit_ledger (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  description text NOT NULL,
  feature_key text,
  usage_context text,
  reference_id text,
  metadata_json text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_credit_ledger_tenant_idx
ON tenant_credit_ledger (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_credit_ledger_tenant_created_idx
ON tenant_credit_ledger (tenant_id, created_at);
