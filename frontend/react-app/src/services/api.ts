import type {
  AuditLog,
  GoodsReceipt,
  InvoiceRecord,
  ProcessingStatus,
  PurchaseOrder,
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
  seller_name: string;
  buyer_tax_code: string;
  invoice_number: string;
  invoice_series: string;
  invoice_date: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  items: Array<{ name?: string; description?: string; quantity?: number | null; unit_price?: number | null; tax_rate?: number | null; amount?: number | null; unit?: string | null }>;
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
  rpa_scan_interval_minutes: number;
  auto_alert_email: boolean;
  auto_alert_telegram: boolean;
}
export interface AuditEventDTO {
  id: number;
  actor: string;
  actor_role: BackendRole | null;
  action: string;
  entity: string;
  detail: string;
  created_at: string;
}

export interface SupplierDTO { id: number; supplier_code: string | null; tax_code: string; name: string; address: string; phone: string; email: string }
export interface ProductCategoryDTO { id: number; code: string; name: string; description: string }
export interface ProductDTO { id: number; code: string; name: string; category_code: string; unit: string; cost_price: number; selling_price: number; stock_qty: number }
export interface CustomerDTO { id: number; code: string; name: string; phone: string; address: string; email: string }
export interface EmployeeDTO { id: number; code: string; full_name: string; role: string; phone: string; email: string }
export interface VoucherDTO { id: number; voucher_number: string; voucher_type: 'THU' | 'CHI'; voucher_date: string; related_party_name: string; related_invoice_id: number | null; content: string; amount: number; is_auto_generated: boolean }
export interface PurchaseOrderDTO {
  id: number; po_number: string; supplier_tax_code: string; supplier_name: string; total_amount: number; status: string;
  order_date: string; expected_delivery_date: string; created_by: string; employee_code: string; lines: Array<Record<string, unknown>>;
}
export interface GoodsReceiptDTO {
  id: number; receipt_number: string; po_number: string; supplier_name: string; lines: Array<Record<string, unknown>>;
  received_at: string; received_by: string; warehouse_location: string;
}
export interface InvoiceReviewInDTO {
  seller_tax_code: string;
  seller_name: string;
  invoice_series: string;
  buyer_tax_code: string;
  invoice_number: string;
  invoice_date: string;
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  total_amount: number | null;
  items: Array<Record<string, unknown>>;
  po_number: string;
  review_note: string;
}
export interface LedgerImportDTO { created: number; skipped: number; total_rows: number }
export interface MasterDataImportDTO { created: number; skipped: number; total_rows: number }

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
    && (value.supplier_code === null || typeof value.supplier_code === 'string')
    && typeof value.tax_code === 'string'
    && typeof value.name === 'string'
    && typeof value.address === 'string'
    && typeof value.phone === 'string'
    && typeof value.email === 'string';
}

function isProductCategory(value: unknown): value is ProductCategoryDTO {
  return isObject(value) && typeof value.id === 'number' && typeof value.code === 'string'
    && typeof value.name === 'string' && typeof value.description === 'string';
}

function isProduct(value: unknown): value is ProductDTO {
  return isObject(value) && typeof value.id === 'number' && typeof value.code === 'string'
    && typeof value.name === 'string' && typeof value.category_code === 'string'
    && typeof value.unit === 'string' && typeof value.cost_price === 'number'
    && typeof value.selling_price === 'number' && typeof value.stock_qty === 'number';
}

function isCustomer(value: unknown): value is CustomerDTO {
  return isObject(value) && typeof value.id === 'number' && typeof value.code === 'string'
    && typeof value.name === 'string' && typeof value.phone === 'string'
    && typeof value.address === 'string' && typeof value.email === 'string';
}

function isEmployee(value: unknown): value is EmployeeDTO {
  return isObject(value) && typeof value.id === 'number' && typeof value.code === 'string'
    && typeof value.full_name === 'string' && typeof value.role === 'string'
    && typeof value.phone === 'string' && typeof value.email === 'string';
}

function isVoucher(value: unknown): value is VoucherDTO {
  return isObject(value) && typeof value.id === 'number' && typeof value.voucher_number === 'string'
    && (value.voucher_type === 'THU' || value.voucher_type === 'CHI') && typeof value.voucher_date === 'string'
    && typeof value.related_party_name === 'string' && (value.related_invoice_id === null || typeof value.related_invoice_id === 'number')
    && typeof value.content === 'string' && typeof value.amount === 'number' && typeof value.is_auto_generated === 'boolean';
}

