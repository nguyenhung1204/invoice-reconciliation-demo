USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS audit_events (
	id INTEGER NOT NULL AUTO_INCREMENT,
	actor_user_id INTEGER,
	actor_email VARCHAR(255) NOT NULL,
	action VARCHAR(80) NOT NULL,
	entity_type VARCHAR(80) NOT NULL,
	entity_id VARCHAR(80) NOT NULL,
	detail TEXT NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(actor_user_id) REFERENCES users (id)
);
