# Prompt de Producción para Generación de Vocabulario JSON (Reglas Fonéticas Estrictas)

Copia el texto a continuación y envíalo a cualquier modelo de IA (Claude, ChatGPT, Gemini, etc.) para generar fácilmente nuevos archivos JSON con fonética 100% consistente y **Habla Conectada (Connected Speech)**.

---

```text
Actúa como un profesor de inglés nativo y experto lingüista especializado en la enseñanza de fonética y habla conectada (Connected Speech) para hispanohablantes. 

Tu tarea es generar un array en formato JSON puro (sin markdown, sin explicaciones, sólo el JSON válido) que contenga una lista de 20 palabras de vocabulario.

Debes seguir **estrictamente** este esquema JSON para cada objeto:

```json
{
  "category": "string (la categoría de la palabra, ej: family, software_engineering, devops, daily_routine)",
  "level": "string (el nivel CEFR: A1, A2, B1, B2, C1, C2)",
  "word": "string (la palabra en inglés en minúsculas)",
  "spanish_phonetic": "string (pronunciación lenta palabra por palabra)",
  "spanish_phonetic_natural": "string (pronunciación natural en habla conectada / connected speech)",
  "spanish_translation": "string (la traducción o traducciones más comunes al español)",
  "context_sentences": [
    {
      "english_text": "string (oración de ejemplo realista usando la palabra)",
      "spanish_phonetic": "string (pronunciación lenta palabra por palabra)",
      "spanish_phonetic_natural": "string (pronunciación natural en habla conectada / connected speech)",
      "spanish_translation": "string (traducción de la oración al español)"
    }
    // Debe haber exactamente 3 oraciones de contexto por palabra
  ]
}
```

### Tabla de Reglas Fonéticas Estrictas:

1. **Consistencia de la S Sonora (/z/):**
   - `is` → SIEMPRE `iz` (nunca `is`). Ej: `he is` → `jí iz`.
   - `his` → SIEMPRE `jiz`. Ej: `his father` → `jiz fáder`.
   - `lives` → SIEMPRE `livz` (nunca `livs`).
   - `loves` → SIEMPRE `lavz` (nunca `lavs`).
   - `s` después de sonido sonoro → `z`. Ej: `runs` → `ranz`, `plays` → `pléiz`.

2. **Reglas para el Artículo "the":**
   - `the + vocal` → `di`. Ej: `the airport` → `di érport`.
   - `the + consonante` → `da`. Ej: `the car` → `da kar`.

3. **Habla Conectada y Contracciones Nativas (spanish_phonetic_natural):**
   - `mother is a` → `máderz a` (ej. `Her mother is a doctor` → `Jer máderz a dóktor`).
   - `car is` → `karz` (ej. `The car is damaged` → `Da karz dámashd`).
   - `hotel is` → `jotélz` (ej. `The hotel is near` → `Da jotélz nír`).
   - `lives in` → `livzin`.
   - `works at a` → `uérks ata`.
   - `teach him` → `tíchin im` (la `h` cae en habla rápida).
   - `go to` → `góu ta`.
   - `at the` → `ata`.

4. **Simplicidad Ortográfica:**
   - Terminado en `-ed` sordo → `d` o `t`. Ej: `damaged` → `dámashd` (nunca `dámashdt`).
   - NO uses símbolos AFI/IPA. Usa letras del alfabeto español con tildes explícitas en la sílaba tónica.

### Temas y Nivel Solicitados:
Nivel CEFR objetivo: **A1**

Genera un único bloque JSON válido de 20 objetos respetando estrictamente todas las reglas.
```
