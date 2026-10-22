USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_ocr_runs (
	ocr_run_id INTEGER NOT NULL AUTO_INCREMENT,
	invoice_id INTEGER NOT NULL,
	engine VARCHAR(80) NOT NULL,
	model_name VARCHAR(160),
	model_version VARCHAR(100),
	status VARCHAR(32) NOT NULL,
	started_at DATETIME,
	finished_at DATETIME,
	duration_seconds NUMERIC(12, 4),
	config_json JSON,
	PRIMARY KEY (ocr_run_id),
	FOREIGN KEY(invoice_id) REFERENCES invoices (id)
);
