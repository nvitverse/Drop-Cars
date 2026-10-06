import { Platform, Linking, Alert } from 'react-native';
import { formatPhoneForWhatsApp, sendWhatsAppMessage } from './whatsappTemplates';

export interface InvoiceData {
  invoiceNumber: string;
  date?: string;
  brandName?: string;
  brandPhone?: string;
  gstNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  customerCompany?: string;
  customerAddress?: string;
  driverName?: string;
  driverPhone?: string;
  cabName?: string;
  cabNumber?: string;
  pickup: string;
  dropLocation: string;
  pickupDate?: string;
  pickupTime?: string;
  travelDate?: string;
  vehicleType?: string;
  tripType?: string;
  distanceKm?: number | string;
  ratePerKm?: number | string;
  baseFare?: number;
  driverBata?: number;
  tollCharges?: number;
  permitCharges?: number;
  parkingCharges?: number;
  stateTax?: number;
  waitingCharges?: number;
  hillsCharges?: number;
  nightCharges?: number;
  extraCharges?: number;
  discountAmount?: number;
  advancePaid?: number;
  includeGst?: boolean;
  gstPercent?: number;
  gstAmount?: number;
  isInterstate?: boolean;
  igstAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  startingKm?: number | string;
  closingKm?: number | string;
  paymentMode?: string;
  hsnSacCode?: string;
  receivedText?: string;
  notes?: string;
  isCompleted?: boolean;
  upiId?: string;
  reviewToken?: string;
}

export function generateQuotationText(data: InvoiceData): string {
  const baseFare = Number(data.baseFare) || 0;
  const bata = Number(data.driverBata) || 0;
  const toll = Number(data.tollCharges) || 0;
  const parking = Number(data.parkingCharges) || 0;
  const stateTax = Number(data.stateTax) || Number(data.permitCharges) || 0;
  const hills = Number(data.hillsCharges) || 0;
  const extra = Number(data.extraCharges) || 0;
  const discount = Number(data.discountAmount) || 0;
  const gst = Number(data.gstAmount) || 0;
  const total = Math.max(0, baseFare + bata + toll + parking + stateTax + hills + extra + gst - discount);
  const advance = Number(data.advancePaid) || Math.round(total * 0.2);
  const balance = Math.max(0, total - advance);
  const brand = data.brandName || 'Drop Cars';
  const brandPhone = data.brandPhone || '7200217986';

  const breakdownLines: string[] = [`• Base Trip Fare: ₹${baseFare.toLocaleString('en-IN')}`];
  if (bata > 0) breakdownLines.push(`• Driver Day Bata: ₹${bata.toLocaleString('en-IN')} (Included)`);
  if (toll > 0) breakdownLines.push(`• Highway Tolls: ₹${toll.toLocaleString('en-IN')} (Included in Package)`);
  if (stateTax > 0) breakdownLines.push(`• State Entry Permit Tax: ₹${stateTax.toLocaleString('en-IN')} (Included)`);
  if (hills > 0) breakdownLines.push(`• Hill / Ghat Road Charges: ₹${hills.toLocaleString('en-IN')} (Included)`);
  if (extra > 0) breakdownLines.push(`• Extra Allowances: ₹${extra.toLocaleString('en-IN')}`);
  if (gst > 0) breakdownLines.push(`• GST (5%): ₹${gst.toLocaleString('en-IN')}`);
  if (discount > 0) breakdownLines.push(`• Special Negotiated Discount: -₹${discount.toLocaleString('en-IN')}`);

  const inclusions: string[] = ['Dedicated Cab', 'Fuel Charges', 'Chauffeur Allowance'];
  if (toll > 0) inclusions.push(`Highway Tolls (₹${toll})`);
  if (stateTax > 0) inclusions.push(`Inter-State Permit (₹${stateTax})`);
  if (hills > 0) inclusions.push(`Hill Section Charges (₹${hills})`);

  const exclusions: string[] = [];
  if (toll === 0) exclusions.push('Highway Tolls (Fastag as per actuals)');
  if (stateTax === 0 && data.isInterstate) exclusions.push('Inter-State Permit (as per border checkpost receipt)');
  if (parking === 0) exclusions.push('Parking / Airport Entry (as per actual receipt)');

  return `🚗 *${brand.toUpperCase()} - OFFICIAL TRIP ESTIMATE & QUOTATION*
Reference: *EST-${data.invoiceNumber}*
Date: ${data.date || new Date().toLocaleDateString('en-IN')}

👤 *Customer Details:*
• Name: ${data.customerName || 'Valued Customer'}
• Contact: ${data.customerPhone || 'N/A'}

📍 *Journey Information:*
• Route: ${data.pickup} ➔ ${data.dropLocation}
• Trip Type: ${data.tripType || 'One Way'}
• Vehicle Category: ${data.vehicleType || 'Sedan'}
${data.distanceKm ? `• Estimated Distance: ~${data.distanceKm} KM\n` : ''}
💰 *Fare Breakdown:*
${breakdownLines.join('\n')}
----------------------------------------
*TOTAL ALL-INCLUSIVE ESTIMATE: ₹${total.toLocaleString('en-IN')}*
• 20% Booking Advance: ₹${advance.toLocaleString('en-IN')}
• Balance Payable on Trip: ₹${balance.toLocaleString('en-IN')}
----------------------------------------

✅ *Included:* ${inclusions.join(', ')}.
${exclusions.length > 0 ? `ℹ️ *Excluded (If applicable):* ${exclusions.join(', ')}.\n` : ''}
${data.notes ? `📝 *Special Notes:* ${data.notes}\n` : ''}
🔗 *Confirm & Reserve Online:*
https://dropcars.in/pay-advance/${data.invoiceNumber}

📞 24/7 Helpline: ${brandPhone} | ${brand} Mobility
Thank you for choosing ${brand}!`;
}

