import type { ChaveInfo, QrNfce, TpAmb } from './model';

const UF_POR_CODIGO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

export const HOSTS_QR: Readonly<Record<string, string>> = {
  'www.fazenda.pr.gov.br': 'PR',
};

export const CAMINHO_QR = '/nfce/qrcode';

export function digitoChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarChave(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  return digitoChave(chave.slice(0, 43)) === Number(chave[43]);
}

export function limparChave(texto: string): string {
  return texto.replace(/\D/g, '');
}

export function extrairChave(chave: string): ChaveInfo {
  if (!validarChave(chave)) throw new Error('Chave de acesso inválida');
  const cUf = chave.slice(0, 2);
  return {
    chave,
    cUf,
    uf: UF_POR_CODIGO[cUf] ?? cUf,
    anoMes: chave.slice(2, 6),
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: chave.slice(22, 25),
    numero: chave.slice(25, 34),
    tpEmis: chave.slice(34, 35),
  };
}

export function lerUrlQr(url: string): QrNfce | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || (u.port && u.port !== '80' && u.port !== '443')) return null;
  const uf = HOSTS_QR[u.hostname.toLowerCase()];
  if (!uf || u.pathname.toLowerCase() !== CAMINHO_QR) return null;

  const p = u.searchParams.get('p');
  if (!p) return null;
  const partes = p.split('|');
  const [chave, versao, tpAmb] = partes;
  if (!chave || !validarChave(chave)) return null;
  if (extrairChave(chave).uf !== uf) return null;
  if (tpAmb !== '1' && tpAmb !== '2') return null;

  if (versao === '2' && partes.length === 5) {
    const [, , , cIdToken, hash] = partes;
    if (!/^\d{1,6}$/.test(cIdToken) || !/^[0-9a-f]{40}$/i.test(hash)) return null;
    return { chave, versao: 2, tpAmb, uf, cIdToken, hash: hash.toUpperCase() };
  }
  if (versao === '3' && partes.length === 3) {
    return { chave, versao: 3, tpAmb, uf };
  }
  return null;
}

export function montarUrlQr(qr: QrNfce): string {
  const host = Object.keys(HOSTS_QR).find((h) => HOSTS_QR[h] === qr.uf);
  if (!host) throw new Error(`UF sem host de QR: ${qr.uf}`);
  const p =
    qr.versao === 2
      ? [qr.chave, '2', qr.tpAmb, qr.cIdToken, qr.hash].join('|')
      : [qr.chave, '3', qr.tpAmb].join('|');
  return `https://${host}${CAMINHO_QR}?p=${p}`;
}

export function montarUrlQrV3(chave: string, tpAmb: TpAmb | 1 | 2 = 1): string {
  return `https://www.fazenda.pr.gov.br${CAMINHO_QR}?p=${chave}|3|${tpAmb}`;
}

export function formatarChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
