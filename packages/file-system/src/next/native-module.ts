import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

import type { Directory } from './directory';
import type { File } from './file';
import type {
  IDirectoryCreateOptions,
  IDirectoryInfo,
  IFileCreateOptions,
  IFileInfo,
  IFileSystemDownloadOptions,
  IFileSystemDownloadProgress,
  IFileSystemHandle,
  IFileSystemInfoOptions,
  IFileSystemUploadProgress,
  IFileSystemUploadResult,
  IFileSystemWatchEvent,
  IFileSystemWatchOptions,
  IFileWriteOptions,
  IPathInfo,
  IPickMultipleFilesOptions,
  IPickSingleFileOptions,
  IRelocationOptions,
  FileMode,
} from './types';

// Mirrors upstream's own native-module declaration shape (ExpoFileSystem.ts / internal/
// NativeFileSystem.types.ts): `declare class`, not a plain object type — a class declaration
// gives TypeScript both a proper instance type AND a proper `typeof X` constructor type, which
// is what `class File extends expoFileSystemNext.FileSystemFile {}` needs to resolve overrides
// correctly. An object type with a self-referential `new(...): T` signature does NOT behave the
// same way and produced spurious `override` errors — the base classes below are handed to JS by
// native code through the JSI SharedObject mechanism, so this declaration exists purely for the
// type checker; there is no runtime implementation here.
//
// requireOptionalNativeModule's soft-null fallback (used everywhere else in this repo) cannot
// work here either: `extends null` throws immediately, so a hard requireNativeModule — matching
// upstream's own choice — is the correct behavior, not a convention break.

export declare class NativeFileSystemDirectory {
  constructor(...uris: (string | File | Directory)[]);
  readonly uri: string;
  validatePath(): void;
  delete(): void;
  exists: boolean;
  create(options?: IDirectoryCreateOptions): void;
  createFile(name: string, mimeType: string | null): File;
  createDirectory(name: string): Directory;
  copy(
    destination: Directory | File,
    options?: IRelocationOptions,
  ): Promise<void>;
  copySync(destination: Directory | File, options?: IRelocationOptions): void;
  move(
    destination: Directory | File,
    options?: IRelocationOptions,
  ): Promise<void>;
  moveSync(destination: Directory | File, options?: IRelocationOptions): void;
  rename(newName: string): void;
  listAsRecords(): { isDirectory: boolean; uri: string }[];
  list(): (Directory | File)[];
  info(): IDirectoryInfo;
  size: number | null;
}

export declare class NativeFileSystemFile {
  constructor(...uris: (string | File | Directory)[]);
  get uri(): string;
  validatePath(): void;
  text(): Promise<string>;
  textSync(): string;
  base64(): Promise<string>;
  base64Sync(): string;
  bytes(): Promise<Uint8Array<ArrayBuffer>>;
  bytesSync(): Uint8Array;
  write(content: string | Uint8Array, options?: IFileWriteOptions): void;
  delete(): void;
  info(options?: IFileSystemInfoOptions): IFileInfo;
  exists: boolean;
  create(options?: IFileCreateOptions): void;
  copy(
    destination: Directory | File,
    options?: IRelocationOptions,
  ): Promise<void>;
  copySync(destination: Directory | File, options?: IRelocationOptions): void;
  move(
    destination: Directory | File,
    options?: IRelocationOptions,
  ): Promise<void>;
  moveSync(destination: Directory | File, options?: IRelocationOptions): void;
  rename(newName: string): void;
  open(mode?: FileMode): IFileSystemHandle;
  size: number;
  md5: string | null;
  modificationTime: number | null;
  lastModified: number | null;
  creationTime: number | null;
  type: string;
  contentUri: string;
}

export declare class NativeFileSystemUploadTask {
  start(
    url: string,
    file: File,
    options: Record<string, unknown>,
  ): Promise<IFileSystemUploadResult>;
  cancel(): void;
  release(): void;
  addListener(
    eventName: 'progress',
    listener: (data: IFileSystemUploadProgress) => void,
  ): EventSubscription;
}

export declare class NativeFileSystemDownloadTask {
  start(
    url: string,
    to: File | Directory,
    options?: Record<string, unknown>,
  ): Promise<string | null>;
  pause(): Promise<{ resumeData?: string } | undefined>;
  resume(
    url: string,
    to: File | Directory,
    resumeData: string,
    options?: Record<string, unknown>,
  ): Promise<string | null>;
  cancel(): void;
  release(): void;
  addListener(
    eventName: 'progress',
    listener: (data: IFileSystemDownloadProgress) => void,
  ): EventSubscription;
}

export type INativeFileSystemWatcherEvent = {
  type: IFileSystemWatchEvent<File | Directory>['type'];
  path: string;
  isDirectory: boolean;
  nativeEventFlags?: number;
  newPath?: string;
  newPathIsDirectory?: boolean;
};

export declare class NativeFileSystemWatcher {
  constructor(path: string, options?: IFileSystemWatchOptions);
  start(): void;
  stop(): void;
  addListener(
    eventName: 'change',
    listener: (event: INativeFileSystemWatcherEvent) => void,
  ): EventSubscription;
}

export type INativeFileSystemNextModule = {
  FileSystemDirectory: typeof NativeFileSystemDirectory;
  FileSystemFile: typeof NativeFileSystemFile;
  FileSystemUploadTask: typeof NativeFileSystemUploadTask;
  FileSystemDownloadTask: typeof NativeFileSystemDownloadTask;
  FileSystemWatcher: typeof NativeFileSystemWatcher;
  downloadFileAsync(
    url: string,
    destination: File | Directory,
    options?: IFileSystemDownloadOptions,
    uuid?: string,
  ): Promise<string>;
  cancelDownloadAsync(uuid: string): void;
  pickDirectoryAsync(initialUri?: string): Promise<Directory>;
  pickFileAsync(options: IPickSingleFileOptions): Promise<File>;
  pickFileAsync(options: IPickMultipleFilesOptions): Promise<File[]>;
  info(uri: string): IPathInfo;
  totalDiskSpace: number;
  availableDiskSpace: number;
  documentDirectory: string;
  cacheDirectory: string;
  bundleDirectory: string;
  appleSharedContainers?: Record<string, string>;
  addListener(
    eventName: 'downloadProgress',
    listener: (data: {
      uuid: string;
      data: IFileSystemDownloadProgress;
    }) => void,
  ): EventSubscription;
};

export const expoFileSystemNext =
  requireNativeModule<INativeFileSystemNextModule>('FileSystem');
