import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE } from './native-fakes';

// Ported from expo-sqlite's SQLiteStatement-test.ios.ts (.vendors/expo @ origin/sdk-57). Same
// native-module fake as sqlite-database.test.ts — no DevTools mock, since that integration was
// deliberately not ported (see packages/sqlite/README.md).
vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
}));

const { openDatabaseAsync } = await import('./sqlite-database');

type ITestEntity = {
  value: string;
  intValue: number;
};

describe('SQLiteStatement', () => {
  let db: Awaited<ReturnType<typeof openDatabaseAsync>>;

  beforeEach(async () => {
    db = await openDatabaseAsync(`sqlite-statement-${Math.random()}.db`);
    await db.execAsync(`
  CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER);
  INSERT INTO test (value, intValue) VALUES ('test1', 123);
  INSERT INTO test (value, intValue) VALUES ('test1', 456);
  INSERT INTO test (value, intValue) VALUES ('test1', 789);
  `);
  });

  afterEach(async () => {
    await db.closeAsync();
    vi.clearAllMocks();
  });

  it('executeAsync returns an object with `lastInsertRowId` and `changes`', async () => {
    const statement = await db.prepareAsync(
      'INSERT INTO test (value, intValue) VALUES (?, ?)',
    );
    const result = await statement.executeAsync('hello', 111);
    expect(result.lastInsertRowId).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
    await statement.finalizeAsync();
  });

  it('executeAsync supports variadic unnamed parameter binding', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE value = ? AND intValue = ?',
    );
    const result = await statement.executeAsync<ITestEntity>('test1', 789);
    const firstRow = await result.getFirstAsync();
    expect(firstRow?.intValue).toBe(789);
    await statement.finalizeAsync();
  });

  it('executeAsync supports array unnamed parameter binding', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE value = ? AND intValue = ?',
    );
    const result = await statement.executeAsync<ITestEntity>(['test1', 789]);
    const firstRow = await result.getFirstAsync();
    expect(firstRow?.intValue).toBe(789);
    await statement.finalizeAsync();
  });

  it('executeAsync supports named parameter binding', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE value = $value and intValue = $intValue',
    );
    const result = await statement.executeAsync<ITestEntity>({
      $value: 'test1',
      $intValue: 789,
    });
    const firstRow = await result.getFirstAsync();
    expect(firstRow?.intValue).toBe(789);
    await statement.finalizeAsync();
  });

  it('executeAsync + getFirstAsync returns null when nothing matches', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE value = ?',
    );
    const result = await statement.executeAsync<ITestEntity>('not-exist');
    const firstRow = await result.getFirstAsync();
    expect(firstRow).toBeNull();
    await statement.finalizeAsync();
  });

  it('executeAsync + getAllAsync returns all items', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE intValue > ?',
    );
    const result = await statement.executeAsync<ITestEntity>([200]);
    const allRows = await result.getAllAsync();
    expect(allRows.length).toBe(2);
    expect(allRows[0]?.intValue).toBe(456);
    expect(allRows[1]?.intValue).toBe(789);
    await statement.finalizeAsync();
  });

  it('executeAsync returns an async iterable', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE intValue > $intValue ORDER BY intValue DESC',
    );
    const result = await statement.executeAsync<ITestEntity>({
      $intValue: 200,
    });
    const rows: ITestEntity[] = [];
    for await (const row of result) {
      rows.push(row);
    }
    expect(rows.length).toBe(2);
    expect(rows[0]?.intValue).toBe(789);
    expect(rows[1]?.intValue).toBe(456);
    await statement.finalizeAsync();
  });

  it('executeForRawResultAsync + getFirstAsync returns the first raw value array', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE intValue = ?',
    );
    const result = await statement.executeForRawResultAsync<ITestEntity>(123);
    const firstRow = await result.getFirstAsync();
    expect(firstRow).toEqual([1, 'test1', 123]);
    await statement.finalizeAsync();
  });

  it('executeForRawResultAsync + getAllAsync returns all raw value arrays', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE intValue > ?',
    );
    const result = await statement.executeForRawResultAsync<ITestEntity>([200]);
    const allRows = await result.getAllAsync();
    expect(allRows.length).toBe(2);
    expect(allRows[0]?.[2]).toBe(456);
    expect(allRows[1]?.[2]).toBe(789);
    await statement.finalizeAsync();
  });

  it('executeForRawResultAsync returns an async iterable of raw value arrays', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test WHERE intValue > $intValue ORDER BY intValue DESC',
    );
    const result = await statement.executeForRawResultAsync<ITestEntity>({
      $intValue: 200,
    });
    const intValues: number[] = [];
    for await (const row of result) {
      const intValue = row[2];
      if (typeof intValue === 'number') {
        intValues.push(intValue);
      }
    }
    expect(intValues.length).toBe(2);
    expect(intValues[0]).toBe(789);
    expect(intValues[1]).toBe(456);
    await statement.finalizeAsync();
  });

  it('getColumnNamesAsync returns column names', async () => {
    const statement = await db.prepareAsync('SELECT * FROM test');
    const columnNames = await statement.getColumnNamesAsync();
    expect(columnNames).toEqual(['id', 'value', 'intValue']);

    const statement2 = await db.prepareAsync(
      'SELECT id, value, intValue FROM test',
    );
    const columnNames2 = await statement2.getColumnNamesAsync();
    expect(columnNames2).toEqual(['id', 'value', 'intValue']);

    const statement3 = await db.prepareAsync(
      'SELECT id AS idWithCustomName, value, intValue FROM test',
    );
    const columnNames3 = await statement3.getColumnNamesAsync();
    expect(columnNames3).toEqual(['idWithCustomName', 'value', 'intValue']);
  });

  it('resetAsync resets the statement cursor', async () => {
    const statement = await db.prepareAsync(
      'SELECT * FROM test ORDER BY intValue ASC',
    );
    const result = await statement.executeAsync<ITestEntity>();
    let row = (await result.next()).value;
    expect(row?.intValue).toBe(123);
    row = (await result.next()).value;
    expect(row?.intValue).toBe(456);
    await result.resetAsync();
    row = (await result.next()).value;
    expect(row?.intValue).toBe(123);
    await statement.finalizeAsync();
  });
});
