import { defineComponent, ref } from 'vue';
import * as Legacy from '@symbiote-native/file-system/legacy';
import type {
  DownloadResumable,
  UploadTask as LegacyUploadTask,
} from '@symbiote-native/file-system/legacy';
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
const ENCODINGS = Object.values(Legacy.FileSystemEncodingType).map(value => ({ label: value, value }));

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

type IForm = {
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
type ISetForm = (patch: Partial<IForm>) => void;

function FormCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="file-system-legacy-form-card" title="Legacy inputs">
      <Field testID="file-system-legacy-uri-input" label="file or directory uri" value={props.form.fileUri} onChange={fileUri => props.setForm({ fileUri })} />
      <Field testID="file-system-legacy-to-input" label="destination uri for copy and move" value={props.form.toUri} onChange={toUri => props.setForm({ toUri })} />
      <Field testID="file-system-legacy-content-input" label="content for writeAsStringAsync" value={props.form.content} onChange={content => props.setForm({ content })} />
      <Field testID="file-system-legacy-download-input" label="download url" value={props.form.downloadUrl} onChange={downloadUrl => props.setForm({ downloadUrl })} />
      <Field testID="file-system-legacy-upload-input" label="upload url" value={props.form.uploadUrl} onChange={uploadUrl => props.setForm({ uploadUrl })} />
      <Field testID="file-system-legacy-saf-input" label="SAF folder name (Android)" value={props.form.safFolder} onChange={safFolder => props.setForm({ safFolder })} />
      <Field testID="file-system-legacy-position-input" label="position (readAsStringAsync)" value={props.form.position} onChange={position => props.setForm({ position })} />
      <Field testID="file-system-legacy-length-input" label="length (readAsStringAsync)" value={props.form.length} onChange={length => props.setForm({ length })} />
      <ChoiceRow testID="file-system-legacy-encoding" label="encoding" options={ENCODINGS} value={props.form.encoding} onChange={encoding => props.setForm({ encoding })} color={color} />
      <ToggleRow testID="file-system-legacy-idempotent-switch" label="idempotent" value={props.form.isIdempotent} onChange={isIdempotent => props.setForm({ isIdempotent })} color={color} />
      <ToggleRow testID="file-system-legacy-intermediates-switch" label="intermediates" value={props.form.isIntermediates} onChange={isIntermediates => props.setForm({ isIntermediates })} color={color} />
      <ToggleRow testID="file-system-legacy-md5-switch" label="md5 (getInfoAsync)" value={props.form.isMd5} onChange={isMd5 => props.setForm({ isMd5 })} color={color} />
      <ToggleRow testID="file-system-legacy-cache-switch" label="cache (downloadAsync)" value={props.form.isCache} onChange={isCache => props.setForm({ isCache })} color={color} />
    </Card>
  );
}

function FileCalls(props: { form: IForm }) {
  const uri = () => props.form.fileUri || `${Legacy.cacheDirectory}symbiote-legacy.txt`;
  const to = () => props.form.toUri || `${Legacy.cacheDirectory}symbiote-legacy-copy.txt`;
  return (
    <CallConsole
      prefix="file-system-legacy-files"
      title="Legacy file functions"
      color={color}
      calls={[
        { label: 'documentDirectory, cacheDirectory, bundleDirectory', run: async () => ({ document: Legacy.documentDirectory, cache: Legacy.cacheDirectory, bundle: Legacy.bundleDirectory }) },
        { label: 'getInfoAsync', run: () => Legacy.getInfoAsync(uri(), { md5: props.form.isMd5 }) },
        {
          label: 'readAsStringAsync',
          run: () => Legacy.readAsStringAsync(uri(), { encoding: props.form.encoding, position: optionalNumber(props.form.position), length: optionalNumber(props.form.length) }),
        },
        { label: 'writeAsStringAsync', run: () => Legacy.writeAsStringAsync(uri(), props.form.content, { encoding: props.form.encoding }) },
        { label: 'deleteAsync', run: () => Legacy.deleteAsync(uri(), { idempotent: props.form.isIdempotent }) },
        { label: 'moveAsync', run: () => Legacy.moveAsync({ from: uri(), to: to() }) },
        { label: 'copyAsync', run: () => Legacy.copyAsync({ from: uri(), to: to() }) },
        { label: 'makeDirectoryAsync', run: () => Legacy.makeDirectoryAsync(uri(), { intermediates: props.form.isIntermediates }) },
        { label: 'readDirectoryAsync', run: () => Legacy.readDirectoryAsync(uri()) },
        { label: 'getContentUriAsync (Android)', run: () => Legacy.getContentUriAsync(uri()) },
        { label: 'getFreeDiskStorageAsync', run: () => Legacy.getFreeDiskStorageAsync() },
        { label: 'getTotalDiskCapacityAsync', run: () => Legacy.getTotalDiskCapacityAsync() },
      ]}
    />
  );
}

