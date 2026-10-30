import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptBackendInvoices, adaptBackendSuppliers } from './adapter.ts';

test('adaptBackendInvoices tags 3 bounding boxes each for subTotal, vatAmount, and grandTotal', () => {
  const mockDto = {
    id: 4,
    invoice_number: '1027315',
    invoice_series: '1K23THN',
    invoice_date: '2020-11-27',
    subtotal_amount: 32718182,
    tax_amount: 3271818,
    total_amount: 35990000,
    seller_name: 'Chi Nhánh Công Ty Cổ Phần Bán Lẻ Kỹ Thuật Số FPT',
    seller_tax_code: '0311609355-001',
    buyer_name: 'Công ty ABC',
    buyer_tax_code: '0101234567',
    status: 'matched',
    items: [],
    ocr_blocks: [
      { text: 'Thu sut 0%', box: [317, 1218, 435, 1242] },
      { text: 'Thu sut 5%', box: [523, 1218, 641, 1242] },
      { text: 'Thu sut 10%', box: [728, 1218, 856, 1242] },
      { text: 'Tông cng', box: [930, 1216, 1025, 1246] },
      { text: 'Tin hàng hóa, dch v', box: [53, 1253, 236, 1280] },
      { text: '0', box: [507, 1254, 527, 1280] },
      { text: '0', box: [714, 1255, 731, 1279] },
      { text: '32,718,182', box: [842, 1253, 935, 1280] },
      { text: '32,718,182', box: [1048, 1256, 1141, 1280] },
      { text: 'Tin thu', box: [53, 1289, 133, 1314] },
      { text: '0', box: [509, 1291, 526, 1315] },
      { text: '0', box: [714, 1291, 731, 1314] },
      { text: '3,271,818', box: [851, 1291, 936, 1316] },
      { text: '3,271,818', box: [1057, 1291, 1141, 1316] },
      { text: 'Tièn thanh toán', box: [52, 1325, 180, 1350] },
      { text: '0', box: [507, 1326, 527, 1353] },
      { text: '0', box: [714, 1328, 731, 1352] },
      { text: '35,990,000', box: [842, 1328, 935, 1352] },
      { text: '35,990,000', box: [1049, 1329, 1139, 1350] },
      { text: 'S tin bng ch : Ba mưoi lăm triu chín trăm chín muoi nghìn đồng', box: [52, 1362, 602, 1387] }
    ]
  };

  const adapted = adaptBackendInvoices([mockDto as any], [], [], []);
  assert.equal(adapted.length, 1);
  const inv = adapted[0];

  const subBoxes = inv.boundingBoxes.filter(b => b.fieldKey === 'subTotal');
  const vatBoxes = inv.boundingBoxes.filter(b => b.fieldKey === 'vatAmount');
  const totalBoxes = inv.boundingBoxes.filter(b => b.fieldKey === 'grandTotal');

  assert.equal(subBoxes.length, 3, `Expected 3 subTotal boxes, got ${subBoxes.length}: ${JSON.stringify(subBoxes.map(b => b.text))}`);
  assert.equal(vatBoxes.length, 3, `Expected 3 vatAmount boxes, got ${vatBoxes.length}: ${JSON.stringify(vatBoxes.map(b => b.text))}`);
  assert.equal(totalBoxes.length, 3, `Expected 3 grandTotal boxes, got ${totalBoxes.length}: ${JSON.stringify(totalBoxes.map(b => b.text))}`);

  assert.deepEqual(subBoxes.map(b => b.text), ['Tin hàng hóa, dch v', '32,718,182', '32,718,182']);
  assert.deepEqual(vatBoxes.map(b => b.text), ['Tin thu', '3,271,818', '3,271,818']);
  assert.deepEqual(totalBoxes.map(b => b.text), ['Tièn thanh toán', '35,990,000', '35,990,000']);
});

test('adaptBackendInvoices tags bounding boxes for line items including price, vat, and line amount', () => {
  const mockDto = {
    id: 5,
    invoice_number: '506572',
    invoice_series: '1C22THT',
    invoice_date: '2022-10-09',
    subtotal_amount: 32718182,
    tax_amount: 3271818,
    total_amount: 35990000,
    seller_name: 'FPT Shop',
    seller_tax_code: '0311609355',
    buyer_name: 'Công ty ABC',
    buyer_tax_code: '0101234567',
    status: 'matched',
    items: [
      {
        line_number: 1,
        item_name: 'Apple ĐTDĐ iPhone 12 Pro Max 256GB Gold',
        unit_price: 32718182,
        line_total: 32718182,
        tax_rate: 10,
        quantity: 1
      }
    ],
    ocr_blocks: [
      { text: 'Apple ĐTDĐ iPhone 12 Pro Max 256GB Gold', box: [48, 672, 350, 700] },
      { text: '10%', box: [650, 672, 700, 700] },
      { text: '32,718,182', box: [820, 672, 920, 700] },
      { text: '32,718,182', box: [990, 672, 1090, 700] }
    ]
  };

  const adapted = adaptBackendInvoices([mockDto as any], [], [], []);
  assert.equal(adapted.length, 1);
  const inv = adapted[0];

  const nameBox = inv.boundingBoxes.find(b => b.fieldKey === 'lineItem_1');
  const vatBox = inv.boundingBoxes.find(b => b.fieldKey === 'lineItem_1_vat');
  const priceBox = inv.boundingBoxes.find(b => b.fieldKey === 'lineItem_1_price');
  const amountBox = inv.boundingBoxes.find(b => b.fieldKey === 'lineItem_1_amount');

  assert.ok(nameBox, 'lineItem_1 name box should exist');
  assert.ok(vatBox, 'lineItem_1_vat box should exist');
  assert.ok(priceBox, 'lineItem_1_price box should exist');
  assert.ok(amountBox, 'lineItem_1_amount box should exist');

  assert.equal(nameBox?.text, 'Apple ĐTDĐ iPhone 12 Pro Max 256GB Gold');
  assert.equal(vatBox?.text, '10%');
  assert.equal(priceBox?.text, '32,718,182');
  assert.equal(amountBox?.text, '32,718,182');
});

test('adaptBackendInvoices and adaptBackendSuppliers resolve taxStatus and legalStatus from tax codes', () => {
  const [invActive, invRisk] = adaptBackendInvoices(
    [
      { id: 1, seller_tax_code: '0311609355-001', items: [], ocr_blocks: [], status: 'matched' } as any,
      { id: 2, seller_tax_code: '0316554432', items: [], ocr_blocks: [], status: 'matched' } as any,
    ],
    [],
    [],
    []
  );
  assert.equal(invActive.header.taxStatus, 'ACTIVE');
  assert.equal(invRisk.header.taxStatus, 'TAX_RISK');

  const suppliers = adaptBackendSuppliers([
    { id: 1, supplier_code: 'NCC-01', tax_code: '0108075931', name: 'HTV', address: 'HN', phone: '', email: '' },
    { id: 2, supplier_code: 'NCC-02', tax_code: '0316554432', name: 'Risk Co', address: 'HCM', phone: '', email: '' },
  ]);
  assert.equal(suppliers[0].legalStatus, 'ACTIVE');
  assert.equal(suppliers[1].legalStatus, 'WARNING_HIGH_RISK');
});



