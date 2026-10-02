import { Component, signal } from '@angular/core';
import {
  DownloadTask,
  File,
  FileSystemUploadType,
  Paths,
  UploadTask,
} from '@symbiote-native/file-system';
import type {
  IFileSystemDownloadPauseState,
  IFileSystemNetworkTaskSessionType,
  IFileSystemUploadOptions,
} from '@symbiote-native/file-system';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const DOWNLOAD_URL = 'https://proof.ovh.net/files/1Mb.dat';
const UPLOAD_URL = 'https://httpbin.org/post';
const METHODS = ['POST', 'PUT', 'PATCH'] as const;
type IMethod = (typeof METHODS)[number];
const SESSIONS: readonly IFileSystemNetworkTaskSessionType[] = [
  'foreground',
  'background',
];
const METHOD_CHOICES = METHODS.map(item => ({ label: item, value: item }));
const SESSION_CHOICES = SESSIONS.map(item => ({ label: item, value: item }));
const UPLOAD_TYPES = [
  { label: 'MULTIPART', value: FileSystemUploadType.MULTIPART },
  { label: 'BINARY_CONTENT', value: FileSystemUploadType.BINARY_CONTENT },
] as const;

function parseRecord(text: string): Record<string, string> | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected a JSON object');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

@Component({
  selector: 'FileSystemNetwork',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ResultRow, ToggleRow],
  template: `
    <Card testID="file-system-network-card" title="Network options">
      <Field
        testID="file-system-download-url-input"
        label="download url"
        [(value)]="downloadUrl"
      />
      <Field
        testID="file-system-upload-url-input"
        label="upload url"
        [(value)]="uploadUrl"
      />
      <Field
        testID="file-system-upload-file-input"
        label="file in Paths.cache (must exist for upload)"
        [(value)]="fileName"
      />
      <Field
        testID="file-system-headers-input"
        label="headers (JSON object)"
        [(value)]="headers"
      />
      <ToggleRow
        testID="file-system-download-idempotent-switch"
        label="idempotent (downloadFileAsync)"
        [(value)]="isIdempotent"
        [color]="color"
      />
      <ChoiceRow
        testID="file-system-http-method"
        label="httpMethod"
        [options]="methodChoices"
        [(value)]="method"
        [color]="color"
      />
      <ChoiceRow
        testID="file-system-upload-type"
        label="uploadType (FileSystemUploadType)"
        [options]="uploadTypes"
        [(value)]="uploadType"
        [color]="color"
      />
      <Field
        testID="file-system-field-name-input"
        label="fieldName (multipart)"
        [(value)]="fieldName"
      />
      <Field
        testID="file-system-upload-mime-input"
        label="mimeType (multipart)"
        [(value)]="mimeType"
      />
      <Field
        testID="file-system-parameters-input"
        label="parameters (JSON object, multipart)"
        [(value)]="parameters"
      />
      <ChoiceRow
        testID="file-system-session"
        label="sessionType"
        [options]="sessionChoices"
        [(value)]="session"
        [color]="color"
      />
    </Card>
    <ResultRow
      testID="file-system-progress"
      label="progress"
      [value]="progress()"
    />
    <CallConsole
      prefix="file-system-download"
      title="Download"
      [color]="color"
      [calls]="downloadCalls"
    />
    <CallConsole
      prefix="file-system-upload"
      title="Upload"
      [color]="color"
      hint="Uploads the file named above, create it from the File card first."
      [calls]="uploadCalls"
    />
  `,
})
export class FileSystemNetwork {
  readonly color = lineColorOf(ROUTE_NAME.FileSystem);
  readonly methodChoices = METHOD_CHOICES;
  readonly sessionChoices = SESSION_CHOICES;
  readonly uploadTypes = UPLOAD_TYPES;

  readonly downloadUrl = signal(DOWNLOAD_URL);
  readonly uploadUrl = signal(UPLOAD_URL);
  readonly headers = signal('');
  readonly isIdempotent = signal(true);
  readonly fileName = signal('symbiote-demo.txt');
  readonly method = signal<IMethod>('POST');
  readonly uploadType = signal(FileSystemUploadType.MULTIPART);
  readonly fieldName = signal('file');
  readonly mimeType = signal('text/plain');
  readonly parameters = signal('');
  readonly session = signal<IFileSystemNetworkTaskSessionType>('foreground');
  readonly progress = signal('no transfer yet');

  private pausedState: IFileSystemDownloadPauseState | null = null;
  private task: DownloadTask | null = null;
  private controller: AbortController | null = null;
  private uploadTask: UploadTask | null = null;

