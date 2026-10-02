import { Component, signal } from '@angular/core';
import * as Legacy from '@symbiote-native/file-system/legacy';
import type {
  DownloadResumable,
  UploadTask as LegacyUploadTask,
} from '@symbiote-native/file-system/legacy';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ENCODINGS = Object.values(Legacy.FileSystemEncodingType).map(value => ({
  label: value,
  value,
}));

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function need<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`create ${label} first`);
  }
  return value;
}

@Component({
  selector: 'FileSystemLegacy',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="file-system-legacy-form-card" title="Legacy inputs">
      <Field
        testID="file-system-legacy-uri-input"
        label="file or directory uri"
        [(value)]="fileUri"
      />
      <Field
        testID="file-system-legacy-to-input"
        label="destination uri for copy and move"
        [(value)]="toUri"
      />
      <Field
        testID="file-system-legacy-content-input"
        label="content for writeAsStringAsync"
        [(value)]="content"
      />
      <Field
        testID="file-system-legacy-download-input"
        label="download url"
        [(value)]="downloadUrl"
      />
      <Field
        testID="file-system-legacy-upload-input"
        label="upload url"
        [(value)]="uploadUrl"
      />
      <Field
        testID="file-system-legacy-saf-input"
        label="SAF folder name (Android)"
        [(value)]="safFolder"
      />
      <Field
        testID="file-system-legacy-position-input"
        label="position (readAsStringAsync)"
        [(value)]="position"
      />
      <Field
        testID="file-system-legacy-length-input"
        label="length (readAsStringAsync)"
        [(value)]="length"
      />
      <ChoiceRow
        testID="file-system-legacy-encoding"
        label="encoding"
        [options]="encodings"
        [(value)]="encoding"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-legacy-idempotent-switch"
        label="idempotent"
        [(value)]="isIdempotent"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-legacy-intermediates-switch"
        label="intermediates"
        [(value)]="isIntermediates"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-legacy-md5-switch"
        label="md5 (getInfoAsync)"
        [(value)]="isMd5"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-legacy-cache-switch"
        label="cache (downloadAsync)"
        [(value)]="isCache"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="file-system-legacy-files"
      title="Legacy file functions"
      [color]="color"
      [calls]="fileCalls"
    />
    <CallConsole
      prefix="file-system-legacy-transfers"
      title="Legacy transfers"
      [color]="color"
      [hint]="'Progress: ' + progress()"
      [calls]="transferCalls"
    />
    <CallConsole
      prefix="file-system-saf"
      title="StorageAccessFramework (Android)"
      [color]="color"
      [calls]="safCalls"
    />
  `,
})
export class FileSystemLegacy {
  readonly color = lineColorOf(ROUTE_NAME.FileSystem);
  readonly encodings = ENCODINGS;

  readonly fileUri = signal('');
  readonly toUri = signal('');
  readonly content = signal('hello from the legacy file-system API');
  readonly downloadUrl = signal('https://proof.ovh.net/files/1Mb.dat');
  readonly uploadUrl = signal('https://httpbin.org/post');
  readonly safFolder = signal('Documents');
  readonly position = signal('');
  readonly length = signal('');
  readonly encoding = signal(Legacy.FileSystemEncodingType.UTF8);
  readonly isIdempotent = signal(true);
  readonly isIntermediates = signal(true);
  readonly isMd5 = signal(false);
  readonly isCache = signal(false);
  readonly progress = signal('no transfer yet');

  private safDirectory = '';
  private resumable: DownloadResumable | null = null;
  private upload: LegacyUploadTask | null = null;

  private uri(): string {
    return this.fileUri() || `${Legacy.cacheDirectory}symbiote-legacy.txt`;
  }

  private to(): string {
    return this.toUri() || `${Legacy.cacheDirectory}symbiote-legacy-copy.txt`;
  }

  private target(): string {
    return (
      this.fileUri() || `${Legacy.cacheDirectory}symbiote-legacy-download.dat`
    );
  }

  private rootUri(): string {
    return Legacy.StorageAccessFramework.getUriForDirectoryInRoot(
      this.safFolder() || 'Documents',
    );
  }

  private base(): string {
    if (this.safDirectory === '') {
      throw new Error('call requestDirectoryPermissionsAsync first');
    }
    return this.safDirectory;
  }

  readonly fileCalls = [
    {
      label: 'documentDirectory, cacheDirectory, bundleDirectory',
      run: async () => ({
        document: Legacy.documentDirectory,
        cache: Legacy.cacheDirectory,
        bundle: Legacy.bundleDirectory,
      }),
    },
    {
      label: 'getInfoAsync',
      run: () => Legacy.getInfoAsync(this.uri(), { md5: this.isMd5() }),
    },
    {
      label: 'readAsStringAsync',
      run: () =>
        Legacy.readAsStringAsync(this.uri(), {
          encoding: this.encoding(),
          position: optionalNumber(this.position()),
          length: optionalNumber(this.length()),
        }),
    },
    {
      label: 'writeAsStringAsync',
      run: () =>
        Legacy.writeAsStringAsync(this.uri(), this.content(), {
          encoding: this.encoding(),
        }),
    },
    {
      label: 'deleteAsync',
      run: () =>
        Legacy.deleteAsync(this.uri(), { idempotent: this.isIdempotent() }),
    },
    {
      label: 'moveAsync',
      run: () => Legacy.moveAsync({ from: this.uri(), to: this.to() }),
    },
    {
      label: 'copyAsync',
      run: () => Legacy.copyAsync({ from: this.uri(), to: this.to() }),
    },
    {
      label: 'makeDirectoryAsync',
      run: () =>
        Legacy.makeDirectoryAsync(this.uri(), {
          intermediates: this.isIntermediates(),
        }),
    },
    {
      label: 'readDirectoryAsync',
      run: () => Legacy.readDirectoryAsync(this.uri()),
    },
    {
      label: 'getContentUriAsync (Android)',
      run: () => Legacy.getContentUriAsync(this.uri()),
    },
    {
      label: 'getFreeDiskStorageAsync',
      run: () => Legacy.getFreeDiskStorageAsync(),
    },
    {
      label: 'getTotalDiskCapacityAsync',
      run: () => Legacy.getTotalDiskCapacityAsync(),
    },
  ];

  readonly transferCalls = [
    {
      label: 'downloadAsync',
      run: () =>
        Legacy.downloadAsync(this.downloadUrl(), this.target(), {
          cache: this.isCache(),
        }),
    },
    {
      label: 'uploadAsync',
      run: () =>
        Legacy.uploadAsync(this.uploadUrl(), this.target(), {
          httpMethod: 'POST',
          uploadType: Legacy.FileSystemUploadType.BINARY_CONTENT,
        }),
    },
    {
      label: 'createDownloadResumable',
      run: async () => {
        this.resumable = Legacy.createDownloadResumable(
          this.downloadUrl(),
          this.target(),
          {},
          data => {
            this.progress.set(
              `${data.totalBytesWritten}/${data.totalBytesExpectedToWrite}`,
            );
          },
        );
        return 'created';
      },
    },
    {
      label: 'resumable downloadAsync',
      run: () => need(this.resumable, 'a resumable').downloadAsync(),
    },
    {
      label: 'resumable pauseAsync',
      run: () => need(this.resumable, 'a resumable').pauseAsync(),
    },
    {
      label: 'resumable resumeAsync',
      run: () => need(this.resumable, 'a resumable').resumeAsync(),
    },
    {
      label: 'resumable cancelAsync',
      run: () => need(this.resumable, 'a resumable').cancelAsync(),
    },
    {
      label: 'createUploadTask',
      run: async () => {
        this.upload = Legacy.createUploadTask(
          this.uploadUrl(),
          this.target(),
          {},
          data => {
            this.progress.set(
              `${data.totalBytesSent}/${data.totalBytesExpectedToSend}`,
            );
          },
        );
        return 'created';
      },
    },
    {
      label: 'upload task uploadAsync',
      run: () => need(this.upload, 'an upload task').uploadAsync(),
    },
    {
      label: 'upload task cancelAsync',
      run: () => need(this.upload, 'an upload task').cancelAsync(),
    },
  ];

  readonly safCalls = [
    { label: 'getUriForDirectoryInRoot', run: async () => this.rootUri() },
    {
      label: 'requestDirectoryPermissionsAsync',
      run: async () => {
        const result =
          await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync(
            this.rootUri(),
          );
        if (result.granted) {
          this.safDirectory = result.directoryUri;
        }
        return result;
      },
    },
    {
      label: 'SAF readDirectoryAsync',
      run: () => Legacy.StorageAccessFramework.readDirectoryAsync(this.base()),
    },
    {
      label: 'SAF makeDirectoryAsync',
      run: () =>
        Legacy.StorageAccessFramework.makeDirectoryAsync(
          this.base(),
          'symbiote-saf',
        ),
    },
    {
      label: 'SAF createFileAsync',
      run: () =>
        Legacy.StorageAccessFramework.createFileAsync(
          this.base(),
          'symbiote-saf',
          'text/plain',
        ),
    },
    {
      label: 'SAF writeAsStringAsync',
      run: () =>
        Legacy.StorageAccessFramework.writeAsStringAsync(
          this.fileUri(),
          this.content(),
        ),
    },
    {
      label: 'SAF readAsStringAsync',
      run: () =>
        Legacy.StorageAccessFramework.readAsStringAsync(this.fileUri()),
    },
    {
      label: 'SAF deleteAsync',
      run: () => Legacy.StorageAccessFramework.deleteAsync(this.fileUri()),
    },
  ];
}
