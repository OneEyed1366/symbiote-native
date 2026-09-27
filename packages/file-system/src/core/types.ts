export enum FileSystemSessionType {
  BACKGROUND = 0,
  FOREGROUND = 1,
}

export enum FileSystemUploadType {
  BINARY_CONTENT = 0,
  MULTIPART = 1,
}

export type IFileSystemDownloadOptions = {
  md5?: boolean;
  cache?: boolean;
  headers?: Record<string, string>;
  sessionType?: FileSystemSessionType;
};

export type IFileSystemHttpResult = {
  headers: Record<string, string>;
  status: number;
  mimeType: string | null;
};

export type IFileSystemDownloadResult = IFileSystemHttpResult & {
  uri: string;
  md5?: string;
};

export type IFileSystemAcceptedUploadHttpMethod = 'POST' | 'PUT' | 'PATCH';

export type IFileSystemUploadOptionsBinary = {
  uploadType?: FileSystemUploadType;
};

export type IFileSystemUploadOptionsMultipart = {
  uploadType: FileSystemUploadType;
  fieldName?: string;
  mimeType?: string;
  parameters?: Record<string, string>;
};

export type IFileSystemUploadOptions = (
  IFileSystemUploadOptionsBinary | IFileSystemUploadOptionsMultipart
) & {
  headers?: Record<string, string>;
  httpMethod?: IFileSystemAcceptedUploadHttpMethod;
  sessionType?: FileSystemSessionType;
};

export type IFileSystemUploadResult = IFileSystemHttpResult & {
  body: string;
};

export type IFileSystemNetworkTaskProgressCallback<
  T extends IFileSystemDownloadProgressData | IFileSystemUploadProgressData,
> = (data: T) => void;

export type IFileSystemDownloadProgressData = {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
};

export type IFileSystemUploadProgressData = {
  totalBytesSent: number;
  totalBytesExpectedToSend: number;
};

export type IFileSystemDownloadPauseState = {
  url: string;
  fileUri: string;
  options: IFileSystemDownloadOptions;
  resumeData?: string;
};

export type IFileSystemFileInfo =
  | {
      exists: true;
      uri: string;
      size: number;
      isDirectory: boolean;
      modificationTime: number;
      md5?: string;
    }
  | {
      exists: false;
      uri: string;
      isDirectory: false;
    };

export enum FileSystemEncodingType {
  UTF8 = 'utf8',
  Base64 = 'base64',
}

export type IFileSystemReadingOptions = {
  encoding?: FileSystemEncodingType | 'utf8' | 'base64';
  position?: number;
  length?: number;
};

export type IFileSystemWritingOptions = {
  encoding?: FileSystemEncodingType | 'utf8' | 'base64';
  append?: boolean;
};

export type IFileSystemDeletingOptions = {
  idempotent?: boolean;
};

export type IFileSystemInfoOptions = {
  md5?: boolean;
};

export type IFileSystemRelocatingOptions = {
  from: string;
  to: string;
};

export type IFileSystemMakeDirectoryOptions = {
  intermediates?: boolean;
};

export type IFileSystemProgressEvent<T> = {
  uuid: string;
  data: T;
};

export type IFileSystemRequestDirectoryPermissionsResult =
  | {
      granted: false;
    }
  | {
      granted: true;
      directoryUri: string;
    };
