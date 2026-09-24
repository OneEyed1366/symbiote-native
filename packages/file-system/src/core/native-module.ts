import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';

import type {
  IFileSystemDeletingOptions,
  IFileSystemDownloadOptions,
  IFileSystemDownloadResult,
  IFileSystemFileInfo,
  IFileSystemInfoOptions,
  IFileSystemMakeDirectoryOptions,
  IFileSystemRelocatingOptions,
  IFileSystemRequestDirectoryPermissionsResult,
  IFileSystemUploadOptions,
  IFileSystemUploadResult,
  IFileSystemWritingOptions,
} from './types';

export type INativeFileSystemModule = {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  bundleDirectory: string | null;

  getInfoAsync?: (
    fileUri: string,
    options: IFileSystemInfoOptions,
  ) => Promise<IFileSystemFileInfo>;
  readAsStringAsync?: (
    fileUri: string,
    options: Record<string, unknown>,
  ) => Promise<string>;
  getContentUriAsync?: (fileUri: string) => Promise<string>;
  writeAsStringAsync?: (
    fileUri: string,
    contents: string,
    options: IFileSystemWritingOptions,
  ) => Promise<void>;
  deleteAsync?: (
    fileUri: string,
    options: IFileSystemDeletingOptions,
  ) => Promise<void>;
  moveAsync?: (options: IFileSystemRelocatingOptions) => Promise<void>;
  copyAsync?: (options: IFileSystemRelocatingOptions) => Promise<void>;
  makeDirectoryAsync?: (
    fileUri: string,
    options: IFileSystemMakeDirectoryOptions,
  ) => Promise<void>;
  readDirectoryAsync?: (fileUri: string) => Promise<string[]>;
  getFreeDiskStorageAsync?: () => Promise<number>;
  getTotalDiskCapacityAsync?: () => Promise<number>;
  downloadAsync?: (
    uri: string,
    fileUri: string,
    options: IFileSystemDownloadOptions,
  ) => Promise<IFileSystemDownloadResult>;
  uploadAsync?: (
    url: string,
    fileUri: string,
    options: IFileSystemUploadOptions,
  ) => Promise<IFileSystemUploadResult>;
  networkTaskCancelAsync?: (uuid: string) => Promise<void>;
  addListener?: (
    eventName: string,
    callback: (event: unknown) => void,
  ) => EventSubscription;
  uploadTaskStartAsync?: (
    url: string,
    fileUri: string,
    uuid: string,
    options: IFileSystemUploadOptions,
  ) => Promise<IFileSystemUploadResult | undefined | null>;
  downloadResumableStartAsync?: (
    url: string,
    fileUri: string,
    uuid: string,
    options: IFileSystemDownloadOptions,
    resumeData?: string,
  ) => Promise<IFileSystemDownloadResult | undefined>;
  downloadResumablePauseAsync?: (
    uuid: string,
  ) => Promise<{ resumeData?: string } | undefined>;
  requestDirectoryPermissionsAsync?: (
    initialFileUrl: string | null,
  ) => Promise<IFileSystemRequestDirectoryPermissionsResult>;
  readSAFDirectoryAsync?: (dirUri: string) => Promise<string[]>;
  makeSAFDirectoryAsync?: (
    parentUri: string,
    dirName: string,
  ) => Promise<string>;
  createSAFFileAsync?: (
    parentUri: string,
    fileName: string,
    mimeType: string,
  ) => Promise<string>;
};

export const expoFileSystem =
  requireOptionalNativeModule<INativeFileSystemModule>('ExponentFileSystem');
