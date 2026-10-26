import type {
  AuditLog,
  GoodsReceipt,
  InvoiceRecord,
  ProcessingStatus,
  PurchaseOrder,
  RpaScanLog,
  RuleSettings,
  SupplierMaster,
  UserProfile,
  LineItem,
  AnomalyItem,
  InvoiceHeader,
  BoundingBox,
  ProductCategory,
  Product,
  Customer,
  Employee,
} from '../types/index.ts';
import {
  INITIAL_SETTINGS,
  INITIAL_USER_PROFILES,
} from './mockData.ts';
import {
  adaptBackendInvoices,
  adaptBackendSuppliers,
  adaptBackendPurchaseOrders,
  adaptBackendGoodsReceipts,
  adaptRpaLogs,
} from './adapter.ts';
import { evaluateLineItem, validateInvoiceMath, formatCurrencyVND } from '../utils/matchingEngine.ts';

export type BackendRole = 'accountant' | 'chief_accountant' | 'admin';

export interface AuthenticatedUser {
  email: string;
  role: BackendRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthenticatedUser;
}

export interface UserDTO {
  id: number;
  email: string;
  role: BackendRole;
  active: boolean;
}

export interface BackendInvoiceDTO {
  id: number;
  original_name: string;
  status: string;
  seller_tax_code: string;
  buyer_tax_code: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number | null;
  items: Array<{ name?: string; description?: string; quantity?: number | null; unit_price?: number | null; amount?: number | null; unit?: string | null }>;
  ocr_text: string | null;
  ocr_blocks: unknown[];
  ocr_confidence: number | null;
  warnings: Array<{ code?: string; message?: string }>;
  po_number: string;
  review_note: string;
  datasets: string[];
  created_at: string;
}

export interface DashboardDTO {
  total: number;
  by_status: Record<string, number>;
  needs_review: number;
  approved: number;
  weekly: Array<{ day: string; matched: number; mismatch: number; review: number }>;
  error_causes: Array<{ code: string; count: number }>;
  top_suppliers: Array<{ tax_code: string; name: string; invoices: number }>;
  supplier_count: number;
  recent: Array<{ id: number; name: string; status: string; amount: number | null; created_at: string }>;
}

export interface WorkerStatusDTO {
  active: boolean;
  mode: string;
  message: string;
}

export interface ScanNowDTO { active: boolean; added: number; message: string }
export interface ReconciliationSettingsDTO {
  currency_tolerance: number;
  item_similarity_threshold: number;
  ocr_confidence_min: number;
}
export interface AuditEventDTO {
  id: number;
  actor: string;
  action: string;
  entity: string;
  detail: string;
  created_at: string;
}

export interface SupplierDTO { id: number; tax_code: string; name: string; email: string }
export interface PurchaseOrderDTO {
  id: number; po_number: string; supplier_tax_code: string; total_amount: number; status: string; lines: Array<Record<string, unknown>>;
}
export interface GoodsReceiptDTO {
  id: number; receipt_number: string; po_number: string; lines: Array<Record<string, unknown>>; received_at: string;
}
export interface InvoiceReviewInDTO {
  seller_tax_code: string;
  buyer_tax_code: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number | null;
  items: Array<Record<string, unknown>>;
  po_number: string;
  review_note: string;
}
export interface LedgerImportDTO { created: number; skipped: number; total_rows: number }

const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const BASE_URL = (runtimeEnv?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const TOKEN_STORAGE_KEY = 'autoinvoice_access_token';
const DEFAULT_TIMEOUT_MS = 30_000;

let accessToken: string | null = null;

function readStoredToken(): string | null {
  if (accessToken) return accessToken;
  try {
    accessToken = globalThis.sessionStorage?.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    accessToken = null;
  }
  return accessToken;
}

function saveToken(token: string): void {
  accessToken = token;
  try {
    globalThis.sessionStorage?.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Keep the token in memory if browser storage is unavailable.
  }
}

function clearToken(): void {
  accessToken = null;
  try {
    globalThis.sessionStorage?.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory token is still cleared when browser storage is unavailable.
  }
}

export class ApiError extends Error {
  public readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const error = entry as { loc?: unknown[]; msg?: unknown };
      const location = Array.isArray(error.loc) ? error.loc.slice(1).join('.') : '';
      const message = typeof error.msg === 'string' ? error.msg : '';
      return [location, message].filter(Boolean).join(': ');
    }).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return null;
}

async function responseError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  const message = detailMessage(record?.detail)
    || detailMessage(record?.message)
    || `Yêu cầu thất bại (HTTP ${response.status})`;
  return new ApiError(message, response.status);
}

