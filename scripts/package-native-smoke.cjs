const path = require('node:path');

async function main() {
  const archive = process.argv[2];
  if (!archive) throw new Error('Caminho do ASAR não informado.');
  const sharp = require(path.join(archive, 'node_modules', 'sharp'));
  const Database = require(path.join(archive, 'node_modules', 'better-sqlite3'));
  const database = new Database(':memory:');
  try {
    database.prepare('SELECT sqlite_version()').get();
  } finally {
    database.close();
  }
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  if (image.length === 0) throw new Error('O processamento de imagem retornou um arquivo vazio.');
  console.log('Módulos SQLite e sharp do pacote validados.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
