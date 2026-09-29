import type { Repositorio } from '../dados/repositorio';
import { adaptadorPara, type AdaptadorUf } from '../parsers';
import type { ClassificarVinculos } from '../vinculo/ia';
import { buscarSefaz, type RespostaSefaz } from './fetch-sefaz';
import { logImportacao, type RegistroImportacao } from './log';

/** Dependências das regras de negócio, injetadas para os testes (repositório em memória, relógio, fetch). */
export interface Contexto {
  repo: Repositorio;
  agora: () => Date;
  buscar: (url: string) => Promise<RespostaSefaz>;
  adaptador: (uf: string) => AdaptadorUf;
  log: (r: RegistroImportacao) => void;
  esperar: (ms: number) => Promise<void>;
  /** IA que decide os vínculos em dúvida; lança em qualquer falha. */
  classificarVinculos: ClassificarVinculos;
  /** Em dev, guarda o HTML de layout inesperado no log para diagnóstico (RF-10). */
  registrarHtml?: (html: string, motivo: string) => void;
}

export function contextoPadrao(
  repo: Repositorio,
  classificarVinculos: ClassificarVinculos,
  registrarHtml?: Contexto['registrarHtml'],
): Contexto {
  return {
    repo,
    agora: () => new Date(),
    buscar: (url) => buscarSefaz(url),
    adaptador: adaptadorPara,
    log: (r) => logImportacao(r),
    esperar: (ms) => new Promise((res) => setTimeout(res, ms)),
    classificarVinculos,
    registrarHtml,
  };
}