function isPurchaseOrder(value: unknown): value is PurchaseOrderDTO {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.po_number === 'string'
    && typeof value.supplier_tax_code === 'string'
    && typeof value.supplier_name === 'string'
    && typeof value.total_amount === 'number'
    && typeof value.status === 'string'
    && typeof value.order_date === 'string'
    && typeof value.expected_delivery_date === 'string'
    && typeof value.created_by === 'string'
    && typeof value.employee_code === 'string'
    && Array.isArray(value.lines);
}

function isGoodsReceipt(value: unknown): value is GoodsReceiptDTO {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.receipt_number === 'string'
    && typeof value.po_number === 'string'
    && typeof value.supplier_name === 'string'
    && typeof value.received_at === 'string'
    && typeof value.received_by === 'string'
    && typeof value.warehouse_location === 'string'
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
    if (!readStoredToken()) return null;
    try {
      const user = await request<AuthenticatedUser>('/auth/me');
      if (!isAuthenticatedUser(user)) {
        clearToken();
        return null;
      }
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        return null;
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
    const value = await request<unknown>(`/invoices/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!value || typeof value !== 'object' || !('message' in value) || !('invoice' in value)
      || typeof value.message !== 'string' || !isBackendInvoice(value.invoice)) {
      throw new ApiError('Kết quả từ chối hóa đơn không hợp lệ.');
    }
    return value as { message: string; invoice: BackendInvoiceDTO };
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

  async reconcileInvoice(id: number): Promise<BackendInvoiceDTO> {
    const value = await request<unknown>(`/invoices/${id}/reconcile`, { method: 'POST' });
    if (!isBackendInvoice(value)) throw new ApiError('Kết quả đối soát hóa đơn không hợp lệ.');
    return value;
  },

  async listSuppliers(): Promise<SupplierDTO[]> {
    return validateArray(await request<unknown>('/ledger/suppliers'), 'nhà cung cấp', isSupplier);
  },

  async createSupplier(body: { supplier_code?: string; tax_code: string; name: string; address?: string; phone?: string; email: string }): Promise<SupplierDTO> {
    const value = await request<unknown>('/ledger/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isSupplier(value)) throw new ApiError('Máy chủ trả về nhà cung cấp không hợp lệ.');
    return value;
  },

  async addSupplier(body: { tax_code: string; name: string; email: string }): Promise<SupplierDTO> {
    return this.createSupplier(body);
  },

  async updateSupplier(id: number, body: Partial<{ supplier_code: string; tax_code: string; name: string; address: string; phone: string; email: string }>): Promise<SupplierDTO> {
    const value = await request<unknown>(`/ledger/suppliers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!isSupplier(value)) throw new ApiError('Máy chủ trả về nhà cung cấp không hợp lệ.');
    return value;
  },

  async deleteSupplier(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/ledger/suppliers/${id}`, { method: 'DELETE' });
  },

  async listProductCategories(): Promise<ProductCategoryDTO[]> {
    return validateArray(await request<unknown>('/master-data/product-categories'), 'loại sản phẩm', isProductCategory);
  },

  async createProductCategory(body: Omit<ProductCategoryDTO, 'id'>): Promise<ProductCategoryDTO> {
    const value = await request<unknown>('/master-data/product-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isProductCategory(value)) throw new ApiError('Máy chủ trả về loại sản phẩm không hợp lệ.');
    return value;
  },

  async updateProductCategory(code: string, body: Partial<Omit<ProductCategoryDTO, 'id' | 'code'>>): Promise<ProductCategoryDTO> {
    const value = await request<unknown>(`/master-data/product-categories/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isProductCategory(value)) throw new ApiError('Máy chủ trả về loại sản phẩm không hợp lệ.');
    return value;
  },

  async deleteProductCategory(code: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/master-data/product-categories/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },

  async listProducts(): Promise<ProductDTO[]> {
    return validateArray(await request<unknown>('/master-data/products'), 'sản phẩm', isProduct);
  },

  async createProduct(body: Omit<ProductDTO, 'id'>): Promise<ProductDTO> {
    const value = await request<unknown>('/master-data/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isProduct(value)) throw new ApiError('Máy chủ trả về sản phẩm không hợp lệ.');
    return value;
  },

  async updateProduct(code: string, body: Partial<Omit<ProductDTO, 'id' | 'code'>>): Promise<ProductDTO> {
    const value = await request<unknown>(`/master-data/products/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isProduct(value)) throw new ApiError('Máy chủ trả về sản phẩm không hợp lệ.');
    return value;
  },

  async deleteProduct(code: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/master-data/products/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },

  async listCustomers(): Promise<CustomerDTO[]> {
    return validateArray(await request<unknown>('/master-data/customers'), 'khách hàng', isCustomer);
  },

  async createCustomer(body: Omit<CustomerDTO, 'id'>): Promise<CustomerDTO> {
    const value = await request<unknown>('/master-data/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isCustomer(value)) throw new ApiError('Máy chủ trả về khách hàng không hợp lệ.');
    return value;
  },

  async updateCustomer(code: string, body: Partial<Omit<CustomerDTO, 'id' | 'code'>>): Promise<CustomerDTO> {
    const value = await request<unknown>(`/master-data/customers/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isCustomer(value)) throw new ApiError('Máy chủ trả về khách hàng không hợp lệ.');
    return value;
  },

  async deleteCustomer(code: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/master-data/customers/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },

  async listEmployees(): Promise<EmployeeDTO[]> {
    return validateArray(await request<unknown>('/master-data/employees'), 'nhân viên', isEmployee);
  },

  async createEmployee(body: Omit<EmployeeDTO, 'id'>): Promise<EmployeeDTO> {
    const value = await request<unknown>('/master-data/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isEmployee(value)) throw new ApiError('Máy chủ trả về nhân viên không hợp lệ.');
    return value;
  },

  async updateEmployee(code: string, body: Partial<Omit<EmployeeDTO, 'id' | 'code'>>): Promise<EmployeeDTO> {
    const value = await request<unknown>(`/master-data/employees/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isEmployee(value)) throw new ApiError('Máy chủ trả về nhân viên không hợp lệ.');
    return value;
  },

  async deleteEmployee(code: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/master-data/employees/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },

  async listAccountingVouchers(): Promise<VoucherDTO[]> {
    return validateArray(await request<unknown>('/accounting/vouchers'), 'phiếu thu chi', isVoucher);
  },

  async createAccountingVoucher(body: Omit<VoucherDTO, 'id' | 'voucher_number' | 'is_auto_generated'>): Promise<VoucherDTO> {
    const value = await request<unknown>('/accounting/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isVoucher(value)) throw new ApiError('Máy chủ trả về phiếu thu chi không hợp lệ.');
    return value;
  },

  async updateAccountingVoucher(id: number, body: Partial<Omit<VoucherDTO, 'id' | 'voucher_number' | 'is_auto_generated'>>): Promise<VoucherDTO> {
    const value = await request<unknown>(`/accounting/vouchers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!isVoucher(value)) throw new ApiError('Máy chủ trả về phiếu thu chi không hợp lệ.');
    return value;
  },

  async deleteAccountingVoucher(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/accounting/vouchers/${id}`, { method: 'DELETE' });
  },

  async listPurchaseOrders(): Promise<PurchaseOrderDTO[]> {
    return validateArray(await request<unknown>('/ledger/purchase-orders'), 'đơn đặt hàng', isPurchaseOrder);
  },

  async createPurchaseOrder(body: { po_number: string; supplier_tax_code: string; total_amount: number; order_date: string; expected_delivery_date: string; employee_code: string; lines: Array<Record<string, unknown>> }): Promise<PurchaseOrderDTO> {
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

  async createGoodsReceipt(body: { receipt_number: string; po_number: string; received_by: string; warehouse_location: string; lines: Array<Record<string, unknown>> }): Promise<GoodsReceiptDTO> {
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

  async importMasterData(kind: 'product-categories' | 'products' | 'customers' | 'employees', file: File): Promise<MasterDataImportDTO> {
    const form = new FormData();
    form.append('file', file, file.name);
    const value = await request<unknown>(`/master-data/import/${kind}`, { method: 'POST', body: form });
    if (!isObject(value) || typeof value.created !== 'number' || typeof value.skipped !== 'number' || typeof value.total_rows !== 'number') {
      throw new ApiError('Máy chủ trả về kết quả import danh mục không hợp lệ.');
    }
    return value as unknown as MasterDataImportDTO;
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
      return 'NEED_CONFIRM';
    case 'reviewed':
      return 'OCR_REVIEWED';
    case 'ocr_done':
      return 'OCR_DONE';
    case 'waiting':
      return 'WAITING';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'WAITING';
  }
}


class InvoiceStore {
  private invoices: InvoiceRecord[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private purchaseOrderIdByCode = new Map<string, number>();
  private goodsReceipts: GoodsReceipt[] = [];
  private goodsReceiptIdByCode = new Map<string, number>();
  private suppliers: SupplierMaster[] = [];
  private supplierIdByCode = new Map<string, number>();
  private productCategories: ProductCategory[] = [];
  private products: Product[] = [];
  private customers: Customer[] = [];
  private employees: Employee[] = [];
  private workerStatus: WorkerStatusDTO | null = null;
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
  ): Promise<InvoiceRecord> {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);
    const item = inv.lineItems.find((line) => line.lineNo === lineNo);
    if (!item) throw new Error(`Không tìm thấy dòng hàng #${lineNo}`);
    const nextValue = field === 'itemNameInvoice' ? String(value) : Number(value);
    const lineNameUpdates = field === 'itemNameInvoice' ? { [lineNo]: String(value) } : {};
    const itemOverrides = field === 'itemNameInvoice' ? {} : { [lineNo]: { [field]: nextValue } };
    return this.saveInvoiceReviewAndReconcile(invoiceCode, {
      lineNameUpdates,
      itemOverrides,
      note: reason,
    });
  }

  public updateInvoiceHeaderField(
    invoiceCode: string,
    field: keyof InvoiceRecord['header'],
    value: any,
    reason: string
  ): Promise<InvoiceRecord> {
    return this.saveInvoiceReviewAndReconcile(invoiceCode, {
      header: { [field]: value },
      note: reason,
    });
  }

  public async saveInvoiceReviewAndReconcile(
    invoiceCode: string,
    options: {
      header?: Partial<InvoiceRecord['header']>;
      lineNameUpdates?: Record<number, string>;
      itemOverrides?: Record<number, Partial<Pick<LineItem, 'quantityInvoice' | 'unitPriceInvoice'>>>;
      note?: string;
    } = {},
  ): Promise<InvoiceRecord> {
    const inv = this.invoices.find((invoice) => invoice.code === invoiceCode || invoice.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);
    const numericId = Number(inv.id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Hóa đơn chưa có mã bản ghi từ máy chủ.');
    const header = { ...inv.header, ...options.header };
    const lines = inv.lineItems.map((line) => ({
      ...line,
      ...options.itemOverrides?.[line.lineNo],
      itemNameInvoice: options.lineNameUpdates?.[line.lineNo] ?? line.itemNameInvoice,
    }));
    await api.saveInvoiceReview(numericId, {
      seller_tax_code: header.sellerTaxCode,
      seller_name: header.sellerName,
      invoice_series: header.invoiceSeries,
      buyer_tax_code: header.buyerTaxCode,
      invoice_number: header.invoiceNumber,
      invoice_date: header.issueDate,
      subtotal_amount: header.subTotal,
      tax_amount: header.vatAmount,
      total_amount: header.grandTotal,
      items: lines.map((line) => ({
        name: line.itemNameInvoice,
        quantity: line.quantityInvoice,
        unit_price: line.unitPriceInvoice,
        tax_rate: line.vatRate,
        amount: line.amountInvoice,
        unit: line.unit,
      })),
      po_number: header.poCode,
      review_note: options.note || 'Đã kiểm tra và lưu dữ liệu hóa đơn',
    });
    try {
      await api.reconcileInvoice(numericId);
    } catch (error) {
      await this.syncWithBackend().catch(() => undefined);
      throw error;
    }
    await this.syncWithBackend();
    const saved = this.invoices.find((invoice) => invoice.code === inv.code);
    if (!saved) throw new Error('Đã lưu trên máy chủ nhưng không đọc lại được hóa đơn sau đối soát.');
    return saved;
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

    const { subTotal, vatAmount, grandTotal } = inv.header;
    if (subTotal != null && vatAmount != null && grandTotal != null) {
      const mathCheck = validateInvoiceMath(
        subTotal,
        vatAmount,
        grandTotal,
        this.settings.toleranceThresholdVnd
      );

      if (!mathCheck.isValid) {
        hasCritical = true;
        allAnomalies.push({
          id: `ANOM-MATH-FOOTER-${inv.code}`,
          type: 'MATH_ERROR',
          severity: 'CRITICAL',
          title: 'Sai lệch công thức tiền thanh toán chân trang',
          description: `Tổng cộng HĐ (${grandTotal}) lệch ${mathCheck.variance} đ so với công thức.`,
          fieldKey: 'grandTotal',
        });
      }
    }

    if (hasCritical) {
      inv.status = 'MISMATCH';
    } else if (hasWarning || (inv.header.ocrAverageConfidence != null && inv.header.ocrAverageConfidence < this.settings.ocrConfidenceThresholdPct)) {
      inv.status = 'NEED_CONFIRM';
    } else {
      inv.status = 'MATCHED';
    }

    inv.anomalies = allAnomalies;
  }

  public async verifyAndApproveInvoice(invoiceCode: string, _note: string): Promise<InvoiceRecord> {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);
    const numericId = Number(inv.id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Hóa đơn chưa có mã bản ghi từ máy chủ.');
    await api.approveInvoice(numericId);
    await this.syncWithBackend();
    const saved = this.invoices.find((invoice) => invoice.code === inv.code);
    if (!saved) throw new Error('Đã duyệt trên máy chủ nhưng không tải lại được hóa đơn.');
    return saved;
  }

  public async rejectInvoice(invoiceCode: string, reason: string): Promise<InvoiceRecord> {
    const inv = this.invoices.find((i) => i.code === invoiceCode || i.id === invoiceCode);
    if (!inv) throw new Error(`Không tìm thấy hóa đơn ${invoiceCode}`);
    const numericId = Number(inv.id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Hóa đơn chưa có mã bản ghi từ máy chủ.');
    await api.rejectInvoice(numericId, reason);
    await this.syncWithBackend();
    const saved = this.invoices.find((invoice) => invoice.code === inv.code);
    if (!saved) throw new Error('Đã từ chối trên máy chủ nhưng không tải lại được hóa đơn.');
    return saved;
  }

  // Master Data
  public getPurchaseOrders(): PurchaseOrder[] {
    return [...this.purchaseOrders];
  }

  public async addPurchaseOrder(po: PurchaseOrder): Promise<void> {
    const saved = await api.createPurchaseOrder({
      po_number: po.code,
      supplier_tax_code: po.supplierTaxCode,
      total_amount: po.totalEstimatedAmount,
      order_date: po.orderDate,
      expected_delivery_date: po.expectedDeliveryDate,
      employee_code: po.employeeCode || '',
      lines: po.items.map((item) => ({ name: item.itemName, unit: item.unit, quantity: item.quantity, unit_price: item.unitPrice, amount: item.amount })),
    });
    this.purchaseOrderIdByCode.set(po.code, saved.id);
    this.purchaseOrders.unshift(adaptBackendPurchaseOrders([saved])[0]);
    this.notify();
  }

  public async updatePurchaseOrder(code: string, updated: Partial<PurchaseOrder>): Promise<void> {
    const id = this.purchaseOrderIdByCode.get(code);
    const current = this.purchaseOrders.find((po) => po.code === code);
    if (!id || !current) throw new Error(`Không tìm thấy PO ${code} từ dữ liệu máy chủ.`);
    const saved = await api.updatePurchaseOrder(id, {
      po_number: updated.code || code,
      supplier_tax_code: updated.supplierTaxCode || current.supplierTaxCode,
      total_amount: updated.totalEstimatedAmount ?? current.totalEstimatedAmount,
      status: updated.status?.toLowerCase(),
      order_date: updated.orderDate ?? current.orderDate,
      expected_delivery_date: updated.expectedDeliveryDate ?? current.expectedDeliveryDate,
      employee_code: updated.employeeCode ?? current.employeeCode ?? '',
      lines: updated.items?.map((item) => ({ name: item.itemName, unit: item.unit, quantity: item.quantity, unit_price: item.unitPrice, amount: item.amount })),
    });
    const nextCode = updated.code || code;
    this.purchaseOrderIdByCode.delete(code);
    this.purchaseOrderIdByCode.set(nextCode, saved.id);
    const savedPo = adaptBackendPurchaseOrders([saved])[0];
    this.purchaseOrders = this.purchaseOrders.map((po) => (po.code === code ? savedPo : po));
    this.notify();
  }

  public async deletePurchaseOrder(code: string): Promise<void> {
    const id = this.purchaseOrderIdByCode.get(code);
    if (!id) throw new Error(`Không tìm thấy PO ${code} từ dữ liệu máy chủ.`);
    await api.deletePurchaseOrder(id);
    this.purchaseOrderIdByCode.delete(code);
    this.purchaseOrders = this.purchaseOrders.filter((p) => p.code !== code);
    this.notify();
  }

  public getGoodsReceipts(): GoodsReceipt[] {
    return [...this.goodsReceipts];
  }

  public async addGoodsReceipt(gr: GoodsReceipt): Promise<void> {
    const saved = await api.createGoodsReceipt({
      receipt_number: gr.code,
      po_number: gr.poCode,
      received_by: gr.receivedBy,
      warehouse_location: gr.warehouseLocation,
      lines: gr.items.map((item) => ({ name: item.itemName, unit: item.unit, quantity: item.quantityReceived, notes: item.notes || '' })),
    });
    this.goodsReceiptIdByCode.set(gr.code, saved.id);
    this.goodsReceipts.unshift(adaptBackendGoodsReceipts([saved])[0]);
    this.notify();
  }

  public async deleteGoodsReceipt(code: string): Promise<void> {
    const id = this.goodsReceiptIdByCode.get(code);
    if (!id) throw new Error(`Không tìm thấy phiếu nhập ${code} từ dữ liệu máy chủ.`);
    await api.deleteGoodsReceipt(id);
    this.goodsReceiptIdByCode.delete(code);
    this.goodsReceipts = this.goodsReceipts.filter((receipt) => receipt.code !== code);
    this.notify();
  }

  public getSuppliers(): SupplierMaster[] {
    return [...this.suppliers];
  }

  public async addSupplier(sup: SupplierMaster): Promise<void> {
    const saved = await api.createSupplier({
      supplier_code: sup.code, tax_code: sup.taxCode, name: sup.name,
      address: sup.address, phone: sup.phone || '', email: sup.email || '',
    });
    const adapted = adaptBackendSuppliers([saved])[0];
    this.supplierIdByCode.set(adapted.code, saved.id);
    this.suppliers.unshift(adapted);
    this.notify();
  }

  public async updateSupplier(code: string, updated: Partial<SupplierMaster>): Promise<void> {
    const id = this.supplierIdByCode.get(code);
    if (!id) throw new Error(`Không tìm thấy mã nhà cung cấp ${code} từ dữ liệu máy chủ.`);
    const saved = await api.updateSupplier(id, {
      supplier_code: updated.code, tax_code: updated.taxCode, name: updated.name,
      address: updated.address, phone: updated.phone, email: updated.email,
    });
    const adapted = adaptBackendSuppliers([saved])[0];
    this.supplierIdByCode.delete(code);
    this.supplierIdByCode.set(adapted.code, saved.id);
    this.suppliers = this.suppliers.map((s) => (s.code === code ? adapted : s));
    this.notify();
  }

  public async deleteSupplier(code: string): Promise<void> {
    const id = this.supplierIdByCode.get(code);
    if (!id) throw new Error(`Không tìm thấy mã nhà cung cấp ${code} từ dữ liệu máy chủ.`);
    await api.deleteSupplier(id);
    this.supplierIdByCode.delete(code);
    this.suppliers = this.suppliers.filter((s) => s.code !== code);
    this.notify();
  }

  public getWorkerStatus(): WorkerStatusDTO | null {
    return this.workerStatus ? { ...this.workerStatus } : null;
  }

  // Settings
  public getSettings(): RuleSettings {
    return { ...this.settings };
  }

  public async updateSettings(newSettings: Partial<RuleSettings>): Promise<RuleSettings> {
    const candidate = { ...this.settings, ...newSettings };
    const saved = await api.updateReconciliationSettings({
      currency_tolerance: candidate.toleranceThresholdVnd,
      item_similarity_threshold: candidate.fuzzyMatchingThresholdPct,
      ocr_confidence_min: candidate.ocrConfidenceThresholdPct / 100,
      rpa_scan_interval_minutes: candidate.rpaScanIntervalMinutes,
      auto_alert_email: candidate.autoAlertEmail,
      auto_alert_telegram: candidate.autoAlertTelegram,
    });
    this.settings = {
      ...candidate,
      toleranceThresholdVnd: saved.currency_tolerance,
      fuzzyMatchingThresholdPct: saved.item_similarity_threshold,
      ocrConfidenceThresholdPct: Math.round(saved.ocr_confidence_min * 100),
      rpaScanIntervalMinutes: saved.rpa_scan_interval_minutes,
      autoAlertEmail: saved.auto_alert_email,
      autoAlertTelegram: saved.auto_alert_telegram,
    };
    this.notify();
    return this.getSettings();
  }

  // Master Data: Categories
  public getProductCategories(): ProductCategory[] {
    return [...this.productCategories];
  }
  public async addProductCategory(cat: ProductCategory): Promise<void> {
    const saved = await api.createProductCategory({ code: cat.code, name: cat.name, description: cat.description });
    this.productCategories.unshift({ code: saved.code, name: saved.name, description: saved.description });
    this.notify();
  }
  public async updateProductCategory(code: string, updated: Partial<ProductCategory>): Promise<void> {
    const saved = await api.updateProductCategory(code, { name: updated.name, description: updated.description });
    this.productCategories = this.productCategories.map((c) => (c.code === code ? { code: saved.code, name: saved.name, description: saved.description } : c));
    this.notify();
  }
  public async deleteProductCategory(code: string): Promise<void> {
    await api.deleteProductCategory(code);
    this.productCategories = this.productCategories.filter((c) => c.code !== code);
    this.notify();
  }

  // Master Data: Products
  public getProducts(): Product[] {
    return [...this.products];
  }
  public async addProduct(prod: Product): Promise<void> {
    const saved = await api.createProduct({ code: prod.code, name: prod.name, category_code: prod.categoryCode, unit: prod.unit, cost_price: prod.costPrice, selling_price: prod.sellingPrice, stock_qty: prod.stockQty });
    this.products.unshift({ code: saved.code, name: saved.name, categoryCode: saved.category_code, unit: saved.unit, costPrice: saved.cost_price, sellingPrice: saved.selling_price, stockQty: saved.stock_qty });
    this.notify();
  }
  public async updateProduct(code: string, updated: Partial<Product>): Promise<void> {
    const saved = await api.updateProduct(code, {
      name: updated.name, category_code: updated.categoryCode, unit: updated.unit,
      cost_price: updated.costPrice, selling_price: updated.sellingPrice, stock_qty: updated.stockQty,
    });
    this.products = this.products.map((p) => (p.code === code ? { code: saved.code, name: saved.name, categoryCode: saved.category_code, unit: saved.unit, costPrice: saved.cost_price, sellingPrice: saved.selling_price, stockQty: saved.stock_qty } : p));
    this.notify();
  }
  public async deleteProduct(code: string): Promise<void> {
    await api.deleteProduct(code);
    this.products = this.products.filter((p) => p.code !== code);
    this.notify();
  }

  // Master Data: Customers
  public getCustomers(): Customer[] {
    return [...this.customers];
  }
  public async addCustomer(cust: Customer): Promise<void> {
    const saved = await api.createCustomer({ code: cust.code, name: cust.name, phone: cust.phone, address: cust.address, email: cust.email });
    this.customers.unshift({ code: saved.code, name: saved.name, phone: saved.phone, address: saved.address, email: saved.email });
    this.notify();
  }
  public async updateCustomer(code: string, updated: Partial<Customer>): Promise<void> {
    const saved = await api.updateCustomer(code, { name: updated.name, phone: updated.phone, address: updated.address, email: updated.email });
    this.customers = this.customers.map((c) => (c.code === code ? { code: saved.code, name: saved.name, phone: saved.phone, address: saved.address, email: saved.email } : c));
    this.notify();
  }
  public async deleteCustomer(code: string): Promise<void> {
    await api.deleteCustomer(code);
    this.customers = this.customers.filter((c) => c.code !== code);
    this.notify();
  }

  // Master Data: Employees
  public getEmployees(): Employee[] {
    return [...this.employees];
  }
  public async addEmployee(emp: Employee): Promise<void> {
    const saved = await api.createEmployee({ code: emp.code, full_name: emp.fullName, role: emp.role, phone: emp.phone, email: emp.email });
    this.employees.unshift({ code: saved.code, fullName: saved.full_name, role: saved.role, phone: saved.phone, email: saved.email });
    this.notify();
  }
  public async updateEmployee(code: string, updated: Partial<Employee>): Promise<void> {
    const saved = await api.updateEmployee(code, { full_name: updated.fullName, role: updated.role, phone: updated.phone, email: updated.email });
    this.employees = this.employees.map((e) => (e.code === code ? { code: saved.code, fullName: saved.full_name, role: saved.role, phone: saved.phone, email: saved.email } : e));
    this.notify();
  }
  public async deleteEmployee(code: string): Promise<void> {
    await api.deleteEmployee(code);
    this.employees = this.employees.filter((e) => e.code !== code);
    this.notify();
  }

  public getAuditEvents(): AuditEventDTO[] {
    return [...this.auditEvents];
  }

  // SYNC WITH BACKEND
  public async syncWithBackend(): Promise<void> {
    try {
      const [backendInvoices, backendSuppliers, pos, grs, categories, products, customers, employees, worker, settingsData, auditEvents] = await Promise.all([
        api.listInvoices(),
        api.listSuppliers(),
        api.listPurchaseOrders(),
        api.listGoodsReceipts(),
        api.listProductCategories(),
        api.listProducts(),
        api.listCustomers(),
        api.listEmployees(),
        api.getWorkerStatus(),
        api.getReconciliationSettings(),
        api.getAuditLog(100),
      ]);

      if (settingsData) {
        this.settings.toleranceThresholdVnd = settingsData.currency_tolerance;
        this.settings.fuzzyMatchingThresholdPct = settingsData.item_similarity_threshold;
        this.settings.ocrConfidenceThresholdPct = Math.round(settingsData.ocr_confidence_min * 100);
        this.settings.rpaScanIntervalMinutes = settingsData.rpa_scan_interval_minutes;
        this.settings.autoAlertEmail = settingsData.auto_alert_email;
        this.settings.autoAlertTelegram = settingsData.auto_alert_telegram;
      }

      this.suppliers = adaptBackendSuppliers(backendSuppliers);
      this.supplierIdByCode = new Map(backendSuppliers.map((supplier, index) => [
        supplier.supplier_code || `NCC-${String(index + 1).padStart(2, '0')}`,
        supplier.id,
      ]));
      this.purchaseOrders = adaptBackendPurchaseOrders(pos, backendSuppliers);
      this.goodsReceipts = adaptBackendGoodsReceipts(grs);
      this.purchaseOrderIdByCode = new Map(pos.map((po) => [po.po_number, po.id]));
      this.goodsReceiptIdByCode = new Map(grs.map((receipt) => [receipt.receipt_number, receipt.id]));
      this.invoices = adaptBackendInvoices(backendInvoices, backendSuppliers, pos, grs);
      this.invoices.forEach((invoice) => {
        invoice.auditLogs = auditEvents
          .filter((event) => event.entity === `invoice:${invoice.id}`)
          .map((event) => ({
            id: String(event.id),
            invoiceCode: invoice.code,
            timestamp: event.created_at.slice(0, 19).replace('T', ' '),
            user: event.actor,
            userRole: event.actor_role === 'admin'
              ? 'ADMIN'
              : event.actor_role === 'chief_accountant'
                ? 'CHIEF_ACCOUNTANT'
                : event.actor_role === 'accountant' ? 'ACCOUNTANT' : 'UNKNOWN',
            field: event.action,
            oldValue: '',
            newValue: event.detail,
            reason: event.detail,
          }));
      });
      this.productCategories = categories.map((row) => ({ code: row.code, name: row.name, description: row.description }));
      this.products = products.map((row) => ({ code: row.code, name: row.name, categoryCode: row.category_code, unit: row.unit, costPrice: row.cost_price, sellingPrice: row.selling_price, stockQty: row.stock_qty }));
      this.customers = customers.map((row) => ({ code: row.code, name: row.name, phone: row.phone, address: row.address, email: row.email }));
      this.employees = employees.map((row) => ({ code: row.code, fullName: row.full_name, role: row.role, phone: row.phone, email: row.email }));
      this.workerStatus = worker;
      this.auditEvents = auditEvents;

      this.notify();
    } catch (err) {
      console.error('Lỗi đồng bộ dữ liệu từ backend:', err);
      throw err;
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

  async uploadInvoices(files: { name: string; size: number; file?: File }[]): Promise<{
    uploadedCount: number;
    ocrNeedsReviewCount: number;
    errors: string[];
  }> {
    let uploadedCount = 0;
    let ocrNeedsReviewCount = 0;
    const errors: string[] = [];
    for (const f of files) {
      if (f.file) {
        try {
          const uploaded = await api.uploadInvoice(f.file);
          uploadedCount++;
          if (uploaded.status !== 'ocr_done') ocrNeedsReviewCount++;
        } catch (e: any) {
          errors.push(`${f.name}: ${e?.message || 'Lỗi tải lên'}`);
        }
      }
    }
    await store.syncWithBackend();
    return { uploadedCount, ocrNeedsReviewCount, errors };
  },

  async triggerRpaScan(): Promise<{
    status: 'success' | 'warning' | 'error';
    message: string;
    scannedCount: number;
    acceptedCount: number;
  }> {
    try {
      const res = await api.scanNow();
      await store.syncWithBackend();
      return {
        status: res.active ? 'success' : 'warning',
        message: res.active && res.added > 0
          ? `${res.message} Hóa đơn mới đang chờ chạy OCR trong hàng đợi.`
          : res.message || 'Quét thư mục hoàn tất.',
        scannedCount: res.added,
        acceptedCount: res.added,
      };
    } catch (e) {
      return {
        status: 'error',
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
      return store.saveInvoiceReviewAndReconcile(invoiceCode, { note: payload?.note });
    }
  },

  async updateRuleSettings(newSettings: RuleSettings): Promise<RuleSettings> {
    return store.updateSettings(newSettings);
  },

};
