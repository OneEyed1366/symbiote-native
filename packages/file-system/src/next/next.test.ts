import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake base classes standing in for the native SharedObject-backed constructors
// (`expoFileSystemNext.FileSystemFile`/`FileSystemDirectory`/...). `File`/`Directory` extend
// these directly (`class File extends expoFileSystemNext.FileSystemFile`), so the fakes must be
// real ES classes a subclass can `super()` into — a plain object mock (this repo's usual
// `vi.mock('./native-module', () => ({ ... }))` pattern) cannot stand in for an `extends` target.
// First instance of this shape in the repo; see the package README's "Modern API" section.

const filesByUri = new Map<string, { content: string; exists: boolean }>();

function record(uri: string) {
  let entry = filesByUri.get(uri);
  if (!entry) {
    entry = { content: '', exists: false };
    filesByUri.set(uri, entry);
  }
  return entry;
}

class FakeFileSystemFile {
  uri: string;
  md5: string | null = null;
  modificationTime: number | null = 111;
  lastModified: number | null = 111;
  creationTime: number | null = 100;
  type = 'text/plain';
  contentUri = 'content://fake';

  constructor(...uris: (string | { uri: string })[]) {
    const [first] = uris;
    this.uri = typeof first === 'string' ? first : (first?.uri ?? '');
  }

  validatePath() {}

  get exists() {
    return record(this.uri).exists;
  }

  get size() {
    return record(this.uri).content.length;
  }

  async text() {
    return this.textSync();
  }

  textSync() {
    return record(this.uri).content;
  }

  async base64() {
    return this.base64Sync();
  }

  base64Sync() {
    return `base64:${record(this.uri).content}`;
  }

  async bytes() {
    return this.bytesSync();
  }

  bytesSync() {
    return new TextEncoder().encode(record(this.uri).content);
  }

  write(content: string | Uint8Array) {
    const entry = record(this.uri);
    entry.content =
      typeof content === 'string' ? content : new TextDecoder().decode(content);
    entry.exists = true;
  }

  delete() {
    record(this.uri).exists = false;
  }

  info() {
    const entry = record(this.uri);
    return { exists: entry.exists, uri: this.uri, size: entry.content.length };
  }

  create() {
    record(this.uri).exists = true;
  }

  async copy(destination: { uri: string }) {
    this.copySync(destination);
  }

  copySync(destination: { uri: string }) {
    record(destination.uri).content = record(this.uri).content;
    record(destination.uri).exists = true;
  }

  async move(destination: { uri: string }) {
    this.moveSync(destination);
  }

  moveSync(destination: { uri: string }) {
    this.copySync(destination);
    this.delete();
    this.uri = destination.uri;
  }

  rename(newName: string) {
    const parts = this.uri.split('/');
    parts[parts.length - 1] = newName;
    this.moveSync({ uri: parts.join('/') });
  }

  open() {
    // Object-literal getters below run with `this` bound to the returned object, not the class
    // instance, so an arrow function can't reach it either — aliasing is the only way in.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    let offset = 0;
    return {
      get offset() {
        return offset;
      },
      set offset(value: number) {
        offset = value;
      },
      get size() {
        return record(self.uri).content.length;
      },
      close: vi.fn(),
      readBytes: (length: number) => {
        const bytes = new TextEncoder()
          .encode(record(self.uri).content)
          .slice(offset, offset + length);
        offset += bytes.length;
        return bytes;
      },
      writeBytes: (bytes: Uint8Array) => {
        const entry = record(self.uri);
        entry.content += new TextDecoder().decode(bytes);
        entry.exists = true;
      },
    };
  }
}

class FakeFileSystemDirectory {
  uri: string;

  constructor(...uris: (string | { uri: string })[]) {
    const [first] = uris;
    this.uri = typeof first === 'string' ? first : (first?.uri ?? '');
  }

  validatePath() {}

  get exists() {
    return true;
  }

  get size() {
    return null;
  }

  delete() {}

  create() {}

  createFile(name: string, _mimeType: string | null) {
    return new FakeFileSystemFile(`${this.uri}/${name}`);
  }

  createDirectory(name: string) {
    return new FakeFileSystemDirectory(`${this.uri}/${name}`);
  }

  listAsRecords() {
    return DIRECTORY_LISTINGS.get(this.uri) ?? [];
  }

