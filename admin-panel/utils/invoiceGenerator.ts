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
  const toll = Number(data.tollCharges) || 0;
  const parking = Number(data.parkingCharges) || 0;
  const stateTax = Number(data.stateTax) || 0;
  const extra = Number(data.extraCharges) || 0;
  const discount = Number(data.discountAmount) || 0;
  const total = Math.max(0, baseFare + toll + parking + stateTax + extra - discount);
  const advance = Number(data.advancePaid) || Math.round(total * 0.2);
  const balance = Math.max(0, total - advance);
  const brand = data.brandName || 'Drop Cars';
  const brandPhone = data.brandPhone || '7200217986';

  return `🚗 *${brand.toUpperCase()} - FARE ESTIMATION & QUOTE*
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
• Base Trip Fare: ₹${baseFare.toLocaleString('en-IN')}
${toll > 0 ? `• Standard Toll Allowance: ₹${toll.toLocaleString('en-IN')}\n` : ''}${stateTax > 0 ? `• State Entry Permit Tax: ₹${stateTax.toLocaleString('en-IN')}\n` : ''}${extra > 0 ? `• Extra Allowance: ₹${extra.toLocaleString('en-IN')}\n` : ''}${discount > 0 ? `• Special Discount: -₹${discount.toLocaleString('en-IN')}\n` : ''}----------------------------------------
*TOTAL ESTIMATED FARE: ₹${total.toLocaleString('en-IN')}*
• 20% Booking Advance: ₹${advance.toLocaleString('en-IN')}
• Balance Payable to Driver: ₹${balance.toLocaleString('en-IN')}
----------------------------------------

✅ *Included:* Fuel, Driver Allowance, Standard Toll Allowance.
ℹ️ *Excluded:* Extra KM beyond allowance, State Permit (unless included), Parking.

🔗 *Confirm & Pay 20% Advance Online:*
https://dropcars.in/pay-advance/${data.invoiceNumber}

📞 Helpline: ${brandPhone} | ${brand} Mobility
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
      --primary: #f7b733;
      --secondary: #1a2b48;
      --text-main: #344767;
      --text-muted: #8392ab;
      --border-color: #e2e8f0;
    }
    html, body {
      margin: 0; padding: 0;
      font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--text-main);
      background: #f8fafc;
    }
    .invoice-wrap { max-width: 800px; margin: 20px auto; padding: 0 15px; }
    .screen-toolbar {
      display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 16px;
    }
    .btn-action {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 16px; font-size: 13px; font-weight: 700; border-radius: 8px;
      border: none; cursor: pointer; color: #fff; text-decoration: none;
    }
    .btn-print { background: var(--secondary); }
    .btn-wa { background: #25D366; }
    
    .invoice-sheet {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 2.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.06); min-height: 950px;
    }
    .invoice-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #f1f5f9; padding-bottom: 1.25rem; margin-bottom: 1.25rem;
    }
    .brand-block { max-width: 60%; }
    .brand-title {
      font-size: 2.1rem; font-weight: 900; color: var(--secondary); margin: 0;
      letter-spacing: -0.02em; line-height: 1.05;
    }
    .brand-title span { color: var(--primary); }
    .brand-tagline {
      margin: 0.35rem 0 0; font-size: 0.75rem; color: #64748b; font-weight: 600;
    }
    .invoice-id-block { text-align: right; }
    .invoice-id-block h1 {
      margin: 0; font-size: 2.6rem; color: var(--secondary); font-weight: 900;
      letter-spacing: -0.02em; line-height: 1;
    }
    .invoice-sub { margin: 0.35rem 0 0; font-size: 0.76rem; font-weight: 800; color: #64748b; }
    .invoice-badge {
      display: inline-block; background: #ecfdf5; color: #059669;
      font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; margin-top: 4px;
    }
    
    .bill-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;
    }
    .info-group {
      border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff;
    }
    .info-group h4 {
      margin: 0; padding: 0.45rem 0.75rem; font-size: 0.72rem; text-transform: uppercase;
      color: var(--secondary); background: #f1f5f9; letter-spacing: 0.05em; font-weight: 800;
    }
    .info-group p {
      margin: 0; padding: 0.38rem 0.75rem; font-size: 0.82rem; border-top: 1px solid #f1f5f9; line-height: 1.4;
    }
    .info-group p strong { color: var(--secondary); font-size: 0.84rem; }
    
    .trip-table-wrap {
      border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 1.25rem;
    }
    .trip-table-title {
      margin: 0; padding: 0.45rem 0.75rem; font-size: 0.72rem; text-transform: uppercase;
      color: var(--secondary); background: #f1f5f9; letter-spacing: 0.05em; font-weight: 800;
    }
    .trip-table { width: 100%; border-collapse: collapse; }
    .trip-table th, .trip-table td {
      font-size: 0.82rem; padding: 0.42rem 0.75rem; border-top: 1px solid #f1f5f9; vertical-align: top;
    }
    .trip-table th { width: 26%; text-align: left; color: #64748b; font-weight: 700; background: #fcfdff; }
    .trip-table td { color: var(--secondary); font-weight: 600; }
    
    .charge-table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
    .charge-table th {
      text-align: left; padding: 0.65rem 0.6rem; border-bottom: 2px solid var(--secondary);
      font-size: 0.74rem; text-transform: uppercase; color: var(--secondary); font-weight: 800; letter-spacing: 0.04em;
    }
    .charge-table td {
      padding: 0.52rem 0.6rem; border-bottom: 1px solid #f1f5f9; font-size: 0.84rem;
    }
    .text-right { text-align: right; }
    
    .invoice-footer-grid {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 1.5rem; margin-top: 1rem;
    }
    .qr-box {
      border: 1px solid #e2e8f0; background: #fafafa; padding: 12px; border-radius: 10px;
      text-align: center; width: 135px;
    }
    .qr-box img { width: 100px; height: 100px; display: block; margin: 0 auto; }
    .qr-box p { font-size: 0.64rem; color: #64748b; font-weight: 700; margin: 6px 0 0; line-height: 1.2; }
    
    .totals-box { width: 320px; margin-left: auto; }
    .total-row { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.84rem; }
    .total-row.grand {
      border-top: 2px solid var(--secondary); margin-top: 0.5rem; padding-top: 0.85rem;
      font-size: 1.15rem; font-weight: 900; color: var(--secondary);
    }
    .total-row.grand span:last-child { font-size: 1.45rem; letter-spacing: -0.02em; }
    
    .received-highlight {
      background: #f0fdf4; color: #166534; padding: 0.75rem 1rem; border-radius: 8px;
      margin-top: 0.85rem; border: 1px solid #bbf7d0; display: flex;
      justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.9rem;
    }
    .received-highlight span:last-child { font-size: 1.15rem; color: #15803d; }
    
    .terms-section {
      margin-top: 2.5rem; border-top: 1px solid #e2e8f0; padding-top: 1.25rem;
      display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;
    }
    .terms-section h5 { margin: 0 0 0.4rem; font-size: 0.75rem; color: #475569; text-transform: uppercase; font-weight: 800; }
    .terms-section ul { padding: 0 0 0 14px; margin: 0; font-size: 0.72rem; color: #64748b; line-height: 1.45; }
    .sig-block { text-align: right; }
    .sig-line {
      border-top: 1px solid #94a3b8; width: 160px; margin-left: auto; margin-top: 2.5rem;
      padding-top: 0.4rem; font-size: 0.74rem; font-weight: 800; color: var(--secondary);
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
          <p class="brand-tagline">Your Trusted Travel Partner · 24/7 Helpline: ${brandPhone}</p>
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
            <li>Tolls, parking, and permit charges are billed as per actual usage unless inclusive.</li>
            <li>Air conditioning will be switched off on hill climbs as per safety standards.</li>
            <li>For any disputes or billing questions, contact support at ${brandPhone}.</li>
          </ul>
        </div>
        <div class="sig-block">
          <div class="sig-line">Authorized Signatory</div>
          <p style="font-size: 0.65rem; color: #64748b; margin: 4px 0 0;">${brand} Management</p>
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
          try { printWindow.print(); } catch {}
        }, 400);
        handled = true;
      }
    } catch {}

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
      --secondary: #0f172a;
      --accent: #f59e0b;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
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
    .quote-wrap { max-width: 800px; margin: 24px auto; padding: 0 16px; }
    .screen-toolbar {
      display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 16px;
    }
    .btn-action {
      background: var(--primary); color: #fff; border: none; padding: 10px 18px;
      font-size: 0.88rem; font-weight: 700; border-radius: 8px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .btn-action:hover { opacity: 0.9; }
    .quote-card {
      background: #fff; border-radius: 12px; border: 1px solid var(--border);
      box-shadow: 0 4px 16px rgba(0,0,0,0.06); padding: 36px;
    }
    .watermark-banner {
      background: linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%);
      border: 1px dashed #0284c7;
      border-radius: 8px;
      padding: 10px 16px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .banner-title {
      font-size: 0.85rem; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .banner-sub {
      font-size: 0.76rem; color: #475569; margin-top: 2px;
    }
    .brand-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid var(--border); padding-bottom: 20px; margin-bottom: 24px;
    }
    .brand-title {
      font-size: 1.7rem; font-weight: 900; color: var(--secondary); margin: 0; letter-spacing: -0.5px;
    }
    .brand-sub {
      font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0; font-weight: 500;
    }
    .quote-ref-badge {
      text-align: right;
    }
    .quote-type {
      display: inline-block; background: #0284c7; color: #fff;
      font-size: 0.75rem; font-weight: 800; letter-spacing: 1px;
      text-transform: uppercase; padding: 4px 10px; border-radius: 6px;
    }
    .quote-num {
      font-size: 1.25rem; font-weight: 800; color: var(--secondary); margin: 6px 0 2px;
    }
    .quote-date {
      font-size: 0.8rem; color: var(--text-muted);
    }
    .details-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;
    }
    .info-box {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px;
    }
    .info-title {
      font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--primary); margin-bottom: 8px;
    }
    .info-row {
      font-size: 0.84rem; margin: 4px 0; display: flex; justify-content: space-between;
    }
    .info-label { color: var(--text-muted); font-weight: 500; }
    .info-val { font-weight: 700; color: var(--secondary); text-align: right; }
    .route-box {
      background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;
    }
    .route-path {
      display: flex; align-items: center; gap: 10px; font-size: 1.05rem; font-weight: 800; color: #581c87;
    }
    .fare-table {
      width: 100%; border-collapse: collapse; margin-bottom: 24px;
    }
    .fare-table th {
      background: #f1f5f9; color: #334155; font-size: 0.75rem; font-weight: 800;
      text-transform: uppercase; text-align: left; padding: 10px 14px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
    }
    .fare-table td {
      padding: 12px 14px; font-size: 0.88rem; border-bottom: 1px solid var(--border);
    }
    .fare-table td.num { text-align: right; font-weight: 700; }
    .totals-wrap {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px;
    }
    .pay-card {
      flex: 1; border: 1.5px dashed #0284c7; border-radius: 10px; padding: 16px;
      background: #f0f9ff; display: flex; align-items: center; gap: 16px;
    }
    .pay-card img { width: 110px; height: 110px; border-radius: 6px; border: 1px solid #bae6fd; }
    .pay-info h4 { margin: 0 0 4px; font-size: 0.95rem; font-weight: 800; color: #0369a1; }
    .pay-info p { margin: 0 0 8px; font-size: 0.78rem; color: #334155; line-height: 1.4; }
    .summary-card {
      width: 320px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
    }
    .sum-row {
      display: flex; justify-content: space-between; font-size: 0.86rem; margin: 6px 0;
    }
    .sum-row.grand {
      font-size: 1.15rem; font-weight: 900; color: var(--secondary);
      border-top: 1.5px solid var(--border); padding-top: 8px; margin-top: 8px;
    }
    .sum-row.advance {
      font-size: 0.95rem; font-weight: 800; color: #0284c7;
      background: #e0f2fe; padding: 6px 8px; border-radius: 6px; margin-top: 6px;
    }
    .sum-row.balance {
      font-size: 0.88rem; font-weight: 700; color: #166534;
      background: #dcfce7; padding: 6px 8px; border-radius: 6px; margin-top: 4px;
    }
    .notes-box {
      border-top: 1px solid var(--border); padding-top: 18px; font-size: 0.78rem; color: var(--text-muted);
    }
    .notes-box h5 { margin: 0 0 6px; font-size: 0.8rem; font-weight: 800; color: var(--secondary); text-transform: uppercase; }
    .notes-box ul { margin: 0; padding-left: 18px; }
    .notes-box li { margin-bottom: 4px; }
    @media print {
      .screen-toolbar { display: none !important; }
      .quote-wrap { margin: 0; padding: 0; max-width: 100%; }
      .quote-card { border: none; box-shadow: none; padding: 15px; }
    }
  </style>
</head>
<body>
  <div class="quote-wrap">
    <div class="screen-toolbar">
      <button class="btn-action" onclick="window.print()">🖨️ Print / Save PDF</button>
    </div>

    <div class="quote-card">
      <div class="watermark-banner">
        <div>
          <div class="banner-title">📋 Trip Fare Estimation & Quotation</div>
          <div class="banner-sub">This quotation is valid for booking confirmation. Final Tax Invoice will be issued upon trip completion.</div>
        </div>
        <div style="font-size: 0.72rem; font-weight: 800; color: #0369a1; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #bae6fd;">
          ESTIMATE ONLY
        </div>
      </div>

      <div class="brand-header">
        <div>
          <h1 class="brand-title">${brand}</h1>
          <p class="brand-sub">Premium Outstation & One-Way Taxi Network · Call: ${brandPhone}</p>
        </div>
        <div class="quote-ref-badge">
          <span class="quote-type">Trip Quotation</span>
          <div class="quote-num">#EST-${bid}</div>
          <div class="quote-date">Date: ${estDate}</div>
        </div>
      </div>

      <div class="route-box">
        <div style="font-size: 0.72rem; font-weight: 800; color: #7e22ce; text-transform: uppercase; margin-bottom: 4px;">Proposed Route</div>
        <div class="route-path">
          <span>📍 ${data.pickup}</span>
          <span style="color: #a855f7;">➔</span>
          <span>🎯 ${data.dropLocation}</span>
        </div>
      </div>

      <div class="details-grid">
        <div class="info-box">
          <div class="info-title">Passenger Details</div>
          <div class="info-row">
            <span class="info-label">Customer Name:</span>
            <span class="info-val">${data.customerName || 'Customer'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Phone Number:</span>
            <span class="info-val">${data.customerPhone || 'N/A'}</span>
          </div>
          ${data.customerEmail ? `
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-val">${data.customerEmail}</span>
            </div>
          ` : ''}
        </div>

        <div class="info-box">
          <div class="info-title">Trip & Vehicle Specification</div>
          <div class="info-row">
            <span class="info-label">Vehicle Selected:</span>
            <span class="info-val">${data.vehicleType || 'Sedan'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Trip Type:</span>
            <span class="info-val">${data.tripType || 'One Way'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Travel Schedule:</span>
            <span class="info-val">${data.travelDate || data.pickupDate || 'As scheduled'} ${data.pickupTime || ''}</span>
          </div>
          ${data.distanceKm ? `
            <div class="info-row">
              <span class="info-label">Est. Distance:</span>
              <span class="info-val">${data.distanceKm} KM</span>
            </div>
          ` : ''}
        </div>
      </div>

      <table class="fare-table">
        <thead>
          <tr>
            <th>Item Description</th>
            <th style="text-align: center;">Rate / Basis</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Base Cab Fare (${data.vehicleType || 'Sedan'} · ${data.tripType || 'One Way'})</strong><br><span style="font-size: 0.75rem; color: #64748b;">Includes vehicle hire, fuel charges, and standard driving allowance.</span></td>
            <td style="text-align: center;">Standard Quoted</td>
            <td class="num">₹${baseFare.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td><strong>Driver Allowance (Bata)</strong><br><span style="font-size: 0.75rem; color: #64748b;">Day duty and driver operational allowance.</span></td>
            <td style="text-align: center;">Inclusive</td>
            <td class="num">₹0.00</td>
          </tr>
          ${toll > 0 ? `
            <tr>
              <td><strong>Estimated Toll Charges</strong></td>
              <td style="text-align: center;">Estimated</td>
              <td class="num">₹${toll.toLocaleString('en-IN')}</td>
            </tr>
          ` : ''}
          ${extra > 0 ? `
            <tr>
              <td><strong>Additional Extras / Surcharges</strong></td>
              <td style="text-align: center;">Fixed</td>
              <td class="num">₹${extra.toLocaleString('en-IN')}</td>
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
            <span style="color: #0284c7;">₹${totalFare.toLocaleString('en-IN')}</span>
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
          <li><strong>Confirmation:</strong> Booking is confirmed upon receipt of the advance payment. Driver & vehicle registration details will be dispatched 2 hours prior to departure.</li>
          <li><strong>Toll & Parking:</strong> Toll fees and parking charges are billed as per actual Fastag logs unless explicitly included in package.</li>
          <li><strong>AC Usage:</strong> Air conditioner will be kept on throughout the journey, but switched off on steep hill/ghat sections for engine performance and passenger safety.</li>
          <li><strong>Tax Invoice:</strong> Final GST Tax Invoice will be generated upon trip completion by the assigned driver.</li>
          <li>For questions or modifications, contact ${brand} Customer Support at <strong>${brandPhone}</strong>.</li>
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
          try { printWindow.print(); } catch {}
        }, 400);
        handled = true;
      }
    } catch {}

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
      } catch {}
    }
  } else {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    Linking.openURL(dataUrl).catch(() => {
      Alert.alert('Estimation Formatted', `Quote EST-${data.invoiceNumber} formatted for WhatsApp sharing.`);
    });
  }
}
