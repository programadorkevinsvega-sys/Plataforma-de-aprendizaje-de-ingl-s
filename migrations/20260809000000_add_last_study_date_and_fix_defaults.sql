-- Agregar columna last_study_date a user_stats para tracking de racha diaria
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_study_date DATE;

-- Corregir default de current_level en users de A1 a A0
ALTER TABLE users ALTER COLUMN current_level SET DEFAULT 'A0';
