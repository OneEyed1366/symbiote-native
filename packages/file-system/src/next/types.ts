import type { File } from './file';
import type { Directory } from './directory';

export type IFileCreateOptions = {
  intermediates?: boolean;
  overwrite?: boolean;
};

export type IRelocationOptions = {
  overwrite?: boolean;
};

export enum FileSystemEncodingType {
  UTF8 = 'utf8',
  Base64 = 'base64',
}

export type IFileWriteOptions = {
  encoding?: FileSystemEncodingType | 'utf8' | 'base64';
  append?: boolean;
};

export enum FileMode {
  ReadWrite = 'rw',
  ReadOnly = 'r',
  WriteOnly = 'w',
  Append = 'wa',
  Truncate = 'wt',
}

export type IFileSystemHandle = {
  close(): void;
  readBytes(length: number): Uint8Array<ArrayBuffer>;
  writeBytes(bytes: Uint8Array): void;
  offset: number | null;
  size: number | null;
};

export type IFileInfo = {
  exists: boolean;
  uri?: string;
  size?: number;
  modificationTime?: number;
  creationTime?: number;
  md5?: string;
};

export type IFileSystemInfoOptions = {
  md5?: boolean;
};

export type IPickFileGeneralOptions = {
  initialUri?: string;
  mimeTypes?: string | string[];
  multipleFiles?: boolean;
};

export type IPickSingleFileOptions = IPickFileGeneralOptions & {
  multipleFiles?: false;
};

export type IPickMultipleFilesOptions = IPickFileGeneralOptions & {
  multipleFiles: true;
};

export type IPickFileOptions =
  IPickSingleFileOptions | IPickMultipleFilesOptions;

export type IPickSingleFileSuccessResult = {
  result: File;
  canceled: false;
};

export type IPickMultipleFilesSuccessResult = {
  result: File[];
  canceled: false;
};

export type IPickFileCanceledResult = {
  result: null;
  canceled: true;
};

export type IPickSingleFileResult =
  IPickSingleFileSuccessResult | IPickFileCanceledResult;
export type IPickMultipleFilesResult =
  IPickMultipleFilesSuccessResult | IPickFileCanceledResult;

export type IDirectoryCreateOptions = {
  intermediates?: boolean;
  overwrite?: boolean;
  idempotent?: boolean;
};

export type IDirectoryInfo = {
  exists: boolean;
  uri?: string;
  size?: number;
  modificationTime?: number;
  creationTime?: number;
  files?: string[];
};

export type IPathInfo = {
  exists: boolean;
  isDirectory: boolean | null;
};

export type IFileSystemDownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
};

export type IFileSystemDownloadOptions = {
  headers?: Record<string, string>;
  idempotent?: boolean;
  onProgress?: (data: IFileSystemDownloadProgress) => void;
  signal?: AbortSignal;
};

export enum FileSystemUploadType {
  BINARY_CONTENT = 0,
  MULTIPART = 1,
}

export type IFileSystemUploadProgress = {
  bytesSent: number;
  totalBytes: number;
};

export type IFileSystemUploadResult = {
  body: string;
  status: number;
  headers: Record<string, string>;
};

export type IFileSystemNetworkTaskSessionType = 'background' | 'foreground';

export type IFileSystemUploadOptions = {
  httpMethod?: 'POST' | 'PUT' | 'PATCH';
  uploadType?: FileSystemUploadType;
  headers?: Record<string, string>;
  fieldName?: string;
  mimeType?: string;
  parameters?: Record<string, string>;
  onProgress?: (data: IFileSystemUploadProgress) => void;
  sessionType?: IFileSystemNetworkTaskSessionType;
  signal?: AbortSignal;
};

export type IFileSystemDownloadTaskOptions = {
  headers?: Record<string, string>;
  sessionType?: IFileSystemNetworkTaskSessionType;
  onProgress?: (data: IFileSystemDownloadProgress) => void;
  signal?: AbortSignal;
};

export type IFileSystemDownloadPauseState = {
  url: string;
  fileUri: string;
  isDirectory: boolean;
  headers?: Record<string, string>;
  resumeData?: string;
};

type IFileSystemTaskState =
  'idle' | 'active' | 'paused' | 'completed' | 'cancelled' | 'error';

export type IFileSystemUploadTaskState = Exclude<
  IFileSystemTaskState,
  'paused'
>;
export type IFileSystemDownloadTaskState = IFileSystemTaskState;

export const DEFAULT_WATCH_DEBOUNCE_MS = 100;

export type IFileSystemWatchEventType =
  'created' | 'modified' | 'deleted' | 'renamed';

export type IFileSystemWatchEvent<T extends File | Directory> = {
  type: IFileSystemWatchEventType;
  target: T;
  nativeEventFlags?: number;
  newTarget?: T;
};

export type IFileSystemWatchOptions = {
  debounce?: number;
  events?: IFileSystemWatchEventType[];
};

export type IFileSystemWatchSubscription = {
  remove(): void;
};
