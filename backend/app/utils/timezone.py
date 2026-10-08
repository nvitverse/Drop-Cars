from datetime import datetime, timezone, timedelta
from typing import Union, Optional

IST = timezone(timedelta(hours=5, minutes=30))

def to_ist(dt_val):
    """A datetime (naive = UTC, as the database stores it) as an aware IST datetime; None stays None. Use this - never a bare
    strftime() on a stored time: a stored time is UTC, so printing it directly shows a time 5 h 30 min EARLIER than the real one."""
    if not isinstance(dt_val, datetime):
        return None
    if dt_val.tzinfo is None:
        dt_val = dt_val.replace(tzinfo=timezone.utc)
    return dt_val.astimezone(IST)


def format_pickup_time_ist(dt_val: Optional[Union[datetime, str]]) -> str:
    """
    Converts naive or UTC datetime / ISO string to Indian Standard Time (IST, UTC+5:30)
    and formats as 'DD MMM YYYY, hh:mm AM/PM' (e.g. '20 Sep 2026, 06:00 PM').
    """
    if not dt_val:
        return "Immediate"
    
    dt = dt_val
    if isinstance(dt, str):
        try:
            clean_str = dt.replace('Z', '+00:00')
            dt = datetime.fromisoformat(clean_str)
        except Exception:
            return dt_val

    if not isinstance(dt, datetime):
        return str(dt_val)

    # If datetime is naive (no tzinfo), assume UTC because DB stores UTC datetimes
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
        
    dt_ist = dt.astimezone(IST)
    return dt_ist.strftime("%d %b %Y, %I:%M %p")
