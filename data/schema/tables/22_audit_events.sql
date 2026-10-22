USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_email_snapshot VARCHAR(255) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_event_id),
  KEY ix_audit_events_entity (entity_type, entity_id),
  KEY ix_audit_events_created_at (created_at),
  CONSTRAINT fk_audit_events_user FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
