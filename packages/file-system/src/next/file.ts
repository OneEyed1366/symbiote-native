import { uuid, type EventSubscription } from 'expo-modules-core';

import { Directory } from './directory';
import { expoFileSystemNext } from './native-module';
import { DownloadTask, UploadTask } from './network-tasks';
import { Paths } from './paths';
import {
  FileSystemReadableStreamSource,
  FileSystemWritableSink,
} from './streams';
import { FileSystemWatcher } from './watcher';
import {
  FileMode,
  type IFileSystemDownloadOptions,
  type IFileSystemDownloadProgress,
  type IFileSystemDownloadTaskOptions,
  type IFileSystemUploadOptions,
  type IFileSystemUploadResult,
  type IFileSystemWatchEvent,
  type IFileSystemWatchOptions,
  type IFileSystemWatchSubscription,
  type IPickFileOptions,
  type IPickMultipleFilesOptions,
  type IPickMultipleFilesResult,
  type IPickSingleFileOptions,
  type IPickSingleFileResult,
} from './types';

function createAbortError(reason?: unknown): Error {
  const message =
    typeof reason === 'string' ? reason : 'The operation was aborted.';
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function parsePickFileOptions(
  initialUriOrOptions?: string | IPickFileOptions,
  mimeType?: string,
): { options: IPickFileOptions; usingOldAPI: boolean } {
  if (typeof initialUriOrOptions === 'object') {
    return { options: initialUriOrOptions, usingOldAPI: false };
  }
  return {
    options: {
      initialUri: initialUriOrOptions,
      mimeTypes: mimeType,
      multipleFiles: false,
    },
    usingOldAPI:
      mimeType !== undefined || typeof initialUriOrOptions === 'string',
  };
}

/**
 * Represents a file on the filesystem.
 *
 * A `File` instance can be created for any path, and does not need to exist on the filesystem
 * during creation. The constructor accepts an array of strings that are joined to create the
 * file URI. The first argument can also be a `Directory` instance (like `Paths.cache`) or a
 * `File` instance (which creates a new reference to the same file).
 */
export class File extends expoFileSystemNext.FileSystemFile {
  /**
   * Downloads a file from the network.
   *
   * On Android, the response body streams directly into the target file. If the download fails
   * after it starts, a partially written file may remain at the destination. On iOS, the
   * download first completes in a temporary location and the file is moved into place only
   * after success, so no file is left behind when the request fails.
   */
  static downloadFileAsync: (
    url: string,
    destination: Directory | File,
    options?: IFileSystemDownloadOptions,
  ) => Promise<File>;

  /**
   * Opens the system file picker for selecting a single file.
   */
  static pickFileAsync(
    options?: IPickSingleFileOptions,
  ): Promise<IPickSingleFileResult>;
  /**
   * Opens the system file picker for selecting multiple files.
   */
  static pickFileAsync(
    options?: IPickMultipleFilesOptions,
  ): Promise<IPickMultipleFilesResult>;
  /**
   * @deprecated Use `pickFileAsync({initialUri, mimeTypes: mimeType})` instead.
   */
  static pickFileAsync(
    initialUri?: string,
    mimeType?: string,
  ): Promise<File | File[]>;
  static async pickFileAsync(
    initialUriOrOptions?: string | IPickFileOptions,
    mimeType?: string,
  ): Promise<File | File[] | IPickSingleFileResult | IPickMultipleFilesResult> {
    const { options, usingOldAPI } = parsePickFileOptions(
      initialUriOrOptions,
      mimeType,
    );
    try {
      if (options.multipleFiles) {
        const files = await expoFileSystemNext.pickFileAsync(options);
        return {
          result: files.map(file => new File(file.uri)),
          canceled: false,
        };
      }
      const file = await expoFileSystemNext.pickFileAsync(options);
      if (usingOldAPI) {
        return new File(file.uri);
      }
      return {
        result: new File(file.uri),
        canceled: false,
      };
    } catch (error) {
      if (usingOldAPI) {
        throw error;
      }
      return {
        result: null,
        canceled: true,
      };
    }
  }

  /**
   * Creates an instance of a file. It can be created for any path, and does not need to exist on
   * the filesystem during creation.
   */
  constructor(...uris: (string | File | Directory)[]) {
    super(Paths.join(...uris));
    this.validatePath();
  }

  /** Directory containing the file. */
  get parentDirectory() {
    return new Directory(Paths.dirname(this.uri));
  }

  /** File extension, e.g. `.png`. */
  get extension() {
    return Paths.extname(this.uri);
  }

  /** File name. Includes the extension. */
  get name() {
    return Paths.basename(this.uri);
  }

  readableStream() {
    return new ReadableStream(
      new FileSystemReadableStreamSource(super.open(FileMode.ReadOnly)),
    );
  }

  writableStream() {
    return new WritableStream<Uint8Array>(
      new FileSystemWritableSink(super.open(FileMode.WriteOnly)),
    );
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = await this.bytes();
    return bytes.buffer;
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  async formData(): ReturnType<Response['formData']> {
    return new Response(await this.arrayBuffer(), {
      headers: this.type ? { 'Content-Type': this.type } : undefined,
    }).formData();
  }

  stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    return this.readableStream();
  }

  slice(start?: number, end?: number, contentType?: string): Blob {
    // React Native's own ambient `Blob` declaration (react-native/src/types/globals.d.ts) is
    // narrower than its runtime: `blobParts` is typed as `(Blob | string)[]` only (the real
    // native implementation accepts raw bytes), and `BlobOptions` requires both `type` and
    // `lastModified` even though `lastModified` is a `File`-only concept the Web `Blob` spec
    // doesn't have at all. Cast at this one call — RN's declared contract, not our logic, is
    // what's incomplete; `lastModified` is supplied only to satisfy the type and is not read by
    // any real `Blob` implementation.
    const bytes = this.bytesSync().slice(start, end) as unknown as string;
    return new Blob([bytes], {
      type: contentType ?? '',
      lastModified: Date.now(),
    });
  }

  /**
   * Uploads this file to a server and starts the request immediately.
   */
  upload(
    url: string,
    options?: IFileSystemUploadOptions,
  ): Promise<IFileSystemUploadResult> {
    return new UploadTask(this, url, options).uploadAsync();
  }

  /**
   * Creates an upload task for this file without starting it.
   */
  createUploadTask(
    url: string,
    options?: IFileSystemUploadOptions,
  ): UploadTask {
    return new UploadTask(this, url, options);
  }

  /**
   * Creates a download task without starting it.
   */
  static createDownloadTask(
    url: string,
    destination: File | Directory,
    options?: IFileSystemDownloadTaskOptions,
  ): DownloadTask {
    return new DownloadTask(url, destination, options);
  }

  /**
   * Watches this file for changes on the filesystem. The watcher automatically stops when the
   * file is deleted or renamed. To stop watching manually, call `remove()` on the returned
   * subscription.
   */
  watch(
    callback: (event: IFileSystemWatchEvent<File>) => void,
    options?: IFileSystemWatchOptions,
  ): IFileSystemWatchSubscription {
    return new FileSystemWatcher<File>(
      this.uri,
      callback,
      options,
      uri => new File(uri),
    );
  }
}

// Cannot use `static` keyword in class declaration because of a runtime error (matches upstream's
// own comment — assigning after the class body avoids whatever native interop issue upstream ran
// into with `SharedObject`-extending classes).
File.downloadFileAsync = async function downloadFileAsync(
  url: string,
  to: File | Directory,
  options?: IFileSystemDownloadOptions,
) {
  const needsUuid = options?.onProgress || options?.signal;
  const downloadUuid = needsUuid ? uuid.v4() : undefined;

  let subscription: EventSubscription | undefined;
  let abortHandler: (() => void) | undefined;
  let lastProgress: IFileSystemDownloadProgress | undefined;

  try {
    if (options?.signal?.aborted) {
      throw createAbortError(options.signal.reason);
    }

    if (downloadUuid && options?.onProgress) {
      subscription = expoFileSystemNext.addListener(
        'downloadProgress',
        event => {
          if (event.uuid === downloadUuid) {
            lastProgress = event.data;
            options.onProgress!(lastProgress);
          }
        },
      );
    }

    if (downloadUuid && options?.signal) {
      abortHandler = () => {
        expoFileSystemNext.cancelDownloadAsync(downloadUuid);
      };
      options.signal.addEventListener('abort', abortHandler, { once: true });
    }

    const outputURI = await expoFileSystemNext.downloadFileAsync(
      url,
      to,
      options,
      downloadUuid,
    );
    const file = new File(outputURI);
    const fileSize = file.size ?? 0;
    if (
      options?.onProgress &&
      fileSize > 0 &&
      (lastProgress?.bytesWritten !== fileSize ||
        lastProgress?.totalBytes !== fileSize)
    ) {
      options.onProgress({ bytesWritten: fileSize, totalBytes: fileSize });
    }
    return file;
  } catch (error) {
    if (options?.signal?.aborted) {
      throw createAbortError(options.signal.reason);
    }
    throw error;
  } finally {
    subscription?.remove();
    if (abortHandler && options?.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
  }
};
