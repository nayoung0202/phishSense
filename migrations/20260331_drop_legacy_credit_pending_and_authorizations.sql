ALTER TABLE tenant_credit_accounts
DROP COLUMN IF EXISTS pending_credits;

DROP INDEX IF EXISTS tenant_credit_authorizations_tenant_status_idx;
DROP INDEX IF EXISTS tenant_credit_authorizations_tenant_idx;
DROP TABLE IF EXISTS tenant_credit_authorizations;
