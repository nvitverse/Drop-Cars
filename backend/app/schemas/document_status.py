from pydantic import BaseModel
from typing import Optional, Dict, Any
from uuid import UUID
from app.models.common_enums import DocumentStatusEnum


class DocumentStatusResponse(BaseModel):
    """Response model for document status"""
    document_type: str
    status: str
    image_url: Optional[str] = None
    updated_at: Optional[str] = None
    # Expiry (licence, RC, insurance): the app opens re-upload once a document is within 15 days of expiring or expired
    expiry_date: Optional[str] = None
    days_left: Optional[int] = None


class DocumentStatusListResponse(BaseModel):
    """Response model for listing all document statuses"""
    entity_id: UUID
    entity_type: str  # "vendor", "driver", "vehicle_owner", "car"
    documents: Dict[str, DocumentStatusResponse]


class UpdateDocumentStatusRequest(BaseModel):
    """Request model for updating document status"""
    status: DocumentStatusEnum


class UpdateDocumentRequest(BaseModel):
    """Request model for updating document (upload new image)"""
    document_type: str  # e.g., "aadhar", "licence", "rc_front", etc.
    image: Optional[str] = None  # Base64 encoded image or file upload


class DocumentUpdateResponse(BaseModel):
    """Response model for document update"""
    message: str
    document_type: str
    new_image_url: str
    new_status: str
