"""HTML and PDF for invoices and estimates (one layout, driven by the brand on the document).

render_document_html(doc, public=False, links=None)  - the page the customer opens from the shared link (public=True adds the pay / confirm buttons)
                                                        and the page staff print / save as PDF
render_document_pdf(doc)                              - the same content as a real PDF (ReportLab) for e-mail / WhatsApp attachments

What prints at the top is exactly what the Owner typed for the brand: the NAME (nothing is appended to it), the TAGLINE under it, the HIGHLIGHTS
strip and the colours / type style. At the bottom the brand's SLOGAN, the signature lines and "Prepared by <staff>" print. Nothing here is fixed
text per brand. Every phone, e-mail, website, route and WhatsApp mention is a real link."""
import html
import io
import re
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

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


def _digits(v: Any) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _wa_number(b: Dict[str, Any]) -> str:
    d = _digits(b.get("whatsapp") or b.get("phone"))
    return ("91" + d) if len(d) == 10 else d


def _tel(v: Any) -> str:
    d = _digits(v)
    return f"tel:+91{d}" if len(d) == 10 else f"tel:+{d}" if d else ""


def _site(domain: Any) -> str:
    d = str(domain or "").strip()
    return d if d.startswith("http") else (f"https://{d}" if d else "")


def _maps_url(t: Dict[str, Any]) -> str:
    if not (t.get("pickup") and t.get("drop")):
        return ""
    q = {"api": "1", "origin": t["pickup"], "destination": t["drop"], "travelmode": "driving"}
    via = [str(x) for x in (t.get("via") or []) if str(x).strip()]
    if via:
        q["waypoints"] = "|".join(via)
    return "https://www.google.com/maps/dir/?" + urllib.parse.urlencode(q, quote_via=urllib.parse.quote)


def _wa_confirm_url(doc: Dict[str, Any]) -> str:
    b = doc.get("brand") or {}
    num = _wa_number(b)
    if not num:
        return ""
    t = doc.get("trip") or {}
    kind = "estimate" if doc.get("doc_type") == "ESTIMATE" else "invoice"
    route = f" for {t['pickup']} to {t['drop']}" if t.get("pickup") and t.get("drop") else ""
    if doc.get("doc_type") == "ESTIMATE":
        msg = f"Hello {b.get('name') or ''}, I confirm {kind} {doc.get('number')}{route}. Please go ahead with the booking."
    else:
        msg = f"Hello {b.get('name') or ''}, I have a question about {kind} {doc.get('number')}{route}."
    return f"https://wa.me/{num}?text=" + urllib.parse.quote(msg)


# ---------------------------------------------------------------- line items: "Km fare (296 km x Rs 15)" -> item + details (+ qty / rate)
_DETAIL_RE = re.compile(r"^(?P<item>.*?)\s*\((?P<detail>[^()]*)\)\s*$")
_BARE_RE = re.compile(r"^(?P<item>Distance|Extra distance|Fuel charge)\s+(?P<detail>[\d.,]+ km x Rs [\d.,]+)$", re.I)


def _pretty_detail(d: str) -> str:
    d = re.sub(r"\s+x\s+Rs\s*([\d.,]+)", r" × ₹\1", d)
    return d.replace(" × ₹", " × ₹")


def _split_item(line: Dict[str, Any]) -> Tuple[str, str]:
    label = str(line.get("label") or "")
    explicit = str(line.get("detail") or "").strip()
    m = _DETAIL_RE.match(label)
    if m and not explicit:
        return m.group("item").strip(), _pretty_detail(m.group("detail").strip())
    m = _BARE_RE.match(label)
    if m and not explicit:
        return ("Distance charge" if m.group("item").lower() == "distance" else m.group("item")), _pretty_detail(m.group("detail"))
    return label, _pretty_detail(explicit)


def _qty_rate(detail: str) -> Tuple[str, str]:
    m = re.match(r"^(?P<q>.+?)\s×\s₹(?P<r>[\d.,]+)$", detail)
    if m:
        return m.group("q"), "₹" + m.group("r")
    return "", ""


def _parse_std(text: str) -> List[Tuple[str, str, List[str]]]:
    """Brand standard lists: 'Title | note | keywords' per line. The keywords drop the item when a charge with that word is already in the bill."""
    out = []
    for raw in _terms_list(text):
        parts = [p.strip() for p in raw.split("|")]
        out.append((parts[0], parts[1] if len(parts) > 1 else "", [k.strip().lower() for k in (parts[2].split(",") if len(parts) > 2 else []) if k.strip()]))
    return out


def _est_duration(t: Dict[str, Any]) -> str:
    if t.get("duration"):
        return str(t["duration"])
    try:
        km = float(t.get("km") or 0)
    except (TypeError, ValueError):
        return ""
    if km <= 0:
        return ""
    mins = int(round(km / 45 * 60))
    h, m = divmod(mins, 60)
    return f"approx. {h} hr{'s' if h != 1 else ''} {m} mins" if h else f"approx. {m} mins"


def _inc_exc(doc: Dict[str, Any]) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str]]]:
    """What the fare includes and what is paid on actuals - (title, note) pairs. Built from the bill itself (included charges, not-included lines,
    the km limit and extra-km rate) plus the brand's own standard lists, so the customer never has to guess."""
    b = doc.get("brand") or {}
    t = doc.get("trip") or {}
    lines = doc.get("lines") or []
    pk = t.get("package") or {}
    inc: List[Tuple[str, str]] = []
    exc: List[Tuple[str, str]] = []
    seen_i, seen_e = set(), set()
    included_text = " ".join(str(l.get("label") or "").lower() for l in lines)       # any charge already on the bill hides the matching standard line

    def add(lst, seen, title, note=""):
        k = title.lower()
        if title and k not in seen:
            seen.add(k)
            lst.append((title, note))

    km_limit = t.get("km_limit") or t.get("km")
    if km_limit:
        add(inc, seen_i, f"Up to {int(float(km_limit))} km", "Distance covered by the fare")
    for l in lines:
        item, det = _split_item(l)
        if l.get("included", True):
            if l.get("kind") == "CHARGE":
                add(inc, seen_i, item, det)
        else:
            add(exc, seen_e, item, ("approx. " + _inr(l["amount"])) if l.get("amount") else "Paid on actuals")
    for title, note, _ in _parse_std(b.get("includes_text")):
        add(inc, seen_i, title, note)
    for x in pk.get("includes") or []:
        add(inc, seen_i, str(x))
    if t.get("extra_km_rate"):
        lim = f" beyond {int(float(km_limit))} km" if km_limit else ""
        add(exc, seen_e, "Extra km", f"{_inr(t['extra_km_rate'])} per km{lim}")
    for title, note, kws in _parse_std(b.get("excludes_text")):
        if any(k in included_text for k in kws):
            continue
        if title.lower().startswith("extra km") and t.get("extra_km_rate"):
            continue
        add(exc, seen_e, title, note)
    for x in pk.get("excludes") or []:
        add(exc, seen_e, str(x))
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


