import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.session import SessionLocal, Base, engine
from app.models.ai_automation_log import AIAutomationLog


def test_ai_log_model():
    print("--- Running Test 1: AI Automation Log Model & DB Table Creation ---")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    test_log = AIAutomationLog(
        category="DOCUMENT_VERIFICATION",
        action_type="AUTO_REJECTED",
        entity_type="driver",
        entity_id="DRV-TEST-01",
        entity_name="Test Driver",
        summary="Driving License Auto-Rejected: Original document not uploaded (Xerox Detected)",
        confidence_score=0.96,
        details_json={
            "document_type": "licence",
            "color_saturation_score": 0.0,
            "is_color": False,
            "rejection_reason": "Original document not uploaded"
        }
    )

    db.add(test_log)
    db.commit()
    db.refresh(test_log)

    print(f"Created Log ID: {test_log.id}")
    assert test_log.id is not None
    assert test_log.category == "DOCUMENT_VERIFICATION"
    assert test_log.action_type == "AUTO_REJECTED"

    # Clean up test log
    db.delete(test_log)
    db.commit()
    db.close()
    print("[OK] Test 1 Passed: AI Automation Log DB Table & Model Verified!")


if __name__ == "__main__":
    test_ai_log_model()
    print("\n[SUCCESS] ALL AI LOG & ASSISTANT TESTS PASSED!")
