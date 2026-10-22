USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS invoice_reviews (
  review_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  reviewer_user_id BIGINT UNSIGNED NULL,
  revision_number INT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  reviewed_at DATETIME NULL,
  review_note TEXT NULL,
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_invoice_review_revision (invoice_id, revision_number),
  CONSTRAINT fk_invoice_reviews_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id),
  CONSTRAINT fk_invoice_reviews_user FOREIGN KEY (reviewer_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
