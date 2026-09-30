from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from app.database.session import get_db
from app.utils.document_verifier import verify_uploaded_document, compare_faces
from app.models.ai_automation_log import AIAutomationLog

from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter(tags=["Document Verification"], dependencies=[Depends(get_current_user_flexible)])


@router.post("/documents/verify-image")
async def verify_document_image(
    file: UploadFile = File(..., description="Uploaded document photo (DL, RC, Insurance, Aadhaar)"),
    doc_type: str = Form("generic", description="Document type e.g., licence, rc_front, insurance, aadhar"),
    expected_expiry_date: Optional[str] = Form(None, description="Optional expected expiry date YYYY-MM-DD"),
    expected_aadhaar_number: Optional[str] = Form(None, description="Optional - the Aadhaar number typed into the form, cross-checked against what's printed on the document"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Automated document verification API:
    - Analyzes image color saturation (detects 0% color Xerox vs original color document).
    - Rejects Xerox copies with reason: 'Original document not uploaded'.
    - Extracts OCR text and checks if document date has expired.
    - Rejects expired documents with reason: 'Document has expired'.
    - Cross-checks a typed expiry date / Aadhaar number against what OCR
      finds printed on the document - flags (not rejects) a mismatch.
    - Automatically records action in AI Automation Log audit table.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a valid image file."
        )

    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        result = verify_uploaded_document(
            image_bytes=image_bytes,
            document_type=doc_type,
            expected_expiry_date=expected_expiry_date,
            expected_aadhaar_number=expected_aadhaar_number,
        )

        status_str = result.get("status", "INVALID")
        reason_str = result.get("reason", "")
        if status_str == "VERIFIED":
            summary_msg = f"{doc_type.upper()} Auto-Verified"
        elif status_str == "NEEDS_REVIEW":
            summary_msg = f"{doc_type.upper()} Flagged for Review: {reason_str}"
        else:
            summary_msg = f"{doc_type.upper()} Auto-Rejected: {reason_str}"

        # Write to AI Automation Audit Trail
        action_type = {"VERIFIED": "AUTO_APPROVED", "NEEDS_REVIEW": "FLAGGED_FOR_REVIEW"}.get(status_str, "AUTO_REJECTED")
        log_entry = AIAutomationLog(
            category="DOCUMENT_VERIFICATION",
            action_type=action_type,
            entity_type="document",
            entity_id=file.filename,
            entity_name=file.filename,
            summary=summary_msg,
            confidence_score=result.get("confidence", 0.90),
            details_json={
                "filename": file.filename,
                "document_type": doc_type,
                "is_color": result.get("is_color", True),
                "color_score": result.get("color_score", 0.0),
                "extracted_expiry_date": result.get("extracted_expiry_date"),
                "rejection_reason": reason_str
            }
        )
        db.add(log_entry)
        db.commit()

        return {
            "success": True,
            "filename": file.filename,
            "document_type": doc_type,
            "verification": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Document verification error: {str(e)}"
        )


@router.post("/documents/verify-face-match")
async def verify_face_match(
    id_photo: UploadFile = File(..., description="The ID document photo (Aadhaar card, licence) whose printed photo gets compared"),
    profile_photo: UploadFile = File(..., description="The separately-uploaded profile photo/selfie"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Zero-cost face-match between an ID document's printed photo and a
    profile photo/selfie (added 2026-09-04, see compare_faces in
    utils/document_verifier.py for the heuristic and its real limits).
    >=50% is treated as a match; below that is flagged for manual review,
    never auto-rejected outright - this is a coarse heuristic, not
    biometric-grade proof."""
    for f, label in [(id_photo, "ID photo"), (profile_photo, "profile photo")]:
        if not f.content_type or not f.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"Invalid file type for {label}. Please upload a valid image file.")

    try:
        id_bytes = await id_photo.read()
        profile_bytes = await profile_photo.read()
        if not id_bytes or not profile_bytes:
            raise HTTPException(status_code=400, detail="One of the uploaded files is empty.")

        result = compare_faces(id_bytes, profile_bytes)

        status_str = result.get("status", "ERROR")
        is_match = result.get("is_match", False)
        match_percent = result.get("match_percent")
        if status_str == "OK":
            summary_msg = f"Face match: {match_percent}% ({'match' if is_match else 'below threshold'})"
            action_type = "AUTO_APPROVED" if is_match else "FLAGGED_FOR_REVIEW"
        else:
            summary_msg = f"Face match check inconclusive: {result.get('reason')}"
            action_type = "FLAGGED_FOR_REVIEW"

        log_entry = AIAutomationLog(
            category="DOCUMENT_VERIFICATION",
            action_type=action_type,
            entity_type="face_match",
            entity_id=id_photo.filename,
            entity_name=f"{id_photo.filename} vs {profile_photo.filename}",
            summary=summary_msg,
            confidence_score=(match_percent / 100.0) if match_percent is not None else 0.5,
            details_json=result,
        )
        db.add(log_entry)
        db.commit()

        return {"success": True, "verification": result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face match error: {str(e)}")
