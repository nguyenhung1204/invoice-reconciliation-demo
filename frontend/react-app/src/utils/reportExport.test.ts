import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceXmlExport } from './reportExport.ts';

test('generic invoice XML escapes values and does not claim a vendor import format', () => {
  const xml = buildInvoiceXmlExport([{
    code: 'INV<1>',
    invoiceNumber: '001',
    series: '1C&A',
    issueDate: '2026-10-28',
    sellerTaxCode: '010&2',
    total: null,
  }], '2026-10-28');

  assert.match(xml, /<invoice_export /);
  assert.match(xml, /code="INV&lt;1&gt;"/);
  assert.match(xml, /series="1C&amp;A"/);
  assert.match(xml, /seller_tax_code="010&amp;2"/);
  assert.match(xml, /total=""/);
  assert.doesNotMatch(xml, /MISA|BRAVO|FAST|0109876543/);
});
