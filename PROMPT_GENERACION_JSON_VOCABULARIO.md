Actúa como profesor nativo de inglés y lingüista experto en fonética y habla conectada (connected speech) para hispanohablantes.

TAREA
Genera un array JSON con exactamente 20 objetos (una palabra por objeto). Tu respuesta es SOLO el JSON: sin bloques markdown, sin texto antes ni después, empezando en [ y terminando en ].

PARÁMETROS (no los cambies ni los infieras)
- Nivel CEFR: B1
- Categorías: software_engineering, daily_routine
- Distribución: 10 palabras por categoría
- Palabras que NO debes repetir: (ninguna)

ESQUEMA (todas las claves obligatorias, sin claves extra)
{
  "category": "",
  "level": "",
  "word": "",
  "spanish_phonetic": "",
  "spanish_phonetic_natural": "",
  "spanish_translation": "",
  "context_sentences": [
    { "english_text": "", "spanish_phonetic": "", "spanish_phonetic_natural": "", "spanish_translation": "" }
  ]
}
- context_sentences: exactamente 3 oraciones por palabra.
- Cada una de las 3 oraciones debe tener 5 a 10 palabras.
- Al menos 1 de las 3 oraciones debe incluir "is", "lives", "works", "at the" o "go to" para practicar las reglas.

FORMATO DE FONÉTICA
- Solo letras del alfabeto español, minúsculas, con tilde en la sílaba tónica. Prohibido AFI/IPA.
- spanish_phonetic = pronunciación lenta, palabra por palabra, separadas por espacio.
- spanish_phonetic_natural = habla conectada aplicando SOLO las reglas de abajo.

REGLAS DE LA VERSIÓN LENTA
L1. "is" -> "iz" siempre. "his" -> "jiz". "lives" -> "livz". "loves" -> "lavz".
L2. "s" final tras sonido sonoro -> "z" (runs -> ranz, plays -> pléiz). Tras sonido sordo -> "s".
L3. "the" + vocal -> "di". "the" + consonante -> "da".
L4. "-ed" sordo -> "t" o "d" (damaged -> dámashd).
L5. "to" se escribe "tu" en lenta.

REGLAS DE LA VERSIÓN NATURAL (lista CERRADA)
N1. [sustantivo] + "is" -> sustantivo + "z" (si termina en sonido sonoro o vocal) o "s" (si termina en sordo).
    car is -> karz | hotel is -> jotélz | server is -> sérverz | cat is -> kats
N2. [sustantivo] + "is a" -> sustantivo + "z a": mother is a -> máderz a
N3. "lives in" -> "livzin"
N4. "works at a" -> "uérks ata"
N5. "teach him" -> "tíchin im" (la h cae en pronombres him/her/his/he cuando van tras verbo)
N6. "go to" -> "góu ta"
N7. "at the" / "at a" -> "ata"

REGLA DE ORO
Si en una frase no aplica ninguna regla N1-N7, spanish_phonetic_natural debe ser IDÉNTICA a spanish_phonetic. Está prohibido inventar cualquier otra contracción o enlace.
Si aplica una regla N, es OBLIGATORIO aplicarla. No la omitas.

EJEMPLO COMPLETO DE REFERENCIA
{
  "category": "software_engineering",
  "level": "B1",
  "word": "server",
  "spanish_phonetic": "sérver",
  "spanish_phonetic_natural": "sérver",
  "spanish_translation": "servidor",
  "context_sentences": [
    {
      "english_text": "The server is down.",
      "spanish_phonetic": "da sérver iz daun",
      "spanish_phonetic_natural": "da sérverz daun",
      "spanish_translation": "El servidor está caído."
    },
    {
      "english_text": "My brother works at a startup.",
      "spanish_phonetic": "mai bráder uérks at a stártap",
      "spanish_phonetic_natural": "mai bráder uérks ata stártap",
      "spanish_translation": "Mi hermano trabaja en una startup."
    },
    {
      "english_text": "We need a new server.",
      "spanish_phonetic": "ui nid a niu sérver",
      "spanish_phonetic_natural": "ui nid a niu sérver",
      "spanish_translation": "Necesitamos un servidor nuevo."
    }
  ]
}

Si no puedes completar los 20 objetos, genera los que puedas y cierra el array con ] para que el JSON sea válido.

AUTOVERIFICACIÓN (hazla internamente antes de responder, sin mostrarla)
1. ¿Hay 20 objetos y 3 oraciones en cada uno?
2. ¿Cada "is" del inglés aparece como "iz" en la lenta?
3. ¿Cada "the" es "di" o "da" según la letra siguiente?
4. ¿Cada patrón N1-N7 presente en el inglés fue aplicado en la natural?
5. ¿Alguna natural difiere de la lenta SIN que aplique una regla N? Si sí, corrígela.
6. ¿El JSON es válido (comillas, comas, corchetes) y no hay texto fuera de él?

Responde únicamente con el JSON. El primer carácter de tu respuesta es [ y el último es ].
