import { jsPDF } from 'jspdf';
import { DealProductItem, Lead, Workspace } from '@/types/crm';
import {
  CommercialOfferConfig,
  DEFAULT_3W_SELLER,
  formatTallyShortDate,
  generateVoucherNo,
  numberToIndianWords,
  resolveSellerCompanyName,
} from './commercialOfferTemplate';

function buildCommercialOfferJsPdf({
  lead,
  lineItems,
  workspace,
  config,
}: {
  lead: Lead;
  lineItems: DealProductItem[];
  workspace?: Partial<Workspace> | null;
  config: CommercialOfferConfig;
}): { doc: jsPDF; voucherNo: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
  const signLabel = workspace?.signatureName?.trim() || DEFAULT_3W_SELLER.signatureName;

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
  const amountWords = numberToIndianWords(grandTotal);

  const buyerCompany = lead.company?.trim() || lead.contactName?.trim() || 'Valued Customer';
  const buyerAddress =
    [lead.address, lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'Gujarat, India';

  const L = 12;
  const W = 186;
  const MID = L + W / 2;
  let y = 14;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('COMMERCIAL OFFER', 105, y, { align: 'center' });
  y += 4;

  // Top Header Box (Seller + Voucher Meta)
  const topBoxH = 44;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.35);
  doc.rect(L, y, W, topBoxH);
  doc.line(MID, y, MID, y + topBoxH);

  // Seller Left
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(sellerName, L + 2.5, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const addrLines = doc.splitTextToSize(sellerAddress, 88);
  doc.text(addrLines, L + 2.5, y + 9.5);
  let sy = y + 9.5 + addrLines.length * 3.5 + 1.5;
  doc.text(`GSTIN/UIN: ${sellerGstin}`, L + 2.5, sy);
  doc.text(`State Name: ${sellerState}`, L + 2.5, sy + 4);
  doc.text(`CIN: ${sellerCin}`, L + 2.5, sy + 8);
  doc.text(`Contact: ${sellerContact}`, L + 2.5, sy + 12);

  // Voucher Meta Grid Right (4 rows x 2 cols)
  const metaMid = MID + W / 4;
  doc.line(metaMid, y, metaMid, y + topBoxH);
  for (let r = 1; r <= 3; r++) {
    doc.line(MID, y + r * 11, L + W, y + r * 11);
  }
  const metaRows = [
    ['Voucher No.', voucherNo, 'Dated', dated],
    ["Buyer's Ref./Order No.", '-', 'Mode/Terms of Payment', config.paymentTerms],
    ['Dispatched through', '-', 'Other References', config.otherReferences || lead.contactName || '-'],
    ['Destination', lead.city || '-', 'Terms of Delivery', config.termsOfDelivery],
  ];
  metaRows.forEach((mr, idx) => {
    const ry = y + idx * 11;
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text(mr[0], MID + 2, ry + 4);
    doc.text(mr[2], metaMid + 2, ry + 4);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(mr[1]).slice(0, 22), MID + 2, ry + 8.5);
    doc.text(String(mr[3]).slice(0, 24), metaMid + 2, ry + 8.5);
  });

  y += topBoxH;

  // Consignee & Buyer Box
  const buyerBoxH = 24;
  doc.rect(L, y, W, buyerBoxH);
  doc.line(MID, y, MID, y + buyerBoxH);
  [L, MID].forEach((bx, i) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(i === 0 ? 'Consignee (Ship to)' : 'Buyer (Bill to)', bx + 2.5, y + 4.5);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(buyerCompany.slice(0, 42), bx + 2.5, y + 9);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    const bAddr = doc.splitTextToSize(buyerAddress, 88);
    doc.text(bAddr.slice(0, 2), bx + 2.5, y + 13);
    if (lead.gstTaxId) {
      doc.text(`GSTIN/UIN: ${lead.gstTaxId}`, bx + 2.5, y + 21);
    }
  });

  y += buyerBoxH;

  // Itemized Table Header
  const colX = [L, L + 10, L + 86, L + 108, L + 132, L + 152, L + 164, L + W];
  const headers = ['Sl', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount'];
  doc.setFillColor(246, 246, 246);
  doc.rect(L, y, W, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  headers.forEach((h, i) => {
    doc.text(h, colX[i] + 1.5, y + 5.2);
  });
  for (let i = 1; i < colX.length - 1; i++) {
    doc.line(colX[i], y, colX[i], y + 8);
  }
  y += 8;

  const tableStartY = y;
  items.forEach((item, idx) => {
    const rowH = 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(String(idx + 1), colX[0] + 2, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.text(item.name.slice(0, 42), colX[1] + 2, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    const moqTxt =
      item.extraQuantity > 0
        ? `MOQ: ${item.moq} + ${item.extraQuantity} Extra = ${item.totalQuantity} ${item.unit}`
        : `MOQ: ${item.moq} ${item.unit}`;
    doc.text(moqTxt, colX[1] + 2, y + 9);
    doc.setFontSize(7.5);
    doc.text(item.hsnCode || '38140010', colX[2] + 2, y + 4.5);
    doc.text(`${Number(item.totalQuantity).toFixed(2)} ${item.unit}`, colX[4] - 2, y + 4.5, { align: 'right' });
    doc.text(Number(item.unitPrice).toFixed(2), colX[5] - 2, y + 4.5, { align: 'right' });
    doc.text(item.unit, colX[5] + 2, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.text(Number(item.lineTotal).toFixed(2), colX[7] - 2, y + 4.5, { align: 'right' });
    y += rowH;
  });

  // Tax Rows
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  if (isGujarat) {
    doc.text('CGST ON SALES 9%', colX[2] - 2, y + 4.5, { align: 'right' });
    doc.text('9 %', colX[5] + 2, y + 4.5);
    doc.text(cgstAmt.toFixed(2), colX[7] - 2, y + 4.5, { align: 'right' });
    y += 6;
    doc.text('SGST ON SALES 9%', colX[2] - 2, y + 4.5, { align: 'right' });
    doc.text('9 %', colX[5] + 2, y + 4.5);
    doc.text(sgstAmt.toFixed(2), colX[7] - 2, y + 4.5, { align: 'right' });
    y += 7;
  } else {
    doc.text('IGST ON SALES 18%', colX[2] - 2, y + 4.5, { align: 'right' });
    doc.text('18 %', colX[5] + 2, y + 4.5);
    doc.text(igstAmt.toFixed(2), colX[7] - 2, y + 4.5, { align: 'right' });
    y += 7;
  }

  // Draw vertical grid lines & outer box for table body
  doc.rect(L, tableStartY, W, y - tableStartY);
  for (let i = 1; i < colX.length - 1; i++) {
    doc.line(colX[i], tableStartY, colX[i], y);
  }

  // Total Row
  doc.rect(L, y, W, 8);
  for (let i = 1; i < colX.length - 1; i++) {
    doc.line(colX[i], y, colX[i], y + 8);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Total', colX[2] - 2, y + 5.2, { align: 'right' });
  doc.text(`${totalQty.toFixed(2)} ${primaryUnit}`, colX[4] - 2, y + 5.2, { align: 'right' });
  doc.text(`INR ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX[7] - 2, y + 5.2, {
    align: 'right',
  });
  y += 8;

  // Amount in words
  doc.rect(L, y, W, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Amount Chargeable (in words)', L + 2.5, y + 4);
  doc.text('E. & O.E', L + W - 2.5, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(amountWords, L + 2.5, y + 8.5);
  y += 11;

  // Footer Grid: PAN & Terms (Left) | Bank & Signatory (Right)
  const footerH = 48;
  doc.rect(L, y, W, footerH);
  doc.line(MID + 8, y, MID + 8, y + footerH);
  doc.line(MID + 8, y + 20, L + W, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`Company's PAN: ${sellerPan}`, L + 2.5, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration / TERMS & CONDITIONS :-', L + 2.5, y + 10);
  doc.setFont('helvetica', 'normal');
  const termsLines = [
    '1. Exclusive: GST @ 18% as applicable.',
    `2. Payment: ${config.paymentTerms}.`,
    '3. Delivery: Within 8 to 10 days from receipt of P.O.',
    `4. Transportation: ${config.termsOfDelivery}.`,
    `5. Validity: Offer valid upto: ${validityFormatted}.`,
    `6. M.O.Q: ${items.map((i) => `${i.name} (${i.moq} ${i.unit})`).slice(0, 2).join(', ')}.`,
  ];
  termsLines.forEach((tl, idx) => {
    doc.text(tl.slice(0, 62), L + 2.5, y + 14.5 + idx * 4.5);
  });

  // Bank Details
  doc.setFont('helvetica', 'bold');
  doc.text("Company's Bank Details", MID + 10.5, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bank Name: ${bankName}`, MID + 10.5, y + 9.5);
  doc.text(`A/c No.: ${bankAccountNo}`, MID + 10.5, y + 13.5);
  doc.text(`Branch & IFS: ${bankBranchIfsc}`, MID + 10.5, y + 17.5);

  // Digital Stamp & Signatory
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`for ${sellerName}`, L + W - 2.5, y + 25, { align: 'right' });

  doc.setDrawColor(30, 58, 138);
  doc.circle(MID + 26, y + 34, 8.5, 'S');
  doc.setFontSize(5.2);
  doc.setTextColor(30, 58, 138);
  doc.text('3W PACKMARK', MID + 26, y + 32.5, { align: 'center' });
  doc.text('PVT. LTD.', MID + 26, y + 35.5, { align: 'center' });
  doc.text('VADODARA', MID + 26, y + 38.2, { align: 'center' });
  doc.setTextColor(17, 24, 39);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(signLabel, L + W - 2.5, y + 44, { align: 'right' });

  y += footerH + 6;
  doc.setFontSize(7);
  doc.text('This is a Computer Generated Document', 105, y, { align: 'center' });

  return { doc, voucherNo };
}

export function buildCommercialOfferPdfBuffer(params: {
  lead: Lead;
  lineItems: DealProductItem[];
  workspace?: Partial<Workspace> | null;
  config: CommercialOfferConfig;
}): { buffer: Buffer; voucherNo: string } {
  const { doc, voucherNo } = buildCommercialOfferJsPdf(params);
  const arrayBuf = doc.output('arraybuffer');
  return { buffer: Buffer.from(arrayBuf), voucherNo };
}

export function downloadCommercialOfferPdf(params: {
  lead: Lead;
  lineItems: DealProductItem[];
  workspace?: Partial<Workspace> | null;
  config: CommercialOfferConfig;
}): string {
  const { doc, voucherNo } = buildCommercialOfferJsPdf(params);
  doc.save(`Commercial_Offer_${voucherNo}.pdf`);
  return voucherNo;
}
