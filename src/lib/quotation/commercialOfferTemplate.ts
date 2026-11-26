import { DealProductItem, Lead, Workspace } from '@/types/crm';

export type PaymentTermOption =
  | 'Advance'
  | 'Cash on Delivery'
  | '30 Days Credit'
  | '45 Days Credit'
  | '60 Days Credit';

export type GstTypeOption = 'intra_gujarat' | 'inter_state';

export interface CommercialOfferConfig {
  paymentTerms: PaymentTermOption;
  termsOfDelivery: string;
  otherReferences: string;
  validityDate: string;
  gstType: GstTypeOption;
  voucherNo?: string;
  dated?: string;
}

export const COMMERCIAL_OFFER_TEMPLATE_ID = 'tpl-commercial-offer-3w';
export const COMMERCIAL_OFFER_TEMPLATE_NAME = 'Commercial Offer (Quotation)';

export const COMMERCIAL_OFFER_VARIABLES = [
  '{{company_name}}',
  '{{voucher_no}}',
  '{{date}}',
  '{{credit_terms}}',
  '{{delivery_terms}}',
  '{{customer_company}}',
  '{{customer_contact}}',
  '{{items_table_rows}}',
  '{{cgst_sgst_rows}}',
  '{{grand_total}}',
  '{{amount_in_words}}',
  '{{validity_date}}',
  '{{signature_block}}',
] as const;

export const DEFAULT_3W_SELLER = {
  companyName: '3W PACKMARK PRIVATE LIMITED',
  address:
    'GF-19, PARK PLAZA, BEHIND SAURABH PARK, KRUNAL CROSS ROAD, SAMTA, VADODARA - 390023, Gujarat - 390023, India',
  gstin: '24AABCZ0809J1ZE',
  stateName: 'Gujarat, Code : 24',
  cin: 'U51909GJ2017PTC097201',
  pan: 'AABCZ0809J',
  contact: '9924145081',
  bankName: 'HDFC BANK - 318',
  bankAccountNo: '50200073735318',
  bankBranchIfsc: 'KARELIBAUG & HDFC0000147',
  signatureName: 'Authorised Signatory',
};

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resolveSellerCompanyName(workspace?: Partial<Workspace> | null): string {
  const raw = workspace?.companyName?.trim() || workspace?.name?.trim() || '';
  if (!raw || raw.toLowerCase().includes('developster')) {
    return DEFAULT_3W_SELLER.companyName;
  }
  return raw;
}

