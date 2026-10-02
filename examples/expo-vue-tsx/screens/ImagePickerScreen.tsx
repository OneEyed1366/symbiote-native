import { defineComponent, ref } from 'vue';
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
} from '@symbiote-native/image-picker/vue';
import type { IImagePickerAsset } from '@symbiote-native/image-picker/vue';
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
  ASSET_TYPE_VIDEO,
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

const PermissionBlock = defineComponent<IPermissionBlockProps>(
  props => {
    const direct = ref('not called');
    const run = (call: () => Promise<IPermissionLike>) =>
      call()
        .then(response => {
          direct.value = describePermission(response);
        })
        .catch((error: Error) => {
          direct.value = `failed: ${error.message}`;
        });
    return () => (
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
        <ResultRow testID={`${props.prefix}-direct`} label="direct call" value={direct.value} />
      </view>
    );
  },
  {
    name: 'PermissionBlock',
    props: ['prefix', 'title', 'hookResponse', 'hookRequest', 'directGet', 'directRequest'],
  },
);

const PermissionsCard = defineComponent(
  () => {
    const [cameraResponse, requestCamera] = useCameraPermissions();
    const [libraryResponse, requestLibrary] = useMediaLibraryPermissions();
    return () => (
      <Card testID="image-picker-permissions-card" title="Permissions">
        <PermissionBlock
          prefix="image-picker-camera"
          title="Camera"
          hookResponse={cameraResponse.value}
          hookRequest={requestCamera}
          directGet={getCameraPermissionsAsync}
          directRequest={requestCameraPermissionsAsync}
        />
        <PermissionBlock
          prefix="image-picker-library"
          title="Media library"
          hookResponse={libraryResponse.value}
          hookRequest={requestLibrary}
          directGet={() => getMediaLibraryPermissionsAsync()}
          directRequest={() => requestMediaLibraryPermissionsAsync()}
        />
      </Card>
    );
  },
  { name: 'PermissionsCard' },
);

function AssetView(props: { asset: IImagePickerAsset; index: number }) {
  const rows: [string, string][] = [
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
      {rows.map(([label, value]) => (
        <ResultRow
          key={label}
          testID={`image-picker-asset-${props.index}-${label}`}
          label={label}
          value={value}
        />
      ))}
      {props.asset.type !== ASSET_TYPE_VIDEO && (
        <image
          testID={`image-picker-preview-${props.index}`}
          source={{ uri: props.asset.uri }}
          style={{ width: '100%', height: 180 }}
          resizeMode="contain"
        />
      )}
    </view>
  );
}

const LaunchCard = defineComponent<{ form: IForm }>(
  props => {
    const status = ref('idle');
    const assets = ref<IImagePickerAsset[]>([]);

    const launch = (launcher: typeof launchImageLibraryAsync) => {
      status.value = 'picker open…';
      launcher(toPickerOptions(props.form))
        .then(result => {
          status.value = result.canceled ? 'canceled' : `picked ${result.assets.length}`;
          assets.value = result.canceled ? [] : result.assets;
        })
        .catch((error: Error) => {
          status.value = `failed: ${error.message}`;
        });
    };

    const handlePending = () => {
      getPendingResultAsync()
        .then(pending => {
          status.value = pending === null ? 'no pending result' : JSON.stringify(pending);
        })
        .catch((error: Error) => {
          status.value = `failed: ${error.message}`;
        });
    };

    return () => (
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
          value={status.value}
        />
        {assets.value.map((asset, index) => (
          <AssetView key={asset.uri} asset={asset} index={index} />
        ))}
      </Scenario>
    );
  },
  { name: 'LaunchCard', props: ['form'] },
);

export const ImagePickerScreen = defineComponent(
  () => {
    const form = ref<IForm>(INITIAL_FORM);
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };

    return () => (
      <ScreenShell
        route={ROUTE}
        testID="image-picker-scroll"
        title="Image Picker"
        body="Let users pick photos and videos from the library or shoot them with the camera, with optional cropping, several selections and video presets."
      >
        <LaunchCard form={form.value} />
        <Explorer testID="image-picker-explorer" color={color}>
          <PermissionsCard />
          <CommonOptionsCard form={form.value} setForm={setForm} />
          <SelectionCard form={form.value} setForm={setForm} />
          <VideoCard form={form.value} setForm={setForm} />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'ImagePickerScreen' },
);
