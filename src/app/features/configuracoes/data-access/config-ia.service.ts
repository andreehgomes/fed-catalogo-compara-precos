import { Injectable, inject } from '@angular/core';
import type { DefinirConfigIaResposta, ObterConfigIaResposta } from '@shared/model';
import type { ConfigIa } from '@shared/modelos-ia';
import { CHAMAR_FUNCTION } from '../../../core/firebase/callable';

/** Callables de administrador: o cliente não lê nem grava `controle/configIa`. */
@Injectable({ providedIn: 'root' })
export class ConfigIaService {
  private readonly chamar = inject(CHAMAR_FUNCTION);

  obter(): Promise<ObterConfigIaResposta> {
    return this.chamar<ObterConfigIaResposta>('obterConfigIa', {});
  }

  definir(config: ConfigIa): Promise<DefinirConfigIaResposta> {
    return this.chamar<DefinirConfigIaResposta>('definirConfigIa', config);
  }
}
