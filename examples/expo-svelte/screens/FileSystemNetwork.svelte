<script lang="ts">
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
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.FileSystem);
  const DOWNLOAD_URL = 'https://proof.ovh.net/files/1Mb.dat';
  const UPLOAD_URL = 'https://httpbin.org/post';
  const METHODS = ['POST', 'PUT', 'PATCH'] as const;
  type IMethod = (typeof METHODS)[number];
  const SESSIONS: readonly IFileSystemNetworkTaskSessionType[] = ['foreground', 'background'];
  const METHOD_CHOICES = METHODS.map(item => ({ label: item, value: item }));
  const SESSION_CHOICES = SESSIONS.map(item => ({ label: item, value: item }));
  const UPLOAD_TYPES = [
    { label: 'MULTIPART', value: FileSystemUploadType.MULTIPART },
    { label: 'BINARY_CONTENT', value: FileSystemUploadType.BINARY_CONTENT },
  ] as const;

  type INetworkForm = {
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

  let form = $state<INetworkForm>({
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
  let progress = $state('no transfer yet');
  let pausedState: IFileSystemDownloadPauseState | null = null;
  let task: DownloadTask | null = null;
  let controller: AbortController | null = null;
  let uploadTask: UploadTask | null = null;

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

  function uploadOptions(
    onProgress: IFileSystemUploadOptions['onProgress'],
  ): IFileSystemUploadOptions {
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

  const report =
    (label: string) =>
    (data: { bytesWritten?: number; bytesSent?: number; totalBytes: number }): void => {
      progress = `${label} ${data.bytesWritten ?? data.bytesSent}/${data.totalBytes}`;
    };
  const target = (): File => new File(Paths.cache, 'symbiote-download.dat');
  const uploadSource = (): File => new File(Paths.cache, form.fileName);

  function current(): DownloadTask {
    if (task === null) {
      throw new Error('create a download task first');
    }
    return task;
  }
</script>

<Card testID="file-system-network-card" title="Network options">
  <Field testID="file-system-download-url-input" label="download url" value={form.downloadUrl} onChange={downloadUrl => (form.downloadUrl = downloadUrl)} />
  <Field testID="file-system-upload-url-input" label="upload url" value={form.uploadUrl} onChange={uploadUrl => (form.uploadUrl = uploadUrl)} />
  <Field testID="file-system-upload-file-input" label="file in Paths.cache (must exist for upload)" value={form.fileName} onChange={fileName => (form.fileName = fileName)} />
  <Field testID="file-system-headers-input" label="headers (JSON object)" value={form.headers} onChange={headers => (form.headers = headers)} />
  <ToggleRow testID="file-system-download-idempotent-switch" label="idempotent (downloadFileAsync)" value={form.isIdempotent} onChange={isIdempotent => (form.isIdempotent = isIdempotent)} {color} />
  <ChoiceRow testID="file-system-http-method" label="httpMethod" options={METHOD_CHOICES} value={form.method} onChange={method => (form.method = method)} {color} />
  <ChoiceRow testID="file-system-upload-type" label="uploadType (FileSystemUploadType)" options={UPLOAD_TYPES} value={form.uploadType} onChange={uploadType => (form.uploadType = uploadType)} {color} />
  <Field testID="file-system-field-name-input" label="fieldName (multipart)" value={form.fieldName} onChange={fieldName => (form.fieldName = fieldName)} />
  <Field testID="file-system-upload-mime-input" label="mimeType (multipart)" value={form.mimeType} onChange={mimeType => (form.mimeType = mimeType)} />
  <Field testID="file-system-parameters-input" label="parameters (JSON object, multipart)" value={form.parameters} onChange={parameters => (form.parameters = parameters)} />
  <ChoiceRow testID="file-system-session" label="sessionType" options={SESSION_CHOICES} value={form.session} onChange={session => (form.session = session)} {color} />
</Card>
<ResultRow testID="file-system-progress" label="progress" value={progress} />
<CallConsole
  prefix="file-system-download"
  title="Download"
  {color}
  calls={[
    {
      label: 'File.downloadFileAsync',
      run: async () => {
        controller = new AbortController();
        const file = await File.downloadFileAsync(form.downloadUrl, target(), {
          headers: parseRecord(form.headers),
          idempotent: form.isIdempotent,
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
        task = File.createDownloadTask(form.downloadUrl, target(), {
          headers: parseRecord(form.headers),
          sessionType: form.session,
          onProgress: report('task'),
        });
        return task.state;
      },
    },
    {
      label: 'downloadAsync',
      run: async () => (await current().downloadAsync())?.uri ?? `null, state ${current().state}`,
    },
    {
      label: 'pauseAsync',
      run: async () => {
        await current().pauseAsync();
        return current().state;
      },
    },
    {
      label: 'pause',
      run: async () => {
        current().pause();
        return current().state;
      },
    },
    {
      label: 'resumeAsync',
      run: async () => (await current().resumeAsync())?.uri ?? `null, state ${current().state}`,
    },
    {
      label: 'savable',
      run: async () => {
        const saved = current().savable();
        pausedState = saved;
        return saved;
      },
    },
    {
      label: 'DownloadTask.fromSavable',
      run: async () => {
        if (pausedState === null) {
          throw new Error('pause a task and call savable first');
        }
        task = DownloadTask.fromSavable(pausedState, { onProgress: report('restored') });
        return task.state;
      },
    },
    {
      label: 'cancel (download)',
      run: async () => {
        current().cancel();
        return current().state;
      },
    },
    { label: 'release (download)', run: async () => current().release() },
    {
      label: 'state and addListener',
      run: async () => ({
        state: current().state,
        subscription: typeof current().addListener === 'function',
      }),
    },
  ]}
/>
<CallConsole
  prefix="file-system-upload"
  title="Upload"
  {color}
  hint="Uploads the file named above, create it from the File card first."
  calls={[
    {
      label: 'File.upload',
      run: () => uploadSource().upload(form.uploadUrl, uploadOptions(report('upload'))),
    },
    {
      label: 'File.createUploadTask',
      run: async () => {
        uploadTask = uploadSource().createUploadTask(
          form.uploadUrl,
          uploadOptions(report('upload task')),
        );
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
        uploadTask = new UploadTask(uploadSource(), form.uploadUrl, uploadOptions(undefined));
        return uploadTask.state;
      },
    },
  ]}
/>
