from app.database.session import engine
from sqlalchemy import text

print('Testing database connection...')
try:
    with engine.connect() as conn:
        result = conn.execute(text('SELECT current_schema()'))
        schema = result.fetchone()[0]
        print(f'Current schema: {schema}')
        
        # Try to create the schema if it doesn't exist
        conn.execute(text('CREATE SCHEMA IF NOT EXISTS "drop-cars"'))
        conn.commit()
        print('Schema created/verified successfully')
        
except Exception as e:
    print(f'Error: {e}')
