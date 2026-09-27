import {
  UnavailabilityError,
  uuid,
  type EventSubscription,
} from 'expo-modules-core';
import { Platform } from 'react-native';

import { expoFileSystem } from './native-module';
import {
  FileSystemSessionType,
  FileSystemUploadType,
  type IFileSystemDeletingOptions,
  type IFileSystemDownloadOptions,
  type IFileSystemDownloadPauseState,
  type IFileSystemDownloadProgressData,
  type IFileSystemDownloadResult,
  type IFileSystemFileInfo,
  type IFileSystemInfoOptions,
  type IFileSystemMakeDirectoryOptions,
  type IFileSystemNetworkTaskProgressCallback,
  type IFileSystemProgressEvent,
  type IFileSystemReadingOptions,
  type IFileSystemRelocatingOptions,
  type IFileSystemRequestDirectoryPermissionsResult,
  type IFileSystemUploadOptions,
  type IFileSystemAcceptedUploadHttpMethod,
  type IFileSystemUploadProgressData,
  type IFileSystemUploadResult,
  type IFileSystemWritingOptions,
} from './types';

if (!expoFileSystem) {
  console.warn(
    'No native ExponentFileSystem module found, are you sure the @symbiote-native/file-system module is linked properly?',
  );
}

function normalizeEndingSlash(p: string | null): string | null {
  if (p != null) {
    return p.replace(/\/*$/, '') + '/';
  }
  return null;
}

/**
 * `file://` URI pointing to the directory where user documents for this app will be stored.
 * Files stored here will remain until explicitly deleted by the app. Ends with a trailing `/`.
 */
export const documentDirectory = normalizeEndingSlash(
  expoFileSystem?.documentDirectory ?? null,
);

/**
 * `file://` URI pointing to the directory where temporary files used by this app will be stored.
 * Files stored here may be automatically deleted by the system when low on storage.
 */
export const cacheDirectory = normalizeEndingSlash(
  expoFileSystem?.cacheDirectory ?? null,
);

/**
 * URI to the directory where assets bundled with the application are stored.
 */
export const bundleDirectory = normalizeEndingSlash(
  expoFileSystem?.bundleDirectory ?? null,
);

/**
 * Get metadata information about a file, directory or external content/asset.
 */
export async function getInfoAsync(
  fileUri: string,
  options: IFileSystemInfoOptions = {},
): Promise<IFileSystemFileInfo> {
  if (!expoFileSystem?.getInfoAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'getInfoAsync',
    );
  }
  return await expoFileSystem.getInfoAsync(fileUri, options);
}

/**
 * Read the entire contents of a file as a string. Binary is returned in raw format — prepend
 * `data:image/png;base64,` yourself to use it as a data URI.
 */
export async function readAsStringAsync(
  fileUri: string,
  options: IFileSystemReadingOptions = {},
): Promise<string> {
  if (!expoFileSystem?.readAsStringAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'readAsStringAsync',
    );
  }
  return await expoFileSystem.readAsStringAsync(fileUri, options);
}

/**
 * Takes a `file://` URI and converts it into a `content://` URI so that it can be accessed by
 * other applications outside of the app.
 * @platform android
 */
export async function getContentUriAsync(fileUri: string): Promise<string> {
  if (Platform.OS === 'android') {
    if (!expoFileSystem?.getContentUriAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'getContentUriAsync',
      );
    }
    return await expoFileSystem.getContentUriAsync(fileUri);
  }
  return fileUri;
}

/**
 * Write the entire contents of a file as a string.
 */
export async function writeAsStringAsync(
  fileUri: string,
  contents: string,
  options: IFileSystemWritingOptions = {},
): Promise<void> {
  if (!expoFileSystem?.writeAsStringAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'writeAsStringAsync',
    );
  }
  return await expoFileSystem.writeAsStringAsync(fileUri, contents, options);
}

/**
 * Delete a file or directory. If the URI points to a directory, the directory and all its
 * contents are recursively deleted.
 */
export async function deleteAsync(
  fileUri: string,
  options: IFileSystemDeletingOptions = {},
): Promise<void> {
  if (!expoFileSystem?.deleteAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'deleteAsync',
    );
  }
  return await expoFileSystem.deleteAsync(fileUri, options);
}

/**
 * Move a file or directory to a new location.
 */
