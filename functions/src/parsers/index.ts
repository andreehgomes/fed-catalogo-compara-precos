import type { NfceParsed } from '@shared/model';
import { ErroNegocio } from '../importar/erros';
import { pareceNotaPr, parsePr } from './pr';

export type Parser = (html: string) => NfceParsed;

export interface AdaptadorUf {
  parse: Parser;
  pareceNota: (html: string) => boolean;
}

const ADAPTADORES: Readonly<Record<string, AdaptadorUf>> = {
  PR: { parse: parsePr, pareceNota: pareceNotaPr },
};

export function adaptadorPara(uf: string): AdaptadorUf {
  const a = ADAPTADORES[uf];
  if (!a) throw new ErroNegocio('uf-nao-suportada', `UF ${uf} sem parser`);
  return a;
}

export function parserPara(uf: string): Parser {
  return adaptadorPara(uf).parse;
}
