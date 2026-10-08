import io
import re
from datetime import datetime, date
from typing import Dict, Any, Optional, List, Tuple
import logging

logger = logging.getLogger(__name__)

# Try importing OpenCV and PIL/EasyOCR gracefully
try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

try:
    from PIL import Image
    import numpy as np
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False)
    HAS_EASYOCR = True
except Exception:
    HAS_EASYOCR = False


def check_is_original_color(image_bytes: bytes, saturation_threshold: float = 14.0) -> Tuple[bool, float]:
    """
    Checks whether an uploaded document image is a colored original or a monochrome/grayscale Xerox copy.
    Returns (is_color, saturation_score).
    """
    if not HAS_OPENCV or not HAS_PIL:
        if HAS_PIL:
            try:
                img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                r, g, b = img.split()
                r_arr = np.array(r, dtype=np.float32)
                g_arr = np.array(g, dtype=np.float32)
                b_arr = np.array(b, dtype=np.float32)
                diff_rg = np.mean(np.abs(r_arr - g_arr))
                diff_gb = np.mean(np.abs(g_arr - b_arr))
                color_diff = float((diff_rg + diff_gb) / 2.0)
                return color_diff > 4.0, color_diff
            except Exception as e:
                logger.error(f"PIL color check error: {e}")
                return True, 100.0
        return True, 100.0

    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return True, 100.0

        # Convert to HSV color space
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        saturation = hsv[:, :, 1]
        mean_saturation = float(np.mean(saturation))

        # Check standard deviation of BGR channels
        b, g, r = cv2.split(img)
        std_bgr = float(np.std([np.mean(b), np.mean(g), np.mean(r)]))

        is_color = mean_saturation >= saturation_threshold and std_bgr >= 3.0
        return is_color, mean_saturation
    except Exception as e:
        logger.error(f"OpenCV color check error: {e}")
        return True, 100.0


def check_is_clear(image_bytes: bytes, blur_threshold: float = 60.0) -> Tuple[bool, float]:
    """Blur/clarity check via the Laplacian-variance method (a standard,
    cheap sharpness measure: a sharp image has lots of high-frequency edge
    detail, so the variance of its Laplacian is high; a blurry/out-of-focus
    photo is low). Returns (is_clear, sharpness_score).

    Why this exists: a genuinely unclear photo (motion blur, out of focus,
    a hand blocking part of the shot) is a common reason OCR misreads a
    date or number - and that misread then got treated the same as a real
    typed-vs-photo mismatch (NEEDS_REVIEW, "please double-check"), which is
    the wrong message when the actual problem is the photo itself. Running
    this check first and rejecting outright on a genuinely blurry photo
    ("upload a clear photo") gives a more honest, actionable reason than
    hoping the driver notices a vague mismatch."""
    if not HAS_OPENCV:
        return True, 1000.0  # can't check - don't block on a capability we don't have

    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return True, 1000.0
        variance = float(cv2.Laplacian(img, cv2.CV_64F).var())
        return variance >= blur_threshold, variance
    except Exception as e:
        logger.error(f"Blur/clarity check error: {e}")
        return True, 1000.0


def extract_dates_from_text(text: str) -> List[Tuple[date, str]]:
    """
    Parses dates from extracted OCR text and identifies candidate expiry dates.
    Returns list of (date_obj, date_raw_str).
    """
    found_dates: List[Tuple[date, str]] = []
    
    date_patterns = [
        r'\b(0[1-9]|[12][0-9]|3[01])[\/\-\.](0[1-9]|1[0-2])[\/\-\.](20\d{2})\b', # DD/MM/YYYY
        r'\b(20\d{2})[\/\-\.](0[1-9]|1[0-2])[\/\-\.](0[1-9]|[12][0-9]|3[01])\b', # YYYY/MM/DD
        r'\b(0[1-9]|[12][0-9]|3[01])[\/\-\.](JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\-\.](20\d{2})\b', # DD-MMM-YYYY
    ]
    
    months_map = {
        'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
        'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
    }

    text_upper = text.upper()
    
    matches_1 = re.findall(date_patterns[0], text_upper)
    for d, m, y in matches_1:
        try:
            dt = date(int(y), int(m), int(d))
            found_dates.append((dt, f"{d}/{m}/{y}"))
        except ValueError:
            pass

    matches_2 = re.findall(date_patterns[1], text_upper)
    for y, m, d in matches_2:
        try:
            dt = date(int(y), int(m), int(d))
            found_dates.append((dt, f"{y}-{m}-{d}"))
        except ValueError:
            pass

    matches_3 = re.findall(date_patterns[2], text_upper)
    for d, m_str, y in matches_3:
        try:
            m = months_map.get(m_str, 1)
            dt = date(int(y), m, int(d))
            found_dates.append((dt, f"{d}-{m_str}-{y}"))
        except ValueError:
            pass

    return found_dates


