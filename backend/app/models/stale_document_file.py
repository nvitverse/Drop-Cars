from sqlalchemy import Column, Integer, String, TIMESTAMP, func
from app.database.session import Base


class StaleDocumentFile(Base):
    """The previous image of a document that was re-uploaded (e.g. a licence renewed before it expired). The old file
    is kept until the NEW one is verified - so a rejected re-upload never leaves the owner with nothing - and then
    deleted automatically (crud/stale_documents.py purge_verified_stale_files)."""
    __tablename__ = "stale_document_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String, nullable=False)     # driver | car | owner
    entity_id = Column(String, nullable=False, index=True)
    status_field = Column(String, nullable=False)    # attribute holding the NEW document's status
    url = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
