export interface LexicalCategory {
  id: string
  labelEs: string
  labelEn: string
  description: string
}

// Labels mirror tools/curriculum/lexical-taxonomy.v1.json.
// Keep identifiers stable: PostgreSQL stores the category ID, not the display label.
export const LEXICAL_CATEGORIES: readonly LexicalCategory[] = [
  { id: 'social_communication', labelEs: 'Comunicación social', labelEn: 'Social communication', description: 'Saludos, cortesía, preguntas e intercambios interpersonales' },
  { id: 'personal_identity', labelEs: 'Identidad personal', labelEn: 'Personal identity', description: 'Nombres, información personal y descripción básica' },
  { id: 'people_relationships', labelEs: 'Personas y relaciones', labelEn: 'People and relationships', description: 'Familia, relaciones y personas en contextos cotidianos' },
  { id: 'daily_routines', labelEs: 'Rutinas cotidianas', labelEn: 'Daily routines', description: 'Actividades recurrentes, horarios y hábitos' },
  { id: 'time_numbers', labelEs: 'Tiempo y cantidades', labelEn: 'Time and quantities', description: 'Expresiones de tiempo, fechas, números y cantidades' },
  { id: 'grammar_functions', labelEs: 'Funciones gramaticales', labelEn: 'Grammar functions', description: 'Grupos gramaticales y patrones del idioma' },
  { id: 'home_life', labelEs: 'Hogar y vida doméstica', labelEn: 'Home and domestic life', description: 'Habitaciones, muebles, objetos y tareas domésticas' },
  { id: 'food_drink', labelEs: 'Comida y bebida', labelEn: 'Food and drink', description: 'Alimentos, comidas, ingredientes y bebidas' },
  { id: 'places_community', labelEs: 'Lugares y comunidad', labelEn: 'Places and community', description: 'Ciudades, edificios, lugares y servicios comunitarios' },
  { id: 'transport_travel', labelEs: 'Transporte y viajes', labelEn: 'Transport and travel', description: 'Vehículos, direcciones, viajes y desplazamientos' },
  { id: 'education_learning', labelEs: 'Educación y aprendizaje', labelEn: 'Education and learning', description: 'Escuela, estudio y contextos de aprendizaje' },
  { id: 'work_professions', labelEs: 'Trabajo y profesiones', labelEn: 'Work and professions', description: 'Empleos, roles, oficinas y contextos laborales' },
  { id: 'technology_digital', labelEs: 'Tecnología y vida digital', labelEn: 'Technology and digital life', description: 'Dispositivos, aplicaciones, sitios web y acciones digitales' },
  { id: 'software_engineering', labelEs: 'Desarrollo de software', labelEn: 'Software engineering', description: 'Programación, código, desarrollo e ingeniería de software' },
  { id: 'cloud_devops', labelEs: 'Cloud y operaciones', labelEn: 'Cloud and operations', description: 'Infraestructura, despliegue, automatización y operaciones' },
  { id: 'health_body', labelEs: 'Salud y cuerpo', labelEn: 'Health and body', description: 'Partes del cuerpo, salud, bienestar y cuidado' },
  { id: 'nature_environment', labelEs: 'Naturaleza y entorno', labelEn: 'Nature and environment', description: 'Clima, geografía, plantas y fenómenos naturales' },
  { id: 'animals_farm', labelEs: 'Animales', labelEn: 'Animals', description: 'Animales, insectos y contextos de granja' },
  { id: 'clothing_personal_items', labelEs: 'Ropa y accesorios', labelEn: 'Clothing and personal items', description: 'Ropa, accesorios y pertenencias personales' },
  { id: 'actions_movement', labelEs: 'Acciones y movimiento', labelEn: 'Actions and movement', description: 'Acciones generales, verbos y movimiento físico' },
  { id: 'descriptions_emotions', labelEs: 'Descripciones y emociones', labelEn: 'Descriptions and emotions', description: 'Cualidades, apariencia, colores, rasgos y sentimientos' },
  { id: 'objects_tools', labelEs: 'Objetos y herramientas', labelEn: 'Objects and tools', description: 'Objetos cotidianos, materiales y herramientas' },
  { id: 'shopping_money', labelEs: 'Compras y dinero', labelEn: 'Shopping and money', description: 'Compras, precios, dinero y transacciones' },
  { id: 'math_shapes', labelEs: 'Matemáticas y formas', labelEn: 'Math and shapes', description: 'Formas, medidas y conceptos matemáticos básicos' },
  { id: 'leisure_culture', labelEs: 'Ocio y cultura', labelEn: 'Leisure and culture', description: 'Pasatiempos, música e intereses culturales' },
  { id: 'sports_fitness', labelEs: 'Deporte y actividad física', labelEn: 'Sports and fitness', description: 'Deportes, ejercicio y actividad física' },
] as const;