export async function shareQuotationViaWhatsApp(data: InvoiceData) {
  const text = generateQuotationText(data);
  const targetPhone = formatPhoneForWhatsApp(data.customerPhone);
  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported || Platform.OS === 'web') {
      await Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp Error', 'WhatsApp app is not installed on this device.');
    }
  } catch (e) {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Alert.alert('Sharing Error', 'Unable to launch WhatsApp.');
    }
  }
}

export async function shareQuotationViaEmail(data: InvoiceData) {
  const brand = data.brandName || 'Drop Cars';
  const subject = `${brand} Fare Estimation EST-${data.invoiceNumber} for ${data.customerName || 'Customer'}`;
  const body = generateQuotationText(data);
  const email = data.customerEmail || '';
  const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    const supported = await Linking.canOpenURL(mailtoUrl);
    if (supported || Platform.OS === 'web') {
      await Linking.openURL(mailtoUrl);
    } else {
      Alert.alert('Email Error', 'Default mail client is not configured.');
    }
  } catch (e) {
    if (Platform.OS === 'web') {
      window.open(mailtoUrl, '_blank');
    } else {
      Alert.alert('Sharing Error', 'Unable to launch Email client.');
    }
  }
}

export function generateInvoiceHtml(data: InvoiceData): string {
  const brand = data.brandName || 'Drop Cars';
  const brandPhone = data.brandPhone || '7200217986';
  const bid = String(data.invoiceNumber).replace(/^#/, '');
  const invoiceDate = data.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const gstin = data.gstNumber || 'GSTIN: 33AAACM9876A1Z4';

  const baseFare = Number(data.baseFare) || 0;
  const bata = Number(data.driverBata) || 0;
  const toll = Number(data.tollCharges) || 0;
  const permit = Number(data.permitCharges) || Number(data.stateTax) || 0;
  const parking = Number(data.parkingCharges) || 0;
  const waiting = Number(data.waitingCharges) || 0;
  const hills = Number(data.hillsCharges) || 0;
  const night = Number(data.nightCharges) || 0;
  const extra = Number(data.extraCharges) || 0;
  const discount = Number(data.discountAmount) || 0;

  const subtotalBeforeGst = Math.max(0, baseFare + bata + toll + permit + parking + waiting + hills + night + extra - discount);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalGst = 0;
  const isInterstate = Boolean(data.isInterstate);
  if (data.includeGst) {
    const rate = Number(data.gstPercent) || 5;
    totalGst = data.gstAmount ? Number(data.gstAmount) : Math.round(baseFare * (rate / 100) * 100) / 100;
    if (isInterstate) {
      igst = totalGst;
    } else {
      cgst = Math.round((totalGst / 2) * 100) / 100;
      sgst = Math.round((totalGst / 2) * 100) / 100;
    }
  }

  const grandTotal = Math.round(subtotalBeforeGst + totalGst);
  const advance = Number(data.advancePaid) || 0;
  const balanceDue = Math.max(0, grandTotal - advance);
  const receivedText = data.receivedText || (balanceDue === 0 ? 'PAID IN FULL' : `BALANCE DUE: ₹${balanceDue.toLocaleString('en-IN')}`);

  // Dynamic QR Code for UPI or Review
  const upiId = data.upiId || '7200217986-1@okbizaxis';
  const upiPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(brand)}&am=${balanceDue}&tn=INV-${bid}`;
  const reviewUrl = `https://dropcars.in/review/${data.reviewToken || bid}`;
  const qrData = balanceDue > 0 ? upiPayload : reviewUrl;
  const qrLabel = balanceDue > 0 ? 'Scan to Pay Balance via UPI' : 'Scan to Rate Driver & Service';
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=4&data=${encodeURIComponent(qrData)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invoice #${bid} - ${brand}</title>
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --secondary: #0b192c;
      --secondary-light: #1e3a8a;
      --accent: #2563eb;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #cbd5e1;
      --card-bg: #f8fafc;
    }
    html, body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: var(--text-main);
      background: #f1f5f9;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-wrap { max-width: 820px; margin: 24px auto; padding: 0 16px; }
    .screen-toolbar {
      display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 16px;
    }
    .btn-action {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px; font-size: 13px; font-weight: 700; border-radius: 8px;
      border: none; cursor: pointer; color: #fff; text-decoration: none;
      box-shadow: 0 2px 6px rgba(11, 25, 44, 0.15);
    }
    .btn-print { background: var(--secondary); }
    .btn-wa { background: #25D366; }
    .btn-action:hover { opacity: 0.92; }
    
    .invoice-sheet {
      background: #fff; border: 1px solid var(--border-color); border-radius: 14px;
      padding: 2.5rem; box-shadow: 0 8px 28px rgba(11, 25, 44, 0.07); min-height: 950px;
    }
    .invoice-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #e2e8f0; padding-bottom: 1.4rem; margin-bottom: 1.4rem;
    }
    .brand-block { max-width: 60%; }
    .brand-title {
      font-size: 2.2rem; font-weight: 900; color: var(--secondary); margin: 0;
      letter-spacing: -0.03em; line-height: 1.05;
    }
    .brand-title span { color: var(--primary); }
    .brand-tagline {
      margin: 0.4rem 0 0; font-size: 0.78rem; color: var(--text-muted); font-weight: 600;
    }
    .invoice-id-block { text-align: right; }
    .invoice-id-block h1 {
      margin: 0; font-size: 2.4rem; color: var(--secondary); font-weight: 900;
      letter-spacing: -0.02em; line-height: 1;
    }
    .invoice-sub { margin: 0.35rem 0 0; font-size: 0.78rem; font-weight: 800; color: #475569; }
    .invoice-badge {
      display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;
      font-size: 0.7rem; font-weight: 800; padding: 3px 10px; border-radius: 6px; margin-top: 6px;
      letter-spacing: 0.5px;
    }
    
    .bill-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; margin-bottom: 1.25rem;
    }
    .info-group {
      border: 1px solid #cbd5e1; border-radius: 9px; overflow: hidden; background: #fff;
    }
    .info-group h4 {
      margin: 0; padding: 0.5rem 0.85rem; font-size: 0.74rem; text-transform: uppercase;
      color: #fff; background: var(--secondary); letter-spacing: 0.05em; font-weight: 800;
    }
    .info-group p {
      margin: 0; padding: 0.42rem 0.85rem; font-size: 0.83rem; border-top: 1px solid #f1f5f9; line-height: 1.45;
    }
    .info-group p strong { color: var(--secondary); font-size: 0.84rem; }
    
    .trip-table-wrap {
      border: 1px solid #cbd5e1; border-radius: 9px; overflow: hidden; margin-bottom: 1.25rem;
    }
    .trip-table-title {
      margin: 0; padding: 0.5rem 0.85rem; font-size: 0.74rem; text-transform: uppercase;
      color: #fff; background: var(--secondary-light); letter-spacing: 0.05em; font-weight: 800;
    }
    .trip-table { width: 100%; border-collapse: collapse; }
    .trip-table th, .trip-table td {
      font-size: 0.83rem; padding: 0.48rem 0.85rem; border-top: 1px solid #f1f5f9; vertical-align: top;
    }
    .trip-table th { width: 26%; text-align: left; color: #475569; font-weight: 700; background: #f8fafc; }
    .trip-table td { color: var(--secondary); font-weight: 600; }
    
    .charge-table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
    .charge-table th {
      text-align: left; padding: 0.7rem 0.75rem; border-bottom: 2px solid var(--secondary);
      background: #f1f5f9; font-size: 0.76rem; text-transform: uppercase; color: var(--secondary); font-weight: 800; letter-spacing: 0.04em;
    }
    .charge-table td {
      padding: 0.58rem 0.75rem; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;
    }
    .text-right { text-align: right; }
    
    .invoice-footer-grid {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; margin-top: 1rem;
    }
    .qr-box {
      border: 1px solid #e2e8f0; background: var(--card-bg); padding: 14px; border-radius: 10px;
      text-align: center; width: 140px;
    }
    .qr-box img { width: 105px; height: 105px; display: block; margin: 0 auto; border-radius: 6px; }
    .qr-box p { font-size: 0.65rem; color: #64748b; font-weight: 700; margin: 6px 0 0; line-height: 1.25; }
    
    .totals-box { width: 330px; margin-left: auto; }
    .total-row { display: flex; justify-content: space-between; padding: 0.38rem 0; font-size: 0.85rem; }
    .total-row.grand {
      border-top: 2px solid var(--secondary); margin-top: 0.5rem; padding-top: 0.85rem;
      font-size: 1.15rem; font-weight: 900; color: var(--secondary);
    }
    .total-row.grand span:last-child { font-size: 1.45rem; letter-spacing: -0.02em; color: var(--primary-dark); }
    
    .received-highlight {
      background: #f0fdf4; color: #166534; padding: 0.8rem 1rem; border-radius: 8px;
      margin-top: 0.85rem; border: 1px solid #bbf7d0; display: flex;
      justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;
    }
    .received-highlight span:last-child { font-size: 1.15rem; color: #15803d; }
    
    .terms-section {
      margin-top: 2.2rem; border-top: 1px solid #e2e8f0; padding-top: 1.2rem;
      display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;
    }
    .terms-section h5 { margin: 0 0 0.45rem; font-size: 0.75rem; color: var(--secondary); text-transform: uppercase; font-weight: 800; }
    .terms-section ul { padding: 0 0 0 14px; margin: 0; font-size: 0.72rem; color: #64748b; line-height: 1.5; }
    .terms-section li { margin-bottom: 3px; }
    .sig-block { text-align: right; }
    .sig-line {
      border-top: 1.5px solid #0b192c; width: 170px; margin-left: auto; margin-top: 2.5rem;
      padding-top: 0.4rem; font-size: 0.75rem; font-weight: 800; color: var(--secondary);
    }

    @media print {
      body { background: #fff !important; }
      .screen-toolbar { display: none !important; }
      .invoice-wrap { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
      .invoice-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
      @page { margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class="invoice-wrap">
    <div class="screen-toolbar">
      <button type="button" class="btn-action btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
      <a href="https://api.whatsapp.com/send?phone=${formatPhoneForWhatsApp(data.customerPhone)}&text=${encodeURIComponent(generateQuotationText(data))}" target="_blank" class="btn-action btn-wa">💬 Share via WhatsApp</a>
    </div>

    <div class="invoice-sheet">
      <div class="invoice-header">
        <div class="brand-block">
          <div class="brand-title">Drop <span>Cars</span></div>
          <p class="brand-tagline">Premium Outstation & One-Way Taxi Network · 24/7 Helpline: ${brandPhone}</p>
        </div>
        <div class="invoice-id-block">
          <h1>INVOICE</h1>
          <div class="invoice-sub">#DC-${bid} · ${invoiceDate}</div>
          <div class="invoice-sub">${gstin} · SAC: 9966</div>
          <div class="invoice-badge">✓ TRIP COMPLETED</div>
        </div>
      </div>

      <div class="bill-grid">
        <div class="info-group">
          <h4>Driver & Vehicle Particulars</h4>
          <p><strong>Vehicle:</strong> ${data.cabName || data.vehicleType || 'Sedan'} ${data.cabNumber ? '(' + data.cabNumber + ')' : ''}</p>
          <p><strong>Driver:</strong> ${data.driverName || 'Drop Cars Fleet Driver'}</p>
          <p><strong>Contact:</strong> ${data.driverPhone || '7200217986'}</p>
          ${data.startingKm ? `<p><strong>Odometer:</strong> ${data.startingKm} KM ➔ ${data.closingKm || ''} KM</p>` : ''}
          ${data.paymentMode ? `<p><strong>Payment Mode:</strong> ${data.paymentMode}</p>` : ''}
        </div>
        <div class="info-group">
          <h4>Billed Customer / Corporate</h4>
          <p><strong>Customer:</strong> ${data.customerName || 'Valued Customer'}</p>
          <p><strong>Phone:</strong> ${data.customerPhone || 'N/A'}</p>
          ${data.customerEmail ? `<p><strong>Email:</strong> ${data.customerEmail}</p>` : ''}
          ${data.customerCompany ? `<p><strong>Company:</strong> ${data.customerCompany}</p>` : ''}
          ${data.customerGstin ? `<p><strong>GSTIN:</strong> <b>${data.customerGstin}</b></p>` : ''}
          <p><strong>Booking Ref:</strong> #DC-${bid}</p>
        </div>
      </div>

      <div class="trip-table-wrap">
        <p class="trip-table-title">Trip Itinerary & Details</p>
        <table class="trip-table">
          <tbody>
            <tr>
              <th>Trip Type</th>
              <td>${data.tripType || 'One-Way Outstation'}</td>
            </tr>
            <tr>
              <th>From (Pickup)</th>
              <td>${data.pickup}</td>
            </tr>
            <tr>
              <th>To (Destination)</th>
              <td>${data.dropLocation}</td>
            </tr>
            <tr>
              <th>Pickup Date & Time</th>
              <td>${data.pickupDate || data.travelDate || invoiceDate} at ${data.pickupTime || 'Scheduled Time'}</td>
            </tr>
            <tr>
              <th>Billed Distance</th>
              <td>${data.distanceKm ? `${data.distanceKm} KM ${data.ratePerKm ? '(@ ₹' + data.ratePerKm + '/KM)' : ''}` : 'As per route'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <table class="charge-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Base Trip Fare (Pure KM Running Allowance)</td>
            <td class="text-right">₹${baseFare.toLocaleString('en-IN')}</td>
          </tr>
          ${bata > 0 ? `<tr><td>Driver Bata / Allowance</td><td class="text-right">₹${bata.toLocaleString('en-IN')}</td></tr>` : ''}
          ${toll > 0 ? `<tr><td>Toll Plaza Charges (Fastag / Actuals)</td><td class="text-right">₹${toll.toLocaleString('en-IN')}</td></tr>` : ''}
          ${permit > 0 ? `<tr><td>Inter-State Entry Permit Tax</td><td class="text-right">₹${permit.toLocaleString('en-IN')}</td></tr>` : ''}
          ${parking > 0 ? `<tr><td>Parking & Airport Terminal Charges</td><td class="text-right">₹${parking.toLocaleString('en-IN')}</td></tr>` : ''}
          ${hills > 0 ? `<tr><td>Hill Station / Ghat Road Allowance</td><td class="text-right">₹${hills.toLocaleString('en-IN')}</td></tr>` : ''}
          ${waiting > 0 ? `<tr><td>Waiting / Halting Charges</td><td class="text-right">₹${waiting.toLocaleString('en-IN')}</td></tr>` : ''}
          ${night > 0 ? `<tr><td>Night Travel Allowance (10:00 PM - 5:00 AM)</td><td class="text-right">₹${night.toLocaleString('en-IN')}</td></tr>` : ''}
          ${extra > 0 ? `<tr><td>Extra KM / Time Charges</td><td class="text-right">₹${extra.toLocaleString('en-IN')}</td></tr>` : ''}
          ${discount > 0 ? `<tr style="color: #dc2626;"><td>Special Discount / Promo Code Applied</td><td class="text-right">-₹${discount.toLocaleString('en-IN')}</td></tr>` : ''}
          ${totalGst > 0 ? (
            isInterstate ? `
              <tr><td><b>IGST (5.0%)</b> - Interstate Passenger Transport</td><td class="text-right">₹${igst.toLocaleString('en-IN')}</td></tr>
            ` : `
              <tr><td>CGST (2.5% - SAC ${data.hsnSacCode || '9966'} Passenger Transport)</td><td class="text-right">₹${cgst.toLocaleString('en-IN')}</td></tr>
              <tr><td>SGST (2.5% - SAC ${data.hsnSacCode || '9966'} Passenger Transport)</td><td class="text-right">₹${sgst.toLocaleString('en-IN')}</td></tr>
            `
          ) : ''}
        </tbody>
      </table>

      <div class="invoice-footer-grid">
        <div class="qr-box">
          <img src="${qrApiUrl}" alt="QR Code">
          <p>${qrLabel}</p>
        </div>

        <div class="totals-box">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>₹${subtotalBeforeGst.toLocaleString('en-IN')}</span>
          </div>
          ${totalGst > 0 ? `
            <div class="total-row">
              <span>GST (5.0%):</span>
              <span>₹${totalGst.toLocaleString('en-IN')}</span>
            </div>
          ` : ''}
          <div class="total-row grand">
            <span>GRAND TOTAL:</span>
            <span>₹${grandTotal.toLocaleString('en-IN')}</span>
          </div>
          ${advance > 0 ? `
            <div class="total-row" style="color: #166534; font-weight: 700; margin-top: 4px;">
              <span>Less: Advance Received:</span>
              <span>-₹${advance.toLocaleString('en-IN')}</span>
            </div>
          ` : ''}
          <div class="received-highlight">
            <span>SETTLEMENT STATUS:</span>
            <span>${receivedText}</span>
          </div>
        </div>
      </div>

      <div class="terms-section">
        <div>
          <h5>Terms & Conditions</h5>
          <ul>
            <li>Tolls, parking, and state permit charges are billed at actuals as per National Highway Fastag logs and physical receipts unless inclusive.</li>
            <li>Ghat Road & Hill Section: A standard operational allowance of ₹300 for One-Way or ₹500 for Round Trip applies to hill sectors (e.g., Ooty, Kodaikanal, Yercaud, Valparai, Yelagiri) for ghat driving conditions and safety compliance. Air-conditioning is regulated on steep climbs.</li>
            <li>Cab fulfillment is scheduled based on regional demand and vehicle availability. In the rare event of vehicle non-dispatch by the platform, 100% advance deposit is immediately refunded in full.</li>
            <li>For any queries, billing clarification, or feedback, contact 24/7 customer support at ${brandPhone}.</li>
          </ul>
        </div>
        <div class="sig-block">
          <div class="sig-line">Authorized Signatory</div>
          <p style="font-size: 0.65rem; color: #64748b; margin: 4px 0 0;">${brand} Fleet Operations</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printOrDownloadInvoice(data: InvoiceData) {
  const html = generateInvoiceHtml(data);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    let handled = false;
    try {
      const printWindow = window.open('', '_blank');
      if (printWindow && !printWindow.closed) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          try { printWindow.print(); } catch { }
        }, 400);
        handled = true;
      }
    } catch { }

    // Fallback if popup blocker blocked window.open: download as HTML file
    if (!handled) {
      try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DropCars_Invoice_${String(data.invoiceNumber).replace(/[\/#\s]/g, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch {
        Alert.alert('Invoice', 'Could not open print window. Please allow popups.');
      }
    }
  } else {
    // Mobile environment fallback
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    Linking.openURL(dataUrl).catch(() => {
      Alert.alert('Invoice Formatted', `Invoice #${data.invoiceNumber} formatted for WhatsApp sharing & print.`);
    });
  }
}

export function generateEstimationHtml(data: InvoiceData): string {
  const brand = data.brandName || 'Drop Cars';
  const brandPhone = data.brandPhone || '7200217986';
  const bid = String(data.invoiceNumber).replace(/^(EST-|INV-|#)/i, '');
  const estDate = data.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const baseFare = Number(data.baseFare) || 0;
  const toll = Number(data.tollCharges) || 0;
  const parking = Number(data.parkingCharges) || 0;
  const stateTax = Number(data.stateTax) || 0;
  const waiting = Number(data.waitingCharges) || 0;
  const hills = Number(data.hillsCharges) || 0;
  const night = Number(data.nightCharges) || 0;
  const extra = Number(data.extraCharges) || 0;
  const discount = Number(data.discountAmount) || 0;

  const totalFare = Math.max(0, baseFare + toll + parking + stateTax + waiting + hills + night + extra - discount);
  const advance = Number(data.advancePaid) || Math.round(totalFare * 0.2);
  const balanceDue = Math.max(0, totalFare - advance);

  const upiId = data.upiId || '7200217986-1@okbizaxis';
  const upiPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(brand)}&am=${advance}&tn=ADV-EST-${bid}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=4&data=${encodeURIComponent(upiPayload)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Estimation Quote #EST-${bid} - ${brand}</title>
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --secondary: #0b192c;
      --secondary-light: #1e3a8a;
      --accent: #2563eb;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border: #cbd5e1;
      --card-bg: #f8fafc;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: var(--text-main);
      background: #f1f5f9;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .quote-wrap { max-width: 820px; margin: 24px auto; padding: 0 16px; }
    .screen-toolbar {
      display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 16px;
    }
    .btn-action {
      background: var(--secondary); color: #fff; border: none; padding: 10px 18px;
      font-size: 0.88rem; font-weight: 700; border-radius: 8px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(11, 25, 44, 0.15);
      text-decoration: none;
    }
    .btn-action.wa { background: #25D366; }
    .btn-action:hover { opacity: 0.92; }
    .quote-card {
      background: #fff; border-radius: 14px; border: 1px solid var(--border);
      box-shadow: 0 8px 28px rgba(11, 25, 44, 0.07); padding: 34px;
    }
    .watermark-banner {
      background: linear-gradient(135deg, #0b192c 0%, #1e3a8a 60%, #0284c7 100%);
      color: #fff;
      border-radius: 10px;
      padding: 12px 18px;
      margin-bottom: 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(11, 25, 44, 0.12);
    }
    .banner-title {
      font-size: 0.88rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .banner-sub {
      font-size: 0.76rem; color: #cbd5e1; margin-top: 3px; font-weight: 500;
    }
    .brand-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 20px;
    }
    .brand-title {
      font-size: 2.1rem; font-weight: 900; color: var(--secondary); margin: 0; letter-spacing: -0.03em; line-height: 1;
    }
    .brand-title span { color: var(--primary); }
    .brand-sub {
      font-size: 0.82rem; color: var(--text-muted); margin: 6px 0 0; font-weight: 600;
    }
    .quote-ref-badge {
      text-align: right;
    }
    .quote-type {
      display: inline-block; background: var(--secondary); color: #fff;
      font-size: 0.72rem; font-weight: 800; letter-spacing: 1px;
      text-transform: uppercase; padding: 4px 10px; border-radius: 6px;
    }
    .quote-num {
      font-size: 1.3rem; font-weight: 900; color: var(--secondary); margin: 6px 0 2px;
    }
    .quote-date {
      font-size: 0.78rem; color: var(--text-muted); font-weight: 600;
    }
    
    .route-box {
      background: #f8fafc; border: 1.5px solid var(--border); border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;
    }
    .route-badge {
      font-size: 0.72rem; font-weight: 800; color: var(--secondary-light); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
    }
    .route-path {
      display: flex; align-items: center; gap: 12px; font-size: 1.12rem; font-weight: 900; color: var(--secondary);
    }
    .route-path .arrow { color: var(--primary); font-size: 1.25rem; }

    .details-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;
    }
    .info-box {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: 9px; overflow: hidden;
    }
    .info-title {
      font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
      color: #fff; background: var(--secondary-light); padding: 6px 12px;
    }
    .info-content { padding: 10px 14px; }
    .info-row {
      font-size: 0.83rem; margin: 5px 0; display: flex; justify-content: space-between;
    }
    .info-label { color: var(--text-muted); font-weight: 600; }
    .info-val { font-weight: 800; color: var(--secondary); text-align: right; }

    .inc-exc-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;
    }
    .inc-box {
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 9px; overflow: hidden;
    }
    .exc-box {
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 9px; overflow: hidden;
    }
    .box-head {
      padding: 7px 12px; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .inc-title { background: #dcfce7; color: #166534; }
    .exc-title { background: #fef3c7; color: #92400e; }
    .inc-list, .exc-list {
      margin: 0; padding: 10px 14px 12px 28px; font-size: 0.78rem; line-height: 1.45; color: #334155;
    }
    .inc-list li, .exc-list li { margin-bottom: 4px; }

    .fare-table {
      width: 100%; border-collapse: collapse; margin-bottom: 22px;
    }
    .fare-table th {
      background: #f1f5f9; color: var(--secondary); font-size: 0.75rem; font-weight: 800;
      text-transform: uppercase; text-align: left; padding: 10px 14px; border-top: 1px solid var(--border); border-bottom: 2px solid var(--secondary);
    }
    .fare-table td {
      padding: 10px 14px; font-size: 0.86rem; border-bottom: 1px solid var(--border);
    }
    .fare-table td.num { text-align: right; font-weight: 800; color: var(--secondary); }

    .totals-wrap {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 22px;
    }
    .pay-card {
      flex: 1; border: 1.5px dashed var(--primary); border-radius: 10px; padding: 16px;
      background: #f0f9ff; display: flex; align-items: center; gap: 16px;
    }
    .pay-card img { width: 110px; height: 110px; border-radius: 6px; border: 1px solid #bae6fd; }
    .pay-info h4 { margin: 0 0 4px; font-size: 0.95rem; font-weight: 800; color: var(--primary-dark); }
    .pay-info p { margin: 0 0 8px; font-size: 0.78rem; color: #334155; line-height: 1.4; }
    .summary-card {
      width: 330px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
    }
    .sum-row {
      display: flex; justify-content: space-between; font-size: 0.86rem; margin: 6px 0;
    }
    .sum-row.grand {
      font-size: 1.15rem; font-weight: 900; color: var(--secondary);
      border-top: 2px solid var(--secondary); padding-top: 8px; margin-top: 8px;
    }
    .sum-row.grand span:last-child { color: var(--primary-dark); font-size: 1.35rem; }
    .sum-row.advance {
      font-size: 0.95rem; font-weight: 800; color: #0369a1;
      background: #e0f2fe; padding: 7px 10px; border-radius: 6px; margin-top: 8px; border: 1px solid #bae6fd;
    }
    .sum-row.balance {
      font-size: 0.88rem; font-weight: 700; color: #166534;
      background: #dcfce7; padding: 7px 10px; border-radius: 6px; margin-top: 5px; border: 1px solid #bbf7d0;
    }
    
    .notes-box {
      border-top: 1px solid var(--border); padding-top: 16px; font-size: 0.73rem; color: var(--text-muted);
    }
    .notes-box h5 { margin: 0 0 6px; font-size: 0.78rem; font-weight: 800; color: var(--secondary); text-transform: uppercase; }
    .notes-box ul { margin: 0; padding-left: 18px; line-height: 1.5; }
    .notes-box li { margin-bottom: 4px; }
    
    @media print {
      body { background: #fff !important; }
      .screen-toolbar { display: none !important; }
      .quote-wrap { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
      .quote-card { border: none !important; box-shadow: none !important; padding: 0 !important; }
      @page { margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class="quote-wrap">
    <div class="screen-toolbar">
      <button class="btn-action" onclick="window.print()">🖨️ Print / Save PDF</button>
      <a href="https://api.whatsapp.com/send?phone=${formatPhoneForWhatsApp(data.customerPhone)}&text=${encodeURIComponent(generateQuotationText(data))}" target="_blank" class="btn-action wa">💬 Share via WhatsApp</a>
    </div>

    <div class="quote-card">
      <div class="watermark-banner">
        <div>
          <div class="banner-title">📋 Trip Fare Estimation & Quotation</div>
          <div class="banner-sub">Official fare estimation for booking reservation · Final Tax Invoice generated upon journey completion.</div>
        </div>
        <div style="font-size: 0.72rem; font-weight: 800; color: var(--secondary); background: #fff; padding: 4px 10px; border-radius: 5px;">
          CONFIRMED QUOTE
        </div>
      </div>

      <div class="brand-header">
        <div>
          <h1 class="brand-title">Drop <span>Cars</span></h1>
          <p class="brand-sub">Premium Outstation & One-Way Taxi Network · 24/7 Helpline: ${brandPhone}</p>
        </div>
        <div class="quote-ref-badge">
          <span class="quote-type">Trip Quotation</span>
          <div class="quote-num">#EST-${bid}</div>
          <div class="quote-date">Date: ${estDate}</div>
        </div>
      </div>

      <div class="route-box">
        <div class="route-badge">Itinerary Route</div>
        <div class="route-path">
          <span>📍 ${data.pickup}</span>
          <span class="arrow">➔</span>
          <span>🎯 ${data.dropLocation}</span>
        </div>
      </div>

      <div class="details-grid">
        <div class="info-box">
          <div class="info-title">Passenger Particulars</div>
          <div class="info-content">
            <div class="info-row">
              <span class="info-label">Customer Name:</span>
              <span class="info-val">${data.customerName || 'Valued Customer'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Contact Number:</span>
              <span class="info-val">${data.customerPhone || 'N/A'}</span>
            </div>
            ${data.customerEmail ? `
              <div class="info-row">
                <span class="info-label">Email Address:</span>
                <span class="info-val">${data.customerEmail}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="info-box">
          <div class="info-title">Trip & Vehicle Specification</div>
          <div class="info-content">
            <div class="info-row">
              <span class="info-label">Vehicle Category:</span>
              <span class="info-val">${data.vehicleType || 'Sedan'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Trip Type:</span>
              <span class="info-val">${data.tripType || 'One Way Drop'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Scheduled Departure:</span>
              <span class="info-val">${data.travelDate || data.pickupDate || 'As scheduled'} ${data.pickupTime || ''}</span>
            </div>
            ${data.distanceKm ? `
              <div class="info-row">
                <span class="info-label">Estimated Distance:</span>
                <span class="info-val">~${data.distanceKm} KM</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="inc-exc-grid">
        <div class="inc-box">
          <div class="box-head inc-title">✅ Included in this Fare</div>
          <ul class="inc-list">
            <li><strong>Dedicated Cab:</strong> Clean ${data.vehicleType || 'Sedan'} reserved exclusively for your travel.</li>
            <li><strong>Fuel Charges:</strong> Complete fuel allowance for the quoted route distance.</li>
            <li><strong>Driver Day Bata:</strong> Chauffeur daytime duty allowance included in quoted fare.</li>
            <li><strong>Transit:</strong> Doorstep pickup and point-to-point destination drop.</li>
          </ul>
        </div>
        <div class="exc-box">
          <div class="box-head exc-title">ℹ️ Excluded (Payable as Actuals)</div>
          <ul class="exc-list">
            <li><strong>Highway Toll Plazas:</strong> Payable as actuals per NH Fastag plaza deductions.</li>
            <li><strong>Parking & Airport Entry:</strong> Payable at actual parking lots against receipts.</li>
            <li><strong>Inter-State Permit:</strong> State border permit taxes (if applicable, unless inclusive).</li>
            <li><strong>Extra KM / Detours:</strong> Additional distance or extended halting beyond schedule.</li>
          </ul>
        </div>
      </div>

      <table class="fare-table">
        <thead>
          <tr>
            <th>Item Description</th>
            <th style="text-align: center;">Rate / Basis</th>
            <th style="text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Base Trip Fare (${data.vehicleType || 'Sedan'} · ${data.tripType || 'One Way'})</strong><br><span style="font-size: 0.74rem; color: #64748b;">Vehicle hire, route running allowance & fuel.</span></td>
            <td style="text-align: center; color: #475569; font-weight: 600;">Quoted Tariff</td>
            <td class="num">₹${baseFare.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td><strong>Driver Operational Allowance (Bata)</strong><br><span style="font-size: 0.74rem; color: #64748b;">Standard day chauffeur duty allowance.</span></td>
            <td style="text-align: center; color: #166534; font-weight: 700;">Inclusive</td>
            <td class="num">₹0.00</td>
          </tr>
          ${toll > 0 ? `
            <tr>
              <td><strong>Estimated Toll Allowance</strong></td>
              <td style="text-align: center; color: #475569; font-weight: 600;">Estimated</td>
              <td class="num">₹${toll.toLocaleString('en-IN')}</td>
            </tr>
          ` : ''}
          ${extra > 0 ? `
            <tr>
              <td><strong>Additional Extras / Surcharges</strong></td>
              <td style="text-align: center; color: #475569; font-weight: 600;">Fixed</td>
              <td class="num">₹${extra.toLocaleString('en-IN')}</td>
            </tr>
          ` : ''}
          ${discount > 0 ? `
            <tr style="color: #dc2626;">
              <td><strong>Special Discount Applied</strong></td>
              <td style="text-align: center; font-weight: 700;">Promo</td>
              <td class="num" style="color: #dc2626;">-₹${discount.toLocaleString('en-IN')}</td>
            </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="totals-wrap">
        <div class="pay-card">
          <img src="${qrApiUrl}" alt="UPI QR Code" />
          <div class="pay-info">
            <h4>Confirm Booking with 20% Advance</h4>
            <p>Scan with any UPI App (GPay, PhonePe, Paytm, BHIM) to pay <strong>₹${advance.toLocaleString('en-IN')}</strong> and confirm your cab instantly.</p>
            <div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">UPI ID: ${upiId}</div>
          </div>
        </div>

        <div class="summary-card">
          <div class="sum-row">
            <span style="color: #64748b;">Total Estimated Fare:</span>
            <span style="font-weight: 700;">₹${totalFare.toLocaleString('en-IN')}</span>
          </div>
          <div class="sum-row grand">
            <span>QUOTED FARE:</span>
            <span>₹${totalFare.toLocaleString('en-IN')}</span>
          </div>
          <div class="sum-row advance">
            <span>20% Advance to Confirm:</span>
            <span>₹${advance.toLocaleString('en-IN')}</span>
          </div>
          <div class="sum-row balance">
            <span>Balance on Completion:</span>
            <span>₹${balanceDue.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      <div class="notes-box">
        <h5>Terms of Quotation & Booking Policy</h5>
        <ul>
          <li><strong>Booking Confirmation & Dispatch:</strong> Reservation is confirmed upon receipt of the advance payment. Driver contact details and vehicle registration number are dispatched 2 hours prior to scheduled departure.</li>
          <li><strong>Toll, Parking & Permits:</strong> Toll fees, state entry permit taxes, and parking charges are billed at actuals as per National Highway Fastag plaza deductions and physical receipts unless explicitly inclusive.</li>
          <li><strong>Ghat Road & Hill Section Policy:</strong> An operational allowance of ₹300 for One-Way drops or ₹500 for Round Trips applies to journeys involving hill station destinations (e.g., Ooty, Kodaikanal, Yercaud, Valparai, Yelagiri) to cover steep-climb fuel consumption, hairpin safety, and local ghat tolls. Air-conditioning will be regulated on steep climbs for engine cooling and passenger safety.</li>
          <li><strong>Cab Availability, Demand Surge & 100% Refund Policy:</strong> Outstation and One-Way cab allocations are scheduled based on regional demand and vehicle availability. In the rare event of localized fleet shortages during peak demand within the final 1 hour before pickup, Drop Cars deploys emergency dispatch escalations including Drop Bid driver incentive bonuses, live app matching, and partner fleet mobilization. If a vehicle cannot be confirmed despite all efforts, the reservation may be cancelled by the platform with an immediate, unconditional 100% full refund of all advance payments.</li>
          <li><strong>Helpline & Support:</strong> For booking modifications, route assistance, or corporate billing queries, contact 24/7 customer support at <strong>${brandPhone}</strong>.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printOrDownloadEstimation(data: InvoiceData) {
  const html = generateEstimationHtml(data);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    let handled = false;
    try {
      const printWindow = window.open('', '_blank');
      if (printWindow && !printWindow.closed) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          try { printWindow.print(); } catch { }
        }, 400);
        handled = true;
      }
    } catch { }

    if (!handled) {
      try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DropCars_Quote_EST_${String(data.invoiceNumber).replace(/[\/#\s]/g, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch { }
    }
  } else {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    Linking.openURL(dataUrl).catch(() => {
      Alert.alert('Estimation Formatted', `Quote EST-${data.invoiceNumber} formatted for WhatsApp sharing.`);
    });
  }
}
