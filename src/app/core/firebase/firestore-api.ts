import { InjectionToken } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

function criarFirestoreApi() {
  return {
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    documentId,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    startAfter,
    updateDoc,
    where,
    writeBatch,
  };
}

export type FirestoreApi = ReturnType<typeof criarFirestoreApi>;

/**
 * Funções do SDK do Firestore usadas pelo app, injetáveis para os testes trocarem por
 * fakes (`vi.mock` de módulos do Firebase não é confiável com o builder do Angular).
 */
export const FIRESTORE_API = new InjectionToken<FirestoreApi>('FIRESTORE_API', {
  providedIn: 'root',
  factory: criarFirestoreApi,
});
