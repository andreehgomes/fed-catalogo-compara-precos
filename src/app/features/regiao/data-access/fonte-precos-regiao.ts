import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MenorPrecoClient } from './menor-preco.client';
import type { Categoria, ConsultaGtin, ConsultaTermo, ResultadoBusca } from './regiao.model';

export * from './regiao.model';

/**
 * Fonte de preços da região. A UI só conhece esta interface; o provedor padrão é o
 * `MenorPrecoClient`, declarado aqui (e não no `app.config`) para o client e o
 * valibot ficarem fora do bundle inicial.
 */
@Injectable({ providedIn: 'root', useExisting: MenorPrecoClient })
export abstract class FontePrecosRegiao {
  abstract porGtin(q: ConsultaGtin): Observable<ResultadoBusca>;
  abstract porTermo(q: ConsultaTermo): Observable<ResultadoBusca>;
  abstract categorias(q: Omit<ConsultaTermo, 'categoria' | 'offset'>): Observable<Categoria[]>;
}
