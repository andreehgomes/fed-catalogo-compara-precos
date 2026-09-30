import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApelidoEstabelecimento } from '@shared/model';
import { vi } from 'vitest';
import { AuthStore } from '../../../core/auth/auth.store';
import { CHAMAR_FUNCTION } from '../../../core/firebase/callable';
import { FIRESTORE_API, FirestoreApi } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';
import { HistoricoPessoalStore } from '../../notas/data-access/historico-pessoal.store';
import { ApelidosService } from './apelidos.service';

const CNPJ = '76189406000126';

function montar(resposta: unknown = { ok: true, apelido: 'Condor', notasAtualizadas: 2 }) {
  let emitir: ((docs: ApelidoEstabelecimento[]) => void) | null = null;
  const cancelar = vi.fn();
  const api = {
    collection: vi.fn((_db: unknown, caminho: string) => ({ caminho })),
    onSnapshot: vi.fn(
      (
        _q: unknown,
        ok: (s: { docs: { id: string; data(): ApelidoEstabelecimento }[] }) => void,
      ) => {
        emitir = (docs) => ok({ docs: docs.map((d) => ({ id: d.cnpj, data: () => d })) });
        return cancelar;
      },
    ),
  };
  const chamar = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  const historico = { invalidar: vi.fn() };
  const uid = signal<string | null>('u1');
  TestBed.configureTestingModule({
    providers: [
      { provide: FIRESTORE, useValue: { fake: true } },
      { provide: FIRESTORE_API, useValue: api as unknown as FirestoreApi },
      { provide: AuthStore, useValue: { uid } },
      { provide: CHAMAR_FUNCTION, useValue: chamar },
      { provide: HistoricoPessoalStore, useValue: historico },
    ],
  });
  const servico = TestBed.inject(ApelidosService);
  TestBed.tick();
  return {
    servico,
    api,
    chamar,
    historico,
    uid,
    cancelar,
    emitir: (d: ApelidoEstabelecimento[]) => emitir!(d),
  };
}

describe('ApelidosService', () => {
  it('monta o mapa a partir do snapshot de usuarios/{uid}/estabelecimentos', () => {
    const { servico, api, emitir } = montar();
    expect(api.collection).toHaveBeenCalledWith({ fake: true }, 'usuarios/u1/estabelecimentos');
    expect(servico.apelidos().size).toBe(0);
    emitir([{ cnpj: CNPJ, apelido: 'Condor Pinheirinho', atualizadoEm: 'x' }]);
    expect(servico.apelidos().get(CNPJ)).toBe('Condor Pinheirinho');
  });

  it('sem uid, mapa vazio e o listener é desfeito', () => {
    const { servico, emitir, uid, cancelar } = montar();
    emitir([{ cnpj: CNPJ, apelido: 'Condor', atualizadoEm: 'x' }]);
    uid.set(null);
    TestBed.tick();
    expect(cancelar).toHaveBeenCalled();
    expect(servico.apelidos().size).toBe(0);
  });

  it('nome(): apelido → fantasia → razão social', () => {
    const { servico, emitir } = montar();
    emitir([{ cnpj: CNPJ, apelido: 'Condor Pinheirinho', atualizadoEm: 'x' }]);
    expect(servico.nome({ cnpj: CNPJ, nome: 'CONDOR SUPER CENTER LTDA' })).toBe(
      'Condor Pinheirinho',
    );
    expect(servico.nome({ cnpj: '1', nome: 'SANCHES LTDA', fantasia: 'BOX' })).toBe('BOX');
    expect(servico.nome({ cnpj: '1', nome: 'SANCHES LTDA' })).toBe('SANCHES LTDA');
  });

  it('definir com sucesso chama a callable e invalida o histórico', async () => {
    const { servico, chamar, historico } = montar();
    expect(await servico.definir(CNPJ, 'Condor')).toEqual({
      ok: true,
      valor: { apelido: 'Condor', notasAtualizadas: 2 },
    });
    expect(chamar).toHaveBeenCalledWith('definirApelido', { cnpj: CNPJ, apelido: 'Condor' });
    expect(historico.invalidar).toHaveBeenCalledOnce();
  });

  it('definir com erro não invalida o histórico', async () => {
    const { servico, historico } = montar({ ok: false, erro: { codigo: 'apelido-invalido' } });
    expect(await servico.definir(CNPJ, 'x')).toEqual({
      ok: false,
      erro: { codigo: 'apelido-invalido' },
    });
    expect(historico.invalidar).not.toHaveBeenCalled();
  });

  it('FunctionsError e resposta estranha viram ErroImportacao', async () => {
    const a = montar(Object.assign(new Error('x'), { code: 'functions/resource-exhausted' }));
    expect(await a.servico.definir(CNPJ, null)).toEqual({
      ok: false,
      erro: { codigo: 'rate-limit' },
    });
    TestBed.resetTestingModule();
    const b = montar('lixo');
    expect(await b.servico.definir(CNPJ, null)).toEqual({
      ok: false,
      erro: { codigo: 'desconhecido' },
    });
  });
});
