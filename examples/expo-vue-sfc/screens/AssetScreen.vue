<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { ANDROID_EMBEDDED_URL_BASE_RESOURCE, Asset } from '@symbiote-native/asset/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AssetHookProbe from './AssetHookProbe.vue';

const ROUTE = ROUTE_NAME.Asset;
const color = lineColorOf(ROUTE);
const BUNDLED_MODULE = require('../assets/bootsplash-logo.svg');
const SAMPLE_IMAGE = 'https://reactnative.dev/img/tiny_logo.png';
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
type IImageType = (typeof IMAGE_TYPES)[number];

function isImageType(type: string): type is IImageType {
  return IMAGE_TYPES.some(candidate => candidate === type);
}

const uri = ref(SAMPLE_IMAGE);
// An Asset is a class instance that mutates itself on download, so it stays shallow
const asset = shallowRef<Asset | null>(null);
const isHookMounted = ref(false);

function remember(next: Asset): Asset {
  asset.value = next;
  return next;
}

const rows = computed((): [string, string][] => {
  const current = asset.value;
  if (current === null) {
    return [];
  }
  return [
    ['name', current.name],
    ['type', current.type],
    ['hash', String(current.hash)],
    ['uri', current.uri],
    ['localUri', String(current.localUri)],
    ['width', String(current.width)],
    ['height', String(current.height)],
    ['downloaded', String(current.downloaded)],
  ];
});

const downloadCalls = [
  {
    label: 'downloadAsync (last asset)',
    run: async () => {
      if (asset.value === null) {
        throw new Error('create an asset with one of the statics first');
      }
      return remember(await asset.value.downloadAsync()).localUri;
    },
  },
  {
    label: 'downloadAsync (remote uri)',
    run: async () => remember(await Asset.fromURI(uri.value).downloadAsync()).localUri,
  },
];

const staticCalls = [
  {
    label: 'fromModule(require)',
    run: async () => remember(Asset.fromModule(BUNDLED_MODULE)).name,
  },
  {
    label: 'fromModule({ uri, width, height })',
    run: async () => remember(Asset.fromModule({ uri: uri.value, width: 100, height: 100 })).uri,
  },
  {
    label: 'fromModule(string)',
    run: async () => remember(Asset.fromModule(uri.value)).uri,
  },
  { label: 'fromURI', run: async () => remember(Asset.fromURI(uri.value)).uri },
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
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="asset-scroll"
    title="Asset"
    body="Treat images, sounds and other files as one thing whether they are bundled with the app or live on a server: resolve them to an Asset, download once to the cache and get a local file path."
  >
    <Scenario
      testID="asset-download-scenario"
      title="Download a remote file once and use it offline"
      why="Cache a server image or a sound on first use, then read it from a local path afterwards. The Asset object tracks the download state for you."
      :steps="[
        'Press downloadAsync (remote uri), the sample image is preset',
        'Look at the Last asset card',
        'Press it again',
      ]"
      expect="The call returns a local file path, and the Last asset card shows the name, type and sizes. The second press returns the same path without downloading again."
    >
      <CallConsole
        isBare
        prefix="asset-download"
        title="Asset instance"
        :color="color"
        :calls="downloadCalls"
      />
    </Scenario>

    <Card v-if="asset" testID="asset-last-card" title="Last asset">
      <ResultRow
        v-for="[label, value] in rows"
        :key="label"
        :testID="`asset-last-${label}`"
        :label="label"
        :value="value"
      />
      <image
        v-if="isImageType(asset.type)"
        testID="asset-last-image"
        :source="{ uri: asset.localUri ?? asset.uri }"
        :style="{ width: '100%', height: 120 }"
        resizeMode="contain"
      ></image>
    </Card>

    <Scenario
      testID="asset-hook-card"
      title="Preload the assets a screen needs"
      why="Resolve and download bundled images or sounds before first paint so the screen never shows a half-loaded state."
      :steps="['Turn the switch on', 'Read the result row']"
      expect="The row shows the loaded state and the names of the assets that were resolved."
    >
      <ToggleRow
        testID="asset-hook-switch"
        label="mount a component calling useAssets(moduleId)"
        :value="isHookMounted"
        :onChange="next => (isHookMounted = next)"
        :color="color"
      />
      <AssetHookProbe v-if="isHookMounted" />
    </Scenario>

    <Explorer testID="asset-explorer" :color="color">
      <Card testID="asset-input-card" title="Sources">
        <Field
          testID="asset-uri-input"
          label="remote uri"
          :value="uri"
          :onChange="next => (uri = next)"
        />
        <ResultRow
          testID="asset-android-base"
          label="ANDROID_EMBEDDED_URL_BASE_RESOURCE"
          :value="ANDROID_EMBEDDED_URL_BASE_RESOURCE"
        />
      </Card>
      <CallConsole
        prefix="asset-static"
        title="Asset statics"
        :color="color"
        hint="fromModule with a require() id resolves the bundled svg, the object form and the string form take a uri."
        :calls="staticCalls"
      />
    </Explorer>
  </ScreenShell>
</template>
