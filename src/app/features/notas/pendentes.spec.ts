import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { Pendente } from '@shared/model';
import { vi } from 'vitest';
import { AuthStore } from '../../core/auth/auth.store';
import { FIRESTORE_API, FirestoreApi } from '../../core/firebase/firestore-api';
import { FIRESTORE } from '../../core/firebase/firestore.token';
import { texto } from '../../../testing/dom';
import { ImportarService } from '../importar/data-access/importar.service';
import { PendentesService } from './data-access/pendentes.service';
import { PendenteRow } from './ui/pendente-row/pendente-row';

const CHAVE = '41260903644587000836652100000168701620438547';
const CHAVE_AGO = '41260803644587000836652030000088681310226239';

function pendente(chave: string, status: Pendente['status'] = 'aguardando'): Pendente {
  return {
    chave,
    url: 'x',
    status,
    tentativas: 1,
    proximaTentativa: '2026-09-27T17:30:00.000Z',
    ultimoErro: 'sefaz-indisponivel',
    criadaEm: '2026-09-27T12:00:00.000Z',
  };
}

function montar() {
  let emitir: ((docs: Pendente[]) => void) | null = null;
  const cancelar = vi.fn();
  const notas = new Map<string, unknown>();
  const api = {
    collection: vi.fn((_db: unknown, caminho: string) => ({ caminho })),
    doc: vi.fn((_db: unknown, caminho: string) => ({ caminho })),
    query: vi.fn((c: unknown, ...r: unknown[]) => ({ c, r })),
    orderBy: vi.fn((campo: string) => ({ orderBy: campo })),
    onSnapshot: vi.fn((_q: unknown, ok: (s: { docs: { data(): Pendente }[] }) => void) => {
      emitir = (docs) => ok({ docs: docs.map((d) => ({ data: () => d })) });
      return cancelar;
    }),
    getDoc: vi.fn(async (ref: { caminho: string }) => ({
      exists: () => notas.has(ref.caminho),
      data: () => notas.get(ref.caminho),
    })),
    deleteDoc: vi.fn(async () => undefined),
  };
  const snack = { open: vi.fn() };
  const uid = signal<string | null>('u1');
  TestBed.configureTestingModule({
    providers: [
      { provide: FIRESTORE, useValue: { fake: true } },
      { provide: FIRESTORE_API, useValue: api as unknown as FirestoreApi },
      { provide: AuthStore, useValue: { uid } },
      { provide: MatSnackBar, useValue: snack },
      {
        provide: ImportarService,
        useValue: { retentar: vi.fn(async () => ({ ok: true, valor: 'x' })) },
      },
    ],
  });
  const servico = TestBed.inject(PendentesService);
  TestBed.tick();
  return { servico, api, snack, notas, uid, cancelar, emitir: (d: Pendente[]) => emitir!(d) };
}

describe('PendentesService', () => {
  it('escuta usuarios/{uid}/pendentes ordenado por criadaEm', () => {
    const { servico, api, emitir } = montar();
    expect(api.collection).toHaveBeenCalledWith({ fake: true }, 'usuarios/u1/pendentes');
    expect(api.orderBy).toHaveBeenCalledWith('criadaEm');
    emitir([pendente(CHAVE), pendente(CHAVE_AGO, 'falhou')]);
    expect(servico.pendentes().map((p) => p.chave)).toEqual([CHAVE, CHAVE_AGO]);
  });

  it('pendente que some com a nota da fila aparecendo dispara o snackbar', async () => {
    const { emitir, notas, snack } = montar();
    emitir([pendente(CHAVE), pendente(CHAVE_AGO)]);
    notas.set(`usuarios/u1/notas/${CHAVE}`, {
      estabelecimentoNome: 'Mercado Bom',
      veioDaFila: true,
    });
    emitir([pendente(CHAVE_AGO)]);
    await vi.waitFor(() =>
      expect(snack.open).toHaveBeenCalledWith(
        'Nota de Mercado Bom importada',
        'OK',
        expect.anything(),
      ),
    );
  });

  it('pendente excluído (sem nota) não avisa', async () => {
    const { emitir, snack, api } = montar();
    emitir([pendente(CHAVE)]);
    emitir([]);
    await vi.waitFor(() => expect(api.getDoc).toHaveBeenCalled());
    expect(snack.open).not.toHaveBeenCalled();
  });

  it('excluir apaga o documento; sem usuário, lista vazia e cancela o listener', async () => {
    const { servico, api, uid, cancelar } = montar();
    await servico.excluir(CHAVE);
    expect(api.deleteDoc).toHaveBeenCalledWith({ caminho: `usuarios/u1/pendentes/${CHAVE}` });
    uid.set(null);
    TestBed.tick();
    expect(cancelar).toHaveBeenCalled();
    expect(servico.pendentes()).toEqual([]);
    await servico.excluir(CHAVE);
    expect(api.deleteDoc).toHaveBeenCalledTimes(1);
  });
});

describe('PendenteRow', () => {
  function render(p: Pendente) {
    const fixture = TestBed.createComponent(PendenteRow);
    fixture.componentRef.setInput('pendente', p);
    fixture.detectChanges();
    return fixture;
  }

  it('aguardando: CNPJ da chave, mês e próxima tentativa; só "Excluir"', () => {
    const el = render(pendente(CHAVE)).nativeElement as HTMLElement;
    expect(texto(el)).toContain('CNPJ 03.644.587/0008-36');
    expect(texto(el)).toContain('Nota de set/2026');
    expect(el.querySelector('.cp-status--aguardando')).not.toBeNull();
    expect(texto(el)).toMatch(/Próxima tentativa às \d{2}:\d{2}/);
    expect(texto(el)).not.toContain('Tentar de novo');
  });

  it('detalhes: chave formatada, número, série, modelo, tentativas e link da SEFAZ', () => {
    const el = render({ ...pendente(CHAVE), ultimoErro: 'sefaz-indisponivel' })
      .nativeElement as HTMLElement;
    const detalhes = texto(el.querySelector('details'));
    expect(detalhes).toContain(CHAVE.replace(/(\d{4})(?=\d)/g, '$1 '));
    expect(detalhes).toContain(`Número${Number(CHAVE.slice(25, 34))}`);
    expect(detalhes).toContain(`Série${CHAVE.slice(22, 25)}`);
    expect(detalhes).toContain('ModeloNFC-e (65)');
    expect(detalhes).toContain('O site da SEFAZ-PR está fora do ar agora.');
    expect(el.querySelector('details a')?.getAttribute('href')).toBe(pendente(CHAVE).url);
  });

  it('falhou: chip próprio e "Tentar de novo" emite a chave', () => {
    const fixture = render(pendente(CHAVE_AGO, 'falhou'));
    const el = fixture.nativeElement as HTMLElement;
    const emitido: string[] = [];
    fixture.componentInstance.retentar.subscribe((c) => emitido.push(c));
    expect(texto(el.querySelector('.cp-status--falhou'))).toContain('Não foi possível importar');
    [...el.querySelectorAll('button')].find((b) => texto(b) === 'Tentar de novo')!.click();
    expect(emitido).toEqual([CHAVE_AGO]);
  });
});
