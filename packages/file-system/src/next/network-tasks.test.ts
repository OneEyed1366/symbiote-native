import { beforeEach, describe, expect, it, vi } from 'vitest';

// Native tasks are fakes recorded per construction, so a test reaches the one a task just built

const native = vi.hoisted(() => {
  class FakeFile {
    uri: string;
    exists = true;
    size = 42;
    constructor(...uris: string[]) {
      this.uri = uris[uris.length - 1] ?? '';
    }
    validatePath() {}
  }

  class FakeDirectory {
    uri: string;
    constructor(...uris: string[]) {
      this.uri = uris[uris.length - 1] ?? '';
    }
    validatePath() {}
  }

  class FakeUploadTask {
    static instances: FakeUploadTask[] = [];
    static result: {
      body: string;
      status: number;
      headers: Record<string, string>;
    } = { body: '{"ok":true}', status: 200, headers: { 'x-req-id': '1' } };
    start = vi.fn(async (..._args: unknown[]) => FakeUploadTask.result);
    cancel = vi.fn();
    release = vi.fn();
    addListener = vi.fn((..._args: unknown[]) => ({ remove: vi.fn() }));
    constructor() {
      FakeUploadTask.instances.push(this);
    }
  }

  class FakeDownloadTask {
    static instances: FakeDownloadTask[] = [];
    start = vi.fn(async (..._args: unknown[]): Promise<string | null> => {
      return 'file:///cache/video.mp4';
    });
    pause = vi.fn(() => ({ resumeData: 'mock-resume-data' }));
    resume = vi.fn(
      async (..._args: unknown[]): Promise<string | null> =>
        'file:///cache/video.mp4',
    );
    cancel = vi.fn();
    release = vi.fn();
    addListener = vi.fn((..._args: unknown[]) => ({ remove: vi.fn() }));
    constructor() {
      FakeDownloadTask.instances.push(this);
    }
  }

  return {
    FakeUploadTask,
    FakeDownloadTask,
    module: {
      FileSystemFile: FakeFile,
      FileSystemDirectory: FakeDirectory,
      FileSystemUploadTask: FakeUploadTask,
      FileSystemDownloadTask: FakeDownloadTask,
      addListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  };
});

vi.mock('./native-module', () => ({ expoFileSystemNext: native.module }));
vi.mock('expo-modules-core', () => ({ uuid: { v4: () => 'test-uuid' } }));

const { File } = await import('./file');
const { Directory } = await import('./directory');
const { UploadTask, DownloadTask } = await import('./network-tasks');
const { FileSystemUploadType } = await import('./types');

const URL_UPLOAD = 'https://example.com/upload';
const URL_DOWNLOAD = 'https://example.com/video.mp4';
const LEAKED_SHARED_OBJECT_METHODS = [
  'emit',
  'listenerCount',
  'removeListener',
  'removeAllListeners',
  'startObserving',
  'stopObserving',
];

function last<T>(list: T[]): T {
  const item = list.at(-1);
  if (item === undefined) {
    throw new Error('no native task was constructed');
  }
  return item;
}

function deferred(): {
  promise: Promise<never>;
  reject: (reason: Error) => void;
} {
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

function newFile(name: string) {
  return new File(`file:///cache/${name}`);
}

beforeEach(() => {
  native.FakeUploadTask.result = {
    body: '{"ok":true}',
    status: 200,
    headers: { 'x-req-id': '1' },
  };
  native.FakeUploadTask.instances.length = 0;
  native.FakeDownloadTask.instances.length = 0;
});

describe('File.upload()', () => {
  it('forwards upload options through the underlying task', async () => {
    const file = newFile('photo.jpg');
    const options = {
      httpMethod: 'PATCH',
      uploadType: FileSystemUploadType.MULTIPART,
      headers: { Authorization: 'Bearer token' },
      fieldName: 'asset',
      mimeType: 'image/jpeg',
      parameters: { albumId: '42' },
      sessionType: 'foreground',
    } as const;

    native.FakeUploadTask.result = {
      body: 'validation failed',
      status: 422,
      headers: { 'x-error': '1' },
    };
    const result = await file.upload(URL_UPLOAD, options);

    expect(last(native.FakeUploadTask.instances).start).toHaveBeenCalledWith(
      URL_UPLOAD,
      file,
      expect.objectContaining(options),
    );
    expect(result).toEqual({
      body: 'validation failed',
      status: 422,
      headers: { 'x-error': '1' },
    });
  });
});

describe('task facades', () => {
  it('UploadTask is not a native task and hides SharedObject methods', () => {
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD);

    expect(task).not.toBeInstanceOf(native.FakeUploadTask);
    expect(typeof task.addListener).toBe('function');
    expect(typeof task.release).toBe('function');
    for (const method of LEAKED_SHARED_OBJECT_METHODS) {
      expect(Reflect.get(task, method)).toBeUndefined();
    }
  });

  it('DownloadTask is not a native task and hides SharedObject methods', () => {
    const task = new DownloadTask(URL_DOWNLOAD, newFile('video.mp4'));

    expect(task).not.toBeInstanceOf(native.FakeDownloadTask);
    expect(typeof task.addListener).toBe('function');
    expect(typeof task.release).toBe('function');
    for (const method of LEAKED_SHARED_OBJECT_METHODS) {
      expect(Reflect.get(task, method)).toBeUndefined();
    }
  });
});

describe('UploadTask', () => {
  it('cancel() is a no-op in the cancelled state', () => {
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD);
    task.uploadAsync().catch(() => {});
    task.cancel();

    task.cancel();

    expect(task.state).toBe('cancelled');
    expect(last(native.FakeUploadTask.instances).cancel).toHaveBeenCalledTimes(
      1,
    );
  });

  it('cancel() is a no-op in the error state', async () => {
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD);
    last(native.FakeUploadTask.instances).start.mockRejectedValue(
      new Error('fail'),
    );
    await expect(task.uploadAsync()).rejects.toThrow('fail');

    task.cancel();

    expect(task.state).toBe('error');
    expect(last(native.FakeUploadTask.instances).cancel).not.toHaveBeenCalled();
  });

  it('cancel() keeps the cancelled state after the upload promise rejects', async () => {
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD);
    const nativeStart = deferred();
    last(native.FakeUploadTask.instances).start.mockReturnValue(
      nativeStart.promise,
    );
    const pending = task.uploadAsync();

    task.cancel();
    nativeStart.reject(new Error('upload cancelled natively'));

    await expect(pending).rejects.toThrow('upload cancelled natively');
    expect(task.state).toBe('cancelled');
  });

  it('forwards sessionType to the native start call', async () => {
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD, {
      sessionType: 'foreground',
    });

    await task.uploadAsync();

    expect(last(native.FakeUploadTask.instances).start).toHaveBeenCalledWith(
      URL_UPLOAD,
      expect.anything(),
      expect.objectContaining({ sessionType: 'foreground' }),
    );
  });

  it('leaves sessionType undefined so native defaults to background', async () => {
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD);

    await task.uploadAsync();

    expect(last(native.FakeUploadTask.instances).start).toHaveBeenCalledWith(
      URL_UPLOAD,
      expect.anything(),
      expect.objectContaining({ sessionType: undefined }),
    );
  });

  it('aborting an active upload rejects with AbortError, not the native error', async () => {
    const controller = new AbortController();
    const task = new UploadTask(newFile('photo.jpg'), URL_UPLOAD, {
      signal: controller.signal,
    });
    const nativeTask = last(native.FakeUploadTask.instances);
    const nativeStart = deferred();
    nativeTask.start.mockReturnValue(nativeStart.promise);
    nativeTask.cancel.mockImplementation(() =>
      nativeStart.reject(new Error('upload cancelled natively')),
    );
    const pending = task.uploadAsync();

    controller.abort();

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'AbortError',
      message: 'The operation was aborted.',
    });
    expect(task.state).toBe('cancelled');
  });
});