def extract_aadhaar_number_from_text(text: str) -> Optional[str]:
    """Finds a 12-digit Aadhaar number in OCR'd text - printed as 3 groups
    of 4 digits (space or hyphen separated, sometimes with no separator at
    all). Returns just the 12 digits (no separators) so it can be compared
    directly against a typed field, or None if nothing matching was found.
    Added 2026-09-04 for the Aadhaar-number-in-photo vs typed-field check."""
    m = re.search(r'\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b', text)
    if m:
        return "".join(m.groups())
    return None


def compare_faces(image_bytes_1: bytes, image_bytes_2: bytes) -> Dict[str, Any]:
    """Best-effort, ZERO-COST face similarity check between two photos
    (e.g. the photo printed on an Aadhaar/licence card vs a separately
    uploaded profile photo/selfie) - added 2026-09-04 per an explicit
    request to do this without a paid face-match API.

    Uses OpenCV's bundled Haar Cascade for face detection (ships with
    opencv-python-headless, no model download) plus a blend of grayscale
    histogram correlation and ORB feature-match ratio for the similarity
    score. This is NOT a real deep-learning face embedding (face_recognition/
    dlib or a downloaded model would give a far more reliable score, but
    are much heavier to deploy) - treat the result as a coarse heuristic
    for FLAGGING, never as hard biometric proof. Same "don't auto-reject,
    let a human glance at it" philosophy as the rest of this module - the
    caller should route a low score to manual review, not an automatic
    rejection.
    """
    if not HAS_OPENCV:
        return {"status": "UNAVAILABLE", "reason": "Face comparison isn't available on this server.", "match_percent": None, "is_match": False}

    def _load_face(image_bytes: bytes):
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        if len(faces) == 0:
            return None
        # Largest detected face - the most prominent one in the frame.
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face = gray[y:y + h, x:x + w]
        return cv2.resize(face, (200, 200))

    try:
        face1 = _load_face(image_bytes_1)
        face2 = _load_face(image_bytes_2)
    except Exception as e:
        logger.error(f"compare_faces detection error: {e}")
        return {"status": "ERROR", "reason": "Could not process one or both images.", "match_percent": None, "is_match": False}

    if face1 is None or face2 is None:
        return {
            "status": "NO_FACE_DETECTED",
            "reason": "Couldn't detect a clear face in one or both photos.",
            "match_percent": None,
            "is_match": False,
        }

    try:
        face1_eq = cv2.equalizeHist(face1)
        face2_eq = cv2.equalizeHist(face2)

        # Histogram correlation - lighting/contrast-normalized via
        # equalizeHist above so this isn't just comparing exposure levels.
        hist1 = cv2.calcHist([face1_eq], [0], None, [256], [0, 256])
        hist2 = cv2.calcHist([face2_eq], [0], None, [256], [0, 256])
        cv2.normalize(hist1, hist1)
        cv2.normalize(hist2, hist2)
        hist_score = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)  # ~[-1, 1]
        hist_pct = max(0.0, min(1.0, (hist_score + 1) / 2))

        # ORB feature-match ratio - more tolerant of pose/expression
        # differences between the two photos than raw pixel histograms.
        orb = cv2.ORB_create(nfeatures=300)
        kp1, des1 = orb.detectAndCompute(face1_eq, None)
        kp2, des2 = orb.detectAndCompute(face2_eq, None)
        orb_pct = 0.0
        if des1 is not None and des2 is not None and len(des1) > 0 and len(des2) > 0:
            bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
            matches = bf.match(des1, des2)
            good_matches = [m for m in matches if m.distance < 60]
            orb_pct = min(1.0, len(good_matches) / max(1, min(len(kp1), len(kp2))))

        match_percent = round(((hist_pct * 0.5) + (orb_pct * 0.5)) * 100, 1)
    except Exception as e:
        logger.error(f"compare_faces scoring error: {e}")
        return {"status": "ERROR", "reason": "Could not compare the two photos.", "match_percent": None, "is_match": False}

    return {
        "status": "OK",
        "reason": None,
        "match_percent": match_percent,
        "is_match": match_percent >= 50.0,
        "hist_score": round(hist_pct * 100, 1),
        "orb_score": round(orb_pct * 100, 1),
    }


