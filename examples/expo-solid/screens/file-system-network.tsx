import { createSignal } from 'solid-js';
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
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.FileSystem);
const DOWNLOAD_URL = 'https://proof.ovh.net/files/1Mb.dat';
const UPLOAD_URL = 'https://httpbin.org/post';
const METHODS = ['POST', 'PUT', 'PATCH'] as const;
type IMethod = (typeof METHODS)[number];
const SESSIONS: readonly IFileSystemNetworkTaskSessionType[] = ['foreground', 'background'];
const UPLOAD_TYPES = [
  { label: 'MULTIPART', value: FileSystemUploadType.MULTIPART },
  { label: 'BINARY_CONTENT', value: FileSystemUploadType.BINARY_CONTENT },
] as const;

type IForm = {
  downloadUrl: string;
  uploadUrl: string;
  headers: string;
  isIdempotent: boolean;
  fileName: string;
  method: IMethod;
  uploadType: FileSystemUploadType;
  fieldName: string;
  mimeType: string;
  parameters: string;
  session: IFileSystemNetworkTaskSessionType;
};
type ISetForm = (patch: Partial<IForm>) => void;

function parseRecord(text: string): Record<string, string> | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

function FormCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="file-system-network-card" title="Network options">
      <Field testID="file-system-download-url-input" label="download url" value={props.form.downloadUrl} onChange={downloadUrl => props.setForm({ downloadUrl })} />
      <Field testID="file-system-upload-url-input" label="upload url" value={props.form.uploadUrl} onChange={uploadUrl => props.setForm({ uploadUrl })} />
      <Field testID="file-system-upload-file-input" label="file in Paths.cache (must exist for upload)" value={props.form.fileName} onChange={fileName => props.setForm({ fileName })} />
      <Field testID="file-system-headers-input" label="headers (JSON object)" value={props.form.headers} onChange={headers => props.setForm({ headers })} />
      <ToggleRow testID="file-system-download-idempotent-switch" label="idempotent (downloadFileAsync)" value={props.form.isIdempotent} onChange={isIdempotent => props.setForm({ isIdempotent })} color={color} />
      <ChoiceRow testID="file-system-http-method" label="httpMethod" options={METHODS.map(item => ({ label: item, value: item }))} value={props.form.method} onChange={method => props.setForm({ method })} color={color} />
      <ChoiceRow testID="file-system-upload-type" label="uploadType (FileSystemUploadType)" options={UPLOAD_TYPES} value={props.form.uploadType} onChange={uploadType => props.setForm({ uploadType })} color={color} />
      <Field testID="file-system-field-name-input" label="fieldName (multipart)" value={props.form.fieldName} onChange={fieldName => props.setForm({ fieldName })} />
      <Field testID="file-system-upload-mime-input" label="mimeType (multipart)" value={props.form.mimeType} onChange={mimeType => props.setForm({ mimeType })} />
      <Field testID="file-system-parameters-input" label="parameters (JSON object, multipart)" value={props.form.parameters} onChange={parameters => props.setForm({ parameters })} />
      <ChoiceRow testID="file-system-session" label="sessionType" options={SESSIONS.map(item => ({ label: item, value: item }))} value={props.form.session} onChange={session => props.setForm({ session })} color={color} />
    </Card>
  );
}

function uploadOptions(form: IForm, onProgress: IFileSystemUploadOptions['onProgress']): IFileSystemUploadOptions {
  return {
    httpMethod: form.method,
    uploadType: form.uploadType,
    headers: parseRecord(form.headers),
    fieldName: form.fieldName === '' ? undefined : form.fieldName,
    mimeType: form.mimeType === '' ? undefined : form.mimeType,
    parameters: parseRecord(form.parameters),
    sessionType: form.session,
    onProgress,
  };
}