describe('DownloadTask', () => {
  it('forwards sessionType to the native start and resume calls', async () => {
    const destination = newFile('video.mp4');
    const task = new DownloadTask(URL_DOWNLOAD, destination, {
      sessionType: 'foreground',
    });
    const nativeTask = last(native.FakeDownloadTask.instances);
    nativeTask.start.mockResolvedValue(null);

    const pending = task.downloadAsync();
    task.pause();
    await pending;
    await task.resumeAsync();

    expect(nativeTask.start).toHaveBeenCalledWith(
      URL_DOWNLOAD,
      destination,
      expect.objectContaining({ sessionType: 'foreground' }),
    );
    expect(nativeTask.resume).toHaveBeenCalledWith(
      URL_DOWNLOAD,
      destination,
      'mock-resume-data',
      expect.objectContaining({ sessionType: 'foreground' }),
    );
  });

  it('moves to paused and resolves null when native returns null', async () => {
    const task = new DownloadTask(URL_DOWNLOAD, newFile('video.mp4'));
    last(native.FakeDownloadTask.instances).start.mockResolvedValue(null);

    const result = await task.downloadAsync();

    expect(task.state).toBe('paused');
    expect(result).toBeNull();
  });

  it('cancel() keeps the cancelled state after the download promise rejects', async () => {
    const task = new DownloadTask(URL_DOWNLOAD, newFile('video.mp4'));
    const nativeStart = deferred();
    last(native.FakeDownloadTask.instances).start.mockReturnValue(
      nativeStart.promise,
    );
    const pending = task.downloadAsync();

    task.cancel();
    nativeStart.reject(new Error('download cancelled natively'));

    await expect(pending).rejects.toThrow('download cancelled natively');
    expect(task.state).toBe('cancelled');
  });

  it('aborting an active download settles with the state already cancelled', async () => {
    const controller = new AbortController();
    const task = new DownloadTask(URL_DOWNLOAD, newFile('video.mp4'), {
      signal: controller.signal,
    });
    const nativeTask = last(native.FakeDownloadTask.instances);
    const nativeStart = deferred();
    nativeTask.start.mockReturnValue(nativeStart.promise);
    nativeTask.cancel.mockImplementation(() =>
      nativeStart.reject(new Error('cancelled')),
    );
    const pending = task.downloadAsync();

    controller.abort();
    await pending.catch(() => {});

    expect(task.state).toBe('cancelled');
  });
});

