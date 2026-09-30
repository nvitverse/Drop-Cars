from datetime import datetime, timezone, timedelta
from typing import Union, Optional

IST = timezone(timedelta(hours=5, minutes=30))

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
