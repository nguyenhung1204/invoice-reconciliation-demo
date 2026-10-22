USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference_code VARCHAR(80) NOT NULL,
  invoice_number VARCHAR(80) NULL,
  invoice_series VARCHAR(80) NULL,
  seller_org_id BIGINT UNSIGNED NULL,
  buyer_org_id BIGINT UNSIGNED NULL,
  po_id BIGINT UNSIGNED NULL,
  invoice_date DATE NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'VND',
  subtotal_amount DECIMAL(18,2) NULL,
  tax_amount DECIMAL(18,2) NULL,
  total_amount DECIMAL(18,2) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_id),
  UNIQUE KEY uq_invoices_reference_code (reference_code),
  KEY ix_invoices_seller (seller_org_id),
  KEY ix_invoices_buyer (buyer_org_id),
  KEY ix_invoices_po (po_id),
  CONSTRAINT fk_invoices_seller FOREIGN KEY (seller_org_id) REFERENCES organizations (organization_id),
  CONSTRAINT fk_invoices_buyer FOREIGN KEY (buyer_org_id) REFERENCES organizations (organization_id),
  CONSTRAINT fk_invoices_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