describe('DownloadTask savable state', () => {
  async function pausedTask(
    destination: InstanceType<typeof File> | InstanceType<typeof Directory>,
  ) {
    const task = new DownloadTask(URL_DOWNLOAD, destination);
    const nativeTask = last(native.FakeDownloadTask.instances);
    nativeTask.start.mockResolvedValue(null);
    nativeTask.pause.mockReturnValue({ resumeData: 'resume-blob' });
    const pending = task.downloadAsync();
    task.pause();
    await pending;
    return task;
  }

  it('savable() throws while idle', () => {
    const task = new DownloadTask(URL_DOWNLOAD, newFile('f'));

    expect(() => task.savable()).toThrow(
      'Cannot call savable() in state "idle"',
    );
  });

  it('savable() marks a File destination with isDirectory false', async () => {
    const destination = newFile('video.mp4');
    const task = await pausedTask(destination);

    expect(task.savable()).toMatchObject({
      url: URL_DOWNLOAD,
      fileUri: destination.uri,
      isDirectory: false,
      resumeData: 'resume-blob',
    });
  });

  it('savable() marks a Directory destination with isDirectory true', async () => {
    const task = await pausedTask(new Directory('file:///cache/downloads/'));

    expect(task.savable().isDirectory).toBe(true);
  });

  it('fromSavable() restores a paused task with its url, resume data and headers', () => {
    const task = DownloadTask.fromSavable({
      url: URL_DOWNLOAD,
      fileUri: 'file:///cache/video.mp4',
      isDirectory: false,
      resumeData: 'saved-resume-data',
      headers: { Authorization: 'Bearer token' },
    });

    expect(task.state).toBe('paused');
    expect(task.savable()).toMatchObject({
      url: URL_DOWNLOAD,
      resumeData: 'saved-resume-data',
      headers: { Authorization: 'Bearer token' },
    });
  });

  it.each([
    { isDirectory: false, fileUri: 'file:///cache/video.mp4' },
    { isDirectory: true, fileUri: 'file:///cache/' },
  ])(
    'fromSavable() keeps isDirectory $isDirectory',
    ({ isDirectory, fileUri }) => {
      const task = DownloadTask.fromSavable({
        url: URL_DOWNLOAD,
        fileUri,
        isDirectory,
        resumeData: 'data',
      });

      expect(task.savable().isDirectory).toBe(isDirectory);
    },
  );
});
