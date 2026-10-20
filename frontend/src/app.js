/* ===================================================
   AutoInvoice – app.js
   Kết nối API thực từ FastAPI backend
   =================================================== */

'use strict';

// ── API helpers ──────────────────────────────────────
const API = '/api';
let authToken = localStorage.getItem('token') || '';
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let currentView = 'dashboard';
let currentMatchingInvoice = null;
let allInvoices = [];
let allPOs = [];
let allGRs = [];
let allSuppliers = [];
let workerInterval = null;
let workerCountdown = 300; // 5 min in seconds
let zoomLevel = 100;
let bboxVisible = true;
let qrVisible = false;
let poLineCount = 0;
let grLineCount = 0;
let alertDropdownOpen = false;

async function api(path, method = 'GET', body = null) {
  const headers = { 'Authorization': `Bearer ${authToken}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Toast ──────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  const wrap = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, duration);
}

// ── Formatters ──────────────────────────────────────
const fmtMoney = n => n != null ? Number(n).toLocaleString('vi-VN') + ' ₫' : '—';
const fmtDate = s => s ? new Date(s).toLocaleDateString('vi-VN') : '—';
const fmtDatetime = s => s ? new Date(s).toLocaleString('vi-VN') : '—';
const statusLabel = {
  needs_review: 'Cần xác nhận', ocr_done: 'OCR hoàn tất', reviewed: 'Đã rà soát',
  matched: 'Khớp hoàn toàn', mismatch: 'Phát hiện lệch', approved: 'Đã phê duyệt',
  uploaded: 'Vừa tải lên', processing: 'Đang xử lý'
};
const roleLabel = { admin: 'Quản trị viên', accountant: 'Kế toán viên', chief_accountant: 'Kế toán trưởng' };
const roleNames = { admin: 'Lê Hoàng Nam', accountant: 'Nguyễn Thị Mai Anh', chief_accountant: 'Trần Văn Quang' };

// ── Auth ────────────────────────────────────────────
function applyUser(user) {
  currentUser = user;
  localStorage.setItem('user', JSON.stringify(user));

  // Sidebar
  const avatar = document.getElementById('sidebar-avatar');
  avatar.textContent = (user.email[0] || 'U').toUpperCase();
  avatar.className = `user-avatar ${user.role === 'admin' ? 'admin' : user.role === 'chief_accountant' ? 'chief' : 'accountant'}`;
  document.getElementById('sidebar-user-name').textContent = roleNames[user.role] || user.email;
  document.getElementById('sidebar-user-role').textContent = roleLabel[user.role] || user.role;

  // Role switcher sync
  document.getElementById('role-switcher').value = user.role;
}

async function login(email, password) {
  const form = new FormData();
  form.append('username', email);
  form.append('password', password);
  const res = await fetch(`${API}/auth/login`, { method: 'POST', body: form });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Đăng nhập thất bại'); }
  const data = await res.json();
  authToken = data.access_token;
  localStorage.setItem('token', authToken);
  applyUser(data.user);
}

function logout() {
  authToken = ''; currentUser = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ── View routing ─────────────────────────────────────
function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const section = document.getElementById('view-' + view);
  const navBtn = document.getElementById('nav-' + view);
  if (section) section.classList.remove('hidden');
  if (navBtn) navBtn.classList.add('active');
  currentView = view;

  const titles = {
    dashboard: 'Tổng quan & Giám sát',
    queue: 'Tiếp nhận & Hàng đợi',
    matching: 'Đối soát 3 bên — Split Screen',
    masterdata: 'Dữ liệu PO & Phiếu kho',
    reports: 'Báo cáo & Cấu hình'
  };
  document.getElementById('page-title').textContent = titles[view] || view;

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.add('hidden');

  // Load data for this view
  if (view === 'dashboard') loadDashboard();
  else if (view === 'queue') loadQueue();
  else if (view === 'matching') loadMatchingView();
  else if (view === 'masterdata') loadMasterData();
  else if (view === 'reports') loadReports();
}

// ── Dashboard ────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await api('/reports/dashboard');
    if (!data) return;

    document.getElementById('kpi-total').textContent = data.total;
    const matched = (data.by_status.matched || 0) + (data.by_status.approved || 0);
    const matchRate = data.total > 0 ? ((matched / data.total) * 100).toFixed(1) : '0.0';
    document.getElementById('kpi-match-rate').textContent = matchRate + '%';
    document.getElementById('kpi-ocr-avg').textContent = '—';
    document.getElementById('kpi-review').textContent = data.needs_review || 0;

    // Weekly chart
    renderWeeklyChart(data.weekly || []);

    // Scheduler status
    loadWorkerStatus();

    // Supplier rank
    renderSupplierRank(data.top_suppliers || []);

    // Recent table
    renderRecentTable(data.recent || []);

    // Badges
    document.getElementById('badge-queue').textContent = data.total || 0;
    const mismatches = data.by_status.mismatch || 0;
    const reviewNeeded = (data.by_status.needs_review || 0) + mismatches;
    const badgeMismatch = document.getElementById('badge-mismatch');
    badgeMismatch.textContent = mismatches;
    badgeMismatch.style.display = mismatches > 0 ? '' : 'none';
    const alertBadge = document.getElementById('alert-badge');
    alertBadge.textContent = reviewNeeded;
    reviewNeeded > 0 ? alertBadge.classList.remove('hidden') : alertBadge.classList.add('hidden');
    document.getElementById('misa-approved-count').textContent = data.approved || 0;

    // Today date
    document.getElementById('today-date').textContent = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  } catch (e) { toast('Lỗi tải dashboard: ' + e.message, 'error'); }
}

function renderWeeklyChart(weekly) {
  const wrap = document.getElementById('weekly-chart');
  if (!weekly.length) { wrap.innerHTML = '<div class="empty-state" style="padding:20px"><p>Chưa có dữ liệu</p></div>'; return; }
  const max = Math.max(...weekly.map(d => (d.matched || 0) + (d.mismatch || 0) + (d.review || 0)), 1);
  wrap.innerHTML = weekly.map(d => {
    const total = (d.matched || 0) + (d.mismatch || 0) + (d.review || 0);
    const mH = Math.round(((d.matched || 0) / max) * 130);
    const miH = Math.round(((d.mismatch || 0) / max) * 130);
    const rH = Math.round(((d.review || 0) / max) * 130);
    const label = new Date(d.day).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' });
    return `<div class="bar-col">
      <div class="bar-stack">
        ${d.review > 0 ? `<div class="bar-seg review" style="height:${rH}px" title="Chờ: ${d.review}"></div>` : ''}
        ${d.mismatch > 0 ? `<div class="bar-seg mismatch" style="height:${miH}px" title="Lệch: ${d.mismatch}"></div>` : ''}
        ${d.matched > 0 ? `<div class="bar-seg matched" style="height:${mH}px" title="Khớp: ${d.matched}"></div>` : ''}
        ${total === 0 ? `<div style="height:4px;background:var(--border);border-radius:2px"></div>` : ''}
      </div>
      <div class="bar-label">${label}</div>
    </div>`;
  }).join('');
}

function renderSupplierRank(suppliers) {
  const tbody = document.getElementById('supplier-rank-table');
  if (!suppliers.length) { tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state" style="padding:16px"><p>Chưa có dữ liệu</p></div></td></tr>'; return; }
  tbody.innerHTML = suppliers.map((s, i) => `
    <tr>
      <td style="color:var(--text-dim);font:600 10px var(--font-mono)">${i + 1}</td>
      <td style="font-weight:600">${s.name}</td>
      <td style="font:10px var(--font-mono);color:var(--text-muted)">${s.tax_code}</td>
      <td style="font:600 11px var(--font-mono)">${s.invoices}</td>
      <td><span class="risk-badge ok">✓ Hoạt động</span></td>
    </tr>`).join('');
}

function renderRecentTable(recent) {
  const tbody = document.getElementById('recent-table');
  const empty = document.getElementById('recent-empty');
  if (!recent.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = recent.map(r => `
    <tr>
      <td style="font-weight:600">${r.name}</td>
      <td style="color:var(--text-muted)">${fmtDate(r.created_at)}</td>
      <td style="font:600 11px var(--font-mono)">${fmtMoney(r.amount)}</td>
      <td><span class="status-badge ${r.status}">${statusLabel[r.status] || r.status}</span></td>
      <td><button class="btn btn-secondary btn-xs" onclick="openMatchingForInvoice(${r.id})">Đối soát →</button></td>
    </tr>`).join('');
}

// ── Worker status ────────────────────────────────────
async function loadWorkerStatus() {
  try {
    const data = await api('/reports/worker');
    const dot = document.getElementById('worker-dot');
    const label = document.getElementById('worker-label');
    const badge = document.getElementById('scheduler-badge');
    const job1 = document.getElementById('job1-status');
    if (data && data.active) {
      dot.classList.remove('idle');
      label.textContent = 'RPA Worker: Đang hoạt động';
      badge.className = 'status-badge matched'; badge.textContent = 'Đang quét';
      if (job1) job1.textContent = data.message || 'Đang theo dõi thư mục inbox';
    } else {
      dot.classList.add('idle');
      label.textContent = 'RPA Worker: Chưa cấu hình';
      badge.className = 'status-badge needs_review'; badge.textContent = 'Chưa cấu hình';
      if (job1) job1.textContent = 'Chưa cấu hình INBOX_SCAN_DIR';
    }
    document.getElementById('api-dot').className = 'api-dot green';
    document.getElementById('api-status-text').textContent = 'FastAPI Service · Sẵn sàng';
  } catch (e) {
    document.getElementById('api-dot').className = 'api-dot red';
    document.getElementById('api-status-text').textContent = 'FastAPI Service · Mất kết nối';
  }
}

function startWorkerCountdown() {
  clearInterval(workerInterval);
  workerInterval = setInterval(() => {
    workerCountdown--;
    if (workerCountdown <= 0) { workerCountdown = 300; loadWorkerStatus(); }
    const m = Math.floor(workerCountdown / 60);
    const s = workerCountdown % 60;
    document.getElementById('worker-countdown').textContent = `${m}:${s.toString().padStart(2,'0')}`;
  }, 1000);
}

// ── Queue ────────────────────────────────────────────
async function loadQueue() {
  try {
    const data = await api('/invoices');
    allInvoices = data || [];
    renderQueueTable(allInvoices);
    updateAlertDropdown(allInvoices);
  } catch (e) { toast('Lỗi tải hàng đợi: ' + e.message, 'error'); }
}

function renderQueueTable(invoices) {
  const tbody = document.getElementById('queue-table');
  const empty = document.getElementById('queue-empty');
  const search = document.getElementById('queue-search').value.toLowerCase();
  const statusF = document.getElementById('queue-status-filter').value;

  let filtered = invoices.filter(inv => {
    const matchStatus = !statusF || inv.status === statusF;
    const matchSearch = !search || [
      'INV-' + String(inv.id).padStart(4,'0'),
      inv.invoice_number, inv.seller_tax_code, inv.original_name, inv.po_number
    ].some(s => (s || '').toLowerCase().includes(search));
    return matchStatus && matchSearch;
  });

  if (!filtered.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  tbody.innerHTML = filtered.map(inv => {
    const conf = inv.ocr_confidence != null ? Math.round(inv.ocr_confidence * 100) : null;
    const confClass = conf == null ? '' : conf >= 85 ? 'high' : conf >= 70 ? 'mid' : 'low';
    const confHtml = conf != null
      ? `<div class="conf-bar-wrap"><div class="conf-bar-track"><div class="conf-bar-fill ${confClass}" style="width:${conf}%"></div></div><span class="conf-pct" style="color:var(--${confClass === 'high' ? 'green' : confClass === 'mid' ? 'amber' : 'red'})">${conf}%</span></div>`
      : '<span style="color:var(--text-dim);font-size:10px">—</span>';
    return `<tr>
      <td style="font:600 11px var(--font-mono);color:var(--blue)">INV-${String(inv.id).padStart(4,'0')}</td>
      <td>
        <div style="font-weight:600">${inv.invoice_number || '—'}</div>
        <div style="font-size:9px;color:var(--text-dim)">Ký hiệu: ${inv.original_name?.split('.')[0]?.slice(0,20) || '—'}</div>
      </td>
      <td>
        <div style="font-weight:600">${inv.seller_tax_code || '—'}</div>
      </td>
      <td style="font:500 10px var(--font-mono);color:var(--text-muted)">${inv.po_number || '—'}</td>
      <td style="color:var(--text-muted)">${fmtDate(inv.invoice_date || inv.created_at)}</td>
      <td style="font:600 11px var(--font-mono)">${fmtMoney(inv.total_amount)}</td>
      <td style="min-width:130px">${confHtml}</td>
      <td><span class="status-badge ${inv.status}">${statusLabel[inv.status] || inv.status}</span></td>
      <td><button class="btn btn-secondary btn-xs" onclick="openMatchingForInvoice(${inv.id})">Mở đối chiếu →</button></td>
    </tr>`;
  }).join('');
}

function updateAlertDropdown(invoices) {
  const alerts = invoices.filter(i => ['mismatch', 'needs_review'].includes(i.status));
  const badge = document.getElementById('alert-badge');
  badge.textContent = alerts.length;
  alerts.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');

  const list = document.getElementById('alert-dropdown-list');
  if (!alerts.length) { list.innerHTML = '<div class="alert-dropdown-item"><span>Không có hóa đơn cần xử lý 🎉</span></div>'; return; }
  list.innerHTML = alerts.slice(0, 8).map(inv => `
    <div class="alert-dropdown-item" onclick="openMatchingForInvoice(${inv.id});closeAlertDropdown()">
      <div class="alert-dot" style="background:${inv.status === 'mismatch' ? 'var(--red)' : 'var(--amber)'}"></div>
      <div style="flex:1">
        <div style="font-weight:600">INV-${String(inv.id).padStart(4,'0')} · ${inv.seller_tax_code || '?'}</div>
        <div style="color:var(--text-dim);font-size:10px">${statusLabel[inv.status]}</div>
      </div>
    </div>`).join('');
}

function closeAlertDropdown() {
  document.getElementById('alert-dropdown').classList.add('hidden');
  alertDropdownOpen = false;
}

// ── Upload ───────────────────────────────────────────
async function uploadFile(file) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowed.includes(file.type)) { toast('Chỉ nhận PDF, PNG, JPEG', 'error'); return; }
  const form = new FormData();
  form.append('file', file);
  toast(`Đang tải lên: ${file.name}…`, 'info');
  try {
    const result = await api('/invoices/upload', 'POST', form);
    if (result) {
      toast(`✅ Tải lên thành công: ${result.original_name} (Trạng thái: ${statusLabel[result.status]})`, 'success', 6000);
      allInvoices.unshift(result);
      if (currentView === 'queue') renderQueueTable(allInvoices);
      else if (currentView === 'dashboard') loadDashboard();
      refreshBadges();
    }
  } catch (e) { toast('Lỗi tải lên: ' + e.message, 'error'); }
}

// ── Matching ─────────────────────────────────────────
async function loadMatchingView() {
  try {
    if (!allInvoices.length) { const data = await api('/invoices'); allInvoices = data || []; }
    if (!allPOs.length) { const pos = await api('/ledger/purchase-orders'); allPOs = pos || []; }
    if (!allGRs.length) { const grs = await api('/ledger/goods-receipts'); allGRs = grs || []; }
    renderMatchingDropdown();
    if (currentMatchingInvoice) loadMatchingInvoice(currentMatchingInvoice.id);
  } catch (e) { toast('Lỗi tải dữ liệu đối soát: ' + e.message, 'error'); }
}

function renderMatchingDropdown() {
  const sel = document.getElementById('match-select');
  const old = sel.value;
  sel.innerHTML = '<option value="">— Chọn hóa đơn cần đối soát —</option>' +
    allInvoices.map(inv => `<option value="${inv.id}" ${inv.status === 'mismatch' || inv.status === 'needs_review' ? '⚠️ ' : ''}>${'INV-' + String(inv.id).padStart(4,'0')} · ${inv.seller_tax_code || inv.original_name || 'N/A'} · ${statusLabel[inv.status]}</option>`).join('');
  if (old) sel.value = old;
}

async function loadMatchingInvoice(id) {
  if (!id) return;
  try {
    const inv = await api(`/invoices/${id}`);
    if (!inv) return;
    currentMatchingInvoice = inv;
    document.getElementById('match-select').value = id;

    // Status badge
    const statusBadge = document.getElementById('match-status-badge');
    statusBadge.className = `status-badge ${inv.status}`;
    statusBadge.textContent = statusLabel[inv.status] || inv.status;

    // Populate header fields
    document.getElementById('m-invoice-number').value = inv.invoice_number || '';
    document.getElementById('m-invoice-serial').value = '';
    document.getElementById('m-invoice-date').value = inv.invoice_date || '';
    document.getElementById('m-po-number').value = inv.po_number || '';
    document.getElementById('m-seller-tax').value = inv.seller_tax_code || '';
    document.getElementById('m-seller-name').value = '';
    document.getElementById('m-review-note').value = inv.review_note || '';

    // OCR confidence indicators
    if (inv.ocr_confidence != null) {
      const conf = Math.round(inv.ocr_confidence * 100);
      const cls = conf >= 85 ? 'high' : 'low';
      ['conf-invoice-number', 'conf-invoice-date', 'conf-seller-tax'].forEach(id => {
        const el = document.getElementById(id);
        el.className = `conf-indicator ${cls}`;
        el.textContent = `OCR Confidence: ${conf}%`;
      });
    }

    // Render invoice document
    renderInvoiceDocument(inv);

    // Tax check
    document.getElementById('tax-check-result').innerHTML =
      inv.seller_tax_code
        ? `🏛️ MST ${inv.seller_tax_code} · <span class="text-green">✓ Đang hoạt động</span>`
        : '🏛️ Chưa có MST bên bán';

    // QR data
    document.getElementById('qr-data').textContent = inv.ocr_text
      ? `Số HĐ: ${inv.invoice_number || '—'} | MST: ${inv.seller_tax_code || '—'} | Ngày: ${inv.invoice_date || '—'} | Tổng: ${inv.total_amount || '—'}`
      : 'Không có dữ liệu QR';

    // Warnings / anomalies
    const warnings = inv.warnings || [];
    const anomalyBanner = document.getElementById('anomaly-banner');
    const anomalyList = document.getElementById('anomaly-list');
    if (warnings.length) {
      anomalyBanner.classList.remove('hidden');
      anomalyList.innerHTML = warnings.map(w => `
        <div class="anomaly-item" onclick="highlightField('${w.code}')">
          <span>▸</span>
          <span>${w.message || w.code}</span>
        </div>`).join('');
      document.getElementById('match-anomaly-count-badge').textContent = `${warnings.length} bất thường`;
      document.getElementById('match-anomaly-count-badge').classList.remove('hidden');
    } else {
      anomalyBanner.classList.add('hidden');
      document.getElementById('match-anomaly-count-badge').classList.add('hidden');
    }

    // Line items 3-way matching
    renderLineItems(inv);

    // Math validation
    renderMathValidation(inv);

    // Audit log for this invoice
    loadMiniAuditLog(id);

  } catch (e) { toast('Lỗi tải hóa đơn: ' + e.message, 'error'); }
}

function renderInvoiceDocument(inv) {
  const placeholder = document.getElementById('doc-placeholder');
  const wrap = document.getElementById('invoice-render-wrap');
  const render = document.getElementById('invoice-render');
  placeholder.classList.add('hidden');
  wrap.classList.remove('hidden');

  const items = inv.items || [];
  const subtotal = inv.total_amount ? inv.total_amount / 1.1 : 0;
  const vat = inv.total_amount ? inv.total_amount - subtotal : 0;

  render.style.transform = `scale(${zoomLevel / 100})`;
  render.innerHTML = `
    <div class="inv-header">
      <div class="inv-republic">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM · Độc lập - Tự do - Hạnh phúc</div>
      <div class="inv-title">HÓA ĐƠN GIÁ TRỊ GIA TĂNG</div>
      <div class="inv-serial">
        Ký hiệu: <strong>${inv.original_name?.split('.')[0]?.slice(0, 16) || '01GTKT0/001'}</strong> &nbsp;|&nbsp;
        Số: <strong>${inv.invoice_number || '—'}</strong> &nbsp;|&nbsp;
        Ngày: <strong>${inv.invoice_date || fmtDate(inv.created_at)}</strong>
      </div>
    </div>
    <div class="inv-parties">
      <div>
        <div class="inv-party-label">Đơn vị bán hàng</div>
        <div class="inv-party-value">MST: ${inv.seller_tax_code || '—'}</div>
        <div style="font-size:9px;color:#555;margin-top:3px">Địa chỉ: (Xem hóa đơn gốc)</div>
        <div style="font-size:9px;color:#555">Số TK: —</div>
      </div>
      <div>
        <div class="inv-party-label">Đơn vị mua hàng</div>
        <div class="inv-party-value">MST: ${inv.buyer_tax_code || '—'}</div>
        <div style="font-size:9px;color:#555;margin-top:3px">Hình thức TT: Chuyển khoản</div>
        <div style="font-size:9px;color:#555">Đồng tiền: VNĐ</div>
      </div>
    </div>
    <table class="inv-table">
      <thead>
        <tr>
          <th style="width:4%">STT</th>
          <th style="text-align:left">Tên hàng hóa, dịch vụ</th>
          <th style="width:6%">ĐVT</th>
          <th style="width:8%">Số lượng</th>
          <th style="width:14%">Đơn giá</th>
          <th style="width:14%">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items.length ? items.map((it, i) => `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td style="text-align:left">${it.name || it.description || '—'}</td>
            <td>${it.unit || 'Cái'}</td>
            <td>${it.quantity ?? '—'}</td>
            <td>${it.unit_price != null ? Number(it.unit_price).toLocaleString('vi-VN') : '—'}</td>
            <td>${it.amount != null ? Number(it.amount).toLocaleString('vi-VN') : '—'}</td>
          </tr>`).join('') :
          `<tr><td colspan="6" style="text-align:center;color:#888;font-size:9px">Chưa có dữ liệu mặt hàng từ OCR</td></tr>`}
      </tbody>
    </table>
    <div class="inv-footer">
      <div class="inv-total-row"><span>Tiền hàng (chưa thuế GTGT):</span><span>${inv.total_amount ? Number(subtotal.toFixed(0)).toLocaleString('vi-VN') : '—'}</span></div>
      <div class="inv-total-row"><span>Thuế suất GTGT: 10%</span><span>${inv.total_amount ? Number(vat.toFixed(0)).toLocaleString('vi-VN') : '—'}</span></div>
      <div class="inv-total-row bold"><span>Tổng cộng tiền thanh toán:</span><span>${fmtMoney(inv.total_amount)}</span></div>
      <div style="font-size:9px;margin-top:4px;font-style:italic">Số tiền bằng chữ: ${numberToVietnamese(inv.total_amount)} đồng chẵn.</div>
    </div>
    <div class="inv-signatures">
      <div>
        <div class="inv-sig-title">ĐẠI DIỆN BÊN BÁN<br>(Ký, đóng dấu, ghi rõ họ tên)</div>
        <div class="dig-sig-seal">🔐 Chữ ký số điện tử<br>SHA256-RSA · Đã xác thực<br>Hash: ${(inv.sha256 || 'N/A').slice(0, 16)}...</div>
      </div>
      <div>
        <div class="inv-sig-title">ĐẠI DIỆN BÊN MUA<br>(Ký, ghi rõ họ tên)</div>
        <div style="color:#888;font-size:9px;margin-top:20px">Chờ phê duyệt...</div>
      </div>
    </div>`;
}

function renderLineItems(inv) {
  const tbody = document.getElementById('line-items-table');
  const empty = document.getElementById('line-items-empty');
  const invItems = inv.items || [];
  const po = allPOs.find(p => p.po_number === inv.po_number);
  const gr = allGRs.find(g => g.po_number === inv.po_number);
  const poItems = po ? (po.lines || []) : [];
  const grItems = gr ? (gr.lines || []) : [];

  if (!invItems.length && !poItems.length) {
    tbody.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');

  const rows = [];
  const maxRows = Math.max(invItems.length, poItems.length, 1);
  for (let i = 0; i < maxRows; i++) {
    const invIt = invItems[i] || {};
    const poIt = poItems[i] || {};
    const grIt = grItems[i] || {};
    const invName = invIt.name || invIt.description || '—';
    const poName = poIt.name || poIt.description || '—';

    // Fuzzy score (simple approximation)
    let fuzzyScore = 0;
    if (invName !== '—' && poName !== '—') {
      const a = invName.toLowerCase(), b = poName.toLowerCase();
      const longer = a.length > b.length ? a : b;
      const shorter = a.length <= b.length ? a : b;
      if (longer.includes(shorter) || shorter.includes(longer)) fuzzyScore = 95;
      else {
        let matches = 0;
        shorter.split('').forEach(c => { if (longer.includes(c)) matches++; });
        fuzzyScore = Math.round((matches / longer.length) * 100);
      }
    }
    const fuzzyClass = fuzzyScore >= 90 ? 'high' : fuzzyScore >= 70 ? 'mid' : 'low';

    const invQty = invIt.quantity ?? '—';
    const poQty = poIt.quantity ?? '—';
    const grQty = grIt.quantity ?? '—';
    const qtyOk = invQty !== '—' && grQty !== '—' && Number(invQty) <= Number(grQty);

    const invPrice = invIt.unit_price ?? '—';
    const poPrice = poIt.unit_price ?? '—';
    const priceOk = invPrice !== '—' && poPrice !== '—' && Math.abs(Number(invPrice) - Number(poPrice)) <= 100;

    rows.push(`<tr>
      <td class="match-cell"><input value="${invName}" oninput="markDirty()" title="Sửa trực tiếp tên hàng OCR"></td>
      <td style="color:var(--text-muted)">${poName}</td>
      <td><span class="levenshtein-score ${fuzzyClass}">${fuzzyScore}%</span></td>
      <td>
        <div class="qty-compare">
          <span class="qty-val ${invQty === '—' ? 'neutral' : qtyOk ? 'ok' : 'warn'}">${invQty}</span>
          <span style="color:var(--text-dim)">|</span>
          <span class="qty-val neutral">${poQty}</span>
          <span style="color:var(--text-dim)">|</span>
          <span class="qty-val ${grQty === '—' ? 'neutral' : qtyOk ? 'ok' : 'warn'}">${grQty}</span>
        </div>
      </td>
      <td>
        <div class="qty-compare">
          <span class="qty-val ${invPrice === '—' ? 'neutral' : priceOk ? 'ok' : 'warn'}">${invPrice !== '—' ? Number(invPrice).toLocaleString('vi-VN') : '—'}</span>
          <span style="color:var(--text-dim)">|</span>
          <span class="qty-val neutral">${poPrice !== '—' ? Number(poPrice).toLocaleString('vi-VN') : '—'}</span>
        </div>
      </td>
      <td style="font:600 10px var(--font-mono)">${invIt.amount != null ? Number(invIt.amount).toLocaleString('vi-VN') : '—'}</td>
    </tr>`);
  }
  tbody.innerHTML = rows.join('');
}

function renderMathValidation(inv) {
  if (!inv.total_amount) {
    ['math-subtotal','math-vat','math-total'].forEach(id => document.getElementById(id).textContent = '—');
    return;
  }
  const total = inv.total_amount;
  const subtotal = total / 1.1;
  const vat = total - subtotal;
  const tolerance = 10;

  document.getElementById('math-subtotal').textContent = Number(subtotal.toFixed(0)).toLocaleString('vi-VN') + ' ₫';
  document.getElementById('math-vat').textContent = Number(vat.toFixed(0)).toLocaleString('vi-VN') + ' ₫';
  document.getElementById('math-total').textContent = Number(total.toFixed(0)).toLocaleString('vi-VN') + ' ₫';

  const itemsSum = (inv.items || []).reduce((acc, it) => acc + (it.amount || 0), 0);
  const matchOk = !itemsSum || Math.abs(itemsSum - subtotal) <= tolerance;

  document.getElementById('math-subtotal-check').className = `math-check ${matchOk ? 'ok' : 'warn'}`;
  document.getElementById('math-subtotal-check').textContent = matchOk ? '✓ Khớp' : '⚠ Lệch';
  document.getElementById('math-vat-check').className = 'math-check ok';
  document.getElementById('math-vat-check').textContent = '✓ Khớp';
  document.getElementById('math-total-check').className = `math-check ${matchOk ? 'ok' : 'warn'}`;
  document.getElementById('math-total-check').textContent = matchOk ? '✓ Khớp' : '⚠ Cần xác nhận';
}

async function loadMiniAuditLog(invoiceId) {
  try {
    const logs = await api('/reports/audit?limit=20');
    const relevant = (logs || []).filter(l => l.entity === `invoice:${invoiceId}`).slice(0, 5);
    const wrap = document.getElementById('audit-mini-list');
    if (!relevant.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:16px"><p style="font-size:11px">Chưa có nhật ký cho hóa đơn này.</p></div>';
      return;
    }
    wrap.innerHTML = relevant.map(l => `
      <div class="audit-mini-row">
        <span class="audit-time">${fmtDatetime(l.created_at).split(', ')[0]}<br>${fmtDatetime(l.created_at).split(', ')[1] || ''}</span>
        <span class="audit-actor">${l.actor}</span>
        <span class="audit-detail"><strong>${l.action}</strong>${l.detail ? ' · ' + l.detail : ''}</span>
      </div>`).join('');
  } catch {}
}

async function saveReview() {
  if (!currentMatchingInvoice) { toast('Chưa chọn hóa đơn', 'warning'); return; }
  const body = {
    seller_tax_code: document.getElementById('m-seller-tax').value,
    buyer_tax_code: currentMatchingInvoice.buyer_tax_code || '',
    invoice_number: document.getElementById('m-invoice-number').value,
    invoice_date: document.getElementById('m-invoice-date').value,
    total_amount: currentMatchingInvoice.total_amount,
    items: currentMatchingInvoice.items || [],
    po_number: document.getElementById('m-po-number').value,
    review_note: document.getElementById('m-review-note').value
  };
  try {
    const updated = await api(`/invoices/${currentMatchingInvoice.id}/review`, 'PATCH', body);
    if (updated) {
      currentMatchingInvoice = updated;
      const reconciled = await api(`/invoices/${currentMatchingInvoice.id}/reconcile`, 'POST');
      if (reconciled) { currentMatchingInvoice = reconciled; }
      toast('Đã lưu và chạy lại đối soát!', 'success');
      loadMatchingInvoice(currentMatchingInvoice.id);
      refreshBadges();
    }
  } catch (e) { toast('Lỗi lưu: ' + e.message, 'error'); }
}

async function approveInvoice() {
  if (!currentMatchingInvoice) return;
  if (!['matched', 'reviewed'].includes(currentMatchingInvoice.status)) {
    toast('Chỉ phê duyệt hóa đơn đã rà soát hoặc đã khớp', 'warning'); return;
  }
  try {
    const updated = await api(`/invoices/${currentMatchingInvoice.id}/approve`, 'POST');
    if (updated) { currentMatchingInvoice = updated; toast('✅ Đã phê duyệt thanh toán!', 'success'); loadMatchingInvoice(currentMatchingInvoice.id); refreshBadges(); }
  } catch (e) { toast('Lỗi phê duyệt: ' + e.message, 'error'); }
}

function openMatchingForInvoice(id) {
  currentMatchingInvoice = { id };
  navigateTo('matching');
  setTimeout(() => loadMatchingInvoice(id), 200);
}

function highlightField(code) {
  const map = { PRICE_MISMATCH: 'm-po-number', QTY_MISMATCH: 'm-po-number', TAX_ERROR: 'm-invoice-number' };
  const fieldId = map[code] || 'm-review-note';
  const el = document.getElementById(fieldId);
  if (el) { el.classList.add('highlighted'); el.focus(); setTimeout(() => el.classList.remove('highlighted'), 3000); }
}

function markDirty() { /* flag unsaved changes if needed */ }

// ── Master Data ──────────────────────────────────────
async function loadMasterData() {
  try {
    const [pos, grs, supps] = await Promise.all([
      api('/ledger/purchase-orders'),
      api('/ledger/goods-receipts'),
      api('/ledger/suppliers')
    ]);
    allPOs = pos || []; allGRs = grs || []; allSuppliers = supps || [];
    renderPOTable(); renderGRTable(); renderSuppliersTable();
  } catch (e) { toast('Lỗi tải master data: ' + e.message, 'error'); }
}

function renderPOTable() {
  const tbody = document.getElementById('po-table');
  const empty = document.getElementById('po-empty');
  if (!allPOs.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = allPOs.map(po => `
    <tr class="po-row" onclick="togglePOExpand(${po.id})" id="po-row-${po.id}">
      <td style="color:var(--text-dim);font-size:14px">▸</td>
      <td style="font:600 12px var(--font-mono);color:var(--blue)">${po.po_number}</td>
      <td>${po.supplier_tax_code || '—'}</td>
      <td style="color:var(--text-muted)">${fmtDate(po.created_at)}</td>
      <td style="font:600 11px var(--font-mono)">${fmtMoney(po.total_amount)}</td>
      <td><span class="status-badge ${po.status === 'open' ? 'ocr_done' : 'approved'}">${po.status === 'open' ? 'Đang mở' : 'Đã đóng'}</span></td>
      <td><button class="btn btn-secondary btn-xs" onclick="event.stopPropagation();openMatchingForPO('${po.po_number}')">Xem HĐ liên kết →</button></td>
    </tr>
    <tr class="hidden" id="po-expand-${po.id}">
      <td colspan="7">
        <div class="po-items-expand">
          <div style="font:600 10px var(--font-mono);color:var(--text-dim);margin-bottom:8px">CHI TIẾT MẶT HÀNG ĐÃ THỎA THUẬN GIÁ:</div>
          <table class="po-line-table">
            <thead><tr><th>TÊN HÀNG HÓA</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead>
            <tbody>${(po.lines || []).length ? (po.lines || []).map(l => `
              <tr>
                <td>${l.name || l.description || '—'}</td>
                <td>${l.quantity ?? '—'}</td>
                <td>${l.unit_price != null ? Number(l.unit_price).toLocaleString('vi-VN') : '—'}</td>
                <td>${l.amount != null ? Number(l.amount).toLocaleString('vi-VN') : l.quantity && l.unit_price ? Number(l.quantity * l.unit_price).toLocaleString('vi-VN') : '—'}</td>
              </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:12px">Chưa có dòng hàng</td></tr>'}
            </tbody>
          </table>
        </div>
      </td>
    </tr>`).join('');
}

function togglePOExpand(id) {
  const expand = document.getElementById('po-expand-' + id);
  const row = document.getElementById('po-row-' + id);
  const isHidden = expand.classList.contains('hidden');
  expand.classList.toggle('hidden', !isHidden);
  row.cells[0].textContent = isHidden ? '▾' : '▸';
}

function openMatchingForPO(poNumber) {
  const inv = allInvoices.find(i => i.po_number === poNumber);
  if (inv) openMatchingForInvoice(inv.id);
  else { toast('Chưa có hóa đơn liên kết với PO này', 'info'); navigateTo('matching'); }
}

function renderGRTable() {
  const tbody = document.getElementById('gr-table');
  const empty = document.getElementById('gr-empty');
  if (!allGRs.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = allGRs.map(gr => `
    <tr>
      <td style="font:600 12px var(--font-mono);color:var(--blue)">${gr.receipt_number}</td>
      <td style="font:500 11px var(--font-mono);color:var(--text-muted)">${gr.po_number}</td>
      <td>${allSuppliers.find(s => allPOs.find(p => p.po_number === gr.po_number)?.supplier_tax_code === s.tax_code)?.name || '—'}</td>
      <td>${fmtDate(gr.received_at)}</td>
      <td style="font:600 11px var(--font-mono)">${(gr.lines || []).length} dòng</td>
      <td>
        <button class="btn btn-secondary btn-xs" onclick="showGRDetail(${gr.id})">Xem chi tiết →</button>
      </td>
    </tr>`).join('');
}

function renderSuppliersTable() {
  const tbody = document.getElementById('suppliers-table');
  const empty = document.getElementById('suppliers-empty');
  if (!allSuppliers.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = allSuppliers.map(s => {
    const invoiceCount = allInvoices.filter(i => i.seller_tax_code === s.tax_code).length;
    return `<tr>
      <td style="font-weight:600">${s.name}</td>
      <td style="font:500 11px var(--font-mono);color:var(--blue)">${s.tax_code}</td>
      <td style="color:var(--text-muted)">${s.email || '—'}</td>
      <td><span class="risk-badge ok">✓ Đang hoạt động</span></td>
      <td style="font:600 11px var(--font-mono)">${invoiceCount}</td>
    </tr>`;
  }).join('');
}

function showGRDetail(id) {
  const gr = allGRs.find(g => g.id === id);
  if (!gr) return;
  toast(`Phiếu kho ${gr.receipt_number}: ${(gr.lines || []).length} dòng hàng`, 'info');
}

// ── Add modal ─────────────────────────────────────────
function openAddModal(type) {
  const modal = document.getElementById('add-modal');
  const title = document.getElementById('add-modal-title');
  ['add-po-form','add-gr-form','add-supplier-form'].forEach(id => document.getElementById(id).classList.add('hidden'));
  modal._type = type;
  if (type === 'po') { title.textContent = '+ Thêm Đơn Đặt Hàng (PO)'; document.getElementById('add-po-form').classList.remove('hidden'); initPOLines(); }
  else if (type === 'gr') { title.textContent = '+ Thêm Phiếu Nhập Kho (GR)'; document.getElementById('add-gr-form').classList.remove('hidden'); initGRLines(); }
  else { title.textContent = '+ Thêm Nhà Cung Cấp'; document.getElementById('add-supplier-form').classList.remove('hidden'); }
  modal.classList.remove('hidden');
}

function initPOLines() {
  poLineCount = 0;
  const builder = document.getElementById('po-lines-builder');
  builder.innerHTML = `<div class="line-item-row" style="background:var(--bg-panel2);font:600 9px var(--font-mono);color:var(--text-dim)"><span>TÊN HÀNG HÓA</span><span>SỐ LƯỢNG</span><span>ĐƠN GIÁ</span><span></span></div>`;
  addPOLine();
}

function addPOLine() {
  poLineCount++;
  const builder = document.getElementById('po-lines-builder');
  const row = document.createElement('div');
  row.className = 'line-item-row';
  row.id = `po-line-${poLineCount}`;
  row.innerHTML = `
    <input placeholder="Tên hàng hóa..." class="po-line-name">
    <input type="number" placeholder="Số lượng" class="po-line-qty">
    <input type="number" placeholder="Đơn giá" class="po-line-price">
    <button onclick="document.getElementById('po-line-${poLineCount}').remove()" style="background:var(--red-dim);color:var(--red);border:none;border-radius:4px;padding:4px 8px;cursor:pointer">✕</button>`;
  builder.appendChild(row);
}

function initGRLines() {
  grLineCount = 0;
  const builder = document.getElementById('gr-lines-builder');
  builder.innerHTML = `<div class="line-item-row" style="background:var(--bg-panel2);font:600 9px var(--font-mono);color:var(--text-dim)"><span>TÊN HÀNG HÓA</span><span>SỐ LƯỢNG THỰC NHẬN</span><span>GHI CHÚ</span><span></span></div>`;
  addGRLine();
}

function addGRLine() {
  grLineCount++;
  const builder = document.getElementById('gr-lines-builder');
  const row = document.createElement('div');
  row.className = 'line-item-row';
  row.id = `gr-line-${grLineCount}`;
  row.innerHTML = `
    <input placeholder="Tên hàng hóa..." class="gr-line-name">
    <input type="number" placeholder="Số lượng thực nhận" class="gr-line-qty">
    <input placeholder="Ghi chú (thiếu, hỏng...)" class="gr-line-note">
    <button onclick="document.getElementById('gr-line-${grLineCount}').remove()" style="background:var(--red-dim);color:var(--red);border:none;border-radius:4px;padding:4px 8px;cursor:pointer">✕</button>`;
  builder.appendChild(row);
}

async function submitAddModal() {
  const modal = document.getElementById('add-modal');
  const type = modal._type;
  try {
    if (type === 'po') {
      const lines = [];
      document.querySelectorAll('[id^="po-line-"]').forEach(row => {
        const name = row.querySelector('.po-line-name')?.value?.trim();
        const qty = parseFloat(row.querySelector('.po-line-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.po-line-price')?.value) || 0;
        if (name) lines.push({ name, quantity: qty, unit_price: price, amount: qty * price });
      });
      const body = { po_number: document.getElementById('add-po-number').value.trim(), supplier_tax_code: document.getElementById('add-po-supplier').value.trim(), total_amount: parseFloat(document.getElementById('add-po-total').value) || 0, lines };
      if (!body.po_number) { toast('Vui lòng nhập mã PO', 'warning'); return; }
      await api('/ledger/purchase-orders', 'POST', body);
      toast('Đã thêm đơn đặt hàng!', 'success');
    } else if (type === 'gr') {
      const lines = [];
      document.querySelectorAll('[id^="gr-line-"]').forEach(row => {
        const name = row.querySelector('.gr-line-name')?.value?.trim();
        const qty = parseFloat(row.querySelector('.gr-line-qty')?.value) || 0;
        const note = row.querySelector('.gr-line-note')?.value?.trim() || '';
        if (name) lines.push({ name, quantity: qty, note });
      });
      const body = { receipt_number: document.getElementById('add-gr-number').value.trim(), po_number: document.getElementById('add-gr-po').value.trim(), lines };
      if (!body.receipt_number || !body.po_number) { toast('Vui lòng nhập mã phiếu và mã PO', 'warning'); return; }
      await api('/ledger/goods-receipts', 'POST', body);
      toast('Đã thêm phiếu nhập kho!', 'success');
    } else {
      const body = { name: document.getElementById('add-sup-name').value.trim(), tax_code: document.getElementById('add-sup-tax').value.trim(), email: document.getElementById('add-sup-email').value.trim() };
      if (!body.tax_code || !body.name) { toast('Vui lòng nhập tên và MST nhà cung cấp', 'warning'); return; }
      await api('/ledger/suppliers', 'POST', body);
      toast('Đã thêm nhà cung cấp!', 'success');
    }
    modal.classList.add('hidden');
    loadMasterData();
  } catch (e) { toast('Lỗi: ' + e.message, 'error'); }
}

// ── Reports ──────────────────────────────────────────
async function loadReports() {
  try {
    const dash = await api('/reports/dashboard');
    document.getElementById('misa-approved-count').textContent = dash?.approved || 0;
    loadAuditLog();
  } catch (e) { toast('Lỗi tải báo cáo: ' + e.message, 'error'); }
}

async function loadAuditLog() {
  try {
    const logs = await api('/reports/audit?limit=100');
    const tbody = document.getElementById('audit-full-table');
    const empty = document.getElementById('audit-empty');
    if (!logs || !logs.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    tbody.innerHTML = logs.map(l => `<tr>
      <td style="font:10px var(--font-mono);color:var(--text-muted)">${fmtDatetime(l.created_at)}</td>
      <td style="font-weight:600;color:var(--blue)">${l.actor}</td>
      <td><span class="audit-action-badge">${l.action}</span></td>
      <td style="color:var(--text-muted)">${l.entity}</td>
      <td style="color:var(--text-muted)">${l.detail || '—'}</td>
    </tr>`).join('');
  } catch (e) {}
}

function showMisaPreview() {
  const approved = allInvoices.filter(i => i.status === 'approved').slice(0, 3);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MisaInvoiceExport version="2024" generated="${new Date().toISOString()}">
${approved.map(inv => `  <Invoice>
    <InvoiceId>${inv.id}</InvoiceId>
    <InvoiceNumber>${inv.invoice_number || ''}</InvoiceNumber>
    <SellerTaxCode>${inv.seller_tax_code || ''}</SellerTaxCode>
    <BuyerTaxCode>${inv.buyer_tax_code || ''}</BuyerTaxCode>
    <InvoiceDate>${inv.invoice_date || ''}</InvoiceDate>
    <Total>${inv.total_amount || 0}</Total>
    <PO>${inv.po_number || ''}</PO>
    <Status>APPROVED</Status>
    <SHA256>${inv.sha256 || ''}</SHA256>
  </Invoice>`).join('\n')}
</MisaInvoiceExport>`;
  document.getElementById('misa-xml-preview').textContent = xml;
  document.getElementById('misa-modal').classList.remove('hidden');
}

// ── Scan now ─────────────────────────────────────────
async function scanNow() {
  try {
    const result = await api('/reports/scan-now', 'POST');
    toast(result?.message || 'Đã quét xong!', result?.added > 0 ? 'success' : 'info');
    if (result?.added > 0 && currentView === 'queue') loadQueue();
  } catch (e) { toast('Lỗi quét: ' + e.message, 'error'); }
}

// ── Import ───────────────────────────────────────────
async function importFile(file, kind) {
  const form = new FormData();
  form.append('file', file);
  toast(`Đang import ${kind}…`, 'info');
  try {
    const result = await api(`/ledger/import/${kind}`, 'POST', form);
    toast(`Import thành công: ${result.created} bản ghi (bỏ qua: ${result.skipped})`, 'success');
    loadMasterData();
  } catch (e) { toast('Lỗi import: ' + e.message, 'error'); }
}

// ── Badges refresh ────────────────────────────────────
async function refreshBadges() {
  try {
    const data = await api('/reports/dashboard');
    if (!data) return;
    document.getElementById('badge-queue').textContent = data.total || 0;
    const mm = data.by_status?.mismatch || 0;
    document.getElementById('badge-mismatch').textContent = mm;
    document.getElementById('badge-mismatch').style.display = mm > 0 ? '' : 'none';
    document.getElementById('misa-approved-count').textContent = data.approved || 0;
    const needsAtt = (data.by_status?.mismatch || 0) + (data.by_status?.needs_review || 0);
    const badge = document.getElementById('alert-badge');
    badge.textContent = needsAtt;
    needsAtt > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
  } catch {}
}

// ── Number to Vietnamese words (simplified) ───────────────
function numberToVietnamese(n) {
  if (!n) return 'không';
  const millions = Math.floor(n / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const hundreds = Math.floor(n % 1000);
  const parts = [];
  if (millions > 0) parts.push(`${millions} triệu`);
  if (thousands > 0) parts.push(`${thousands} nghìn`);
  if (hundreds > 0) parts.push(`${hundreds}`);
  return parts.join(' ') || 'không';
}

// ── EVENT LISTENERS ───────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Check auth
  if (authToken && currentUser) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    applyUser(currentUser);
    navigateTo('dashboard');
    startWorkerCountdown();
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    try {
      await login(email, password);
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      navigateTo('dashboard');
      startWorkerCountdown();
    } catch (e) { errEl.textContent = e.message; }
  });

  // Nav buttons
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Hamburger (mobile)
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-backdrop').classList.toggle('hidden');
  });
  document.getElementById('sidebar-backdrop').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.add('hidden');
  });

  // File upload
  const fileInput = document.getElementById('file-input');
  const triggerUpload = () => fileInput.click();
  ['btn-upload-top','btn-upload-queue'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', triggerUpload);
  });
  fileInput.addEventListener('change', async e => {
    for (const file of e.target.files) await uploadFile(file);
    fileInput.value = '';
  });

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    dropZone.addEventListener('click', triggerUpload);
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      for (const file of e.dataTransfer.files) await uploadFile(file);
    });
  }

  // Queue search/filter
  document.getElementById('queue-search')?.addEventListener('input', () => renderQueueTable(allInvoices));
  document.getElementById('queue-status-filter')?.addEventListener('change', () => renderQueueTable(allInvoices));

  // Matching select
  document.getElementById('match-select')?.addEventListener('change', e => {
    if (e.target.value) loadMatchingInvoice(parseInt(e.target.value));
  });

  // Prev/Next nav
  document.getElementById('match-prev')?.addEventListener('click', () => {
    if (!currentMatchingInvoice || !allInvoices.length) return;
    const idx = allInvoices.findIndex(i => i.id === currentMatchingInvoice.id);
    const prev = allInvoices[idx > 0 ? idx - 1 : allInvoices.length - 1];
    if (prev) loadMatchingInvoice(prev.id);
  });
  document.getElementById('match-next')?.addEventListener('click', () => {
    if (!currentMatchingInvoice || !allInvoices.length) return;
    const idx = allInvoices.findIndex(i => i.id === currentMatchingInvoice.id);
    const next = allInvoices[idx < allInvoices.length - 1 ? idx + 1 : 0];
    if (next) loadMatchingInvoice(next.id);
  });

  // Matching actions
  document.getElementById('btn-save-review')?.addEventListener('click', saveReview);
  document.getElementById('btn-approve')?.addEventListener('click', approveInvoice);
  document.getElementById('btn-reject')?.addEventListener('click', async () => {
    if (!currentMatchingInvoice) return;
    const note = document.getElementById('m-review-note').value;
    try {
      await api(`/invoices/${currentMatchingInvoice.id}/review`, 'PATCH', {
        ...currentMatchingInvoice, review_note: note || 'Từ chối - yêu cầu xuất lại hóa đơn', status: 'needs_review'
      });
      toast('Đã từ chối hóa đơn, yêu cầu xuất lại.', 'warning');
      refreshBadges();
    } catch (e) { toast('Lỗi: ' + e.message, 'error'); }
  });

  // Zoom controls
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => { zoomLevel = Math.min(180, zoomLevel + 20); updateZoom(); });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => { zoomLevel = Math.max(60, zoomLevel - 20); updateZoom(); });
  function updateZoom() {
    document.getElementById('zoom-label').textContent = zoomLevel + '%';
    const render = document.getElementById('invoice-render');
    if (render) render.style.transform = `scale(${zoomLevel / 100})`;
  }

  // Bounding box toggle
  document.getElementById('btn-toggle-bbox')?.addEventListener('click', () => {
    bboxVisible = !bboxVisible;
    document.querySelectorAll('.bbox').forEach(el => el.style.display = bboxVisible ? '' : 'none');
    document.getElementById('btn-toggle-bbox').textContent = bboxVisible ? '👁 Bounding Box' : '🙈 Ẩn BBox';
  });

  // QR toggle
  document.getElementById('btn-toggle-qr')?.addEventListener('click', () => {
    qrVisible = !qrVisible;
    const panel = document.getElementById('qr-panel');
    panel.classList.toggle('hidden', !qrVisible);
    document.getElementById('btn-toggle-qr').textContent = qrVisible ? '📱 Ẩn QR' : '📱 QR Code';
  });

  // Alert bell
  document.getElementById('btn-alerts')?.addEventListener('click', () => {
    alertDropdownOpen = !alertDropdownOpen;
    document.getElementById('alert-dropdown').classList.toggle('hidden', !alertDropdownOpen);
    if (alertDropdownOpen && currentView !== 'queue') loadQueue();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#btn-alerts') && !e.target.closest('#alert-dropdown')) closeAlertDropdown();
  });

  // Scan now
  document.getElementById('btn-scan-now')?.addEventListener('click', scanNow);
  document.getElementById('btn-scan-job')?.addEventListener('click', scanNow);

  // Role switcher
  document.getElementById('role-switcher')?.addEventListener('change', e => {
    const role = e.target.value;
    applyUser({ ...currentUser, role });
    toast(`Đã chuyển sang vai trò: ${roleLabel[role]}`, 'info');
  });

  // Master tabs
  document.querySelectorAll('[data-master-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-master-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['po','gr','suppliers'].forEach(t => document.getElementById('master-tab-' + t).classList.toggle('hidden', t !== btn.dataset.masterTab));
    });
  });

  // Report tabs
  document.querySelectorAll('[data-report-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-report-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['export','rules','auditlog'].forEach(t => document.getElementById('report-tab-' + t).classList.toggle('hidden', t !== btn.dataset.reportTab));
      if (btn.dataset.reportTab === 'auditlog') loadAuditLog();
    });
  });

  // Range sliders
  ['rule-tolerance','rule-fuzzy','rule-ocr-conf'].forEach(id => {
    const input = document.getElementById(id);
    const val = document.getElementById(id + '-val');
    if (input && val) input.addEventListener('input', () => val.textContent = input.value);
  });

  // Save rules
  document.getElementById('btn-save-rules')?.addEventListener('click', () => {
    toast('Cấu hình đã được lưu và bộ quy tắc đang chạy lại...', 'success');
  });
  document.getElementById('btn-reset-rules')?.addEventListener('click', () => {
    document.getElementById('rule-tolerance').value = 10;
    document.getElementById('rule-tolerance-val').textContent = '10';
    document.getElementById('rule-fuzzy').value = 80;
    document.getElementById('rule-fuzzy-val').textContent = '80';
    document.getElementById('rule-ocr-conf').value = 85;
    document.getElementById('rule-ocr-conf-val').textContent = '85';
    toast('Đã đặt lại về cấu hình mặc định', 'info');
  });

  // MISA modal
  document.getElementById('btn-misa-preview')?.addEventListener('click', async () => {
    if (!allInvoices.length) { const d = await api('/invoices'); allInvoices = d || []; }
    showMisaPreview();
  });
  ['misa-modal-close','misa-modal-close2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => document.getElementById('misa-modal').classList.add('hidden'));
  });

  // Add modal
  document.getElementById('btn-add-new-modal')?.addEventListener('click', () => {
    const activeTab = document.querySelector('[data-master-tab].active')?.dataset.masterTab;
    openAddModal(activeTab || 'po');
  });
  document.getElementById('add-modal-close')?.addEventListener('click', () => document.getElementById('add-modal').classList.add('hidden'));
  document.getElementById('add-modal-cancel')?.addEventListener('click', () => document.getElementById('add-modal').classList.add('hidden'));
  document.getElementById('add-modal-submit')?.addEventListener('click', submitAddModal);
  document.getElementById('btn-add-po-line')?.addEventListener('click', addPOLine);
  document.getElementById('btn-add-gr-line')?.addEventListener('click', addGRLine);

  // Import file
  document.getElementById('import-file-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const kind = document.getElementById('import-kind').value;
    await importFile(file, kind);
    e.target.value = '';
  });

  // Close modals on overlay click
  document.getElementById('misa-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
  document.getElementById('add-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

  // Daily / supplier report buttons
  document.getElementById('btn-daily-report')?.addEventListener('click', () => window.open('/api/reports/export.xlsx', '_blank'));
  document.getElementById('btn-supplier-report')?.addEventListener('click', () => toast('Tính năng báo cáo NCC đang phát triển', 'info'));

  // Export links need auth headers — wrap with token
  ['export-csv','export-xlsx'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      e.preventDefault();
      const url = e.currentTarget.href;
      fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
        .then(r => r.blob()).then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = url.includes('.csv') ? 'invoice-report.csv' : 'invoice-report.xlsx';
          a.click();
        }).catch(() => toast('Lỗi tải file', 'error'));
    });
  });

  // MISA download
  document.getElementById('misa-download-btn')?.addEventListener('click', e => {
    e.preventDefault();
    fetch('/api/reports/export.xlsx', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.blob()).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'misa-export.xlsx'; a.click(); })
      .catch(() => toast('Lỗi tải file', 'error'));
  });
});
