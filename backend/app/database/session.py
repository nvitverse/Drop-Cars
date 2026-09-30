from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
load_dotenv()
DB_HOST = os.getenv("DB_HOST")
DB_PASSWORD = os.getenv("DB_PASSWORD")

DATABASE_URL = f"postgresql+psycopg2://drop-cars:{DB_PASSWORD}@{DB_HOST}:5432/drop-cars"

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
    pool_size=20,
    max_overflow=10,
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
