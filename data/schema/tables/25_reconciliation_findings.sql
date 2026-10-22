USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS reconciliation_findings (
	finding_id INTEGER NOT NULL AUTO_INCREMENT,
	reconciliation_run_id INTEGER NOT NULL,
	allocation_id INTEGER,
	finding_type VARCHAR(80) NOT NULL,
	severity VARCHAR(24) NOT NULL,
	expected_value NUMERIC(18, 4),
	actual_value NUMERIC(18, 4),
	difference_value NUMERIC(18, 4),
	details TEXT NOT NULL,
	PRIMARY KEY (finding_id),
	FOREIGN KEY(reconciliation_run_id) REFERENCES reconciliation_runs (reconciliation_run_id),
	FOREIGN KEY(allocation_id) REFERENCES reconciliation_line_allocations (allocation_id)
);