def _totals_rows(doc: Dict[str, Any]) -> List[Tuple[str, str, str]]:
    """(label, amount text, style) rows under the items - one place so the page and the PDF always agree."""
    b = doc.get("brand") or {}
    tot = doc.get("totals") or {}
    gst = doc.get("gst") or {}
    is_est = doc.get("doc_type") == "ESTIMATE"
    mode, coll = gst.get("mode", "NONE"), gst.get("collection", "COLLECT")
    rows: List[Tuple[str, str, str]] = [("Sub total", _inr(tot.get("subtotal", 0) + tot.get("discount", 0)), "")]
    if tot.get("discount"):
        rows.append((doc.get("discount_label") or "Discount", "- " + _inr(tot["discount"]), "disc"))
    if mode != "NONE":
        rows.append((f"Taxable value (SAC {b.get('sac_code') or '9964'})", _inr(tot.get("taxable_value")), ""))
        if gst.get("interstate"):
            rows.append((f"IGST @ {gst.get('rate')}%", _inr(tot.get("igst")), ""))
        else:
            half = float(gst.get("rate") or 0) / 2
            rows += [(f"CGST @ {half:g}%", _inr(tot.get("cgst")), ""), (f"SGST @ {half:g}%", _inr(tot.get("sgst")), "")]
    if mode == "INCLUDED":
        rows.append(("GST is included in the amounts above", "", "note"))
    label = ("Grand Total" + (" (incl. GST)" if mode != "NONE" and coll == "COLLECT" else "")) if is_est else "Total"
    rows.append((label, _inr(tot.get("total_amount")), "grand"))
    if mode != "NONE" and coll == "SHOW_ONLY":
        rows += [("GST shown for records - not charged", "- " + _inr(tot.get("gst_amount")), "disc"), ("Amount payable", _inr(tot.get("amount_due")), "grand")]
    if not is_est:
        for p in doc.get("payments") or []:
            rows.append((f"Received - {p.get('mode') or 'Payment'}" + (f" ({p['ref']})" if p.get("ref") else ""), "- " + _inr(p.get("amount")), "paid"))
        rows.append(("Balance due", _inr(tot.get("balance_due")), "grand bal"))
        if coll == "PAY_LATER" and tot.get("gst_pending"):
            rows.append((f"Of this, GST {_inr(tot.get('gst_pending'))} can be paid later through the GST payment link. The trip amount {_inr(tot.get('payable_now'))} is payable now.", "", "note"))
    elif doc.get("advance_requested"):
        pct = round(100 * int(doc["advance_requested"]) / int(tot.get("total_amount") or 1)) if tot.get("total_amount") else 0
        rows.append((f"Advance Required{(' (' + str(pct) + '%)') if pct else ''}", _inr(doc["advance_requested"]), "grand adv"))
    return rows


def _trip_facts(doc: Dict[str, Any]) -> List[Tuple[str, str]]:
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    veh = " · ".join(x for x in [t.get("vehicle"), t.get("vehicle_name")] if x)
    km = f"{t.get('km')} km" if t.get("km") else ""
    facts = [("Booking ID", doc.get("booking_ref")), ("Trip type", t.get("trip_type")), ("Vehicle", veh), ("Distance", km),
             ("Km included", f"{int(float(t['km_limit']))} km" if t.get("km_limit") else ""), ("Extra km", f"{_inr(t['extra_km_rate'])} / km" if t.get("extra_km_rate") else ""),
             ("Est. duration", _est_duration(t)), ("Pickup", t.get("start_at")), ("Return", t.get("end_at")),
             ("Driver", " · ".join(x for x in [t.get("driver_name"), t.get("driver_phone")] if x)), ("Vehicle no.", t.get("vehicle_number"))]
    return [(k, str(v)) for k, v in facts if v]


