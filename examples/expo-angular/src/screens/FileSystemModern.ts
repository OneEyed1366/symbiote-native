import { Component, signal } from '@angular/core';
import {
  Directory,
  File,
  FileMode,
  FileSystemEncodingType,
  Paths,
} from '@symbiote-native/file-system';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { FileSystemPicker } from './FileSystemPicker';
import { FileSystemWatch } from './FileSystemWatch';

const MAX_PREVIEW_BYTES = 32;
const ENCODINGS = Object.values(FileSystemEncodingType).map(value => ({
  label: value,
  value,
}));
const MODES = Object.entries(FileMode).map(([label, value]) => ({
  label,
  value,
}));

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

@Component({
  selector: 'FileSystemModern',
  standalone: true,
  imports: [
    CallConsole,
    Card,
    ChoiceRow,
    Field,
    FileSystemPicker,
    FileSystemWatch,
    ToggleRow,
  ],
  template: `
    <Card
      testID="file-system-form-card"
      title="Inputs, everything lives under Paths.cache"
    >
      <Field
        testID="file-system-file-name-input"
        label="file name"
        [(value)]="fileName"
      />
      <Field
        testID="file-system-content-input"
        label="content for write"
        [(value)]="content"
      />
      <Field
        testID="file-system-dir-name-input"
        label="directory name"
        [(value)]="dirName"
      />
      <Field
        testID="file-system-target-input"
        label="new name for rename"
        [(value)]="targetName"
      />
      <ChoiceRow
        testID="file-system-encoding"
        label="encoding"
        [options]="encodings"
        [(value)]="encoding"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-append-switch"
        label="append"
        [(value)]="isAppend"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-overwrite-switch"
        label="overwrite"
        [(value)]="isOverwrite"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-intermediates-switch"
        label="intermediates"
        [(value)]="isIntermediates"
        [color]="color"
      />
      <ToggleRow
        testID="file-system-idempotent-switch"
        label="idempotent (directory create)"
        [(value)]="isIdempotent"
        [color]="color"
      />
      <Field
        testID="file-system-slice-start-input"
        label="slice start"
        [(value)]="sliceStart"
      />
      <Field
        testID="file-system-slice-end-input"
        label="slice end"
        [(value)]="sliceEnd"
      />
      <ChoiceRow
        testID="file-system-mode"
        label="FileMode for open"
        [options]="modes"
        [(value)]="mode"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="file-system-paths"
      title="Paths"
      [color]="color"
      [calls]="pathCalls"
    />
    <CallConsole
      prefix="file-system-file-write"
      title="File write and read"
      [color]="color"
      [calls]="writeCalls"
    />
    <CallConsole
      prefix="file-system-file-meta"
      title="File metadata and moves"
      [color]="color"
      [calls]="metaCalls"
    />
    <CallConsole
      prefix="file-system-directory"
      title="Directory"
      [color]="color"
      [calls]="directoryCalls"
    />
    <FileSystemPicker />
    <FileSystemWatch [dirName]="dirName()" />
  `,
})
export class FileSystemModern {
  readonly color = lineColorOf(ROUTE_NAME.FileSystem);
  readonly encodings = ENCODINGS;
  readonly modes = MODES;

  readonly fileName = signal('symbiote-demo.txt');
  readonly content = signal('hello from the modern file-system API');
  readonly dirName = signal('symbiote-demo-dir');
  readonly targetName = signal('renamed-demo');
  readonly encoding = signal(FileSystemEncodingType.UTF8);
  readonly isAppend = signal(false);
  readonly isOverwrite = signal(true);
  readonly isIntermediates = signal(true);
  readonly isIdempotent = signal(true);
  readonly sliceStart = signal('0');
  readonly sliceEnd = signal('5');
  readonly mode = signal(FileMode.ReadWrite);

  private file(): File {
    return new File(Paths.cache, this.fileName());
  }

  private dir(): Directory {
    return new Directory(Paths.cache, this.dirName());
  }

  readonly pathCalls = [
    { label: 'Paths.cache', run: async () => Paths.cache.uri },
    { label: 'Paths.document', run: async () => Paths.document.uri },
    { label: 'Paths.bundle', run: async () => Paths.bundle.uri },
    {
      label: 'Paths.appleSharedContainers (iOS)',
      run: async () => Paths.appleSharedContainers,
    },
    { label: 'Paths.totalDiskSpace', run: async () => Paths.totalDiskSpace },
    {
      label: 'Paths.availableDiskSpace',
      run: async () => Paths.availableDiskSpace,
    },
    {
      label: 'Paths.info(cache)',
      run: async () => Paths.info(Paths.cache.uri),
    },
  ];

