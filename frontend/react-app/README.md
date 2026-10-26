# Invoice Reconciliation React application

This is the official, independent React/TypeScript source at `frontend/react-app/`. FastAPI serves its build at `/`. `mock-source/` and the Legacy bundle at `/mock` are not build or runtime dependencies.

## Routes

- `/`: this React application with FastAPI-backed authentication and business modules.
- `/old`: previous Main frontend.
- `/mock`: Legacy mock reference retained during acceptance.
- `/new`: temporary alias to this built React application.

## Local development

Requirements: Node.js 22.12 or newer and the FastAPI backend running at `http://127.0.0.1:8000`.

```powershell
cd frontend/react-app
npm ci
npm run dev
```

Open `http://localhost:3001`. Vite proxies `/api` to `http://127.0.0.1:8000` by default. Set `VITE_BACKEND_ORIGIN` in `.env` to proxy to another backend origin. For deployment behind FastAPI, same-origin `/api` is the default; `VITE_API_BASE_URL` can set a different API base path at build time.

## Build and checks

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Production files are written to `dist/` and use `/react-app-assets/`. FastAPI mounts that path separately from `/assets/` for Legacy and `/legacy-assets/` for the old Main frontend.

The Docker image uses a Node build stage to run `npm ci` and `npm run build`; the Python stage then serves the generated files. A separate frontend install is not required when running the app through Docker Compose.

## Integrated functionality

Authentication, dashboard and worker status, invoice queue/detail/file/upload/OCR retry, review/reconcile/approve/delete, supplier/PO/GR reads and supported mutations/import, reconciliation settings, audit log, CSV/XLSX/reconciliation exports, admin user management, and password change call FastAPI. The server remains responsible for validation, persistence, workflow status, and authorization.

The backend currently has no invoice archive mutation endpoint. Archived invoices can be listed through the existing status filter, but the React app does not create an archive transition. Supplier update/delete endpoints and accounting voucher APIs are also absent. The cashbook screen remains explicitly labeled demo-only and its in-memory entries are not persisted or reported as real transactions. PDF/MISA export endpoints are not available.

## Authentication

Login uses the FastAPI OAuth form contract. Access tokens are held in memory and tab-scoped `sessionStorage`; every protected API request sends `Authorization: Bearer <token>`. The client clears the token after logout or HTTP 401. The backend-issued user role drives UI affordances; all permissions are still enforced by FastAPI.
