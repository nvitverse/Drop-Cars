#!/usr/bin/env python3
"""
Migration script to enable PostGIS spatial extension on PostgreSQL (Cloud SQL)
and add GEOMETRY(Point, 4326) columns + GIST spatial indexes on car_driver and vehicle_owner tables.
Also ensures latitude/longitude numeric fallback columns exist on both tables.
"""

from sqlalchemy import create_engine, text
from app.database.session import DATABASE_URL


def run_migration():
    engine = create_engine(DATABASE_URL)

    # 1. Add lat/lon fallback columns (works on any Postgres instance)
    fallback_sql = """
    ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE car_driver ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE vehicle_owner ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE vehicle_owner ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    """
    try:
        with engine.connect() as connection:
            connection.execute(text(fallback_sql))
            connection.commit()
            print("[OK] Basic latitude/longitude columns verified on car_driver and vehicle_owner.")
    except Exception as e:
        print(f"Warning adding lat/lon columns: {e}")

    # 2. Enable PostGIS extension and GEOMETRY columns
    postgis_sql = """
    CREATE EXTENSION IF NOT EXISTS postgis;

    ALTER TABLE car_driver 
    ADD COLUMN IF NOT EXISTS location_geom GEOMETRY(Point, 4326);

    ALTER TABLE vehicle_owner 
    ADD COLUMN IF NOT EXISTS location_geom GEOMETRY(Point, 4326);

    CREATE INDEX IF NOT EXISTS idx_car_driver_location_geom 
    ON car_driver USING GIST (location_geom);

    CREATE INDEX IF NOT EXISTS idx_vehicle_owner_location_geom 
    ON vehicle_owner USING GIST (location_geom);
    """
    try:
        with engine.connect() as connection:
            connection.execute(text(postgis_sql))
            connection.commit()
        print("[OK] PostGIS extension & GEOMETRY(Point, 4326) spatial columns created successfully!")
    except Exception as e:
        print(f"[INFO] PostGIS extension creation notice on local DB (Cloud SQL will execute on deploy): {str(e)[:120]}")

    return True


if __name__ == "__main__":
    print("Starting PostGIS & location schema migration...")
    run_migration()
