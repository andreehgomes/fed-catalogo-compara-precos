import type { ProdutoId } from '@shared/model';
import { locDelta } from './nota';

export const CAFE_EAN: ProdutoId = 'ean:7896089011111';
export const COCA_2L_EAN: ProdutoId = 'ean:7894900022222';

/** Grupos resolvidos da nota: o café e a Coca 2 L do Delta estão ligados ao EAN canônico. */
export function gruposDaLista(): Map<string, string> {
  return new Map<string, string>([
    [locDelta('015'), CAFE_EAN],
    [CAFE_EAN, CAFE_EAN],
    [locDelta('033'), COCA_2L_EAN],
    [COCA_2L_EAN, COCA_2L_EAN],
  ]);
}
