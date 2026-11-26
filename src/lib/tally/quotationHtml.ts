import { DealProductItem, Lead } from '@/types/crm';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildQuotationTextSummary(lead: Lead, lineItems: DealProductItem[]): string {
  const ref = `QT-${lead.id.slice(-6).toUpperCase()}`;
  const total = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0)
    : Number(lead.value || 0);

  const lines = lineItems.map((item, idx) => {
    const breakdown = `MOQ ${item.moq} ${item.unit} + ${item.extraQuantity} ${item.unit} extra = ${item.totalQuantity} ${item.unit}`;
    return `${idx + 1}. ${item.name} (${item.sku}) — ${breakdown} @ ₹${Number(item.unitPrice).toLocaleString('en-IN')}/${item.unit} = ₹${Number(item.lineTotal).toLocaleString('en-IN')}`;
  });

  return [
    `Dear ${lead.contactName || 'Customer'},`,
    ``,
    `Please find below our formal chemical supply quotation (${ref}) for ${lead.company || lead.title}:`,
    ``,
    ...(lines.length > 0 ? lines : [`- ${lead.title}: ₹${total.toLocaleString('en-IN')}`]),
    ``,
    `Total Quotation Value: ₹${total.toLocaleString('en-IN')}`,
    lead.creditTerms ? `Payment / Credit Terms: ${lead.creditTerms}` : '',
    ``,
    `Please let us know if you need any COA/MSDS documents or revised quantities.`,
    ``,
    `Warm regards,`,
    `3packmark Private Limited`,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');
}

export function buildQuotationHtml({
  lead,
  lineItems,
  companyName = '3packmark Private Limited',
}: {
  lead: Lead;
  lineItems: DealProductItem[];
  companyName?: string;
}): string {
  const ref = `QT-${lead.id.slice(-6).toUpperCase()}`;
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const total = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0)
    : Number(lead.value || 0);

  const rowsHtml =
    lineItems.length > 0
      ? lineItems
          .map(
            (item, idx) => `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px;">${idx + 1}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px;">
              <strong>${escapeHtml(item.name)}</strong><br/>
              <span style="color: #6B7280; font-size: 11px;">SKU: ${escapeHtml(item.sku)}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px;">
              ${item.moq} ${escapeHtml(item.unit)} + ${item.extraQuantity} ${escapeHtml(item.unit)} = <strong>${item.totalQuantity} ${escapeHtml(item.unit)}</strong>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px; text-align: right;">
              ₹${Number(item.unitPrice).toLocaleString('en-IN')} / ${escapeHtml(item.unit)}
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px; text-align: right; font-weight: bold;">
              ₹${Number(item.lineTotal).toLocaleString('en-IN')}
            </td>
          </tr>`
          )
          .join('')
      : `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px;">1</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px;"><strong>${escapeHtml(lead.title)}</strong></td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px;">As discussed</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px; text-align: right;">-</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; font-size: 12px; text-align: right; font-weight: bold;">₹${total.toLocaleString('en-IN')}</td>
          </tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Quotation ${escapeHtml(ref)} - ${escapeHtml(companyName)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #FBFAF6; color: #18181B; padding: 24px;">
  <div style="max-width: 720px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E4E0D6; border-radius: 16px; padding: 28px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #18181B; padding-bottom: 16px; margin-bottom: 20px;">
      <div>
        <h1 style="margin: 0; font-size: 20px; color: #18181B;">${escapeHtml(companyName)}</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #6B7280;">Chemical Supply Quotation (Optional Sales Order)</p>
      </div>
      <div style="text-align: right; font-size: 12px;">
        <div><strong>Quotation Ref:</strong> ${escapeHtml(ref)}</div>
        <div><strong>Date:</strong> ${escapeHtml(dateStr)}</div>
      </div>
    </div>

    <div style="background: #FAF8F2; border: 1px solid #E4E0D6; border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 12px;">
      <div><strong>To:</strong> ${escapeHtml(lead.contactName || 'Customer')} (${escapeHtml(lead.company || '-')})</div>
      ${lead.email ? `<div><strong>Email:</strong> ${escapeHtml(lead.email)}</div>` : ''}
      ${lead.phone ? `<div><strong>Phone:</strong> ${escapeHtml(lead.phone)}</div>` : ''}
      ${lead.gstTaxId ? `<div><strong>GST / Tax ID:</strong> ${escapeHtml(lead.gstTaxId)}</div>` : ''}
      ${lead.creditTerms ? `<div><strong>Credit Terms:</strong> ${escapeHtml(lead.creditTerms)}</div>` : ''}
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: #F4F1EA; text-align: left; font-size: 11px; text-transform: uppercase; color: #52525B;">
          <th style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6;">#</th>
          <th style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6;">Chemical Product</th>
          <th style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6;">MOQ + Extra = Total</th>
          <th style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; text-align: right;">Rate</th>
          <th style="padding: 10px 12px; border-bottom: 1px solid #E4E0D6; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="padding: 12px; text-align: right; font-size: 13px; font-weight: bold;">Grand Total:</td>
          <td style="padding: 12px; text-align: right; font-size: 15px; font-weight: bold; color: #18181B;">₹${total.toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>

    <p style="font-size: 11px; color: #6B7280; margin-bottom: 0;">
      Generated by ${escapeHtml(companyName)} CRM • TallyPrime Compatible Quotation Summary
    </p>
  </div>
</body>
</html>`;
}