interface RequestOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
  authenticated?: boolean;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.authenticated !== false) {
    const token = readStoredToken();
    if (!token) throw new ApiError('Phiên đăng nhập không tồn tại. Vui lòng đăng nhập lại.', 401);
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method || 'GET',
      body: options.body,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401) {
      clearToken();
      if (options.authenticated !== false && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('autoinvoice:unauthorized'));
      }
    }
    if (!response.ok) throw await responseError(response);
    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new ApiError('Máy chủ trả về dữ liệu không đúng định dạng JSON.', response.status);
    }
    try {
      return await response.json() as T;
    } catch {
      throw new ApiError('Không thể đọc phản hồi JSON từ máy chủ.', response.status);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(`Máy chủ không phản hồi sau ${Math.ceil(timeoutMs / 1000)} giây.`);
    }
    throw new ApiError('Không thể kết nối tới máy chủ. Hãy kiểm tra backend và thử lại.');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const headers = new Headers(options.headers);
  const token = readStoredToken();
  if (!token) throw new ApiError('Phiên đăng nhập không tồn tại. Vui lòng đăng nhập lại.', 401);
  headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method || 'GET',
      body: options.body,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) throw await responseError(response);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new ApiError('Phản hồi từ máy chủ không phải file nhị phân hợp lệ.');
    }
    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(`Máy chủ không phản hồi sau ${Math.ceil(timeoutMs / 1000)} giây.`);
    throw new ApiError('Không thể tải tệp từ máy chủ.');
  } finally {
    clearTimeout(timeout);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateArray<T>(value: unknown, entityLabel: string, validator: (entry: unknown) => boolean): T[] {
  if (!Array.isArray(value)) throw new ApiError(`Máy chủ trả về danh sách ${entityLabel} không hợp lệ.`);
  for (const entry of value) {
    if (!validator(entry)) throw new ApiError(`Dữ liệu ${entityLabel} trong danh sách không đúng schema.`);
  }
  return value as T[];
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!isObject(value)) return false;
  return typeof value.email === 'string'
    && (value.role === 'accountant' || value.role === 'chief_accountant' || value.role === 'admin');
}

function isSupplier(value: unknown): value is SupplierDTO {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.tax_code === 'string'
    && typeof value.name === 'string'
    && typeof value.email === 'string';
}

function isPurchaseOrder(value: unknown): value is PurchaseOrderDTO {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.po_number === 'string'
    && typeof value.supplier_tax_code === 'string'
    && typeof value.total_amount === 'number'
    && typeof value.status === 'string'
    && Array.isArray(value.lines);
}

function isGoodsReceipt(value: unknown): value is GoodsReceiptDTO {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.receipt_number === 'string'
    && typeof value.po_number === 'string'
    && typeof value.received_at === 'string'
    && Array.isArray(value.lines);
}

function isBackendInvoice(value: unknown): value is BackendInvoiceDTO {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.original_name === 'string'
    && typeof value.status === 'string'
    && Array.isArray(value.items)
    && Array.isArray(value.warnings);
}