  readonly writeCalls = [
    {
      label: 'create',
      run: async () =>
        this.file().create({
          intermediates: this.isIntermediates(),
          overwrite: this.isOverwrite(),
        }),
    },
    {
      label: 'write',
      run: async () =>
        this.file().write(this.content(), {
          encoding: this.encoding(),
          append: this.isAppend(),
        }),
    },
    { label: 'text', run: () => this.file().text() },
    { label: 'textSync', run: async () => this.file().textSync() },
    { label: 'base64', run: () => this.file().base64() },
    { label: 'base64Sync', run: async () => this.file().base64Sync() },
    {
      label: 'bytes',
      run: async () =>
        Array.from((await this.file().bytes()).slice(0, MAX_PREVIEW_BYTES)),
    },
    {
      label: 'bytesSync',
      run: async () =>
        Array.from(this.file().bytesSync().slice(0, MAX_PREVIEW_BYTES)),
    },
    {
      label: 'arrayBuffer',
      run: async () => (await this.file().arrayBuffer()).byteLength,
    },
    { label: 'json', run: () => this.file().json() },
    {
      label: 'formData',
      run: async () => String(await this.file().formData()),
    },
    {
      label: 'slice',
      run: async () => {
        const blob = this.file().slice(
          optionalNumber(this.sliceStart()),
          optionalNumber(this.sliceEnd()),
        );
        return { size: blob.size, text: await blob.text() };
      },
    },
    {
      label: 'stream and readableStream',
      run: async () => {
        const reader = this.file().readableStream().getReader();
        const first = await reader.read();
        reader.releaseLock();
        return {
          viaReadableStream:
            first.value instanceof Uint8Array
              ? first.value.byteLength
              : undefined,
          viaStream: this.file().stream() !== undefined,
        };
      },
    },
    {
      label: 'writableStream',
      run: async () => {
        const writer = this.file().writableStream().getWriter();
        await writer.write(new TextEncoder().encode(this.content()));
        await writer.close();
        return 'streamed the content';
      },
    },
    {
      label: 'open (handle)',
      run: async () => {
        const handle = this.file().open(this.mode());
        try {
          const before = { offset: handle.offset, size: handle.size };
          handle.writeBytes(new TextEncoder().encode(this.content()));
          handle.offset = 0;
          return {
            before,
            read: Array.from(handle.readBytes(MAX_PREVIEW_BYTES)),
          };
        } finally {
          handle.close();
        }
      },
    },
  ];

  readonly metaCalls = [
    {
      label: 'properties',
      run: async () => {
        const target = this.file();
        return {
          exists: target.exists,
          name: target.name,
          extension: target.extension,
          size: target.size,
          md5: target.md5,
          type: target.type,
          modificationTime: target.modificationTime,
          creationTime: target.creationTime,
          contentUri: target.contentUri,
          parentDirectory: target.parentDirectory.uri,
        };
      },
    },
    {
      label: 'info({ md5: true })',
      run: async () => this.file().info({ md5: true }),
    },
    {
      label: 'copy',
      run: async () =>
        this.file().copy(this.dir(), { overwrite: this.isOverwrite() }),
    },
    {
      label: 'copySync',
      run: async () =>
        this.file().copySync(this.dir(), { overwrite: this.isOverwrite() }),
    },
    {
      label: 'move',
      run: async () =>
        this.file().move(this.dir(), { overwrite: this.isOverwrite() }),
    },
    {
      label: 'moveSync',
      run: async () =>
        this.file().moveSync(this.dir(), { overwrite: this.isOverwrite() }),
    },
    { label: 'rename', run: async () => this.file().rename(this.targetName()) },
    { label: 'delete (file)', run: async () => this.file().delete() },
  ];

  readonly directoryCalls = [
    {
      label: 'create (directory)',
      run: async () =>
        this.dir().create({
          intermediates: this.isIntermediates(),
          overwrite: this.isOverwrite(),
          idempotent: this.isIdempotent(),
        }),
    },
    {
      label: 'createFile',
      run: async () => this.dir().createFile(this.fileName(), 'text/plain').uri,
    },
    {
      label: 'createDirectory',
      run: async () => this.dir().createDirectory(this.targetName()).uri,
    },
    {
      label: 'list',
      run: async () =>
        this.dir()
          .list()
          .map(entry => entry.uri),
    },
    { label: 'listAsRecords', run: async () => this.dir().listAsRecords() },
    {
      label: 'info (directory)',
      run: async () => ({
        ...this.dir().info(),
        size: this.dir().size,
        name: this.dir().name,
      }),
    },
    {
      label: 'copy (directory)',
      run: async () =>
        this.dir().copy(Paths.document, { overwrite: this.isOverwrite() }),
    },
    {
      label: 'move (directory)',
      run: async () =>
        this.dir().move(Paths.document, { overwrite: this.isOverwrite() }),
    },
    {
      label: 'rename (directory)',
      run: async () => this.dir().rename(this.targetName()),
    },
    { label: 'delete (directory)', run: async () => this.dir().delete() },
  ];
}
