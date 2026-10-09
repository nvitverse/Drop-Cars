"""HTML and PDF for invoices and estimates (one layout, driven by the brand on the document).

render_document_html(doc, public=False)  - the page the customer opens from the shared link (public=True adds the pay buttons) and the
                                            page staff print / save as PDF
render_document_pdf(doc)                  - the same content as a real PDF (ReportLab) for e-mail / WhatsApp attachments

What prints at the top is exactly what the Owner typed for the brand: the NAME (nothing is appended to it), the TAGLINE under it, and the
HIGHLIGHTS strip. At the bottom the brand's SLOGAN (footer line) and "Prepared by <staff>" print. Nothing here is fixed text per brand."""
import html
import io
import urllib.parse
from typing import Any, Dict, List, Optional

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


def _clamp_color(c: Optional[str]) -> str:
    c = (c or "").strip()
    return c if len(c) in (4, 7) and c.startswith("#") and all(ch in "0123456789abcdefABCDEF" for ch in c[1:]) else "#0EA5E9"


def _rgb(hex_color: str):
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _shade(hex_color: str, f: float) -> str:
    """Darken (f<1) or lighten (f>1) a #RRGGBB colour."""
    r, g, b = _rgb(hex_color)
    if f <= 1:
        r, g, b = int(r * f), int(g * f), int(b * f)
    else:
        r, g, b = (int(v + (255 - v) * (f - 1)) for v in (r, g, b))
    return f"#{min(r, 255):02X}{min(g, 255):02X}{min(b, 255):02X}"


def _is_dark(hex_color: str) -> bool:
    r, g, b = _rgb(hex_color)
    return (0.299 * r + 0.587 * g + 0.114 * b) < 160


def _highlights(b: Dict[str, Any]) -> List[str]:
    return [x.strip(" -*•\t") for x in str(b.get("highlights") or "").replace("\r", "").replace("|", "\n").split("\n") if x.strip(" -*•\t")]


def _inc_exc(doc: Dict[str, Any]):
    """The two plain lists an estimate shows (like the website's estimate): what the fare includes, and what is paid on actuals."""
    t = doc.get("trip") or {}
    pk = t.get("package") or {}
    lines = doc.get("lines") or []
    inc, exc, seen = [], [], set()
    for l in lines:
        name = str(l.get("label") or "").split(" (")[0].strip()
        if l.get("included", True):
            if l.get("kind") == "CHARGE" and name and name.lower() not in seen:
                inc.append(name)
                seen.add(name.lower())
        elif name and name.lower() not in seen:
            exc.append(name + (f" (approx. {_inr(l['amount'])})" if l.get("amount") else ""))
            seen.add(name.lower())
    for x in pk.get("includes") or []:
        if str(x).lower() not in seen:
            inc.append(str(x))
            seen.add(str(x).lower())
    for x in pk.get("excludes") or []:
        if str(x).lower() not in seen:
            exc.append(str(x))
            seen.add(str(x).lower())
    return inc, exc


def _payable_now(doc: Dict[str, Any]) -> int:
    tot = doc.get("totals") or {}
    if doc.get("doc_type") == "ESTIMATE":
        return int(doc.get("advance_requested") or 0)
    return int(tot.get("payable_now") or tot.get("balance_due") or 0)


def _upi_uri(doc: Dict[str, Any]) -> Optional[str]:
    b = doc.get("brand") or {}
    upi = (b.get("upi_id") or "").strip()
    if not upi or doc.get("status") in ("CANCELLED", "DRAFT"):
        return None
    amt = _payable_now(doc)
    if doc.get("doc_type") != "ESTIMATE" and amt <= 0:
        return None
    q = {"pa": upi, "pn": b.get("legal_name") or b.get("name") or "", "cu": "INR", "tn": str(doc.get("number") or "")}
    if amt > 0:
        q["am"] = str(amt)
    return "upi://pay?" + urllib.parse.urlencode(q, quote_via=urllib.parse.quote)


def _qr_drawing(data: str, size: float):
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    w = QrCodeWidget(data)
    x0, y0, x1, y1 = w.getBounds()
    d = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
    d.add(w)
    return d


