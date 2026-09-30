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


def verify_uploaded_document(
    image_bytes: bytes,
    document_type: str = "generic",
    expected_expiry_date: Optional[str] = None,
    expected_aadhaar_number: Optional[str] = None,
    expected_document_number: Optional[str] = None,
    expected_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main verification pipeline for driver documents:
    1. Checks if original color or Xerox (Black & White).
    2. Checks the photo is sharp enough to trust an OCR reading from.
    3. Runs OCR to read document text.
    4. Parses expiry date and validates if active or expired (if required).
    5. Cross-checks document number (DL/RC/Aadhaar) and driver/owner name.
    6. Returns verification status & reason.
    """
    today = date.today()

    # Step 1: Color / Xerox Check
    is_color, color_score = check_is_original_color(image_bytes)
    if not is_color:
        return {
            "status": "INVALID",
            "reason": "Original document not uploaded",
            "is_color": False,
            "color_score": color_score,
            "extracted_expiry_date": None,
            "is_expired": False,
            "confidence": 0.95
        }

    # Step 2: Clarity/Blur Check
    is_clear, sharpness_score = check_is_clear(image_bytes)
    if not is_clear:
        return {
            "status": "INVALID",
            "reason": "Photo is too blurry/unclear to read - please retake it in good light, in focus, with the whole document visible.",
            "is_color": True,
            "color_score": color_score,
            "is_clear": False,
            "sharpness_score": sharpness_score,
            "extracted_expiry_date": None,
            "is_expired": False,
            "confidence": 0.9
        }

    # Step 3: OCR Text Extraction
    ocr_text = extract_ocr_text(image_bytes)
    ocr_upper = ocr_text.upper()
    clean_ocr_alnum = re.sub(r'[^A-Z0-9]', '', ocr_upper)

    # Step 4: Date Extraction & Expiry Validation (only if expected_expiry_date is set or for expiry-requiring docs)
    found_dates = extract_dates_from_text(ocr_text)
    detected_expiry: Optional[date] = None
    is_expired = False

    if found_dates:
        sorted_dates = sorted(found_dates, key=lambda x: x[0], reverse=True)
        detected_expiry = sorted_dates[0][0]

        if detected_expiry < today and expected_expiry_date:
            is_expired = True
            return {
                "status": "INVALID",
                "reason": "Document has expired",
                "is_color": True,
                "color_score": color_score,
                "extracted_expiry_date": detected_expiry.isoformat(),
                "is_expired": True,
                "confidence": 0.90
            }

    exp_date_obj: Optional[date] = None
    if expected_expiry_date:
        try:
            exp_date_obj = datetime.strptime(expected_expiry_date, "%Y-%m-%d").date()
            if exp_date_obj < today:
                return {
                    "status": "INVALID",
                    "reason": "Document has expired",
                    "is_color": True,
                    "color_score": color_score,
                    "extracted_expiry_date": exp_date_obj.isoformat(),
                    "is_expired": True,
                    "confidence": 0.99
                }
        except ValueError:
            pass

    if detected_expiry and exp_date_obj and detected_expiry != exp_date_obj:
        return {
            "status": "NEEDS_REVIEW",
            "reason": f"Entered expiry ({exp_date_obj.isoformat()}) doesn't match the date found on the document ({detected_expiry.isoformat()}) - please double-check.",
            "is_color": True,
            "color_score": color_score,
            "extracted_expiry_date": detected_expiry.isoformat(),
            "entered_expiry_date": exp_date_obj.isoformat(),
            "date_mismatch": True,
            "is_expired": False,
            "confidence": 0.75
        }

    # Step 5: Aadhaar-number cross-check
    detected_aadhaar = extract_aadhaar_number_from_text(ocr_text)
    entered_aadhaar = re.sub(r'\D', '', expected_aadhaar_number) if expected_aadhaar_number else None
    if detected_aadhaar and entered_aadhaar and detected_aadhaar != entered_aadhaar:
        return {
            "status": "NEEDS_REVIEW",
            "reason": f"Entered Aadhaar number ({entered_aadhaar}) doesn't match the number found on the document ({detected_aadhaar}) - please double-check.",
            "is_color": True,
            "color_score": color_score,
            "extracted_expiry_date": detected_expiry.isoformat() if detected_expiry else expected_expiry_date,
            "entered_expiry_date": exp_date_obj.isoformat() if exp_date_obj else None,
            "date_mismatch": False,
            "extracted_aadhaar_number": detected_aadhaar,
            "entered_aadhaar_number": entered_aadhaar,
            "aadhaar_mismatch": True,
            "is_expired": False,
            "confidence": 0.75
        }

    # Step 6: Document number (DL / RC / etc.) cross-check
    if expected_document_number:
        clean_expected_doc = re.sub(r'[^A-Z0-9]', '', expected_document_number.upper())
        if len(clean_expected_doc) >= 5:
            # Check full match
            doc_matched = clean_expected_doc in clean_ocr_alnum
            # Check suffix/serial match if full wasn't matched directly
            if not doc_matched and len(clean_expected_doc) >= 8:
                serial_part = clean_expected_doc[-7:]
                doc_matched = serial_part in clean_ocr_alnum
            
            # If OCR found enough text (>25 chars) and document number does NOT match at all
            if not doc_matched and len(clean_ocr_alnum) > 25:
                return {
                    "status": "NEEDS_REVIEW",
                    "reason": f"Entered document number ({expected_document_number}) does not match the number found in the document photo.",
                    "is_color": True,
                    "color_score": color_score,
                    "document_number_mismatch": True,
                    "is_expired": False,
                    "confidence": 0.75
                }

    # Step 7: Driver/Owner Name cross-check
    if expected_name:
        clean_name = re.sub(r'[^A-Z\s]', '', expected_name.upper())
        name_tokens = [tok for tok in clean_name.split() if len(tok) >= 3]
        if name_tokens and len(clean_ocr_alnum) > 30:
            matched_name_tokens = [tok for tok in name_tokens if tok in ocr_upper]
            if not matched_name_tokens:
                return {
                    "status": "NEEDS_REVIEW",
                    "reason": f"Driver name ({expected_name}) does not match the name found on the document.",
                    "is_color": True,
                    "color_score": color_score,
                    "name_mismatch": True,
                    "is_expired": False,
                    "confidence": 0.75
                }

    return {
        "status": "VERIFIED",
        "reason": None,
        "is_color": True,
        "color_score": color_score,
        "extracted_expiry_date": detected_expiry.isoformat() if detected_expiry else expected_expiry_date,
        "entered_expiry_date": exp_date_obj.isoformat() if exp_date_obj else None,
        "date_mismatch": False,
        "extracted_aadhaar_number": detected_aadhaar,
        "entered_aadhaar_number": entered_aadhaar,
        "aadhaar_mismatch": False,
        "is_expired": False,
        "confidence": 0.85
    }


def get_auto_verified_status(
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
        if status_str == "VERIFIED":
            return DocumentStatusEnum.VERIFIED
        elif status_str == "INVALID":
            return DocumentStatusEnum.INVALID
        elif status_str == "NEEDS_REVIEW":
            return DocumentStatusEnum.NEEDS_REVIEW
    except Exception as e:
        logger.error(f"Auto-verification failed for document_type={document_type} (falling back to manual review): {e}")

    if previous_status is not None and previous_status != DocumentStatusEnum.VERIFIED:
        return DocumentStatusEnum.NEEDS_REVIEW
    return DocumentStatusEnum.PENDING
