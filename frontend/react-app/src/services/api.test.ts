import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from './api.ts';

const tokenStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => tokenStorage.get(key) ?? null,
    setItem: (key: string, value: string) => tokenStorage.set(key, String(value)),
    removeItem: (key: string) => tokenStorage.delete(key),
  },
});

test('login follows FastAPI OAuth form contract and stores its bearer token in the tab session', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      access_token: 'server-issued-token',
      token_type: 'bearer',
      user: { email: 'accountant@example.test', role: 'accountant' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const user = await api.login('accountant@example.test', 'secret');
  assert.equal(requestUrl, '/api/auth/login');
  assert.equal(requestInit?.method, 'POST');
  assert.equal(new Headers(requestInit?.headers).get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(String(requestInit?.body), 'username=accountant%40example.test&password=secret');
  assert.deepEqual(user, { email: 'accountant@example.test', role: 'accountant' });
  assert.equal(tokenStorage.get('autoinvoice_access_token'), 'server-issued-token');

  globalThis.fetch = async (_input, init) => {
    assert.equal(String(_input), '/api/auth/me');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer server-issued-token');
    return new Response(JSON.stringify({ email: 'accountant@example.test', role: 'accountant' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  assert.deepEqual(await api.getCurrentUser(), user);
});

test('FastAPI validation details are surfaced as an ApiError with the HTTP status', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    detail: [{ loc: ['body', 'username'], msg: 'field required', type: 'missing' }],
  }), { status: 422, headers: { 'content-type': 'application/json' } });

  await assert.rejects(api.login('', ''), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 422);
    assert.match(error.message, /username: field required/);
    return true;
  });
});

test('successful non-JSON responses are rejected instead of treated as API data', async () => {
  globalThis.fetch = async () => new Response('<html>proxy error</html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

  await assert.rejects(api.getCurrentUser(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.match(error.message, /không đúng định dạng JSON/i);
    return true;
  });
});

test('an expired session clears the stored token and reports the backend detail', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Phiên đăng nhập không hợp lệ' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(api.getCurrentUser(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Phiên đăng nhập không hợp lệ');
    return true;
  });
  assert.equal(tokenStorage.has('autoinvoice_access_token'), false);
});

