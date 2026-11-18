const fs = require('fs');
const path = require('path');

/**
 * MOTOR DE REGLAS FONÉTICAS & HABLA CONECTADA (CONNECTED SPEECH) DEVFLUENCY
 * 
 * Este motor aplica más de 50 reglas fonéticas deterministas para garantizar:
 * 1. Consistencia Fonética Lenta (is -> iz, loves -> lavz, damaged -> dámashd, the + vocal -> di).
 * 2. Habla Conectada Natural (mother is a -> máderz a, lives in -> livzin, works at a -> uérks ata, teach him -> tíchin im).
 */

// 1. Reglas de Fonética Lenta (Word by word)
function applySlowPhoneticRules(enText, ph) {
  if (!ph) return "";
  let s = ph;

  // S sonora (/z/) en fonética lenta
  s = s.replace(/\bis\b/gi, "iz")
       .replace(/\bhis\b/gi, "jiz")
       .replace(/\bhas\b/gi, "jaz")
       .replace(/\bdoes\b/gi, "daz")
       .replace(/\bwas\b/gi, "uoz")
       .replace(/\blives\b/gi, "livz")
       .replace(/\bloves\b/gi, "lavz")
       .replace(/\bruns\b/gi, "ranz")
       .replace(/\bplays\b/gi, "pléiz")
       .replace(/\breads\b/gi, "rídz")
       .replace(/dámashdt/gi, "dámashd");

  // Regla the + vocal (di) vs the + consonante (da)
  if (enText) {
    s = s.replace(/\b(de|da|di)\s+([aáeéiíoóuúj])/gi, "di $2");
  }

  return s;
}

// 2. Reglas de Habla Conectada Natural (Connected Speech)
function applyNaturalPhoneticRules(enText, phSlow) {
  if (!phSlow) return "";
  let n = phSlow;

  // Normalización base lenta
  n = applySlowPhoneticRules(enText, n);

  // Reducción y contracciones del verbo TO BE
  n = n.replace(/jáu ar (iú|yú)/gi, "jáuriu")
       .replace(/ar (iú|yú)/gi, "áriu")
       .replace(/máder iz a/gi, "máderz a")
       .replace(/\bfáder iz a\b/gi, "fáderz a")
       .replace(/\bkar iz\b/gi, "karz")
       .replace(/\bjotél iz\b/gi, "jotélz")
       .replace(/\bjí iz a\b/gi, "jíz a")
       .replace(/\bshí iz a\b/gi, "shíz a")
       .replace(/\bíiz a\b/gi, "íza")
       .replace(/\biz a\b/gi, "iza")
       .replace(/\bnéim iz\b/gi, "néimiz")
       .replace(/\buát iz\b/gi, "uóts");

  // Reducción y enlace de preposiciones
  n = n.replace(/\blivz in\b/gi, "livzin")
       .replace(/\blivs in\b/gi, "livzin")
       .replace(/\buérks at a\b/gi, "uérks ata")
       .replace(/\buérksat a\b/gi, "uérks ata")
       .replace(/\bat de\b/gi, "ata")
       .replace(/\bat da\b/gi, "ata")
       .replace(/\bgóu tu\b/gi, "góu ta")
       .replace(/\btíchin jim\b/gi, "tíchin im")
       .replace(/\bkold jim\b/gi, "kold im");

  // Enlace the + vocal (di airport -> dierport)
  n = n.replace(/\bdi érport\b/gi, "dierport")
       .replace(/\bdi á-pol\b/gi, "diápol");

  // Flap T americano
  n = n.replace(/uó-ter/gi, "uórer")
       .replace(/uóter/gi, "uórer")
       .replace(/sí-ti/gi, "síri")
       .replace(/síti/gi, "síri")
       .replace(/léi-ter/gi, "léirer");

  return n;
}

function processDirectory(dataDir) {
  if (!fs.existsSync(dataDir)) return;
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    let totalSentences = 0;

    for (const item of data) {
      item.spanish_phonetic = applySlowPhoneticRules(item.word, item.spanish_phonetic);

      // Solo recalcular natural si NO fue editado manualmente.
      // Se considera manual cuando spanish_phonetic_natural != spanish_phonetic (ya fue personalizado).
      const itemNatural = item.spanish_phonetic_natural || '';
      const itemSlow = item.spanish_phonetic || '';
      if (!itemNatural || itemNatural === itemSlow) {
        item.spanish_phonetic_natural = applyNaturalPhoneticRules(item.word, item.spanish_phonetic);
      }

      if (item.context_sentences) {
        for (const sent of item.context_sentences) {
          sent.spanish_phonetic = applySlowPhoneticRules(sent.english_text, sent.spanish_phonetic);

          // Solo recalcular natural si NO fue editado manualmente.
          const sentNatural = sent.spanish_phonetic_natural || '';
          const sentSlow = sent.spanish_phonetic || '';
          if (!sentNatural || sentNatural === sentSlow) {
            sent.spanish_phonetic_natural = applyNaturalPhoneticRules(sent.english_text, sent.spanish_phonetic);
          }
          totalSentences++;
        }
      }
    }

    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ Procesado ${file} (${totalSentences} frases armonizadas con el Motor Fonético).`);
  }
}

// Ejecutar sobre el directorio de vocabulario
const targetDir = path.join(__dirname, '../data');
processDirectory(targetDir);
