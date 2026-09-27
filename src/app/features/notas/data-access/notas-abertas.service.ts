import { Injectable, signal } from '@angular/core';

const CHAVE_STORAGE = 'cp-notas-abertas';
const LIMITE = 300;

function ler(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? (JSON.parse(bruto) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Notas da fila já abertas neste aparelho (marca "Nova"). Fica no localStorage porque
 * o cliente não pode gravar nas notas (regras do Firestore).
 */
@Injectable({ providedIn: 'root' })
export class NotasAbertasService {
  private readonly _abertas = signal(new Set(ler()));
  readonly abertas = this._abertas.asReadonly();

  marcar(chave: string): void {
    if (this._abertas().has(chave)) return;
    const nova = new Set([...this._abertas(), chave]);
    this._abertas.set(nova);
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify([...nova].slice(-LIMITE)));
    } catch {
      /* storage bloqueado: vale só nesta sessão */
    }
  }
}
