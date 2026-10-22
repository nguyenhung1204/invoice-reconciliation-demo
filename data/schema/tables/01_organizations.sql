USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS organizations (
  organization_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tax_code VARCHAR(32) NOT NULL,
  legal_name VARCHAR(255) NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'VN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id),
  UNIQUE KEY uq_organizations_tax_code (tax_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
