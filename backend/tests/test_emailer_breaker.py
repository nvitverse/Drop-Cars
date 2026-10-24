"""When Gmail keeps refusing us (daily limit / blocked sender) the app must stop hammering it and stop holding requests for ~40 s."""
import pytest

from app.utils import emailer


@pytest.fixture(autouse=True)
def _clean_breaker():
    emailer._BREAKER.update(fails=0, until=0.0)
    yield
    emailer._BREAKER.update(fails=0, until=0.0)


def test_three_failures_open_the_breaker_and_the_fourth_call_does_not_connect(monkeypatch):
    calls = []

    def refusing(db, to, subject, body, html=None):
        calls.append(to)
        raise RuntimeError("SMTP send failed on 587 (Connection unexpectedly closed) and 465 (Connection unexpectedly closed)")

    monkeypatch.setattr(emailer, "_send_email_once", refusing)
    for _ in range(3):
        with pytest.raises(RuntimeError) as e:
            emailer.send_email(None, "a@b.c", "s", "b")
        assert not isinstance(e.value, emailer.EmailUnavailable)
    assert len(calls) == 3
    with pytest.raises(emailer.EmailUnavailable):
        emailer.send_email(None, "a@b.c", "s", "b")
    assert len(calls) == 3                                      # not even tried: nothing waited 40 s, Gmail was left alone


def test_after_the_cooldown_it_tries_again_and_one_success_clears_it(monkeypatch):
    sent = []
    monkeypatch.setattr(emailer, "_send_email_once", lambda db, to, subject, body, html=None: sent.append(to))
    emailer._BREAKER.update(fails=2, until=0.0)
    emailer.send_email(None, "ok@b.c", "s", "b")
    assert sent == ["ok@b.c"] and emailer._BREAKER["fails"] == 0
    emailer._BREAKER.update(fails=0, until=1e12)                 # cooling down
    with pytest.raises(emailer.EmailUnavailable):
        emailer.send_email(None, "x@b.c", "s", "b")
    emailer._BREAKER.update(until=0.0)                           # cooldown over
    emailer.send_email(None, "y@b.c", "s", "b")
    assert sent == ["ok@b.c", "y@b.c"]