function need<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`create ${label} first`);
  }
  return value;
}

const TransferCalls = defineComponent<{ form: IForm }>(
  props => {
    const progress = ref('no transfer yet');
    let resumable: DownloadResumable | null = null;
    let upload: LegacyUploadTask | null = null;
    const target = () => props.form.fileUri || `${Legacy.cacheDirectory}symbiote-legacy-download.dat`;
    return () => (
      <CallConsole
        prefix="file-system-legacy-transfers"
        title="Legacy transfers"
        color={color}
        hint={`Progress: ${progress.value}`}
        calls={[
          { label: 'downloadAsync', run: () => Legacy.downloadAsync(props.form.downloadUrl, target(), { cache: props.form.isCache }) },
          { label: 'uploadAsync', run: () => Legacy.uploadAsync(props.form.uploadUrl, target(), { httpMethod: 'POST', uploadType: Legacy.FileSystemUploadType.BINARY_CONTENT }) },
          {
            label: 'createDownloadResumable',
            run: async () => {
              resumable = Legacy.createDownloadResumable(props.form.downloadUrl, target(), {}, data => {
                progress.value = `${data.totalBytesWritten}/${data.totalBytesExpectedToWrite}`;
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
              upload = Legacy.createUploadTask(props.form.uploadUrl, target(), {}, data => {
                progress.value = `${data.totalBytesSent}/${data.totalBytesExpectedToSend}`;
              });
              return 'created';
            },
          },
          { label: 'upload task uploadAsync', run: () => need(upload, 'an upload task').uploadAsync() },
          { label: 'upload task cancelAsync', run: () => need(upload, 'an upload task').cancelAsync() },
        ]}
      />
    );
  },
  { name: 'TransferCalls', props: ['form'] },
);

const SafCalls = defineComponent<{ form: IForm }>(
  props => {
    const directory = ref('');
    const base = () => {
      if (directory.value === '') {
        throw new Error('call requestDirectoryPermissionsAsync first');
      }
      return directory.value;
    };
    const rootUri = () => Legacy.StorageAccessFramework.getUriForDirectoryInRoot(props.form.safFolder || 'Documents');
    return () => (
      <CallConsole
        prefix="file-system-saf"
        title="StorageAccessFramework (Android)"
        color={color}
        calls={[
          { label: 'getUriForDirectoryInRoot', run: async () => rootUri() },
          {
            label: 'requestDirectoryPermissionsAsync',
            run: async () => {
              const result = await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync(rootUri());
              if (result.granted) {
                directory.value = result.directoryUri;
              }
              return result;
            },
          },
          { label: 'SAF readDirectoryAsync', run: () => Legacy.StorageAccessFramework.readDirectoryAsync(base()) },
          { label: 'SAF makeDirectoryAsync', run: () => Legacy.StorageAccessFramework.makeDirectoryAsync(base(), 'symbiote-saf') },
          { label: 'SAF createFileAsync', run: () => Legacy.StorageAccessFramework.createFileAsync(base(), 'symbiote-saf', 'text/plain') },
          { label: 'SAF writeAsStringAsync', run: () => Legacy.StorageAccessFramework.writeAsStringAsync(props.form.fileUri, props.form.content) },
          { label: 'SAF readAsStringAsync', run: () => Legacy.StorageAccessFramework.readAsStringAsync(props.form.fileUri) },
          { label: 'SAF deleteAsync', run: () => Legacy.StorageAccessFramework.deleteAsync(props.form.fileUri) },
        ]}
      />
    );
  },
  { name: 'SafCalls', props: ['form'] },
);

export const LegacyCards = defineComponent(
  () => {
    const form = ref<IForm>({
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
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };
    return () => (
      <>
        <FormCard form={form.value} setForm={setForm} />
        <FileCalls form={form.value} />
        <TransferCalls form={form.value} />
        <SafCalls form={form.value} />
      </>
    );
  },
  { name: 'LegacyCards' },
);
