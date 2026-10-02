<script lang="ts">
  import {
    Directory,
    File,
    FileMode,
    FileSystemEncodingType,
    Paths,
  } from '@symbiote-native/file-system';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import FileSystemPicker from './FileSystemPicker.svelte';
  import FileSystemWatch from './FileSystemWatch.svelte';

  const color = lineColorOf(ROUTE_NAME.FileSystem);
  const MAX_PREVIEW_BYTES = 32;
  const ENCODINGS = Object.values(FileSystemEncodingType).map(value => ({ label: value, value }));
  const MODES = Object.entries(FileMode).map(([label, value]) => ({ label, value }));

  type IModernForm = {
    fileName: string;
    content: string;
    dirName: string;
    targetName: string;
    encoding: FileSystemEncodingType;
    isAppend: boolean;
    isOverwrite: boolean;
    isIntermediates: boolean;
    isIdempotent: boolean;
    sliceStart: string;
    sliceEnd: string;
    mode: FileMode;
  };

  let form = $state<IModernForm>({
    fileName: 'symbiote-demo.txt',
    content: 'hello from the modern file-system API',
    dirName: 'symbiote-demo-dir',
    targetName: 'renamed-demo',
    encoding: FileSystemEncodingType.UTF8,
    isAppend: false,
    isOverwrite: true,
    isIntermediates: true,
    isIdempotent: true,
    sliceStart: '0',
    sliceEnd: '5',
    mode: FileMode.ReadWrite,
  });

  const file = (): File => new File(Paths.cache, form.fileName);
  const dir = (): Directory => new Directory(Paths.cache, form.dirName);

  function optionalNumber(text: string): number | undefined {
    const value = Number(text);
    return text.trim() === '' || Number.isNaN(value) ? undefined : value;
  }
</script>

<Card testID="file-system-form-card" title="Inputs, everything lives under Paths.cache">
  <Field testID="file-system-file-name-input" label="file name" value={form.fileName} onChange={fileName => (form.fileName = fileName)} />
  <Field testID="file-system-content-input" label="content for write" value={form.content} onChange={content => (form.content = content)} />
  <Field testID="file-system-dir-name-input" label="directory name" value={form.dirName} onChange={dirName => (form.dirName = dirName)} />
  <Field testID="file-system-target-input" label="new name for rename" value={form.targetName} onChange={targetName => (form.targetName = targetName)} />
  <ChoiceRow testID="file-system-encoding" label="encoding" options={ENCODINGS} value={form.encoding} onChange={encoding => (form.encoding = encoding)} {color} />
  <ToggleRow testID="file-system-append-switch" label="append" value={form.isAppend} onChange={isAppend => (form.isAppend = isAppend)} {color} />
  <ToggleRow testID="file-system-overwrite-switch" label="overwrite" value={form.isOverwrite} onChange={isOverwrite => (form.isOverwrite = isOverwrite)} {color} />
  <ToggleRow testID="file-system-intermediates-switch" label="intermediates" value={form.isIntermediates} onChange={isIntermediates => (form.isIntermediates = isIntermediates)} {color} />
  <ToggleRow testID="file-system-idempotent-switch" label="idempotent (directory create)" value={form.isIdempotent} onChange={isIdempotent => (form.isIdempotent = isIdempotent)} {color} />
  <Field testID="file-system-slice-start-input" label="slice start" value={form.sliceStart} onChange={sliceStart => (form.sliceStart = sliceStart)} />
  <Field testID="file-system-slice-end-input" label="slice end" value={form.sliceEnd} onChange={sliceEnd => (form.sliceEnd = sliceEnd)} />
  <ChoiceRow testID="file-system-mode" label="FileMode for open" options={MODES} value={form.mode} onChange={mode => (form.mode = mode)} {color} />
</Card>
<CallConsole
  prefix="file-system-paths"
  title="Paths"
  {color}
  calls={[
    { label: 'Paths.cache', run: async () => Paths.cache.uri },
    { label: 'Paths.document', run: async () => Paths.document.uri },
    { label: 'Paths.bundle', run: async () => Paths.bundle.uri },
    { label: 'Paths.appleSharedContainers (iOS)', run: async () => Paths.appleSharedContainers },
    { label: 'Paths.totalDiskSpace', run: async () => Paths.totalDiskSpace },
    { label: 'Paths.availableDiskSpace', run: async () => Paths.availableDiskSpace },
    { label: 'Paths.info(cache)', run: async () => Paths.info(Paths.cache.uri) },
  ]}
