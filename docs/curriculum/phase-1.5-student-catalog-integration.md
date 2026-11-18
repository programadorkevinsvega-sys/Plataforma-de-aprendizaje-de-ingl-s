# Integración del catálogo curricular para estudiantes (Fase 1.5)

## Propósito

Conectar el modelo curricular introducido en las subfases 1.2 y 1.3 con la aplicación web existente, sin reemplazar los recorridos de vocabulario, entrevista ni el Sistema Dual de Pronunciación.

La integración se limita a la lectura del catálogo publicado y a la matrícula sobre una versión inmutable del curso. No implementa todavía la administración editorial web ni la ejecución de ejercicios.

## Recorrido de extremo a extremo

1. El frontend solicita el catálogo usando la sesión actual.
2. El BFF valida el JWT y reenvía el contexto de autenticación al servicio de contenido.
3. El servicio valida que el `user_id` del mensaje coincide con el sujeto autenticado.
4. Dentro de una transacción PostgreSQL, el servicio define `app.current_user_id` para que las políticas RLS filtren el catálogo y la matrícula.
5. El servicio devuelve únicamente versiones publicadas y versiones archivadas a las que el usuario conserva acceso por matrícula.
6. El frontend navega por `course_version_id`, no solo por slug/nivel, para mantener la versión exacta asignada al estudiante.

## Endpoints del BFF

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/v1/curriculum/courses` | Lista versiones publicadas y versiones archivadas visibles por matrícula |
| GET | `/api/v1/curriculum/courses/{course_version_id}` | Consulta la versión exacta, unidades, lecciones, objetivos, competencias y prerrequisitos |
| POST | `/api/v1/curriculum/enrollments` | Crea o recupera la matrícula para una versión publicada |

La solicitud de matrícula utiliza `{ "course_version_id": "..." }`. El servicio rechaza identificadores inválidos y no permite crear nuevas matrículas sobre versiones archivadas.

## Interfaz existente y nueva

- `/learn` conserva el recorrido legado de vocabulario contextualizado y el Sistema Dual de Pronunciación.
- `/courses` presenta el catálogo desde el nuevo modelo curricular.
- `/courses/{course_version_id}` muestra los datos de la versión, sus unidades, lecciones, objetivos, criterios de éxito, competencias y prerrequisitos.
- El dashboard y la barra lateral enlazan al catálogo.
- La interfaz no presenta el fixture CI como contenido de producción. Cuando no hay versiones accesibles, informa que aún no existe contenido publicado.

## Versionado, acceso y seguridad

- Las consultas requieren una sesión válida.
- El servicio comprueba la identidad contra el JWT y configura el contexto RLS dentro de la misma transacción de lectura/escritura.
- Las versiones publicadas son visibles en el catálogo.
- Las versiones archivadas se incluyen únicamente cuando el usuario conserva una matrícula que le permite acceder a esa versión histórica.
- La URL usa el ID de versión, porque un slug y nivel pueden tener varias versiones a lo largo del tiempo.
- La matrícula queda fijada a `course_version_id`; una publicación posterior no cambia la versión ya asociada.
- Las consultas de detalle no permiten leer versiones draft o review a estudiantes.
- No se exponen credenciales de base de datos, comandos CLI ni roles editoriales desde el navegador.

## Alcance pendiente

Esta integración no cierra la subfase 1.5 ni la Fase 1 completa. Permanecen pendientes:

- Estado de desbloqueo real de cada lección, basado en progreso y dominio del estudiante.
- Paginación y filtros de catálogo resueltos en el backend para catálogos grandes.
- APIs y pantallas administrativas para borradores, revisión, decisiones editoriales y publicación.
- Autorización administrativa web comprobada en PostgreSQL contra `content_editors` en cada operación.
- Carga controlada de un paquete editorial real, aprobación y publicación de contenido curricular.

El motor genérico de ejercicios, los intentos, la corrección y la finalización de lecciones corresponden a la Fase 2 y no se simulan en estas pantallas.

## Validación automatizada

La CI de la PR #81 ejecuta:

- Migraciones curriculares desde esquema vacío y actualizado.
- Compilación, Clippy, formato y pruebas del workspace Rust.
- Lint, build de producción y cobertura base del frontend.
- Pruebas unitarias de los mapeadores de los contratos curriculares.
- Auditorías de dependencias y validación de scripts.

La CI de la PR no demuestra por sí sola que existan versiones publicadas en producción. La disponibilidad de cursos depende de contenido real importado, revisado y publicado mediante el flujo editorial existente.