test('logout calls the backend and clears the local token even when the request fails', async () => {
  let logoutAuthorization = '';
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'server-issued-token',
    token_type: 'bearer',
    user: { email: 'admin@example.test', role: 'admin' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('admin@example.test', 'secret');
  globalThis.fetch = async (_input, init) => {
    logoutAuthorization = new Headers(init?.headers).get('authorization') || '';
    return new Response(JSON.stringify({ detail: 'service unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  };

  await assert.rejects(api.logout(), ApiError);
  assert.equal(logoutAuthorization, 'Bearer server-issued-token');
  globalThis.fetch = async () => { throw new Error('A request without a token must not be sent.'); };
  await assert.rejects(api.getCurrentUser(), /Phiên đăng nhập không tồn tại/);
  assert.equal(tokenStorage.has('autoinvoice_access_token'), false);
});

test('read APIs send the bearer token and validate dashboard, worker and invoice contracts', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'read-api-token', token_type: 'bearer',
    user: { email: 'accountant@example.test', role: 'accountant' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('accountant@example.test', 'secret');

  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(`${String(input)}|${new Headers(init?.headers).get('authorization')}`);
    if (String(input) === '/api/reports/dashboard') return new Response(JSON.stringify({
      total: 1, by_status: { needs_review: 1 }, needs_review: 1, approved: 0,
      weekly: [], error_causes: [], top_suppliers: [], supplier_count: 0, recent: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(input) === '/api/reports/worker') return new Response(JSON.stringify({
      active: false, mode: 'not_configured', message: 'Chưa cấu hình thư mục inbox',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify([{
      id: 9, original_name: 'invoice.pdf', status: 'needs_review', items: [], warnings: [],
      ocr_blocks: [], datasets: [],
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  assert.equal((await api.getDashboard()).total, 1);
  assert.equal((await api.getWorkerStatus()).mode, 'not_configured');
  assert.equal((await api.listInvoices('needs_review'))[0].id, 9);
  assert.ok(calls.every((call) => call.endsWith('|Bearer read-api-token')));
  assert.equal(calls[2].split('|')[0], '/api/invoices?status_filter=needs_review');
});

test('malformed backend dashboard and invoice payloads are rejected', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'schema-token', token_type: 'bearer',
    user: { email: 'accountant@example.test', role: 'accountant' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('accountant@example.test', 'secret');
  globalThis.fetch = async (input) => new Response(JSON.stringify(
    String(input).includes('/reports/dashboard') ? { total: 'many' } : [{ id: 'bad' }],
  ), { status: 200, headers: { 'content-type': 'application/json' } });

  await assert.rejects(api.getDashboard(), /dashboard.*schema/i);
  await assert.rejects(api.listInvoices(), /schema/i);
});

test('invoice upload posts the original file bytes as multipart and returns only the backend invoice DTO', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'upload-token', token_type: 'bearer',
    user: { email: 'accountant@example.test', role: 'accountant' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('accountant@example.test', 'secret');
  let uploadUrl = '';
  let submittedBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    uploadUrl = String(input);
    submittedBody = init?.body;
    return new Response(JSON.stringify({
      id: 12, original_name: 'invoice.pdf', status: 'needs_review', items: [], warnings: [],
      ocr_blocks: [], datasets: [],
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const file = new File(['pdf bytes'], 'invoice.pdf', { type: 'application/pdf' });
  const result = await api.uploadInvoice(file);
  assert.equal(uploadUrl, '/api/invoices/upload');
  assert.equal(result.id, 12);
  assert.ok(submittedBody instanceof FormData);
  const submittedFile = (submittedBody as FormData).get('file');
  assert.ok(submittedFile instanceof File);
  assert.equal(submittedFile.name, file.name);
  assert.equal(submittedFile.type, file.type);
  assert.equal(await submittedFile.text(), 'pdf bytes');
});

test('invoice review and reconciliation operations use the backend workflow and preserve server status', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'workflow-token', token_type: 'bearer',
    user: { email: 'chief@example.test', role: 'chief_accountant' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('chief@example.test', 'secret');
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET');
    calls.push({ url, method, body: init?.body });
    if (url.endsWith('/review')) return new Response(JSON.stringify({
      id: 7, original_name: 'invoice.pdf', status: 'reviewed', items: [], warnings: [], ocr_blocks: [], datasets: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/reconcile')) return new Response(JSON.stringify({
      id: 7, original_name: 'invoice.pdf', status: 'matched', items: [], warnings: [], ocr_blocks: [], datasets: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/approve')) return new Response(JSON.stringify({
      id: 7, original_name: 'invoice.pdf', status: 'approved', items: [], warnings: [], ocr_blocks: [], datasets: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ message: 'Đã xóa hóa đơn và file' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const review = await api.saveInvoiceReview(7, {
    seller_tax_code: '123', buyer_tax_code: '456', invoice_number: 'A-01', invoice_date: '2026-01-02',
    total_amount: 100, items: [{ name: 'Hàng mẫu' }], po_number: 'PO-1', review_note: 'Kiểm tra',
  });
  const reconciliation = await api.reconcileInvoice(7);
  const approval = await api.approveInvoice(7);
  assert.equal(review.status, 'reviewed');
  assert.equal(reconciliation.status, 'matched');
  assert.equal(approval.status, 'approved');
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['/api/invoices/7/review', 'PATCH'], ['/api/invoices/7/reconcile', 'POST'], ['/api/invoices/7/approve', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(String(calls[0].body)), {
    seller_tax_code: '123', buyer_tax_code: '456', invoice_number: 'A-01', invoice_date: '2026-01-02',
    total_amount: 100, items: [{ name: 'Hàng mẫu' }], po_number: 'PO-1', review_note: 'Kiểm tra',
  });
});

test('user administration and password changes follow existing FastAPI auth contracts', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'admin-api-token', token_type: 'bearer',
    user: { email: 'admin@example.test', role: 'admin' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('admin@example.test', 'secret');
  const calls: Array<{ url: string; method: string; auth: string | null; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET');
    calls.push({ url, method, auth: new Headers(init?.headers).get('authorization'), body: init?.body });
    if (url.endsWith('/change-password')) return new Response(JSON.stringify({ message: 'updated' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (method === 'GET') return new Response(JSON.stringify([{ id: 5, email: 'user@example.test', role: 'accountant', active: true }]), { status: 200, headers: { 'content-type': 'application/json' } });
    if (method === 'DELETE') return new Response(JSON.stringify({ message: 'deleted' }), { status: 200, headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 5, email: body.email ?? 'user@example.test', role: body.role ?? 'accountant', active: body.active ?? true }), { status: 201, headers: { 'content-type': 'application/json' } });
  };

  assert.equal((await api.listUsers())[0].id, 5);
  assert.equal((await api.createUser({ email: 'new@example.test', password: 'long-password', role: 'chief_accountant' })).role, 'chief_accountant');
  assert.equal((await api.updateUser(5, { active: false })).active, false);
  assert.equal((await api.deleteUser(5)).message, 'deleted');
  assert.equal((await api.changePassword('old-pass', 'new-password')).message, 'updated');
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['/api/auth/users', 'GET'], ['/api/auth/users', 'POST'], ['/api/auth/users/5', 'PATCH'],
    ['/api/auth/users/5', 'DELETE'], ['/api/auth/change-password', 'POST'],
  ]);
  assert.ok(calls.every((call) => call.auth === 'Bearer admin-api-token'));
  assert.deepEqual(JSON.parse(String(calls[1].body)), { email: 'new@example.test', password: 'long-password', role: 'chief_accountant' });
  assert.deepEqual(JSON.parse(String(calls[4].body)), { old_password: 'old-pass', new_password: 'new-password' });
});

test('ledger import uploads the provided file and validates the backend result', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'ledger-import-token', token_type: 'bearer',
    user: { email: 'admin@example.test', role: 'admin' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('admin@example.test', 'secret');
  let submittedUrl = '';
  let submittedBody: BodyInit | null | undefined;
  globalThis.fetch = async (input, init) => {
    submittedUrl = String(input); submittedBody = init?.body;
    return new Response(JSON.stringify({ created: 3, skipped: 1, total_rows: 4 }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await api.importLedger('purchase-orders', new File(['csv'], 'purchase-orders.csv', { type: 'text/csv' }));
  assert.equal(submittedUrl, '/api/ledger/import/purchase-orders');
  assert.deepEqual(result, { created: 3, skipped: 1, total_rows: 4 });
  assert.ok(submittedBody instanceof FormData);
  assert.equal(((submittedBody as FormData).get('file') as File).name, 'purchase-orders.csv');
});

test('supplier, purchase-order and goods-receipt CRUD clients use the real ledger routes', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'ledger-crud-token', token_type: 'bearer',
    user: { email: 'accountant@example.test', role: 'accountant' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('accountant@example.test', 'secret');
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET');
    calls.push({ url, method, body: init?.body });
    if (method === 'DELETE') return new Response(JSON.stringify({ message: 'deleted' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (method === 'GET') return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.includes('suppliers')) return new Response(JSON.stringify({ id: 2, tax_code: '123', name: 'Supplier', email: '' }), { status: 201, headers: { 'content-type': 'application/json' } });
    if (url.includes('purchase-orders')) return new Response(JSON.stringify({ id: 3, po_number: 'PO-3', supplier_tax_code: '123', total_amount: 50, status: 'open', lines: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: 4, receipt_number: 'GR-4', po_number: 'PO-3', received_at: '2026-10-26T00:00:00', lines: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  assert.equal((await api.listSuppliers()).length, 0);
  assert.equal((await api.addSupplier({ tax_code: '123', name: 'Supplier', email: '' })).id, 2);
  assert.equal((await api.listPurchaseOrders()).length, 0);
  assert.equal((await api.createPurchaseOrder({ po_number: 'PO-3', supplier_tax_code: '123', total_amount: 50, lines: [] })).id, 3);
  assert.equal((await api.updatePurchaseOrder(3, { total_amount: 50 })).po_number, 'PO-3');
  await api.deletePurchaseOrder(3);
  assert.equal((await api.listGoodsReceipts()).length, 0);
  assert.equal((await api.createGoodsReceipt({ receipt_number: 'GR-4', po_number: 'PO-3', lines: [] })).id, 4);
  assert.equal((await api.updateGoodsReceipt(4, { receipt_number: 'GR-4' })).id, 4);
  await api.deleteGoodsReceipt(4);
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['/api/ledger/suppliers', 'GET'], ['/api/ledger/suppliers', 'POST'],
    ['/api/ledger/purchase-orders', 'GET'], ['/api/ledger/purchase-orders', 'POST'],
    ['/api/ledger/purchase-orders/3', 'PATCH'], ['/api/ledger/purchase-orders/3', 'DELETE'],
    ['/api/ledger/goods-receipts', 'GET'], ['/api/ledger/goods-receipts', 'POST'],
    ['/api/ledger/goods-receipts/4', 'PATCH'], ['/api/ledger/goods-receipts/4', 'DELETE'],
  ]);
});

test('binary downloads reject successful HTML proxy responses', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'report-download-token', token_type: 'bearer',
    user: { email: 'accountant@example.test', role: 'accountant' },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await api.login('accountant@example.test', 'secret');
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), '/api/reports/export.csv');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer report-download-token');
    return new Response('<html>proxy failure</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  await assert.rejects(api.downloadReport('csv'), /không phải file nhị phân/i);
});

test('clearAllData posts to /ledger/clear-all and returns confirmation message', async () => {
  let calledUrl = '';
  let calledMethod = '';
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    calledMethod = init?.method ?? 'GET';
    return new Response(JSON.stringify({ message: 'Đã xóa toàn bộ dữ liệu đơn hàng và hóa đơn.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const result = await api.clearAllData();
  assert.equal(calledUrl, '/api/ledger/clear-all');
  assert.equal(calledMethod, 'POST');
  assert.equal(result.message, 'Đã xóa toàn bộ dữ liệu đơn hàng và hóa đơn.');
});

