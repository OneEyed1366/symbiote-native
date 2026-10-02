import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE } from './native-fakes';

vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));
vi.mock('@symbiote-native/asset', () => ({
  Asset: {
    fromModule: vi.fn(() => ({
      downloadAsync: async () => ({ localUri: null }),
    })),
  },
}));
vi.mock('expo-modules-core', () => ({ Platform: { OS: 'ios' } }));

const { openDatabaseAsync } = await import('./sqlite-database');

afterEach(() => {
  vi.clearAllMocks();
});

async function seededDb() {
  const db = await openDatabaseAsync(`tagged-query-${Math.random()}.db`);
  await db.execAsync(
    'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)',
  );
  await db.runAsync('INSERT INTO users (name, age) VALUES (?, ?)', [
    'Alice',
    30,
  ]);
  await db.runAsync('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25]);
  return db;
}

// Unseeded — for cases that insert their own rows via the tagged query itself.
async function freshDb() {
  const db = await openDatabaseAsync(`tagged-query-fresh-${Math.random()}.db`);
  await db.execAsync(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER);
    CREATE TABLE test_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT,
      intValue INTEGER,
      blobValue BLOB
    );
  `);
  return db;
}

type IUser = { id: number; name: string; age: number };
type ITestData = {
  id: number;
  value: string;
  intValue: number;
  blobValue?: Uint8Array;
};

describe('SQLiteTaggedQuery', () => {
  it('is directly awaitable and returns rows for a SELECT', async () => {
    const db = await seededDb();
    const users =
      await db.sql<IUser>`SELECT * FROM users WHERE age > ${21} ORDER BY id`;
    expect(users.map(u => u.name)).toEqual(['Alice', 'Bob']);
  });

  it('is directly awaitable and returns ISQLiteRunResult for a mutation', async () => {
    const db = await seededDb();
    const result =
      await db.sql`INSERT INTO users (name, age) VALUES (${'Cara'}, ${40})`;
    expect(result).toMatchObject({ changes: 1 });
  });

  describe('.values()', () => {
    it('returns rows as arrays of values in column order', async () => {
      const db = await seededDb();
      const rows =
        await db.sql`SELECT name, age FROM users ORDER BY id`.values();
      expect(rows).toEqual([
        ['Alice', 30],
        ['Bob', 25],
      ]);
    });
  });

  describe('.first()', () => {
    it('returns the first matching row', async () => {
      const db = await seededDb();
      const user =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${'Bob'}`.first();
      expect(user?.age).toBe(25);
    });

    it('returns null when nothing matches', async () => {
      const db = await seededDb();
      const user =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${'Nobody'}`.first();
      expect(user).toBeNull();
    });
  });

  describe('.each()', () => {
    it('async-iterates every matching row', async () => {
      const db = await seededDb();
      const names: string[] = [];
      for await (const user of db.sql<IUser>`SELECT * FROM users ORDER BY id`.each()) {
        names.push(user.name);
      }
      expect(names).toEqual(['Alice', 'Bob']);
    });
  });

  describe('SQL injection safety', () => {
    // why: the whole point of the tagged-template form is that interpolated values are always
    // bound parameters, never string-concatenated into the query text.
    it('treats an interpolated value as data, not as SQL', async () => {
      const db = await seededDb();
      const malicious = "'; DROP TABLE users; --";
      const users =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${malicious}`;
      expect(users).toEqual([]);
      const stillThere = await db.sql<IUser>`SELECT * FROM users ORDER BY id`;
      expect(stillThere).toHaveLength(2);
    });

    it('treats an OR 1=1 style payload as a literal string, not a tautology', async () => {
      const db = await seededDb();
      const malicious = "Alice' OR '1'='1";
      const users =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${malicious}`;
      expect(users).toEqual([]);
    });
  });

  // Cases below are ported from expo-sqlite's SQLiteTaggedQuery-test.ios.ts
  // (.vendors/expo @ origin/sdk-57) — coverage not already exercised above.
  describe('multiple bound parameters', () => {
    it('binds every interpolation independently', async () => {
      const db = await seededDb();
      const users =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${'Alice'} AND age = ${30}`;
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe('Alice');
    });

    it('supports a query with no interpolated parameters at all', async () => {
      const db = await seededDb();
      const users = await db.sql<IUser>`SELECT * FROM users ORDER BY age`;
      expect(users.map(u => u.name)).toEqual(['Bob', 'Alice']);
    });

    it('supports ORDER BY and LIMIT built from interpolated values', async () => {
      const db = await freshDb();
      await db.runAsync(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        'Alice',
        30,
      );
      await db.runAsync(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        'Bob',
        25,
      );
      await db.runAsync(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        'Charlie',
        35,
      );
      const minAge = 20;
      const limit = 2;
      const users =
        await db.sql<IUser>`SELECT * FROM users WHERE age > ${minAge} ORDER BY age DESC LIMIT ${limit}`;
      expect(users.map(u => u.name)).toEqual(['Charlie', 'Alice']);
    });
  });

  describe('mutations that return rows via RETURNING', () => {
    it('an UPDATE reports the affected row count', async () => {
      const db = await seededDb();
      const result =
        await db.sql`UPDATE users SET age = ${31} WHERE age = ${30}`;
      expect(result).toMatchObject({ changes: 1 });
      const updated =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${'Alice'}`.first();
      expect(updated?.age).toBe(31);
    });

    it('a DELETE reports the affected row count', async () => {
      const db = await seededDb();
      const result = await db.sql`DELETE FROM users WHERE age = ${30}`;
      expect(result).toMatchObject({ changes: 1 });
      const remaining = await db.sql<IUser>`SELECT * FROM users`;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.name).toBe('Bob');
    });

    it('an INSERT with RETURNING returns the inserted row, not run metadata', async () => {
      const db = await freshDb();
      const users =
        await db.sql<IUser>`INSERT INTO users (name, age) VALUES (${'Alice'}, ${30}) RETURNING *`;
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe('Alice');
      expect(users[0]?.id).toBeGreaterThan(0);
    });
  });

  describe('.each() with a bound parameter', () => {
    it('iterates only the matching rows', async () => {
      const db = await freshDb();
      await db.runAsync(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        'Alice',
        30,
      );
      await db.runAsync(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        'Bob',
        25,
      );
      await db.runAsync(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        'Charlie',
        35,
      );
      const minAge = 28;
      const names: string[] = [];
      for await (const user of db.sql<IUser>`SELECT * FROM users WHERE age > ${minAge}`.each()) {
        names.push(user.name);
      }
      expect(names).toEqual(['Alice', 'Charlie']);
    });

    it('yields nothing for an empty result set', async () => {
      const db = await seededDb();
      const users: IUser[] = [];
      for await (const user of db.sql<IUser>`SELECT * FROM users WHERE age = ${999}`.each()) {
        users.push(user);
      }
      expect(users).toHaveLength(0);
    });
  });

  it('an empty result set awaits to an empty array', async () => {
    const db = await seededDb();
    const users = await db.sql<IUser>`SELECT * FROM users WHERE age = ${999}`;
    expect(users).toEqual([]);
  });

  describe('synchronous variants', () => {
    it('.allSync() returns rows for a SELECT', async () => {
      const db = await seededDb();
      const users =
        db.sql<IUser>`SELECT * FROM users WHERE age = ${30}`.allSync();
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe('Alice');
    });

    it('.firstSync() returns the first matching row', async () => {
      const db = await seededDb();
      const user =
        db.sql<IUser>`SELECT * FROM users WHERE name = ${'Alice'}`.firstSync();
      expect(user?.age).toBe(30);
    });

    it('.allSync() returns ISQLiteRunResult for a mutation', async () => {
      const db = await freshDb();
      const result =
        db.sql`INSERT INTO users (name, age) VALUES (${'Alice'}, ${30})`.allSync();
      expect(result).toMatchObject({ changes: 1 });
    });

    it('.eachSync() iterates every matching row', async () => {
      const db = await seededDb();
      const names: string[] = [];
      for (const user of db.sql<IUser>`SELECT * FROM users ORDER BY age`.eachSync()) {
        names.push(user.name);
      }
      expect(names).toEqual(['Bob', 'Alice']);
    });

    it('.valuesSync() returns rows as arrays of values', async () => {
      const db = await seededDb();
      const rows =
        db.sql`SELECT name, age FROM users ORDER BY age`.valuesSync();
      expect(rows).toEqual([
        ['Bob', 25],
        ['Alice', 30],
      ]);
    });
  });

  describe('transactions', () => {
    it('commits every write made inside withTransactionAsync', async () => {
      const db = await freshDb();
      await db.withTransactionAsync(async () => {
        await db.sql`INSERT INTO users (name, age) VALUES (${'Alice'}, ${30})`;
        await db.sql`INSERT INTO users (name, age) VALUES (${'Bob'}, ${25})`;
      });
      const users = await db.sql<IUser>`SELECT * FROM users`;
      expect(users).toHaveLength(2);
    });

    it('rolls back every write when the transaction body throws', async () => {
      const db = await freshDb();
      await expect(
        db.withTransactionAsync(async () => {
          await db.sql`INSERT INTO users (name, age) VALUES (${'Alice'}, ${30})`;
          throw new Error('Intentional error');
        }),
      ).rejects.toThrow('Intentional error');
      const users = await db.sql<IUser>`SELECT * FROM users`;
      expect(users).toHaveLength(0);
    });

    it('commits every write made inside withTransactionSync', async () => {
      const db = await freshDb();
      db.withTransactionSync(() => {
        db.sql`INSERT INTO users (name, age) VALUES (${'Alice'}, ${30})`.allSync();
        db.sql`INSERT INTO users (name, age) VALUES (${'Bob'}, ${25})`.allSync();
      });
      const users = db.sql<IUser>`SELECT * FROM users`.allSync();
      expect(users).toHaveLength(2);
    });
  });

  describe('value edge cases', () => {
    it('round-trips a very long string', async () => {
      const db = await freshDb();
      const longString = 'A'.repeat(10_000);
      await db.sql`INSERT INTO users (name, age) VALUES (${longString}, ${25})`;
      const user = await db.sql<IUser>`SELECT * FROM users`.first();
      expect(user?.name).toBe(longString);
    });

    it('round-trips a large integer', async () => {
      const db = await freshDb();
      const largeNumber = 2_147_483_647;
      await db.sql`INSERT INTO users (name, age) VALUES (${'Test'}, ${largeNumber})`;
      const user = await db.sql<IUser>`SELECT * FROM users`.first();
      expect(user?.age).toBe(largeNumber);
    });

    it('round-trips an empty string', async () => {
      const db = await freshDb();
      await db.sql`INSERT INTO users (name, age) VALUES (${''}, ${25})`;
      const user =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${''}`.first();
      expect(user?.name).toBe('');
    });

    it('binds null through as SQL NULL', async () => {
      const db = await freshDb();
      await db.sql`INSERT INTO users (name, age) VALUES (${'Alice'}, ${null})`;
      const user =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${'Alice'}`.first();
      expect(user?.age).toBeNull();
    });

    it('binds undefined as SQL NULL', async () => {
      const db = await freshDb();
      await db.sql`INSERT INTO users (name, age) VALUES (${'Bob'}, ${undefined})`;
      const user =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${'Bob'}`.first();
      expect(user?.age).toBeNull();
    });

    it('round-trips an integer column value', async () => {
      const db = await freshDb();
      await db.sql`INSERT INTO test_data (value, intValue) VALUES (${'test'}, ${42})`;
      const data =
        await db.sql<ITestData>`SELECT * FROM test_data WHERE intValue = ${42}`.first();
      expect(data?.intValue).toBe(42);
    });

    it('round-trips a floating point column value', async () => {
      const db = await freshDb();
      const floatValue = 3.14159;
      await db.sql`INSERT INTO test_data (value, intValue) VALUES (${'test'}, ${floatValue})`;
      const data = await db.sql<ITestData>`SELECT * FROM test_data`.first();
      expect(data?.intValue).toBeCloseTo(3.14159, 5);
    });

    it('binds a boolean as 0/1', async () => {
      const db = await freshDb();
      await db.sql`INSERT INTO test_data (value, intValue) VALUES (${'test'}, ${true})`;
      const data = await db.sql<ITestData>`SELECT * FROM test_data`.first();
      expect(data?.intValue).toBe(1);
    });

    it('round-trips a Uint8Array blob value', async () => {
      const db = await freshDb();
      const blob = new Uint8Array([1, 2, 3, 4, 5]);
      await db.sql`INSERT INTO test_data (value, blobValue) VALUES (${'test'}, ${blob})`;
      const data = await db.sql<ITestData>`SELECT * FROM test_data`.first();
      expect(data?.blobValue).toBeInstanceOf(Uint8Array);
      expect(Array.from(data?.blobValue ?? [])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('special characters', () => {
    it('round-trips a single quote via bound parameters, never string concatenation', async () => {
      const db = await freshDb();
      const name = "O'Brien";
      await db.sql`INSERT INTO users (name, age) VALUES (${name}, ${42})`;
      const users =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${name}`;
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe("O'Brien");
    });

    it('round-trips double quotes and backslashes', async () => {
      const db = await freshDb();
      const name = 'Test "quoted" and \\backslash\\';
      await db.sql`INSERT INTO users (name, age) VALUES (${name}, ${25})`;
      const users =
        await db.sql<IUser>`SELECT * FROM users WHERE name = ${name}`;
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe(name);
    });
  });

  describe('error propagation', () => {
    it('rejects on invalid SQL syntax', async () => {
      const db = await freshDb();
      await expect(db.sql`INVALID SQL SYNTAX ${30}`).rejects.toThrow();
    });

    it('rejects when the table does not exist', async () => {
      const db = await freshDb();
      await expect(
        db.sql<IUser>`SELECT * FROM nonexistent_table WHERE name = ${'Alice'}`,
      ).rejects.toThrow();
    });
  });
});
