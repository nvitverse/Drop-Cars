from datetime import datetime, timedelta, timezone

from app.crud import chat_trash
from app.models.chat_trash import ChatTrash
from app.models.support_message import SupportMessage


def _msg(key, days_old):
    return SupportMessage(thread_key=key, thread_role="DRIVER", sender_side="DRIVER_OWNER", text="help",
                          created_at=datetime.now(timezone.utc) - timedelta(days=days_old))


def test_a_chat_in_trash_keeps_its_messages_for_30_days_then_is_deleted_for_good(pg_session):
    db = pg_session
    db.add_all([_msg("t-old", 12), _msg("t-new", 12), _msg("t-active", 12)])
    db.commit()
    chat_trash.move_to_trash(db, "SUPPORT", "t-new", "tester")
    chat_trash.move_to_trash(db, "SUPPORT", "t-old", "tester")
    db.query(ChatTrash).filter(ChatTrash.thread_key == "t-old").update({"trashed_at": datetime.now(timezone.utc) - timedelta(days=31)})
    db.commit()
    # the rolling 10-day clean-up leaves Trash alone ...
    from app.api.routes.support import purge_old_support_messages
    purge_old_support_messages(db)
    left = {m.thread_key for m in db.query(SupportMessage).filter(SupportMessage.thread_key.in_(["t-old", "t-new", "t-active"])).all()}
    assert left == {"t-old", "t-new"}                  # the active 12-day-old chat went, both trashed ones stayed
    # ... and the Trash clean-up removes only the one that is past 30 days
    chat_trash.purge_expired_trash(db)
    left = {m.thread_key for m in db.query(SupportMessage).filter(SupportMessage.thread_key.in_(["t-old", "t-new"])).all()}
    assert left == {"t-new"}
    assert db.query(ChatTrash).filter(ChatTrash.thread_key == "t-old").count() == 0


def test_restore_takes_it_out_of_trash(pg_session):
    chat_trash.move_to_trash(pg_session, "SUPPORT", "t-x", "tester")
    assert chat_trash.restore(pg_session, "SUPPORT", "t-x") is True
    assert chat_trash.restore(pg_session, "SUPPORT", "t-x") is False
