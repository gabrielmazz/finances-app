import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { assertFirstUseUnlocked } from '../src/sparkFirstUseLock';

function fixture(locked: string[]) {
  const reads: string[] = [];
  const db = { doc: (path: string) => path } as unknown as Firestore;
  const transaction = { get: async (path: string) => {
    reads.push(path);
    return { exists: locked.includes(path.split('/')[1]) };
  } } as unknown as Transaction;
  return { db, transaction, reads };
}

test('contas sem bloqueio podem prosseguir e IDs repetidos são lidos uma só vez', async () => {
  const { db, transaction, reads } = fixture([]);
  await assertFirstUseUnlocked(transaction, db, ['actor', 'owner', 'actor']);
  assert.deepEqual(reads, ['sparkFirstUseLocks/actor', 'sparkFirstUseLocks/owner']);
});

test('bloqueio do ator ou do proprietário impede a operação privilegiada', async () => {
  for (const locked of ['actor', 'owner']) {
    const { db, transaction } = fixture([locked]);
    await assert.rejects(assertFirstUseUnlocked(transaction, db, ['actor', 'owner']),
      (error: unknown) => (error as { code?: string }).code === 'failed-precondition');
  }
});

test('falha de leitura não é interpretada como autorização', async () => {
  const { db } = fixture([]);
  const transaction = { get: async () => { throw new Error('indisponível'); } } as unknown as Transaction;
  await assert.rejects(assertFirstUseUnlocked(transaction, db, ['actor']), /indisponível/);
});
