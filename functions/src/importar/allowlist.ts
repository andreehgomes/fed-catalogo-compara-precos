import { lerUrlQr, montarUrlQr } from '@shared/chave-acesso';
import type { QrNfce } from '@shared/model';

/**
 * Hosts para onde um redirect do portal pode levar. Tudo HTTPS e só da SEFA-PR; o
 * portal estava fora do ar no spike (27/09/2026), então esta lista precisa ser
 * confirmada quando ele voltar (Tarefa 6.3).
 */
export const HOSTS_REDIRECT = new Set([
  'www.fazenda.pr.gov.br',
  'www.dfeportal.fazenda.pr.gov.br',
  'dfeportal.fazenda.pr.gov.br',
  'www.dfews.fazenda.pr.gov.br',
]);

export interface UrlValidada {
  url: string;
  qr: QrNfce;
}

/**
 * Valida a URL do QR e devolve outra, reconstruída a partir das partes validadas e sempre
 * em HTTPS. A string recebida do cliente nunca é repassada ao fetch (anti-SSRF).
 */
export function urlPermitida(url: unknown): UrlValidada | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  const qr = lerUrlQr(url);
  if (!qr) return null;
  return { url: montarUrlQr(qr), qr };
}

export function redirectPermitido(location: string, base: string): string | null {
  let alvo: URL;
  try {
    alvo = new URL(location, base);
  } catch {
    return null;
  }
  if (alvo.protocol !== 'https:' || alvo.username || alvo.password) return null;
  if (alvo.port && alvo.port !== '443') return null;
  if (!HOSTS_REDIRECT.has(alvo.hostname.toLowerCase())) return null;
  return alvo.href;
}