def render_document_html(doc: Dict[str, Any], public: bool = False, links: Optional[Dict[str, str]] = None) -> str:
    links = links or {}
    b = doc.get("brand") or {}
    c = doc.get("customer") or {}
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    color = _clamp_color(b.get("primary_color"))
    serif = str(b.get("font_style") or "").upper() == "SERIF"
    dark = _shade(color, 0.36 if serif else 0.62)
    soft = "#F8F0E4" if serif else _shade(color, 1.9)
    gold = _clamp_color(b.get("secondary_color")) if b.get("secondary_color") else _shade(color, 1.35)
    page_bg = "#F5EFE6" if serif else "#e2e8f0"
    on_color = "#FFFFFF" if _is_dark(color) else "#0F172A"
    lines = doc.get("lines") or []
    inc = [l for l in lines if l.get("included", True)]
    is_est = doc.get("doc_type") == "ESTIMATE"

    # ---- items: estimate = Item | Details | Amount, invoice = # | Description | Qty | Rate | Amount (like the paper invoices)
    if is_est:
        head = "<tr><th>Item</th><th>Details</th><th class='num'>Amount</th></tr>"
        body_rows = "".join(f"<tr><td><b>{_e(_split_item(l)[0])}</b>{('<div class=note>' + _e(l.get('note')) + '</div>') if l.get('note') else ''}</td>"
                            f"<td class='det'>{_e(_split_item(l)[1])}</td><td class='num'>{_inr(l['amount'])}</td></tr>" for l in inc)
        span = 3
    else:
        head = "<tr><th class='no'>#</th><th>Description</th><th class='ctr'>Qty</th><th class='ctr'>Rate</th><th class='num'>Amount</th></tr>"
        body_rows = ""
        for i, l in enumerate(inc, 1):
            item, det = _split_item(l)
            q, r = _qr = _qty_rate(det)
            body_rows += (f"<tr><td class='no'>{i}</td><td><b>{_e(item)}</b>{('<div class=note>' + _e(det if not q else '') + '</div>') if (det and not q) else ''}"
                          f"{('<div class=note>' + _e(l.get('note')) + '</div>') if l.get('note') else ''}</td><td class='ctr'>{_e(q)}</td><td class='ctr'>{_e(r)}</td>"
                          f"<td class='num'>{_inr(l['amount'])}</td></tr>")
        span = 5
    body_rows = body_rows or f"<tr><td colspan={span} class='muted'>No charges</td></tr>"

    totals = "".join(
        (f"<tr class='{_e(sty)}'><td colspan=2 class='muted'>{_e(lab)}</td></tr>" if sty == "note" else f"<tr class='{_e(sty)}'><td>{_e(lab)}</td><td class='num'>{_e(amt)}</td></tr>")
        for lab, amt, sty in _totals_rows(doc))

    # ---- parties and trip
    cust_rows = []
    if c.get("name"):
        cust_rows.append(f"<div class='nm'>{_e(c['name'])}</div>")
    if c.get("company"):
        cust_rows.append(f"<div>{_e(c['company'])}</div>")
    if c.get("phone"):
        cust_rows.append(f"<div>&#9742; <a href='{_e(_tel(c['phone']))}'>{_e(c['phone'])}</a></div>")
    if c.get("email"):
        cust_rows.append(f"<div>&#9993; <a href='mailto:{_e(c['email'])}'>{_e(c['email'])}</a></div>")
    for k in ("address", "state"):
        if c.get(k):
            cust_rows.append(f"<div>{_e(c[k])}</div>")
    if c.get("gstin"):
        cust_rows.append(f"<div><b>GSTIN:</b> {_e(c['gstin'])}</div>")
    cust_html = "".join(cust_rows) or "<div class='muted'>-</div>"
    brand_rows = [f"<div class='nm'>{_e(b.get('legal_name') or b.get('name'))}</div>"]
    if b.get("address"):
        brand_rows.append(f"<div>{_e(b['address'])}</div>")
    if b.get("phone"):
        brand_rows.append(f"<div>&#9742; <a href='{_e(_tel(b['phone']))}'>{_e(b['phone'])}</a></div>")
    if b.get("email"):
        brand_rows.append(f"<div>&#9993; <a href='mailto:{_e(b['email'])}'>{_e(b['email'])}</a></div>")
    if b.get("gstin"):
        brand_rows.append(f"<div><b>GSTIN:</b> {_e(b['gstin'])}</div>")
    if b.get("pan"):
        brand_rows.append(f"<div><b>PAN:</b> {_e(b['pan'])}</div>")
    brand_html = "".join(brand_rows)

    facts = _trip_facts(doc)
    facts_html = "".join(f"<div class='fact'><span>{_e(k)}</span><b>{_e(v)}</b></div>" for k, v in facts)
    maps = _maps_url(t)
    route_html = ""
    if t.get("pickup") or t.get("drop"):
        dist = f"<div class='dist'>{_e(t['km'])} km{(' · ' + _e(_est_duration(t))) if _est_duration(t) else ''}</div>" if t.get("km") else ""
        route_html = (f"<div class='route'><div class='stop'><span><i class='dot g'></i> PICKUP</span><b>{_e(t.get('pickup') or '-')}</b></div>"
                      f"<div class='arrow'>&#10132;{dist}</div><div class='stop r'><span>DROP <i class='dot r'></i></span><b>{_e(t.get('drop') or '-')}</b></div></div>"
                      + (f"<div class='maplink'><a href='{_e(maps)}'>&#128205; View the route on Google Maps</a></div>" if maps else ""))
    pass_html = ""
    if t.get("passenger_name"):
        pass_html = f"<div class='passenger'><span>PASSENGER</span> <b>{_e(t['passenger_name'])}</b>{(' &nbsp; <a href=' + chr(39) + _e(_tel(t.get('passenger_phone'))) + chr(39) + '>' + _e(t.get('passenger_phone')) + '</a>') if t.get('passenger_phone') else ''}</div>"
    trip_html = ""
    if facts_html or route_html:
        trip_html = f"<div class='box'><h4>Trip details</h4>{route_html}{pass_html}<div class='facts'>{facts_html}</div></div>"

    # ---- included / not included
    inc_l, exc_l = _inc_exc(doc)

    def _col(title, items, mark, cls):
        if not items:
            return ""
        li = "".join(f"<li><i class='{cls}'>{mark}</i><div><b>{_e(tt)}</b>{('<small>' + _e(nn) + '</small>') if nn else ''}</div></li>" for tt, nn in items)
        return f"<div class='ie'><h5 class='{cls}'>{title}</h5><ul>{li}</ul></div>"

    ie_html = ""
    if inc_l or exc_l:
        ie_html = "<div class='box'><div class='iewrap'>" + _col("What's included", inc_l, "&#10003;", "ok") + _col("Not included / extra", exc_l, "&#10007;", "no") + "</div></div>"

    pk = t.get("package") or {}
    pkg_html = ""
    if pk and pk.get("itinerary"):
        pkg_html = ("<div class='box'><h4>Plan - " + _e(pk.get("name") or "") + (f" ({_e(pk.get('days'))} days)" if pk.get("days") else "") + "</h4><ol class='plan'>" +
                    "".join(f"<li>{_e(x)}</li>" for x in pk["itinerary"]) + "</ol></div>")

    # ---- pay to + QR
    bank = [("Account name", b.get("bank_account_name")), ("Bank", b.get("bank_name")), ("Account no.", b.get("bank_account_number")),
            ("IFSC", b.get("bank_ifsc")), ("Branch", b.get("bank_branch")), ("UPI", b.get("upi_id"))]
    bank_html = ("<table class='kv'>" + "".join(f"<tr><th>{k}</th><td>{_e(v)}</td></tr>" for k, v in bank if v) + "</table>") if any(v for _, v in bank) else ""
    uri = _upi_uri(doc)
    qr_html = ""
    if uri:
        amt = _payable_now(doc)
        qr_html = f"<div class='qr'>{_qr_svg(uri)}<div>Scan to pay with any UPI app{(' - ' + _inr(amt)) if amt else ''}</div></div>"
    pay_html = f"<div class='box payto'><div><h4>Pay to</h4>{bank_html}</div>{qr_html}</div>" if (bank_html or qr_html) else ""

    # ---- action buttons (customer page)
    buttons = ""
    if public:
        online = [l for l in (doc.get("payment_links") or []) if l.get("status") not in ("PAID", "CANCELLED", "EXPIRED") and l.get("url")]
        btn = "".join(f"<a class='btn pay' href='{_e(l['url'])}'>Pay {_inr(l.get('amount'))} - {_e(str(l.get('purpose') or 'Payment').title())}</a>" for l in online)
        wa = _wa_confirm_url(doc)
        if wa and doc.get("status") not in ("CANCELLED",):
            btn += f"<a class='btn wa' href='{_e(wa)}'>&#128172; {'Confirm on WhatsApp' if is_est else 'Ask on WhatsApp'}</a>"
        if b.get("phone"):
            btn += f"<a class='btn ghost' href='{_e(_tel(b['phone']))}'>&#9742; Call {_e(b['phone'])}</a>"
        if links.get("pdf"):
            btn += f"<a class='btn ghost' href='{_e(links['pdf'])}'>&#11015; Download PDF</a>"
        buttons = f"<div class='actions'>{btn}</div>" if btn else ""

    terms = _terms_list(doc.get("terms"))
    rules = _terms_list(b.get("rules_text"))
    terms_html = ("<div class='box'><h4>Terms &amp; conditions</h4><ol class='two'>" + "".join(f"<li>{_e(x)}</li>" for x in terms) + "</ol></div>") if terms else ""
    rules_html = ("<div class='box'><h4>Rules, policies &amp; regulations</h4><ol class='two'>" + "".join(f"<li>{_e(x)}</li>" for x in rules) + "</ol></div>") if rules else ""

    valid = f"<div class='validity'>Valid until <b>{_e(doc.get('valid_until'))}</b></div>" if is_est and doc.get("valid_until") else ""
    badge = "<div class='badge'>OFFICIAL ESTIMATION</div>" if is_est else ""
    cancelled = "<div class='stamp'>CANCELLED</div>" if doc.get("status") == "CANCELLED" else ""
    pstat = ""
    if not is_est and doc.get("status") != "CANCELLED":
        ps = doc.get("payment_status")
        pstat = f"<span class='pill {ps}'>{'PAID' if ps == 'PAID' else 'PART PAID' if ps == 'PARTIAL' else 'UNPAID'}</span>"

    chips = "".join(f"<span class='chip'>{_e(x)}</span>" for x in _highlights(b))
    tagline = f"<div class='tag'>{_e(b.get('tagline'))}</div>" if b.get("tagline") else ""
    contact_bits = []
    if b.get("domain"):
        contact_bits.append(f"&#127760; <a href='{_e(_site(b['domain']))}'>{_e(b['domain'])}</a>")
    if b.get("phone"):
        contact_bits.append(f"&#9742; <a href='{_e(_tel(b['phone']))}'>{_e(b['phone'])}</a>")
    if b.get("email"):
        contact_bits.append(f"&#9993; <a href='mailto:{_e(b['email'])}'>{_e(b['email'])}</a>")
    wa_num = _wa_number(b)
    if wa_num:
        contact_bits.append(f"&#128172; <a href='https://wa.me/{_e(wa_num)}'>WhatsApp</a>")
    contact = " &nbsp;&bull;&nbsp; ".join(contact_bits)
    slogan = _e(b.get("footer_note") or "")

    pb = doc.get("prepared_by") or {}
    prep_name = _e(pb.get("name") or "")
    prep_phone = _e(pb.get("phone") or "")
    shared = sorted({_e(s["name"]) for s in (doc.get("shared_by") or []) if s.get("name") and s.get("name") != pb.get("name")})
    sign_html = (
        "<div class='sign3'>"
        f"<div><div class='line'>{('<b>' + prep_name + '</b>' + ((' · <a href=' + chr(39) + _e(_tel(pb.get('phone'))) + chr(39) + '>' + prep_phone + '</a>') if prep_phone else '')) if prep_name else '&nbsp;'}</div><span>Prepared by (for {_e(b.get('legal_name') or b.get('name'))})</span>"
        f"{('<small>Shared by ' + ', '.join(shared) + '</small>') if shared else ''}</div>"
        "<div><div class='line'>&nbsp;</div><span>Customer acknowledgement</span></div>"
        "<div><div class='line'>&nbsp;</div><span>Date</span></div></div>")

    body_font = "'Hanken Grotesk',Segoe UI,Roboto,Arial,sans-serif" if serif else "Segoe UI,Roboto,Arial,sans-serif"
    font_link = ("<link rel='preconnect' href='https://fonts.googleapis.com'><link href='https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap' rel='stylesheet'>") if serif else ""
    serif_css = (".brand,.slogan,.doc .no{font-family:'Cormorant Garamond',Georgia,serif} .brand{font-size:36px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase} "
                 ".tag{font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;letter-spacing:.5px} .slogan{font-size:19px} .band .tag,.doc h2,.box h4,.col h4{letter-spacing:2px}") if serif else ""
    chips_html = ('<div class="chips">' + chips + '</div>') if chips else ''
    contact_html = ('<div class="contact">' + contact + '</div>') if contact else ''
    notes_html = ('<div class="box"><h4>Notes</h4>' + _e(doc.get('notes')) + '</div>') if doc.get('notes') else ''
    slogan_html = ('<div class="slogan">' + slogan + '</div>') if slogan else ''
    words = amount_in_words(tot.get('total_amount') if is_est else (tot.get('balance_due') or tot.get('total_amount')))
    foot_contact = " · ".join(_e(x) for x in [b.get("phone"), b.get("email"), b.get("domain")] if x)

    css = f"""
:root{{--c:{color};--d:{dark};--s:{soft};--on:{on_color};--g:{gold}}} *{{box-sizing:border-box}} body{{font-family:{body_font};color:#1e293b;margin:0;background:{page_bg}}}
a{{color:inherit}} .page{{max-width:840px;margin:0 auto;background:#fff;position:relative;overflow:hidden}}
.band{{background:linear-gradient(120deg,var(--d),var(--c));color:var(--on);padding:24px 28px 16px;border-bottom:4px solid var(--g)}}
.band a{{text-decoration:none}} .band .top{{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}}
.brand{{font-size:30px;font-weight:800;letter-spacing:.4px;line-height:1.1}} .tag{{margin-top:5px;font-size:13.5px;font-style:italic;opacity:.92}}
.chips{{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}} .chip{{font-size:11px;padding:3px 10px;border-radius:12px;background:rgba(255,255,255,.14);border:1px solid var(--g)}}
.doc{{text-align:right;min-width:210px}} .doc h2{{margin:0;font-size:12px;letter-spacing:1.6px;font-weight:700;opacity:.95}} .doc .no{{font-weight:800;font-size:21px;margin-top:4px}}
.doc .dt{{font-size:12px;opacity:.9;margin-top:3px}} .validity{{display:inline-block;margin-top:8px;background:#fff;color:var(--d);border-radius:12px;padding:3px 11px;font-size:11.5px}}
.badge{{display:inline-block;margin-top:7px;border:1px solid var(--g);color:var(--on);border-radius:12px;padding:2px 11px;font-size:10px;letter-spacing:1.4px;font-weight:700}}
.contact{{margin-top:14px;padding-top:9px;border-top:1px solid rgba(255,255,255,.3);font-size:12px;opacity:.95}}
.body{{padding:20px 28px 24px}} .cols{{display:flex;gap:14px}} .col{{flex:1;background:var(--s);border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.6}}
.col h4{{margin:0 0 5px;font-size:10.5px;color:var(--d);text-transform:uppercase;letter-spacing:1px}} .col .nm{{font-size:15px;font-weight:800;margin-bottom:2px}} .col a{{text-decoration:none}}
.route{{display:flex;align-items:center;gap:12px;margin-top:6px;padding:12px 14px;border:1.5px solid var(--c);border-radius:12px;background:linear-gradient(90deg,#f0fdf4,#fff 40%,#fff 60%,#fef2f2)}}
.stop{{flex:1}} .stop.r{{text-align:right}} .stop span{{display:block;font-size:10px;letter-spacing:1px;color:#64748b}} .stop b{{font-size:15px}}
.arrow{{color:var(--c);font-size:22px;text-align:center}} .dist{{font-size:10.5px;color:#475569;margin-top:2px}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%}} .dot.g{{background:#16a34a}} .dot.r{{background:#dc2626}}
.maplink{{margin-top:7px;font-size:12px}} .maplink a{{color:var(--d);font-weight:700}} .passenger{{margin-top:8px;font-size:12.5px;padding:7px 10px;background:#f8fafc;border-radius:8px}} .passenger span{{font-size:9.5px;color:#64748b;letter-spacing:.8px}}
.facts{{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}} .fact{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px}}
.fact span{{display:block;font-size:9.5px;color:#64748b;letter-spacing:.8px;text-transform:uppercase}}
table{{width:100%;border-collapse:collapse}} .items{{margin-top:14px;border-radius:10px;overflow:hidden}} .items th{{background:var(--c);color:var(--on);text-align:left;padding:9px 11px;font-size:12px;letter-spacing:.5px}}
.items td{{padding:9px 11px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top}} .items tr:nth-child(even) td{{background:#f8fafc}} .num{{text-align:right;white-space:nowrap}} th.num{{text-align:right}}
.ctr{{text-align:center;white-space:nowrap}} th.ctr{{text-align:center}} .no{{width:34px}} .det{{color:#475569;font-size:12px}}
.tot{{width:350px;margin-left:auto;margin-top:12px}} .tot td{{padding:5px 11px;font-size:13px}} .tot .grand td{{font-weight:800;font-size:15.5px;background:var(--s);color:#0f172a;border-bottom:2px solid var(--g)}}
.tot .grand td:first-child{{border-radius:8px 0 0 8px}} .tot .grand td:last-child{{border-radius:0 8px 8px 0}}
.tot .bal td{{color:#b91c1c}} .tot .paid td{{color:#047857}} .tot .disc td{{color:#b45309}} .tot .adv td{{background:var(--c);color:var(--on)}} .muted{{color:#64748b;font-size:11.5px}} .note{{color:#64748b;font-size:11px}}
.box{{border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;margin-top:13px;font-size:12.5px}} .box h4{{margin:0 0 6px;font-size:11.5px;color:var(--d);text-transform:uppercase;letter-spacing:.8px}}
.box ol,.box ul{{margin:0;padding-left:18px;line-height:1.6}} ol.two{{column-count:2;column-gap:26px;font-size:11.5px;color:#334155}} ol.two li{{break-inside:avoid;margin-bottom:3px}} ol.plan li{{margin-bottom:2px}}
.iewrap{{display:flex;gap:18px;flex-wrap:wrap}} .ie{{flex:1;min-width:230px}} .ie h5{{margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase}} h5.ok{{color:#15803d}} h5.no{{color:#b91c1c}}
.ie ul{{list-style:none;margin:0;padding:0}} .ie li{{display:flex;gap:8px;margin-bottom:6px;line-height:1.35}} .ie li i{{font-style:normal;font-weight:800;width:16px}} i.ok{{color:#15803d}} i.no{{color:#b91c1c}}
.ie small{{display:block;color:#64748b;font-size:11px}}
.kv th{{text-align:left;color:#64748b;font-weight:600;width:110px;padding:2px 0;font-size:12px}} .kv td{{padding:2px 0}}
.payto{{display:flex;gap:18px;align-items:center;justify-content:space-between}} .qr{{text-align:center;font-size:10.5px;color:#475569;max-width:150px}} .qr svg{{width:112px;height:112px}}
.words{{margin-top:9px;font-size:12px;color:#334155}} .actions{{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}}
.btn{{display:inline-block;padding:11px 18px;background:var(--c);color:var(--on);text-decoration:none;border-radius:9px;font-weight:700;font-size:13px}} .btn.wa{{background:#25D366;color:#073b1c}} .btn.ghost{{background:#fff;color:var(--d);border:1.5px solid var(--c)}}
.pill{{display:inline-block;padding:2px 10px;border-radius:12px;font-size:10.5px;font-weight:800;margin-left:8px;vertical-align:middle}} .pill.PAID{{background:#dcfce7;color:#166534}} .pill.PARTIAL{{background:#fef3c7;color:#92400e}} .pill.UNPAID{{background:#fee2e2;color:#991b1b}}
.slogan{{margin-top:22px;padding-top:14px;border-top:1px solid var(--g);text-align:center;font-size:15px;font-style:italic;color:var(--d);font-weight:600}}
.sign3{{display:flex;gap:26px;margin-top:30px}} .sign3>div{{flex:1}} .sign3 .line{{border-bottom:1px solid #94a3b8;min-height:24px;padding-bottom:3px;font-size:12px}} .sign3 span{{display:block;margin-top:4px;font-size:10.5px;color:#64748b}} .sign3 small{{display:block;font-size:10px;color:#94a3b8}}
.stamp{{position:absolute;top:210px;left:50%;transform:translateX(-50%) rotate(-18deg);font-size:64px;font-weight:900;color:rgba(220,38,38,.18);border:6px solid rgba(220,38,38,.18);padding:0 22px;z-index:2}}
.prep{{margin-top:12px;font-size:11px;color:#94a3b8;text-align:center}}
.foot{{background:#111827;color:#cbd5e1;padding:13px 28px;font-size:11px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}} .foot b{{color:#fff}} .foot a{{color:#e2e8f0;text-decoration:none}}
.endband{{height:6px;background:linear-gradient(90deg,var(--d),var(--c),var(--g))}}
.print{{text-align:center;padding:12px}} .print a{{display:inline-block;padding:9px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700}}
@media print{{body{{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}} .print,.actions{{display:none}}}}
@media(max-width:600px){{.cols{{flex-direction:column}} .band .top{{flex-direction:column}} .doc{{text-align:left}} .tot{{width:100%}} .brand{{font-size:24px}} .payto{{flex-direction:column;align-items:flex-start}} .route{{flex-direction:column;align-items:flex-start}} .stop.r{{text-align:left}} .arrow{{transform:rotate(90deg)}} ol.two{{column-count:1}} .sign3{{flex-direction:column;gap:18px}}}}
{serif_css}"""

    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(_title(doc))} {_e(doc.get('number'))}</title>{font_link}<style>{css}</style></head><body>
