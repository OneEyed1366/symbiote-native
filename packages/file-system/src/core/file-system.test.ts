import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny fake native module — addListener captures the listener per event name so a test can
// fire it directly, mirroring how native invokes upload/download progress events.
function createFakeNativeFileSystem() {
  const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
  return {
    documentDirectory: 'file:///doc',
    cacheDirectory: 'file:///cache',
    bundleDirectory: 'file:///bundle',
    getInfoAsync: vi.fn(async (uri: string) => ({
      exists: true,
      uri,
      size: 10,
      isDirectory: false,
      modificationTime: 123,
    })),
    readAsStringAsync: vi.fn(async () => 'contents'),
    getContentUriAsync: vi.fn(async (uri: string) => `content://${uri}`),
    writeAsStringAsync: vi.fn(async () => undefined),
    deleteAsync: vi.fn(async () => undefined),
    moveAsync: vi.fn(async () => undefined),
    copyAsync: vi.fn(async () => undefined),
    makeDirectoryAsync: vi.fn(async () => undefined),
    readDirectoryAsync: vi.fn(async () => ['a.txt', 'b.txt']),
    getFreeDiskStorageAsync: vi.fn(async () => 1_000_000),
    getTotalDiskCapacityAsync: vi.fn(async () => 10_000_000),
    downloadAsync: vi.fn(async (_uri: string, fileUri: string) => ({
      uri: fileUri,
      status: 200,
      headers: {},
      mimeType: 'text/plain',
    })),
    uploadAsync: vi.fn(async () => ({
      status: 200,
      headers: {},
      mimeType: null,
      body: 'ok',
    })),
    networkTaskCancelAsync: vi.fn(async () => undefined),
    addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
      listeners[eventName] = cb;
      return { remove: vi.fn() };
    }),
    uploadTaskStartAsync: vi.fn(async () => ({
      status: 200,
      headers: {},
      mimeType: null,
      body: 'ok',
    })),
    downloadResumableStartAsync: vi.fn(
      async (_url: string, fileUri: string) => ({
        uri: fileUri,
        status: 200,
        headers: {},
        mimeType: null,
      }),
    ),
    downloadResumablePauseAsync: vi.fn(async () => ({
      resumeData: 'resume-token',
    })),
    requestDirectoryPermissionsAsync: vi.fn(async () => ({
      granted: true,
      directoryUri: 'content://tree/x',
    })),
    readSAFDirectoryAsync: vi.fn(async () => ['content://a']),
    makeSAFDirectoryAsync: vi.fn(async () => 'content://new-dir'),
    createSAFFileAsync: vi.fn(async () => 'content://new-file'),
    // Test-only escape hatch to simulate native firing a subscribed progress event.
    fireEvent(eventName: string, event: unknown) {
      listeners[eventName]?.(event);
    },
  };
}

const FAKE_NATIVE_FILE_SYSTEM = createFakeNativeFileSystem();
const mockPlatform = { OS: 'ios' as 'ios' | 'android' };

// The real ExponentFileSystem native module only exists on device — resolving it via
// requireOptionalNativeModule() at import time would throw in this headless test run, same
// pattern packages/media-library/src/core/media-library.test.ts uses.
vi.mock('./native-module', () => ({
  expoFileSystem: FAKE_NATIVE_FILE_SYSTEM,
}));

// expo-modules-core's real entry transitively imports 'react-native' for TurboModuleRegistry,
// whose Flow-typed source Vitest's Oxc transform can't parse — stub the two runtime helpers
// file-system.ts actually reaches for.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(
        `The method or property ${moduleName}.${propertyName} is not available`,
      );
    }
  },
  uuid: { v4: () => 'test-uuid' },
}));

// file-system.ts reads Platform.OS, which only 'react-native' declares.
vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

const {
  documentDirectory,
  cacheDirectory,
  bundleDirectory,
  getInfoAsync,
  readAsStringAsync,
  getContentUriAsync,
  writeAsStringAsync,
  deleteAsync,
  moveAsync,
  copyAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
  getFreeDiskStorageAsync,
  getTotalDiskCapacityAsync,
  downloadAsync,
  uploadAsync,
  createDownloadResumable,
  createUploadTask,
  StorageAccessFramework,
} = await import('./file-system');

