from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
load_dotenv()
DB_HOST = os.getenv("DB_HOST")
DB_PASSWORD = os.getenv("DB_PASSWORD")

from sqlalchemy.engine import URL

if DB_HOST and DB_HOST.startswith("/"):
    # Cloud SQL connector socket (/cloudsql/<project>:<region>:<instance>),
    # set when Cloud Run has the instance attached. Lets the database stay
    # closed to the internet (no public "authorized networks" needed).
    DATABASE_URL = URL.create(
        "postgresql+psycopg2", username="drop-cars", password=DB_PASSWORD,
        database="drop-cars", query={"host": DB_HOST},
    )
else:
    DATABASE_URL = URL.create(
        "postgresql+psycopg2", username="drop-cars", password=DB_PASSWORD,
        host=DB_HOST, port=5432, database="drop-cars",
    )

# Explicit pool tuning - was previously unset (SQLAlchemy defaults:
# pool_size=5, max_overflow=10, no pre-ping, no recycle). On Cloud Run,
# each container instance gets its own pool, so unset defaults mean total
# Postgres connections scale with instance count with no ceiling awareness
# and no protection against Cloud SQL silently dropping idle connections
# (which surfaces as random "SSL connection has been closed unexpectedly"
# errors under load). pool_pre_ping tests each connection before handing
# it out (cheap SELECT 1, avoids using a dead one); pool_recycle=300
# forces a reconnect before Cloud SQL's own idle-connection timeout can
# kill it from the server side.
engine = create_engine(
    DATABASE_URL,
    connect_args={"options": "-c search_path=drop-cars"},
    # Cloud SQL (db-g1-small) allows 50 connections in total. maxScale=3 instances x (5 + 5) = 30 max, leaving room for the
    # scheduler sweep, admin scripts and migrations. (It used to be 20 + 10 per instance = 90, which could exceed the limit.)
    # Now 8 + 5 = 13 per instance (39 at maxScale 3): the request handlers run in a thread pool, and 10 connections made the Admin App's
    # polling queue up and time out right after a deploy ("QueuePool limit of size 5 overflow 5 reached").
    pool_size=8,
    max_overflow=5,
    pool_timeout=20,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency for DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
