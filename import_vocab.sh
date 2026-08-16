#!/bin/bash
# Script para importar Vocabulario JSON a la base de datos PostgreSQL

echo "🚀 Iniciando importación de vocabulario..."

DATA_DIR="crates/content-vocabulary-service/data"

if [ ! -d "$DATA_DIR" ]; then
    echo "⚠️ Error: El directorio '$DATA_DIR' no existe."
    exit 1
fi

# Contar cuántos JSON hay
json_count=$(ls -1q $DATA_DIR/*.json 2>/dev/null | wc -l)

if [ "$json_count" -eq 0 ]; then
    echo "⚠️ No se encontraron archivos JSON en $DATA_DIR."
    exit 0
fi

echo "📖 Se encontraron $json_count archivos JSON en $DATA_DIR."

echo "🎯 Ejecutando Motor Fonético Consistente (Habla Conectada)..."
node crates/content-vocabulary-service/scripts/phonetic_engine.js

# Script independiente para ejecutar las migraciones SQL una sola vez
cat << 'EOF' > migrate_script.js
const fs = require('fs');
const { Client } = require('pg');

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgres://postgres:Kevins1612522026@127.0.0.1:5432/devfluency_db'
    });
    await client.connect();

    const migrationDir = 'migrations';
    if (fs.existsSync(migrationDir)) {
        const sqlFiles = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of sqlFiles) {
            console.log(`⚙️ Aplicando migración: ${file}`);
            const sql = fs.readFileSync(`${migrationDir}/${file}`, 'utf8');
            await client.query(sql);
        }
    }
    await client.end();
}

migrate().catch(err => {
    console.error('❌ Error ejecutando migraciones:', err.message);
    process.exit(1);
});
EOF

echo "⚙️ Ejecutando migraciones SQL de base de datos..."
node migrate_script.js
rm -f migrate_script.js

cat << 'EOF' > seed_script.js
const fs = require('fs');
const { Client } = require('pg');

async function seed() {
    const filePath = process.argv[2];
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgres://postgres:Kevins1612522026@127.0.0.1:5432/devfluency_db'
    });

    await client.connect();

    let wordsInserted = 0;
    let sentencesInserted = 0;

    try {
        await client.query('BEGIN');

        for (const item of data) {
            // Verificar si la palabra ya existe
            const checkRes = await client.query(
                `SELECT id FROM vocabulary_words WHERE word = $1 LIMIT 1`,
                [item.word]
            );

            let wordId;

            if (checkRes.rows.length > 0) {
                // Ya existe, actualizar
                wordId = checkRes.rows[0].id;
                await client.query(
                    `UPDATE vocabulary_words 
                     SET spanish_phonetic = $1, spanish_translation = $2, category = $3, level = $4, spanish_phonetic_natural = $5
                     WHERE id = $6`,
                    [item.spanish_phonetic, item.spanish_translation, item.category, item.level, item.spanish_phonetic_natural || item.spanish_phonetic, wordId]
                );
            } else {
                // No existe, insertar
                const insertRes = await client.query(
                    `INSERT INTO vocabulary_words (word, spanish_phonetic, spanish_translation, category, level, spanish_phonetic_natural)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING id`,
                    [item.word, item.spanish_phonetic, item.spanish_translation, item.category, item.level, item.spanish_phonetic_natural || item.spanish_phonetic]
                );
                wordId = insertRes.rows[0].id;
            }

            wordsInserted++;

            // Eliminar el progreso SRS que referencia estas oraciones (FK constraint)
            await client.query(
                `DELETE FROM user_srs_progress WHERE sentence_id IN (
                    SELECT id FROM context_sentences WHERE word_id = $1
                )`,
                [wordId]
            );

            // Eliminar oraciones viejas de esta palabra para no duplicarlas
            await client.query(`DELETE FROM context_sentences WHERE word_id = $1`, [wordId]);


            // Insertar oraciones de contexto
            if (item.context_sentences && item.context_sentences.length > 0) {
                for (const sentence of item.context_sentences) {
                    await client.query(
                        `INSERT INTO context_sentences (word_id, english_text, spanish_phonetic, spanish_translation, spanish_phonetic_natural)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [wordId, sentence.english_text, sentence.spanish_phonetic, sentence.spanish_translation, sentence.spanish_phonetic_natural || sentence.spanish_phonetic]
                    );
                    sentencesInserted++;
                }
            }
        }

        await client.query('COMMIT');
        console.log(`✅ ¡Importación Exitosa!`);
        console.log(`📌 Se importaron/actualizaron ${wordsInserted} palabras y ${sentencesInserted} oraciones de contexto.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la importación. Se revirtieron los cambios.');
        console.error(err);
    } finally {
        await client.end();
    }
}

seed();
EOF

# Ejecutar el script usando node (instalando pg localmente si no existe)
if [ ! -d "node_modules/pg" ]; then
    echo "📦 Instalando dependencia de Postgres para Node.js (pg)..."
    npm install pg --no-save > /dev/null 2>&1
fi

for FILE in $DATA_DIR/*.json; do
    echo "▶️ Procesando: $FILE..."
    node seed_script.js "$FILE"
done

rm seed_script.js

echo "🎉 Importación finalizada para todos los archivos."
