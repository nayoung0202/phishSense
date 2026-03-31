CREATE TABLE IF NOT EXISTS tenant_domains (
  tenant_id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  fqdn text NOT NULL UNIQUE,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_slug_idx
ON tenant_domains (slug);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_fqdn_idx
ON tenant_domains (fqdn);
