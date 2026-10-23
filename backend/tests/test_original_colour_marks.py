"""A white-paper ORIGINAL with a colour signature / stamp counts as an original; a black-and-white photocopy does not (owner 2026-10-24)."""
import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")

from app.utils.document_verifier import _coloured_marks_area, check_is_original_color


def _page(tint=(255, 255, 255)):
    img = np.zeros((1400, 1000, 3), np.uint8)
    img[:] = tint
    for y in range(120, 1200, 60):                                   # lines of black text
        cv2.putText(img, "POLICY NO 1234 VALID UPTO 12/03/2027", (60, y), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 20, 20), 2)
    return img


def _jpeg(img):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes()


def test_photocopy_is_not_an_original():
    ok, _ = check_is_original_color(_jpeg(_page((245, 245, 245))))
    assert ok is False


def test_white_paper_with_a_blue_ink_signature_is_an_original():
    img = _page()
    pts = np.array([[700, 1250], [760, 1200], [820, 1290], [880, 1210], [960, 1280]], np.int32)
    cv2.polylines(img, [pts], False, (200, 40, 20), 9)             # BGR blue ink
    cv2.rectangle(img, (80, 1250), (240, 1330), (30, 60, 200), 6)   # red-ish stamp box
    data = _jpeg(img)
    assert _coloured_marks_area(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)) >= 0.0012
    ok, _ = check_is_original_color(data)
    assert ok is True


def test_a_warm_tinted_photocopy_with_no_colour_marks_stays_a_copy():
    # warm light over a black-and-white copy: the whole page shares one tint, text stays neutral
    img = cv2.imdecode(np.frombuffer(_jpeg(_page((205, 222, 238))), np.uint8), cv2.IMREAD_COLOR)
    assert _coloured_marks_area(img) < 0.0012          # the new rule sees no coloured marks on it (one tint everywhere)
