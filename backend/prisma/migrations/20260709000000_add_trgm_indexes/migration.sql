-- PERF-03: GIN trigram indexes for text search on itemCode and locations.name
-- (subject, description, ticketNumber, and users.name/email already covered
-- in 20260626001000_add_perf_indexes).

CREATE INDEX IF NOT EXISTS tickets_item_code_trgm_idx
  ON tickets USING gin ("itemCode" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS locations_name_trgm_idx
  ON locations USING gin (name gin_trgm_ops);