def extract_ocr_text(image_bytes: bytes) -> str:
    """Extracts plain text from image using available OCR engine."""
    extracted_text = ""
    if HAS_EASYOCR:
        try:
            results = reader.readtext(image_bytes, detail=0)
            extracted_text = " ".join(results)
        except Exception as e:
            logger.error(f"EasyOCR error: {e}")
    
    if not extracted_text and HAS_PIL:
        try:
            import pytesseract
            img = Image.open(io.BytesIO(image_bytes))
            extracted_text = pytesseract.image_to_string(img)
        except Exception as e:
            # Was a silent `except: pass` - found 2026-09-04 when this
            # path was returning "" with zero visibility into why
            # (TesseractNotFoundError if the tesseract-ocr apt package
            # didn't actually land on PATH, or any other failure) - at
            # least log it now, same as the EasyOCR branch above always did.
            logger.error(f"pytesseract OCR error: {e}")

    return extracted_text


# ----------------------------------------------------------------------------------------------------------------------
# Document verification v2 (2026-09-24)
#
# The old pipeline only really rejected black-and-white / blurry photos: with no OCR text, no expected number and no expected
# expiry it fell straight through to VERIFIED, so a wrong document, a selfie or an expired licence all passed. This version
# decides from what is actually READ on the document:
#   1. is it an original colour photo, sharp enough to read?                     (unchanged)
#   2. read it - pre-processed multi-pass Tesseract; if the admin enabled "AI document reading" (Gemini vision) the AI facts
#      replace the OCR facts, which is far more accurate on phone photos
#   3. is it the RIGHT kind of document?      (e.g. an Aadhaar uploaded as a licence is INVALID)
#   4. identity numbers look valid?           (Aadhaar 12 digits + Verhoeff check digit, PAN, vehicle number, DL number)
#   5. expiry / validity found and in the future?   (expired -> INVALID; not found on an expiry document -> NEEDS_REVIEW)
#   6. typed number / expiry / name agree with the photo?  (mismatch -> NEEDS_REVIEW)
# VERIFIED needs a positive reading (right document type + a valid number or date). Anything uncertain goes to NEEDS_REVIEW
# (human queue) instead of being waved through; only clearly unusable photos or expired documents are INVALID.
# ----------------------------------------------------------------------------------------------------------------------

_MONTHS = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}

DOC_PROFILES: Dict[str, Dict[str, Any]] = {
    "licence": {"label": "driving licence", "needs_expiry": True, "min_kw": 2,
                "keywords": ["DRIVING", "LICENCE", "LICENSE", "UNION OF INDIA", "TRANSPORT", "DL NO", "DLNO", "VALIDITY", "COV", "MCWG", "LMV",
                             "BADGE", "MOTOR", "VEHICLE", "DATE OF ISSUE", "BLOOD", "DRIVING LICENCE"]},
    "rc": {"label": "registration certificate (RC)", "needs_expiry": False, "min_kw": 2,
           "keywords": ["REGISTRATION", "REGN", "CERTIFICATE", "OWNER", "CHASSIS", "ENGINE", "VEHICLE", "MAKER", "FUEL", "HYPOTHECATION",
                        "UNLADEN", "SEATING", "MFG", "CLASS", "COLOUR", "COLOR"]},
    "insurance": {"label": "insurance policy", "needs_expiry": True, "min_kw": 2,
                  "keywords": ["INSURANCE", "POLICY", "INSURED", "PREMIUM", "COVER", "IDV", "THIRD PARTY", "LIABILITY", "INSURER", "PERIOD OF",
                               "NOMINEE", "OWN DAMAGE"]},
    "fc": {"label": "fitness certificate", "needs_expiry": True, "min_kw": 1,
           "keywords": ["FITNESS", "CERTIFICATE OF FITNESS", "FC", "VALID UPTO", "VALIDITY", "TRANSPORT", "INSPECTION", "MOTOR VEHICLE"]},
    "permit": {"label": "permit", "needs_expiry": True, "min_kw": 1,
               "keywords": ["PERMIT", "AUTHORISATION", "AUTHORIZATION", "ROUTE", "TOURIST", "CONTRACT CARRIAGE", "ALL INDIA", "NATIONAL", "TRANSPORT",
                            "VALID"]},
    "pollution": {"label": "pollution (PUC) certificate", "needs_expiry": True, "min_kw": 1,
                  "keywords": ["POLLUTION", "PUC", "EMISSION", "UNDER CONTROL", "PUCC", "CO ", "HC ", "SMOKE", "TEST"]},
    "aadhar": {"label": "Aadhaar card", "needs_expiry": False, "min_kw": 1,
               "keywords": ["AADHAAR", "AADHAR", "GOVERNMENT OF INDIA", "UNIQUE IDENTIFICATION", "UIDAI", "ENROLMENT", "ENROLLMENT", "MY AADHAAR",
                            "YEAR OF BIRTH", "DOB", "VID", "ADDRESS"]},
    "pan": {"label": "PAN card", "needs_expiry": False, "min_kw": 1,
            "keywords": ["INCOME TAX", "PERMANENT ACCOUNT", "PAN", "GOVT. OF INDIA", "GOVT OF INDIA", "SIGNATURE", "FATHER"]},
}
_DOC_ALIASES = {"license": "licence", "dl": "licence", "aadhaar": "aadhar", "aadhar_front": "aadhar", "aadhar_back": "aadhar",
                "rc_front": "rc", "rc_back": "rc", "puc": "pollution", "car_insurance": "insurance"}