export async function moveAsync(
  options: IFileSystemRelocatingOptions,
): Promise<void> {
  if (!expoFileSystem?.moveAsync) {
    throw new UnavailabilityError('@symbiote-native/file-system', 'moveAsync');
  }
  return await expoFileSystem.moveAsync(options);
}

/**
 * Create a copy of a file or directory. Directories are recursively copied with all of their
 * contents. Also works to copy content shared by other apps into local storage.
 */
export async function copyAsync(
  options: IFileSystemRelocatingOptions,
): Promise<void> {
  if (!expoFileSystem?.copyAsync) {
    throw new UnavailabilityError('@symbiote-native/file-system', 'copyAsync');
  }
  return await expoFileSystem.copyAsync(options);
}

/**
 * Create a new empty directory.
 */
export async function makeDirectoryAsync(
  fileUri: string,
  options: IFileSystemMakeDirectoryOptions = {},
): Promise<void> {
  if (!expoFileSystem?.makeDirectoryAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'makeDirectoryAsync',
    );
  }
  return await expoFileSystem.makeDirectoryAsync(fileUri, options);
}

/**
 * Enumerate the contents of a directory.
 */
export async function readDirectoryAsync(fileUri: string): Promise<string[]> {
  if (!expoFileSystem?.readDirectoryAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'readDirectoryAsync',
    );
  }
  return await expoFileSystem.readDirectoryAsync(fileUri);
}

/**
 * Gets the available internal disk storage size, in bytes.
 */
export async function getFreeDiskStorageAsync(): Promise<number> {
  if (!expoFileSystem?.getFreeDiskStorageAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'getFreeDiskStorageAsync',
    );
  }
  return await expoFileSystem.getFreeDiskStorageAsync();
}

/**
 * Gets total internal disk storage size, in bytes.
 */
export async function getTotalDiskCapacityAsync(): Promise<number> {
  if (!expoFileSystem?.getTotalDiskCapacityAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'getTotalDiskCapacityAsync',
    );
  }
  return await expoFileSystem.getTotalDiskCapacityAsync();
}

/**
 * Download the contents at a remote URI to a file in the app's file system. The directory for
 * the local file URI must exist prior to calling this function.
 */
export async function downloadAsync(
  uri: string,
  fileUri: string,
  options: IFileSystemDownloadOptions = {},
): Promise<IFileSystemDownloadResult> {
  if (!expoFileSystem?.downloadAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'downloadAsync',
    );
  }
  return await expoFileSystem.downloadAsync(uri, fileUri, {
    sessionType: FileSystemSessionType.BACKGROUND,
    ...options,
  });
}

/**
 * Upload the contents of the file pointed by `fileUri` to the remote url.
 */
export async function uploadAsync(
  url: string,
  fileUri: string,
  options: IFileSystemUploadOptions = {},
): Promise<IFileSystemUploadResult> {
  if (!expoFileSystem?.uploadAsync) {
    throw new UnavailabilityError(
      '@symbiote-native/file-system',
      'uploadAsync',
    );
  }
  return await expoFileSystem.uploadAsync(url, fileUri, {
    sessionType: FileSystemSessionType.BACKGROUND,
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    ...options,
    httpMethod: (
      options.httpMethod || 'POST'
    ).toUpperCase() as IFileSystemAcceptedUploadHttpMethod,
  });
}

/**
 * Create a `DownloadResumable` object which can start, pause, and resume a download of contents
 * at a remote URI to a file in the app's file system.
 */
export function createDownloadResumable(
  uri: string,
  fileUri: string,
  options?: IFileSystemDownloadOptions,
  callback?: IFileSystemNetworkTaskProgressCallback<IFileSystemDownloadProgressData>,
  resumeData?: string,
): DownloadResumable {
  return new DownloadResumable(uri, fileUri, options, callback, resumeData);
}

export function createUploadTask(
  url: string,
  fileUri: string,
  options?: IFileSystemUploadOptions,
  callback?: IFileSystemNetworkTaskProgressCallback<IFileSystemUploadProgressData>,
): UploadTask {
  return new UploadTask(url, fileUri, options, callback);
}

export abstract class FileSystemCancellableNetworkTask<
  T extends IFileSystemDownloadProgressData | IFileSystemUploadProgressData,
