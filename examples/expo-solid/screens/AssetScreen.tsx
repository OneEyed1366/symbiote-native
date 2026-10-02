import { For, Show, createSignal } from 'solid-js';
import {
  ANDROID_EMBEDDED_URL_BASE_RESOURCE,
  Asset,
} from '@symbiote-native/asset';
import { createAssets } from '@symbiote-native/asset/solid';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Asset;
const color = lineColorOf(ROUTE);
const BUNDLED_MODULE = require('../assets/bootsplash-logo.svg');
const SAMPLE_IMAGE = 'https://reactnative.dev/img/tiny_logo.png';
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
type IImageType = (typeof IMAGE_TYPES)[number];

function isImageType(type: string): type is IImageType {
  return IMAGE_TYPES.some(candidate => candidate === type);
}

function AssetRows(props: { asset: Asset }) {
  const rows = (): [string, string][] => [
    ['name', props.asset.name],
    ['type', props.asset.type],
    ['hash', String(props.asset.hash)],
    ['uri', props.asset.uri],
    ['localUri', String(props.asset.localUri)],
    ['width', String(props.asset.width)],
    ['height', String(props.asset.height)],
    ['downloaded', String(props.asset.downloaded)],
  ];
  return (
    <Card testID="asset-last-card" title="Last asset">
      <For each={rows()}>
        {([label, value]) => (
          <ResultRow testID={`asset-last-${label}`} label={label} value={value} />
        )}
      </For>
      <Show when={isImageType(props.asset.type)}>
        <image
          testID="asset-last-image"
          source={{ uri: props.asset.localUri ?? props.asset.uri }}
          style={{ width: '100%', height: 120 }}
          resizeMode="contain"
        />
      </Show>
    </Card>
  );
}

function HookProbe() {
  const loaded = createAssets(BUNDLED_MODULE);
  return (
    <ResultRow
      testID="asset-hook-result"
      label="useAssets [assets, error]"
      value={
        loaded.error() === undefined
          ? `${loaded.assets()?.length ?? 0} loaded, downloaded ${String(loaded.assets()?.[0]?.downloaded)}`
          : (loaded.error()?.message ?? '')
      }
    />
  );
}

function HookCard() {
  const [isMounted, setIsMounted] = createSignal(false);
  return (
    <Scenario
      testID="asset-hook-card"
      title="Preload the assets a screen needs"
      why="Resolve and download bundled images or sounds before first paint so the screen never shows a half-loaded state."
      steps={['Turn the switch on', 'Read the result row']}
      expect="The row shows the loaded state and the names of the assets that were resolved."
    >
      <ToggleRow
        testID="asset-hook-switch"
        label="mount a component calling useAssets(moduleId)"
        value={isMounted()}
        onChange={setIsMounted}
        color={color}
      />
      <Show when={isMounted()}>
        <HookProbe />
      </Show>
    </Scenario>
  );
}

export function AssetScreen() {
  const [uri, setUri] = createSignal(SAMPLE_IMAGE);
  const [asset, setAsset] = createSignal<Asset | null>(null);
  const remember = (next: Asset): Asset => {
    setAsset(next);
    return next;
  };

  return (
    <ScreenShell
      route={ROUTE}
      testID="asset-scroll"
      title="Asset"
      body="Treat images, sounds and other files as one thing whether they are bundled with the app or live on a server: resolve them to an Asset, download once to the cache and get a local file path."
    >
      <Scenario
        testID="asset-download-scenario"
        title="Download a remote file once and use it offline"
        why="Cache a server image or a sound on first use, then read it from a local path afterwards. The Asset object tracks the download state for you."
        steps={['Press downloadAsync (remote uri), the sample image is preset', 'Look at the Last asset card', 'Press it again']}
        expect="The call returns a local file path, and the Last asset card shows the name, type and sizes. The second press returns the same path without downloading again."
      >
        <CallConsole
          isBare
          prefix="asset-download"
          title="Asset instance"
          color={color}
          calls={[
            {
              label: 'downloadAsync (last asset)',
              run: async () => {
                const current = asset();
                if (current === null) {
                  throw new Error('create an asset with one of the statics first');
                }
                return remember(await current.downloadAsync()).localUri;
              },
            },
            {
              label: 'downloadAsync (remote uri)',
              run: async () => remember(await Asset.fromURI(uri()).downloadAsync()).localUri,
            },
          ]}
        />
      </Scenario>
      <Show when={asset()}>
        {(current: () => Asset) => <AssetRows asset={current()} />}
      </Show>
      <HookCard />
      <Explorer testID="asset-explorer" color={color}>
        <Card testID="asset-input-card" title="Sources">
          <Field
            testID="asset-uri-input"
            label="remote uri"
            value={uri()}
            onChange={setUri}
          />
          <ResultRow
            testID="asset-android-base"
            label="ANDROID_EMBEDDED_URL_BASE_RESOURCE"
            value={ANDROID_EMBEDDED_URL_BASE_RESOURCE}
          />
        </Card>
        <CallConsole
          prefix="asset-static"
          title="Asset statics"
          color={color}
          hint="fromModule with a require() id resolves the bundled svg, the object form and the string form take a uri."
          calls={[
            { label: 'fromModule(require)', run: async () => remember(Asset.fromModule(BUNDLED_MODULE)).name },
            {
              label: 'fromModule({ uri, width, height })',
              run: async () =>
                remember(Asset.fromModule({ uri: uri(), width: 100, height: 100 })).uri,
            },
            { label: 'fromModule(string)', run: async () => remember(Asset.fromModule(uri())).uri },
            { label: 'fromURI', run: async () => remember(Asset.fromURI(uri())).uri },
            {
              label: 'fromMetadata',
              run: async () =>
                remember(
                  Asset.fromMetadata({
                    name: 'tiny_logo',
                    type: 'png',
                    hash: 'canary-hash',
                    httpServerLocation: 'https://reactnative.dev/img',
                    scales: [1],
                    width: 64,
                    height: 64,
                  }),
                ).uri,
            },
            {
              label: 'loadAsync(require)',
              run: async () => (await Asset.loadAsync(BUNDLED_MODULE)).map(item => remember(item).name),
            },
            {
              label: 'loadAsync([ids])',
              run: async () => (await Asset.loadAsync([BUNDLED_MODULE])).length,
            },
          ]}
        />
      </Explorer>
    </ScreenShell>
  );
}
