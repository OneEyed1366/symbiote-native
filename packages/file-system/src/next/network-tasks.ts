import type { EventSubscription } from 'expo-modules-core';

import { Directory } from './directory';
import { File } from './file';
import { expoFileSystemNext } from './native-module';
import {
  FileSystemUploadType,
  type IFileSystemDownloadPauseState,
  type IFileSystemDownloadProgress,
  type IFileSystemDownloadTaskOptions,
  type IFileSystemDownloadTaskState,
  type IFileSystemUploadOptions,
  type IFileSystemUploadProgress,
  type IFileSystemUploadResult,
  type IFileSystemUploadTaskState,
} from './types';

type ITaskState = IFileSystemUploadTaskState | IFileSystemDownloadTaskState;

type INetworkTaskOptions<TProgress> = {
  signal?: AbortSignal;
  onProgress?: (progress: TProgress) => void;
};

function createAbortError(reason?: unknown): Error {
  const message =
    typeof reason === 'string' ? reason : 'The operation was aborted.';
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function assertNetworkTaskState<TState extends ITaskState>(
  state: TState,
  allowedStates: readonly TState[],
  methodName: string,
) {
  if (!allowedStates.includes(state)) {
    throw new Error(`Cannot call ${methodName}() in state "${state}"`);
  }
}

function wireNetworkTaskAbortSignal(
  signal: INetworkTaskOptions<never>['signal'],
  cancel: () => void,
) {
  if (signal?.aborted) {
    throw createAbortError();
  }
  if (signal) {
    const abortHandler = () => cancel();
    signal.addEventListener('abort', abortHandler, { once: true });
    return abortHandler;
  }
  return undefined;
}

function wireNetworkTaskProgress<TProgress>(
  onProgress: INetworkTaskOptions<TProgress>['onProgress'],
  addListener: (listener: (progress: TProgress) => void) => EventSubscription,
) {
  if (onProgress) {
    return addListener(onProgress);
  }
  return undefined;
}

function cleanupNetworkTask(
  signal: INetworkTaskOptions<never>['signal'],
  subscription: EventSubscription | undefined,
  abortHandler: (() => void) | undefined,
) {
  subscription?.remove();
  if (abortHandler && signal) {
    signal.removeEventListener('abort', abortHandler);
  }
}

/**
 * Represents an upload task with progress tracking and cancellation support.
 *
 * Upload tasks start in the `idle` state. Calling `uploadAsync()` moves the task to `active`,
 * then to `completed`, `cancelled`, or `error`.
 */
export class UploadTask {
  private _state: IFileSystemUploadTaskState = 'idle';
  private _file: File;
  private _url: string;
  private _options?: IFileSystemUploadOptions;
  private _subscription?: EventSubscription;
  private _abortHandler?: () => void;
  private readonly _nativeTask: InstanceType<
    typeof expoFileSystemNext.FileSystemUploadTask
  >;

  /**
   * Creates an upload task. The task does not start automatically — call `uploadAsync()` to
   * begin uploading.
   */
  constructor(file: File, url: string, options?: IFileSystemUploadOptions) {
    this._nativeTask = new expoFileSystemNext.FileSystemUploadTask();
    this._file = file;
    this._url = url;
    this._options = options;
  }

  /** The current state of the upload task. */
  get state(): IFileSystemUploadTaskState {
    return this._state;
  }

  /**
   * Starts the upload operation. Can only be called once, while the task is `idle`. The promise
   * resolves with response metadata and body for completed HTTP responses, including non-2xx
   * status codes. It is rejected when the file cannot be read, the request fails, or the task is
   * cancelled. If `options.signal` is aborted, the promise is rejected with an `AbortError`.
   */
  async uploadAsync(): Promise<IFileSystemUploadResult> {
    assertNetworkTaskState(this._state, ['idle'], 'uploadAsync');
    this._state = 'active';
    try {
      this._abortHandler = wireNetworkTaskAbortSignal(
        this._options?.signal,
        () => this.cancel(),
      );
      this._subscription = wireNetworkTaskProgress(
        this._options?.onProgress,
        listener => this.addListener('progress', listener),
      );

      const nativeOpts = {
        httpMethod: this._options?.httpMethod || 'POST',
        uploadType:
          this._options?.uploadType ?? FileSystemUploadType.BINARY_CONTENT,
        headers: this._options?.headers,
        fieldName: this._options?.fieldName,
        mimeType: this._options?.mimeType,
        parameters: this._options?.parameters,
        sessionType: this._options?.sessionType,
      };

      const result = await this._nativeTask.start(
        this._url,
        this._file,
        nativeOpts,
      );
      this._state = 'completed';

      // Emit a synthetic final progress to guarantee 100% is reported. Native progress events
      // may not fire for small files, and even when they do, the event can race with promise
      // resolution (listener removed before delivery).
      if (this._options?.onProgress && this._file.exists) {
        const size = this._file.size ?? 0;
        if (size > 0) {
          this._options.onProgress({ bytesSent: size, totalBytes: size });
        }
      }

      return result;
    } catch (error) {
      if (this._options?.signal?.aborted) {
        this._state = 'cancelled';
        throw createAbortError();
      }
      if (this.state === 'cancelled') {
        throw error;
      }
      this._state = 'error';
      throw error;
    } finally {
      cleanupNetworkTask(
        this._options?.signal,
        this._subscription,
        this._abortHandler,
      );
      this._subscription = undefined;
      this._abortHandler = undefined;
    }
  }

  /**
   * Adds a listener for upload progress events. Prefer the `onProgress` option unless manual
   * subscription control is needed.
   */
  addListener(
    eventName: 'progress',
    listener: (data: IFileSystemUploadProgress) => void,
  ): EventSubscription {
    return this._nativeTask.addListener(eventName, listener);
  }

  /** Releases the native task handle manually. */
  release(): void {
    this._nativeTask.release();
  }

  /**
   * Cancels the upload operation. If `uploadAsync()` is pending, its promise is rejected after
   * the native request is cancelled. Has no effect once the task reaches a terminal state.
   */
  cancel(): void {
    if (['completed', 'cancelled', 'error'].includes(this._state)) return;
    this._state = 'cancelled';
    this._nativeTask.cancel();
    cleanupNetworkTask(
      this._options?.signal,
      this._subscription,
      this._abortHandler,
    );
    this._subscription = undefined;
    this._abortHandler = undefined;
  }
}

/**
 * Represents a download task with pause/resume support and progress tracking.
 *
 * Download tasks start in the `idle` state. Calling `downloadAsync()` moves the task to
 * `active`; pausing moves it to `paused`, and a completed, cancelled, or failed transfer moves
 * it to the corresponding terminal state.
 */
export class DownloadTask {
  private _state: IFileSystemDownloadTaskState = 'idle';
  private _url: string;
  private _destination: File | Directory;
  private _options?: IFileSystemDownloadTaskOptions;
  private _resumeData?: string;
  private _subscription?: EventSubscription;
  private _abortHandler?: () => void;
  private _inFlightOperation?: Promise<File | null>;
  private _pauseRequest?: Promise<void>;
  private readonly _nativeTask: InstanceType<
    typeof expoFileSystemNext.FileSystemDownloadTask
  >;

  /**
   * Creates a download task. The task does not start automatically — call `downloadAsync()` to
   * begin downloading.
   */
  constructor(
    url: string,
    destination: File | Directory,
    options?: IFileSystemDownloadTaskOptions,
  ) {
    this._nativeTask = new expoFileSystemNext.FileSystemDownloadTask();
    this._url = url;
    this._destination = destination;
    this._options = options;
  }

  /** The current state of the download task. */
  get state(): IFileSystemDownloadTaskState {
    return this._state;
  }

  /**
   * Starts the download operation. Can only be called once, while the task is `idle`. Resolves
   * with the downloaded file when the transfer completes, or with `null` if the task is paused
   * before completion.
   */
  async downloadAsync(): Promise<File | null> {
    assertNetworkTaskState(this._state, ['idle'], 'downloadAsync');
    this._state = 'active';
    this._pauseRequest = undefined;
    const operation = this._runDownloadOperation(() =>
      this._nativeTask.start(this._url, this._destination, {
        headers: this._options?.headers,
        sessionType: this._options?.sessionType,
      }),
    );
    this._inFlightOperation = operation;
    return operation;
  }

  /**
   * Requests pausing the active download operation. The pending `downloadAsync()`/`resumeAsync()`
   * promise resolves with `null` once native code produces resume data. Use `pauseAsync()` to
   * wait for that to happen.
   */
  pause(): void {
    assertNetworkTaskState(this._state, ['active'], 'pause');
    this._pauseRequest = Promise.resolve(this._nativeTask.pause()).then(
      result => {
        this._resumeData = result?.resumeData ?? undefined;
      },
    );
  }

  /**
   * Requests pausing the active download operation and waits until the task reaches the
   * `paused` state.
   */
  async pauseAsync(): Promise<void> {
    this.pause();
    await this._pauseRequest;
    await this._inFlightOperation;
  }

  /**
   * Resumes a paused download operation. Resolves with the downloaded file when the transfer
   * completes, or with `null` if paused again before completion.
   */
  async resumeAsync(): Promise<File | null> {
    assertNetworkTaskState(this._state, ['paused'], 'resumeAsync');
    if (!this._resumeData) {
      throw new Error(
        'No resume data available. Was the download paused before any data was received?',
      );
    }
    this._state = 'active';
    this._pauseRequest = undefined;
    const operation = this._runDownloadOperation(() =>
      this._nativeTask.resume(this._url, this._destination, this._resumeData!, {
        headers: this._options?.headers,
        sessionType: this._options?.sessionType,
      }),
    );
    this._inFlightOperation = operation;
    return operation;
  }

  /**
   * Adds a listener for download progress events. Prefer the `onProgress` option unless manual
   * subscription control is needed.
   */
  addListener(
    eventName: 'progress',
    listener: (data: IFileSystemDownloadProgress) => void,
  ): EventSubscription {
    return this._nativeTask.addListener(eventName, listener);
  }

  /** Releases the native task handle manually. */
  release(): void {
    this._nativeTask.release();
  }

  /**
   * Cancels the download operation. If `downloadAsync()`/`resumeAsync()` is pending, its promise
   * is rejected after the native request is cancelled. Has no effect once the task reaches a
   * terminal state.
   */
  cancel(): void {
    if (['completed', 'cancelled', 'error'].includes(this._state)) return;
    this._state = 'cancelled';
    this._pauseRequest = undefined;
    this._nativeTask.cancel();
    cleanupNetworkTask(
      this._options?.signal,
      this._subscription,
      this._abortHandler,
    );
    this._subscription = undefined;
    this._abortHandler = undefined;
  }

  /**
   * Returns the paused task state that can be persisted and restored later. Can only be called
   * while the task is `paused`.
   */
  savable(): IFileSystemDownloadPauseState {
    assertNetworkTaskState(this._state, ['paused'], 'savable');
    return {
      url: this._url,
      fileUri: this._destination.uri,
      isDirectory: this._destination instanceof Directory,
      headers: this._options?.headers,
      resumeData: this._resumeData,
    };
  }

  /**
   * Creates a paused download task from saved state, to continue a download after persisting the
   * value returned by `savable()`.
   */
  static fromSavable(
    state: IFileSystemDownloadPauseState,
    options?: IFileSystemDownloadTaskOptions,
  ): DownloadTask {
    if (!state.resumeData) {
      throw new Error(
        'Cannot restore task: DownloadPauseState has no resumeData',
      );
    }
    const dest = state.isDirectory
      ? new Directory(state.fileUri)
      : new File(state.fileUri);
    const mergedOptions =
      options || state.headers
        ? { ...options, headers: { ...state.headers, ...options?.headers } }
        : undefined;
    const task = new DownloadTask(state.url, dest, mergedOptions);
    task._resumeData = state.resumeData;
    task._state = 'paused';
    return task;
  }

  private async _runDownloadOperation(
    operation: () => Promise<string | null>,
  ): Promise<File | null> {
    try {
      this._abortHandler = wireNetworkTaskAbortSignal(
        this._options?.signal,
        () => this.cancel(),
      );
      this._subscription = wireNetworkTaskProgress(
        this._options?.onProgress,
        listener => this.addListener('progress', listener),
      );

      const result = await operation();
      if (result) {
        this._state = 'completed';
        this._resumeData = undefined;
        const file = new File(result);
        this._emitFinalProgressEvent(file.size);
        return file;
      }

      await this._pauseRequest;
      this._state = 'paused';
      return null;
    } catch (error) {
      if (this._options?.signal?.aborted) {
        this._state = 'cancelled';
        throw createAbortError();
      }
      if (this.state === 'cancelled') {
        throw error;
      }
      this._state = 'error';
      throw error;
    } finally {
      cleanupNetworkTask(
        this._options?.signal,
        this._subscription,
        this._abortHandler,
      );
      this._subscription = undefined;
      this._abortHandler = undefined;
      this._inFlightOperation = undefined;
    }
  }

  private _emitFinalProgressEvent(fileSize: number) {
    // Emit a synthetic final progress to guarantee 100% is reported. Native progress events may
    // not fire for small files, and even when they do, the event can race with promise
    // resolution (listener removed before delivery).
    if (this._options?.onProgress && fileSize > 0) {
      this._options.onProgress({
        bytesWritten: fileSize,
        totalBytes: fileSize,
      });
    }
  }
}
