import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Plus,
  FileSpreadsheet,
  Building2,
  PackageCheck,
  ShoppingCart,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  X,
  Users,
  UserCog,
  Tag,
  Box,
  Pencil,
  Trash2,
  Download,
  ChevronDown,
  ChevronUp,
  Receipt,
  CircleCheck,
} from 'lucide-react';
import {
  GoodsReceipt,
  PurchaseOrder,
  SupplierMaster,
  UserProfile,
  ProductCategory,
  Product,
  Customer,
  Employee,
} from '../../types/index.ts';
import { formatCurrencyVND } from '../../utils/matchingEngine.ts';
import { api, store } from '../../services/api.ts';

interface MasterDataModuleProps {
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  suppliers: SupplierMaster[];
  currentUser: UserProfile;
}

type TabType = 'PO' | 'GR' | 'SUPPLIERS' | 'CUSTOMERS' | 'EMPLOYEES' | 'CATEGORIES' | 'PRODUCTS';

const EMPTY_SUPPLIER_FORM = {
  code: '',
  name: '',
  taxCode: '',
  address: '',
  phone: '',
  email: '',
};

const EMPTY_CATEGORY_FORM = {
  code: '',
  name: '',
  description: '',
};

const EMPTY_PRODUCT_FORM = {
  code: '',
  name: '',
  categoryCode: '',
  unit: 'Chiếc',
  costPrice: 0,
  sellingPrice: 0,
  stockQty: 0,
};

const EMPTY_CUSTOMER_FORM = {
  code: '',
  name: '',
  phone: '',
  address: '',
  email: '',
};

const EMPTY_EMPLOYEE_FORM = {
  code: '',
  fullName: '',
  role: 'Kế toán viên',
  phone: '',
  email: '',
};

