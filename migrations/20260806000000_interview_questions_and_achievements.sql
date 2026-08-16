-- 1. Tabla de Preguntas de Entrevistas Técnicas
CREATE TABLE IF NOT EXISTS interview_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL,
    difficulty VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Datos semilla de preguntas técnicas de entrevista
INSERT INTO interview_questions (question, category, difficulty) VALUES
('Tell me about yourself and your experience as a software developer.', 'Standup Meeting', 'A2'),
('How would you design a microservices architecture for a high-traffic e-commerce platform?', 'System Design', 'B2'),
('Describe a production incident you resolved. What was your debugging process?', 'Incident Response', 'B1'),
('What''s the difference between Rust''s ownership model and garbage collection?', 'Tech Stack', 'B2'),
('How do you handle code reviews in your team? What do you look for?', 'Code Review', 'B1'),
('Explain the CAP theorem and how it affects distributed system design.', 'Architecture', 'C1'),
('What CI/CD tools have you used? Walk me through your deployment pipeline.', 'DevOps', 'B1'),
('How would you optimize a slow PostgreSQL query?', 'Database', 'B2')
ON CONFLICT (question) DO NOTHING;

-- 2. Tabla de Logros e Insignias (Achievements)
CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR(50) PRIMARY KEY,
    emoji VARCHAR(10) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    max_progress INT NOT NULL DEFAULT 1,
    category VARCHAR(50) NOT NULL DEFAULT 'general'
);

-- Datos semilla de logros
INSERT INTO achievements (id, emoji, title, description, max_progress, category) VALUES
('first-word', '🌱', 'Primer Paso', 'Aprende tu primera palabra en inglés técnico', 1, 'vocab'),
('streak-7', '🔥', 'Semana Imparable', 'Mantiene una racha diaria de 7 días consecutivos', 7, 'streak'),
('first-interview', '🎙️', 'Entrevista Inicial', 'Completa tu primera evaluación de entrevista oral con IA', 1, 'exam'),
('90-percent', '🎯', 'Precisión Asombrosa', 'Obtén más de 90% en la puntuación general de una evaluación', 1, 'exam'),
('100-words', '🧠', 'Vocabulario Tech', 'Domina 100 palabras de arquitectura de software y DevOps', 100, 'vocab'),
('streak-30', '⚡', 'Hábito de Acero', 'Mantiene una racha diaria de 30 días seguidos', 30, 'streak'),
('level-b1', '🚀', 'Nivel Intermedio', 'Alcanza el nivel B1 en fluidez conversacional', 3500, 'level'),
('srs-50', '📚', 'Maestro SM-2', 'Completa 50 tarjetas de repetición espaciada', 50, 'srs'),
('perfect-pronunciation', '🔊', 'Nativo Tech', 'Logra 95%+ en la métrica de pronunciación fonética', 1, 'audio')
ON CONFLICT (id) DO UPDATE SET
    emoji = EXCLUDED.emoji,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    max_progress = EXCLUDED.max_progress,
    category = EXCLUDED.category;
