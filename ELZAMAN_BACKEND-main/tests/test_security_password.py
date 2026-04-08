import pytest

from app.core.security import PASSWORD_MIN_LENGTH, validate_password


def test_validate_password_accepts_strong_password():
    assert validate_password("Strong1!") == (True, "")


@pytest.mark.parametrize(
    ("password", "message"),
    [
        ("Ab1!", f"Password must be at least {PASSWORD_MIN_LENGTH} characters long."),
        ("1234567!", "Password must include at least one letter."),
        ("Password!", "Password must include at least one digit."),
        ("Password1", "Password must include at least one special character."),
    ],
)
def test_validate_password_rejects_weak_passwords(password: str, message: str):
    assert validate_password(password) == (False, message)
