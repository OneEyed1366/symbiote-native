<script lang="ts">
  import * as Legacy from '@symbiote-native/file-system/legacy';
  import type {
    DownloadResumable,
    UploadTask as LegacyUploadTask,
  } from '@symbiote-native/file-system/legacy';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.FileSystem);
  const ENCODINGS = Object.values(Legacy.FileSystemEncodingType).map(value => ({
    label: value,
    value,
  }));

  type ILegacyForm = {
    fileUri: string;
    toUri: string;
    content: string;
    downloadUrl: string;
    uploadUrl: string;
    safFolder: string;
    position: string;
    length: string;
    encoding: Legacy.FileSystemEncodingType;
    isIdempotent: boolean;
    isIntermediates: boolean;
    isMd5: boolean;
    isCache: boolean;
  };

  let form = $state<ILegacyForm>({
    fileUri: '',
    toUri: '',
    content: 'hello from the legacy file-system API',
    downloadUrl: 'https://proof.ovh.net/files/1Mb.dat',
    uploadUrl: 'https://httpbin.org/post',
    safFolder: 'Documents',
    position: '',
    length: '',
    encoding: Legacy.FileSystemEncodingType.UTF8,
    isIdempotent: true,
    isIntermediates: true,
    isMd5: false,
    isCache: false,
  });
  let progress = $state('no transfer yet');
  let safDirectory = '';
  let resumable: DownloadResumable | null = null;
  let upload: LegacyUploadTask | null = null;

  function optionalNumber(text: string): number | undefined {
    const value = Number(text);
    return text.trim() === '' || Number.isNaN(value) ? undefined : value;
  }

  const uri = (): string => form.fileUri || `${Legacy.cacheDirectory}symbiote-legacy.txt`;
  const to = (): string => form.toUri || `${Legacy.cacheDirectory}symbiote-legacy-copy.txt`;
  const target = (): string =>
    form.fileUri || `${Legacy.cacheDirectory}symbiote-legacy-download.dat`;
  const rootUri = (): string =>
    Legacy.StorageAccessFramework.getUriForDirectoryInRoot(form.safFolder || 'Documents');

  function need<T>(value: T | null, label: string): T {
    if (value === null) {
      throw new Error(`create ${label} first`);
    }
    return value;
  }

  function base(): string {
    if (safDirectory === '') {
      throw new Error('call requestDirectoryPermissionsAsync first');
    }
    return safDirectory;
  }
</script>

<Card testID="file-system-legacy-form-card" title="Legacy inputs">
  <Field testID="file-system-legacy-uri-input" label="file or directory uri" value={form.fileUri} onChange={fileUri => (form.fileUri = fileUri)} />
  <Field testID="file-system-legacy-to-input" label="destination uri for copy and move" value={form.toUri} onChange={toUri => (form.toUri = toUri)} />
  <Field testID="file-system-legacy-content-input" label="content for writeAsStringAsync" value={form.content} onChange={content => (form.content = content)} />
  <Field testID="file-system-legacy-download-input" label="download url" value={form.downloadUrl} onChange={downloadUrl => (form.downloadUrl = downloadUrl)} />
  <Field testID="file-system-legacy-upload-input" label="upload url" value={form.uploadUrl} onChange={uploadUrl => (form.uploadUrl = uploadUrl)} />
  <Field testID="file-system-legacy-saf-input" label="SAF folder name (Android)" value={form.safFolder} onChange={safFolder => (form.safFolder = safFolder)} />
  <Field testID="file-system-legacy-position-input" label="position (readAsStringAsync)" value={form.position} onChange={position => (form.position = position)} />
  <Field testID="file-system-legacy-length-input" label="length (readAsStringAsync)" value={form.length} onChange={length => (form.length = length)} />
  <ChoiceRow testID="file-system-legacy-encoding" label="encoding" options={ENCODINGS} value={form.encoding} onChange={encoding => (form.encoding = encoding)} {color} />
  <ToggleRow testID="file-system-legacy-idempotent-switch" label="idempotent" value={form.isIdempotent} onChange={isIdempotent => (form.isIdempotent = isIdempotent)} {color} />
  <ToggleRow testID="file-system-legacy-intermediates-switch" label="intermediates" value={form.isIntermediates} onChange={isIntermediates => (form.isIntermediates = isIntermediates)} {color} />
  <ToggleRow testID="file-system-legacy-md5-switch" label="md5 (getInfoAsync)" value={form.isMd5} onChange={isMd5 => (form.isMd5 = isMd5)} {color} />
  <ToggleRow testID="file-system-legacy-cache-switch" label="cache (downloadAsync)" value={form.isCache} onChange={isCache => (form.isCache = isCache)} {color} />
