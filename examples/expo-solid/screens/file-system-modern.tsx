import { createSignal } from 'solid-js';
import {
  Directory,
  File,
  FileMode,
  FileSystemEncodingType,
  Paths,
} from '@symbiote-native/file-system';
import type { IFileSystemWatchEventType } from '@symbiote-native/file-system';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.FileSystem);
const MAX_PREVIEW_BYTES = 32;
const MAX_LOGGED_EVENTS = 6;
const ENCODINGS = Object.values(FileSystemEncodingType).map(value => ({ label: value, value }));
const MODES = Object.entries(FileMode).map(([label, value]) => ({ label, value }));
const WATCH_EVENTS: readonly IFileSystemWatchEventType[] = ['created', 'modified', 'deleted', 'renamed'];

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

type IForm = {
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
type ISetForm = (patch: Partial<IForm>) => void;

function FormCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="file-system-form-card" title="Inputs, everything lives under Paths.cache">
      <Field testID="file-system-file-name-input" label="file name" value={props.form.fileName} onChange={fileName => props.setForm({ fileName })} />
      <Field testID="file-system-content-input" label="content for write" value={props.form.content} onChange={content => props.setForm({ content })} />
      <Field testID="file-system-dir-name-input" label="directory name" value={props.form.dirName} onChange={dirName => props.setForm({ dirName })} />
      <Field testID="file-system-target-input" label="new name for rename" value={props.form.targetName} onChange={targetName => props.setForm({ targetName })} />
      <ChoiceRow testID="file-system-encoding" label="encoding" options={ENCODINGS} value={props.form.encoding} onChange={encoding => props.setForm({ encoding })} color={color} />
      <ToggleRow testID="file-system-append-switch" label="append" value={props.form.isAppend} onChange={isAppend => props.setForm({ isAppend })} color={color} />
      <ToggleRow testID="file-system-overwrite-switch" label="overwrite" value={props.form.isOverwrite} onChange={isOverwrite => props.setForm({ isOverwrite })} color={color} />
      <ToggleRow testID="file-system-intermediates-switch" label="intermediates" value={props.form.isIntermediates} onChange={isIntermediates => props.setForm({ isIntermediates })} color={color} />
      <ToggleRow testID="file-system-idempotent-switch" label="idempotent (directory create)" value={props.form.isIdempotent} onChange={isIdempotent => props.setForm({ isIdempotent })} color={color} />
      <Field testID="file-system-slice-start-input" label="slice start" value={props.form.sliceStart} onChange={sliceStart => props.setForm({ sliceStart })} />
      <Field testID="file-system-slice-end-input" label="slice end" value={props.form.sliceEnd} onChange={sliceEnd => props.setForm({ sliceEnd })} />
      <ChoiceRow testID="file-system-mode" label="FileMode for open" options={MODES} value={props.form.mode} onChange={mode => props.setForm({ mode })} color={color} />
    </Card>
  );
}

function PathCalls() {
  return (
    <CallConsole
      prefix="file-system-paths"
      title="Paths"
      color={color}
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
  );
}

