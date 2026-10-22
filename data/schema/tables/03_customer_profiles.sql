USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_code VARCHAR(40) NOT NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (customer_id),
  UNIQUE KEY uq_customer_profiles_code (customer_code),
  CONSTRAINT fk_customer_profiles_organization FOREIGN KEY (customer_id)
    REFERENCES organizations (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