</Card>
<CallConsole
  prefix="file-system-legacy-files"
  title="Legacy file functions"
  {color}
  calls={[
    {
      label: 'documentDirectory, cacheDirectory, bundleDirectory',
      run: async () => ({
        document: Legacy.documentDirectory,
        cache: Legacy.cacheDirectory,
        bundle: Legacy.bundleDirectory,
      }),
    },
    { label: 'getInfoAsync', run: () => Legacy.getInfoAsync(uri(), { md5: form.isMd5 }) },
    {
      label: 'readAsStringAsync',
      run: () =>
        Legacy.readAsStringAsync(uri(), {
          encoding: form.encoding,
          position: optionalNumber(form.position),
          length: optionalNumber(form.length),
        }),
    },
    {
      label: 'writeAsStringAsync',
      run: () => Legacy.writeAsStringAsync(uri(), form.content, { encoding: form.encoding }),
    },
    {
      label: 'deleteAsync',
      run: () => Legacy.deleteAsync(uri(), { idempotent: form.isIdempotent }),
    },
    { label: 'moveAsync', run: () => Legacy.moveAsync({ from: uri(), to: to() }) },
    { label: 'copyAsync', run: () => Legacy.copyAsync({ from: uri(), to: to() }) },
    {
      label: 'makeDirectoryAsync',
      run: () => Legacy.makeDirectoryAsync(uri(), { intermediates: form.isIntermediates }),
    },
    { label: 'readDirectoryAsync', run: () => Legacy.readDirectoryAsync(uri()) },
    { label: 'getContentUriAsync (Android)', run: () => Legacy.getContentUriAsync(uri()) },
    { label: 'getFreeDiskStorageAsync', run: () => Legacy.getFreeDiskStorageAsync() },
    { label: 'getTotalDiskCapacityAsync', run: () => Legacy.getTotalDiskCapacityAsync() },
  ]}
/>
<CallConsole
  prefix="file-system-legacy-transfers"
  title="Legacy transfers"
  {color}
  hint={`Progress: ${progress}`}
  calls={[
    {
      label: 'downloadAsync',
      run: () => Legacy.downloadAsync(form.downloadUrl, target(), { cache: form.isCache }),
    },
    {
      label: 'uploadAsync',
      run: () =>
        Legacy.uploadAsync(form.uploadUrl, target(), {
          httpMethod: 'POST',
          uploadType: Legacy.FileSystemUploadType.BINARY_CONTENT,
        }),
    },
    {
      label: 'createDownloadResumable',
      run: async () => {
        resumable = Legacy.createDownloadResumable(form.downloadUrl, target(), {}, data => {
          progress = `${data.totalBytesWritten}/${data.totalBytesExpectedToWrite}`;
        });
        return 'created';
      },
    },
    { label: 'resumable downloadAsync', run: () => need(resumable, 'a resumable').downloadAsync() },
    { label: 'resumable pauseAsync', run: () => need(resumable, 'a resumable').pauseAsync() },
    { label: 'resumable resumeAsync', run: () => need(resumable, 'a resumable').resumeAsync() },
    { label: 'resumable cancelAsync', run: () => need(resumable, 'a resumable').cancelAsync() },
    {
      label: 'createUploadTask',
      run: async () => {
        upload = Legacy.createUploadTask(form.uploadUrl, target(), {}, data => {
          progress = `${data.totalBytesSent}/${data.totalBytesExpectedToSend}`;
        });
        return 'created';
      },
    },
    { label: 'upload task uploadAsync', run: () => need(upload, 'an upload task').uploadAsync() },
    { label: 'upload task cancelAsync', run: () => need(upload, 'an upload task').cancelAsync() },
  ]}
/>
<CallConsole
  prefix="file-system-saf"
  title="StorageAccessFramework (Android)"
  {color}
  calls={[
    { label: 'getUriForDirectoryInRoot', run: async () => rootUri() },
    {
      label: 'requestDirectoryPermissionsAsync',
      run: async () => {
        const result =
          await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync(rootUri());
        if (result.granted) {
          safDirectory = result.directoryUri;
        }
        return result;
      },
    },
    {
      label: 'SAF readDirectoryAsync',
      run: () => Legacy.StorageAccessFramework.readDirectoryAsync(base()),
    },
    {
      label: 'SAF makeDirectoryAsync',
      run: () => Legacy.StorageAccessFramework.makeDirectoryAsync(base(), 'symbiote-saf'),
    },
    {
      label: 'SAF createFileAsync',
      run: () =>
        Legacy.StorageAccessFramework.createFileAsync(base(), 'symbiote-saf', 'text/plain'),
    },
    {
      label: 'SAF writeAsStringAsync',
      run: () => Legacy.StorageAccessFramework.writeAsStringAsync(form.fileUri, form.content),
    },
    {
      label: 'SAF readAsStringAsync',
      run: () => Legacy.StorageAccessFramework.readAsStringAsync(form.fileUri),
    },
    { label: 'SAF deleteAsync', run: () => Legacy.StorageAccessFramework.deleteAsync(form.fileUri) },
  ]}
/>
