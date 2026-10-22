USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS schema_migrations (
	revision VARCHAR(100) NOT NULL,
	applied_at DATETIME NOT NULL,
	PRIMARY KEY (revision)
);