def _profile_for(document_type: str) -> Optional[Dict[str, Any]]:
    t = _DOC_ALIASES.get((document_type or "").lower(), (document_type or "").lower())
    p = DOC_PROFILES.get(t)
    return (t, p) if p else (t, None)


def _verhoeff_ok(number: str) -> bool:
    """Aadhaar's 12th digit is a Verhoeff check digit - a made-up or misread number fails it."""
    d = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
         [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
         [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
    p = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
         [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]
    if not number.isdigit() or len(number) != 12:
        return False
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = d[c][p[i % 8][int(ch)]]
    return c == 0


def _to_date(d: int, m: int, y: int) -> Optional[date]:
    try:
        return date(y, m, d)
    except ValueError:
        return None


_DATE_RE = re.compile(
    r'(?P<dmy>(0?[1-9]|[12]\d|3[01])\s?[\/\-\.]\s?(0?[1-9]|1[0-2])\s?[\/\-\.]\s?(?P<y1>(?:19|20)\d{2}))'
    r'|(?P<ymd>(?P<y2>(?:19|20)\d{2})\s?[\/\-\.]\s?(0?[1-9]|1[0-2])\s?[\/\-\.]\s?(0?[1-9]|[12]\d|3[01]))'
    r'|(?P<dmon>(0?[1-9]|[12]\d|3[01])[\s\-\/\.]?(?P<mon>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s\-\/\.,]*(?P<y3>(?:19|20)\d{2}))'
)


def _dates_with_pos(text: str) -> List[Tuple[int, date]]:
    out: List[Tuple[int, date]] = []
    up = text.upper()
    for m in _DATE_RE.finditer(up):
        try:
            if m.group('dmy'):
                parts = re.split(r'\s?[\/\-\.]\s?', m.group('dmy'))
                dt = _to_date(int(parts[0]), int(parts[1]), int(parts[2]))
            elif m.group('ymd'):
                parts = re.split(r'\s?[\/\-\.]\s?', m.group('ymd'))
                dt = _to_date(int(parts[2]), int(parts[1]), int(parts[0]))
            else:
                dd = re.match(r'\d{1,2}', m.group('dmon')).group(0)
                dt = _to_date(int(dd), _MONTHS[m.group('mon')], int(m.group('y3')))
        except (ValueError, KeyError, AttributeError, IndexError):
            dt = None
        if dt:
            out.append((m.start(), dt))
    return out


_EXPIRY_KEYS = re.compile(r'(VALID(?:ITY)?(?:\s*(?:UPTO|UP\s*TO|TILL|TO|UNTIL|:))?|EXPIR(?:Y|ES|ED|ATION)|UPTO|UP\s*TO|TILL|UNTIL|\bTO\b|NT\b|TR\b|\(NT\)|\(TR\))')


def find_expiry(text: str) -> Tuple[Optional[date], bool]:
    """(expiry, keyword_linked). A date that follows a validity / expiry / upto / till / to word is trusted; without such a
    keyword no date is trusted (a document number or an issue date must never be taken for an expiry)."""
    ds = _dates_with_pos(text)
    if not ds:
        return None, False
    up = text.upper()
    linked: List[date] = []
    for pos, dt in ds:
        window = up[max(0, pos - 40):pos]
        if _EXPIRY_KEYS.search(window):
            linked.append(dt)
    if linked:
        return max(linked), True
    return None, False


_DL_RE = re.compile(r'\b([A-Z]{2}[\s\-]?\d{2}[\s\-]?(?:19|20)?\d{2}[\s\-]?\d{5,8})\b')
_VEH_RE = re.compile(r'\b([A-Z]{2}[\s\-]?\d{1,2}[\s\-]?[A-Z]{1,3}[\s\-]?\d{4})\b')
_PAN_RE = re.compile(r'\b([A-Z]{5}\d{4}[A-Z])\b')


def _preprocess_variants(image_bytes: bytes):
    """Yield PIL images that OCR reads better: upscaled greyscale + contrast-normalised, and an adaptive-threshold version."""
    if not (HAS_PIL and HAS_OPENCV):
        if HAS_PIL:
            yield Image.open(io.BytesIO(image_bytes))
        return
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return
    h, w = img.shape[:2]
    scale = 1.0
    if max(h, w) < 1800:
        scale = 1800.0 / max(h, w)
    elif max(h, w) > 2600:
        scale = 2600.0 / max(h, w)
    if abs(scale - 1.0) > 0.05:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    g1 = clahe.apply(gray)
    yield Image.fromarray(g1)
    th = cv2.adaptiveThreshold(cv2.GaussianBlur(gray, (3, 3), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 41, 12)
    yield Image.fromarray(th)


def read_document_text(image_bytes: bytes) -> str:
    """Best text we can get: EasyOCR when installed, else Tesseract over pre-processed variants (merged)."""
    text = extract_ocr_text(image_bytes) if HAS_EASYOCR else ""
    if len(text) >= 80:
        return text
    chunks: List[str] = [text] if text else []
    try:
        import pytesseract
        for i, im in enumerate(_preprocess_variants(image_bytes)):
            for psm in ("6", "11") if i == 0 else ("6",):
                try:
                    chunks.append(pytesseract.image_to_string(im, config=f"--oem 3 --psm {psm}", timeout=25))
                except Exception as e:  # noqa: BLE001
                    logger.warning("tesseract pass failed: %s", e)
            if sum(len(c) for c in chunks) > 400:
                break
    except Exception as e:  # noqa: BLE001
        logger.error("document OCR unavailable: %s", e)
    return "\n".join(c for c in chunks if c)


def _names_match(expected: str, found_text: str) -> bool:
    toks = [t for t in re.sub(r'[^A-Z\s]', ' ', expected.upper()).split() if len(t) >= 3]
    if not toks:
        return True
    up = found_text.upper()
    return any(t in up for t in toks)


def _ai_facts(image_bytes: bytes, doc_kind: str) -> Optional[Dict[str, Any]]:
    try:
        from app.utils.document_ai import extract_facts
        return extract_facts(image_bytes, doc_kind)
    except Exception as e:  # noqa: BLE001
        logger.warning("AI document reading failed (using OCR): %s", e)
        return None


def _result(status: str, reason: Optional[str], base: Dict[str, Any], confidence: float, **extra) -> Dict[str, Any]:
    out = {"status": status, "reason": reason, "is_color": base.get("is_color", True), "color_score": base.get("color_score", 0.0),
           "is_expired": extra.pop("is_expired", False), "confidence": confidence}
    out.update({k: v for k, v in base.items() if k not in out and k in ("is_clear", "sharpness_score")})
    out.update(extra)
    return out


def verify_uploaded_document(
    image_bytes: bytes,
    document_type: str = "generic",
    expected_expiry_date: Optional[str] = None,
    expected_aadhaar_number: Optional[str] = None,
    expected_document_number: Optional[str] = None,
    expected_name: Optional[str] = None,
) -> Dict[str, Any]:
    today = date.today()
    kind, profile = _profile_for(document_type)

    # 1. original colour photo / sharp enough
    is_color, color_score = check_is_original_color(image_bytes)
    base: Dict[str, Any] = {"is_color": is_color, "color_score": color_score}
    if not is_color:
        return _result("INVALID", "Original document not uploaded - this looks like a photocopy / black-and-white photo. Upload a clear colour photo of the ORIGINAL.", base, 0.95,
                       extracted_expiry_date=None)
    is_clear, sharpness = check_is_clear(image_bytes)
    base.update({"is_clear": is_clear, "sharpness_score": sharpness})
    if not is_clear:
        return _result("INVALID", "Photo is too blurry/unclear to read - please retake it in good light, in focus, with the whole document visible.",
                       base, 0.9, extracted_expiry_date=None)

    # 2. read it
    ai = _ai_facts(image_bytes, kind) if profile else None
    text = read_document_text(image_bytes) if not ai else ""
    ocr_upper = text.upper()
    alnum = re.sub(r'[^A-Z0-9]', '', ocr_upper)

    detected_expiry: Optional[date] = None
    expiry_trusted = False
    doc_number: Optional[str] = None
    name_found_text = text
    kw_hits = 0
    detected_kind = kind
    readable = True

    if ai:
        readable = bool(ai.get("is_readable", True))
        detected_kind = _DOC_ALIASES.get(str(ai.get("document_type") or "").lower(), str(ai.get("document_type") or "").lower())
        try:
            if ai.get("expiry_date"):
                detected_expiry = datetime.strptime(str(ai["expiry_date"])[:10], "%Y-%m-%d").date()
                expiry_trusted = True
        except ValueError:
            pass
        doc_number = re.sub(r'\s', '', str(ai.get("document_number") or ai.get("vehicle_number") or "")).upper() or None
        name_found_text = " ".join(str(ai.get(k) or "") for k in ("holder_name", "owner_name"))
        alnum = re.sub(r'[^A-Z0-9]', '', (doc_number or "") + " " + name_found_text.upper())
        wrong_type = detected_kind not in ("", kind, "unknown")
        if ai.get("looks_tampered"):
            return _result("NEEDS_REVIEW", "The document photo looks edited or not genuine - a person will check it.", base, 0.7)
    else:
        if len(alnum) < 20:
            readable = False
        if profile:
            kw_hits = sum(1 for k in profile["keywords"] if k in ocr_upper)
        detected_expiry, expiry_trusted = find_expiry(text)
        wrong_type = False
        if profile:
            # does it look MORE like a different document?
            best_other, best_hits = None, 0
            for other, p in DOC_PROFILES.items():
                if other == kind:
                    continue
                h = sum(1 for k in p["keywords"] if k in ocr_upper)
                if h > best_hits:
                    best_other, best_hits = other, h
            wrong_type = bool(best_other and best_hits >= max(3, kw_hits + 2) and kw_hits < profile["min_kw"])
            if wrong_type:
                detected_kind = best_other

    if not readable:
        return _result("INVALID", "We could not read this photo. Please retake it in good light with the whole document flat and in focus.", base, 0.85,
                       extracted_expiry_date=None)

    if wrong_type:
        lab = DOC_PROFILES.get(detected_kind, {}).get("label", "another document")
        return _result("INVALID", f"You uploaded a {lab} here, but this slot needs the {profile['label']}. Upload the {profile['label']}.", base, 0.85,
                       extracted_expiry_date=None, detected_document_type=detected_kind)

    # 3. numbers
    aadhaar_found = None
    number_ok: Optional[bool] = None
    if kind == "aadhar":
        aadhaar_found = extract_aadhaar_number_from_text(text) if not ai else (re.sub(r'\D', '', str(ai.get("document_number") or "")) or None)
        if aadhaar_found:
            number_ok = _verhoeff_ok(aadhaar_found)
            if not number_ok:
                return _result("NEEDS_REVIEW", "The Aadhaar number read from the photo is not a valid Aadhaar number - please retake a clear photo.", base, 0.7,
                               extracted_aadhaar_number=aadhaar_found, aadhaar_mismatch=False)
        doc_number = aadhaar_found
    elif kind == "pan":
        m = _PAN_RE.search(ocr_upper) if not ai else _PAN_RE.search((doc_number or "").upper())
        doc_number = m.group(1) if m else doc_number
        number_ok = bool(m)
    elif kind == "licence":
        m = _DL_RE.search(ocr_upper) if not ai else _DL_RE.search((doc_number or ""))
        if m:
            doc_number = re.sub(r'[\s\-]', '', m.group(1))
            number_ok = True
    elif kind in ("rc", "insurance", "fc", "permit", "pollution"):
        m = _VEH_RE.search(ocr_upper) if not ai else _VEH_RE.search((doc_number or ""))
        if m:
            doc_number = re.sub(r'[\s\-]', '', m.group(1))
            number_ok = True

    # 4. expiry
    exp_typed: Optional[date] = None
    if expected_expiry_date:
        try:
            exp_typed = datetime.strptime(expected_expiry_date, "%Y-%m-%d").date()
        except ValueError:
            exp_typed = None
    for label_date in (exp_typed, detected_expiry if expiry_trusted else None):
        if label_date and label_date < today:
            _lab = profile["label"] if profile else "document"
            return _result("INVALID", f"Your {_lab} expired on {label_date.strftime('%d %b %Y')}. Upload the renewed {_lab} and enter its new expiry date.", base, 0.93,
                           extracted_expiry_date=(detected_expiry.isoformat() if detected_expiry else label_date.isoformat()), is_expired=True)
    if detected_expiry and expiry_trusted and exp_typed and detected_expiry != exp_typed:
        return _result("INVALID",
                       f"The date you entered ({exp_typed.strftime('%d %b %Y')}) does not match the date on the {profile['label'] if profile else 'document'} ({detected_expiry.strftime('%d %b %Y')}). Enter the date printed on the document, or upload the correct document.",
                       base, 0.75, extracted_expiry_date=detected_expiry.isoformat(), entered_expiry_date=exp_typed.isoformat(), date_mismatch=True)

    # 5. typed values vs photo
    entered_aadhaar = re.sub(r'\D', '', expected_aadhaar_number) if expected_aadhaar_number else None
    if aadhaar_found and entered_aadhaar and aadhaar_found != entered_aadhaar:
        return _result("NEEDS_REVIEW",
                       f"Entered Aadhaar number ({entered_aadhaar}) doesn't match the number found on the document ({aadhaar_found}) - please double-check.",
                       base, 0.75, extracted_aadhaar_number=aadhaar_found, entered_aadhaar_number=entered_aadhaar, aadhaar_mismatch=True,
                       extracted_expiry_date=detected_expiry.isoformat() if detected_expiry else None)
    if expected_document_number:
        want = re.sub(r'[^A-Z0-9]', '', expected_document_number.upper())
        if len(want) >= 5 and len(alnum) > 25 and want not in alnum and not (len(want) >= 8 and want[-7:] in alnum):
            return _result("NEEDS_REVIEW", f"Entered document number ({expected_document_number}) does not match the number found in the document photo.",
                           base, 0.75, document_number_mismatch=True)
    if expected_name and (len(alnum) > 30 or ai) and not _names_match(expected_name, name_found_text if ai else ocr_upper):
        return _result("NEEDS_REVIEW", f"Name ({expected_name}) does not match the name found on the document.", base, 0.75, name_mismatch=True)

    # 6. positive identification - VERIFIED only when the document was really recognised
    recognised = (detected_kind == kind and bool(ai)) or (not ai and profile is not None and kw_hits >= profile["min_kw"])
    has_evidence = bool(number_ok) or bool(detected_expiry and expiry_trusted) or (profile is not None and not profile["needs_expiry"] and recognised)
    needs_expiry = bool(profile and profile["needs_expiry"])
    if profile is None:
        return _result("NEEDS_REVIEW", "Document type not recognised - a person will check it.", base, 0.5)
    if not recognised:
        return _result("NEEDS_REVIEW", f"We could not confirm this is a {profile['label']} - a person will check it.", base, 0.55,
                       extracted_expiry_date=detected_expiry.isoformat() if detected_expiry else None)
    if needs_expiry and not (detected_expiry and expiry_trusted) and not exp_typed:
        # recognised, but no validity date could be read (e.g. the back side of a licence) - do not wave it through blindly
        if not number_ok:
            return _result("NEEDS_REVIEW", f"Could not read the validity date on this {profile['label']} - a person will check it.", base, 0.6)
    if not has_evidence:
        return _result("NEEDS_REVIEW", f"Could not read the details on this {profile['label']} clearly - a person will check it.", base, 0.6)

    return _result("VERIFIED", None, base, 0.9 if ai else 0.85,
                   extracted_expiry_date=(detected_expiry.isoformat() if detected_expiry else expected_expiry_date),
                   entered_expiry_date=exp_typed.isoformat() if exp_typed else None, date_mismatch=False,
                   extracted_aadhaar_number=aadhaar_found, entered_aadhaar_number=entered_aadhaar, aadhaar_mismatch=False,
                   document_number=doc_number, read_by="AI" if ai else "OCR")


def get_auto_verified_status(*args, **kwargs):
    """Status only (see get_auto_verification for the status AND the reason)."""
    return get_auto_verification(*args, **kwargs)[0]


def get_auto_verification(
    image_bytes: bytes,
    document_type: str,
    expected_expiry_date: Optional[str] = None,
    expected_aadhaar_number: Optional[str] = None,
    expected_document_number: Optional[str] = None,
    expected_name: Optional[str] = None,
    previous_status=None,
):
    from app.models.common_enums import DocumentStatusEnum
    try:
        result = verify_uploaded_document(
            image_bytes=image_bytes,
            document_type=document_type,
            expected_expiry_date=expected_expiry_date,
            expected_aadhaar_number=expected_aadhaar_number,
            expected_document_number=expected_document_number,
            expected_name=expected_name,
        )
        status_str = result.get("status")
        reason = result.get("reason")
        if status_str == "VERIFIED":
            return DocumentStatusEnum.VERIFIED, None
        elif status_str == "INVALID":
            # INVALID = wrong / non-original / unreadable / expired / date does not match. Different from "not verified yet".
            return DocumentStatusEnum.INVALID, reason
        elif status_str == "NEEDS_REVIEW":
            return DocumentStatusEnum.NEEDS_REVIEW, reason
    except Exception as e:
        logger.error(f"Auto-verification failed for document_type={document_type} (falling back to manual review): {e}")

    if previous_status is not None and previous_status != DocumentStatusEnum.PENDING:
        return DocumentStatusEnum.NEEDS_REVIEW, "A person will check this document."
    return DocumentStatusEnum.PENDING, None


def extract_aadhaar_fields(image_bytes: bytes) -> Dict[str, Optional[str]]:
    """
    Extracts autofill-ready fields from an Aadhaar card front image using OCR.
    Returns a dict with keys: name, dob, gender, aadhaar_number, address.
    All values are strings or None if not found.

    This is BEST-EFFORT only — OCR may miss or misread fields, especially on
    low-res or skewed photos. The caller should always let the user correct
    any pre-filled values before submitting.
    """
    result: Dict[str, Optional[str]] = {
        "name": None,
        "dob": None,
        "gender": None,
        "aadhaar_number": None,
        "address": None,
    }

    if not HAS_EASYOCR and not HAS_PIL:
        return result

    try:
        ocr_text = extract_ocr_text(image_bytes)
    except Exception as e:
        logger.error(f"extract_aadhaar_fields OCR error: {e}")
        return result

    if not ocr_text:
        return result

    lines = [ln.strip() for ln in ocr_text.splitlines() if ln.strip()]
    text_upper = ocr_text.upper()

    # --- Aadhaar Number ---
    result["aadhaar_number"] = extract_aadhaar_number_from_text(ocr_text)

    # --- Gender ---
    if re.search(r'\bFEMALE\b|\bWOMAN\b|\bF\b/FEMALE', text_upper):
        result["gender"] = "Female"
    elif re.search(r'\bMALE\b|\bMAN\b|\bM\b/MALE', text_upper):
        result["gender"] = "Male"

    # --- DOB --- (DD/MM/YYYY or YYYY patterns)
    dob_match = re.search(
        r'(?:DOB|Date of Birth|D\.O\.B)[:\s]*'
        r'(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})',
        ocr_text, re.IGNORECASE
    )
    if dob_match:
        result["dob"] = dob_match.group(1).strip()
    else:
        # fallback: look for any date-like pattern before a gender keyword
        dates_found = extract_dates_from_text(ocr_text)
        if dates_found:
            # Pick the earliest date (most likely DOB, not expiry/issue)
            earliest = min(dates_found, key=lambda x: x[0])
            result["dob"] = earliest[1]

    # --- Name ---
    # Aadhaar cards typically print the name on the line after "Government of India"
    # or before the DOB line. Common heuristics:
    name_candidate = None

    # 1. Line immediately after "GOVERNMENT OF INDIA" line
    for i, line in enumerate(lines):
        if re.search(r'GOVERNMENT\s+OF\s+INDIA|भारत\s+सरकार', line, re.IGNORECASE):
            if i + 1 < len(lines):
                candidate = lines[i + 1].strip()
                # Must look like a name: only letters and spaces, >= 3 chars
                if re.match(r'^[A-Za-z\s\.]{3,}$', candidate):
                    name_candidate = candidate
                    break

    # 2. First "looks-like-a-name" line that isn't a keyword
    SKIP_KEYWORDS = {'GOVERNMENT', 'INDIA', 'UNIQUE', 'IDENTIFICATION', 'AUTHORITY',
                     'AADHAAR', 'AADHAR', 'DOB', 'DATE', 'BIRTH', 'MALE', 'FEMALE',
                     'ADDRESS', 'ENROLLMENT', 'YEAR', 'VALID', 'CARD', 'ENROLMENT'}
    if not name_candidate:
        for line in lines:
            tokens = line.upper().split()
            if (re.match(r'^[A-Za-z\s\.]{5,50}$', line)
                    and not any(kw in tokens for kw in SKIP_KEYWORDS)
                    and len(tokens) >= 2):
                name_candidate = line.strip()
                break

    if name_candidate:
        result["name"] = name_candidate.title()

    # --- Address ---
    # Aadhaar back side or front bottom has address. Try to grab everything
    # after "Address:" or "S/O", "D/O", "W/O" patterns.
    addr_match = re.search(
        r'(?:Address|Addr|S/O|D/O|W/O|SO|DO|WO)[:\s]+(.*?)(?:\d{6})',
        ocr_text, re.IGNORECASE | re.DOTALL
    )
    if addr_match:
        raw_addr = addr_match.group(1).strip()
        # Clean up whitespace/newlines
        result["address"] = re.sub(r'\s+', ' ', raw_addr).strip()

    # Also try to extract pincode from text (6-digit)
    pincode_match = re.search(r'\b([1-9]\d{5})\b', ocr_text)
    if pincode_match:
        result["pincode"] = pincode_match.group(1)
    else:
        result["pincode"] = None

    return result

