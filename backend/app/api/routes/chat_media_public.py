"""Voice notes and photos of the booking / support chats, served through the API.

The storage bucket is private, so the raw storage link returned 403 and a voice message could not be played by the other side. The
chat routes now hand out /api/conversations/media/<folder>/<file>; this serves it. Same route and behaviour as the unified chat PR,
kept here so the fix does not have to wait for it. The file names are random UUIDs (an unguessable link), only the two chat folders
and only audio / image file names are readable.
"""
from fastapi import APIRouter, HTTPException, Response

from app.utils import chat_media

router = APIRouter(prefix="/conversations", tags=["Chat media"])


@router.get("/media/{folder}/{filename}")
def chat_media_file(folder: str, filename: str):
    if folder not in chat_media.CHAT_FOLDERS or not chat_media.FILE_NAME.match(filename):
        raise HTTPException(status_code=404, detail="Not found")
    try:
        from app.utils.gcs import bucket
        blob = bucket.blob(f"{folder}/{filename}")
        data = blob.download_as_bytes()
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=404, detail="Not found")
    ext = filename.rsplit(".", 1)[-1].lower()
    default = ("audio/mp4" if ext == "m4a" else f"audio/{ext}") if ext in chat_media.AUDIO_EXT else f"image/{'jpeg' if ext == 'jpg' else ext}"
    return Response(content=data, media_type=blob.content_type or default, headers={"Cache-Control": "private, max-age=86400"})