export function formatTallyShortDate(dateInput?: string): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const day = String(valid.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[valid.getMonth()];
  const yr = String(valid.getFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o > 0 ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function threeDigitsToWords(n: number): string {
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${ONES[h]} Hundred`);
  if (rem > 0) parts.push(twoDigitsToWords(rem));
  return parts.join(' ');
}

export function numberToIndianWords(amount: number): string {
  const rounded = Math.round(Math.max(0, Number(amount) || 0));
  if (rounded === 0) return 'INR Zero Only';

  let n = rounded;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundreds = n;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${twoDigitsToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (hundreds > 0) parts.push(threeDigitsToWords(hundreds));

  return `INR ${parts.join(' ').replace(/\s+/g, ' ').trim()} Only`;
}

function formatPaymentClause(term: PaymentTermOption): string {
  if (term === 'Advance') return '100% Advance against Proforma/PO.';
  if (term === 'Cash on Delivery') return 'Cash / NEFT on Delivery.';
  if (term === '30 Days Credit') return '30 days from the date of invoice.';
  if (term === '45 Days Credit') return '45 days from the date of invoice.';
  if (term === '60 Days Credit') return '60 days from the date of invoice.';
  return `${term}.`;
}

function formatModeTermsBox(term: PaymentTermOption): string {
  if (term === '30 Days Credit') return '30 DAYS';
  if (term === '45 Days Credit') return '45 DAYS';
  if (term === '60 Days Credit') return '60 DAYS';
  if (term === 'Cash on Delivery') return 'COD';
  return 'ADVANCE';
}

export function generateVoucherNo(leadId: string): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const suffix = (leadId.replace(/\D/g, '').slice(-2) || '06').padStart(2, '0');
  return `${dd}${mm}${yyyy}${suffix}`;
}

export function buildDigitalSignatureBlock(
  sellerName: string,
  signatureName?: string,
  signatureImageUrl?: string
): string {
  const signLabel = signatureName?.trim() || DEFAULT_3W_SELLER.signatureName;
  const stampSvg = `
    <svg width="82" height="82" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-right:8px;">
      <circle cx="50" cy="50" r="44" fill="none" stroke="#1E3A8A" stroke-width="2.5" stroke-dasharray="3,1.5"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#1E3A8A" stroke-width="1"/>
      <text x="50" y="34" text-anchor="middle" font-family="Arial,sans-serif" font-size="8.5" font-weight="bold" fill="#1E3A8A">3W PACKMARK</text>
      <text x="50" y="52" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#1E3A8A">PVT. LTD.</text>
      <text x="50" y="68" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#1E3A8A">VADODARA</text>
    </svg>`;

  const sigGraphic = signatureImageUrl
    ? `<img src="${escapeHtml(signatureImageUrl)}" alt="Signature" style="max-height:36px;display:inline-block;vertical-align:middle;" />`
    : `<svg width="110" height="34" viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;">
        <path d="M8 28 C 22 8, 34 32, 48 16 C 58 6, 68 30, 84 18 C 96 10, 110 26, 132 14" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

  return `
    <div style="font-weight:700;font-size:10.5px;color:#111827;">for ${escapeHtml(sellerName)}</div>
    <div style="margin:6px 0 4px;">${stampSvg}${sigGraphic}</div>
    <div style="font-size:10px;font-weight:600;color:#111827;">${escapeHtml(signLabel)}</div>
  `;
}

export const DEFAULT_COMMERCIAL_OFFER_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Commercial Offer {{voucher_no}} - {{company_name}}</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:16px;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:760px;margin:0 auto;background-color:#ffffff;color:#111827;">
    <div style="font-size:12px;line-height:1.5;color:#111827;margin-bottom:14px;">
      Dear <strong>{{customer_contact}}</strong>,<br/>
      Please find below and attached our <strong>Commercial Offer #{{voucher_no}}</strong> as per your requirement.
    </div>

    <div style="text-align:center;font-size:15px;font-weight:700;letter-spacing:0.06em;margin-bottom:8px;color:#111827;">COMMERCIAL OFFER</div>

    <table width="100%" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;border:1.5px solid #111827;font-size:11px;background-color:#ffffff;color:#111827;">
      <tr>
        <td width="50%" bgcolor="#ffffff" style="width:50%;vertical-align:top;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:8px;background-color:#ffffff;color:#111827;">
          <div style="font-weight:700;font-size:12px;margin-bottom:3px;color:#111827;">{{company_name}}</div>
          <div style="line-height:1.4;font-size:10.5px;color:#111827;">{{seller_address}}</div>
          <div style="margin-top:4px;font-size:10.5px;color:#111827;">GSTIN/UIN: <strong>{{seller_gstin}}</strong></div>
          <div style="font-size:10.5px;color:#111827;">State Name: {{seller_state}}</div>
          <div style="font-size:10.5px;color:#111827;">CIN: {{seller_cin}}</div>
          <div style="font-size:10.5px;color:#111827;">Contact: {{seller_contact}}</div>
        </td>
        <td width="50%" bgcolor="#ffffff" style="width:50%;vertical-align:top;border-bottom:1px solid #111827;padding:0;background-color:#ffffff;color:#111827;">
          <table width="100%" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;font-size:10.5px;background-color:#ffffff;color:#111827;">
            <tr>
              <td width="50%" bgcolor="#ffffff" style="width:50%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Voucher No.</div>
                <div style="font-weight:700;color:#111827;">{{voucher_no}}</div>
              </td>
              <td width="50%" bgcolor="#ffffff" style="width:50%;border-bottom:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Dated</div>
                <div style="font-weight:700;color:#111827;">{{date}}</div>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Buyer's Ref./Order No.</div>
                <div style="font-weight:700;color:#111827;">&nbsp;</div>
              </td>
              <td bgcolor="#ffffff" style="border-bottom:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Mode/Terms of Payment</div>
                <div style="font-weight:700;color:#111827;">{{credit_terms}}</div>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Dispatched through</div>
                <div>&nbsp;</div>
              </td>
              <td bgcolor="#ffffff" style="border-bottom:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Other References</div>
                <div style="font-weight:700;color:#111827;">{{other_references}}</div>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Destination</div>
                <div style="color:#111827;">{{buyer_city}}</div>
              </td>
              <td bgcolor="#ffffff" style="padding:5px 7px;background-color:#ffffff;color:#111827;">
                <div style="color:#4b5563;font-size:10px;">Terms of Delivery</div>
                <div style="font-weight:700;color:#111827;">{{delivery_terms}}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td bgcolor="#ffffff" style="vertical-align:top;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:8px;background-color:#ffffff;color:#111827;">
          <div style="font-size:10px;color:#4b5563;">Consignee (Ship to)</div>
          <div style="font-weight:700;font-size:11.5px;margin-top:2px;color:#111827;">{{customer_company}}</div>
          <div style="font-size:10.5px;line-height:1.35;color:#111827;">{{buyer_address}}</div>
          {{buyer_gstin_line}}
          <div style="font-size:10.5px;color:#111827;">State Name : {{buyer_state}}</div>
        </td>
        <td bgcolor="#ffffff" style="vertical-align:top;border-bottom:1px solid #111827;padding:8px;background-color:#ffffff;color:#111827;">
          <div style="font-size:10px;color:#4b5563;">Buyer (Bill to)</div>
          <div style="font-weight:700;font-size:11.5px;margin-top:2px;color:#111827;">{{customer_company}}</div>
          <div style="font-size:10.5px;line-height:1.35;color:#111827;">{{buyer_address}}</div>
          {{buyer_gstin_line}}
          <div style="font-size:10.5px;color:#111827;">State Name : {{buyer_state}}</div>
        </td>
      </tr>

      <tr>
        <td colspan="2" bgcolor="#ffffff" style="padding:0;background-color:#ffffff;color:#111827;">
          <div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table width="100%" bgcolor="#ffffff" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;background-color:#ffffff;color:#111827;">
              <thead>
                <tr bgcolor="#f9fafb" style="background-color:#f9fafb;">
                  <th style="width:6%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:6px 4px;text-align:center;color:#111827;">Sl No.</th>
                  <th style="width:36%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:6px 8px;text-align:left;color:#111827;">Description of Goods</th>
                  <th style="width:12%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:6px 4px;text-align:center;color:#111827;">HSN/SAC</th>
                  <th style="width:13%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:6px 6px;text-align:right;color:#111827;">Quantity</th>
                  <th style="width:11%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:6px 6px;text-align:right;color:#111827;">Rate</th>
                  <th style="width:7%;border-right:1px solid #111827;border-bottom:1px solid #111827;padding:6px 4px;text-align:center;color:#111827;">per</th>
                  <th style="width:15%;border-bottom:1px solid #111827;padding:6px 8px;text-align:right;color:#111827;">Amount</th>
                </tr>
              </thead>
              <tbody>
                {{items_table_rows}}
                {{cgst_sgst_rows}}
              </tbody>
              <tfoot>
                <tr bgcolor="#fafafa" style="border-top:1px solid #111827;border-bottom:1px solid #111827;background-color:#fafafa;">
                  <td style="border-right:1px solid #111827;padding:7px 6px;color:#111827;"></td>
                  <td style="border-right:1px solid #111827;padding:7px 8px;text-align:right;font-weight:700;color:#111827;">Total</td>
                  <td style="border-right:1px solid #111827;padding:7px 6px;color:#111827;"></td>
                  <td style="border-right:1px solid #111827;padding:7px 6px;text-align:right;font-weight:700;color:#111827;">{{total_qty}}</td>
                  <td style="border-right:1px solid #111827;padding:7px 6px;color:#111827;"></td>
                  <td style="border-right:1px solid #111827;padding:7px 6px;color:#111827;"></td>
                  <td style="padding:7px 8px;text-align:right;font-weight:700;font-size:12px;color:#111827;">₹ {{grand_total}}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </td>
      </tr>

      <tr>
        <td colspan="2" bgcolor="#ffffff" style="border-bottom:1px solid #111827;padding:6px 8px;background-color:#ffffff;color:#111827;">
          <table width="100%" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="font-size:10.5px;color:#111827;">
                <span style="color:#4b5563;">Amount Chargeable (in words)</span><br/>
                <strong style="font-size:11px;color:#111827;">{{amount_in_words}}</strong>
              </td>
              <td style="text-align:right;vertical-align:top;font-size:10px;font-style:italic;color:#111827;">E. &amp; O.E</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td width="55%" bgcolor="#ffffff" style="width:55%;vertical-align:top;border-right:1px solid #111827;padding:8px;font-size:10px;line-height:1.45;background-color:#ffffff;color:#111827;">
          <div style="margin-bottom:6px;color:#111827;">Company's PAN : <strong>{{seller_pan}}</strong></div>
          <div style="font-weight:700;text-decoration:underline;margin-bottom:3px;color:#111827;">Declaration / TERMS &amp; CONDITIONS :-</div>
          <div>1. Exclusive: GST @ 18% as applicable.</div>
          <div>2. Payment: {{payment_clause}}</div>
          <div>3. Delivery: Within 8 to 10 days from receipt of P.O.</div>
          <div>4. Transportation: {{delivery_terms}}.</div>
          <div>5. Validity: Offer valid upto: {{validity_date}}.</div>
          <div>6. M.O.Q: {{moq_summary}}.</div>
        </td>
        <td width="45%" bgcolor="#ffffff" style="width:45%;vertical-align:top;padding:0;background-color:#ffffff;color:#111827;">
          <table width="100%" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;font-size:10.5px;background-color:#ffffff;color:#111827;">
            <tr>
              <td bgcolor="#ffffff" style="border-bottom:1px solid #111827;padding:7px 8px;line-height:1.45;background-color:#ffffff;color:#111827;">
                <div style="font-weight:700;text-decoration:underline;margin-bottom:2px;color:#111827;">Company's Bank Details</div>
                <div>Bank Name : <strong>{{bank_name}}</strong></div>
                <div>A/c No. : <strong>{{bank_account_no}}</strong></div>
                <div>Branch &amp; IFS Code : <strong>{{bank_branch_ifsc}}</strong></div>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" style="padding:10px 8px 8px;text-align:right;vertical-align:bottom;background-color:#ffffff;color:#111827;">
                {{signature_block}}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <div style="text-align:center;font-size:10px;color:#4b5563;margin-top:8px;">
      This is a Computer Generated Document
    </div>
  </div>
</body>
</html>`;

export function buildCommercialOfferHtml({
  lead,
  lineItems,
  workspace,
  config,
  customHtmlTemplate,
}: {
  lead: Lead;
  lineItems: DealProductItem[];
  workspace?: Partial<Workspace> | null;
  config: CommercialOfferConfig;
  customHtmlTemplate?: string;
}): { html: string; voucherNo: string; grandTotal: number; subject: string } {
  const sellerName = resolveSellerCompanyName(workspace);
  const sellerAddress = workspace?.sellerAddress?.trim() || DEFAULT_3W_SELLER.address;
  const sellerGstin = workspace?.sellerGstin?.trim() || DEFAULT_3W_SELLER.gstin;
  const sellerState = workspace?.sellerState?.trim() || DEFAULT_3W_SELLER.stateName;
  const sellerCin = workspace?.sellerCin?.trim() || DEFAULT_3W_SELLER.cin;
  const sellerPan = workspace?.sellerPan?.trim() || DEFAULT_3W_SELLER.pan;
  const sellerContact = workspace?.sellerContact?.trim() || workspace?.phone?.trim() || DEFAULT_3W_SELLER.contact;
  const bankName = workspace?.bankName?.trim() || DEFAULT_3W_SELLER.bankName;
  const bankAccountNo = workspace?.bankAccountNo?.trim() || DEFAULT_3W_SELLER.bankAccountNo;
  const bankBranchIfsc = workspace?.bankBranchIfsc?.trim() || DEFAULT_3W_SELLER.bankBranchIfsc;

  const voucherNo = config.voucherNo || generateVoucherNo(lead.id);
  const dated = config.dated || formatTallyShortDate();
  const validityFormatted = formatTallyShortDate(config.validityDate);

  const items: DealProductItem[] =
    lineItems.length > 0
      ? lineItems
      : [
          {
            productId: 'custom-1',
            sku: '3W-CHEM',
            name: lead.title || 'Chemical Supply',
            unit: 'Liters',
            moq: 1,
            extraQuantity: 0,
            totalQuantity: 1,
            unitPrice: Number(lead.value) || 0,
            lineTotal: Number(lead.value) || 0,
            hsnCode: '38140010',
          },
        ];

  const subTotal = items.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0);
  const totalQty = items.reduce((sum, it) => sum + (Number(it.totalQuantity) || 0), 0);
  const primaryUnit = items[0]?.unit || 'NOS';

  const isGujarat = config.gstType === 'intra_gujarat';
  const cgstAmt = isGujarat ? subTotal * 0.09 : 0;
  const sgstAmt = isGujarat ? subTotal * 0.09 : 0;
  const igstAmt = isGujarat ? 0 : subTotal * 0.18;
  const grandTotal = Math.round((subTotal + cgstAmt + sgstAmt + igstAmt) * 100) / 100;
  const amountInWords = numberToIndianWords(grandTotal);

  const buyerCompany = lead.company?.trim() || lead.contactName?.trim() || 'Valued Customer';
  const buyerContact = lead.contactName?.trim() || buyerCompany;
  const buyerAddress = [lead.address, lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'Gujarat, India';
  const buyerStateText = lead.state?.trim()
    ? `${lead.state}${lead.state.toLowerCase().includes('gujarat') ? ', Code : 24' : ''}`
    : 'Gujarat, Code : 24';

  const moqSummary = items
    .map((i) => `${i.name}: ${i.moq} ${i.unit}`)
    .slice(0, 3)
    .join('; ');

  const itemRowsHtml = items
    .map((item, idx) => {
      const hsn = item.hsnCode || '38140010';
      const qtyDisplay = `${Number(item.totalQuantity).toFixed(2)} ${item.unit}`;
      const rateDisplay = Number(item.unitPrice).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const amtDisplay = Number(item.lineTotal).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const moqLine =
        item.extraQuantity > 0
          ? `MOQ: ${item.moq} + ${item.extraQuantity} Extra = ${item.totalQuantity} ${item.unit}`
          : `MOQ: ${item.moq} ${item.unit}`;

      return `
        <tr>
          <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #d1d5db;padding:6px 4px;text-align:center;vertical-align:top;font-size:11px;background-color:#ffffff;color:#111827;">${idx + 1}</td>
          <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #d1d5db;padding:6px 8px;vertical-align:top;font-size:11px;background-color:#ffffff;color:#111827;word-wrap:break-word;">
            <div style="font-weight:700;color:#111827;">${escapeHtml(item.name)}</div>
            ${item.sku ? `<div style="font-size:10px;color:#4b5563;">SKU: ${escapeHtml(item.sku)}</div>` : ''}
            <div style="font-size:10px;color:#374151;font-style:italic;margin-top:2px;">${escapeHtml(moqLine)}</div>
          </td>
          <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #d1d5db;padding:6px 4px;text-align:center;vertical-align:top;font-size:11px;background-color:#ffffff;color:#111827;">${escapeHtml(hsn)}</td>
          <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #d1d5db;padding:6px 6px;text-align:right;vertical-align:top;font-size:11px;font-weight:700;background-color:#ffffff;color:#111827;">${escapeHtml(qtyDisplay)}</td>
          <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #d1d5db;padding:6px 6px;text-align:right;vertical-align:top;font-size:11px;background-color:#ffffff;color:#111827;">${escapeHtml(rateDisplay)}</td>
          <td bgcolor="#ffffff" style="border-right:1px solid #111827;border-bottom:1px solid #d1d5db;padding:6px 4px;text-align:center;vertical-align:top;font-size:11px;background-color:#ffffff;color:#111827;">${escapeHtml(item.unit)}</td>
          <td bgcolor="#ffffff" style="border-bottom:1px solid #d1d5db;padding:6px 8px;text-align:right;vertical-align:top;font-size:11px;font-weight:700;background-color:#ffffff;color:#111827;">${escapeHtml(amtDisplay)}</td>
        </tr>`;
    })
    .join('');

  const taxRowsHtml = isGujarat
    ? `
      <tr>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 8px;text-align:right;font-size:11px;font-weight:700;font-style:italic;background-color:#ffffff;color:#111827;">CGST ON SALES 9%</td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 6px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 6px;text-align:right;font-size:11px;background-color:#ffffff;color:#111827;">9</td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;text-align:center;font-size:11px;background-color:#ffffff;color:#111827;">%</td>
        <td bgcolor="#ffffff" style="padding:4px 8px;text-align:right;font-size:11px;font-weight:700;background-color:#ffffff;color:#111827;">${cgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 8px;text-align:right;font-size:11px;font-weight:700;font-style:italic;background-color:#ffffff;color:#111827;">SGST ON SALES 9%</td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 6px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 6px;text-align:right;font-size:11px;background-color:#ffffff;color:#111827;">9</td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;text-align:center;font-size:11px;background-color:#ffffff;color:#111827;">%</td>
        <td bgcolor="#ffffff" style="padding:4px 8px;text-align:right;font-size:11px;font-weight:700;background-color:#ffffff;color:#111827;">${sgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`
    : `
      <tr>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 8px;text-align:right;font-size:11px;font-weight:700;font-style:italic;background-color:#ffffff;color:#111827;">IGST ON SALES 18%</td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 6px;background-color:#ffffff;color:#111827;"></td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 6px;text-align:right;font-size:11px;background-color:#ffffff;color:#111827;">18</td>
        <td bgcolor="#ffffff" style="border-right:1px solid #111827;padding:4px 4px;text-align:center;font-size:11px;background-color:#ffffff;color:#111827;">%</td>
        <td bgcolor="#ffffff" style="padding:4px 8px;text-align:right;font-size:11px;font-weight:700;background-color:#ffffff;color:#111827;">${igstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`;

  const signatureBlock = buildDigitalSignatureBlock(
    sellerName,
    workspace?.signatureName,
    workspace?.signatureImageUrl
  );

  const templateSource =
    customHtmlTemplate && customHtmlTemplate.trim().length > 40
      ? customHtmlTemplate
      : DEFAULT_COMMERCIAL_OFFER_HTML_TEMPLATE;

  const grandTotalFormatted = grandTotal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const replacements: Record<string, string> = {
    '{{company_name}}': escapeHtml(sellerName),
    '{{seller_address}}': escapeHtml(sellerAddress),
    '{{seller_gstin}}': escapeHtml(sellerGstin),
    '{{seller_state}}': escapeHtml(sellerState),
    '{{seller_cin}}': escapeHtml(sellerCin),
    '{{seller_contact}}': escapeHtml(sellerContact),
    '{{seller_pan}}': escapeHtml(sellerPan),
    '{{bank_name}}': escapeHtml(bankName),
    '{{bank_account_no}}': escapeHtml(bankAccountNo),
    '{{bank_branch_ifsc}}': escapeHtml(bankBranchIfsc),
    '{{voucher_no}}': escapeHtml(voucherNo),
    '{{date}}': escapeHtml(dated),
    '{{credit_terms}}': escapeHtml(formatModeTermsBox(config.paymentTerms)),
    '{{payment_clause}}': escapeHtml(formatPaymentClause(config.paymentTerms)),
    '{{delivery_terms}}': escapeHtml(config.termsOfDelivery),
    '{{other_references}}': escapeHtml(config.otherReferences || buyerContact),
    '{{customer_company}}': escapeHtml(buyerCompany),
    '{{customer_contact}}': escapeHtml(buyerContact),
    '{{buyer_city}}': escapeHtml(lead.city || ''),
    '{{buyer_address}}': escapeHtml(buyerAddress),
    '{{buyer_state}}': escapeHtml(buyerStateText),
    '{{buyer_gstin_line}}': lead.gstTaxId
      ? `<div style="font-size:10.5px;margin-top:2px;color:#111827;">GSTIN/UIN: ${escapeHtml(lead.gstTaxId)}</div>`
      : '',
    '{{items_table_rows}}': itemRowsHtml,
    '{{cgst_sgst_rows}}': taxRowsHtml,
    '{{total_qty}}': `${totalQty.toFixed(2)} ${escapeHtml(primaryUnit)}`,
    '{{grand_total}}': escapeHtml(grandTotalFormatted),
    '{{amount_in_words}}': escapeHtml(amountInWords),
    '{{validity_date}}': escapeHtml(validityFormatted),
    '{{moq_summary}}': escapeHtml(moqSummary || 'As per quotation'),
    '{{signature_block}}': signatureBlock,
  };

  let renderedHtml = templateSource;
  for (const [token, val] of Object.entries(replacements)) {
    renderedHtml = renderedHtml.split(token).join(val);
  }

  const subject = `Commercial Offer #${voucherNo} — Quotation from ${sellerName} (${buyerCompany})`;

  return { html: renderedHtml, voucherNo, grandTotal, subject };
}
