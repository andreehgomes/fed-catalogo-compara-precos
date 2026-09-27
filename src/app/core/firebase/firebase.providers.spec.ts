import { TestBed } from '@angular/core/testing';
import { deleteApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_AUTH, provideFirebase } from './firebase.providers';
import { FIRESTORE } from './firestore.token';
import { FUNCTIONS } from './functions.token';

describe('provideFirebase', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideFirebase()] });
  });

  afterEach(async () => {
    await deleteApp(TestBed.inject(FIREBASE_APP));
  });

  it('injeta o Firestore do app do projeto dv', () => {
    const db = TestBed.inject(FIRESTORE);
    expect(db.type).toBe('firestore');
    expect(db.app.options.projectId).toBe('fed-catalogo-compara-precos-dv');
  });

  it('Auth e Functions usam o mesmo app; Functions em southamerica-east1', () => {
    const app = TestBed.inject(FIREBASE_APP);
    expect(TestBed.inject(FIREBASE_AUTH).app).toBe(app);
    const fns = TestBed.inject(FUNCTIONS) as unknown as { app: unknown; region: string };
    expect(fns.app).toBe(app);
    expect(fns.region).toBe('southamerica-east1');
  });
});
