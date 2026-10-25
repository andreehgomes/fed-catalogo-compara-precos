import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ObterConfigIaResposta } from '@shared/model';
import { vi } from 'vitest';
import { botao, texto } from '../../../testing/dom';
import ConfiguracoesIaPage from './configuracoes-ia.page';
import { ConfigIaService } from './data-access/config-ia.service';

const CONFIG = { modeloNome: 'claude-opus-5-5', modeloVinculo: 'claude-opus-5-5' } as const;

async function montar(obter: () => Promise<ObterConfigIaResposta>, definir = vi.fn()) {
  const snack = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: ConfigIaService, useValue: { obter: vi.fn(obter), definir } },
      { provide: MatSnackBar, useValue: snack },
    ],
  });
  const fixture = TestBed.createComponent(ConfiguracoesIaPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, definir, snack };
}

function seletor(el: HTMLElement, rotulo: string): HTMLSelectElement {
  const label = [...el.querySelectorAll('label')].find(
    (l) => l.querySelector('span')?.textContent?.trim() === rotulo,
  );
  return label!.querySelector('select')!;
}

describe('ConfiguracoesIaPage', () => {
  it('mostra os modelos atuais, preço, aviso de fallback e o gasto por etapa', async () => {
    const { el, fixture } = await montar(async () => ({
      ok: true,
      config: CONFIG,
      gasto: {
        custoUsd: 0.5,
        chamadas: 6,
        porEtapa: { nome: { custoUsd: 0.4, chamadas: 5 }, vinculo: { custoUsd: 0.1, chamadas: 1 } },
      },
    }));
    expect(seletor(el, 'Nome legível dos produtos').value).toBe('claude-opus-5-5');
    expect(texto(el)).toContain('US$ 4,00 / US$ 20,00 por milhão de tokens');
    expect(texto(el.querySelector('.cp-summary'))).toContain('US$ 0,40');
    expect(botao(el, 'Salvar').disabled).toBe(true);

    const nome = seletor(el, 'Nome legível dos produtos');
    nome.value = 'claude-haiku-5-5';
    nome.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(texto(el)).toContain('US$ 0,10 / US$ 0,50');
    expect(texto(el)).toContain('Sem nova tentativa automática se o modelo recusar.');
    expect(botao(el, 'Salvar').disabled).toBe(false);
  });

  it('salvar manda os dois modelos e avisa que vale em até 1 minuto', async () => {
    const definir = vi.fn(async (config) => ({ ok: true, config }));
    const { el, fixture, snack } = await montar(
      async () => ({ ok: true, config: CONFIG, gasto: null }),
      definir,
    );
    expect(texto(el)).toContain('Nenhuma chamada à IA neste mês.');
    const vinculo = seletor(el, 'Vínculo entre produtos');
    vinculo.value = 'claude-sonnet-5-5';
    vinculo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    botao(el, 'Salvar').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(definir).toHaveBeenCalledWith({
      modeloNome: 'claude-opus-5-5',
      modeloVinculo: 'claude-sonnet-5-5',
    });
    expect(snack.open).toHaveBeenCalledWith(
      'Configuração salva. Vale em até 1 minuto.',
      'OK',
      expect.anything(),
    );
    expect(botao(el, 'Salvar').disabled).toBe(true);
  });

  it('não autorizado mostra aviso; erro de rede oferece tentar de novo', async () => {
    const negado = await montar(async () => ({ ok: false, erro: { codigo: 'nao-autorizado' } }));
    expect(texto(negado.el)).toContain('Só o administrador pode ver esta página.');
    expect(negado.el.querySelector('select')).toBeNull();

    TestBed.resetTestingModule();
    const fora = await montar(async () => {
      throw new Error('rede');
    });
    expect(texto(fora.el)).toContain('Não foi possível carregar a configuração.');
    expect(() => botao(fora.el, 'Tentar de novo')).not.toThrow();
  });
});
