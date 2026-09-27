// Anonimiza o HTML de uma NFC-e salvo do portal antes de virar fixture de teste:
// troca o bloco do consumidor e qualquer CPF/CNPJ de pessoa física por "***".
// Uso: node scripts/anonimizar-fixture.mjs entrada.html functions/test/fixtures/sefaz-pr/nota-x.html
import { readFileSync, writeFileSync } from 'node:fs';

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('Uso: node scripts/anonimizar-fixture.mjs <entrada.html> <saida.html>');
  process.exit(1);
}

let html = readFileSync(entrada, 'latin1');
const utf8 = readFileSync(entrada, 'utf8');
if (!utf8.includes('�')) html = utf8;

const antes = html;
html = html
  // Bloco "Consumidor" (layout SVRS: <h4>Consumidor</h4><ul>…</ul>).
  .replace(/(<h4>\s*Consumidor[\s\S]*?<\/h4>\s*<ul>)[\s\S]*?(<\/ul>)/gi, '$1<li>***</li>$2')
  // CPF com ou sem máscara.
  .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***')
  .replace(/(CPF\s*:?\s*(<\/strong>)?\s*)\d{11}\b/gi, '$1***')
  // Nome do consumidor em linhas "Nome:".
  .replace(/(Nome\s*:?\s*(<\/strong>)?\s*)[^<]+/gi, '$1***');

if (/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(html)) {
  console.error('Ainda há CPF no arquivo. Revise antes de commitar.');
  process.exit(2);
}
writeFileSync(saida, html, 'utf8');
console.log(`${saida}: ${antes === html ? 'nada a anonimizar' : 'anonimizado'}.`);