export const MasterDataModule: React.FC<MasterDataModuleProps> = ({
  purchaseOrders,
  goodsReceipts,
  suppliers,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('PO');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedPoCode, setExpandedPoCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Master data state from store
  const [categories, setCategories] = useState<ProductCategory[]>(() => store.getProductCategories());
  const [products, setProducts] = useState<Product[]>(() => store.getProducts());
  const [customers, setCustomers] = useState<Customer[]>(() => store.getCustomers());
  const [employees, setEmployees] = useState<Employee[]>(() => store.getEmployees());

  useEffect(() => {
    return store.subscribe(() => {
      setCategories(store.getProductCategories());
      setProducts(store.getProducts());
      setCustomers(store.getCustomers());
      setEmployees(store.getEmployees());
    });
  }, []);

  // Form states
  const [supplierForm, setSupplierForm] = useState({ ...EMPTY_SUPPLIER_FORM });
  const [categoryForm, setCategoryForm] = useState({ ...EMPTY_CATEGORY_FORM });
  const [productForm, setProductForm] = useState({ ...EMPTY_PRODUCT_FORM });
  const [customerForm, setCustomerForm] = useState({ ...EMPTY_CUSTOMER_FORM });
  const [employeeForm, setEmployeeForm] = useState({ ...EMPTY_EMPLOYEE_FORM });

  const [poForm, setPoForm] = useState({
    code: '',
    supplierCode: '',
    supplierName: '',
    supplierTaxCode: '',
    employeeCode: '',
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    items: [{ itemName: '', unit: 'Chiếc', quantity: 1, unitPrice: 0 }],
  });

  const [grForm, setGrForm] = useState({
    code: '',
    poCode: '',
    supplierName: '',
    receivedBy: currentUser.name,
    warehouseLocation: 'Kho Tổng',
    itemName: '',
    unit: 'Chiếc',
    quantityReceived: 1,
    notes: '',
  });

  const showToast = (msg: string, error = false) => {
    setToast({ message: msg, error });
    setTimeout(() => setToast(null), 5000);
  };

  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'CHIEF_ACCOUNTANT';

  // Search filter
  const term = searchTerm.toLowerCase();
  const filteredPos = purchaseOrders.filter(
    (po) =>
      !searchTerm ||
      po.code.toLowerCase().includes(term) ||
      po.supplierName.toLowerCase().includes(term) ||
      po.supplierTaxCode.includes(term) ||
      po.createdBy.toLowerCase().includes(term)
  );

  const filteredGrs = goodsReceipts.filter(
    (gr) =>
      !searchTerm ||
      gr.code.toLowerCase().includes(term) ||
      gr.poCode.toLowerCase().includes(term) ||
      gr.supplierName.toLowerCase().includes(term)
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      !searchTerm ||
      s.code.toLowerCase().includes(term) ||
      s.name.toLowerCase().includes(term) ||
      (s.taxCode && s.taxCode.includes(term))
  );

  const filteredCustomers = customers.filter(
    (c) =>
      !searchTerm ||
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      c.phone.includes(term)
  );

  const filteredEmployees = employees.filter(
    (e) =>
      !searchTerm ||
      e.code.toLowerCase().includes(term) ||
      e.fullName.toLowerCase().includes(term) ||
      e.role.toLowerCase().includes(term)
  );

  const filteredCategories = categories.filter(
    (c) =>
      !searchTerm ||
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term)
  );

  const filteredProducts = products.filter(
    (p) =>
      !searchTerm ||
      p.code.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      p.categoryCode.toLowerCase().includes(term)
  );

  // Status badge translator for PO
  const renderPoStatus = (status: string | undefined, poStatusText?: string) => {
    const raw = (poStatusText || status || '').toLowerCase().trim();
    if (raw === 'fulfilled' || raw === 'hoàn tất') {
      return (
        <span className="inline-flex rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          Hoàn tất
        </span>
      );
    }
    if (
      raw === 'partially_delivered' ||
      raw === 'partially_received' ||
      raw === 'giao một phần' ||
      raw.includes('giao thiếu')
    ) {
      return (
        <span className="inline-flex rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
          Giao một phần
        </span>
      );
    }
    if (raw === 'pending' || raw === 'open' || raw === 'chờ xử lý') {
      return (
        <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
          Chờ xử lý
        </span>
      );
    }
    if (raw === 'cancelled' || raw === 'đã hủy') {
      return (
        <span className="inline-flex rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
          Đã hủy
        </span>
      );
    }
    return (
      <span className="inline-flex rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
        {poStatusText || 'Mới tạo'}
      </span>
    );
  };

  const renderLegalStatus = (status: SupplierMaster['legalStatus']) => {
    if (status === 'UNKNOWN') {
      return (
        <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          Chưa tra cứu
        </span>
      );
    }
    if (status === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          <ShieldCheck className="h-3 w-3" />
          Hoạt động
        </span>
      );
    }
    if (status === 'WARNING_HIGH_RISK') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          Rủi ro cao
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
        Đóng cửa
      </span>
    );
  };

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingId(null);
    if (activeTab === 'PO') {
      const nextNum = purchaseOrders.length + 1;
      setPoForm({
        code: `PO-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`,
        supplierCode: suppliers[0]?.code || '',
        supplierName: suppliers[0]?.name || '',
        supplierTaxCode: suppliers[0]?.taxCode || '',
        employeeCode: employees.find((e) => e.fullName === currentUser.name)?.code || '',
        orderDate: new Date().toISOString().slice(0, 10),
        expectedDeliveryDate: '',
        items: [{ itemName: '', unit: 'Chiếc', quantity: 1, unitPrice: 0 }],
      });
    } else if (activeTab === 'GR') {
      const nextNum = goodsReceipts.length + 1;
      setGrForm({
        code: `PNK-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`,
        poCode: purchaseOrders[0]?.code || 'PO-2026-0001',
        supplierName: suppliers[0]?.name || '',
        receivedBy: currentUser.name,
        warehouseLocation: 'Kho Tổng',
        itemName: '',
        unit: 'Chiếc',
        quantityReceived: 1,
        notes: '',
      });
    } else if (activeTab === 'SUPPLIERS') {
      setSupplierForm({ ...EMPTY_SUPPLIER_FORM, code: `NCC-${String(suppliers.length + 1).padStart(2, '0')}` });
    } else if (activeTab === 'CATEGORIES') {
      setCategoryForm({ ...EMPTY_CATEGORY_FORM, code: `LSP-${String(categories.length + 1).padStart(3, '0')}` });
    } else if (activeTab === 'PRODUCTS') {
      setProductForm({ ...EMPTY_PRODUCT_FORM, code: `SP-${String(products.length + 1).padStart(3, '0')}`, categoryCode: categories[0]?.code || '' });
    } else if (activeTab === 'CUSTOMERS') {
      setCustomerForm({ ...EMPTY_CUSTOMER_FORM, code: `KH-${String(customers.length + 1).padStart(3, '0')}` });
    } else if (activeTab === 'EMPLOYEES') {
      setEmployeeForm({ ...EMPTY_EMPLOYEE_FORM, code: `NV-${String(employees.length + 1).padStart(3, '0')}` });
    }
    setShowModal(true);
  };

  // Open Edit modal
  const handleEdit = (item: any) => {
    setEditingId(item.code || item.id);
    if (activeTab === 'PO') {
      setPoForm({
        code: item.code,
        supplierCode: item.supplierCode || '',
        supplierName: item.supplierName,
        supplierTaxCode: item.supplierTaxCode,
        employeeCode: item.employeeCode || '',
        orderDate: item.orderDate || '',
        expectedDeliveryDate: item.expectedDeliveryDate || '',
        items: item.items.map((it: any) => ({
          itemName: it.itemName,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      });
    } else if (activeTab === 'SUPPLIERS') {
      setSupplierForm({
        code: item.code,
        name: item.name,
        taxCode: item.taxCode || '',
        address: item.address || '',
        phone: item.phone || '',
        email: item.email || '',
      });
    } else if (activeTab === 'CATEGORIES') {
      setCategoryForm({
        code: item.code,
        name: item.name,
        description: item.description || '',
      });
    } else if (activeTab === 'PRODUCTS') {
      setProductForm({
        code: item.code,
        name: item.name,
        categoryCode: item.categoryCode,
        unit: item.unit,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        stockQty: item.stockQty,
      });
    } else if (activeTab === 'CUSTOMERS') {
      setCustomerForm({
        code: item.code,
        name: item.name,
        phone: item.phone || '',
        address: item.address || '',
        email: item.email || '',
      });
    } else if (activeTab === 'EMPLOYEES') {
      setEmployeeForm({
        code: item.code,
        fullName: item.fullName,
        role: item.role,
        phone: item.phone || '',
        email: item.email || '',
      });
    }
    setShowModal(true);
  };

  // Delete item with permission check
  const handleDelete = async (code: string) => {
    if (!canManage) {
      alert('🔒 Bạn không có quyền xóa. Chỉ Admin hoặc Kế toán trưởng được phép xóa danh mục.');
      return;
    }
    if (confirm(`Xác nhận xóa mục có mã ${code}?`)) {
      try {
        if (activeTab === 'SUPPLIERS') await store.deleteSupplier(code);
        else if (activeTab === 'CATEGORIES') await store.deleteProductCategory(code);
        else if (activeTab === 'PRODUCTS') await store.deleteProduct(code);
        else if (activeTab === 'CUSTOMERS') await store.deleteCustomer(code);
        else if (activeTab === 'EMPLOYEES') await store.deleteEmployee(code);
        else if (activeTab === 'PO') await store.deletePurchaseOrder(code);
        else if (activeTab === 'GR') await store.deleteGoodsReceipt(code);
        showToast(`Đã xóa mục ${code} thành công!`);
      } catch (err: any) {
        showToast(`Không xóa được ${code}: ${err.message || err}`, true);
      }
    }
  };

  // Submit Modal Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (activeTab === 'PO') {
        const total = poForm.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
        const sup = suppliers.find((s) => s.code === poForm.supplierCode);
        const newPo: PurchaseOrder = {
          code: poForm.code,
          supplierCode: poForm.supplierCode,
          supplierName: poForm.supplierName || sup?.name || '',
          supplierTaxCode: poForm.supplierTaxCode || sup?.taxCode || '',
          employeeCode: editingId ? poForm.employeeCode : employees.find((emp) => emp.fullName === currentUser.name)?.code || '',
          orderDate: poForm.orderDate,
          expectedDeliveryDate: poForm.expectedDeliveryDate,
          totalEstimatedAmount: total,
          status: 'PENDING',
          poStatus: 'Mới tạo',
          createdBy: editingId ? purchaseOrders.find((p) => p.code === editingId)?.createdBy || currentUser.name : currentUser.name,
          items: poForm.items.map((it, idx) => ({
            lineNo: idx + 1,
            itemName: it.itemName,
            unit: it.unit,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            amount: Number(it.quantity) * Number(it.unitPrice),
          })),
        };
        if (editingId) await store.updatePurchaseOrder(editingId, newPo);
        else await store.addPurchaseOrder(newPo);
      } else if (activeTab === 'GR') {
        const newGr: GoodsReceipt = {
          code: grForm.code,
          poCode: grForm.poCode,
          supplierName: grForm.supplierName,
          receiptDate: new Date().toISOString().substring(0, 10),
          receivedBy: grForm.receivedBy,
          warehouseLocation: grForm.warehouseLocation,
          items: [
            {
              lineNo: 1,
              itemName: grForm.itemName || 'Hàng hóa nhập kho',
              unit: grForm.unit,
              quantityReceived: Number(grForm.quantityReceived),
              notes: grForm.notes,
            },
          ],
        };
        await store.addGoodsReceipt(newGr);
      } else if (activeTab === 'SUPPLIERS') {
        const newSup: SupplierMaster = {
          ...supplierForm,
          legalStatus: 'UNKNOWN',
          anchorKeywords: [supplierForm.name.split(' ')[0]],
          totalInvoicesReceived: 0,
          mismatchRate: 0,
        };
        if (editingId) await store.updateSupplier(editingId, newSup);
        else await store.addSupplier(newSup);
      } else if (activeTab === 'CATEGORIES') {
        if (editingId) await store.updateProductCategory(editingId, categoryForm);
        else await store.addProductCategory(categoryForm);
      } else if (activeTab === 'PRODUCTS') {
        if (editingId) await store.updateProduct(editingId, productForm);
        else await store.addProduct(productForm);
      } else if (activeTab === 'CUSTOMERS') {
        if (editingId) await store.updateCustomer(editingId, customerForm);
        else await store.addCustomer(customerForm);
      } else if (activeTab === 'EMPLOYEES') {
        if (editingId) await store.updateEmployee(editingId, employeeForm);
        else await store.addEmployee(employeeForm);
      }

      showToast(editingId ? 'Đã cập nhật thành công!' : 'Đã thêm mới thành công!');
      setShowModal(false);
    } catch (err: any) {
      showToast(`Chưa lưu được dữ liệu: ${err.message || err}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  // Download Excel template
  const handleDownloadTemplate = (tab: TabType) => {
    let filename = '';
    let csvContent = '\uFEFF';
    if (tab === 'PO') {
      filename = 'Mau_Don_Hang_PO.csv';
      csvContent += 'po_number,supplier_tax_code,total_amount,order_date,expected_delivery_date,employee_code,lines_json\nPO-2026-0001,0302888783,42000000,2026-10-27,2026-11-03,NV-01,"[{""name"":""Chuột Logitech MX Master 3S"",""unit"":""Chiếc"",""quantity"":20,""unit_price"":2100000}]"';
    } else if (tab === 'GR') {
      filename = 'Mau_Phieu_Nhap_Kho.csv';
      csvContent += 'receipt_number,po_number,received_by,warehouse_location,lines_json\nPNK-2026-0001,PO-2026-0001,Nguyễn Văn A,Kho A,"[{""name"":""Chuột Logitech MX Master 3S"",""unit"":""Chiếc"",""quantity"":20,""notes"":""Nguyên hộp""}]"';
    } else if (tab === 'SUPPLIERS') {
      filename = 'Mau_Nha_Cung_Cap.csv';
      csvContent += 'tax_code,name,email\n0101778163,Công ty Cổ phần Viễn thông FPT,fpt@example.test';
    } else if (tab === 'CUSTOMERS') {
      filename = 'Mau_Khach_Hang.csv';
      csvContent += 'code,name,phone,address,email\nKH-01,Tập đoàn Công nghệ CMC,024-37958686,Hà Nội,contact@cmc.com.vn';
    } else if (tab === 'EMPLOYEES') {
      filename = 'Mau_Nhan_Vien.csv';
      csvContent += 'code,full_name,role,phone,email\nNV-01,Nguyễn Văn Hùng,Kế toán trưởng,0912345678,hungnv@company.com';
    } else if (tab === 'CATEGORIES') {
      filename = 'Mau_Loai_San_Pham.csv';
      csvContent += 'code,name,description\nLSP-01,Thiết bị tin học,Máy tính linh kiện và phụ kiện CNTT';
    } else {
      filename = 'Mau_San_Pham.csv';
      csvContent += 'code,name,category_code,unit,cost_price,selling_price,stock_qty\nSP-01,Màn hình Dell UltraSharp 27 Inch,LSP-01,Chiếc,8500000,9500000,15';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Đã tải mẫu CSV cho ${tab}.`);
  };

  // Import mock Excel/CSV
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const importKind = activeTab === 'PO' ? 'purchase-orders' : activeTab === 'GR' ? 'goods-receipts' : activeTab === 'SUPPLIERS' ? 'suppliers' : activeTab === 'CUSTOMERS' ? 'customers' : activeTab === 'EMPLOYEES' ? 'employees' : activeTab === 'CATEGORIES' ? 'product-categories' : 'products';
      const result = importKind === 'suppliers' || importKind === 'purchase-orders' || importKind === 'goods-receipts'
        ? await api.importLedger(importKind, file)
        : await api.importMasterData(importKind, file);
      await store.syncWithBackend();
      showToast(`Import xong: thêm ${result.created}, bỏ qua ${result.skipped} / ${result.total_rows} dòng.`);
    } catch (err: any) {
      showToast(`Không nhập được dữ liệu: ${err.message || err}`, true);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const TABS = [
    { id: 'PO' as TabType, label: 'Đơn Đặt Hàng (PO)', icon: <ShoppingCart className="h-4 w-4" />, count: purchaseOrders.length },
    { id: 'GR' as TabType, label: 'Phiếu Nhập Kho (GR)', icon: <PackageCheck className="h-4 w-4" />, count: goodsReceipts.length },
    { id: 'SUPPLIERS' as TabType, label: 'Nhà Cung Cấp', icon: <Building2 className="h-4 w-4" />, count: suppliers.length },
    { id: 'CUSTOMERS' as TabType, label: 'Khách Hàng', icon: <Users className="h-4 w-4" />, count: customers.length },
    { id: 'EMPLOYEES' as TabType, label: 'Nhân Viên', icon: <UserCog className="h-4 w-4" />, count: employees.length },
    { id: 'CATEGORIES' as TabType, label: 'Loại Sản Phẩm', icon: <Tag className="h-4 w-4" />, count: categories.length },
    { id: 'PRODUCTS' as TabType, label: 'Sản Phẩm', icon: <Box className="h-4 w-4" />, count: products.length },
  ];

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Header & Thanh công cụ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            Quản Lý Dữ Liệu Gốc &amp; Danh Mục Nghiệp Vụ
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            PO, GR, NCC, Khách hàng, Nhân viên, Loại SP, Sản phẩm — liên kết trực tiếp cơ sở dữ liệu hệ thống
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownloadTemplate(activeTab)}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Tải Mẫu CSV
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Import CSV/XLSX
          </button>

          <button
            onClick={handleOpenAdd}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Thêm mới
          </button>

        </div>
      </div>

      {toast && (
        <div role={toast.error ? 'alert' : 'status'} className={`rounded-xl p-3 text-xs flex items-center justify-between animate-fade-in ${toast.error ? 'border border-rose-200 bg-rose-50 text-rose-800' : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          <div className="flex items-center gap-2">
            {toast.error ? <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" /> : <CircleCheck className="h-4 w-4 text-emerald-600 shrink-0" />}
            <span className="font-medium">{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="font-bold text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
      )}

      {/* Tìm kiếm */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm kiếm theo mã, tên, MST..."
          className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl shadow-2xs overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchTerm('');
            }}
            className={`cursor-pointer shrink-0 pb-3 px-4 pt-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* TAB 1: PO */}
      {activeTab === 'PO' && (
        <div className="rounded-b-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {filteredPos.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <ShoppingCart className="mx-auto h-12 w-12 text-slate-300" />
              <div className="text-sm font-bold text-slate-700">Chưa có Đơn đặt hàng nào</div>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Import PO từ Excel
                </button>
                <button
                  onClick={handleOpenAdd}
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Tạo PO mới
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Mã PO</th>
                    <th className="py-3 px-3">Nhà cung cấp</th>
                    <th className="py-3 px-3">Ngày đặt</th>
                    <th className="py-3 px-3">Người tạo</th>
                    <th className="py-3 px-3 text-right">Tổng tiền đặt</th>
                    <th className="py-3 px-3 text-center">HĐ liên kết</th>
                    <th className="py-3 px-3 text-right">TT theo HĐ</th>
                    <th className="py-3 px-3 text-center">Trạng thái</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPos.map((po) => (
                    <React.Fragment key={po.code}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold font-mono text-blue-700">{po.code}</div>
                          {po.parentPoCode && (
                            <div className="text-[10px] text-purple-600">↳ Bổ sung: {po.parentPoCode}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[220px]">
                          <div className="font-semibold text-slate-900 truncate" title={po.supplierName}>{po.supplierName}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600">{po.orderDate}</td>
                        <td className="py-3 px-3 text-slate-700">{po.createdBy}</td>
                        <td className="py-3 px-3 text-right font-bold font-mono text-slate-900">
                          {formatCurrencyVND(po.totalEstimatedAmount)}
                        </td>
                        <td className="py-3 px-3 font-mono text-blue-600 text-center">
                          {po.linkedInvoiceNumber || '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-700">
                          {po.actualInvoiceTotal ? formatCurrencyVND(po.actualInvoiceTotal) : '—'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderPoStatus(po.status, po.poStatus)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setExpandedPoCode(expandedPoCode === po.code ? null : po.code)}
                              className="cursor-pointer inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-200"
                            >
                              {expandedPoCode === po.code ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                              Chi tiết
                            </button>
                            <button
                              onClick={() => handleEdit(po)}
                              className="cursor-pointer inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-1 text-[10px] text-blue-700 hover:bg-blue-100"
                            >
                              <Pencil className="h-3 w-3" />
                              Sửa
                            </button>
                            <button
                              disabled={!canManage}
                              title={!canManage ? '🔒 Chỉ Admin hoặc Kế toán trưởng được xóa danh mục' : 'Xóa PO'}
                              onClick={() => handleDelete(po.code)}
                              className="cursor-pointer rounded bg-rose-50 px-1.5 py-1 text-[10px] text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedPoCode === po.code && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50 px-6 py-3">
                            <div className="text-xs font-semibold text-slate-700 mb-2">Chi tiết mặt hàng:</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 text-[11px]">
                                  <th className="text-left pb-1">#</th>
                                  <th className="text-left pb-1">Tên hàng</th>
                                  <th className="text-center pb-1">ĐVT</th>
                                  <th className="text-right pb-1">SL Đặt</th>
                                  <th className="text-right pb-1">Đơn giá Đặt</th>
                                  <th className="text-right pb-1">Thành tiền Đặt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {po.items.map((it) => (
                                  <tr key={it.lineNo}>
                                    <td className="py-1 text-slate-400">{it.lineNo}</td>
                                    <td className="py-1 font-medium text-slate-800">{it.itemName}</td>
                                    <td className="py-1 text-center text-slate-500">{it.unit}</td>
                                    <td className="py-1 text-right font-mono font-bold">{it.quantity}</td>
                                    <td className="py-1 text-right font-mono">
                                      {it.unitPrice.toLocaleString('vi-VN')} đ
                                    </td>
                                    <td className="py-1 text-right font-mono font-bold">
                                      {it.amount.toLocaleString('vi-VN')} đ
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GR */}
      {activeTab === 'GR' && (
        <div className="rounded-b-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {filteredGrs.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <PackageCheck className="mx-auto h-12 w-12 text-slate-300" />
              <div className="text-sm font-bold text-slate-700">Chưa có Phiếu nhập kho nào</div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Import GR từ Excel
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Mã Phiếu Kho</th>
                    <th className="py-3 px-3">Mã PO Liên Kết</th>
                    <th className="py-3 px-3">Nhà cung cấp</th>
                    <th className="py-3 px-3">Ngày nhận</th>
                    <th className="py-3 px-3">Người nhận</th>
                    <th className="py-3 px-4">Chi tiết hàng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGrs.map((gr) => (
                    <tr key={gr.code} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold font-mono text-emerald-700">{gr.code}</td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-600">{gr.poCode}</td>
                      <td className="py-3 px-3 font-medium">{gr.supplierName}</td>
                      <td className="py-3 px-3 font-mono">
                        {gr.receiptDate}
                        <div className="text-[10px] text-slate-400">{gr.warehouseLocation}</div>
                      </td>
                      <td className="py-3 px-3">{gr.receivedBy}</td>
                      <td className="py-3 px-4">
                        {gr.items.map((it) => (
                          <div
                            key={it.lineNo}
                            className="text-[11px] flex justify-between gap-2 border-b border-slate-50 pb-0.5"
                          >
                            <span className="font-medium">{it.itemName}</span>
                            <span className="font-mono text-emerald-700 font-bold">
                              Thực nhận: {it.quantityReceived} {it.unit}
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUPPLIERS */}
      {activeTab === 'SUPPLIERS' && (
        <DataTable
          data={filteredSuppliers}
          columns={[
            { key: 'code', label: 'Mã NCC', render: (val) => <span className="font-bold font-mono text-blue-700">{val}</span> },
            { key: 'name', label: 'Tên Doanh Nghiệp', render: (val) => <span className="font-semibold text-slate-900">{val}</span> },
            { key: 'taxCode', label: 'Mã Số Thuế', render: (val) => <span className="font-mono font-bold">{val}</span> },
            { key: 'phone', label: 'Số ĐT', render: (val) => val || '—' },
            { key: 'email', label: 'Email', render: (val) => val || '—' },
            { key: 'address', label: 'Địa chỉ', render: (val) => <span className="text-slate-600 truncate max-w-xs block">{val || '—'}</span> },
            {
              key: 'legalStatus',
              label: 'Trạng thái tra cứu MST',
              render: (val, row) => (
                <div className="flex items-center gap-2">
                  {renderLegalStatus(val)}
                  {row.taxCode && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.lookupTaxCode(row.taxCode, true);
                          if (res.company_name) {
                            showToast(
                              `[Tổng cục Thuế] MST ${res.tax_code}: ${res.company_name} — ${res.status_detail}${res.address ? ` (${res.address})` : ''}`,
                              res.tax_status !== 'ACTIVE'
                            );
                          } else {
                            showToast(res.status_detail || 'Không tìm thấy thông tin MST', true);
                          }
                        } catch (err: unknown) {
                          showToast(err instanceof Error ? err.message : 'Lỗi tra cứu MST', true);
                        }
                      }}
                      className="cursor-pointer rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                      title="Tra cứu trực tuyến từ dữ liệu Tổng cục Thuế"
                    >
                      Tra cứu
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          onEdit={handleEdit}
          onDelete={(item) => handleDelete(item.code)}
          emptyMsg="Chưa có nhà cung cấp nào"
          EmptyIcon={Building2}
          onAdd={handleOpenAdd}
          canManage={canManage}
        />
      )}

      {/* TAB 4: CUSTOMERS */}
      {activeTab === 'CUSTOMERS' && (
        <DataTable
          data={filteredCustomers}
          columns={[
            { key: 'code', label: 'Mã KH', render: (val) => <span className="font-bold font-mono text-blue-700">{val}</span> },
            { key: 'name', label: 'Tên Khách Hàng', render: (val) => <span className="font-semibold text-slate-900">{val}</span> },
            { key: 'phone', label: 'Số điện thoại', render: (val) => <span className="font-mono">{val}</span> },
            { key: 'email', label: 'Email', render: (val) => val || '—' },
            { key: 'address', label: 'Địa chỉ', render: (val) => <span className="truncate max-w-xs block">{val}</span> },
          ]}
          onEdit={handleEdit}
          onDelete={(item) => handleDelete(item.code)}
          emptyMsg="Chưa có khách hàng nào"
          EmptyIcon={Users}
          onAdd={handleOpenAdd}
          canManage={canManage}
        />
      )}

      {/* TAB 5: EMPLOYEES */}
      {activeTab === 'EMPLOYEES' && (
        <DataTable
          data={filteredEmployees}
          columns={[
            { key: 'code', label: 'Mã NV', render: (val) => <span className="font-bold font-mono text-blue-700">{val}</span> },
            { key: 'fullName', label: 'Họ và Tên', render: (val) => <span className="font-semibold text-slate-900">{val}</span> },
            {
              key: 'role',
              label: 'Vai trò',
              render: (val) => (
                <span className="inline-flex rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                  {val}
                </span>
              ),
            },
            { key: 'phone', label: 'Số điện thoại', render: (val) => <span className="font-mono">{val}</span> },
            { key: 'email', label: 'Email', render: (val) => val || '—' },
          ]}
          onEdit={handleEdit}
          onDelete={(item) => handleDelete(item.code)}
          emptyMsg="Chưa có nhân viên nào"
          EmptyIcon={UserCog}
          onAdd={handleOpenAdd}
          canManage={canManage}
        />
      )}

      {/* TAB 6: CATEGORIES */}
      {activeTab === 'CATEGORIES' && (
        <DataTable
          data={filteredCategories}
          columns={[
            { key: 'code', label: 'Mã Loại SP', render: (val) => <span className="font-bold font-mono text-purple-700">{val}</span> },
            { key: 'name', label: 'Tên Loại Sản Phẩm', render: (val) => <span className="font-semibold text-slate-900">{val}</span> },
            { key: 'description', label: 'Mô tả', render: (val) => <span className="text-slate-500">{val}</span> },
          ]}
          onEdit={handleEdit}
          onDelete={(item) => handleDelete(item.code)}
          emptyMsg="Chưa có loại sản phẩm nào"
          EmptyIcon={Tag}
          onAdd={handleOpenAdd}
          canManage={canManage}
        />
      )}

      {/* TAB 7: PRODUCTS */}
      {activeTab === 'PRODUCTS' && (
        <DataTable
          data={filteredProducts}
          columns={[
            { key: 'code', label: 'Mã SP', render: (val) => <span className="font-bold font-mono text-blue-700">{val}</span> },
            { key: 'name', label: 'Tên Sản Phẩm', render: (val) => <span className="font-semibold text-slate-900">{val}</span> },
            {
              key: 'categoryCode',
              label: 'Loại SP',
              render: (val) => {
                const cat = categories.find((c) => c.code === val);
                return <span className="text-slate-600 font-medium">{cat?.name || val}</span>;
              },
            },
            { key: 'unit', label: 'ĐVT', render: (val) => <span className="text-slate-600">{val}</span> },
            {
              key: 'costPrice',
              label: 'Giá Nhập',
              render: (val) => <span className="font-mono">{Number(val).toLocaleString('vi-VN')} đ</span>,
            },
            {
              key: 'sellingPrice',
              label: 'Giá Bán',
              render: (val) => (
                <span className="font-mono text-emerald-700 font-bold">
                  {Number(val).toLocaleString('vi-VN')} đ
                </span>
              ),
            },
            {
              key: 'stockQty',
              label: 'Tồn kho',
              render: (val) => (
                <span className={`font-bold font-mono ${Number(val) < 5 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {val}
                </span>
              ),
            },
          ]}
          onEdit={handleEdit}
          onDelete={(item) => handleDelete(item.code)}
          emptyMsg="Chưa có sản phẩm nào"
          EmptyIcon={Box}
          onAdd={handleOpenAdd}
          canManage={canManage}
        />
      )}

      {/* MODAL THÊM / SỬA */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                {editingId ? <Pencil className="h-4 w-4 text-blue-600" /> : <Plus className="h-4 w-4 text-blue-600" />}
                {editingId ? 'Chỉnh sửa' : 'Thêm mới'} — {TABS.find((t) => t.id === activeTab)?.label}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-3 text-xs">
              {/* Form PO */}
              {activeTab === 'PO' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Mã PO:</label>
                      <input
                        required
                        value={poForm.code}
                        onChange={(e) => setPoForm({ ...poForm, code: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Nhà cung cấp:</label>
                      <select
                        value={poForm.supplierCode}
                        onChange={(e) => {
                          const sup = suppliers.find((s) => s.code === e.target.value);
                          setPoForm({
                            ...poForm,
                            supplierCode: e.target.value,
                            supplierName: sup?.name || '',
                            supplierTaxCode: sup?.taxCode || '',
                          });
                        }}
                        className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                      >
                        <option value="">-- Chọn NCC --</option>
                        {suppliers.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code} - {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Người tạo:</label>
                      <div className="w-full rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-700">
                        {editingId ? purchaseOrders.find((p) => p.code === editingId)?.createdBy || currentUser.name : currentUser.name}
                      </div>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Ngày đặt hàng:</label>
                      <input
                        required
                        type="date"
                        value={poForm.orderDate}
                        onChange={(e) => setPoForm({ ...poForm, orderDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Ngày giao dự kiến:</label>
                      <input
                        required
                        type="date"
                        min={poForm.orderDate || undefined}
                        value={poForm.expectedDeliveryDate}
                        onChange={(e) => setPoForm({ ...poForm, expectedDeliveryDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">Danh sách mặt hàng:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPoForm({
                            ...poForm,
                            items: [...poForm.items, { itemName: '', unit: 'Chiếc', quantity: 1, unitPrice: 0 }],
                          })
                        }
                        className="cursor-pointer text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        + Thêm dòng
                      </button>
                    </div>

                    {poForm.items.map((it, idx) => (
                      <div key={idx} className="mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                        <input
                          required
                          placeholder="Tên hàng hóa..."
                          value={it.itemName}
                          onChange={(e) => {
                            const updated = [...poForm.items];
                            updated[idx].itemName = e.target.value;
                            setPoForm({ ...poForm, items: updated });
                          }}
                          className="w-full rounded border border-slate-300 p-1.5 bg-white"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500">Đơn vị:</span>
                            <input
                              value={it.unit}
                              onChange={(e) => {
                                const updated = [...poForm.items];
                                updated[idx].unit = e.target.value;
                                setPoForm({ ...poForm, items: updated });
                              }}
                              className="w-full rounded border border-slate-300 p-1 bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500">Số lượng:</span>
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => {
                                const updated = [...poForm.items];
                                updated[idx].quantity = Number(e.target.value);
                                setPoForm({ ...poForm, items: updated });
                              }}
                              className="w-full rounded border border-slate-300 p-1 bg-white font-mono"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500">Đơn giá:</span>
                            <input
                              type="number"
                              min="0"
                              value={it.unitPrice}
                              onChange={(e) => {
                                const updated = [...poForm.items];
                                updated[idx].unitPrice = Number(e.target.value);
                                setPoForm({ ...poForm, items: updated });
                              }}
                              className="w-full rounded border border-slate-300 p-1 bg-white font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Form GR */}
              {activeTab === 'GR' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Mã Phiếu Kho:</label>
                      <input
                        required
                        value={grForm.code}
                        onChange={(e) => setGrForm({ ...grForm, code: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Mã PO Liên Kết:</label>
                      <select
                        value={grForm.poCode}
                        onChange={(e) => {
                          const po = purchaseOrders.find((p) => p.code === e.target.value);
                          setGrForm({
                            ...grForm,
                            poCode: e.target.value,
                            supplierName: po?.supplierName || '',
                          });
                        }}
                        className="w-full rounded-lg border border-slate-300 p-2 bg-white font-mono"
                      >
                        {purchaseOrders.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code} ({p.supplierName})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Tên mặt hàng thực nhận:</label>
                    <input
                      required
                      value={grForm.itemName}
                      onChange={(e) => setGrForm({ ...grForm, itemName: e.target.value })}
                      placeholder="Tên hàng hóa nghiệm thu..."
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Số lượng thực nhận:</label>
                      <input
                        type="number"
                        min="1"
                        value={grForm.quantityReceived}
                        onChange={(e) => setGrForm({ ...grForm, quantityReceived: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Đơn vị tính:</label>
                      <input
                        value={grForm.unit}
                        onChange={(e) => setGrForm({ ...grForm, unit: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Form Supplier */}
              {activeTab === 'SUPPLIERS' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">Mã NCC:</label>
                      <input
                        value={supplierForm.code}
                        onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })}
                        placeholder="Tự động nếu để trống"
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-medium">Mã số thuế:</label>
                        <button
                          type="button"
                          onClick={async () => {
                            const mst = supplierForm.taxCode.trim();
                            if (!mst) {
                              showToast('Vui lòng nhập Mã số thuế trước khi tra cứu.', true);
                              return;
                            }
                            try {
                              const info = await api.lookupTaxCode(mst, true);
                              if (info.company_name) {
                                setSupplierForm((prev) => ({
                                  ...prev,
                                  taxCode: info.tax_code || prev.taxCode,
                                  name: info.company_name || prev.name,
                                  address: info.address || prev.address,
                                  phone: info.phone || prev.phone,
                                }));
                                showToast(`Đã tự động điền thông tin từ Tổng cục Thuế: ${info.company_name}`);
                              } else {
                                showToast(info.status_detail || 'Không tìm thấy thông tin MST này.', true);
                              }
                            } catch (err: unknown) {
                              showToast(err instanceof Error ? err.message : 'Lỗi khi tra cứu MST', true);
                            }
                          }}
                          className="cursor-pointer text-[10px] font-bold text-blue-600 hover:text-blue-800 underline"
                        >
                          Tra cứu & Tự điền
                        </button>
                      </div>
                      <input
                        required
                        value={supplierForm.taxCode}
                        onChange={(e) => setSupplierForm({ ...supplierForm, taxCode: e.target.value })}
                        placeholder="Nhập MST (10 hoặc 13 số)..."
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Tên nhà cung cấp: *</label>
                    <input
                      required
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Địa chỉ:</label>
                    <input
                      value={supplierForm.address}
                      onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">Số điện thoại:</label>
                      <input
                        value={supplierForm.phone}
                        onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Email:</label>
                      <input
                        type="email"
                        value={supplierForm.email}
                        onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Form Categories */}
              {activeTab === 'CATEGORIES' && (
                <div className="space-y-2">
                  <div>
                    <label className="block font-medium mb-1">Mã loại SP:</label>
                    <input
                      value={categoryForm.code}
                      onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value })}
                      placeholder="Tự động nếu để trống"
                      className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Tên loại sản phẩm: *</label>
                    <input
                      required
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Mô tả:</label>
                    <textarea
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2 h-20 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Form Products */}
              {activeTab === 'PRODUCTS' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">Mã SP:</label>
                      <input
                        value={productForm.code}
                        onChange={(e) => setProductForm({ ...productForm, code: e.target.value })}
                        placeholder="Tự động nếu để trống"
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Loại sản phẩm:</label>
                      <select
                        value={productForm.categoryCode}
                        onChange={(e) => setProductForm({ ...productForm, categoryCode: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                      >
                        {categories.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Tên sản phẩm: *</label>
                    <input
                      required
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-medium mb-1">ĐVT:</label>
                      <input
                        value={productForm.unit}
                        onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Giá nhập:</label>
                      <input
                        type="number"
                        min="0"
                        value={productForm.costPrice}
                        onChange={(e) => setProductForm({ ...productForm, costPrice: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Giá bán:</label>
                      <input
                        type="number"
                        min="0"
                        value={productForm.sellingPrice}
                        onChange={(e) => setProductForm({ ...productForm, sellingPrice: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Tồn kho:</label>
                    <input
                      type="number"
                      min="0"
                      value={productForm.stockQty}
                      onChange={(e) => setProductForm({ ...productForm, stockQty: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Form Customers */}
              {activeTab === 'CUSTOMERS' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">Mã KH:</label>
                      <input
                        value={customerForm.code}
                        onChange={(e) => setCustomerForm({ ...customerForm, code: e.target.value })}
                        placeholder="Tự động nếu để trống"
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Số điện thoại:</label>
                      <input
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Tên khách hàng: *</label>
                    <input
                      required
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Địa chỉ:</label>
                    <input
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Email:</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                </div>
              )}

              {/* Form Employees */}
              {activeTab === 'EMPLOYEES' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">Mã NV:</label>
                      <input
                        value={employeeForm.code}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, code: e.target.value })}
                        placeholder="Tự động nếu để trống"
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Vai trò:</label>
                      <select
                        value={employeeForm.role}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                      >
                        <option value="Kế toán viên">Kế toán viên</option>
                        <option value="Kế toán trưởng">Kế toán trưởng</option>
                        <option value="Thủ kho">Thủ kho</option>
                        <option value="Quản trị viên">Quản trị viên</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Họ và tên: *</label>
                    <input
                      required
                      value={employeeForm.fullName}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, fullName: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium mb-1">Số điện thoại:</label>
                      <input
                        value={employeeForm.phone}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Email:</label>
                      <input
                        type="email"
                        value={employeeForm.email}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSaving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable DataTable for Suppliers, Customers, Employees, Categories, Products
function DataTable({
  data,
  columns,
  onEdit,
  onDelete,
  emptyMsg,
  EmptyIcon,
  onAdd,
  canManage,
}: {
  data: any[];
  columns: { key: string; label: string; render?: (val: any, row: any) => React.ReactNode }[];
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
  emptyMsg: string;
  EmptyIcon: React.ComponentType<{ className?: string }>;
  onAdd: () => void;
  canManage: boolean;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-b-xl border border-slate-200 bg-white shadow-2xs py-16 text-center space-y-3">
        <EmptyIcon className="mx-auto h-12 w-12 text-slate-300" />
        <div className="text-sm font-bold text-slate-700">{emptyMsg}</div>
        <button
          onClick={onAdd}
          className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Thêm mới
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-b-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="py-3 px-3">
                  {col.label}
                </th>
              ))}
              <th className="py-3 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item, idx) => (
              <tr key={item.code || item.id || idx} className="hover:bg-slate-50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="py-3 px-3">
                    {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? '')}
                  </td>
                ))}
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(item)}
                      className="cursor-pointer inline-flex items-center gap-0.5 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-100"
                    >
                      <Pencil className="h-3 w-3" />
                      Sửa
                    </button>
                    <button
                      disabled={!canManage}
                      title={!canManage ? '🔒 Chỉ Admin hoặc Kế toán trưởng được xóa danh mục' : 'Xóa mục này'}
                      onClick={() => onDelete(item)}
                      className="cursor-pointer rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
