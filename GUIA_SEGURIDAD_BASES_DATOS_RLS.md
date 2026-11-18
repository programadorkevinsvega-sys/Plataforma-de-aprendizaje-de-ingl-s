# 🗄️ GUÍA DE SEGURIDAD EN BASES DE DATOS & RLS: DevFluency AI (PostgreSQL & Redis)

---

## 1. POSTGRESQL ROW LEVEL SECURITY (RLS) OBLIGATORIO
Para garantizar aislamiento de datos total por tenant/cliente, todas las tablas con información del usuario aplican RLS a nivel de motor de base de datos:

```sql
-- Habilitar RLS
ALTER TABLE user_srs_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Políticas de Aislamiento
CREATE POLICY srs_user_isolation ON user_srs_progress
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY exam_user_isolation ON ai_exam_sessions
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY stats_user_isolation ON user_stats
    FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
```

---

## 2. CIFRADO EN REPOSO Y EN TRÁNSITO
* **En Tránsito**: Conexiones a PostgreSQL sobre **TLS 1.3** obligatorio con verificación de certificados.
* **En Reposo**: Encriptación de volúmenes de PostgreSQL y backups utilizando **AES-256-GCM**.
* **Hash de Contraseñas**: Algoritmo `Argon2id` con configuración pesada en memoria ($M=64MB, T=3, P=4$).

---

## 3. SEGURIDAD Y CONFIGURACIÓN DE REDIS CLUSTER
* **Autenticación Redis ACLs**: Cada microservicio en Rust utiliza un usuario ACL específico en Redis con permisos acotados únicamente a los prefijos de sus llaves (ejemplo: `srs-service` solo lee/escribe en `srs:*`).
* **Desactivación de Comandos Peligrosos**: Comandos `FLUSHALL`, `KEYS` y `CONFIG` desactivados en entornos de staging y producción.