  info() {
    return { exists: true, uri: this.uri };
  }

  async copy() {}
  copySync() {}
  async move() {}
  moveSync() {}
  rename() {}
}

const DIRECTORY_LISTINGS = new Map<
  string,
  { isDirectory: boolean; uri: string }[]
>();

// Both task fakes push themselves into a module-level array on construction, mirroring how the
// upstream jest suite spies on `ExpoFileSystem.FileSystemUploadTask.prototype` — since our fakes
// keep native behavior on per-instance fields (not the prototype), a test recovers the specific
// native instance a `UploadTask`/`DownloadTask` just constructed and overrides its behavior there.
const uploadTaskInstances: FakeFileSystemUploadTask[] = [];
const downloadTaskInstances: FakeFileSystemDownloadTask[] = [];

class FakeFileSystemUploadTask {
  private listeners: ((data: {
    bytesSent: number;
    totalBytes: number;
  }) => void)[] = [];
  start = vi.fn(async () => ({ status: 200, headers: {}, body: 'ok' }));
  cancel = vi.fn();
  release = vi.fn();
  constructor() {
    uploadTaskInstances.push(this);
  }
  addListener(
    _eventName: 'progress',
    listener: (data: { bytesSent: number; totalBytes: number }) => void,
  ) {
    this.listeners.push(listener);
    return { remove: vi.fn() };
  }
}

class FakeFileSystemDownloadTask {
  paused = false;

  // Yields to the microtask queue before resolving, mirroring the real native task's async
  // boundary — a test can call `pause()` right after `downloadAsync()` (before awaiting it) and
  // have it take effect, the same way a real in-flight native download can be interrupted.
  start = vi.fn(async (_url: string, to: { uri: string }) => {
    await Promise.resolve();
    if (this.paused) {
      this.paused = false;
      return null;
    }
    record(to.uri).content = 'downloaded';
    record(to.uri).exists = true;
    return to.uri;
  });
  pause = vi.fn(async () => {
    this.paused = true;
    return { resumeData: 'resume-token' };
  });
  resume = vi.fn(async (_url: string, to: { uri: string }) => {
    record(to.uri).content = 'resumed';
    record(to.uri).exists = true;
    return to.uri;
  });
  cancel = vi.fn();
  release = vi.fn();
  constructor() {
    downloadTaskInstances.push(this);
  }
  addListener() {
    return { remove: vi.fn() };
  }
}

const watcherListeners: Record<string, ((event: unknown) => void) | undefined> =
  {};
// Records each native watcher's constructor args and the listen-then-start call order, mirroring
// upstream's `native.FileSystemWatcher = jest.fn().mockImplementation(...)` spy shape.
const watcherConstructions: { path: string; options: unknown }[] = [];
let watcherCallOrder: string[] = [];

class FakeFileSystemWatcher {
  constructor(
    public path: string,
    public options?: unknown,
  ) {
    watcherConstructions.push({ path, options });
  }
  start = vi.fn(() => {
    watcherCallOrder.push('start');
  });
  stop = vi.fn();
  addListener(_eventName: 'change', listener: (event: unknown) => void) {
    watcherCallOrder.push('listen');
    watcherListeners[this.path] = listener;
    return { remove: vi.fn() };
  }
}

