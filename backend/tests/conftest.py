"""
Shared fixtures.

`pg_session` gives a real Postgres session (the same engine the app uses,
so the same "drop-cars" schema and column types) wrapped in a transaction
that is rolled back after the test - nothing a test writes survives.

When Postgres is unreachable the DB tests are skipped locally, but in CI
(GitHub sets CI=true) an unreachable database is a hard failure, so these
tests can never silently turn into no-ops there.
"""
import os

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """slowapi counts per client IP across the whole run; every test starts
    with a clean budget so limits don't make unrelated tests flaky."""
    from app.core.limiter import limiter
    try:
        limiter.reset()
    except Exception:
        pass
    yield


def _pg_available():
    from app.database.session import engine
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as e:  # connection refused, bad host, auth...
        return False, e


_migrated = False


def _run_startup_migrations():
    """TestClient(app) without a `with` block never fires startup events, so
    the column migrations the tests rely on are run here once. On a fresh CI
    database create_all already made the new shape; on an older database
    (like production) this is exactly what boot would do."""
    global _migrated
    if _migrated:
        return
    import asyncio
    from app.main import ensure_sos_alerts_and_swap_columns
    asyncio.run(ensure_sos_alerts_and_swap_columns())
    _migrated = True


@pytest.fixture
def pg_session():
    ok, err = _pg_available()
    if not ok:
        if os.getenv("CI"):
            pytest.fail(f"Postgres is required in CI but unreachable: {err}")
        pytest.skip(f"Postgres not reachable locally: {err}")

    _run_startup_migrations()
    from app.database.session import engine
    connection = engine.connect()
    outer = connection.begin()
    session = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")()
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def client_with_db(pg_session):
    """TestClient whose get_db yields the rolled-back pg_session."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database.session import get_db

    def _override():
        yield pg_session

    app.dependency_overrides[get_db] = _override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
