-- Add indexes for route lookups
ALTER TABLE routes ADD INDEX idx_route (from_slug, to_slug);
ALTER TABLE routes ADD INDEX idx_from_city (from_city, to_city);
