#!/usr/bin/env python3
"""
validar_fonetica.py - Valida el JSON de vocabulario con fonetica en espanol.

Revisa de forma exacta las reglas mecanicas del prompt:

  Esquema   E1 (cantidad de objetos), E2 (claves del objeto), E3 (3 frases),
            E4 (minusculas, sin IPA, solo alfabeto espanol), E5 (JSON valido)
  Lenta     L1 (is->iz, his->jiz, lives->livz, loves->lavz),
            L3 (the -> di/da segun el sonido siguiente),
            L5 (to->tu),
            L6 (mismo numero de palabras que el ingles)
  Natural   N1..N7 (lista cerrada) + deteccion de omisiones e invenciones.

NO verifica (requiere fonologia real, no es mecanico): L2 (s final sonora/sorda
en general) y L4 (-ed sordo). Revisalas a ojo o con el prompt auditor.

Uso:
  python3 validar_fonetica.py lote.json
  python3 validar_fonetica.py lote.json --count 10 --level B1 \
        --categories software_engineering,daily_routine
  python3 validar_fonetica.py lote.json --json          # salida JSON
  cat lote.json | python3 validar_fonetica.py -         # desde stdin

Codigo de salida: 0 = sin errores, 1 = hay errores, 2 = JSON ilegible.
Solo usa la libreria estandar (Python 3.8+).
"""

import argparse
import json
import re
import sys
from collections import Counter

# --------------------------------------------------------------------------
# Constantes de reglas
# --------------------------------------------------------------------------

OBJ_KEYS = {
    "category", "level", "word", "spanish_phonetic",
    "spanish_phonetic_natural", "spanish_translation", "context_sentences",
}
SENT_KEYS = {
    "english_text", "spanish_phonetic",
    "spanish_phonetic_natural", "spanish_translation",
}

# Reglas de la version lenta (token ingles -> token fonetico exacto)
SLOW_MAP = {"is": "iz", "his": "jiz", "lives": "livz", "loves": "lavz", "to": "tu"}
BANNED_SLOW = {"livs": "livz", "lavs": "lavz"}

# Palabras que, antes de "is", NO se consideran sustantivo (no se contrae)
NON_NOUN_BEFORE_IS = {
    "i", "you", "he", "she", "it", "we", "they", "this", "that", "there",
    "here", "what", "who", "where", "how", "why", "when", "which", "whose",
    "everything", "everyone", "everybody", "something", "someone", "nothing",
    "nobody", "anything", "anyone", "one", "so", "not", "and", "but", "or",
    "if", "then", "now", "today", "yes", "no",
}

# Para decidir di/da por el SONIDO inicial de la palabra siguiente
VOWEL_SOUND_H = ("hour", "honest", "honor", "honour", "heir")
CONSONANT_SOUND_PREFIXES = (
    "unit", "unif", "uniq", "univ", "union", "unic", "unix",
    "use", "usu", "uti", "ubi", "eu",
)
CONSONANT_SOUND_EXACT = {"one", "once"}
ACRONYM_VOWEL_LETTERS = "aefhilmnorsx"   # letras que suenan a vocal: ef, em, ar...

# Palabras fonéticas sin tilde permitidas por las reglas N (2+ sílabas sin tilde)
TILDE_EXEMPT = {"ata", "livzin", "ta", "im"}

PRESET_RULES = (
    ["E1", "E2", "E3", "E4", "E5", "L1", "L3", "L5", "L6"]
    + [f"N{i}" for i in range(1, 8)]
    + ["invencion"]
)

ALLOWED_CHARS = re.compile(r"^[a-záéíóúüñ' \-]+$")


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def norm(tok):
    """Minusculas y sin puntuacion en los extremos."""
    return re.sub(r"^[^\w']+|[^\w']+$", "", tok).lower()


def has_sound_vowel_start(raw):
    """True si la palabra empieza con sonido vocalico, False si consonantico,
    None si no se puede decidir (numeros, vacio)."""
    stripped = raw.strip(".,;:!?\"()[]{}")
    w = norm(raw)
    if not w:
        return None
    if w[0].isdigit():
        return None
    if len(stripped) > 1 and stripped.isalpha() and stripped.isupper():
        return w[0] in ACRONYM_VOWEL_LETTERS      # API -> "ei-pi-ai" (vocal)
    if w.startswith(VOWEL_SOUND_H):
        return True
    if w in CONSONANT_SOUND_EXACT or w.startswith(CONSONANT_SOUND_PREFIXES):
        return False
    return w[0] in "aeiou"


