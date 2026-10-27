# MySQL Persistence Audit and Repair Plan

> **For agentic workers:** Execute this plan task-by-task in the current worktree. Preserve all pre-existing user edits. Do not commit, push, reset, or delete database volumes.

**Goal:** Ensure every business-data screen in the React application reads and writes persistent MySQL data through the FastAPI backend, correct broken/false-success flows, seed only missing demo records idempotently, and verify the result.

**Architecture:** Keep the existing React API client, FastAPI routers, SQLAlchemy models, and versioned startup migration pattern. Add only the backend models/routes needed for master-data pages that currently exist only in the front-end store, then make UI actions await server results and refresh from the API. Keep seed behavior additive and local-demo-only.

**Tech Stack:** React 19, TypeScript, FastAPI, SQLAlchemy, Pydantic, MySQL 8.4 via Docker Compose, pytest, Node test runner.

**Spec:** Active user goal dated 2026-10-27: audit all UI-to-MySQL paths, repair flows, add missing safe demo data, and verify persistence.

## Global Constraints

- Preserve the dirty working tree present at task start; do not overwrite existing user changes.
- Never reset, truncate, or clear the running database; never use `docker compose down -v`.
- Do not report a successful save unless the API response confirms the database write.
- Seed only missing local development/demo records; use stable keys and keep references valid.
- Do not commit or push.

## Review Focus

- API unavailable or non-2xx: the UI must show failure and must not leave a fake success or unsaved local mutation.
- Duplicate natural key and invalid foreign key: reject safely and retain the existing record.
- Seed rerun: counts and contents remain unchanged after the first successful seed.
- Invoice review editing item lines: server data and list/dashboard views agree after reload.
- Import and delete actions: UI result matches committed database changes; no whole-database deletion is reachable through ordinary master-data UI.

---

### Task 1: Inventory the running application and document data paths

**Files:**
- Create: `docs/DATA_PERSISTENCE_AUDIT.md`
- Inspect: `frontend/react-app/src/App.tsx`, every component under `frontend/react-app/src/components/`, `frontend/react-app/src/services/api.ts`, `backend/app/api/`, `backend/app/models/entities.py`, `backend/app/services/`, migration runner and demo seed.

- [x] Enumerate every route/module and its read/write actions.
- [x] Trace each business-data action through the frontend client, API route, service/model, and MySQL table.
- [x] Record real current table row counts without exposing invoice/customer contents.
- [x] Mark each flow connected, partial, mock/local-only, or static; list concrete fixes.

### Task 2: Make master-data screens persistent

**Files:**
- Modify: `backend/app/models/entities.py`, `backend/app/api/ledger.py` or a focused master-data router, `backend/app/main.py`, a new safe versioned migration, `frontend/react-app/src/services/api.ts`, `frontend/react-app/src/services/adapter.ts`, `frontend/react-app/src/components/masterdata/MasterDataModule.tsx`.
- Test: backend CRUD/migration tests and frontend API contract tests.

- [x] Add persistent endpoints/models for existing UI entities that lack tables (customers, employees, product categories) and complete existing product/supplier fields used by the UI.
- [x] Add list/create/update/delete contracts with validation, unique business keys, permission checks, audit events, and foreign-key-safe delete behavior.
- [x] Replace store-only master-data CRUD with awaited API calls and server refreshes. Implement import only where the UI offers it; never show success for a no-op.
- [x] Keep PO/GR/supplier operations on their existing API routes and ensure create/update/delete UI calls await and reflect the server result.

### Task 3: Remove false-success and mock fallbacks in business flows

**Files:**
- Modify: `frontend/react-app/src/App.tsx`, `frontend/react-app/src/services/api.ts`, relevant queue, matching, dashboard, accounting, reporting and layout components; corresponding backend modules only when an actual contract defect is verified.
- Test: add focused tests for each changed persistence/error contract.

- [x] On API/authentication failure, show a real connection/error state instead of signing into a mock user or treating failed reads as empty data.
- [x] Make invoice edits, reconciliation, approval/rejection, PO/GR edits, settings, audit/report views and invoice uploads use authoritative server data.
- [x] Replace fire-and-forget saves and local mutations that can get ahead of MySQL; refresh dependent screens after successful writes.
- [x] Keep only presentation state local (open tab, search query, current form draft); business records must come from API.

### Task 4: Add safe, idempotent demo data

**Files:**
- Modify: `backend/app/services/demo_seed.py` and its tests; document seed invocation in `README.md`.

- [x] Determine which demo entities/relationships are missing in the running local database.
- [x] Add minimal, clearly labeled demo records only where required, with stable unique keys and valid foreign keys.
- [x] Ensure a repeated seed adds no duplicate or overwrite and never deletes user data.
- [x] Verify first run and repeat run using isolated test databases; inspect current Docker database without resetting it.

### Task 5: Verify every flow and finalize the audit

**Files:**
- Update: `docs/DATA_PERSISTENCE_AUDIT.md`, `README.md` only where run/seed guidance is inaccurate.

- [x] Run backend tests from `backend/`, frontend tests and TypeScript typecheck.
- [x] Rebuild/restart only the app service if required; retain MySQL volumes and current records.
- [x] Exercise API read/write flows against the running local MySQL and re-read written rows after reload.
- [x] Recheck Docker health and the UI route, complete the audit table with post-fix evidence, and report remaining limitations.

**Final verification:** backend 62 passed, 1 skipped; frontend 31 passed; TypeScript check and production build succeeded. Live MySQL smoke CRUD used a rollback transaction; no `VERIFY-*` test rows remained. Final review was performed inline because this run does not use subagents.

---

**Execution choice:** Native inline implementation in the current session; do not delegate or alter Git history.
