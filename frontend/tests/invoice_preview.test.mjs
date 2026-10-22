import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const appScript = readFileSync(resolve(here, '../src/app.js'), 'utf8');

test('reconciliation preview displays the original invoice file returned by the API', async () => {
  const elements = {
    'doc-placeholder': { classList: { add() {} } },
    'invoice-render-wrap': { classList: { remove() {} } },
    'invoice-render': { style: {}, innerHTML: '' },
  };
  const fetchCalls = [];
  let previewBlob = null;
  const context = vm.createContext({
    Blob,
    URL: {
      createObjectURL(blob) {
        previewBlob = blob;
        return 'blob:original-invoice-3';
      },
      revokeObjectURL() {},
    },
    document: {
      addEventListener() {},
      getElementById(id) { return elements[id]; },
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        headers: { get: () => 'application/pdf' },
        blob: async () => new Blob(['%PDF-original'], { type: 'application/pdf' }),
      };
    },
    localStorage: { getItem: () => null },
  });

  vm.runInContext(appScript, context);
  await vm.runInContext("authToken = 'demo-token'; currentMatchingInvoice = { id: 3 }; renderInvoiceDocument({ id: 3, original_name: 'HD_001.pdf' })", context);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/api/invoices/3/file');
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer demo-token');
  assert.equal(previewBlob.type, 'application/pdf');
  assert.match(elements['invoice-render'].innerHTML, /<iframe[^>]+src="blob:original-invoice-3/);
});

test('invoice date formatter handles Vietnamese day-first dates', () => {
  const context = vm.createContext({
    document: { addEventListener() {} },
    localStorage: { getItem: () => null },
  });
  vm.runInContext(appScript, context);

  const formatted = vm.runInContext("fmtDate('15/04/2024')", context);

  assert.doesNotMatch(formatted, /Invalid Date/);
  assert.match(formatted, /2024/);
});