beforeEach(() => {
  mockPlatform.OS = 'ios';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('directory constants', () => {
  it('normalizes each directory URI with a trailing slash', () => {
    expect(documentDirectory).toBe('file:///doc/');
    expect(cacheDirectory).toBe('file:///cache/');
    expect(bundleDirectory).toBe('file:///bundle/');
  });
});

describe('getInfoAsync', () => {
  it('forwards to the native module and returns its result', async () => {
    const info = await getInfoAsync('file:///doc/a.txt');
    expect(FAKE_NATIVE_FILE_SYSTEM.getInfoAsync).toHaveBeenCalledWith(
      'file:///doc/a.txt',
      {},
    );
    expect(info).toMatchObject({ exists: true, size: 10 });
  });
});

describe('readAsStringAsync / writeAsStringAsync', () => {
  it('reads a file as a string', async () => {
    const contents = await readAsStringAsync('file:///doc/a.txt');
    expect(contents).toBe('contents');
  });

  it('writes a file with the given options', async () => {
    await writeAsStringAsync('file:///doc/a.txt', 'hello', { append: true });
    expect(FAKE_NATIVE_FILE_SYSTEM.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///doc/a.txt',
      'hello',
      {
        append: true,
      },
    );
  });
});

describe('getContentUriAsync', () => {
  it('resolves through the native module on android', async () => {
    mockPlatform.OS = 'android';
    const uri = await getContentUriAsync('file:///doc/a.txt');
    expect(uri).toBe('content://file:///doc/a.txt');
  });

  it('echoes the input URI unchanged on ios', async () => {
    mockPlatform.OS = 'ios';
    const uri = await getContentUriAsync('file:///doc/a.txt');
    expect(uri).toBe('file:///doc/a.txt');
    expect(FAKE_NATIVE_FILE_SYSTEM.getContentUriAsync).not.toHaveBeenCalled();
  });
});

describe('deleteAsync / moveAsync / copyAsync / makeDirectoryAsync / readDirectoryAsync', () => {
  it('deletes a file with the given options', async () => {
    await deleteAsync('file:///doc/a.txt', { idempotent: true });
    expect(FAKE_NATIVE_FILE_SYSTEM.deleteAsync).toHaveBeenCalledWith(
      'file:///doc/a.txt',
      { idempotent: true },
    );
  });

  it('moves and copies via a from/to options object', async () => {
    await moveAsync({ from: 'file:///doc/a.txt', to: 'file:///doc/b.txt' });
    await copyAsync({ from: 'file:///doc/b.txt', to: 'file:///doc/c.txt' });
    expect(FAKE_NATIVE_FILE_SYSTEM.moveAsync).toHaveBeenCalledWith({
      from: 'file:///doc/a.txt',
      to: 'file:///doc/b.txt',
    });
    expect(FAKE_NATIVE_FILE_SYSTEM.copyAsync).toHaveBeenCalledWith({
      from: 'file:///doc/b.txt',
      to: 'file:///doc/c.txt',
    });
  });

  it('creates a directory and lists its contents', async () => {
    await makeDirectoryAsync('file:///doc/sub', { intermediates: true });
    const entries = await readDirectoryAsync('file:///doc/sub');
    expect(entries).toEqual(['a.txt', 'b.txt']);
  });
});

describe('disk space queries', () => {
  it('returns free and total disk storage in bytes', async () => {
    await expect(getFreeDiskStorageAsync()).resolves.toBe(1_000_000);
    await expect(getTotalDiskCapacityAsync()).resolves.toBe(10_000_000);
  });
});

describe('downloadAsync / uploadAsync', () => {
  it('defaults the download session to background', async () => {
    await downloadAsync('https://example.com/f.bin', 'file:///doc/f.bin');
    expect(FAKE_NATIVE_FILE_SYSTEM.downloadAsync).toHaveBeenCalledWith(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
      expect.objectContaining({ sessionType: 0 }),
    );
  });

  it('uppercases a lowercase httpMethod and defaults the upload type', async () => {
    await uploadAsync('https://example.com/upload', 'file:///doc/f.bin', {
      httpMethod: 'put' as 'PUT',
    });
    expect(FAKE_NATIVE_FILE_SYSTEM.uploadAsync).toHaveBeenCalledWith(
      'https://example.com/upload',
      'file:///doc/f.bin',
      expect.objectContaining({ httpMethod: 'PUT', uploadType: 0 }),
    );
  });
});

describe('DownloadResumable', () => {
  it('reports download progress events matching its own uuid', async () => {
    const progressUpdates: number[] = [];
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
      undefined,
      data => progressUpdates.push(data.totalBytesWritten),
    );

    const downloadPromise = resumable.downloadAsync();
    FAKE_NATIVE_FILE_SYSTEM.fireEvent('expo-file-system.downloadProgress', {
      uuid: 'test-uuid',
      data: { totalBytesWritten: 50, totalBytesExpectedToWrite: 100 },
    });
    await downloadPromise;

    expect(progressUpdates).toEqual([50]);
  });

  it('pauses and returns a savable state carrying the resume token', async () => {
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
    );
    const paused = await resumable.pauseAsync();
    expect(paused).toEqual({
      url: 'https://example.com/f.bin',
      fileUri: 'file:///doc/f.bin',
      options: {},
      resumeData: 'resume-token',
    });
  });

  it('rejects further work after cancelAsync', async () => {
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
    );
    await resumable.cancelAsync();
    await expect(resumable.downloadAsync()).resolves.toBeUndefined();
    expect(
      FAKE_NATIVE_FILE_SYSTEM.downloadResumableStartAsync,
    ).not.toHaveBeenCalled();
  });

  it('warns instead of throwing when work is attempted after cancelAsync', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
    );
    await resumable.cancelAsync();
    await resumable.downloadAsync();
    expect(warnSpy).toHaveBeenCalledWith('This task was already canceled.');
    warnSpy.mockRestore();
  });

  it('downloads with the uuid, options, and resumeData passed at construction', async () => {
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
      { headers: { Authorization: 'Bearer x' } },
      undefined,
      'seed-resume-data',
    );
    await resumable.downloadAsync();
    expect(
      FAKE_NATIVE_FILE_SYSTEM.downloadResumableStartAsync,
    ).toHaveBeenCalledWith(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
      'test-uuid',
      { headers: { Authorization: 'Bearer x' } },
      'seed-resume-data',
    );
  });

  it('resumeAsync forwards the same uuid, options, and current resumeData', async () => {
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
    );
    await resumable.resumeAsync();
    expect(
      FAKE_NATIVE_FILE_SYSTEM.downloadResumableStartAsync,
    ).toHaveBeenCalledWith(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
      'test-uuid',
      {},
      undefined,
    );
  });

  it('savable() reports the constructor-seeded state before any pause', () => {
    const resumable = createDownloadResumable(
      'https://example.com/f.bin',
      'file:///doc/f.bin',
      {},
      undefined,
      'seed-resume-data',
    );
    expect(resumable.savable()).toEqual({
      url: 'https://example.com/f.bin',
      fileUri: 'file:///doc/f.bin',
      options: {},
      resumeData: 'seed-resume-data',
    });
  });
});