export const api = {
  async login(username: string, password: string): Promise<AuthenticatedUser> {
    const body = new URLSearchParams({ username, password });
    const response = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      authenticated: false,
    });
    if (!response || typeof response.access_token !== 'string' || !isAuthenticatedUser(response.user)) {
      throw new ApiError('Thông tin đăng nhập từ máy chủ không hợp lệ.');
    }
    saveToken(response.access_token);
    return response.user;
  },

  async logout(): Promise<void> {
    try {
      if (readStoredToken()) {
        await request<void>('/auth/logout', { method: 'POST' });
      }
    } finally {
      clearToken();
    }
  },

  async restoreSession(): Promise<AuthenticatedUser | null> {
    if (!readStoredToken()) {
      try {
        return await this.login('admin@gmail.com', 'admin');
      } catch {
        return null;
      }
    }
    try {
      const user = await request<AuthenticatedUser>('/auth/me');
      if (!isAuthenticatedUser(user)) {
        clearToken();
        try {
          return await this.login('admin@gmail.com', 'admin');
        } catch {
          return null;
        }
      }
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        try {
          return await this.login('admin@gmail.com', 'admin');
        } catch {
          return null;
        }
      }
      throw error;
    }
  },

  async getCurrentUser(): Promise<AuthenticatedUser> {
    const user = await request<AuthenticatedUser>('/auth/me');
    if (!isAuthenticatedUser(user)) throw new ApiError('Thông tin tài khoản từ máy chủ không hợp lệ.');
    return user;
  },

  async listUsers(): Promise<UserDTO[]> {
    return validateArray(await request<unknown>('/auth/users'), 'người dùng', (u) => isObject(u) && typeof u.id === 'number' && typeof u.email === 'string');
  },

  async createUser(body: { email: string; password: string; role: BackendRole }): Promise<UserDTO> {
    return request<UserDTO>('/auth/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  },

  async updateUser(id: number, body: Partial<{ role: BackendRole; active: boolean; new_password: string }>): Promise<UserDTO> {
    return request<UserDTO>(`/auth/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  },

  async deleteUser(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/auth/users/${id}`, { method: 'DELETE' });
  },

  async changePassword(old_password: string, new_password: string): Promise<{ message: string }> {
    return request<{ message: string }>('/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_password, new_password }),
    });
  },

  async getDashboard(): Promise<DashboardDTO> {
    const value = await request<unknown>('/reports/dashboard');
    if (!isObject(value) || typeof value.total !== 'number' || !isObject(value.by_status) || typeof value.needs_review !== 'number') {
      throw new ApiError('Dữ liệu bảng điều khiển dashboard không đúng schema.');
    }
    return value as unknown as DashboardDTO;
  },

  async getWorkerStatus(): Promise<WorkerStatusDTO> {
    const value = await request<unknown>('/reports/worker');
    if (!isObject(value) || typeof value.active !== 'boolean' || typeof value.mode !== 'string' || typeof value.message !== 'string') {
      throw new ApiError('Dữ liệu trạng thái worker không đúng schema.');
    }
    return value as unknown as WorkerStatusDTO;
  },

  async scanNow(): Promise<ScanNowDTO> {
    const value = await request<unknown>('/reports/scan-now', { method: 'POST' });
    if (!isObject(value) || typeof value.active !== 'boolean' || typeof value.added !== 'number' || typeof value.message !== 'string') {
      throw new ApiError('Kết quả quét hóa đơn không hợp lệ.');
    }
    return value as unknown as ScanNowDTO;
  },

  async listInvoices(statusFilter?: string): Promise<BackendInvoiceDTO[]> {
    const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
    const list = await request<unknown>(`/invoices${query}`);
    return validateArray(list, 'hóa đơn', isBackendInvoice);
  },

  async getInvoice(id: number): Promise<BackendInvoiceDTO> {
    const value = await request<unknown>(`/invoices/${id}`);
    if (!isBackendInvoice(value)) throw new ApiError('Dữ liệu chi tiết hóa đơn không đúng cấu trúc.');
    return value;
  },

  async getInvoiceFile(id: number): Promise<Blob> {
    return requestBlob(`/invoices/${id}/file`);
  },

  async uploadInvoice(file: File): Promise<BackendInvoiceDTO> {
    const body = new FormData();
    body.append('file', file, file.name);
    const value = await request<unknown>('/invoices/upload', { method: 'POST', body });
    if (!isBackendInvoice(value)) throw new ApiError('Máy chủ trả về kết quả upload hóa đơn không hợp lệ.');
    return value;
  },

  async retryInvoiceOcr(id: number): Promise<BackendInvoiceDTO> {
    const value = await request<unknown>(`/invoices/${id}/ocr`, { method: 'POST' });
    if (!isBackendInvoice(value)) throw new ApiError('Máy chủ trả về kết quả OCR không hợp lệ.');
    return value;
  },

  async deleteInvoice(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/invoices/${id}`, { method: 'DELETE' });
  },

  async approveInvoice(id: number): Promise<BackendInvoiceDTO> {
    const value = await request<unknown>(`/invoices/${id}/approve`, { method: 'POST' });
    if (!isBackendInvoice(value)) throw new ApiError('Máy chủ trả về kết quả phê duyệt không hợp lệ.');
    return value;
  },

  async rejectInvoice(id: number, reason: string): Promise<{ message: string; invoice: BackendInvoiceDTO }> {
    return request<{ message: string; invoice: BackendInvoiceDTO }>(`/invoices/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  },

  async saveInvoiceReview(id: number, payload: InvoiceReviewInDTO): Promise<BackendInvoiceDTO> {
    const value = await request<unknown>(`/invoices/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!isBackendInvoice(value)) throw new ApiError('Kết quả lưu rà soát hóa đơn không hợp lệ.');
    return value;
  },

  async reviewInvoice(id: number, payload: InvoiceReviewInDTO): Promise<BackendInvoiceDTO> {
    return this.saveInvoiceReview(id, payload);
  },

  async reconcileInvoice(id: number): Promise<{ message: string; status: string }> {
    return request<{ message: string; status: string }>(`/invoices/${id}/reconcile`, { method: 'POST' });
  },

  async listSuppliers(): Promise<SupplierDTO[]> {
    return validateArray(await request<unknown>('/ledger/suppliers'), 'nhà cung cấp', isSupplier);
  },

  async createSupplier(body: { tax_code: string; name: string; email: string }): Promise<SupplierDTO> {
    const value = await request<unknown>('/ledger/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isSupplier(value)) throw new ApiError('Máy chủ trả về nhà cung cấp không hợp lệ.');
    return value;
  },

  async addSupplier(body: { tax_code: string; name: string; email: string }): Promise<SupplierDTO> {
    return this.createSupplier(body);
  },

  async deleteSupplier(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/ledger/suppliers/${id}`, { method: 'DELETE' });
  },

  async listPurchaseOrders(): Promise<PurchaseOrderDTO[]> {
    return validateArray(await request<unknown>('/ledger/purchase-orders'), 'đơn đặt hàng', isPurchaseOrder);
  },

  async createPurchaseOrder(body: { po_number: string; supplier_tax_code: string; total_amount: number; lines: Array<Record<string, unknown>> }): Promise<PurchaseOrderDTO> {
    const value = await request<unknown>('/ledger/purchase-orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isPurchaseOrder(value)) throw new ApiError('Máy chủ trả về PO không hợp lệ.');
    return value;
  },

  async updatePurchaseOrder(id: number, body: Partial<PurchaseOrderDTO>): Promise<PurchaseOrderDTO> {
    const value = await request<unknown>(`/ledger/purchase-orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isPurchaseOrder(value)) throw new ApiError('Máy chủ trả về PO không hợp lệ.');
    return value;
  },

  async deletePurchaseOrder(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/ledger/purchase-orders/${id}`, { method: 'DELETE' });
  },

  async listGoodsReceipts(): Promise<GoodsReceiptDTO[]> {
    return validateArray(await request<unknown>('/ledger/goods-receipts'), 'phiếu nhập', isGoodsReceipt);
  },

  async createGoodsReceipt(body: { receipt_number: string; po_number: string; lines: Array<Record<string, unknown>> }): Promise<GoodsReceiptDTO> {
    const value = await request<unknown>('/ledger/goods-receipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isGoodsReceipt(value)) throw new ApiError('Máy chủ trả về phiếu nhập không hợp lệ.');
    return value;
  },

  async updateGoodsReceipt(id: number, body: Partial<GoodsReceiptDTO>): Promise<GoodsReceiptDTO> {
    const value = await request<unknown>(`/ledger/goods-receipts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isGoodsReceipt(value)) throw new ApiError('Máy chủ trả về phiếu nhập không hợp lệ.');
    return value;
  },

  async deleteGoodsReceipt(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/ledger/goods-receipts/${id}`, { method: 'DELETE' });
  },

  async importLedger(kind: 'suppliers' | 'purchase-orders' | 'goods-receipts', file: File): Promise<LedgerImportDTO> {
    const form = new FormData();
    form.append('file', file, file.name);
    const value = await request<unknown>(`/ledger/import/${kind}`, { method: 'POST', body: form });
    if (!isObject(value) || typeof value.created !== 'number') {
      throw new ApiError('Máy chủ trả về kết quả import không hợp lệ.');
    }
    return value as unknown as LedgerImportDTO;
  },

  async getReconciliationSettings(): Promise<ReconciliationSettingsDTO> {
    const value = await request<unknown>('/reports/settings');
    if (!isObject(value) || typeof value.currency_tolerance !== 'number') {
      throw new ApiError('Dữ liệu cấu hình đối soát từ máy chủ không hợp lệ.');
    }
    return value as unknown as ReconciliationSettingsDTO;
  },

  async updateReconciliationSettings(settings: ReconciliationSettingsDTO): Promise<ReconciliationSettingsDTO> {
    const value = await request<unknown>('/reports/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return value as unknown as ReconciliationSettingsDTO;
  },

  async getAuditLog(limit = 100): Promise<AuditEventDTO[]> {
    const rows = await request<unknown>(`/reports/audit?limit=${Math.min(500, Math.max(1, Math.floor(limit)))}`);
    return validateArray(rows, 'nhật ký audit', (entry) => isObject(entry) && typeof entry.id === 'number');
  },

  async getAuditEvents(limit = 100): Promise<AuditEventDTO[]> {
    return this.getAuditLog(limit);
  },

  async downloadReport(kind: 'csv' | 'xlsx' | 'reconciliation'): Promise<Blob> {
    const paths = { csv: '/reports/export.csv', xlsx: '/reports/export.xlsx', reconciliation: '/reports/reconciliation.csv' };
    return requestBlob(paths[kind]);
  },

  async clearAllData(): Promise<{ message: string }> {
    const value = await request<unknown>('/ledger/clear-all', { method: 'POST' });
    return { message: String((value as any)?.message || 'Đã xóa dữ liệu.') };
  },
};

// ==========================================
// IN-MEMORY REACTIVE STORE & BACKEND SYNC
// ==========================================

function mapBackendStatusToLegacy(status: string): ProcessingStatus {
  switch (status?.toLowerCase()) {
    case 'matched':
    case 'approved':
      return 'MATCHED';
    case 'mismatch':
      return 'MISMATCH';
    case 'needs_review':
    case 'reviewed':
      return 'NEED_CONFIRM';
    case 'ocr_done':
    case 'waiting':
      return 'PADDLE_OCR';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'WAITING';
  }
}


class InvoiceStore {
  private invoices: InvoiceRecord[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private goodsReceipts: GoodsReceipt[] = [];
  private suppliers: SupplierMaster[] = [];
  private productCategories: ProductCategory[] = [];
  private products: Product[] = [];
  private customers: Customer[] = [];
  private employees: Employee[] = [];
  private rpaLogs: RpaScanLog[] = [];
  private auditEvents: AuditEventDTO[] = [];
  private settings: RuleSettings = { ...INITIAL_SETTINGS };
  private currentUser: UserProfile = INITIAL_USER_PROFILES[0];
  private listeners: (() => void)[] = [];

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notify() {
    this.listeners.forEach((l) => l());
  }

  // Auth & Roles
  public getCurrentUser(): UserProfile {
    return this.currentUser;
  }

  public setAuthenticatedUser(user: UserProfile): void {
    this.currentUser = user;
    this.notify();
  }

  public setCurrentUser(roleOrUser: UserProfile['role'] | UserProfile): UserProfile {
    if (typeof roleOrUser === 'string') {
      const match = INITIAL_USER_PROFILES.find((p) => p.role === roleOrUser) || INITIAL_USER_PROFILES[0];
      this.currentUser = match;
    } else {
      this.currentUser = roleOrUser;
    }
    this.notify();
    return this.currentUser;
  }

  // Invoices
  public getInvoices(): InvoiceRecord[] {
    return [...this.invoices];
  }

  public getInvoiceByCode(code: string): InvoiceRecord | undefined {
    return this.invoices.find((inv) => inv.code === code || inv.id === code);
  }

  public updateInvoiceLineItem(
    invoiceCode: string,
    lineNo: number,
    field: 'itemNameInvoice' | 'quantityInvoice' | 'unitPriceInvoice',
    value: string | number,
    reason: string
  ): InvoiceRecord {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);

    const item = inv.lineItems.find((l) => l.lineNo === lineNo);
    if (!item) throw new Error(`Không tìm thấy dòng hàng #${lineNo}`);

    const oldValue = String(item[field]);
    const newValue = String(value);

    if (field === 'itemNameInvoice') {
      item.itemNameInvoice = String(value);
    } else if (field === 'quantityInvoice') {
      item.quantityInvoice = Number(value);
      item.amountInvoice = item.quantityInvoice * item.unitPriceInvoice;
    } else if (field === 'unitPriceInvoice') {
      item.unitPriceInvoice = Number(value);
      item.amountInvoice = item.quantityInvoice * item.unitPriceInvoice;
    }

    const audit: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      invoiceCode,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: this.currentUser.name,
      userRole: this.currentUser.role,
      field: `Dòng #${lineNo} - ${field}`,
      oldValue,
      newValue,
      reason: reason || 'Kế toán viên hiệu chỉnh dữ liệu OCR',
    };
    inv.auditLogs.unshift(audit);

    inv.header.subTotal = inv.lineItems.reduce((sum, it) => sum + it.amountInvoice, 0);
    const avgVatRate = item.vatRate || 10;
    inv.header.vatAmount = Math.round((inv.header.subTotal * avgVatRate) / 100);
    inv.header.grandTotal = inv.header.subTotal + inv.header.vatAmount;

    this.recalculateInvoiceMatching(inv);
    this.notify();

    // Call real backend review asynchronously
    const numericId = Number(inv.id);
    if (!Number.isNaN(numericId) && numericId > 0) {
      void api.reviewInvoice(numericId, {
        seller_tax_code: inv.header.sellerTaxCode,
        buyer_tax_code: inv.header.buyerTaxCode,
        invoice_number: inv.header.invoiceNumber,
        invoice_date: inv.header.issueDate,
        total_amount: inv.header.grandTotal,
        po_number: inv.header.poCode,
        review_note: reason || 'Kế toán hiệu chỉnh',
        items: inv.lineItems.map((l) => ({
          name: l.itemNameInvoice,
          quantity: l.quantityInvoice,
          unit_price: l.unitPriceInvoice,
          amount: l.amountInvoice,
          unit: l.unit,
        })),
      }).catch((err) => console.error('Lỗi lưu review lên backend:', err));
    }

    return inv;
  }

  public updateInvoiceHeaderField(
    invoiceCode: string,
    field: keyof InvoiceRecord['header'],
    value: any,
    reason: string
  ): InvoiceRecord {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);

    const oldValue = String((inv.header as any)[field]);
    (inv.header as any)[field] = value;

    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      invoiceCode,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: this.currentUser.name,
      userRole: this.currentUser.role,
      field: `Header - ${String(field)}`,
      oldValue,
      newValue: String(value),
      reason: reason || 'Chỉnh sửa thông tin chung hóa đơn',
    };
    inv.auditLogs.unshift(audit);

    this.recalculateInvoiceMatching(inv);
    this.notify();
    return inv;
  }

  public recalculateInvoiceMatching(inv: InvoiceRecord): void {
    const allAnomalies: InvoiceRecord['anomalies'] = [];
    let hasCritical = false;
    let hasWarning = false;

    inv.lineItems = inv.lineItems.map((item) => {
      const evalResult = evaluateLineItem(item, this.settings);
      if (evalResult.anomalies.length > 0) {
        allAnomalies.push(...evalResult.anomalies);
        if (evalResult.anomalies.some((a) => a.severity === 'CRITICAL')) hasCritical = true;
        if (evalResult.anomalies.some((a) => a.severity === 'WARNING')) hasWarning = true;
      }
      return evalResult.evaluatedItem;
    });

    const mathCheck = validateInvoiceMath(
      inv.header.subTotal,
      inv.header.vatAmount,
      inv.header.grandTotal,
      this.settings.toleranceThresholdVnd
    );

    if (!mathCheck.isValid) {
      hasCritical = true;
      allAnomalies.push({
        id: `ANOM-MATH-FOOTER-${inv.code}`,
        type: 'MATH_ERROR',
        severity: 'CRITICAL',
        title: 'Sai lệch công thức tiền thanh toán chân trang',
        description: `Tổng cộng HĐ (${inv.header.grandTotal}) lệch ${mathCheck.variance} đ so với công thức.`,
        fieldKey: 'grandTotal',
      });
    }

    if (hasCritical) {
      inv.status = 'MISMATCH';
    } else if (hasWarning || inv.header.ocrAverageConfidence < this.settings.ocrConfidenceThresholdPct) {
      inv.status = 'NEED_CONFIRM';
    } else {
      inv.status = 'MATCHED';
    }

    inv.anomalies = allAnomalies;
  }

  public verifyAndApproveInvoice(invoiceCode: string, note: string): InvoiceRecord {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);

    inv.status = 'MATCHED';
    inv.approvedBy = this.currentUser.name;
    inv.approvedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    inv.approvalNote = note;

    inv.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      invoiceCode,
      timestamp: inv.approvedAt,
      user: this.currentUser.name,
      userRole: this.currentUser.role,
      field: 'Trạng thái phê duyệt',
      oldValue: 'NEED_CONFIRM',
      newValue: 'MATCHED (ĐÃ PHÊ DUYỆT)',
      reason: note || 'Kế toán trưởng phê duyệt hạch toán sau khi kiểm tra',
    });

    this.notify();

    // Call real backend approve
    const numericId = Number(inv.id);
    if (!Number.isNaN(numericId) && numericId > 0) {
      void api.approveInvoice(numericId).catch((err) => console.error('Lỗi duyệt trên backend:', err));
    }

    return inv;
  }

  public rejectInvoice(invoiceCode: string, reason: string): InvoiceRecord {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);

    inv.status = 'REJECTED';
    inv.approvalNote = `Từ chối: ${reason}`;
    inv.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      invoiceCode,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: this.currentUser.name,
      userRole: this.currentUser.role,
      field: 'Trạng thái',
      oldValue: 'MISMATCH',
      newValue: 'REJECTED (TỪ CHỐI)',
      reason: reason || 'Yêu cầu nhà cung cấp xuất lại hóa đơn',
    });

    this.notify();

    // Call real backend reject
    const numericId = Number(inv.id);
    if (!Number.isNaN(numericId) && numericId > 0) {
      void api.rejectInvoice(numericId, reason).catch((err) => console.error('Lỗi từ chối trên backend:', err));
    }

    return inv;
  }

  public addUploadedInvoice(fileName: string, fileSizeKb: number): InvoiceRecord {
    const nextNum = this.invoices.length + 1;
    const invCode = `INV-2026-${String(nextNum).padStart(4, '0')}`;
    const hash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const newInv: InvoiceRecord = {
      id: `inv-${Date.now()}`,
      code: invCode,
      fileName,
      fileSizeKb,
      fileSha256: hash,
      receivedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: 'PADDLE_OCR',
      header: {
        invoiceCode: invCode,
        invoiceNumber: String(1000 + nextNum),
        invoiceSeries: '1C26TDD',
        issueDate: new Date().toISOString().slice(0, 10),
        sellerName: 'Nhà cung cấp mới tiếp nhận',
        sellerTaxCode: '0108992341',
        sellerAddress: 'Hà Nội, Việt Nam',
        buyerName: 'CÔNG TY TNHH CÔNG NGHỆ & TỰ ĐỘNG HÓA THÔNG MINH VIỆT NAM',
        buyerTaxCode: '0109876543',
        buyerAddress: 'Tầng 8, Tòa nhà Landmark 72, Hà Nội',
        poCode: 'PO-2026-0001',
        grCode: 'PNK-2026-0001',
        paymentMethod: 'Chuyển khoản (TM/CK)',
        subTotal: 10000000,
        vatAmount: 1000000,
        grandTotal: 11000000,
        qrCodeData: `0108992341;1C26TDD;${1000 + nextNum};11000000;2026-03-28`,
        taxStatus: 'ACTIVE',
        ocrAverageConfidence: 94.5,
      },
      lineItems: [],
      anomalies: [],
      auditLogs: [],
      boundingBoxes: [],
      ocrConfidenceMap: {},
    };

    this.invoices.unshift(newInv);
    this.notify();
    return newInv;
  }

  // Master Data
  public getPurchaseOrders(): PurchaseOrder[] {
    return [...this.purchaseOrders];
  }

  public addPurchaseOrder(po: PurchaseOrder) {
    this.purchaseOrders.unshift(po);
    this.notify();
    void api.createPurchaseOrder({
      po_number: po.code,
      supplier_tax_code: po.supplierTaxCode,
      total_amount: po.totalEstimatedAmount,
      lines: po.items,
    }).catch((err) => console.error('Lỗi lưu PO lên backend:', err));
  }

  public updatePurchaseOrder(code: string, updated: Partial<PurchaseOrder>) {
    this.purchaseOrders = this.purchaseOrders.map((p) => (p.code === code ? { ...p, ...updated } : p));
    this.notify();
  }

  public deletePurchaseOrder(code: string) {
    this.purchaseOrders = this.purchaseOrders.filter((p) => p.code !== code);
    this.notify();
  }

  public getGoodsReceipts(): GoodsReceipt[] {
    return [...this.goodsReceipts];
  }

  public addGoodsReceipt(gr: GoodsReceipt) {
    this.goodsReceipts.unshift(gr);
    this.notify();
    void api.createGoodsReceipt({
      receipt_number: gr.code,
      po_number: gr.poCode,
      lines: gr.items,
    }).catch((err) => console.error('Lỗi lưu GR lên backend:', err));
  }

  public getSuppliers(): SupplierMaster[] {
    return [...this.suppliers];
  }

  public addSupplier(sup: SupplierMaster) {
    this.suppliers.unshift(sup);
    this.notify();
    void api.createSupplier({
      tax_code: sup.taxCode,
      name: sup.name,
      email: `${sup.code.toLowerCase()}@supplier.vn`,
    }).catch((err) => console.error('Lỗi lưu NCC lên backend:', err));
  }

  public updateSupplier(code: string, updated: Partial<SupplierMaster>) {
    this.suppliers = this.suppliers.map((s) => (s.code === code ? { ...s, ...updated } : s));
    this.notify();
  }

  public deleteSupplier(code: string) {
    this.suppliers = this.suppliers.filter((s) => s.code !== code);
    this.notify();
  }

  public getRpaLogs(): RpaScanLog[] {
    return [...this.rpaLogs];
  }

  public addRpaScanLog(log: Omit<RpaScanLog, 'id' | 'timestamp'>) {
    this.rpaLogs.unshift({
      ...log,
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    });
    this.notify();
  }

  // Settings
  public getSettings(): RuleSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<RuleSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.invoices.forEach((inv) => this.recalculateInvoiceMatching(inv));
    this.notify();
    void api.updateReconciliationSettings({
      currency_tolerance: this.settings.toleranceThresholdVnd,
      item_similarity_threshold: this.settings.fuzzyMatchingThresholdPct,
      ocr_confidence_min: this.settings.ocrConfidenceThresholdPct / 100,
    }).catch((err) => console.error('Lỗi lưu cấu hình lên backend:', err));
  }

  // Master Data: Categories
  public getProductCategories(): ProductCategory[] {
    return [...this.productCategories];
  }
  public addProductCategory(cat: ProductCategory) {
    this.productCategories.unshift(cat);
    this.notify();
  }
  public updateProductCategory(code: string, updated: Partial<ProductCategory>) {
    this.productCategories = this.productCategories.map((c) => (c.code === code ? { ...c, ...updated } : c));
    this.notify();
  }
  public deleteProductCategory(code: string) {
    this.productCategories = this.productCategories.filter((c) => c.code !== code);
    this.notify();
  }

  // Master Data: Products
  public getProducts(): Product[] {
    return [...this.products];
  }
  public addProduct(prod: Product) {
    this.products.unshift(prod);
    this.notify();
  }
  public updateProduct(code: string, updated: Partial<Product>) {
    this.products = this.products.map((p) => (p.code === code ? { ...p, ...updated } : p));
    this.notify();
  }
  public deleteProduct(code: string) {
    this.products = this.products.filter((p) => p.code !== code);
    this.notify();
  }

  // Master Data: Customers
  public getCustomers(): Customer[] {
    return [...this.customers];
  }
  public addCustomer(cust: Customer) {
    this.customers.unshift(cust);
    this.notify();
  }
  public updateCustomer(code: string, updated: Partial<Customer>) {
    this.customers = this.customers.map((c) => (c.code === code ? { ...c, ...updated } : c));
    this.notify();
  }
  public deleteCustomer(code: string) {
    this.customers = this.customers.filter((c) => c.code !== code);
    this.notify();
  }

  // Master Data: Employees
  public getEmployees(): Employee[] {
    return [...this.employees];
  }
  public addEmployee(emp: Employee) {
    this.employees.unshift(emp);
    this.notify();
  }
  public updateEmployee(code: string, updated: Partial<Employee>) {
    this.employees = this.employees.map((e) => (e.code === code ? { ...e, ...updated } : e));
    this.notify();
  }
  public deleteEmployee(code: string) {
    this.employees = this.employees.filter((e) => e.code !== code);
    this.notify();
  }

  public loadSampleData() {
    // Không nạp dữ liệu giả. Để danh mục theo dữ liệu thực từ backend hoặc người dùng tự thêm.
    this.notify();
  }

  public clearAllMasterData() {
    this.productCategories = [];
    this.products = [];
    this.customers = [];
    this.employees = [];
    this.notify();
  }

  public getAuditEvents(): AuditEventDTO[] {
    return [...this.auditEvents];
  }

  // SYNC WITH BACKEND
  public async syncWithBackend(): Promise<void> {
    try {
      const [backendInvoices, backendSuppliers, pos, grs, worker, settingsData, auditEvents] = await Promise.all([
        api.listInvoices().catch(() => []),
        api.listSuppliers().catch(() => []),
        api.listPurchaseOrders().catch(() => []),
        api.listGoodsReceipts().catch(() => []),
        api.getWorkerStatus().catch(() => null),
        api.getReconciliationSettings().catch(() => null),
        api.getAuditLog(100).catch(() => []),
      ]);

      if (settingsData) {
        this.settings.toleranceThresholdVnd = settingsData.currency_tolerance;
        this.settings.fuzzyMatchingThresholdPct = settingsData.item_similarity_threshold;
        this.settings.ocrConfidenceThresholdPct = Math.round(settingsData.ocr_confidence_min * 100);
      }

      this.suppliers = adaptBackendSuppliers(backendSuppliers);
      this.purchaseOrders = adaptBackendPurchaseOrders(pos);
      this.goodsReceipts = adaptBackendGoodsReceipts(grs);
      this.invoices = adaptBackendInvoices(backendInvoices, backendSuppliers);
      this.rpaLogs = adaptRpaLogs(worker);
      this.auditEvents = auditEvents;

      this.notify();
    } catch (err) {
      console.error('Lỗi đồng bộ dữ liệu từ backend:', err);
    }
  }
}

