import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Detector, FormatoScanner, SCANNER_ENGINE } from './scanner-engine';

type EstadoScanner = 'iniciando' | 'camera' | 'sem-camera' | 'imagem';

const INTERVALO_MS = 250;

@Component({
  selector: 'cp-scanner',
  imports: [MatIconModule],
  templateUrl: './scanner.html',
  styleUrl: './scanner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Scanner {
  private readonly engine = inject(SCANNER_ENGINE);

  readonly formatos = input.required<readonly FormatoScanner[]>();
  readonly lido = output<string>();
  readonly cancelado = output<void>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly estado = signal<EstadoScanner>('iniciando');
  protected readonly mensagem = signal<string | null>(null);
  protected readonly lanternaDisponivel = signal(false);
  protected readonly lanternaLigada = signal(false);

  private detector: Promise<Detector> | null = null;
  private stream: MediaStream | null = null;
  private quadro = 0;
  private ultimaLeitura = 0;
  private lendo = false;
  private encerrado = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.parar());
    afterNextRender(() => void this.iniciarCamera());
  }

  protected async escolherImagem(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo) return;
    this.mensagem.set(null);
    try {
      const [codigo] = await (
        await this.obterDetector()
      ).detect(await this.engine.bitmapDe(arquivo));
      if (codigo?.rawValue) this.emitir(codigo.rawValue);
      else
        this.mensagem.set(
          'Não encontramos um código nessa imagem. Tente uma foto mais próxima e nítida.',
        );
    } catch {
      this.mensagem.set('Não foi possível ler essa imagem.');
    }
  }

  protected async alternarLanterna(): Promise<void> {
    const trilha = this.stream?.getVideoTracks()[0];
    if (!trilha) return;
    const ligar = !this.lanternaLigada();
    try {
      await trilha.applyConstraints({ advanced: [{ torch: ligar } as MediaTrackConstraintSet] });
      this.lanternaLigada.set(ligar);
    } catch {
      this.lanternaDisponivel.set(false);
    }
  }

  protected cancelar(): void {
    this.parar();
    this.cancelado.emit();
  }

  private obterDetector(): Promise<Detector> {
    this.detector ??= this.engine.criarDetector(this.formatos());
    return this.detector;
  }

  private async iniciarCamera(): Promise<void> {
    try {
      const stream = await this.engine.abrirCamera();
      if (this.encerrado) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const el = this.video()?.nativeElement;
      if (el) {
        // O atributo `muted` criado pelo Angular não liga a propriedade; sem ela o
        // autoplay é recusado e o vídeo fica parado no primeiro quadro.
        el.muted = true;
        el.srcObject = stream;
        await el.play().catch(() => undefined);
      }
      const capacidades = stream.getVideoTracks()[0]?.getCapabilities?.() as
        { torch?: boolean } | undefined;
      this.lanternaDisponivel.set(!!capacidades?.torch);
      this.estado.set('camera');
      this.agendar();
    } catch (erro) {
      const nome = (erro as { name?: string } | null)?.name;
      this.estado.set('sem-camera');
      this.mensagem.set(
        nome === 'NotAllowedError'
          ? 'Sem permissão para usar a câmera. Libere a câmera nas configurações do navegador ou escolha uma imagem.'
          : 'Não encontramos uma câmera disponível. Escolha uma imagem da galeria.',
      );
    }
  }

  private agendar(): void {
    if (this.encerrado) return;
    this.quadro = requestAnimationFrame((t) => void this.tentarLer(t));
  }

  private async tentarLer(instante: number): Promise<void> {
    const el = this.video()?.nativeElement;
    if (!this.lendo && el && el.readyState >= 2 && instante - this.ultimaLeitura >= INTERVALO_MS) {
      this.lendo = true;
      this.ultimaLeitura = instante;
      try {
        const [codigo] = await (await this.obterDetector()).detect(el);
        if (codigo?.rawValue) {
          this.emitir(codigo.rawValue);
          return;
        }
      } catch {
        /* quadro ilegível: tenta o próximo */
      } finally {
        this.lendo = false;
      }
    }
    this.agendar();
  }

  private emitir(valor: string): void {
    this.parar();
    this.lido.emit(valor.trim());
  }

  private parar(): void {
    this.encerrado = true;
    cancelAnimationFrame(this.quadro);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const el = this.video()?.nativeElement;
    if (el) el.srcObject = null;
  }
}
