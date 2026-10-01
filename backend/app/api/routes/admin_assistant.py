"""Command Center backend (Phase 3): the admin talks to the assistant, it PREPARES actions, the admin presses Confirm.

  POST /admin/assistant/message              text -> reply + proposals (the reply is also stored in the admin's private assistant chat)
  POST /admin/assistant/execute              {proposal_id} -> runs ONE confirmed proposal (arguments come from the server, never from here)
  GET  /admin/assistant/proposals/{id}       current status of a Confirm card
  POST /admin/assistant/proposals/{id}/dismiss
  POST /admin/assistant/transcribe           audio -> text (Tamil + English), replaces the fake voice button
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud import assistant_actions as A
from app.crud import chat_bot
from app.crud import conversations as C
from app.database.session import get_db
from app.utils import ai_llm, chat_llm, speech_to_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/assistant", tags=["Admin Assistant"])


def _actor(admin) -> C.Actor:
    role = C.DIRECTOR if (admin.role or "").lower() == "owner" else C.STAFF
    return C.Actor(role, str(admin.id), admin.username or "Drop Cars")


class MessagePayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=1500)


@router.post("/message")
def assistant_message(body: MessagePayload, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    actor = _actor(current_admin)
    conv = chat_bot.get_or_create_assistant_conversation(db, actor)
    try:
        C.add_message(db, conv, sender_role=actor.role, sender_id=actor.principal_id, sender_name=actor.name, text=body.text, apply_privacy=False)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    res = chat_bot.reply_to_latest(db, conv, actor)
    out = {"conversation_id": str(conv.id), "replied": bool(res.get("replied")), "reply": None, "proposals": []}
    if res.get("message_id"):
        msg = C.messages_page(db, conv, actor, after_id=int(res["message_id"]) - 1, limit=1)
        if msg:
            out["reply"] = msg[0]["text"]
            out["proposals"] = (msg[0].get("meta") or {}).get("proposals") or []
            out["message"] = msg[0]
    if res.get("unavailable"):
        out["unavailable"] = res["unavailable"]
    return out


class ExecutePayload(BaseModel):
    proposal_id: str


@router.post("/execute")
async def assistant_execute(body: ExecutePayload, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    limit = int(float(ai_llm._setting(db, "assistant_execute_daily_limit", "100")))
    try:
        return await A.execute_proposal(db, current_admin, body.proposal_id, limit)
    except A.ProposalError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.get("/proposals/{proposal_id}")
def assistant_proposal(proposal_id: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    try:
        return A.public(A.get_for_admin(db, current_admin, proposal_id))
    except A.ProposalError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/proposals/{proposal_id}/dismiss")
def assistant_dismiss(proposal_id: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    try:
        return A.dismiss(db, current_admin, proposal_id)
    except A.ProposalError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/transcribe")
def assistant_transcribe(file: UploadFile = File(...), db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Voice -> text for the Command Center. The text goes back to the app, which sends it as an ordinary message (so the admin sees
    exactly what was understood before anything is prepared)."""
    if not speech_to_text.available():
        raise HTTPException(status_code=503, detail="Voice typing is not set up on the server yet. Please type the message.")
    if not chat_llm.within_limits(db, f"STT:{current_admin.id}", per_user_setting="admin_stt_daily_limit", per_user_default="100"):
        raise HTTPException(status_code=429, detail="Daily voice limit reached. Please type the message.")
    audio = file.file.read(speech_to_text.MAX_BYTES + 1)
    try:
        return {"text": speech_to_text.transcribe(audio, file.content_type or "")}
    except speech_to_text.SpeechUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except speech_to_text.SpeechError as e:
        raise HTTPException(status_code=422, detail=str(e))
