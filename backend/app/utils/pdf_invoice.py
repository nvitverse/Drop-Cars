# app/utils/pdf_invoice.py
"""
High-quality, corporate-grade GST Tax Invoice PDF generator for Drop Cars.
Built with ReportLab. Outputs raw PDF bytes suitable for email attachments,
streaming downloads, or cloud archiving.
"""
import io
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY


def generate_tax_invoice_pdf(data: Dict[str, Any]) -> bytes:
    """
    Generates a vectorized, print-ready GST Tax Invoice PDF.
    Pure KM Fare Rule:
    - Pure KM Running Fare has 5% GST (CGST 2.5% + SGST 2.5%).
    - Driver Allowance / Bata is personal food allowance, non-taxable (0% GST).
    - Tolls & Permits are statutory pass-throughs (0% GST).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    # Color Palette
    PRIMARY = colors.HexColor("#1A2B48")     # Deep Corporate Navy
    SECONDARY = colors.HexColor("#0284C7")   # Drop Cars Blue
    ACCENT = colors.HexColor("#F59E0B")      # Amber/Gold
    DARK_TEXT = colors.HexColor("#1E293B")   # Slate 800
    MUTED_TEXT = colors.HexColor("#64748B")  # Slate 500
    LIGHT_BG = colors.HexColor("#F8FAFC")    # Slate 50
    BORDER_COLOR = colors.HexColor("#CBD5E1") # Slate 300

    # Typography & Styles
    styles = getSampleStyleSheet()

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=MUTED_TEXT,
    )
    inv_meta_style = ParagraphStyle(
        'InvMeta',
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        alignment=TA_RIGHT,
        textColor=DARK_TEXT,
    )
    cell_bold = ParagraphStyle(
        'CellBold',
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=DARK_TEXT,
    )
    cell_text = ParagraphStyle(
        'CellText',
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=DARK_TEXT,
    )
    cell_right = ParagraphStyle(
        'CellRight',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        alignment=TA_RIGHT,
        textColor=DARK_TEXT,
    )
    cell_right_bold = ParagraphStyle(
        'CellRightBold',
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=TA_RIGHT,
        textColor=DARK_TEXT,
    )

    story = []

    # 1. Header Bar: Brand on left, Tax Invoice details on right
    brand_p = Paragraph(
        f"<b><font size=16 color='#1A2B48'>DROP CARS</font></b><br/>"
        f"<font size=7 color='#64748B'><b>PREMIUM INTERCITY CAB MOBILITY</b></font><br/>"
        f"<font size=7 color='#64748B'>"
        f"{data.get('company_address', 'No. 12, GST Road, Guindy, Chennai, Tamil Nadu - 600032')}<br/>"
        f"Phone: {data.get('company_phone', '+91 72002 17986')} | Email: {data.get('company_email', 'dropcarsbookings@gmail.com')}<br/>"
        f"<b>GSTIN:</b> {data.get('company_gstin', '33AAACM9876A1Z4')} | <b>State Code:</b> 33 - Tamil Nadu"
        f"</font>",
        subtitle_style
    )

    inv_num = data.get('invoice_number', 'DC/26-27/INV-031')
    inv_date = data.get('date', datetime.now().strftime('%d-%b-%Y'))
    book_id = data.get('booking_id', 'N/A')

    invoice_meta_p = Paragraph(
        f"<font size=12 color='#0284C7'><b>TAX INVOICE</b></font><br/>"
        f"<b>Invoice No:</b> <font color='#1A2B48'><b>{inv_num}</b></font><br/>"
        f"<b>Invoice Date:</b> {inv_date}<br/>"
        f"<b>Booking Ref:</b> #{book_id}<br/>"
        f"<b>SAC Code:</b> {data.get('sac_code', '9964')} (Passenger Transport)",
        inv_meta_style
    )

    header_table = Table(
        [[brand_p, invoice_meta_p]],
        colWidths=[105 * mm, 77 * mm]
    )
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * mm),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceAfter=8, spaceBefore=2))

    # 2. Billed To & Journey Summary Box
    cust_name = data.get('customer_name', 'Valued Customer')
    cust_phone = data.get('customer_phone', '')
    cust_email = data.get('customer_email', '')
    cust_gstin = data.get('customer_gstin', '')
    cust_comp = data.get('customer_company', '')

    cust_html = f"<b>{cust_name}</b>"
    if cust_comp:
        cust_html += f"<br/><b>Company:</b> {cust_comp}"
    if cust_phone:
        cust_html += f"<br/><b>Phone:</b> {cust_phone}"
    if cust_email:
        cust_html += f"<br/><b>Email:</b> {cust_email}"
    if cust_gstin:
        cust_html += f"<br/><b>Customer GSTIN:</b> {cust_gstin}"
    else:
        cust_html += f"<br/><b>Customer Category:</b> B2C Retail Passenger"

    bill_to_p = Paragraph(
        f"<font size=8.5 color='#1A2B48'><b>BILLED TO (CUSTOMER):</b></font><br/>{cust_html}",
        cell_text
    )

    pickup = data.get('pickup', 'Pickup Location')
    drop = data.get('drop', 'Drop Location')
    trip_type = data.get('trip_type', 'One Way')
    vehicle = data.get('vehicle_type', 'Sedan AC')
    dist_km = data.get('distance_km', 0)

    journey_html = (
        f"<b>Route:</b> {pickup} &rarr; {drop}<br/>"
        f"<b>Trip Category:</b> {trip_type}<br/>"
        f"<b>Vehicle Class:</b> {vehicle}<br/>"
        f"<b>Billed Distance:</b> ~{dist_km} KM"
    )
    journey_p = Paragraph(
        f"<font size=8.5 color='#1A2B48'><b>JOURNEY DETAILS:</b></font><br/>{journey_html}",
        cell_text
    )

    parties_table = Table(
        [[bill_to_p, journey_p]],
        colWidths=[91 * mm, 91 * mm]
    )
    parties_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.75, BORDER_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 4 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4 * mm),
    ]))
    story.append(parties_table)
    story.append(Spacer(1, 5 * mm))

    # 3. Itemized Tax Table (Pure KM Fare Rule)
    pure_km = float(data.get('pure_km_fare', 0))
    rate_km = data.get('rate_per_km', 0)
    cgst = float(data.get('cgst_amount', round(pure_km * 0.025, 2)))
    sgst = float(data.get('sgst_amount', round(pure_km * 0.025, 2)))
    total_gst = round(cgst + sgst, 2)
    bata = float(data.get('driver_bata', 0))
    tolls = float(data.get('toll_charges', 0))
    permits = float(data.get('permit_charges', 0))
    extra = float(data.get('extra_charges', 0))
    discount = float(data.get('discount_amount', 0))

    km_desc = f"Pure KM Running Charges ({dist_km} KM @ ₹{rate_km}/KM)" if dist_km and rate_km else "Pure KM Running Charges"

    table_data = [
        [
            Paragraph("<b>#</b>", cell_bold),
            Paragraph("<b>Service / Charge Description</b>", cell_bold),
            Paragraph("<b>HSN / SAC</b>", cell_bold),
            Paragraph("<b>Taxable (₹)</b>", ParagraphStyle('HRight', parent=cell_bold, alignment=TA_RIGHT)),
            Paragraph("<b>GST Rate</b>", ParagraphStyle('HCenter', parent=cell_bold, alignment=TA_CENTER)),
            Paragraph("<b>Total (₹)</b>", ParagraphStyle('HRight2', parent=cell_bold, alignment=TA_RIGHT)),
        ],
        [
            Paragraph("1", cell_text),
            Paragraph(f"<b>{km_desc}</b><br/><font size=7 color='#64748B'>Passenger road transport service</font>", cell_text),
            Paragraph("996412", cell_text),
            Paragraph(f"₹{pure_km:,.2f}", cell_right),
            Paragraph("5.0%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{pure_km:,.2f}", cell_right_bold),
        ],
        [
            Paragraph("", cell_text),
            Paragraph("&nbsp;&nbsp;• CGST (Central Tax @ 2.5%)", cell_text),
            Paragraph("996412", cell_text),
            Paragraph("-", cell_right),
            Paragraph("2.5%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{cgst:,.2f}", cell_right),
        ],
        [
            Paragraph("", cell_text),
            Paragraph("&nbsp;&nbsp;• SGST (State Tax @ 2.5%)", cell_text),
            Paragraph("996412", cell_text),
            Paragraph("-", cell_right),
            Paragraph("2.5%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{sgst:,.2f}", cell_right),
        ],
    ]

    row_num = 2
    if bata > 0:
        table_data.append([
            Paragraph(str(row_num), cell_text),
            Paragraph("<b>Driver Food & Daily Allowance (Bata)</b><br/><font size=7 color='#64748B'>Direct driver allowance - Non-taxable</font>", cell_text),
            Paragraph("N/A", cell_text),
            Paragraph(f"₹{bata:,.2f}", cell_right),
            Paragraph("0.0%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{bata:,.2f}", cell_right_bold),
        ])
        row_num += 1

    if tolls > 0:
        table_data.append([
            Paragraph(str(row_num), cell_text),
            Paragraph("<b>Toll Plaza Fastag Charges (Actuals)</b><br/><font size=7 color='#64748B'>Government statutory fee - Pass-through</font>", cell_text),
            Paragraph("N/A", cell_text),
            Paragraph(f"₹{tolls:,.2f}", cell_right),
            Paragraph("0.0%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{tolls:,.2f}", cell_right_bold),
        ])
        row_num += 1

    if permits > 0:
        table_data.append([
            Paragraph(str(row_num), cell_text),
            Paragraph("<b>Inter-State Border Entry Permit Tax</b><br/><font size=7 color='#64748B'>Transport Department Checkpost fee</font>", cell_text),
            Paragraph("N/A", cell_text),
            Paragraph(f"₹{permits:,.2f}", cell_right),
            Paragraph("0.0%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{permits:,.2f}", cell_right_bold),
        ])
        row_num += 1

    if extra > 0:
        table_data.append([
            Paragraph(str(row_num), cell_text),
            Paragraph("<b>Additional Allowance / Extra Distance</b>", cell_text),
            Paragraph("996412", cell_text),
            Paragraph(f"₹{extra:,.2f}", cell_right),
            Paragraph("0.0%", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"₹{extra:,.2f}", cell_right_bold),
        ])
        row_num += 1

    if discount > 0:
        table_data.append([
            Paragraph("", cell_text),
            Paragraph("<font color='#DC2626'><b>Special Promo / Coupon Discount</b></font>", cell_text),
            Paragraph("-", cell_text),
            Paragraph(f"-₹{discount:,.2f}", cell_right),
            Paragraph("-", ParagraphStyle('CRate', parent=cell_text, alignment=TA_CENTER)),
            Paragraph(f"<font color='#DC2626'>-₹{discount:,.2f}</font>", cell_right_bold),
        ])

    items_table = Table(
        table_data,
        colWidths=[8 * mm, 78 * mm, 22 * mm, 26 * mm, 20 * mm, 28 * mm]
    )
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2 * mm),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))

    # 4. Calculation Totals Box
    grand_total = float(data.get('grand_total', pure_km + total_gst + bata + tolls + permits + extra - discount))
    advance = float(data.get('advance_paid', 0))
    balance = max(0.0, float(data.get('balance_due', grand_total - advance)))
    status_label = "PAID IN FULL" if balance <= 0 else f"BALANCE DUE: ₹{balance:,.2f}"
    status_color = "#166534" if balance <= 0 else "#B45309"

    totals_data = [
        [
            Paragraph("<b>Subtotal (Pure KM Taxable):</b>", cell_text),
            Paragraph(f"₹{pure_km:,.2f}", cell_right),
        ],
        [
            Paragraph("<b>Total GST (CGST 2.5% + SGST 2.5%):</b>", cell_text),
            Paragraph(f"₹{total_gst:,.2f}", cell_right),
        ],
    ]
    if bata > 0:
        totals_data.append([
            Paragraph("<b>Driver Bata (Zero Tax):</b>", cell_text),
            Paragraph(f"₹{bata:,.2f}", cell_right),
        ])
    if (tolls + permits + extra) > 0:
        totals_data.append([
            Paragraph("<b>Tolls, Permits & Extras:</b>", cell_text),
            Paragraph(f"₹{(tolls + permits + extra):,.2f}", cell_right),
        ])
    if discount > 0:
        totals_data.append([
            Paragraph("<font color='#DC2626'><b>Less Discount:</b></font>", cell_text),
            Paragraph(f"<font color='#DC2626'>-₹{discount:,.2f}</font>", cell_right),
        ])

    totals_data.extend([
        [
            Paragraph("<font size=10 color='#1A2B48'><b>GRAND TOTAL:</b></font>", cell_bold),
            Paragraph(f"<font size=10 color='#1A2B48'><b>₹{grand_total:,.2f}</b></font>", cell_right_bold),
        ],
        [
            Paragraph("<font color='#166534'><b>Less Advance Paid:</b></font>", cell_text),
            Paragraph(f"<font color='#166534'>-₹{advance:,.2f}</font>", cell_right),
        ],
        [
            Paragraph(f"<font color='{status_color}'><b>SETTLEMENT STATUS:</b></font>", cell_bold),
            Paragraph(f"<font color='{status_color}'><b>{status_label}</b></font>", cell_right_bold),
        ],
    ])

    totals_table = Table(totals_data, colWidths=[55 * mm, 35 * mm])
    totals_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5 * mm),
        ('BACKGROUND', (0, -3), (-1, -3), colors.HexColor("#F1F5F9")),
        ('LINEABOVE', (0, -3), (-1, -3), 1, PRIMARY),
        ('LINEBELOW', (0, -3), (-1, -3), 1, PRIMARY),
    ]))

    notes_p = Paragraph(
        f"<font size=7.5 color='#64748B'>"
        f"<b>Tax Declaration & Legal Rules:</b><br/>"
        f"1. Service SAC Code 996412 (Passenger Transport). GST paid under Section 9(5) of the CGST Act.<br/>"
        f"2. Tolls, state taxes and parking are statutory pass-through fees collected at actuals where applicable.<br/>"
        f"3. Driver Daily Allowance is personal food & stay allowance for driver and is non-taxable.<br/>"
        f"4. This is a computer-generated official tax invoice, valid without physical signature.<br/><br/>"
        f"<b>Drop Cars Support:</b> 24x7 Helpline +91 72002 17986 | Web: dropcars.in"
        f"</font>",
        cell_text
    )

    bottom_grid = Table(
        [[notes_p, totals_table]],
        colWidths=[90 * mm, 92 * mm]
    )
    bottom_grid.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (1, 0), (1, 0), 2 * mm),
    ]))
    story.append(bottom_grid)
    story.append(Spacer(1, 5 * mm))

    footer_p = Paragraph(
        f"<font size=7 color='#94A3B8'>"
        f"Drop Cars Mobility &bull; Registered in India &bull; GST State Code: 33 (Tamil Nadu) &bull; Page 1 of 1"
        f"</font>",
        ParagraphStyle('Foot', parent=cell_text, alignment=TA_CENTER)
    )
    story.append(footer_p)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
