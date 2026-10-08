import io

from PIL import Image, ImageDraw

from app.utils.doc_model import fingerprint, similarity, best_match


def _card(bg, band, w=640, h=400, shift=0):
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, w - 20, 90], fill=band)
    d.rectangle([30 + shift, 150, 300 + shift, 170], fill=(20, 20, 20))
    d.rectangle([30, 200, 420, 215], fill=(20, 20, 20))
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def test_same_kind_of_document_matches_and_a_different_one_does_not():
    karnataka = _card((235, 225, 190), (30, 110, 60))
    another_karnataka = _card((232, 222, 188), (32, 108, 62), shift=3)      # a different person's RC of the same format
    kerala = _card((190, 210, 240), (160, 40, 40))                            # different colours / layout
    a, b, c = fingerprint(karnataka), fingerprint(another_karnataka), fingerprint(kerala)
    assert similarity(a, b) > 0.9
    assert similarity(a, c) < 0.8


def test_best_match_picks_the_closest_model_and_respects_the_threshold():
    models = [("Karnataka RC", fingerprint(_card((235, 225, 190), (30, 110, 60)))), ("Kerala RC", fingerprint(_card((190, 210, 240), (160, 40, 40))))]
    hit = best_match(_card((233, 224, 189), (31, 109, 61)), models, 0.85)
    assert hit and hit[0] == "Karnataka RC"
    assert best_match(_card((10, 10, 10), (250, 250, 250)), models, 0.85) is None