const FAKE_MODULE = {
  FileSystemFile: FakeFileSystemFile,
  FileSystemDirectory: FakeFileSystemDirectory,
  FileSystemUploadTask: FakeFileSystemUploadTask,
  FileSystemDownloadTask: FakeFileSystemDownloadTask,
  FileSystemWatcher: FakeFileSystemWatcher,
  documentDirectory: 'file:///doc',
  cacheDirectory: 'file:///cache',
  bundleDirectory: 'file:///bundle',
  appleSharedContainers: { 'group.test': 'file:///shared' },
  totalDiskSpace: 10_000_000,
  availableDiskSpace: 1_000_000,
  info: vi.fn((uri: string) => ({
    exists: true,
    isDirectory: uri.endsWith('/'),
  })),
  // Real native progress arrives through the 'downloadProgress' EVENT (via addListener below),
  // never by calling `options.onProgress` directly — File.ts's own synthetic-final-progress
  // fallback is what the "reports progress" test below actually exercises.
  downloadFileAsync: vi.fn(
    async (_url: string, destination: { uri: string }) => {
      const targetUri = destination.uri.endsWith('/')
        ? `${destination.uri}downloaded.bin`
        : destination.uri;
      record(targetUri).content = 'downloaded-bytes';
      record(targetUri).exists = true;
      return targetUri;
    },
  ),
  cancelDownloadAsync: vi.fn(),
  pickDirectoryAsync: vi.fn(async (initialUri?: string) => ({
    uri: initialUri ?? 'file:///picked-dir',
  })),
  pickFileAsync: vi.fn(),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

vi.mock('./native-module', () => ({
  expoFileSystemNext: FAKE_MODULE,
}));

vi.mock('expo-modules-core', () => ({
  uuid: { v4: () => 'test-uuid' },
}));

const { File } = await import('./file');
const { Directory } = await import('./directory');
const { Paths } = await import('./paths');
const { UploadTask, DownloadTask } = await import('./network-tasks');
const { DEFAULT_WATCH_DEBOUNCE_MS } = await import('./types');

beforeEach(() => {
  filesByUri.clear();
  DIRECTORY_LISTINGS.clear();
  uploadTaskInstances.length = 0;
  downloadTaskInstances.length = 0;
  watcherConstructions.length = 0;
  watcherCallOrder = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('File construction and paths', () => {
  it('joins constructor arguments into a single uri', () => {
    const file = new File(Paths.document, 'sub', 'note.txt');
    expect(file.uri).toBe('file:///doc/sub/note.txt');
  });

  it('derives parentDirectory, name, and extension from the uri', () => {
    const file = new File('file:///doc/sub/note.txt');
    expect(file.parentDirectory.uri).toBe('file:///doc/sub');
    expect(file.name).toBe('note.txt');
    expect(file.extension).toBe('.txt');
  });
});

describe('File read/write', () => {
  it('writes and reads back text content', async () => {
    const file = new File(Paths.document, 'note.txt');
    file.write('hello world');
    expect(file.exists).toBe(true);
    expect(file.textSync()).toBe('hello world');
    await expect(file.text()).resolves.toBe('hello world');
  });

  it('round-trips bytes through a FileHandle-backed readable/writable stream', async () => {
    const file = new File(Paths.document, 'stream.txt');
    file.write('abc');

    const reader = file.readableStream().getReader() as unknown as {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
    };
    const chunks: number[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(...value);
    }
    expect(new TextDecoder().decode(new Uint8Array(chunks))).toBe('abc');
  });
});

describe('File.json / arrayBuffer / formData / slice', () => {
  it('json() parses the file text as JSON', async () => {
    const file = new File(Paths.document, 'data.json');
    file.write('{"hello":"world"}');
    await expect(file.json()).resolves.toEqual({ hello: 'world' });
  });

  it('arrayBuffer() returns the file bytes as an ArrayBuffer', async () => {
    const file = new File(Paths.document, 'bin.dat');
    file.write(new Uint8Array([1, 2, 3]));
    const buffer = await file.arrayBuffer();
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);
  });

  it('formData() builds a Response from arrayBuffer, tagged with the file type', async () => {
    const file = new File(Paths.document, 'form.txt');
    file.write('irrelevant');
    Object.defineProperty(file, 'type', {
      configurable: true,
      get: () => 'multipart/form-data; boundary=x',
    });

    const formData = new FormData();
    const responseFormData = vi.fn(async () => formData);
    const ResponseSpy = vi.fn(function FakeResponse() {
      return { formData: responseFormData };
    });
    const OriginalResponse = global.Response;
    global.Response = ResponseSpy as unknown as typeof Response;

    try {
      await expect(file.formData()).resolves.toBe(formData);
    } finally {
      global.Response = OriginalResponse;
    }

    expect(ResponseSpy).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
    });
  });

  it('slice() returns a Blob honoring the given content type', () => {
    const file = new File(Paths.document, 'slice.txt');
    file.write('hello world');
    const blob = file.slice(0, 5, 'text/plain');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
  });
});

