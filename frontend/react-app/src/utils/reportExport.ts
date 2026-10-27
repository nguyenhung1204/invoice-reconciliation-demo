export interface InvoiceXmlExportRow {
  code: string;
  invoiceNumber: string;
  series: string;
  issueDate: string;
  sellerTaxCode: string;
  total: number | null;
}

function escapeXml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildInvoiceXmlExport(rows: InvoiceXmlExportRow[], exportDate: string): string {
  const invoices = rows.map((invoice) => `  <invoice code="${escapeXml(invoice.code)}" invoice_number="${escapeXml(invoice.invoiceNumber)}" series="${escapeXml(invoice.series)}" issue_date="${escapeXml(invoice.issueDate)}" seller_tax_code="${escapeXml(invoice.sellerTaxCode)}" total="${escapeXml(invoice.total)}" />`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<invoice_export version="1" export_date="${escapeXml(exportDate)}">\n${invoices}\n</invoice_export>`;
}
