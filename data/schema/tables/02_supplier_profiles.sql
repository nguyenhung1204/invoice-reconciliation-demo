USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS supplier_profiles (
  supplier_id BIGINT UNSIGNED NOT NULL,
  supplier_code VARCHAR(40) NOT NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (supplier_id),
  UNIQUE KEY uq_supplier_profiles_code (supplier_code),
  CONSTRAINT fk_supplier_profiles_organization FOREIGN KEY (supplier_id)
    REFERENCES organizations (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
