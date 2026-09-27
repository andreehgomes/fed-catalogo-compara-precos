// Gera as imagens de QR (URL real da NFC-e do spike) e de EAN-13 usadas nos testes do
// scanner, e confere cada uma lendo de volta com o mesmo leitor do app (zxing-wasm).
import { readFileSync, writeFileSync } from 'node:fs';
import { readBarcodes } from 'zxing-wasm/reader';
import { writeBarcode } from 'zxing-wasm/writer';

const destino = new URL('../e2e/fixtures/', import.meta.url);
const imagens = [
  [
    'qr-nfce-pr.png',
    'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41260903644587000836652100000168701620438547|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651',
    'QRCode',
  ],
  ['ean-coca-cola.png', '7894900011517', 'EAN13'],
];

for (const [nome, texto, formato] of imagens) {
  const gerado = await writeBarcode(texto, { format: formato, scale: 6 });
  if (gerado.error) throw new Error(gerado.error);
  const arquivo = new URL(nome, destino);
  writeFileSync(arquivo, Buffer.from(await gerado.image.arrayBuffer()));
  const lidos = await readBarcodes(new Uint8Array(readFileSync(arquivo)), { formats: [formato] });
  if (lidos[0]?.text !== texto) throw new Error(`${nome}: leitura não confere`);
  console.log(`${nome}: ok`);
}
