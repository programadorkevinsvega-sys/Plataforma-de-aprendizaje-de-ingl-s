-- ==============================================================================
-- 📚 DEVFLUENCY AI - SEMILLERO AMPLIADO: DÍA A DÍA + MÓDULOS TECH
-- ==============================================================================

-- 1. "mother" (A0 - Familia)
INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level)
VALUES ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'mother', 'máder', 'madre / mamá', 'family', 'A0')
ON CONFLICT DO NOTHING;

INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, audio_url)
VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'My mother lives in Colombia.', 'Mai máder livs in Kolómbia.', 'Mi madre vive en Colombia.', '/audio/daily/mother1.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'I called my mother this morning.', 'Ai kold mai máder dis mórnin.', 'Llamé a mi madre esta mañana.', '/audio/daily/mother2.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Her mother is a doctor.', 'Jer máder iz a dóktor.', 'Su madre es médica.', '/audio/daily/mother3.mp3')
ON CONFLICT DO NOTHING;

-- 2. "father" (A0 - Familia)
INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level)
VALUES ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'father', 'fáder', 'padre / papá', 'family', 'A0')
ON CONFLICT DO NOTHING;

INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, audio_url)
VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'My father works at a bank.', 'Mai fáder uérks at a bank.', 'Mi padre trabaja en un banco.', '/audio/daily/father1.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'His father is teaching him English.', 'Jiz fáder iz tíchin jim ínglish.', 'Su padre le está enseñando inglés.', '/audio/daily/father2.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'My father loves cooking.', 'Mai fáder lavs kúkin.', 'A mi padre le encanta cocinar.', '/audio/daily/father3.mp3')
ON CONFLICT DO NOTHING;

-- 3. "car" (A1 - Transporte)
INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level)
VALUES ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'car', 'kar', 'carro / auto', 'transportation', 'A1')
ON CONFLICT DO NOTHING;

INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, audio_url)
VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'The car is damaged.', 'Da kar iz dámashdt.', 'El carro está dañado.', '/audio/daily/car1.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'I need to repair my car.', 'Ai nid tu ripér mai kar.', 'Necesito reparar mi carro.', '/audio/daily/car2.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Where did you park the car?', 'Guér did yu park da kar?', '¿Dónde parqueaste el carro?', '/audio/daily/car3.mp3')
ON CONFLICT DO NOTHING;

-- 4. "coffee" (A0 - Día a Día)
INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level)
VALUES ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'coffee', 'kófi', 'café', 'daily_life', 'A0')
ON CONFLICT DO NOTHING;

INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, audio_url)
VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'I drink hot coffee every morning.', 'Ai drink jot kófi évri mórnin.', 'Tomo café caliente cada mañana.', '/audio/daily/coffee1.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Would you like a cup of coffee?', 'Gúld yu láik a kap ov kófi?', '¿Te gustaría una taza de café?', '/audio/daily/coffee2.mp3'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'This coffee shop has fast Wi-Fi.', 'Dis kófi shop jas fast uái-fai.', 'Esta cafetería tiene Wi-Fi rápido.', '/audio/daily/coffee3.mp3')
ON CONFLICT DO NOTHING;

-- 5. "developer" (A1 - Programación)
INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'developer', 'divéloper', 'desarrollador', 'programming', 'A1')
ON CONFLICT DO NOTHING;

INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, audio_url)
VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'I''m a backend developer.', 'Aim a bákend divéloper.', 'Soy un desarrollador backend.', '/audio/s1.mp3'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'We need a senior Rust developer.', 'Güi nid a sínior rast divéloper.', 'Necesitamos un desarrollador Rust senior.', '/audio/s2.mp3'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'The developer fixed the production bug.', 'Da divéloper fíkst da prodákshon bag.', 'El desarrollador corrigió el error de producción.', '/audio/s3.mp3')
ON CONFLICT DO NOTHING;

-- 6. "microservices" (B2 - DevOps)
INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level)
VALUES ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'microservices', 'máikroservises', 'microservicios', 'devops', 'B2')
ON CONFLICT DO NOTHING;

INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, audio_url)
VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'We refactored the monolith into microservices.', 'Güi rifáktord da mónolith íntu máikroservises.', 'Reestructuramos el monolito en microservicios.', '/audio/s4.mp3'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Microservices communicate via gRPC.', 'Máikroservises komiúnikeit vía yi-ar-pi-si.', 'Los microservicios se comunican mediante gRPC.', '/audio/s5.mp3'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Decreasing latency is vital for microservices.', 'Dikrísin léitensi iz váital for máikroservises.', 'Reducir la latencia es vital para los microservicios.', '/audio/s6.mp3')
ON CONFLICT DO NOTHING;
