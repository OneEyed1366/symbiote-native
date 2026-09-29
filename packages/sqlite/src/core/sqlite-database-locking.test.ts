import { describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE } from './native-fakes';

vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));
vi.mock('@symbiote-native/asset', () => ({
  Asset: { fromModule: vi.fn() },
}));
vi.mock('expo-modules-core', () => ({ Platform: { OS: 'ios' } }));

const { openDatabaseAsync } = await import('./sqlite-database');

// Upstream waits 100 and 200 ms here; the same interleaving holds at a tenth of that
const OUTSIDE_WRITE_DELAY_MS = 10;
const STEP_DELAY_MS = 20;
const STEPS = 5;

const delayAsync = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

async function openSeededDatabase() {
  const db = await openDatabaseAsync(`locking-${Math.random()}.db`);
  await db.execAsync(`
CREATE TABLE users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
INSERT INTO users (name) VALUES ('aaa');
`);
  return db;
}

async function outsideWrite(
  db: Awaited<ReturnType<typeof openSeededDatabase>>,
): Promise<void> {
  await delayAsync(OUTSIDE_WRITE_DELAY_MS);
  try {
    await db.runAsync('UPDATE users SET name = ?', 'bbb');
    const result = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM users',
    );
    if (result?.name !== 'bbb') {
      throw new Error(`Expected bbb but received ${result?.name}`);
    }
  } catch (error) {
    throw new Error(`Exception from promise2: ${String(error)}`, {
      cause: error,
    });
  }
}

describe('concurrent access during a transaction', () => {
  it('withTransactionAsync can have other async queries interrupted inside the transaction', async () => {
    const db = await openSeededDatabase();

    const inTransaction = db.withTransactionAsync(async () => {
      for (let step = 0; step < STEPS; ++step) {
        const result = await db.getFirstAsync<{ name: string }>(
          'SELECT name FROM users',
        );
        if (result?.name !== 'aaa') {
          throw new Error(
            `Exception from promise1: Expected aaa but received ${result?.name}`,
          );
        }
        await db.runAsync('UPDATE users SET name = ?', 'aaa');
        await delayAsync(STEP_DELAY_MS);
      }
    });

    await expect(
      Promise.all([inTransaction, outsideWrite(db)]),
    ).rejects.toThrow(/Exception from promise1: Expected aaa but received bbb/);
  });

  it('withExclusiveTransactionAsync runs atomically and aborts another write query', async () => {
    const db = await openSeededDatabase();

    const inTransaction = db.withExclusiveTransactionAsync(async txn => {
      for (let step = 0; step < STEPS; ++step) {
        const result = await txn.getFirstAsync<{ name: string }>(
          'SELECT name FROM users',
        );
        if (result?.name !== 'aaa') {
          throw new Error(
            `Exception from promise1: Expected aaa but received ${result?.name}`,
          );
        }
        await txn.runAsync('UPDATE users SET name = ?', 'aaa');
        await delayAsync(STEP_DELAY_MS);
      }
    });

    await expect(
      Promise.all([inTransaction, outsideWrite(db)]),
    ).rejects.toThrow(/Exception from promise2:[\s\S]*database is locked/);

    // The transaction is finalized only once its own promise settles
    await inTransaction;
  });
});
