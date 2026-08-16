-- Añadir columna de Fonética Natural (Connected Speech / Habla Conectada)
ALTER TABLE vocabulary_words 
ADD COLUMN IF NOT EXISTS spanish_phonetic_natural VARCHAR(150);

ALTER TABLE context_sentences 
ADD COLUMN IF NOT EXISTS spanish_phonetic_natural TEXT;

-- Actualizar registros existentes con un valor razonable por defecto si estuvieran vacíos
UPDATE vocabulary_words 
SET spanish_phonetic_natural = spanish_phonetic 
WHERE spanish_phonetic_natural IS NULL OR spanish_phonetic_natural = '';

UPDATE context_sentences 
SET spanish_phonetic_natural = spanish_phonetic 
WHERE spanish_phonetic_natural IS NULL OR spanish_phonetic_natural = '';
