from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def to_iso_optional(value: datetime | None) -> str | None:
    if value is None:
        return None
    return to_iso(value)