> {
  private _uuid = uuid.v4();
  protected taskWasCanceled = false;
  private subscription?: EventSubscription | null;

  public async cancelAsync(): Promise<void> {
    if (!expoFileSystem?.networkTaskCancelAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'networkTaskCancelAsync',
      );
    }
    this.removeSubscription();
    this.taskWasCanceled = true;
    return await expoFileSystem.networkTaskCancelAsync(this.uuid);
  }

  protected isTaskCancelled(): boolean {
    if (this.taskWasCanceled) {
      console.warn('This task was already canceled.');
      return true;
    }
    return false;
  }

  protected get uuid(): string {
    return this._uuid;
  }

  protected abstract getEventName(): string;

  protected abstract getCallback():
    IFileSystemNetworkTaskProgressCallback<T> | undefined;

  protected addSubscription() {
    if (this.subscription || !expoFileSystem?.addListener) {
      return;
    }
    this.subscription = expoFileSystem.addListener(
      this.getEventName(),
      (event: unknown) => {
        const progressEvent = event as IFileSystemProgressEvent<T>;
        if (progressEvent.uuid === this.uuid) {
          const callback = this.getCallback();
          if (callback) {
            callback(progressEvent.data);
          }
        }
      },
    );
  }

  protected removeSubscription() {
    if (!this.subscription) {
      return;
    }
    this.subscription.remove();
    this.subscription = null;
  }
}

export class UploadTask extends FileSystemCancellableNetworkTask<IFileSystemUploadProgressData> {
  private options: IFileSystemUploadOptions;

  constructor(
    private url: string,
    private fileUri: string,
    options?: IFileSystemUploadOptions,
    private callback?: IFileSystemNetworkTaskProgressCallback<IFileSystemUploadProgressData>,
  ) {
    super();

    const httpMethod = (options?.httpMethod?.toUpperCase() ||
      'POST') as IFileSystemAcceptedUploadHttpMethod;

    this.options = {
      sessionType: FileSystemSessionType.BACKGROUND,
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      ...options,
      httpMethod,
    };
  }

  protected getEventName(): string {
    return 'expo-file-system.uploadProgress';
  }

  protected getCallback():
    | IFileSystemNetworkTaskProgressCallback<IFileSystemUploadProgressData>
    | undefined {
    return this.callback;
  }

  public async uploadAsync(): Promise<
    IFileSystemUploadResult | undefined | null
  > {
    if (!expoFileSystem?.uploadTaskStartAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'uploadTaskStartAsync',
      );
    }
    if (this.isTaskCancelled()) {
      return;
    }
    this.addSubscription();
    const result = await expoFileSystem.uploadTaskStartAsync(
      this.url,
      this.fileUri,
      this.uuid,
      this.options,
    );
    this.removeSubscription();
    return result;
  }
}

export class DownloadResumable extends FileSystemCancellableNetworkTask<IFileSystemDownloadProgressData> {
  constructor(
    private url: string,
    private _fileUri: string,
    private options: IFileSystemDownloadOptions = {},
    private callback?: IFileSystemNetworkTaskProgressCallback<IFileSystemDownloadProgressData>,
    private resumeData?: string,
  ) {
    super();
  }

  public get fileUri(): string {
    return this._fileUri;
  }

  protected getEventName(): string {
    return 'expo-file-system.downloadProgress';
  }

  protected getCallback():
    | IFileSystemNetworkTaskProgressCallback<IFileSystemDownloadProgressData>
    | undefined {
    return this.callback;
  }