def _qr_svg(data: str, size: int = 112) -> str:
    try:
        from reportlab.graphics import renderSVG
        s = renderSVG.drawToString(_qr_drawing(data, size))
        s = s.decode("utf-8") if isinstance(s, bytes) else s
        return s[s.index("<svg"):]
    except Exception:
        return ""


def render_document_html(doc: Dict[str, Any], public: bool = False) -> str:
    b = doc.get("brand") or {}
    c = doc.get("customer") or {}
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    gst = doc.get("gst") or {}
    color = _clamp_color(b.get("primary_color"))
    serif = str(b.get("font_style") or "").upper() == "SERIF"
    dark = _shade(color, 0.36 if serif else 0.62)
    soft = "#F8F0E4" if serif else _shade(color, 1.9)
    gold = _clamp_color(b.get("secondary_color")) if b.get("secondary_color") else _shade(color, 1.35)
    page_bg = "#F5EFE6" if serif else "#e2e8f0"
    on_color = "#FFFFFF" if _is_dark(color) else "#0F172A"
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
    total_label = ("Grand Total" + (" (incl. GST)" if mode != "NONE" and coll == "COLLECT" else "")) if is_est else "Total"
    totals += f"<tr class='grand'><td>{total_label}</td><td class='num'>{_inr(tot.get('total_amount'))}</td></tr>"
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
        pct = round(100 * int(doc["advance_requested"]) / int(tot.get("total_amount") or 1)) if tot.get("total_amount") else 0
        totals += f"<tr class='grand adv'><td>Advance Required{(' (' + str(pct) + '%)') if pct else ''}</td><td class='num'>{_inr(doc['advance_requested'])}</td></tr>"

    # trip: the route drawn as From -> To, the rest as small facts
    route_html = ""
    if t.get("pickup") or t.get("drop"):
        route_html = (f"<div class='route'><div class='stop'><span>FROM</span><b>{_e(t.get('pickup') or '-')}</b></div><div class='arrow'>&#10132;</div>"
                      f"<div class='stop'><span>TO</span><b>{_e(t.get('drop') or '-')}</b></div></div>")
    facts = [("Booking", doc.get("booking_ref")), ("Trip type", t.get("trip_type")), ("Vehicle", t.get("vehicle")), ("Pickup", t.get("start_at")),
             ("Return", t.get("end_at")), ("Distance", f"{t.get('km')} km" if t.get("km") else None), ("Driver", t.get("driver_name")), ("Vehicle no.", t.get("vehicle_number"))]
    facts_html = "".join(f"<div class='fact'><span>{_e(k)}</span><b>{_e(v)}</b></div>" for k, v in facts if v)
    trip_html = (route_html + (f"<div class='facts'>{facts_html}</div>" if facts_html else "")) if (route_html or facts_html) else ""

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

    if is_est:
        inc_l, exc_l = _inc_exc(doc)
        if inc_l or exc_l:
            def _col(title, items):
                return (f"<div class='pk'><b>{title}</b><ul>" + "".join(f"<li>{_e(x)}</li>" for x in items) + "</ul></div>") if items else ""
            exc_html = "<div class='box'><div class='pkg'>" + _col("Includes", inc_l) + _col("Excludes - paid on actuals", exc_l) + "</div></div>"

    bank = [("Account name", b.get("bank_account_name")), ("Bank", b.get("bank_name")), ("Account no.", b.get("bank_account_number")),
            ("IFSC", b.get("bank_ifsc")), ("Branch", b.get("bank_branch")), ("UPI", b.get("upi_id"))]
    bank_html = ("<table class='kv'>" + "".join(f"<tr><th>{k}</th><td>{_e(v)}</td></tr>" for k, v in bank if v) + "</table>") if any(v for _, v in bank) else ""
    uri = _upi_uri(doc)
    qr_html = ""
    if uri:
        amt = _payable_now(doc)
        qr_html = f"<div class='qr'>{_qr_svg(uri)}<div>Scan to pay with any UPI app{(' - ' + _inr(amt)) if amt else ''}</div></div>"
    pay_html = ""
    if bank_html or qr_html:
        pay_html += f"<div class='box payto'><div><h4>Pay to</h4>{bank_html}</div>{qr_html}</div>"
    if public:
        links = [l for l in (doc.get("payment_links") or []) if l.get("status") not in ("PAID", "CANCELLED", "EXPIRED") and l.get("url")]
        if links:
            pay_html += "<div class='box pay'><h4>Pay online</h4>" + "".join(
                f"<a class='btn' href='{_e(l['url'])}'>Pay {_inr(l.get('amount'))} - {_e(str(l.get('purpose') or 'Payment').title())}</a>" for l in links) + "</div>"

    terms = _terms_list(doc.get("terms"))
    rules = _terms_list(b.get("rules_text"))
    terms_html = ("<div class='box'><h4>Terms &amp; conditions</h4><ol>" + "".join(f"<li>{_e(x)}</li>" for x in terms) + "</ol></div>") if terms else ""
    rules_html = ("<div class='box'><h4>Rules, policies &amp; regulations</h4><ol>" + "".join(f"<li>{_e(x)}</li>" for x in rules) + "</ol></div>") if rules else ""

    cust_lines = [c.get("name"), c.get("company"), c.get("phone"), c.get("email"), c.get("address"), c.get("state")]
    cust_html = "<br>".join(_e(x) for x in cust_lines if x) + (f"<br><b>GSTIN:</b> {_e(c.get('gstin'))}" if c.get("gstin") else "")
    brand_lines = [b.get("legal_name") or b.get("name"), b.get("address"), (f"Phone: {b.get('phone')}" if b.get("phone") else None), b.get("email")]
    brand_html = "<br>".join(_e(x) for x in brand_lines if x) + (f"<br><b>GSTIN:</b> {_e(b.get('gstin'))}" if b.get("gstin") else "") + (f"<br><b>PAN:</b> {_e(b.get('pan'))}" if b.get("pan") else "")
    valid = f"<div class='validity'>Valid until <b>{_e(doc.get('valid_until'))}</b></div>" if is_est and doc.get("valid_until") else ""
    cancelled = "<div class='stamp'>CANCELLED</div>" if doc.get("status") == "CANCELLED" else ""
    pstat = ""
    if not is_est and doc.get("status") != "CANCELLED":
        ps = doc.get("payment_status")
        pstat = f"<span class='pill {ps}'>{'PAID' if ps == 'PAID' else 'PART PAID' if ps == 'PARTIAL' else 'UNPAID'}</span>"

    body_font = "'Hanken Grotesk',Segoe UI,Roboto,Arial,sans-serif" if serif else "Segoe UI,Roboto,Arial,sans-serif"
    font_link = ("<link rel='preconnect' href='https://fonts.googleapis.com'><link href='https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap' rel='stylesheet'>") if serif else ""
    serif_css = (".brand,.slogan,.doc .no{{font-family:'Cormorant Garamond',Georgia,serif}} .brand{{font-size:36px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}} .tag{{font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;letter-spacing:.5px}} "
                 ".slogan{{font-size:19px}} .band .tag,.doc h2,.box h4,.col h4{{letter-spacing:2px}}").replace("{{", "{").replace("}}", "}") if serif else ""
    chips = "".join(f"<span class='chip'>{_e(x)}</span>" for x in _highlights(b))
    tagline = f"<div class='tag'>{_e(b.get('tagline'))}</div>" if b.get("tagline") else ""
    contact = " &nbsp;&bull;&nbsp; ".join(_e(x) for x in [b.get("phone"), b.get("email"), b.get("domain")] if x)
    slogan = _e(b.get("footer_note") or "")

    pb = doc.get("prepared_by") or {}
    prepared_html = ""
    if pb.get("name"):
        who = _e(pb.get("name")) + (f" &middot; {_e(pb.get('phone'))}" if pb.get("phone") else "")
        shared = [s for s in (doc.get("shared_by") or []) if s.get("name") and s.get("name") != pb.get("name")]
        also = (" &nbsp;|&nbsp; Shared by " + ", ".join(sorted({_e(s['name']) for s in shared}))) if shared else ""
        prepared_html = f"<div class='prep'>Prepared by <b>{who}</b>{also} &nbsp;|&nbsp; Questions about this {'estimate' if is_est else 'invoice'}? Call {_e(b.get('phone') or '')}</div>"

    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(_title(doc))} {_e(doc.get('number'))}</title>
{font_link}<style>
:root{{--c:{color};--d:{dark};--s:{soft};--on:{on_color};--g:{gold}}} *{{box-sizing:border-box}} body{{font-family:{body_font};color:#1e293b;margin:0;background:{page_bg}}}
.page{{max-width:840px;margin:0 auto;background:#fff;position:relative;overflow:hidden}}
.band{{background:linear-gradient(120deg,var(--d),var(--c));color:var(--on);padding:24px 28px 18px;border-bottom:4px solid var(--g)}}
.band .top{{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}}
.brand{{font-size:30px;font-weight:800;letter-spacing:.4px;line-height:1.1}} .tag{{margin-top:5px;font-size:13.5px;font-style:italic;opacity:.92}}
.chips{{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}} .chip{{font-size:11px;padding:3px 10px;border-radius:12px;background:rgba(255,255,255,.14);border:1px solid var(--g)}}
.doc{{text-align:right;min-width:210px}} .doc h2{{margin:0;font-size:15px;letter-spacing:1.6px;font-weight:700;opacity:.95}} .doc .no{{font-weight:800;font-size:19px;margin-top:4px}}
.doc .dt{{font-size:12px;opacity:.9;margin-top:2px}} .validity{{display:inline-block;margin-top:8px;background:#fff;color:var(--d);border-radius:12px;padding:3px 11px;font-size:11.5px}}
.contact{{margin-top:14px;padding-top:9px;border-top:1px solid rgba(255,255,255,.3);font-size:12px;opacity:.95}}
.body{{padding:20px 28px 24px}}
.cols{{display:flex;gap:14px}} .col{{flex:1;background:var(--s);border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.55}}
.col h4{{margin:0 0 5px;font-size:10.5px;color:var(--d);text-transform:uppercase;letter-spacing:1px}}
.route{{display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px 14px;border:1.5px solid var(--c);border-radius:12px}} .stop{{flex:1}}
.stop span{{display:block;font-size:10px;letter-spacing:1px;color:#64748b}} .stop b{{font-size:15px}} .arrow{{color:var(--c);font-size:22px}}
.facts{{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}} .fact{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px}}
.fact span{{display:block;font-size:9.5px;color:#64748b;letter-spacing:.8px;text-transform:uppercase}}
table{{width:100%;border-collapse:collapse}} .items{{margin-top:14px;border-radius:10px;overflow:hidden}} .items th{{background:var(--c);color:var(--on);text-align:left;padding:9px 11px;font-size:12px;letter-spacing:.5px}}
.items td{{padding:9px 11px;border-bottom:1px solid #e2e8f0;font-size:13px}} .items tr:nth-child(even) td{{background:#f8fafc}} .num{{text-align:right;white-space:nowrap}} th.num{{text-align:right}}
.tot{{width:340px;margin-left:auto;margin-top:12px}} .tot td{{padding:5px 11px;font-size:13px}} .tot .grand td{{font-weight:800;font-size:15.5px;background:var(--s);color:#0f172a;border-bottom:2px solid var(--g)}}
.tot .grand td:first-child{{border-radius:8px 0 0 8px}} .tot .grand td:last-child{{border-radius:0 8px 8px 0}}
.tot .bal td{{color:#b91c1c}} .tot .paid td{{color:#047857}} .tot .disc td{{color:#b45309}} .tot .adv td{{background:var(--c);color:var(--on)}} .muted{{color:#64748b;font-size:11.5px}} .note{{color:#64748b;font-size:11px}}
.box{{border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;margin-top:13px;font-size:12.5px}} .box h4{{margin:0 0 6px;font-size:11.5px;color:var(--d);text-transform:uppercase;letter-spacing:.8px}}
.box ol,.box ul{{margin:0;padding-left:18px;line-height:1.6}} .kv th{{text-align:left;color:#64748b;font-weight:600;width:110px;padding:2px 0;font-size:12px}} .kv td{{padding:2px 0}}
.payto{{display:flex;gap:18px;align-items:center;justify-content:space-between}} .qr{{text-align:center;font-size:10.5px;color:#475569;max-width:150px}} .qr svg{{width:112px;height:112px}}
.pkg{{display:flex;gap:16px;flex-wrap:wrap}} .pk{{flex:1;min-width:150px}} .pk ul,.pk ol{{margin:4px 0 0;padding-left:18px;line-height:1.55}}
.words{{margin-top:9px;font-size:12px;color:#334155}} .btn{{display:inline-block;margin:4px 8px 4px 0;padding:11px 18px;background:var(--c);color:var(--on);text-decoration:none;border-radius:9px;font-weight:700}}
.pill{{display:inline-block;padding:2px 10px;border-radius:12px;font-size:10.5px;font-weight:800;margin-left:8px;vertical-align:middle}} .pill.PAID{{background:#dcfce7;color:#166534}} .pill.PARTIAL{{background:#fef3c7;color:#92400e}} .pill.UNPAID{{background:#fee2e2;color:#991b1b}}
.slogan{{margin-top:22px;padding-top:14px;border-top:1px solid var(--g);text-align:center;font-size:15px;font-style:italic;color:var(--d);font-weight:600}}
.foot{{margin-top:14px;display:flex;justify-content:flex-end;font-size:12px;color:#475569}} .sign{{text-align:right}}
.stamp{{position:absolute;top:210px;left:50%;transform:translateX(-50%) rotate(-18deg);font-size:64px;font-weight:900;color:rgba(220,38,38,.18);border:6px solid rgba(220,38,38,.18);padding:0 22px;z-index:2}}
.prep{{margin-top:12px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:11.5px;color:#64748b;text-align:center}}
.endband{{height:8px;background:linear-gradient(90deg,var(--d),var(--c),var(--g))}}
.print{{text-align:center;padding:12px}} .print a{{display:inline-block;padding:9px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700}}
@media print{{body{{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}} .print{{display:none}}}}
@media(max-width:600px){{.cols{{flex-direction:column}} .band .top{{flex-direction:column}} .doc{{text-align:left}} .tot{{width:100%}} .brand{{font-size:24px}} .payto{{flex-direction:column;align-items:flex-start}} .route{{flex-direction:column;align-items:flex-start}} .arrow{{transform:rotate(90deg)}}}}
{serif_css}</style></head><body>
<div class="print"><a href="javascript:window.print()">Print / Save as PDF</a></div>
<div class="page">{cancelled}
<div class="band"><div class="top"><div><div class="brand">{_e(b.get('name'))}</div>{tagline}{('<div class="chips">' + chips + '</div>') if chips else ''}</div>
<div class="doc"><h2>{_e(_title(doc))}</h2><div class="no">{_e(doc.get('number'))}{pstat}</div><div class="dt">Date: {_e(doc.get('date'))}</div>{valid}</div></div>
{('<div class="contact">' + contact + '</div>') if contact else ''}</div>
<div class="body">
<div class="cols"><div class="col"><h4>From</h4>{brand_html}</div><div class="col"><h4>{'Prepared for' if is_est else 'Billed to'}</h4>{cust_html}</div></div>
{trip_html}
<table class="items"><tr><th>Description</th><th class="num">Amount</th></tr>{rows}</table>
<table class="tot">{totals}</table>
<div class="words"><b>Amount in words:</b> {_e(amount_in_words(tot.get('total_amount') if is_est else (tot.get('balance_due') or tot.get('total_amount'))))}</div>
{pkg_html}{exc_html}{pay_html}
{('<div class="box"><h4>Notes</h4>' + _e(doc.get('notes')) + '</div>') if doc.get('notes') else ''}
{terms_html}{rules_html}
<div class="foot"><div class="sign">For <b>{_e(b.get('legal_name') or b.get('name'))}</b><br><br>{_e(b.get('signatory') or 'Authorised signatory')}</div></div>
{('<div class="slogan">' + slogan + '</div>') if slogan else ''}
{prepared_html}
</div><div class="endband"></div>
</div></body></html>"""


def render_document_pdf(doc: Dict[str, Any]) -> bytes:
    """The same document as a PDF (ReportLab): coloured brand band (name, tagline, highlights, contact), parties, route, items, totals, UPI QR, terms, slogan."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    b = doc.get("brand") or {}
    c = doc.get("customer") or {}
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    gst = doc.get("gst") or {}
    is_est = doc.get("doc_type") == "ESTIMATE"
    hexc = _clamp_color(b.get("primary_color"))
    serif = str(b.get("font_style") or "").upper() == "SERIF"
    accent = colors.HexColor(hexc)
    deep = colors.HexColor(_shade(hexc, 0.36 if serif else 0.62))
    soft = colors.HexColor("#F8F0E4" if serif else _shade(hexc, 1.9))
    gold = colors.HexColor(_clamp_color(b.get("secondary_color")) if b.get("secondary_color") else _shade(hexc, 1.35))
    on = colors.white if _is_dark(hexc) else colors.HexColor("#0F172A")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=8.5, leading=11, textColor=colors.HexColor("#334155"))
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=9.5, leading=12.5)
    h = ParagraphStyle("h", parent=ss["Normal"], fontSize=9, leading=12, textColor=deep, fontName="Helvetica-Bold")
    big = ParagraphStyle("big", parent=ss["Normal"], fontSize=25 if serif else 23, leading=28 if serif else 26, textColor=on, fontName="Times-Bold" if serif else "Helvetica-Bold")
    tag = ParagraphStyle("tag", parent=ss["Normal"], fontSize=11 if serif else 10, leading=14, textColor=on, fontName="Times-Italic" if serif else "Helvetica-Oblique")
    chipst = ParagraphStyle("chip", parent=ss["Normal"], fontSize=8, leading=11, textColor=on)
    rt = ParagraphStyle("rt", parent=body, alignment=2)
    rt_on = ParagraphStyle("rton", parent=body, alignment=2, textColor=on)
    slog = ParagraphStyle("slog", parent=ss["Normal"], fontSize=13 if serif else 11.5, leading=16, alignment=1, textColor=deep, fontName="Times-BoldItalic" if serif else "Helvetica-BoldOblique")

    def money(v):
        return f"Rs {int(round(float(v or 0))):,}"

    buf = io.BytesIO()
    d = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=10 * mm, bottomMargin=12 * mm)
    s: List[Any] = []

    left = [Paragraph(html.escape(str(b.get("name") or "")), big)]
    if b.get("tagline"):
        left.append(Paragraph(html.escape(str(b["tagline"])), tag))
    hl = _highlights(b)
    if hl:
        left.append(Spacer(1, 3))
        left.append(Paragraph(" &nbsp;&bull;&nbsp; ".join(html.escape(x) for x in hl), chipst))
    right_txt = f"<b>{html.escape(_title(doc))}</b><br/><font size=13><b>{html.escape(str(doc.get('number') or ''))}</b></font><br/>Date: {html.escape(str(doc.get('date') or ''))}"
    if is_est and doc.get("valid_until"):
        right_txt += f"<br/>Valid until {html.escape(str(doc['valid_until']))}"
    contact = "  |  ".join(str(x) for x in [b.get("phone"), b.get("email"), b.get("domain")] if x)
    band_rows = [[left, Paragraph(right_txt, rt_on)]]
    if contact:
        band_rows.append([Paragraph(html.escape(contact), chipst), ""])
    band = Table(band_rows, colWidths=[118 * mm, 64 * mm])
    band_style = [("BACKGROUND", (0, 0), (-1, -1), accent), ("LINEBELOW", (0, -1), (-1, -1), 3, gold), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                  ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, 0), (-1, 0), 8)]
    if contact:
        band_style += [("SPAN", (0, 1), (1, 1)), ("LINEABOVE", (0, 1), (-1, 1), 0.6, on), ("TOPPADDING", (0, 1), (-1, 1), 5), ("BOTTOMPADDING", (0, 1), (-1, 1), 6)]
    band.setStyle(TableStyle(band_style))
    s += [band, Spacer(1, 7)]

    frm = "<br/>".join(html.escape(str(x)) for x in [b.get("legal_name") or b.get("name"), b.get("address"), (f"Phone: {b.get('phone')}" if b.get("phone") else None), b.get("email")] if x)
    if b.get("gstin"):
        frm += f"<br/><b>GSTIN:</b> {html.escape(str(b['gstin']))}"
    if b.get("pan"):
        frm += f"<br/><b>PAN:</b> {html.escape(str(b['pan']))}"
    to = "<br/>".join(html.escape(str(x)) for x in [c.get("name"), c.get("company"), c.get("phone"), c.get("email"), c.get("address")] if x)
    if c.get("gstin"):
        to += f"<br/><b>GSTIN:</b> {html.escape(str(c['gstin']))}"
    parties = Table([[Paragraph("<b>FROM</b><br/>" + frm, small), Paragraph(("<b>PREPARED FOR</b><br/>" if is_est else "<b>BILLED TO</b><br/>") + to, small)]], colWidths=[91 * mm, 91 * mm])
    parties.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), soft), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 7),
                                 ("LINEAFTER", (0, 0), (0, 0), 4, colors.white)]))
    s += [parties, Spacer(1, 6)]

    if t.get("pickup") or t.get("drop"):
        rt_tbl = Table([[Paragraph(f"<font size=7 color='#64748b'>FROM</font><br/><b>{html.escape(str(t.get('pickup') or '-'))}</b>", body),
                         Paragraph("<font color='%s' size=14>&gt;&gt;</font>" % hexc, ParagraphStyle("ar", parent=body, alignment=1)),
                         Paragraph(f"<font size=7 color='#64748b'>TO</font><br/><b>{html.escape(str(t.get('drop') or '-'))}</b>", body)]], colWidths=[78 * mm, 26 * mm, 78 * mm])
        rt_tbl.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1, accent), ("PADDING", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        s += [rt_tbl, Spacer(1, 4)]
    facts = [(k, v) for k, v in (("Booking", doc.get("booking_ref")), ("Trip type", t.get("trip_type")), ("Vehicle", t.get("vehicle")), ("Pickup", t.get("start_at")),
                                 ("Return", t.get("end_at")), ("Distance", f"{t.get('km')} km" if t.get("km") else None), ("Driver", t.get("driver_name")),
                                 ("Vehicle no.", t.get("vehicle_number"))) if v]
    if facts:
        cells = [Paragraph(f"<font size=6.5 color='#64748b'>{html.escape(k.upper())}</font><br/><b>{html.escape(str(v))}</b>", small) for k, v in facts]
        while len(cells) % 4:
            cells.append("")
        grid = Table([cells[i:i + 4] for i in range(0, len(cells), 4)], colWidths=[45.5 * mm] * 4)
        grid.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 4), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        s += [grid, Spacer(1, 6)]

    inc = [l for l in (doc.get("lines") or []) if l.get("included", True)]
    items = [[Paragraph("<b>Description</b>", ParagraphStyle("w", parent=body, textColor=on)), Paragraph("<b>Amount</b>", ParagraphStyle("w2", parent=rt, textColor=on))]]
    items += [[Paragraph(html.escape(str(l["label"])), body), Paragraph(money(l["amount"]), rt)] for l in inc] or [[Paragraph("No charges", small), ""]]
    it = Table(items, colWidths=[140 * mm, 42 * mm], repeatRows=1)
    it.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), accent), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                            ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 5)]))
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
    rows.append((("GRAND TOTAL" + (" (incl. GST)" if gst.get("mode") != "NONE" and gst.get("collection") == "COLLECT" else "")) if is_est else "TOTAL", money(tot.get("total_amount"))))
    grand_idx = [len(rows) - 1]
    if gst.get("mode") != "NONE" and gst.get("collection") == "SHOW_ONLY":
        rows += [("GST shown for records - not charged", "- " + money(tot.get("gst_amount"))), ("AMOUNT PAYABLE", money(tot.get("amount_due")))]
        grand_idx.append(len(rows) - 1)
    if not is_est:
        for p in doc.get("payments") or []:
            rows.append((f"Received - {p.get('mode') or 'Payment'}", "- " + money(p.get("amount"))))
        rows.append(("BALANCE DUE", money(tot.get("balance_due"))))
        grand_idx.append(len(rows) - 1)
    elif doc.get("advance_requested"):
        pct = round(100 * int(doc["advance_requested"]) / int(tot.get("total_amount") or 1)) if tot.get("total_amount") else 0
        rows.append((f"Advance Required{(' (' + str(pct) + '%)') if pct else ''}", money(doc["advance_requested"])))
        grand_idx.append(len(rows) - 1)
    tt2 = Table([[Paragraph(k, body), Paragraph(v, rt)] for k, v in rows], colWidths=[120 * mm, 42 * mm], hAlign="RIGHT")
    st = [("PADDING", (0, 0), (-1, -1), 3)] + [("BACKGROUND", (0, i), (-1, i), soft) for i in grand_idx]
    tt2.setStyle(TableStyle(st))
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
    if is_est:
        inc_l, exc_l = _inc_exc(doc)
        if inc_l:
            s += [Paragraph("<b>Includes:</b> " + html.escape(" · ".join(inc_l)), small)]
        if exc_l:
            s += [Paragraph("<b>Excludes (paid on actuals):</b> " + html.escape(" · ".join(exc_l)), small)]
        if inc_l or exc_l:
            s += [Spacer(1, 6)]
    elif exc:
        s += [Paragraph("NOT INCLUDED IN THE TOTAL - PAYABLE ON ACTUALS", h), Paragraph("; ".join(html.escape(str(l["label"])) + (f" (approx. {money(l['amount'])})" if l.get("amount") else "") for l in exc), small), Spacer(1, 6)]

    bank = [f"{k}: {v}" for k, v in (("Account name", b.get("bank_account_name")), ("Bank", b.get("bank_name")), ("A/c no.", b.get("bank_account_number")), ("IFSC", b.get("bank_ifsc")), ("UPI", b.get("upi_id"))) if v]
    uri = _upi_uri(doc)
    if bank or uri:
        left_cell = [Paragraph("PAY TO", h), Paragraph(html.escape(" | ".join(bank)) if bank else "", small)]
        right_cell: Any = ""
        if uri:
            amt = _payable_now(doc)
            try:
                right_cell = [_qr_drawing(uri, 30 * mm), Paragraph("Scan to pay (UPI)" + (f" - {money(amt)}" if amt else ""), ParagraphStyle("q", parent=small, alignment=1, fontSize=7))]
            except Exception:
                right_cell = ""
        pay = Table([[left_cell, right_cell]], colWidths=[142 * mm, 40 * mm])
        pay.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")), ("PADDING", (0, 0), (-1, -1), 6), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        s += [pay, Spacer(1, 6)]
    if doc.get("notes"):
        s += [Paragraph("NOTES", h), Paragraph(html.escape(str(doc["notes"])), small), Spacer(1, 6)]
    terms = _terms_list(doc.get("terms"))
    rules = _terms_list(b.get("rules_text"))
    if terms:
        s += [Paragraph("TERMS &amp; CONDITIONS", h)] + [Paragraph(f"{i}. {html.escape(x)}", small) for i, x in enumerate(terms, 1)] + [Spacer(1, 6)]
    if rules:
        s += [Paragraph("RULES, POLICIES &amp; REGULATIONS", h)] + [Paragraph(f"{i}. {html.escape(x)}", small) for i, x in enumerate(rules, 1)] + [Spacer(1, 6)]

    closing: List[Any] = [Spacer(1, 8), Paragraph(f"For <b>{html.escape(str(b.get('legal_name') or b.get('name') or ''))}</b> - {html.escape(str(b.get('signatory') or 'Authorised signatory'))}", rt)]
    if b.get("footer_note"):
        closing += [Spacer(1, 10), Paragraph(html.escape(str(b["footer_note"])), slog)]
    pb = doc.get("prepared_by") or {}
    if pb.get("name"):
        shared = sorted({str(x["name"]) for x in (doc.get("shared_by") or []) if x.get("name") and x.get("name") != pb.get("name")})
        line = f"Prepared by <b>{html.escape(str(pb['name']))}</b>" + (f" - {html.escape(str(pb['phone']))}" if pb.get("phone") else "")
        if shared:
            line += " | Shared by " + html.escape(", ".join(shared))
        closing += [Spacer(1, 4), Paragraph(line, ParagraphStyle("pb", parent=small, alignment=1, textColor=colors.HexColor("#64748b")))]
    closing += [Spacer(1, 6), Table([[""]], colWidths=[182 * mm], rowHeights=[3 * mm], style=[("BACKGROUND", (0, 0), (-1, -1), accent)])]
    s += [KeepTogether(closing)]
    d.build(s)
    return buf.getvalue()