describe('File.pickFileAsync', () => {
  it('options API resolves { result, canceled: false } on a selection', async () => {
    FAKE_MODULE.pickFileAsync.mockResolvedValueOnce({
      uri: 'file:///picked/a.txt',
    });
    const outcome = await File.pickFileAsync({});
    expect(outcome).toEqual({
      result: expect.any(File),
      canceled: false,
    });
  });

  it('options API resolves { result: null, canceled: true } when the user cancels', async () => {
    FAKE_MODULE.pickFileAsync.mockRejectedValueOnce(new Error('cancelled'));
    await expect(File.pickFileAsync({})).resolves.toEqual({
      result: null,
      canceled: true,
    });
  });

  it('old string-arg API resolves a bare File, not the options-object wrapper', async () => {
    FAKE_MODULE.pickFileAsync.mockResolvedValueOnce({
      uri: 'file:///picked/a.txt',
    });
    const file = await File.pickFileAsync('file:///doc');
    expect(file).toBeInstanceOf(File);
  });

  it('old string-arg API rethrows on cancel instead of returning a sentinel', async () => {
    FAKE_MODULE.pickFileAsync.mockRejectedValueOnce(new Error('cancelled'));
    await expect(File.pickFileAsync('file:///doc')).rejects.toThrow(
      'cancelled',
    );
  });

  it('multipleFiles: true maps every native result to a File instance', async () => {
    FAKE_MODULE.pickFileAsync.mockResolvedValueOnce([
      { uri: 'file:///a' },
      { uri: 'file:///b' },
    ]);
    const outcome = await File.pickFileAsync({ multipleFiles: true });
    if (outcome.canceled) throw new Error('expected a successful pick');
    expect(outcome.result).toHaveLength(2);
    expect(outcome.result[0]).toBeInstanceOf(File);
    expect(outcome.result[1].uri).toBe('file:///b');
  });
});

describe('Directory.pickDirectoryAsync', () => {
  it('resolves the native picked uri as a Directory instance', async () => {
    const dir = await Directory.pickDirectoryAsync('file:///start');
    expect(dir).toBeInstanceOf(Directory);
    expect(dir.uri).toBe('file:///start');
    expect(FAKE_MODULE.pickDirectoryAsync).toHaveBeenCalledWith(
      'file:///start',
    );
  });
});

describe('Directory listing', () => {
  it('wraps native records into File/Directory instances', () => {
    const dir = new Directory(Paths.document, 'album');
    DIRECTORY_LISTINGS.set(dir.uri, [
      { isDirectory: false, uri: `${dir.uri}/a.txt` },
      { isDirectory: true, uri: `${dir.uri}/sub` },
    ]);

    const entries = dir.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toBeInstanceOf(File);
    expect(entries[1]).toBeInstanceOf(Directory);
  });

  it('creates a file and a sub-directory scoped under itself', () => {
    const dir = new Directory(Paths.cache, 'work');
    const file = dir.createFile('a.txt', 'text/plain');
    const sub = dir.createDirectory('nested');
    expect(file).toBeInstanceOf(File);
    expect(file.uri).toBe(`${dir.uri}/a.txt`);
    expect(sub).toBeInstanceOf(Directory);
    expect(sub.uri).toBe(`${dir.uri}/nested`);
  });
});