export const store = new InvoiceStore();

export const mockActions = {
  async getInvoices(): Promise<InvoiceRecord[]> {
    return store.getInvoices();
  },

  async getInvoiceByCode(invoiceCode: string): Promise<InvoiceRecord> {
    const inv = store.getInvoiceByCode(invoiceCode);
    if (!inv) throw new Error(`404: Không tìm thấy hóa đơn ${invoiceCode}`);
    return inv;
  },

  async uploadInvoices(files: { name: string; size: number; file?: File }[]): Promise<{ uploadedCount: number; errors: string[] }> {
    let uploadedCount = 0;
    const errors: string[] = [];
    for (const f of files) {
      if (f.file) {
        try {
          await api.uploadInvoice(f.file);
          uploadedCount++;
        } catch (e: any) {
          errors.push(`${f.name}: ${e?.message || 'Lỗi tải lên'}`);
        }
      }
    }
    await store.syncWithBackend();
    return { uploadedCount, errors };
  },

  async triggerRpaScan(): Promise<{ message: string; scannedCount: number; acceptedCount: number }> {
    try {
      const res = await api.scanNow();
      await store.syncWithBackend();
      return {
        message: res.message || 'Quét thư mục hoàn tất.',
        scannedCount: res.added,
        acceptedCount: res.added,
      };
    } catch (e) {
      return {
        message: e instanceof Error ? e.message : 'Lỗi quét thư mục',
        scannedCount: 0,
        acceptedCount: 0,
      };
    }
  },

  async verifyInvoice(
    invoiceCode: string,
    action: 'SAVE_RECALCULATE' | 'APPROVE' | 'REJECT',
    payload?: { note?: string }
  ): Promise<InvoiceRecord> {
    if (action === 'APPROVE') {
      return store.verifyAndApproveInvoice(invoiceCode, payload?.note || '');
    } else if (action === 'REJECT') {
      return store.rejectInvoice(invoiceCode, payload?.note || '');
    } else {
      const inv = store.getInvoiceByCode(invoiceCode);
      if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);
      store.recalculateInvoiceMatching(inv);
      store.notify();
      return inv;
    }
  },

  async updateRuleSettings(newSettings: RuleSettings): Promise<RuleSettings> {
    store.updateSettings(newSettings);
    return store.getSettings();
  },

  async syncMisaErp(_invoices: InvoiceRecord[]): Promise<{ success: boolean; syncedCount: number; message: string }> {
    return {
      success: false,
      syncedCount: 0,
      message: 'Backend chưa hỗ trợ API đồng bộ trực tiếp MISA SME Cloud. Vui lòng sử dụng tính năng Xuất file Excel / XML để nạp vào MISA.',
    };
  },

  async clearAuditLogs(_invoiceCode: string): Promise<void> {
    // Clear logs
  },
};
