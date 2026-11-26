import { DealProductItem, Lead, Workspace } from '@/types/crm';

function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTallyDate(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const yyyy = valid.getFullYear();
  const mm = String(valid.getMonth() + 1).padStart(2, '0');
  const dd = String(valid.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export interface TallyQuotationBuildOptions {
  lead: Lead;
  workspace: Workspace;
  voucherDate?: string;
  referenceNo?: string;
}

/**
 * Converts a CRM Lead and its attached chemical `lineItems` into a valid
 * TallyPrime Import XML Optional Sales Order Voucher (printed as Quotation in TallyPrime).
 */
export function buildTallyQuotationXml({
  lead,
  workspace,
  voucherDate,
  referenceNo,
}: TallyQuotationBuildOptions): string {
  const companyName = workspace.tallyCompanyName?.trim() || workspace.companyName || '3packmark Private Limited';
  const salesLedger = workspace.tallySalesLedger?.trim() || 'Sales Accounts';
  const partyName = lead.company?.trim() || lead.contactName?.trim() || 'Cash Customer';
  const tallyDate = formatTallyDate(voucherDate);
  const ref = referenceNo || `QT-${lead.id.slice(-6).toUpperCase()}`;

  const items: DealProductItem[] = Array.isArray(lead.lineItems) && lead.lineItems.length > 0
    ? lead.lineItems
    : Array.isArray(lead.products)
    ? lead.products
    : [];

  const totalAmount = items.length > 0
    ? items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0)
    : Number(lead.value) || 0;

  const inventoryXml = items
    .map((item) => {
      const qtyStr = `${item.totalQuantity} ${item.unit}`;
      const rateStr = `${Number(item.unitPrice).toFixed(2)}/${item.unit}`;
      const amtStr = Number(item.lineTotal).toFixed(2);
      const itemLabel = item.sku ? `${item.name} (${item.sku})` : item.name;
      return `          <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${escapeXml(itemLabel)}</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <RATE>${escapeXml(rateStr)}</RATE>
            <AMOUNT>${escapeXml(amtStr)}</AMOUNT>
            <ACTUALQTY>${escapeXml(qtyStr)}</ACTUALQTY>
            <BILLEDQTY>${escapeXml(qtyStr)}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>Main Location</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <ORDERNO>${escapeXml(ref)}</ORDERNO>
              <AMOUNT>${escapeXml(amtStr)}</AMOUNT>
              <ACTUALQTY>${escapeXml(qtyStr)}</ACTUALQTY>
              <BILLEDQTY>${escapeXml(qtyStr)}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>
            <ACCOUNTINGALLOCATIONS.LIST>
              <LEDGERNAME>${escapeXml(salesLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${escapeXml(amtStr)}</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
          </ALLINVENTORYENTRIES.LIST>`;
    })
    .join('\n');

  const narration = `CRM Quotation ${ref} for ${partyName} (${lead.contactName || ''}) | ${items.length} chemical items`;

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales Order" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${escapeXml(tallyDate)}</DATE>
            <VOUCHERTYPENAME>Sales Order</VOUCHERTYPENAME>
            <ISOPTIONAL>Yes</ISOPTIONAL>
            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
            <BASICBASEPARTYNAME>${escapeXml(partyName)}</BASICBASEPARTYNAME>
            <REFERENCE>${escapeXml(ref)}</REFERENCE>
            <NARRATION>${escapeXml(narration)}</NARRATION>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(partyName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-${totalAmount.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
${inventoryXml}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
