import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE } from './native-fakes';

vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));

const fromModule = vi.fn();
vi.mock('@symbiote-native/asset', () => ({ Asset: { fromModule } }));

const { importDatabaseFromAssetAsync } =
  await import('./import-database-from-asset');

afterEach(() => {
  vi.clearAllMocks();
});

describe('importDatabaseFromAssetAsync', () => {
  it('downloads the asset and imports its localUri at the resolved database path', async () => {
    const downloadAsync = vi.fn(async () => ({
      localUri: 'file:///cache/bundled.db',
    }));
    fromModule.mockReturnValueOnce({ downloadAsync });

    await importDatabaseFromAssetAsync('app.db', { assetId: 42 });

    expect(fromModule).toHaveBeenCalledWith(42);
    expect(FAKE_EXPO_SQLITE.importAssetDatabaseAsync).toHaveBeenCalledWith(
      '/fake-sqlite-directory/app.db',
      'file:///cache/bundled.db',
      false,
    );
  });

  it('forwards forceOverwrite', async () => {
    const downloadAsync = vi.fn(async () => ({
      localUri: 'file:///cache/bundled.db',
    }));
    fromModule.mockReturnValueOnce({ downloadAsync });

    await importDatabaseFromAssetAsync('app.db', {
      assetId: 42,
      forceOverwrite: true,
    });

    expect(FAKE_EXPO_SQLITE.importAssetDatabaseAsync).toHaveBeenCalledWith(
      '/fake-sqlite-directory/app.db',
      'file:///cache/bundled.db',
      true,
    );
  });

  it('rejects when the downloaded asset has no localUri', async () => {
    const downloadAsync = vi.fn(async () => ({ localUri: null }));
    fromModule.mockReturnValueOnce({ downloadAsync });

    await expect(
      importDatabaseFromAssetAsync('app.db', { assetId: 42 }),
    ).rejects.toThrow('Unable to get the localUri from asset 42');
    expect(FAKE_EXPO_SQLITE.importAssetDatabaseAsync).not.toHaveBeenCalled();
  });
});