export function NetworkCards() {
  const [form, setFormState] = createSignal<IForm>({
    downloadUrl: DOWNLOAD_URL,
    uploadUrl: UPLOAD_URL,
    headers: '',
    isIdempotent: true,
    fileName: 'symbiote-demo.txt',
    method: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'text/plain',
    parameters: '',
    session: 'foreground',
  });
  const [progress, setProgress] = createSignal('no transfer yet');
  const [pausedState, setPausedState] = createSignal<IFileSystemDownloadPauseState | null>(null);
  let task: DownloadTask | null = null;
  let controller: AbortController | null = null;
  let uploadTask: UploadTask | null = null;
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  const report = (label: string) => (data: { bytesWritten?: number; bytesSent?: number; totalBytes: number }) =>
    setProgress(`${label} ${data.bytesWritten ?? data.bytesSent}/${data.totalBytes}`);
  const target = () => new File(Paths.cache, 'symbiote-download.dat');
  const headers = () => parseRecord(form().headers);
  const current = (): DownloadTask => {
    if (task === null) {
      throw new Error('create a download task first');
    }
    return task;
  };

  return (
    <>
      <FormCard form={form()} setForm={setForm} />
      <ResultRow testID="file-system-progress" label="progress" value={progress()} />
      <CallConsole
        prefix="file-system-download"
        title="Download"
        color={color}
        calls={[
          {
            label: 'File.downloadFileAsync',
            run: async () => {
              controller = new AbortController();
              const file = await File.downloadFileAsync(form().downloadUrl, target(), {
                headers: headers(),
                idempotent: form().isIdempotent,
                onProgress: report('download'),
                signal: controller.signal,
              });
              return { uri: file.uri, size: file.size };
            },
          },
          { label: 'abort signal', run: async () => controller?.abort() },
          {
            label: 'File.createDownloadTask',
            run: async () => {
              task = File.createDownloadTask(form().downloadUrl, target(), {
                headers: headers(),
                sessionType: form().session,
                onProgress: report('task'),
              });
              return task.state;
            },
          },
          { label: 'downloadAsync', run: async () => (await current().downloadAsync())?.uri ?? `null, state ${current().state}` },
          { label: 'pauseAsync', run: async () => { await current().pauseAsync(); return current().state; } },
          { label: 'pause', run: async () => { current().pause(); return current().state; } },
          { label: 'resumeAsync', run: async () => (await current().resumeAsync())?.uri ?? `null, state ${current().state}` },
          {
            label: 'savable',
            run: async () => {
              const state = current().savable();
              setPausedState(state);
              return state;
            },
          },
          {
            label: 'DownloadTask.fromSavable',
            run: async () => {
              const saved = pausedState();
              if (saved === null) {
                throw new Error('pause a task and call savable first');
              }
              task = DownloadTask.fromSavable(saved, { onProgress: report('restored') });
              return task.state;
            },
          },
          { label: 'cancel (download)', run: async () => { current().cancel(); return current().state; } },
          { label: 'release (download)', run: async () => current().release() },
          { label: 'state and addListener', run: async () => ({ state: current().state, subscription: typeof current().addListener === 'function' }) },
        ]}
      />
      <CallConsole
        prefix="file-system-upload"
        title="Upload"
        color={color}
        hint="Uploads the file named above, create it from the File card first."
        calls={[
          {
            label: 'File.upload',
            run: () => new File(Paths.cache, form().fileName).upload(form().uploadUrl, uploadOptions(form(), report('upload'))),
          },
          {
            label: 'File.createUploadTask',
            run: async () => {
              uploadTask = new File(Paths.cache, form().fileName).createUploadTask(form().uploadUrl, uploadOptions(form(), report('upload task')));
              return uploadTask.state;
            },
          },
          {
            label: 'uploadAsync',
            run: async () => {
              if (uploadTask === null) {
                throw new Error('create an upload task first');
              }
              return uploadTask.uploadAsync();
            },
          },
          { label: 'cancel (upload)', run: async () => uploadTask?.cancel() },
          { label: 'release (upload)', run: async () => uploadTask?.release() },
          {
            label: 'new UploadTask',
            run: async () => {
              uploadTask = new UploadTask(new File(Paths.cache, form().fileName), form().uploadUrl, uploadOptions(form(), undefined));
              return uploadTask.state;
            },
          },
        ]}
      />
    </>
  );
}