/>
<CallConsole
  prefix="file-system-file-write"
  title="File write and read"
  {color}
  calls={[
    {
      label: 'create',
      run: async () =>
        file().create({ intermediates: form.isIntermediates, overwrite: form.isOverwrite }),
    },
    {
      label: 'write',
      run: async () => file().write(form.content, { encoding: form.encoding, append: form.isAppend }),
    },
    { label: 'text', run: () => file().text() },
    { label: 'textSync', run: async () => file().textSync() },
    { label: 'base64', run: () => file().base64() },
    { label: 'base64Sync', run: async () => file().base64Sync() },
    {
      label: 'bytes',
      run: async () => Array.from((await file().bytes()).slice(0, MAX_PREVIEW_BYTES)),
    },
    {
      label: 'bytesSync',
      run: async () => Array.from(file().bytesSync().slice(0, MAX_PREVIEW_BYTES)),
    },
    { label: 'arrayBuffer', run: async () => (await file().arrayBuffer()).byteLength },
    { label: 'json', run: () => file().json() },
    { label: 'formData', run: async () => String(await file().formData()) },
    {
      label: 'slice',
      run: async () => {
        const blob = file().slice(optionalNumber(form.sliceStart), optionalNumber(form.sliceEnd));
        return { size: blob.size, text: await blob.text() };
      },
    },
    {
      label: 'stream and readableStream',
      run: async () => {
        const reader = file().readableStream().getReader();
        const first = await reader.read();
        reader.releaseLock();
        return {
          viaReadableStream: first.value?.byteLength,
          viaStream: file().stream() !== undefined,
        };
      },
    },
    {
      label: 'writableStream',
      run: async () => {
        const writer = file().writableStream().getWriter();
        await writer.write(new TextEncoder().encode(form.content));
        await writer.close();
        return 'streamed the content';
      },
    },
    {
      label: 'open (handle)',
      run: async () => {
        const handle = file().open(form.mode);
        try {
          const before = { offset: handle.offset, size: handle.size };
          handle.writeBytes(new TextEncoder().encode(form.content));
          handle.offset = 0;
          return { before, read: Array.from(handle.readBytes(MAX_PREVIEW_BYTES)) };
        } finally {
          handle.close();
        }
      },
    },
  ]}
/>
<CallConsole
  prefix="file-system-file-meta"
  title="File metadata and moves"
  {color}
  calls={[
    {
      label: 'properties',
      run: async () => {
        const target = file();
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
    { label: 'info({ md5: true })', run: async () => file().info({ md5: true }) },
    { label: 'copy', run: async () => file().copy(dir(), { overwrite: form.isOverwrite }) },
    { label: 'copySync', run: async () => file().copySync(dir(), { overwrite: form.isOverwrite }) },
    { label: 'move', run: async () => file().move(dir(), { overwrite: form.isOverwrite }) },
    { label: 'moveSync', run: async () => file().moveSync(dir(), { overwrite: form.isOverwrite }) },
    { label: 'rename', run: async () => file().rename(form.targetName) },
    { label: 'delete (file)', run: async () => file().delete() },
  ]}
/>
<CallConsole
  prefix="file-system-directory"
  title="Directory"
  {color}
  calls={[
    {
      label: 'create (directory)',
      run: async () =>
        dir().create({
          intermediates: form.isIntermediates,
          overwrite: form.isOverwrite,
          idempotent: form.isIdempotent,
        }),
    },
    {
      label: 'createFile',
      run: async () => dir().createFile(form.fileName, 'text/plain').uri,
    },
    { label: 'createDirectory', run: async () => dir().createDirectory(form.targetName).uri },
    { label: 'list', run: async () => dir().list().map(entry => entry.uri) },
    { label: 'listAsRecords', run: async () => dir().listAsRecords() },
    {
      label: 'info (directory)',
      run: async () => ({ ...dir().info(), size: dir().size, name: dir().name }),
    },
    {
      label: 'copy (directory)',
      run: async () => dir().copy(Paths.document, { overwrite: form.isOverwrite }),
    },
    {
      label: 'move (directory)',
      run: async () => dir().move(Paths.document, { overwrite: form.isOverwrite }),
    },
    { label: 'rename (directory)', run: async () => dir().rename(form.targetName) },
    { label: 'delete (directory)', run: async () => dir().delete() },
  ]}
/>
<FileSystemPicker />
<FileSystemWatch dirName={form.dirName} />