  /**
   * Download the contents at a remote URI to a file in the app's file system.
   */
  async downloadAsync(): Promise<IFileSystemDownloadResult | undefined> {
    if (!expoFileSystem?.downloadResumableStartAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'downloadResumableStartAsync',
      );
    }
    if (this.isTaskCancelled()) {
      return;
    }
    this.addSubscription();
    return await expoFileSystem.downloadResumableStartAsync(
      this.url,
      this._fileUri,
      this.uuid,
      this.options,
      this.resumeData,
    );
  }

  /**
   * Pause the current download operation. `resumeData` is added to the `DownloadResumable`
   * object after a successful pause operation. Returns an object that can be persisted
   * (e.g. via a storage module) for future retrieval.
   */
  async pauseAsync(): Promise<IFileSystemDownloadPauseState> {
    if (!expoFileSystem?.downloadResumablePauseAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'downloadResumablePauseAsync',
      );
    }

    if (this.isTaskCancelled()) {
      return {
        fileUri: this._fileUri,
        options: this.options,
        url: this.url,
      };
    }

    const pauseResult = await expoFileSystem.downloadResumablePauseAsync(
      this.uuid,
    );
    this.removeSubscription();
    if (pauseResult) {
      this.resumeData = pauseResult.resumeData;
      return this.savable();
    }
    throw new Error('Unable to generate a savable pause state');
  }

  /**
   * Resume a paused download operation.
   */
  async resumeAsync(): Promise<IFileSystemDownloadResult | undefined> {
    if (!expoFileSystem?.downloadResumableStartAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'downloadResumableStartAsync',
      );
    }
    if (this.isTaskCancelled()) {
      return;
    }
    this.addSubscription();
    return await expoFileSystem.downloadResumableStartAsync(
      this.url,
      this.fileUri,
      this.uuid,
      this.options,
      this.resumeData,
    );
  }

  /**
   * The object which can be persisted for future retrieval (e.g. via a storage module), and
   * fed back into `createDownloadResumable` after an app restart.
   */
  savable(): IFileSystemDownloadPauseState {
    return {
      url: this.url,
      fileUri: this.fileUri,
      options: this.options,
      resumeData: this.resumeData,
    };
  }
}

const baseReadAsStringAsync = readAsStringAsync;
const baseWriteAsStringAsync = writeAsStringAsync;
const baseDeleteAsync = deleteAsync;
const baseMoveAsync = moveAsync;
const baseCopyAsync = copyAsync;

/**
 * `StorageAccessFramework` encapsulates the functions usable with SAF URIs, for accessing
 * user-selected directories outside the app's own storage.
 * @platform android
 */
export const StorageAccessFramework = {
  /**
   * Gets a SAF URI pointing to a folder in the Android root directory, given the folder name.
   * @platform android
   */
  getUriForDirectoryInRoot(folderName: string): string {
    return `content://com.android.externalstorage.documents/tree/primary:${folderName}/document/primary:${folderName}`;
  },

  /**
   * Allows users to select a specific directory, granting the app access to all of the files and
   * sub-directories within it.
   * @platform android 11+
   */
  async requestDirectoryPermissionsAsync(
    initialFileUrl: string | null = null,
  ): Promise<IFileSystemRequestDirectoryPermissionsResult> {
    if (!expoFileSystem?.requestDirectoryPermissionsAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'StorageAccessFramework.requestDirectoryPermissionsAsync',
      );
    }
    return await expoFileSystem.requestDirectoryPermissionsAsync(
      initialFileUrl,
    );
  },

  /**
   * Enumerate the contents of a directory addressed by a SAF URI.
   * @platform android
   */
  async readDirectoryAsync(dirUri: string): Promise<string[]> {
    if (!expoFileSystem?.readSAFDirectoryAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'StorageAccessFramework.readDirectoryAsync',
      );
    }
    return await expoFileSystem.readSAFDirectoryAsync(dirUri);
  },

  /**
   * Creates a new empty directory addressed by a SAF URI.
   * @platform android
   */
  async makeDirectoryAsync(
    parentUri: string,
    dirName: string,
  ): Promise<string> {
    if (!expoFileSystem?.makeSAFDirectoryAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'StorageAccessFramework.makeDirectoryAsync',
      );
    }
    return await expoFileSystem.makeSAFDirectoryAsync(parentUri, dirName);
  },

  /**
   * Creates a new empty file addressed by a SAF URI.
   * @platform android
   */
  async createFileAsync(
    parentUri: string,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    if (!expoFileSystem?.createSAFFileAsync) {
      throw new UnavailabilityError(
        '@symbiote-native/file-system',
        'StorageAccessFramework.createFileAsync',
      );
    }
    return await expoFileSystem.createSAFFileAsync(
      parentUri,
      fileName,
      mimeType,
    );
  },

  writeAsStringAsync: baseWriteAsStringAsync,
  readAsStringAsync: baseReadAsStringAsync,
  deleteAsync: baseDeleteAsync,
  moveAsync: baseMoveAsync,
  copyAsync: baseCopyAsync,
};