def ending_kind(phon_token):
    """Clasifica el final de un token fonetico: 'sibilant', 'voiceless', 'voiced'."""
    t = re.sub(r"[^a-záéíóúüñ]", "", phon_token.lower())
    if not t:
        return "voiced"
    if t.endswith(("s", "z", "sh", "ch")):
        return "sibilant"
    if t[-1] in "ptkf":
        return "voiceless"
    return "voiced"


def missing_tilde(token):
    """True si un token de 2+ silabas (por grupos vocalicos) no tiene tilde."""
    if token in TILDE_EXEMPT:
        return False
    for piece in token.split("-"):
        if re.search(r"[áéíóú]", piece):
            continue
        if len(re.findall(r"[aeiouü]+", piece)) >= 2:
            return True
    return False


# --------------------------------------------------------------------------
# Habla conectada esperada (lista cerrada N1-N7)
# --------------------------------------------------------------------------

def expected_natural(en, en_raw, slow):
    """Construye la version natural esperada a partir de la lenta.
    Devuelve (lista_tokens, lista_reglas_aplicadas)."""
    out, rules = [], []
    i, n = 0, len(en)
    while i < n:
        if en[i:i + 3] == ["works", "at", "a"]:                 # N4
            out += [slow[i], "ata"]
            rules.append("N4")
            i += 3
            continue
        if en[i:i + 2] == ["lives", "in"]:                      # N3
            out.append("livzin")
            rules.append("N3")
            i += 2
            continue
        if en[i:i + 2] == ["teach", "him"]:                     # N5
            out += ["tíchin", "im"]
            rules.append("N5")
            i += 2
            continue
        if en[i:i + 2] == ["go", "to"]:                         # N6
            out += [slow[i], "ta"]
            rules.append("N6")
            i += 2
            continue
        if en[i:i + 2] in (["at", "the"], ["at", "a"]):         # N7
            out.append("ata")
            rules.append("N7")
            i += 2
            continue
        if (
            en[i] == "is" and i > 0 and out
            and en[i - 1] not in NON_NOUN_BEFORE_IS
            and not en_raw[i - 1].endswith((",", ";", ":"))
        ):                                                      # N1 / N2
            kind = ending_kind(out[-1])
            if kind != "sibilant":                              # ambiguo: no se exige
                out[-1] += "s" if kind == "voiceless" else "z"
                rules.append("N2" if i + 1 < n and en[i + 1] == "a" else "N1")
                i += 1
                continue
        out.append(slow[i])
        i += 1
    return out, rules


# --------------------------------------------------------------------------
# Validador
# --------------------------------------------------------------------------

class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, word, ubic, campo, regla, en, found, expected):
        self.errors.append({
            "word": word, "ubicacion": ubic, "campo": campo, "regla": regla,
            "english_text": en, "encontrado": found, "esperado": expected,
        })

    def warn(self, word, ubic, campo, regla, en, found, expected):
        self.warnings.append({
            "word": word, "ubicacion": ubic, "campo": campo, "regla": regla,
            "english_text": en, "encontrado": found, "esperado": expected,
        })


def check_charset(rep, word, ubic, campo, text, en):
    if not isinstance(text, str):
        rep.err(word, ubic, campo, "E2", en, repr(text), "string")
        return
    if text != text.lower():
        rep.err(word, ubic, campo, "E4", en, text, text.lower())
    bad = sorted(set(re.sub(r"[a-záéíóúüñ' \-]", "", text.lower())))
    if bad or not text.strip():
        rep.err(word, ubic, campo, "E4", en, text,
                f"solo letras del alfabeto espanol (caracteres no validos: {''.join(bad)})")
    for tok in text.lower().split():
        if missing_tilde(tok):
            rep.warn(word, ubic, campo, "E4-tilde", en, tok,
                     "posible falta de tilde en la silaba tonica")


