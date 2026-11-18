Actúa como auditor lingüista de fonética inglés→español. NO generes vocabulario nuevo ni reescribas el JSON completo. Tu única tarea es revisar el JSON que te pegaré al final y reportar SOLO los incumplimientos de las reglas.

REGLAS A VERIFICAR

Esquema
E1. El array tiene exactamente 20 objetos.
E2. Cada objeto tiene solo estas claves: category, level, word, spanish_phonetic, spanish_phonetic_natural, spanish_translation, context_sentences.
E3. context_sentences tiene exactamente 3 elementos, cada uno con: english_text, spanish_phonetic, spanish_phonetic_natural, spanish_translation.
E4. Toda la fonética está en minúsculas, sin símbolos AFI/IPA, con tilde en la sílaba tónica de las palabras de 2+ sílabas.
E5. El JSON es válido.

Versión lenta (spanish_phonetic)
L1. "is" -> "iz"; "his" -> "jiz"; "lives" -> "livz"; "loves" -> "lavz".
L2. "s" final tras sonido sonoro -> "z"; tras sordo -> "s".
L3. "the" + vocal -> "di"; "the" + consonante -> "da" (se decide por el sonido, no por la letra).
L4. "-ed" sordo -> "t" o "d".
L5. "to" -> "tu".
L6. La lenta tiene el mismo número de palabras que english_text.

Versión natural (spanish_phonetic_natural), lista CERRADA
N1. sustantivo + "is" -> sustantivo + "z" (sonoro/vocal) o "s" (sordo): car is -> karz | hotel is -> jotélz | server is -> sérverz.
N2. sustantivo + "is a" -> sustantivo + "z a": mother is a -> máderz a.
N3. "lives in" -> "livzin".
N4. "works at a" -> "uérks ata".
N5. "teach him" -> "tíchin im" (h cae en him/her/his/he tras verbo).
N6. "go to" -> "góu ta".
N7. "at the" / "at a" -> "ata".

REGLA DE ORO
- Si el inglés contiene un patrón N1-N7 y la natural NO lo aplica, es error "omisión".
- Si la natural difiere de la lenta y NO corresponde a ningún patrón N1-N7, es error "invención".
- Si no aplica ningún patrón, la natural debe ser IDÉNTICA a la lenta.

PROCEDIMIENTO (obligatorio, interno)
1. Revisa objeto por objeto y frase por frase, sin saltarte ninguno.
2. Para cada frase, localiza TODAS las apariciones de is/his/lives/loves/the/to/-ed y de los patrones N1-N7 en el english_text.
3. Compara con ambas fonéticas y anota cada discrepancia.
4. Antes de reportar un error, confirma que realmente incumple la regla. No reportes falsos positivos: si dudas, no lo marques.

FORMATO DE SALIDA (solo JSON, sin markdown ni texto fuera)
{
  "resumen": {
    "objetos_revisados": 0,
    "frases_revisadas": 0,
    "errores_totales": 0,
    "errores_por_regla": { "L1": 0, "L2": 0, "L3": 0, "L4": 0, "L5": 0, "L6": 0, "N1": 0, "N2": 0, "N3": 0, "N4": 0, "N5": 0, "N6": 0, "N7": 0, "invencion": 0, "esquema": 0 }
  },
  "errores": [
    {
      "word": "palabra del objeto",
      "ubicacion": "raiz | frase_1 | frase_2 | frase_3",
      "campo": "spanish_phonetic | spanish_phonetic_natural | estructura",
      "regla": "L1 | N1 | invencion | ...",
      "english_text": "texto original de la frase",
      "encontrado": "lo que dice el JSON",
      "esperado": "lo que debería decir"
    }
  ]
}

Si no hay errores, "errores" es [] y errores_totales es 0.

JSON A AUDITAR:
[PEGA AQUÍ EL JSON]
