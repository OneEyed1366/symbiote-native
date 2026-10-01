import { For, Show, createSignal } from 'solid-js';
import {
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  useCameraPermissions,
  useMediaLibraryPermissions,
} from '@symbiote-native/image-picker/solid';
import type { IImagePickerAsset } from '@symbiote-native/image-picker/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import {
  CommonOptionsCard,
  INITIAL_FORM,
  SelectionCard,
  VideoCard,
  toPickerOptions,
} from './image-picker-options';
import type { IForm, ISetForm } from './image-picker-options';

const ROUTE = ROUTE_NAME.ImagePicker;
const color = lineColorOf(ROUTE);

type IPermissionLike = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: string;
};

function describePermission(response: IPermissionLike | null): string {
  if (response === null) {
    return 'loading…';
  }
  const privileges =
    response.accessPrivileges === undefined
      ? ''
      : `, accessPrivileges ${response.accessPrivileges}`;
  return `${response.status}, granted ${response.granted}, canAskAgain ${response.canAskAgain}${privileges}`;
}

type IPermissionBlockProps = {
  prefix: string;
  title: string;
  hookResponse: IPermissionLike | null;
  hookRequest: () => Promise<unknown>;
  directGet: () => Promise<IPermissionLike>;
  directRequest: () => Promise<IPermissionLike>;
};

function PermissionBlock(props: IPermissionBlockProps) {
  const [direct, setDirect] = createSignal('not called');
  const run = (call: () => Promise<IPermissionLike>) =>
    call()
      .then(response => setDirect(describePermission(response)))
      .catch((error: Error) => setDirect(`failed: ${error.message}`));
  return (
    <view>
      <text class="feature-card-title">{props.title}</text>
      <ResultRow
        testID={`${props.prefix}-hook`}
        label="hook state"
        value={describePermission(props.hookResponse)}
      />
      <ActionButton
        testID={`${props.prefix}-hook-request`}
        title="hook request()"
        onPress={() => props.hookRequest()}
        color={color}
      />
      <ActionButton
        testID={`${props.prefix}-get`}
        title="get…PermissionsAsync"
        onPress={() => run(props.directGet)}
        color={color}
      />
      <ActionButton
        testID={`${props.prefix}-request`}
        title="request…PermissionsAsync"
        onPress={() => run(props.directRequest)}
        color={color}
      />
      <ResultRow testID={`${props.prefix}-direct`} label="direct call" value={direct()} />
    </view>
  );
}

function PermissionsCard() {
  const [cameraResponse, requestCamera] = useCameraPermissions();
  const [libraryResponse, requestLibrary] = useMediaLibraryPermissions();
  return (
    <Card testID="image-picker-permissions-card" title="Permissions">
      <PermissionBlock
        prefix="image-picker-camera"
        title="Camera"
        hookResponse={cameraResponse()}
        hookRequest={requestCamera}
        directGet={getCameraPermissionsAsync}
        directRequest={requestCameraPermissionsAsync}
      />
      <PermissionBlock
        prefix="image-picker-library"
        title="Media library"
        hookResponse={libraryResponse()}
        hookRequest={requestLibrary}
        directGet={() => getMediaLibraryPermissionsAsync()}
        directRequest={() => requestMediaLibraryPermissionsAsync()}
      />
    </Card>
  );
}

function AssetView(props: { asset: IImagePickerAsset; index: number }) {
  const rows = (): [string, string][] => [
    ['type', String(props.asset.type)],
    ['size', `${props.asset.width} × ${props.asset.height}`],
    ['fileName', String(props.asset.fileName)],
    ['fileSize', String(props.asset.fileSize)],
    ['duration', String(props.asset.duration)],
    ['assetId', String(props.asset.assetId)],
    ['exif', props.asset.exif ? `${Object.keys(props.asset.exif).length} keys` : 'none'],
    ['base64', props.asset.base64 ? `${props.asset.base64.length} chars` : 'none'],
    ['pairedVideoAsset', props.asset.pairedVideoAsset?.uri ?? 'none'],
  ];
  return (
    <view testID={`image-picker-asset-${props.index}`}>
      <For each={rows()}>
        {([label, value]) => (
          <ResultRow
            testID={`image-picker-asset-${props.index}-${label}`}
            label={label}
            value={value}
          />
        )}
      </For>
      <Show when={props.asset.type !== 'video'}>
        <image
          testID={`image-picker-preview-${props.index}`}
          source={{ uri: props.asset.uri }}
          style={{ width: '100%', height: 180 }}
          resizeMode="contain"
        />
      </Show>
    </view>
  );
}

function LaunchCard(props: { form: IForm }) {
  const [status, setStatus] = createSignal('idle');
  const [assets, setAssets] = createSignal<IImagePickerAsset[]>([]);

  const launch = (launcher: typeof launchImageLibraryAsync) => {
    setStatus('picker open…');
    launcher(toPickerOptions(props.form))
      .then(result => {
        setStatus(
          result.canceled ? 'canceled' : `picked ${result.assets.length}`,
        );
        setAssets(result.canceled ? [] : result.assets);
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  const handlePending = () => {
    getPendingResultAsync()
      .then(pending =>
        setStatus(
          pending === null ? 'no pending result' : JSON.stringify(pending),
        ),
      )
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="image-picker-result-card"
      title="Choose a profile photo or take a new one"
      why="Avatars, receipts and attachments start with a photo. The picker gives the app only what the user chooses, so it needs no broad access to the whole library."
      steps={['Press launchImageLibraryAsync and pick a photo', 'Press launchCameraAsync and take one (needs a real camera)', 'Cancel once']}
      expect="The status says picked N and each photo shows its size and file URI with a preview. Cancelling says canceled."
    >
      <ActionButton
        testID="image-picker-library-button"
        title="launchImageLibraryAsync"
        onPress={() => launch(launchImageLibraryAsync)}
        color={color}
      />
      <ActionButton
        testID="image-picker-camera-button"
        title="launchCameraAsync"
        onPress={() => launch(launchCameraAsync)}
        color={color}
      />
      <ActionButton
        testID="image-picker-pending-button"
        title="getPendingResultAsync (Android)"
        onPress={handlePending}
        color={color}
      />
      <ResultRow
        testID="image-picker-status"
        label="canceled / assets"
        value={status()}
      />
      <For each={assets()}>
        {(asset, index) => <AssetView asset={asset} index={index()} />}
      </For>
    </Scenario>
  );
}

export function ImagePickerScreen() {
  const [form, setFormState] = createSignal<IForm>(INITIAL_FORM);
  const setForm: ISetForm = patch =>
    setFormState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE}
      testID="image-picker-scroll"
      title="Image Picker"
      body="Let users pick photos and videos from the library or shoot them with the camera, with optional cropping, several selections and video presets."
    >
      <LaunchCard form={form()} />
      <Explorer testID="image-picker-explorer" color={color}>
        <PermissionsCard />
        <CommonOptionsCard form={form()} setForm={setForm} />
        <SelectionCard form={form()} setForm={setForm} />
        <VideoCard form={form()} setForm={setForm} />
      </Explorer>
    </ScreenShell>
  );
}