def check_pair(rep, word, ubic, en_text, slow, nat):
    """Revisa un par (ingles, lenta, natural): palabra raiz o frase."""
    campo_s, campo_n = "spanish_phonetic", "spanish_phonetic_natural"
    check_charset(rep, word, ubic, campo_s, slow, en_text)
    check_charset(rep, word, ubic, campo_n, nat, en_text)
    if not all(isinstance(x, str) for x in (en_text, slow, nat)):
        return

    en_raw = en_text.split()
    en = [norm(t) for t in en_raw]
    slow_t = slow.split()
    nat_t = nat.split()

    # tokens prohibidos en cualquier posicion
    for tok in slow_t + nat_t:
        t = tok.lower()
        if t in BANNED_SLOW:
            rep.err(word, ubic, campo_s, "L1", en_text, t, BANNED_SLOW[t])

    # L6: mismo numero de palabras
    if len(slow_t) != len(en):
        rep.err(word, ubic, campo_s, "L6", en_text, f"{len(slow_t)} palabras: {slow}",
                f"{len(en)} palabras (una por cada palabra del ingles)")
        return  # sin alineacion no se pueden validar L1/L3/L5/N

    # L1 / L5 / L3 token a token
    for j, (e, s) in enumerate(zip(en, slow_t)):
        s = s.lower()
        if e in SLOW_MAP and s != SLOW_MAP[e]:
            rep.err(word, ubic, campo_s, "L5" if e == "to" else "L1",
                    en_text, f"{e} -> {s}", f"{e} -> {SLOW_MAP[e]}")
        if e == "the" and j + 1 < len(en):
            v = has_sound_vowel_start(en_raw[j + 1])
            if v is not None:
                exp = "di" if v else "da"
                if s != exp:
                    rep.err(word, ubic, campo_s, "L3", en_text,
                            f"the {en[j+1]} -> {s} {slow_t[j+1] if j+1 < len(slow_t) else ''}".strip(),
                            f"the + {'vocal' if v else 'consonante'} -> {exp}")

    # Natural esperada vs. encontrada
    exp_t, rules = expected_natural(en, en_raw, [t.lower() for t in slow_t])
    nat_l = [t.lower() for t in nat_t]
    slow_l = [t.lower() for t in slow_t]
    if nat_l == exp_t:
        return
    expected_str = " ".join(exp_t)
    if not rules:
        rep.err(word, ubic, campo_n, "invencion", en_text, nat,
                f"{expected_str}  (ninguna regla N aplica: natural = lenta)")
    elif nat_l == slow_l:
        for r in rules:
            rep.err(word, ubic, campo_n, r, en_text, nat, expected_str)
    else:
        for r in rules:
            rep.err(word, ubic, campo_n, r, en_text, nat, expected_str)


def validate(data, count, level, categories):
    rep = Report()
    n_obj = n_sent = 0

    if not isinstance(data, list):
        rep.err("-", "raiz", "estructura", "E1", "", type(data).__name__, "array JSON")
        return rep, 0, 0
    if count is not None and len(data) != count:
        rep.err("-", "raiz", "estructura", "E1", "", f"{len(data)} objetos", f"{count} objetos")

    seen = Counter()
    for idx, obj in enumerate(data, 1):
        if not isinstance(obj, dict):
            rep.err(f"#{idx}", "raiz", "estructura", "E2", "", type(obj).__name__, "objeto")
            continue
        n_obj += 1
        word = obj.get("word") if isinstance(obj.get("word"), str) else f"#{idx}"

        keys = set(obj.keys())
        if keys != OBJ_KEYS:
            falta, sobra = sorted(OBJ_KEYS - keys), sorted(keys - OBJ_KEYS)
            rep.err(word, "raiz", "estructura", "E2", "",
                    f"faltan={falta} sobran={sobra}", "exactamente las 7 claves del esquema")

        if isinstance(obj.get("word"), str):
            if obj["word"] != obj["word"].lower():
                rep.err(word, "raiz", "word", "E4", "", obj["word"], obj["word"].lower())
            seen[obj["word"].lower()] += 1
        if level and obj.get("level") != level:
            rep.err(word, "raiz", "level", "E2", "", str(obj.get("level")), level)
        if categories and obj.get("category") not in categories:
            rep.err(word, "raiz", "category", "E2", "", str(obj.get("category")),
                    " | ".join(sorted(categories)))

        # Palabra raiz: lenta y natural deben ser iguales (ninguna regla N aplica)
        if all(isinstance(obj.get(k), str) for k in ("word", "spanish_phonetic",
                                                       "spanish_phonetic_natural")):
            check_pair(rep, word, "raiz", obj["word"],
                       obj["spanish_phonetic"], obj["spanish_phonetic_natural"])

        sents = obj.get("context_sentences")
        if not isinstance(sents, list) or len(sents) != 3:
            rep.err(word, "raiz", "context_sentences", "E3", "",
                    f"{len(sents) if isinstance(sents, list) else type(sents).__name__} elementos",
                    "exactamente 3 oraciones")
            if not isinstance(sents, list):
                continue

        for k, s in enumerate(sents, 1):
            ubic = f"frase_{k}"
            if not isinstance(s, dict):
                rep.err(word, ubic, "estructura", "E3", "", type(s).__name__, "objeto")
                continue
            n_sent += 1
            skeys = set(s.keys())
            if skeys != SENT_KEYS:
                rep.err(word, ubic, "estructura", "E3", s.get("english_text", ""),
                        f"faltan={sorted(SENT_KEYS - skeys)} sobran={sorted(skeys - SENT_KEYS)}",
                        "exactamente 4 claves por oracion")
            if all(isinstance(s.get(x), str) for x in
                   ("english_text", "spanish_phonetic", "spanish_phonetic_natural")):
                check_pair(rep, word, ubic, s["english_text"],
                           s["spanish_phonetic"], s["spanish_phonetic_natural"])
                # aviso: la palabra objetivo deberia aparecer en la frase
                w = obj.get("word")
                if isinstance(w, str) and w:
                    stem = w.lower()[:max(3, len(w) - 3)]
                    if stem not in s["english_text"].lower():
                        rep.warn(word, ubic, "english_text", "aviso-palabra",
                                 s["english_text"], "la frase no contiene la palabra",
                                 f"debe usar '{w}' (o una forma de ella)")

    for w, c in seen.items():
        if c > 1:
            rep.warn(w, "raiz", "word", "aviso-duplicada", "", f"aparece {c} veces", "una sola vez")
    return rep, n_obj, n_sent


