"""HTML and PDF for invoices and estimates (one layout, driven by the brand on the document).

render_document_html(doc, public=False)  - the page the customer opens from the shared link (public=True adds the pay buttons) and the
                                            page staff print / save as PDF
render_document_pdf(doc)                  - the same content as a real PDF (ReportLab) for e-mail / WhatsApp attachments"""
import html
import io
from typing import Any, Dict, List

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
         "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_100(n: int) -> str:
    return _ONES[n] if n < 20 else (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))


def _below_1000(n: int) -> str:
    out = ""
    if n >= 100:
        out = _ONES[n // 100] + " Hundred"
        n %= 100
        if n:
            out += " "
    return out + (_below_100(n) if n else "")


def amount_in_words(n: int) -> str:
    """Indian numbering: 1,25,000 = One Lakh Twenty Five Thousand."""
    n = int(n or 0)
    if n == 0:
        return "Zero Rupees Only"
    parts = []
    for div, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1000, "Thousand")):
        if n >= div:
            parts.append(_below_1000(n // div) + " " + name)
            n %= div
    if n:
        parts.append(_below_1000(n))
    return " ".join(parts) + " Rupees Only"


def _e(v: Any) -> str:
    return html.escape("" if v is None else str(v))


def _inr(v: Any) -> str:
    try:
        return f"₹{int(round(float(v or 0))):,}"
    except (TypeError, ValueError):
        return "₹0"


def _title(doc: Dict[str, Any]) -> str:
    if doc.get("doc_type") == "ESTIMATE":
        return "ESTIMATE / QUOTATION"
    return "TAX INVOICE" if (doc.get("gst") or {}).get("mode") != "NONE" and (doc.get("brand") or {}).get("gstin") else "INVOICE"


def _terms_list(text: str) -> List[str]:
    return [t.strip() for t in str(text or "").replace("\r", "").split("\n") if t.strip()]


def render_document_html(doc: Dict[str, Any], public: bool = False) -> str:
    b = doc.get("brand") or {}
    c = doc.get("customer") or {}
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    gst = doc.get("gst") or {}
    color = b.get("primary_color") or "#0EA5E9"
    lines = doc.get("lines") or []
    inc = [l for l in lines if l.get("included", True)]
    exc = [l for l in lines if not l.get("included", True)]
    is_est = doc.get("doc_type") == "ESTIMATE"
    mode, coll = gst.get("mode", "NONE"), gst.get("collection", "COLLECT")

    rows = "".join(
        f"<tr><td>{_e(l['label'])}{('<div class=note>' + _e(l.get('note')) + '</div>') if l.get('note') else ''}</td>"
        f"<td class='num'>{_inr(l['amount'])}</td></tr>" for l in inc
    ) or "<tr><td colspan=2 class='muted'>No charges</td></tr>"

    gst_block = ""
    if mode != "NONE":
        if gst.get("interstate"):
            split = f"<tr><td>IGST @ {_e(gst.get('rate'))}%</td><td class='num'>{_inr(tot.get('igst'))}</td></tr>"
        else:
            half = float(gst.get("rate") or 0) / 2
            split = (f"<tr><td>CGST @ {half:g}%</td><td class='num'>{_inr(tot.get('cgst'))}</td></tr>"
                     f"<tr><td>SGST @ {half:g}%</td><td class='num'>{_inr(tot.get('sgst'))}</td></tr>")
        gst_block = (f"<tr><td>Taxable value (SAC {_e(b.get('sac_code') or '9964')})</td><td class='num'>{_inr(tot.get('taxable_value'))}</td></tr>" + split)

    totals = f"<tr><td>Sub total</td><td class='num'>{_inr(tot.get('subtotal') + tot.get('discount', 0))}</td></tr>"
    if tot.get("discount"):
        totals += f"<tr class='disc'><td>{_e(doc.get('discount_label') or 'Discount')}</td><td class='num'>- {_inr(tot['discount'])}</td></tr>"
    totals += gst_block
    if mode == "INCLUDED":
        totals += "<tr><td class='muted' colspan=2>GST is included in the amounts above</td></tr>"
    totals += f"<tr class='grand'><td>Total</td><td class='num'>{_inr(tot.get('total_amount'))}</td></tr>"
    if mode != "NONE" and coll == "SHOW_ONLY":
        totals += (f"<tr class='disc'><td>GST shown for records - not charged</td><td class='num'>- {_inr(tot.get('gst_amount'))}</td></tr>"
                   f"<tr class='grand'><td>Amount payable</td><td class='num'>{_inr(tot.get('amount_due'))}</td></tr>")
    pays = doc.get("payments") or []
    if not is_est:
        for p in pays:
            totals += (f"<tr class='paid'><td>Received - {_e(p.get('mode') or 'Payment')}{(' (' + _e(p.get('ref')) + ')') if p.get('ref') else ''}</td>"
                       f"<td class='num'>- {_inr(p.get('amount'))}</td></tr>")
        totals += f"<tr class='grand bal'><td>Balance due</td><td class='num'>{_inr(tot.get('balance_due'))}</td></tr>"
        if coll == "PAY_LATER" and tot.get("gst_pending"):
            totals += (f"<tr><td class='muted' colspan=2>Of this, GST {_inr(tot.get('gst_pending'))} can be paid later through the GST payment link. "
                       f"The trip amount {_inr(tot.get('payable_now'))} is payable now.</td></tr>")
    elif doc.get("advance_requested"):
        totals += f"<tr class='grand'><td>Advance to confirm the booking</td><td class='num'>{_inr(doc['advance_requested'])}</td></tr>"

    trip_rows = [("Booking", doc.get("booking_ref")), ("From", t.get("pickup")), ("To", t.get("drop")), ("Trip type", t.get("trip_type")),
                 ("Vehicle", t.get("vehicle")), ("Pickup", t.get("start_at")), ("Return", t.get("end_at")),
                 ("Distance", f"{t.get('km')} km" if t.get("km") else None), ("Driver", t.get("driver_name")), ("Vehicle no.", t.get("vehicle_number"))]
    trip_html = "".join(f"<tr><th>{_e(k)}</th><td>{_e(v)}</td></tr>" for k, v in trip_rows if v)

    pk = t.get("package") or {}
    pkg_html = ""
    if pk and (pk.get("itinerary") or pk.get("includes") or pk.get("excludes")):
        def _ul(title, items, ordered=False):
            tag = "ol" if ordered else "ul"
            return (f"<div class='pk'><b>{title}</b><{tag}>" + "".join(f"<li>{_e(x)}</li>" for x in items) + f"</{tag}></div>") if items else ""
        pkg_html = ("<div class='box'><h4>Package - " + _e(pk.get("name") or "") + (f" ({_e(pk.get('days'))} days)" if pk.get("days") else "") + "</h4><div class='pkg'>" +
                    _ul("Itinerary", pk.get("itinerary") or [], True) + _ul("Included", pk.get("includes") or []) + _ul("Not included", pk.get("excludes") or []) + "</div></div>")

    exc_html = ""
    if exc:
        exc_html = ("<div class='box'><h4>Not included in the total - payable on actuals</h4><ul>" +
                    "".join(f"<li>{_e(l['label'])}{(' - ' + _inr(l['amount']) + ' (approx.)') if l.get('amount') else ''}</li>" for l in exc) + "</ul></div>")

    pay_html = ""
    bank = [("Account name", b.get("bank_account_name")), ("Bank", b.get("bank_name")), ("Account no.", b.get("bank_account_number")),
            ("IFSC", b.get("bank_ifsc")), ("Branch", b.get("bank_branch")), ("UPI", b.get("upi_id"))]
    if any(v for _, v in bank):
        pay_html += "<div class='box'><h4>Pay to</h4><table class='kv'>" + "".join(f"<tr><th>{k}</th><td>{_e(v)}</td></tr>" for k, v in bank if v) + "</table></div>"
    if public:
        links = [l for l in (doc.get("payment_links") or []) if l.get("status") not in ("PAID", "CANCELLED", "EXPIRED") and l.get("url")]
        if links:
            pay_html += "<div class='box pay'><h4>Pay online</h4>" + "".join(
                f"<a class='btn' href='{_e(l['url'])}'>Pay {_inr(l.get('amount'))} - {_e(str(l.get('purpose') or 'Payment').title())}</a>" for l in links) + "</div>"

    terms = _terms_list(doc.get("terms"))
    rules = _terms_list(b.get("rules_text"))
    terms_html = ("<div class='box'><h4>Terms &amp; conditions</h4><ol>" + "".join(f"<li>{_e(x)}</li>" for x in terms) + "</ol></div>") if terms else ""
    rules_html = ("<div class='box'><h4>Rules &amp; regulations</h4><ol>" + "".join(f"<li>{_e(x)}</li>" for x in rules) + "</ol></div>") if rules else ""

    cust_lines = [c.get("name"), c.get("company"), c.get("phone"), c.get("email"), c.get("address"), c.get("state")]
    cust_html = "<br>".join(_e(x) for x in cust_lines if x) + (f"<br><b>GSTIN:</b> {_e(c.get('gstin'))}" if c.get("gstin") else "")
    brand_lines = [b.get("legal_name") or b.get("name"), b.get("address"), (f"Phone: {b.get('phone')}" if b.get("phone") else None), b.get("email"), b.get("domain")]
    brand_html = "<br>".join(_e(x) for x in brand_lines if x) + (f"<br><b>GSTIN:</b> {_e(b.get('gstin'))}" if b.get("gstin") else "")
    valid = f"<div class='meta'>Valid until <b>{_e(doc.get('valid_until'))}</b></div>" if is_est and doc.get("valid_until") else ""
    cancelled = "<div class='stamp'>CANCELLED</div>" if doc.get("status") == "CANCELLED" else ""
    pstat = ""
    if not is_est and doc.get("status") != "CANCELLED":
        ps = doc.get("payment_status")
        pstat = f"<span class='pill {ps}'>{'PAID' if ps == 'PAID' else 'PART PAID' if ps == 'PARTIAL' else 'UNPAID'}</span>"

    pb = doc.get("prepared_by") or {}
    prepared_html = ""
    if pb.get("name"):
        who = _e(pb.get("name")) + (f" &middot; {_e(pb.get('phone'))}" if pb.get("phone") else "")
        shared = [s for s in (doc.get("shared_by") or []) if s.get("name") and s.get("name") != pb.get("name")]
        also = (" &nbsp;|&nbsp; Shared by " + ", ".join(sorted({_e(s['name']) for s in shared}))) if shared else ""
        prepared_html = f"<div class='prep'>Prepared by <b>{who}</b>{also} &nbsp;|&nbsp; Questions about this {'estimate' if is_est else 'invoice'}? Call {_e(b.get('phone') or '')}</div>"
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(_title(doc))} {_e(doc.get('number'))}</title>
<style>
:root{{--c:{_e(color)}}} *{{box-sizing:border-box}} body{{font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1e293b;margin:0;background:#f1f5f9}}
.page{{max-width:820px;margin:0 auto;background:#fff;padding:26px 28px;position:relative}}
.head{{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid var(--c);padding-bottom:14px}}
.brand{{font-size:26px;font-weight:800;color:var(--c);letter-spacing:.3px}} .tag{{color:#64748b;font-size:12px}}
.doc{{text-align:right}} .doc h2{{margin:0;font-size:20px;letter-spacing:1px}} .doc .no{{font-weight:700;margin-top:2px}} .meta{{font-size:12px;color:#475569}}
.cols{{display:flex;gap:14px;margin-top:14px}} .col{{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.55}}
.col h4{{margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.8px}}
table{{width:100%;border-collapse:collapse}} .items{{margin-top:14px}} .items th{{background:var(--c);color:#fff;text-align:left;padding:8px 10px;font-size:12px}}
.items td{{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px}} .num{{text-align:right;white-space:nowrap}} th.num{{text-align:right}}
.tot{{width:320px;margin-left:auto;margin-top:10px}} .tot td{{padding:5px 10px;font-size:13px}} .tot .grand td{{font-weight:800;font-size:15px;border-top:2px solid #0f172a}}
.tot .bal td{{color:#b91c1c}} .tot .paid td{{color:#047857}} .tot .disc td{{color:#b45309}} .muted{{color:#64748b;font-size:11.5px}} .note{{color:#64748b;font-size:11px}}
.box{{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12.5px}} .box h4{{margin:0 0 6px;font-size:12px;color:var(--c);text-transform:uppercase;letter-spacing:.6px}}
.box ol,.box ul{{margin:0;padding-left:18px;line-height:1.6}} .kv th{{text-align:left;color:#64748b;font-weight:600;width:120px;padding:2px 0;font-size:12px}} .kv td{{padding:2px 0}}
.words{{margin-top:8px;font-size:12px;color:#334155}} .btn{{display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;background:var(--c);color:#fff;text-decoration:none;border-radius:8px;font-weight:700}}
.pill{{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:800;margin-left:6px}} .pill.PAID{{background:#dcfce7;color:#166534}} .pill.PARTIAL{{background:#fef3c7;color:#92400e}} .pill.UNPAID{{background:#fee2e2;color:#991b1b}}
.foot{{margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end;font-size:12px;color:#475569}} .sign{{text-align:right}}
.stamp{{position:absolute;top:140px;left:50%;transform:translateX(-50%) rotate(-18deg);font-size:64px;font-weight:900;color:rgba(220,38,38,.18);border:6px solid rgba(220,38,38,.18);padding:0 22px}}
.pkg{{display:flex;gap:16px;flex-wrap:wrap}} .pk{{flex:1;min-width:150px}} .pk ul,.pk ol{{margin:4px 0 0;padding-left:18px;line-height:1.55}}
.prep{{margin-top:14px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:11.5px;color:#64748b;text-align:center}}
.print{{text-align:center;padding:12px}} .print a{{display:inline-block;padding:9px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700}}
@media print{{body{{background:#fff}} .print{{display:none}} .page{{padding:0}}}} @media(max-width:560px){{.cols{{flex-direction:column}} .head{{flex-direction:column}} .doc{{text-align:left}} .tot{{width:100%}}}}
</style></head><body>
<div class="print"><a href="javascript:window.print()">Print / Save as PDF</a></div>
<div class="page">{cancelled}
<div class="head"><div><div class="brand">{_e(b.get('name'))}</div><div class="tag">{_e(b.get('tagline'))}</div></div>
<div class="doc"><h2>{_e(_title(doc))}</h2><div class="no">{_e(doc.get('number'))}{pstat}</div><div class="meta">Date: {_e(doc.get('date'))}</div>{valid}</div></div>
<div class="cols"><div class="col"><h4>From</h4>{brand_html}</div><div class="col"><h4>{'Prepared for' if is_est else 'Billed to'}</h4>{cust_html}</div></div>
{('<div class="box"><h4>Trip details</h4><table class="kv">' + trip_html + '</table></div>') if trip_html else ''}
<table class="items"><tr><th>Description</th><th class="num">Amount</th></tr>{rows}</table>
<table class="tot">{totals}</table>
<div class="words"><b>Amount in words:</b> {_e(amount_in_words(tot.get('total_amount') if is_est else (tot.get('balance_due') or tot.get('total_amount'))))}</div>
{pkg_html}{exc_html}{pay_html}
{('<div class="box"><h4>Notes</h4>' + _e(doc.get('notes')) + '</div>') if doc.get('notes') else ''}
{terms_html}{rules_html}
<div class="foot"><div>{_e(b.get('footer_note') or 'Thank you for travelling with us.')}</div><div class="sign">For <b>{_e(b.get('legal_name') or b.get('name'))}</b><br><br>{_e(b.get('signatory') or 'Authorised signatory')}</div></div>
{prepared_html}
</div></body></html>"""


def render_document_pdf(doc: Dict[str, Any]) -> bytes:
    """The same document as a PDF (ReportLab): header with the brand, parties, trip, items, totals, not-included list, pay-to, terms."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    b = doc.get("brand") or {}
    c = doc.get("customer") or {}
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    gst = doc.get("gst") or {}
    is_est = doc.get("doc_type") == "ESTIMATE"
    accent = colors.HexColor(b.get("primary_color") or "#0EA5E9")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=8.5, leading=11, textColor=colors.HexColor("#334155"))
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=9.5, leading=12.5)
    h = ParagraphStyle("h", parent=ss["Normal"], fontSize=9, leading=12, textColor=accent, fontName="Helvetica-Bold")
    big = ParagraphStyle("big", parent=ss["Normal"], fontSize=20, leading=24, textColor=accent, fontName="Helvetica-Bold")
    rt = ParagraphStyle("rt", parent=body, alignment=2)

    def money(v):
        return f"Rs {int(round(float(v or 0))):,}"

    buf = io.BytesIO()
    d = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    s: List[Any] = []
    head = Table([[Paragraph(html.escape(str(b.get("name") or "")), big),
                   Paragraph(f"<b>{html.escape(_title(doc))}</b><br/>{html.escape(str(doc.get('number') or ''))}<br/>Date: {html.escape(str(doc.get('date') or ''))}", rt)]],
                 colWidths=[100 * mm, 82 * mm])
    head.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 2, accent), ("BOTTOMPADDING", (0, 0), (-1, 0), 8), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    s += [head, Spacer(1, 6)]
    frm = "<br/>".join(html.escape(str(x)) for x in [b.get("legal_name") or b.get("name"), b.get("address"), (f"Phone: {b.get('phone')}" if b.get("phone") else None), b.get("email")] if x)
    if b.get("gstin"):
        frm += f"<br/><b>GSTIN:</b> {html.escape(str(b['gstin']))}"
    to = "<br/>".join(html.escape(str(x)) for x in [c.get("name"), c.get("company"), c.get("phone"), c.get("email"), c.get("address")] if x)
    if c.get("gstin"):
        to += f"<br/><b>GSTIN:</b> {html.escape(str(c['gstin']))}"
    parties = Table([[Paragraph("<b>FROM</b><br/>" + frm, small), Paragraph(("<b>PREPARED FOR</b><br/>" if is_est else "<b>BILLED TO</b><br/>") + to, small)]], colWidths=[91 * mm, 91 * mm])
    parties.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.5, colors.HexColor("#CBD5E1")), ("BOX", (1, 0), (1, 0), 0.5, colors.HexColor("#CBD5E1")),
                                 ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 6)]))
    s += [parties, Spacer(1, 6)]
    trip_rows = [(k, v) for k, v in (("Booking", doc.get("booking_ref")), ("From", t.get("pickup")), ("To", t.get("drop")), ("Trip type", t.get("trip_type")),
                                     ("Vehicle", t.get("vehicle")), ("Pickup", t.get("start_at")), ("Distance", f"{t.get('km')} km" if t.get("km") else None),
                                     ("Driver", t.get("driver_name")), ("Vehicle no.", t.get("vehicle_number"))) if v]
    if trip_rows:
        tt = Table([[Paragraph(f"<b>{html.escape(k)}</b>", small), Paragraph(html.escape(str(v)), small)] for k, v in trip_rows], colWidths=[30 * mm, 152 * mm])
        tt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 3)]))
        s += [Paragraph("TRIP DETAILS", h), tt, Spacer(1, 6)]
    inc = [l for l in (doc.get("lines") or []) if l.get("included", True)]
    items = [[Paragraph("<b>Description</b>", ParagraphStyle("w", parent=body, textColor=colors.white)), Paragraph("<b>Amount</b>", ParagraphStyle("w2", parent=rt, textColor=colors.white))]]
    items += [[Paragraph(html.escape(str(l["label"])), body), Paragraph(money(l["amount"]), rt)] for l in inc] or [[Paragraph("No charges", small), ""]]
    it = Table(items, colWidths=[140 * mm, 42 * mm], repeatRows=1)
    it.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), accent), ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 5)]))
    s += [it, Spacer(1, 6)]
    rows = [("Sub total", money(tot.get("subtotal", 0) + tot.get("discount", 0)))]
    if tot.get("discount"):
        rows.append((doc.get("discount_label") or "Discount", "- " + money(tot["discount"])))
    if gst.get("mode") != "NONE":
        rows.append((f"Taxable value (SAC {b.get('sac_code') or '9964'})", money(tot.get("taxable_value"))))
        if gst.get("interstate"):
            rows.append((f"IGST @ {gst.get('rate')}%", money(tot.get("igst"))))
        else:
            half = float(gst.get("rate") or 0) / 2
            rows += [(f"CGST @ {half:g}%", money(tot.get("cgst"))), (f"SGST @ {half:g}%", money(tot.get("sgst")))]
    rows.append(("TOTAL", money(tot.get("total_amount"))))
    if gst.get("mode") != "NONE" and gst.get("collection") == "SHOW_ONLY":
        rows += [("GST shown for records - not charged", "- " + money(tot.get("gst_amount"))), ("AMOUNT PAYABLE", money(tot.get("amount_due")))]
    if not is_est:
        for p in doc.get("payments") or []:
            rows.append((f"Received - {p.get('mode') or 'Payment'}", "- " + money(p.get("amount"))))
        rows.append(("BALANCE DUE", money(tot.get("balance_due"))))
    elif doc.get("advance_requested"):
        rows.append(("Advance to confirm the booking", money(doc["advance_requested"])))
    tt2 = Table([[Paragraph(k, body), Paragraph(v, rt)] for k, v in rows], colWidths=[120 * mm, 42 * mm], hAlign="RIGHT")
    tt2.setStyle(TableStyle([("PADDING", (0, 0), (-1, -1), 3), ("LINEABOVE", (0, len(rows) - 1), (-1, len(rows) - 1), 1, colors.black)]))
    s += [tt2, Spacer(1, 4), Paragraph("<b>Amount in words:</b> " + html.escape(amount_in_words(tot.get("total_amount") if is_est else (tot.get("balance_due") or tot.get("total_amount")))), small), Spacer(1, 6)]
    pk = t.get("package") or {}
    if pk and (pk.get("itinerary") or pk.get("includes") or pk.get("excludes")):
        s += [Paragraph("PACKAGE - " + html.escape(str(pk.get("name") or "")), h)]
        if pk.get("itinerary"):
            s += [Paragraph("<b>Itinerary:</b> " + html.escape(" > ".join(pk["itinerary"])), small)]
        if pk.get("includes"):
            s += [Paragraph("<b>Included:</b> " + html.escape(", ".join(pk["includes"])), small)]
        if pk.get("excludes"):
            s += [Paragraph("<b>Not included:</b> " + html.escape(", ".join(pk["excludes"])), small)]
        s += [Spacer(1, 6)]
    exc = [l for l in (doc.get("lines") or []) if not l.get("included", True)]
    if exc:
        s += [Paragraph("NOT INCLUDED IN THE TOTAL - PAYABLE ON ACTUALS", h), Paragraph("; ".join(html.escape(str(l["label"])) + (f" (approx. {money(l['amount'])})" if l.get("amount") else "") for l in exc), small), Spacer(1, 6)]
    bank = [f"{k}: {v}" for k, v in (("Account name", b.get("bank_account_name")), ("Bank", b.get("bank_name")), ("A/c no.", b.get("bank_account_number")), ("IFSC", b.get("bank_ifsc")), ("UPI", b.get("upi_id"))) if v]
    if bank:
        s += [Paragraph("PAY TO", h), Paragraph(html.escape(" | ".join(bank)), small), Spacer(1, 6)]
    if doc.get("notes"):
        s += [Paragraph("NOTES", h), Paragraph(html.escape(str(doc["notes"])), small), Spacer(1, 6)]
    terms = _terms_list(doc.get("terms"))
    rules = _terms_list(b.get("rules_text"))
    if terms:
        s += [Paragraph("TERMS &amp; CONDITIONS", h)] + [Paragraph(f"{i}. {html.escape(x)}", small) for i, x in enumerate(terms, 1)] + [Spacer(1, 6)]
    if rules:
        s += [Paragraph("RULES &amp; REGULATIONS", h)] + [Paragraph(f"{i}. {html.escape(x)}", small) for i, x in enumerate(rules, 1)] + [Spacer(1, 6)]
    s += [Spacer(1, 10), Paragraph(f"For <b>{html.escape(str(b.get('legal_name') or b.get('name') or ''))}</b> - {html.escape(str(b.get('signatory') or 'Authorised signatory'))}", rt)]
    pb = doc.get("prepared_by") or {}
    if pb.get("name"):
        shared = sorted({str(x["name"]) for x in (doc.get("shared_by") or []) if x.get("name") and x.get("name") != pb.get("name")})
        line = f"Prepared by <b>{html.escape(str(pb['name']))}</b>" + (f" - {html.escape(str(pb['phone']))}" if pb.get("phone") else "")
        if shared:
            line += " | Shared by " + html.escape(", ".join(shared))
        s += [Spacer(1, 4), Paragraph(line, ParagraphStyle("pb", parent=small, alignment=1, textColor=colors.HexColor("#64748b")))]
    d.build(s)
    return buf.getvalue()
