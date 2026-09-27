import type { FieldTree } from '@angular/forms/signals';

export function erroDoCampo<T>(campo: FieldTree<T>): string | null {
  const estado = campo();
  if (!estado.touched() || !estado.invalid()) return null;
  return estado.errors()[0]?.message ?? 'Valor inválido.';
}