# --------------------------------------------------------------------------
# Entrada / salida
# --------------------------------------------------------------------------

def load_json(path):
    raw = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
    raw = raw.strip()
    # tolerar bloques ```json ... ```
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE)
    return json.loads(raw)


def build_summary(rep, n_obj, n_sent):
    por_regla = Counter({r: 0 for r in PRESET_RULES})
    for e in rep.errors:
        por_regla[e["regla"]] += 1
    return {
        "objetos_revisados": n_obj,
        "frases_revisadas": n_sent,
        "errores_totales": len(rep.errors),
        "avisos_totales": len(rep.warnings),
        "errores_por_regla": dict(por_regla),
    }


def print_text(rep, summary):
    print("=" * 64)
    print("RESUMEN")
    print("=" * 64)
    print(f"Objetos revisados : {summary['objetos_revisados']}")
    print(f"Frases revisadas  : {summary['frases_revisadas']}")
    print(f"Errores           : {summary['errores_totales']}")
    print(f"Avisos            : {summary['avisos_totales']}")
    activos = {k: v for k, v in summary["errores_por_regla"].items() if v}
    if activos:
        print("Por regla         : " + ", ".join(f"{k}={v}" for k, v in activos.items()))

    def dump(title, items):
        if not items:
            return
        print("\n" + "=" * 64)
        print(title)
        print("=" * 64)
        for n, e in enumerate(items, 1):
            print(f"[{n}] {e['word']} | {e['ubicacion']} | {e['campo']} | {e['regla']}")
            if e["english_text"]:
                print(f"    EN         : {e['english_text']}")
            print(f"    encontrado : {e['encontrado']}")
            print(f"    esperado   : {e['esperado']}")

    dump("ERRORES", rep.errors)
    dump("AVISOS (heuristicos, revisar a mano)", rep.warnings)
    if not rep.errors:
        print("\nOK: no se encontraron errores de reglas mecanicas.")


def main():
    ap = argparse.ArgumentParser(description="Valida el JSON de vocabulario con fonetica.")
    ap.add_argument("archivo", help="ruta del JSON, o - para leer de stdin")
    ap.add_argument("--count", type=int, default=20, help="objetos esperados (default 20; 0 = no validar)")
    ap.add_argument("--level", help="nivel CEFR esperado en todos los objetos (ej. B1)")
    ap.add_argument("--categories", help="categorias permitidas separadas por coma")
    ap.add_argument("--json", action="store_true", help="salida en JSON (resumen + errores)")
    args = ap.parse_args()

    try:
        data = load_json(args.archivo)
    except json.JSONDecodeError as ex:
        msg = f"E5: JSON invalido en linea {ex.lineno}, columna {ex.colno}: {ex.msg}"
        if args.json:
            print(json.dumps({"error": msg}, ensure_ascii=False, indent=2))
        else:
            print(msg)
        sys.exit(2)
    except OSError as ex:
        print(f"No se pudo leer el archivo: {ex}")
        sys.exit(2)

    cats = {c.strip() for c in args.categories.split(",")} if args.categories else None
    rep, n_obj, n_sent = validate(data, args.count or None, args.level, cats)
    summary = build_summary(rep, n_obj, n_sent)

    if args.json:
        print(json.dumps({"resumen": summary, "errores": rep.errors, "avisos": rep.warnings},
                         ensure_ascii=False, indent=2))
    else:
        print_text(rep, summary)
    sys.exit(1 if rep.errors else 0)


if __name__ == "__main__":
    main()
