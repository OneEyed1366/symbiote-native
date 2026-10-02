import { useCallback, useState } from 'react';
import {
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from '@symbiote-native/image-picker';
import type { IImagePickerAsset } from '@symbiote-native/image-picker';
import {
  useCameraPermissions,
  useMediaLibraryPermissions,
} from '@symbiote-native/image-picker/react';
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
  const { prefix, title, hookResponse, hookRequest } = props;
  const [direct, setDirect] = useState('not called');
  const run = (call: () => Promise<IPermissionLike>) =>
    call()
      .then(response => setDirect(describePermission(response)))
      .catch((error: Error) => setDirect(`failed: ${error.message}`));
  return (
    <view>
      <text className="feature-card-title">{title}</text>
      <ResultRow
        testID={`${prefix}-hook`}
        label="hook state"
        value={describePermission(hookResponse)}
      />
      <ActionButton
        testID={`${prefix}-hook-request`}
        title="hook request()"
        onPress={() => hookRequest()}
        color={color}
      />
      <ActionButton
        testID={`${prefix}-get`}
        title="get…PermissionsAsync"
        onPress={() => run(props.directGet)}
        color={color}
      />
      <ActionButton
        testID={`${prefix}-request`}
        title="request…PermissionsAsync"
        onPress={() => run(props.directRequest)}
        color={color}
      />
      <ResultRow testID={`${prefix}-direct`} label="direct call" value={direct} />
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
        hookResponse={cameraResponse}
        hookRequest={requestCamera}
        directGet={getCameraPermissionsAsync}
        directRequest={requestCameraPermissionsAsync}
      />
      <PermissionBlock
        prefix="image-picker-library"
        title="Media library"
        hookResponse={libraryResponse}
        hookRequest={requestLibrary}
        directGet={() => getMediaLibraryPermissionsAsync()}
        directRequest={() => requestMediaLibraryPermissionsAsync()}
      />
    </Card>
  );
}

function AssetView({ asset, index }: { asset: IImagePickerAsset; index: number }) {
  const rows: [string, string][] = [
    ['type', String(asset.type)],
    ['size', `${asset.width} × ${asset.height}`],
    ['fileName', String(asset.fileName)],
    ['fileSize', String(asset.fileSize)],
    ['duration', String(asset.duration)],
    ['assetId', String(asset.assetId)],
    ['exif', asset.exif ? `${Object.keys(asset.exif).length} keys` : 'none'],
    ['base64', asset.base64 ? `${asset.base64.length} chars` : 'none'],
    ['pairedVideoAsset', asset.pairedVideoAsset?.uri ?? 'none'],
  ];
  return (
    <view testID={`image-picker-asset-${index}`}>
      {rows.map(([label, value]) => (
        <ResultRow
          key={label}
          testID={`image-picker-asset-${index}-${label}`}
          label={label}
          value={value}
        />
      ))}
      {asset.type !== 'video' && (
        <image
          testID={`image-picker-preview-${index}`}
          source={{ uri: asset.uri }}
          style={{ width: '100%', height: 180 }}
          resizeMode="contain"
        />
      )}
    </view>
  );
}

function LaunchCard({ form }: { form: IForm }) {
  const [status, setStatus] = useState('idle');
  const [assets, setAssets] = useState<IImagePickerAsset[]>([]);

  const launch = useCallback(
    (launcher: typeof launchImageLibraryAsync) => {
      setStatus('picker open…');
      launcher(toPickerOptions(form))
        .then(result => {
          setStatus(
            result.canceled ? 'canceled' : `picked ${result.assets.length}`,
          );
          setAssets(result.canceled ? [] : result.assets);
        })
        .catch((error: Error) => setStatus(`failed: ${error.message}`));
    },
    [form],
  );

  const handlePending = useCallback(() => {
    getPendingResultAsync()
      .then(pending =>
        setStatus(
          pending === null ? 'no pending result' : JSON.stringify(pending),
        ),
      )
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  }, []);

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
        value={status}
      />
      {assets.map((asset, index) => (
        <AssetView key={asset.uri} asset={asset} index={index} />
      ))}
    </Scenario>
  );
}

export function ImagePickerScreen() {
  const [form, setFormState] = useState<IForm>(INITIAL_FORM);
  const setForm: ISetForm = patch =>
    setFormState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE}
      testID="image-picker-scroll"
      title="Image Picker"
      body="Let users pick photos and videos from the library or shoot them with the camera, with optional cropping, several selections and video presets."
    >
      <LaunchCard form={form} />
      <Explorer testID="image-picker-explorer" color={color}>
        <PermissionsCard />
        <CommonOptionsCard form={form} setForm={setForm} />
        <SelectionCard form={form} setForm={setForm} />
        <VideoCard form={form} setForm={setForm} />
      </Explorer>
    </ScreenShell>
  );
}