function FileCalls(props: { form: IForm }) {
  const file = () => new File(Paths.cache, props.form.fileName);
  const dir = () => new Directory(Paths.cache, props.form.dirName);
  const options = () => ({ intermediates: props.form.isIntermediates, overwrite: props.form.isOverwrite });
  return (
    <>
      <CallConsole
        prefix="file-system-file-write"
        title="File write and read"
        color={color}
        calls={[
          { label: 'create', run: async () => file().create(options()) },
          { label: 'write', run: async () => file().write(props.form.content, { encoding: props.form.encoding, append: props.form.isAppend }) },
          { label: 'text', run: () => file().text() },
          { label: 'textSync', run: async () => file().textSync() },
          { label: 'base64', run: () => file().base64() },
          { label: 'base64Sync', run: async () => file().base64Sync() },
          { label: 'bytes', run: async () => Array.from((await file().bytes()).slice(0, MAX_PREVIEW_BYTES)) },
          { label: 'bytesSync', run: async () => Array.from(file().bytesSync().slice(0, MAX_PREVIEW_BYTES)) },
          { label: 'arrayBuffer', run: async () => (await file().arrayBuffer()).byteLength },
          { label: 'json', run: () => file().json() },
          { label: 'formData', run: async () => String(await file().formData()) },
          {
            label: 'slice',
            run: async () => {
              const blob = file().slice(optionalNumber(props.form.sliceStart), optionalNumber(props.form.sliceEnd));
              return { size: blob.size, text: await blob.text() };
            },
          },
          {
            label: 'stream and readableStream',
            run: async () => {
              const reader = file().readableStream().getReader();
              const first = await reader.read();
              reader.releaseLock();
              return { viaReadableStream: first.value?.byteLength, viaStream: file().stream() !== undefined };
            },
          },
          {
            label: 'writableStream',
            run: async () => {
              const writer = file().writableStream().getWriter();
              await writer.write(new TextEncoder().encode(props.form.content));
              await writer.close();
              return 'streamed the content';
            },
          },
          {
            label: 'open (handle)',
            run: async () => {
              const handle = file().open(props.form.mode);
              try {
                const before = { offset: handle.offset, size: handle.size };
                handle.writeBytes(new TextEncoder().encode(props.form.content));
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
        color={color}
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
          { label: 'copy', run: async () => file().copy(dir(), { overwrite: props.form.isOverwrite }) },
          { label: 'copySync', run: async () => file().copySync(dir(), { overwrite: props.form.isOverwrite }) },
          { label: 'move', run: async () => file().move(dir(), { overwrite: props.form.isOverwrite }) },
          { label: 'moveSync', run: async () => file().moveSync(dir(), { overwrite: props.form.isOverwrite }) },
          { label: 'rename', run: async () => file().rename(props.form.targetName) },
          { label: 'delete (file)', run: async () => file().delete() },
        ]}
      />
    </>
  );
}

function DirectoryCalls(props: { form: IForm }) {
  const dir = () => new Directory(Paths.cache, props.form.dirName);
  return (
    <CallConsole
      prefix="file-system-directory"
      title="Directory"
      color={color}
      calls={[
        {
          label: 'create (directory)',
          run: async () =>
            dir().create({ intermediates: props.form.isIntermediates, overwrite: props.form.isOverwrite, idempotent: props.form.isIdempotent }),
        },
        { label: 'createFile', run: async () => dir().createFile(props.form.fileName, 'text/plain').uri },
        { label: 'createDirectory', run: async () => dir().createDirectory(props.form.targetName).uri },
        { label: 'list', run: async () => dir().list().map(entry => entry.uri) },
        { label: 'listAsRecords', run: async () => dir().listAsRecords() },
        { label: 'info (directory)', run: async () => ({ ...dir().info(), size: dir().size, name: dir().name }) },
        { label: 'copy (directory)', run: async () => dir().copy(Paths.document, { overwrite: props.form.isOverwrite }) },
        { label: 'move (directory)', run: async () => dir().move(Paths.document, { overwrite: props.form.isOverwrite }) },
        { label: 'rename (directory)', run: async () => dir().rename(props.form.targetName) },
        { label: 'delete (directory)', run: async () => dir().delete() },
      ]}
    />
  );
}

function PickerCard() {
  const [mimeTypes, setMimeTypes] = createSignal('');
  const [initialUri, setInitialUri] = createSignal('');
  const [isMultiple, setIsMultiple] = createSignal(false);
  const picked = (files: File | File[] | null) => (Array.isArray(files) ? files : files === null ? [] : [files]).map(item => item.uri);
  return (
    <>
      <Card testID="file-system-picker-card" title="System pickers">
        <Field testID="file-system-mime-input" label="mimeTypes (comma separated)" value={mimeTypes()} onChange={setMimeTypes} />
        <Field testID="file-system-initial-input" label="initialUri" value={initialUri()} onChange={setInitialUri} />
        <ToggleRow testID="file-system-multiple-switch" label="multipleFiles" value={isMultiple()} onChange={setIsMultiple} color={color} />
      </Card>
      <CallConsole
        prefix="file-system-pickers"
        title="Picker calls"
        color={color}
        calls={[
          {
            label: 'File.pickFileAsync',
            run: async () => {
              const types = mimeTypes().split(',').map(item => item.trim()).filter(item => item !== '');
              const common = { initialUri: initialUri() === '' ? undefined : initialUri(), mimeTypes: types.length === 0 ? undefined : types };
              const outcome = isMultiple()
                ? await File.pickFileAsync({ ...common, multipleFiles: true })
                : await File.pickFileAsync({ ...common, multipleFiles: false });
              return outcome.canceled ? 'canceled' : picked(outcome.result);
            },
          },
          {
            label: 'Directory.pickDirectoryAsync',
            run: async () => (await Directory.pickDirectoryAsync(initialUri() === '' ? undefined : initialUri())).uri,
          },
        ]}
      />
    </>
  );
}

function WatchCard(props: { form: IForm }) {
  const [isOn, setIsOn] = createSignal(false);
  const [debounce, setDebounce] = createSignal('100');
  const [events, setEvents] = createSignal<IFileSystemWatchEventType>('modified');
  const [lines, setLines] = createSignal<string[]>([]);
  let subscription: { remove: () => void } | null = null;

  const toggle = (next: boolean) => {
    setIsOn(next);
    if (!next) {
      subscription?.remove();
      subscription = null;
      return;
    }
    subscription = new Directory(Paths.cache, props.form.dirName).watch(
      event => setLines(previous => [`${event.type} ${event.target.uri}`, ...previous].slice(0, MAX_LOGGED_EVENTS)),
      { debounce: optionalNumber(debounce()), events: [events()] },
    );
  };

  return (
    <Card testID="file-system-watch-card" title="watch (directory)">
      <Field testID="file-system-debounce-input" label="debounce (ms)" value={debounce()} onChange={setDebounce} />
      <ChoiceRow testID="file-system-events" label="events" options={WATCH_EVENTS.map(item => ({ label: item, value: item }))} value={events()} onChange={next => setEvents(next)} color={color} />
      <ToggleRow testID="file-system-watch-switch" label="watch the directory above" value={isOn()} onChange={toggle} color={color} />
      <text testID="file-system-watch-log" class="info-text">
        {lines().length === 0 ? 'no events yet, create the directory then change files inside it' : lines().join('\n')}
      </text>
    </Card>
  );
}

export function ModernCards() {
  const [form, setFormState] = createSignal<IForm>({
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
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <FormCard form={form()} setForm={setForm} />
      <PathCalls />
      <FileCalls form={form()} />
      <DirectoryCalls form={form()} />
      <PickerCard />
      <WatchCard form={form()} />
    </>
  );
}