describe('UploadTask', () => {
  it('starts the upload with a normalized POST default', async () => {
    const task = createUploadTask(
      'https://example.com/upload',
      'file:///doc/f.bin',
    );
    await task.uploadAsync();
    expect(FAKE_NATIVE_FILE_SYSTEM.uploadTaskStartAsync).toHaveBeenCalledWith(
      'https://example.com/upload',
      'file:///doc/f.bin',
      'test-uuid',
      expect.objectContaining({ httpMethod: 'POST' }),
    );
  });
});

describe('StorageAccessFramework', () => {
  it('builds a root-folder URI without touching native', () => {
    const uri = StorageAccessFramework.getUriForDirectoryInRoot('Pictures');
    expect(uri).toContain('primary:Pictures');
    expect(
      FAKE_NATIVE_FILE_SYSTEM.requestDirectoryPermissionsAsync,
    ).not.toHaveBeenCalled();
  });

  it('requests directory permissions and reads/creates through SAF-specific natives', async () => {
    const permissions =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    expect(permissions).toEqual({
      granted: true,
      directoryUri: 'content://tree/x',
    });

    const entries =
      await StorageAccessFramework.readDirectoryAsync('content://tree/x');
    expect(entries).toEqual(['content://a']);

    const dirUri = await StorageAccessFramework.makeDirectoryAsync(
      'content://tree/x',
      'NewDir',
    );
    expect(dirUri).toBe('content://new-dir');

    const fileUri = await StorageAccessFramework.createFileAsync(
      'content://tree/x',
      'note',
      'text/plain',
    );
    expect(fileUri).toBe('content://new-file');
  });

  it('aliases the base read/write/delete/move/copy functions verbatim', () => {
    expect(StorageAccessFramework.writeAsStringAsync).toBe(writeAsStringAsync);
    expect(StorageAccessFramework.readAsStringAsync).toBe(readAsStringAsync);
    expect(StorageAccessFramework.deleteAsync).toBe(deleteAsync);
    expect(StorageAccessFramework.moveAsync).toBe(moveAsync);
    expect(StorageAccessFramework.copyAsync).toBe(copyAsync);
  });
});