<div class="print"><a href="javascript:window.print()">Print / Save as PDF</a></div>
<div class="page">{cancelled}
<div class="band"><div class="top"><div><div class="brand">{_e(b.get('name'))}</div>{tagline}{chips_html}</div>
<div class="doc"><h2>{_e(_title(doc))}</h2><div class="no">{_e(doc.get('number'))}{pstat}</div><div class="dt">Issued: {_e(doc.get('date'))}</div>{valid}{badge}</div></div>
{contact_html}</div>
<div class="body">
<div class="cols"><div class="col"><h4>{'Prepared for' if is_est else 'Billed to'}</h4>{cust_html}</div><div class="col"><h4>From</h4>{brand_html}</div></div>
{trip_html}
<table class="items">{head}{body_rows}</table>
<table class="tot">{totals}</table>
<div class="words"><b>Amount in words:</b> {_e(words)}</div>
{buttons}{ie_html}{pkg_html}{pay_html}{notes_html}
{terms_html}{rules_html}
{sign_html}
{slogan_html}
<div class="prep">This is a computer-generated {'estimate' if is_est else 'invoice'}{(' &middot; Questions? Call ' + _e(b.get('phone'))) if b.get('phone') else ''}</div>
</div>
<div class="foot"><div><b>{_e(b.get('legal_name') or b.get('name'))}</b> &nbsp; {foot_contact}</div><div>{_e(doc.get('number'))}</div></div>
<div class="endband"></div>
</div></body></html>"""


# ======================================================================================================================== PDF
def render_document_pdf(doc: Dict[str, Any]) -> bytes:
    """The same document as a PDF (ReportLab): coloured brand band, parties, route (with a Maps link), items, totals, included / not included,
    UPI QR, terms, signature lines, slogan and a dark footer. Phone, e-mail, website and WhatsApp are real links."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    b = doc.get("brand") or {}
    c = doc.get("customer") or {}
    t = doc.get("trip") or {}
    tot = doc.get("totals") or {}
    is_est = doc.get("doc_type") == "ESTIMATE"
    hexc = _clamp_color(b.get("primary_color"))
    serif = str(b.get("font_style") or "").upper() == "SERIF"
    accent = colors.HexColor(hexc)
    deep = colors.HexColor(_shade(hexc, 0.36 if serif else 0.62))
    soft = colors.HexColor("#F8F0E4" if serif else _shade(hexc, 1.9))
    gold = colors.HexColor(_clamp_color(b.get("secondary_color")) if b.get("secondary_color") else _shade(hexc, 1.35))
    on = colors.white if _is_dark(hexc) else colors.HexColor("#0F172A")
    onhex = "#FFFFFF" if _is_dark(hexc) else "#0F172A"
    ss = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=8.5, leading=11, textColor=colors.HexColor("#334155"))
    tiny = ParagraphStyle("t", parent=small, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#64748b"))
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=9.5, leading=12.5)
    h = ParagraphStyle("h", parent=ss["Normal"], fontSize=9, leading=12, textColor=deep, fontName="Helvetica-Bold")
    big = ParagraphStyle("big", parent=ss["Normal"], fontSize=25 if serif else 23, leading=28 if serif else 26, textColor=on, fontName="Times-Bold" if serif else "Helvetica-Bold")
    tag = ParagraphStyle("tag", parent=ss["Normal"], fontSize=11 if serif else 10, leading=14, textColor=on, fontName="Times-Italic" if serif else "Helvetica-Oblique")
    chipst = ParagraphStyle("chip", parent=ss["Normal"], fontSize=8, leading=11, textColor=on)
    rt = ParagraphStyle("rt", parent=body, alignment=2)
    rt_on = ParagraphStyle("rton", parent=body, alignment=2, textColor=on)
    ctr = ParagraphStyle("ctr", parent=body, alignment=1)
    slog = ParagraphStyle("slog", parent=ss["Normal"], fontSize=13 if serif else 11.5, leading=16, alignment=1, textColor=deep, fontName="Times-BoldItalic" if serif else "Helvetica-BoldOblique")

    def money(v):
        return f"Rs {int(round(float(v or 0))):,}"

    def esc(v):
        return html.escape(str(v if v is not None else "")).replace("₹", "Rs ")

    def link(href, text, color=None):
        return f'<a href="{html.escape(href, quote=True)}"' + (f' color="{color}"' if color else "") + f">{esc(text)}</a>" if href else esc(text)

    buf = io.BytesIO()
    d = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=10 * mm, bottomMargin=12 * mm)
    s: List[Any] = []

    # ---- band
    left = [Paragraph(esc(b.get("name")), big)]
    if b.get("tagline"):
        left.append(Paragraph(esc(b["tagline"]), tag))
    hl = _highlights(b)
    if hl:
        left.append(Spacer(1, 3))
        left.append(Paragraph(" &nbsp;&bull;&nbsp; ".join(esc(x) for x in hl), chipst))
    right_txt = f"<b>{esc(_title(doc))}</b><br/><font size=14><b>{esc(doc.get('number'))}</b></font><br/>Issued: {esc(doc.get('date'))}"
    if is_est and doc.get("valid_until"):
        right_txt += f"<br/>Valid until {esc(doc['valid_until'])}"
    if is_est:
        right_txt += "<br/><font size=7>OFFICIAL ESTIMATION</font>"
    bits = []
    if b.get("domain"):
        bits.append(link(_site(b["domain"]), b["domain"], onhex))
    if b.get("phone"):
        bits.append(link(_tel(b["phone"]), b["phone"], onhex))
    if b.get("email"):
        bits.append(link("mailto:" + b["email"], b["email"], onhex))
    if _wa_number(b):
        bits.append(link("https://wa.me/" + _wa_number(b), "WhatsApp", onhex))
    band_rows = [[left, Paragraph(right_txt, rt_on)]]
    if bits:
        band_rows.append([Paragraph("  |  ".join(bits), chipst), ""])
    band = Table(band_rows, colWidths=[118 * mm, 64 * mm])
    band_style = [("BACKGROUND", (0, 0), (-1, -1), accent), ("LINEBELOW", (0, -1), (-1, -1), 3, gold), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                  ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, 0), (-1, 0), 8)]
    if bits:
        band_style += [("SPAN", (0, 1), (1, 1)), ("LINEABOVE", (0, 1), (-1, 1), 0.6, on), ("TOPPADDING", (0, 1), (-1, 1), 5), ("BOTTOMPADDING", (0, 1), (-1, 1), 6)]
    band.setStyle(TableStyle(band_style))
    s += [band, Spacer(1, 7)]

    # ---- parties
    to = []
    if c.get("name"):
        to.append(f"<font size=11><b>{esc(c['name'])}</b></font>")
    if c.get("company"):
        to.append(esc(c["company"]))
    if c.get("phone"):
        to.append("Ph: " + link(_tel(c["phone"]), c["phone"], hexc))
    if c.get("email"):
        to.append(link("mailto:" + c["email"], c["email"], hexc))
    for k in ("address", "state"):
        if c.get(k):
            to.append(esc(c[k]))
    if c.get("gstin"):
        to.append(f"<b>GSTIN:</b> {esc(c['gstin'])}")
    frm = [f"<font size=11><b>{esc(b.get('legal_name') or b.get('name'))}</b></font>"]
    if b.get("address"):
        frm.append(esc(b["address"]))
    if b.get("phone"):
        frm.append("Ph: " + link(_tel(b["phone"]), b["phone"], hexc))
    if b.get("email"):
        frm.append(link("mailto:" + b["email"], b["email"], hexc))
    if b.get("gstin"):
        frm.append(f"<b>GSTIN:</b> {esc(b['gstin'])}")
    if b.get("pan"):
        frm.append(f"<b>PAN:</b> {esc(b['pan'])}")
    parties = Table([[Paragraph(f"<font size=7 color='#64748b'>{'PREPARED FOR' if is_est else 'BILLED TO'}</font><br/>" + "<br/>".join(to or ["-"]), small),
                      Paragraph("<font size=7 color='#64748b'>FROM</font><br/>" + "<br/>".join(frm), small)]], colWidths=[91 * mm, 91 * mm])
    parties.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), soft), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 7), ("LINEAFTER", (0, 0), (0, 0), 4, colors.white)]))
    s += [parties, Spacer(1, 6)]

    # ---- trip: route strip, maps link, passenger, facts
    if t.get("pickup") or t.get("drop"):
        dist = f"<br/><font size=7 color='#475569'>{esc(t['km'])} km" + (f" - {esc(_est_duration(t))}" if _est_duration(t) else "") + "</font>" if t.get("km") else ""
        rt_tbl = Table([[Paragraph(f"<font size=7 color='#64748b'>PICKUP</font><br/><b>{esc(t.get('pickup') or '-')}</b>", body),
                         Paragraph(f"<font color='{hexc}' size=14>&gt;&gt;</font>{dist}", ctr),
                         Paragraph(f"<font size=7 color='#64748b'>DROP</font><br/><b>{esc(t.get('drop') or '-')}</b>", rt)]],
                       colWidths=[68 * mm, 46 * mm, 68 * mm])
        rt_tbl.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1, accent), ("PADDING", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        s += [rt_tbl]
        maps = _maps_url(t)
        if maps:
            s += [Spacer(1, 2), Paragraph(link(maps, "View the route on Google Maps", hexc), small)]
        s += [Spacer(1, 3)]
    if t.get("passenger_name"):
        s += [Paragraph(f"<font size=7 color='#64748b'>PASSENGER</font>  <b>{esc(t['passenger_name'])}</b>" + (f"  " + link(_tel(t.get("passenger_phone")), t.get("passenger_phone"), hexc) if t.get("passenger_phone") else ""), small), Spacer(1, 3)]
    facts = _trip_facts(doc)
    if facts:
        cells = [Paragraph(f"<font size=6.5 color='#64748b'>{esc(k.upper())}</font><br/><b>{esc(v)}</b>", small) for k, v in facts]
        while len(cells) % 4:
            cells.append("")
        grid = Table([cells[i:i + 4] for i in range(0, len(cells), 4)], colWidths=[45.5 * mm] * 4)
        grid.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 4), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        s += [grid, Spacer(1, 6)]

    # ---- items
    inc = [l for l in (doc.get("lines") or []) if l.get("included", True)]
    hdr = ParagraphStyle("w", parent=body, textColor=on, fontName="Helvetica-Bold")
    if is_est:
        items = [[Paragraph("Item", hdr), Paragraph("Details", hdr), Paragraph("Amount", ParagraphStyle("w2", parent=hdr, alignment=2))]]
        for l in inc:
            it_, de_ = _split_item(l)
            items.append([Paragraph(f"<b>{esc(it_)}</b>", body), Paragraph(esc(de_), small), Paragraph(money(l["amount"]), rt)])
        cw = [70 * mm, 70 * mm, 42 * mm]
    else:
        items = [[Paragraph("#", hdr), Paragraph("Description", hdr), Paragraph("Qty", ParagraphStyle("w3", parent=hdr, alignment=1)),
                  Paragraph("Rate", ParagraphStyle("w4", parent=hdr, alignment=1)), Paragraph("Amount", ParagraphStyle("w2", parent=hdr, alignment=2))]]
        for i, l in enumerate(inc, 1):
            it_, de_ = _split_item(l)
            q, r = _qty_rate(de_)
            items.append([Paragraph(str(i), body), Paragraph(f"<b>{esc(it_)}</b>" + (f"<br/><font size=7.5 color='#64748b'>{esc(de_)}</font>" if de_ and not q else ""), body),
                          Paragraph(esc(q), ctr), Paragraph(esc(r), ctr), Paragraph(money(l["amount"]), rt)])
        cw = [10 * mm, 82 * mm, 28 * mm, 24 * mm, 38 * mm]
    if len(items) == 1:
        items.append([Paragraph("No charges", small)] + [""] * (len(cw) - 1))
    it = Table(items, colWidths=cw, repeatRows=1)
    it.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), accent), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                            ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 5), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    s += [it, Spacer(1, 6)]

    # ---- totals
    rows = _totals_rows(doc)
    plain = [(lab, amt, sty) for lab, amt, sty in rows if sty != "note"]
    tt2 = Table([[Paragraph(esc(lab).upper() if "grand" in sty else esc(lab), body), Paragraph(esc(amt), rt)] for lab, amt, sty in plain], colWidths=[120 * mm, 42 * mm], hAlign="RIGHT")
    st = [("PADDING", (0, 0), (-1, -1), 3)] + [("BACKGROUND", (0, i), (-1, i), soft) for i, (_, _, sty) in enumerate(plain) if "grand" in sty]
    tt2.setStyle(TableStyle(st))
    s += [tt2]
    for lab, _, sty in rows:
        if sty == "note":
            s += [Paragraph(esc(lab), tiny)]
    s += [Spacer(1, 4), Paragraph("<b>Amount in words:</b> " + esc(amount_in_words(tot.get("total_amount") if is_est else (tot.get("balance_due") or tot.get("total_amount")))), small), Spacer(1, 6)]

    # ---- included / not included
    inc_l, exc_l = _inc_exc(doc)
    if inc_l or exc_l:
        green, red = colors.HexColor("#15803d"), colors.HexColor("#b91c1c")

        def col(title, items_, mark, clr):
            out = [Paragraph(f"<font color='{clr.hexval().replace('0x', '#')}'><b>{title}</b></font>", small)]
            for tt, nn in items_:
                out.append(Paragraph(f"<font color='{clr.hexval().replace('0x', '#')}'><b>{mark}</b></font> <b>{esc(tt)}</b>" + (f"<br/><font size=7 color='#64748b'>&nbsp;&nbsp;&nbsp;{esc(nn)}</font>" if nn else ""), small))
            return out
        ie = Table([[col("WHAT'S INCLUDED", inc_l, "+", green), col("NOT INCLUDED / EXTRA", exc_l, "x", red)]], colWidths=[91 * mm, 91 * mm])
        ie.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")), ("LINEAFTER", (0, 0), (0, 0), 0.5, colors.HexColor("#E2E8F0")), ("PADDING", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        s += [ie, Spacer(1, 6)]

    pk = t.get("package") or {}
    if pk and pk.get("itinerary"):
        s += [Paragraph("PLAN - " + esc(pk.get("name") or ""), h), Paragraph(esc(" > ".join(pk["itinerary"])), small), Spacer(1, 6)]

    # ---- pay to + QR
    bank = [f"{k}: {v}" for k, v in (("Account name", b.get("bank_account_name")), ("Bank", b.get("bank_name")), ("A/c no.", b.get("bank_account_number")), ("IFSC", b.get("bank_ifsc")), ("UPI", b.get("upi_id"))) if v]
    uri = _upi_uri(doc)
    if bank or uri:
        left_cell = [Paragraph("PAY TO", h), Paragraph(esc(" | ".join(bank)) if bank else "", small)]
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
    online = [l for l in (doc.get("payment_links") or []) if l.get("status") not in ("PAID", "CANCELLED", "EXPIRED") and l.get("url")]
    for l in online:
        s += [Paragraph(f"Pay online: " + link(l["url"], f"{money(l.get('amount'))} - {str(l.get('purpose') or 'Payment').title()}", hexc), small)]
    wa = _wa_confirm_url(doc)
    if wa and doc.get("status") != "CANCELLED":
        s += [Paragraph(("Confirm this estimate on WhatsApp: " if is_est else "Questions about this invoice: ") + link(wa, "tap to chat with us", hexc), small), Spacer(1, 6)]
    if doc.get("notes"):
        s += [Paragraph("NOTES", h), Paragraph(esc(doc["notes"]), small), Spacer(1, 6)]

    # ---- terms in two columns
    def two_cols(title, items_):
        if not items_:
            return []
        paras = [Paragraph(f"{i}. {esc(x)}", tiny) for i, x in enumerate(items_, 1)]
        half = (len(paras) + 1) // 2
        left_, right_ = paras[:half], paras[half:]
        while len(right_) < len(left_):
            right_.append("")
        tbl = Table([[Paragraph(title, h), ""]] + [[a, bb] for a, bb in zip(left_, right_)], colWidths=[91 * mm, 91 * mm])
        tbl.setStyle(TableStyle([("SPAN", (0, 0), (1, 0)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 2), ("LEFTPADDING", (0, 0), (-1, -1), 4)]))
        return [tbl, Spacer(1, 6)]
    s += two_cols("TERMS &amp; CONDITIONS", _terms_list(doc.get("terms")))
    s += two_cols("RULES, POLICIES &amp; REGULATIONS", _terms_list(b.get("rules_text")))

    # ---- signatures, slogan, footer
    pb = doc.get("prepared_by") or {}
    shared = sorted({str(x["name"]) for x in (doc.get("shared_by") or []) if x.get("name") and x.get("name") != pb.get("name")})
    prep = (f"<b>{esc(pb['name'])}</b>" + (f" - {link(_tel(pb.get('phone')), pb.get('phone'), hexc)}" if pb.get("phone") else "")) if pb.get("name") else "&nbsp;"
    sig = Table([[Paragraph(prep, small), "", Paragraph("&nbsp;", small), "", Paragraph("&nbsp;", small)],
                 [Paragraph(f"Prepared by (for {esc(b.get('legal_name') or b.get('name'))})" + (f"<br/>Shared by {esc(', '.join(shared))}" if shared else ""), tiny), "",
                  Paragraph("Customer acknowledgement", tiny), "", Paragraph("Date", tiny)]],
                colWidths=[70 * mm, 6 * mm, 52 * mm, 6 * mm, 48 * mm], rowHeights=[12 * mm, None])
    sig.setStyle(TableStyle([("LINEBELOW", (0, 0), (0, 0), 0.6, colors.HexColor("#94A3B8")), ("LINEBELOW", (2, 0), (2, 0), 0.6, colors.HexColor("#94A3B8")),
                             ("LINEBELOW", (4, 0), (4, 0), 0.6, colors.HexColor("#94A3B8")), ("VALIGN", (0, 0), (-1, 0), "BOTTOM"), ("PADDING", (0, 0), (-1, -1), 2)]))
    closing: List[Any] = [Spacer(1, 10), sig]
    if b.get("footer_note"):
        closing += [Spacer(1, 12), Paragraph(esc(b["footer_note"]), slog)]
    foot_txt = f"<font color='#FFFFFF'><b>{esc(b.get('legal_name') or b.get('name'))}</b></font>  " + esc("  ·  ".join(str(x) for x in [b.get("phone"), b.get("email"), b.get("domain")] if x))
    foot = Table([[Paragraph(foot_txt, ParagraphStyle("f1", parent=tiny, textColor=colors.HexColor("#CBD5E1"))),
                   Paragraph(f"{esc(doc.get('number'))}<br/>Computer-generated {'estimate' if is_est else 'invoice'}", ParagraphStyle("f2", parent=tiny, alignment=2, textColor=colors.HexColor("#94A3B8")))]],
                 colWidths=[118 * mm, 64 * mm])
    foot.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#111827")), ("LINEBELOW", (0, 0), (-1, -1), 3, gold), ("PADDING", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    closing += [Spacer(1, 10), foot]
    s += [KeepTogether(closing)]
    d.build(s)
    return buf.getvalue()
