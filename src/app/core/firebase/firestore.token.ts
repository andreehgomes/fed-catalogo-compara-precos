import { InjectionToken, inject } from '@angular/core';
import {
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { FIREBASE_APP } from './firebase-app.token';

export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  providedIn: 'root',
  factory: () =>
    initializeFirestore(inject(FIREBASE_APP), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    }),
});