  private uploadOptions(
    onProgress: IFileSystemUploadOptions['onProgress'],
  ): IFileSystemUploadOptions {
    return {
      httpMethod: this.method(),
      uploadType: this.uploadType(),
      headers: parseRecord(this.headers()),
      fieldName: this.fieldName() === '' ? undefined : this.fieldName(),
      mimeType: this.mimeType() === '' ? undefined : this.mimeType(),
      parameters: parseRecord(this.parameters()),
      sessionType: this.session(),
      onProgress,
    };
  }

  private report(label: string) {
    return (data: {
      bytesWritten?: number;
      bytesSent?: number;
      totalBytes: number;
    }): void => {
      this.progress.set(
        `${label} ${data.bytesWritten ?? data.bytesSent}/${data.totalBytes}`,
      );
    };
  }

  private target(): File {
    return new File(Paths.cache, 'symbiote-download.dat');
  }

  private uploadSource(): File {
    return new File(Paths.cache, this.fileName());
  }

  private current(): DownloadTask {
    if (this.task === null) {
      throw new Error('create a download task first');
    }
    return this.task;
  }

  readonly downloadCalls = [
    {
      label: 'File.downloadFileAsync',
      run: async () => {
        this.controller = new AbortController();
        const file = await File.downloadFileAsync(
          this.downloadUrl(),
          this.target(),
          {
            headers: parseRecord(this.headers()),
            idempotent: this.isIdempotent(),
            onProgress: this.report('download'),
            signal: this.controller.signal,
          },
        );
        return { uri: file.uri, size: file.size };
      },
    },
    { label: 'abort signal', run: async () => this.controller?.abort() },
    {
      label: 'File.createDownloadTask',
      run: async () => {
        this.task = File.createDownloadTask(this.downloadUrl(), this.target(), {
          headers: parseRecord(this.headers()),
          sessionType: this.session(),
          onProgress: this.report('task'),
        });
        return this.task.state;
      },
    },
    {
      label: 'downloadAsync',
      run: async () =>
        (await this.current().downloadAsync())?.uri ??
        `null, state ${this.current().state}`,
    },
    {
      label: 'pauseAsync',
      run: async () => {
        await this.current().pauseAsync();
        return this.current().state;
      },
    },
    {
      label: 'pause',
      run: async () => {
        this.current().pause();
        return this.current().state;
      },
    },
    {
      label: 'resumeAsync',
      run: async () =>
        (await this.current().resumeAsync())?.uri ??
        `null, state ${this.current().state}`,
    },
    {
      label: 'savable',
      run: async () => {
        const saved = this.current().savable();
        this.pausedState = saved;
        return saved;
      },
    },
    {
      label: 'DownloadTask.fromSavable',
      run: async () => {
        if (this.pausedState === null) {
          throw new Error('pause a task and call savable first');
        }
        this.task = DownloadTask.fromSavable(this.pausedState, {
          onProgress: this.report('restored'),
        });
        return this.task.state;
      },
    },
    {
      label: 'cancel (download)',
      run: async () => {
        this.current().cancel();
        return this.current().state;
      },
    },
    { label: 'release (download)', run: async () => this.current().release() },
    {
      label: 'state and addListener',
      run: async () => ({
        state: this.current().state,
        subscription: typeof this.current().addListener === 'function',
      }),
    },
  ];

  readonly uploadCalls = [
    {
      label: 'File.upload',
      run: () =>
        this.uploadSource().upload(
          this.uploadUrl(),
          this.uploadOptions(this.report('upload')),
        ),
    },
    {
      label: 'File.createUploadTask',
      run: async () => {
        this.uploadTask = this.uploadSource().createUploadTask(
          this.uploadUrl(),
          this.uploadOptions(this.report('upload task')),
        );
        return this.uploadTask.state;
      },
    },
    {
      label: 'uploadAsync',
      run: async () => {
        if (this.uploadTask === null) {
          throw new Error('create an upload task first');
        }
        return this.uploadTask.uploadAsync();
      },
    },
    { label: 'cancel (upload)', run: async () => this.uploadTask?.cancel() },
    { label: 'release (upload)', run: async () => this.uploadTask?.release() },
    {
      label: 'new UploadTask',
      run: async () => {
        this.uploadTask = new UploadTask(
          this.uploadSource(),
          this.uploadUrl(),
          this.uploadOptions(undefined),
        );
        return this.uploadTask.state;
      },
    },
  ];
}
