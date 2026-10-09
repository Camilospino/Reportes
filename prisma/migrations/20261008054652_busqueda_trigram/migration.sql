-- Búsqueda por dirección rápida con LIKE '%texto%' sobre search_text (normalizado en la app).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS reports_search_text_trgm_idx
  ON reports USING gin (search_text gin_trgm_ops);

-- Integridad básica a nivel de BD (defensa en profundidad, además de Zod).
ALTER TABLE reports ADD CONSTRAINT reports_version_nonneg CHECK (version >= 0);
ALTER TABLE attachments ADD CONSTRAINT attachments_size_pos CHECK (size_bytes > 0 AND size_bytes <= 5242880);