describe('watch()', () => {
  it('reports created/modified/deleted/renamed events targeting a File instance', () => {
    const file = new File(Paths.document, 'watched.txt');
    const events: string[] = [];
    file.watch(event => events.push(event.type));

    watcherListeners[file.uri]?.({
      type: 'modified',
      path: file.uri,
      isDirectory: false,
    });
    expect(events).toEqual(['modified']);
  });

  it('auto-stops the subscription when the watched target is deleted', () => {
    const file = new File(Paths.document, 'watched2.txt');
    const subscription = file.watch(() => {});
    const removeSpy = vi.spyOn(subscription, 'remove');

    watcherListeners[file.uri]?.({
      type: 'deleted',
      path: file.uri,
      isDirectory: false,
    });
    expect(removeSpy).toHaveBeenCalled();
  });

  it('constructs the native watcher with the default debounce and starts after listening', () => {
    const file = new File(Paths.document, 'ordered.txt');
    file.watch(() => {});

    expect(watcherConstructions.at(-1)).toEqual({
      path: file.uri,
      options: { debounce: DEFAULT_WATCH_DEBOUNCE_MS, events: undefined },
    });
    expect(watcherCallOrder).toEqual(['listen', 'start']);
  });

  it('filters events not in the requested list, and maps newTarget/nativeEventFlags for the rest', () => {
    const file = new File(Paths.document, 'filtered.txt');
    const callback = vi.fn();
    file.watch(callback, { events: ['renamed'] });

    watcherListeners[file.uri]?.({
      type: 'modified',
      path: file.uri,
      isDirectory: false,
    });
    expect(callback).not.toHaveBeenCalled();

    watcherListeners[file.uri]?.({
      type: 'renamed',
      path: file.uri,
      isDirectory: false,
      newPath: 'file:///doc/renamed.txt',
      newPathIsDirectory: false,
      nativeEventFlags: 42,
    });

    expect(callback).toHaveBeenCalledTimes(1);
    const event = callback.mock.calls[0][0];
    expect(event.target).toBeInstanceOf(File);
    expect(event.newTarget).toBeInstanceOf(File);
    expect(event.newTarget.uri).toBe('file:///doc/renamed.txt');
    expect(event.nativeEventFlags).toBe(42);
  });

  it('auto-removes even when deleted events are filtered out of the callback', () => {
    const file = new File(Paths.document, 'del-filtered.txt');
    const callback = vi.fn();
    const subscription = file.watch(callback, { events: ['modified'] });
    const removeSpy = vi.spyOn(subscription, 'remove');

    watcherListeners[file.uri]?.({
      type: 'deleted',
      path: file.uri,
      isDirectory: false,
    });

    expect(callback).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('Directory.watch targets a Directory instance', () => {
    const dir = new Directory(Paths.document, 'watched-dir');
    const events: unknown[] = [];
    dir.watch(event => events.push(event));

    watcherListeners[dir.uri]?.({
      type: 'modified',
      path: dir.uri,
      isDirectory: true,
    });

    expect(events).toHaveLength(1);
    expect((events[0] as { target: unknown }).target).toBeInstanceOf(Directory);
  });
});

describe('Paths', () => {
  it('exposes the well-known directories as Directory instances', () => {
    expect(Paths.document).toBeInstanceOf(Directory);
    expect(Paths.document.uri).toBe('file:///doc');
    expect(Paths.cache.uri).toBe('file:///cache');
    expect(Paths.bundle.uri).toBe('file:///bundle');
  });

  it('exposes disk space and apple shared containers', () => {
    expect(Paths.totalDiskSpace).toBe(10_000_000);
    expect(Paths.availableDiskSpace).toBe(1_000_000);
    expect(Paths.appleSharedContainers['group.test']).toBeInstanceOf(Directory);
  });

  it('inherits path-utility statics (join/dirname/basename/extname)', () => {
    expect(Paths.join('file:///doc', 'a', 'b.txt')).toBe('file:///doc/a/b.txt');
    expect(Paths.dirname('file:///doc/a/b.txt')).toBe('file:///doc/a');
    expect(Paths.basename('file:///doc/a/b.txt')).toBe('b.txt');
    expect(Paths.extname('file:///doc/a/b.txt')).toBe('.txt');
  });

  it('info() joins its uri arguments and forwards to the native module', () => {
    const info = Paths.info('file:///doc', 'sub', 'a.txt');
    expect(FAKE_MODULE.info).toHaveBeenCalledWith('file:///doc/sub/a.txt');
    expect(info).toEqual({ exists: true, isDirectory: false });
  });
});

describe('File.downloadFileAsync', () => {
  it('reports progress and resolves to the downloaded File', async () => {
    const progress: number[] = [];
    const file = await File.downloadFileAsync(
      'https://example.com/f.bin',
      Paths.cache,
      {
        onProgress: data => progress.push(data.bytesWritten),
      },
    );
    expect(file).toBeInstanceOf(File);
    expect(progress).toEqual([16]);
  });
});

describe('UploadTask', () => {
  it('starts idle, moves to completed, and rejects a second start', async () => {
    const file = new File(Paths.document, 'upload.bin');
    file.write('payload');
    const task = new UploadTask(file, 'https://example.com/upload');

    expect(task.state).toBe('idle');
    await task.uploadAsync();
    expect(task.state).toBe('completed');
    await expect(task.uploadAsync()).rejects.toThrow(/completed/);
  });

  it('uploadAsync() throws while already active', async () => {
    const file = new File(Paths.document, 'upload2.bin');
    const task = new UploadTask(file, 'https://example.com/upload');
    const first = task.uploadAsync();
    await expect(task.uploadAsync()).rejects.toThrow(
      'Cannot call uploadAsync() in state "active"',
    );
    await first;
  });

  it('transitions to error and re-throws on a native failure', async () => {
    const file = new File(Paths.document, 'upload3.bin');
    const task = new UploadTask(file, 'https://example.com/upload');
    uploadTaskInstances.at(-1)!.start = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'));

    await expect(task.uploadAsync()).rejects.toThrow('network error');
    expect(task.state).toBe('error');
  });

  it('cancel() is a no-op once the task reaches a terminal state', async () => {
    const file = new File(Paths.document, 'upload4.bin');
    const task = new UploadTask(file, 'https://example.com/upload');
    await task.uploadAsync();
    expect(task.state).toBe('completed');

    task.cancel();
    expect(task.state).toBe('completed');
    expect(uploadTaskInstances.at(-1)!.cancel).not.toHaveBeenCalled();
  });

  it('cancel() moves an active task to cancelled and calls the native cancel', async () => {
    const file = new File(Paths.document, 'upload5.bin');
    const task = new UploadTask(file, 'https://example.com/upload');
    const pending = task.uploadAsync().catch(() => {});
    expect(task.state).toBe('active');

    task.cancel();
    expect(task.state).toBe('cancelled');
    expect(uploadTaskInstances.at(-1)!.cancel).toHaveBeenCalledTimes(1);
    await pending;
  });

  it('wires onProgress via addListener("progress", ...)', async () => {
    const onProgress = vi.fn();
    const file = new File(Paths.document, 'upload6.bin');
    const task = new UploadTask(file, 'https://example.com/upload', {
      onProgress,
    });
    const addListenerSpy = vi.spyOn(task, 'addListener');

    await task.uploadAsync();

    expect(addListenerSpy).toHaveBeenCalledWith('progress', onProgress);
  });
});

describe('DownloadTask', () => {
  it('supports pause/resume and reports a savable state while paused', async () => {
    const destination = new File(Paths.cache, 'video.mp4');
    const task = new DownloadTask('https://example.com/video.mp4', destination);

    // downloadAsync() sets state to 'active' synchronously before its first await, so pause()
    // is valid immediately after calling it — even before the returned promise is awaited,
    // mirroring how a real in-flight native download can be interrupted.
    const downloadPromise = task.downloadAsync();
    task.pause();
    const file = await downloadPromise;
    expect(file).toBeNull();
    expect(task.state).toBe('paused');

    const savable = task.savable();
    expect(savable.resumeData).toBe('resume-token');

    const resumed = await task.resumeAsync();
    expect(resumed).toBeInstanceOf(File);
    expect(task.state).toBe('completed');
  });

  it('rebuilds a paused task from a savable state via fromSavable', async () => {
    const restored = DownloadTask.fromSavable({
      url: 'https://example.com/video.mp4',
      fileUri: 'file:///cache/video.mp4',
      isDirectory: false,
      resumeData: 'saved-token',
    });
    expect(restored.state).toBe('paused');
    const file = await restored.resumeAsync();
    expect(file).toBeInstanceOf(File);
  });

  it('fromSavable() throws when the saved state carries no resumeData', () => {
    expect(() =>
      DownloadTask.fromSavable({
        url: 'https://example.com/video.mp4',
        fileUri: 'file:///cache/video.mp4',
        isDirectory: false,
      }),
    ).toThrow('Cannot restore task: DownloadPauseState has no resumeData');
  });

  it('downloadAsync() throws while already active', async () => {
    const destination = new File(Paths.cache, 'busy.mp4');
    const task = new DownloadTask('https://example.com/busy.mp4', destination);
    const first = task.downloadAsync();
    await expect(task.downloadAsync()).rejects.toThrow(
      'Cannot call downloadAsync() in state "active"',
    );
    await first;
  });

  it('pause() throws outside the active state', () => {
    const destination = new File(Paths.cache, 'idle.mp4');
    const task = new DownloadTask('https://example.com/idle.mp4', destination);
    expect(() => task.pause()).toThrow('Cannot call pause() in state "idle"');
  });

  it('resumeAsync() throws outside the paused state', async () => {
    const destination = new File(Paths.cache, 'idle2.mp4');
    const task = new DownloadTask('https://example.com/idle2.mp4', destination);
    await expect(task.resumeAsync()).rejects.toThrow(
      'Cannot call resumeAsync() in state "idle"',
    );
  });

  it('resumeAsync() throws when paused with no resume data', async () => {
    const destination = new File(Paths.cache, 'no-resume.mp4');
    const task = new DownloadTask(
      'https://example.com/no-resume.mp4',
      destination,
    );
    const native = downloadTaskInstances.at(-1)!;
    native.pause = vi.fn(async () => {
      native.paused = true;
      return { resumeData: undefined };
    });

    const downloadPromise = task.downloadAsync();
    task.pause();
    await downloadPromise;
    expect(task.state).toBe('paused');

    await expect(task.resumeAsync()).rejects.toThrow(
      /No resume data available/,
    );
  });

  it('savable() throws outside the paused state', () => {
    const destination = new File(Paths.cache, 'idle3.mp4');
    const task = new DownloadTask('https://example.com/idle3.mp4', destination);
    expect(() => task.savable()).toThrow(
      'Cannot call savable() in state "idle"',
    );
  });

  it('transitions to error and re-throws on a native failure', async () => {
    const destination = new File(Paths.cache, 'fail.mp4');
    const task = new DownloadTask('https://example.com/fail.mp4', destination);
    downloadTaskInstances.at(-1)!.start = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'));

    await expect(task.downloadAsync()).rejects.toThrow('network error');
    expect(task.state).toBe('error');
  });

  it('cancel() is a no-op once the task reaches a terminal state', async () => {
    const destination = new File(Paths.cache, 'done.mp4');
    const task = new DownloadTask('https://example.com/done.mp4', destination);
    await task.downloadAsync();
    expect(task.state).toBe('completed');

    task.cancel();
    expect(task.state).toBe('completed');
    expect(downloadTaskInstances.at(-1)!.cancel).not.toHaveBeenCalled();
  });

  it('cancel() moves an active task to cancelled and calls the native cancel', async () => {
    const destination = new File(Paths.cache, 'cancel-me.mp4');
    const task = new DownloadTask(
      'https://example.com/cancel-me.mp4',
      destination,
    );
    const pending = task.downloadAsync().catch(() => {});
    expect(task.state).toBe('active');

    task.cancel();
    expect(task.state).toBe('cancelled');
    expect(downloadTaskInstances.at(-1)!.cancel).toHaveBeenCalledTimes(1);
    await pending;
  });

  it('wires onProgress via addListener("progress", ...)', async () => {
    const onProgress = vi.fn();
    const destination = new File(Paths.cache, 'progress.mp4');
    const task = new DownloadTask(
      'https://example.com/progress.mp4',
      destination,
      { onProgress },
    );
    const addListenerSpy = vi.spyOn(task, 'addListener');

    await task.downloadAsync();

    expect(addListenerSpy).toHaveBeenCalledWith('progress', onProgress);
  });
});

describe('AbortSignal integration', () => {
  it('a pre-aborted signal rejects uploadAsync() with an AbortError, state cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(Paths.document, 'aborted-upload.bin');
    const task = new UploadTask(file, 'https://example.com/upload', {
      signal: controller.signal,
    });

    const error: Error = await task.uploadAsync().catch(e => e);
    expect(error.name).toBe('AbortError');
    expect(task.state).toBe('cancelled');
  });

  it('a pre-aborted signal rejects downloadAsync() with an AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    const destination = new File(Paths.cache, 'aborted-download.mp4');
    const task = new DownloadTask(
      'https://example.com/aborted.mp4',
      destination,
      { signal: controller.signal },
    );

    const error: Error = await task.downloadAsync().catch(e => e);
    expect(error.name).toBe('AbortError');
    expect(task.state).toBe('cancelled');
  });

  it('aborting an active download rejects with AbortError and moves to cancelled', async () => {
    const controller = new AbortController();
    const destination = new File(Paths.cache, 'abort-active.mp4');
    const task = new DownloadTask(
      'https://example.com/abort-active.mp4',
      destination,
      { signal: controller.signal },
    );
    const native = downloadTaskInstances.at(-1)!;
    let rejectStart!: (reason: Error) => void;
    native.start = vi.fn(
      () =>
        new Promise<string | null>((_resolve, reject) => {
          rejectStart = reject;
        }),
    );
    native.cancel = vi.fn(() => {
      rejectStart(new Error('cancelled natively'));
    });

    const promise = task.downloadAsync();
    controller.abort();

    const error: Error = await promise.catch(e => e);
    expect(error.name).toBe('AbortError');
    expect(task.state).toBe('cancelled');
  });
});
