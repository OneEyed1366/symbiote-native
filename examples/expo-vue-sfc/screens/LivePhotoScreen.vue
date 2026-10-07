<script setup lang="ts">
import { shallowRef } from 'vue';
import { Platform } from '@symbiote-native/vue';
import type { ILivePhotoAsset } from '@symbiote-native/live-photo/vue';
import ResultRow from '../components/ResultRow.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import LivePhotoLibraryScenario from './LivePhotoLibraryScenario.vue';
import LivePhotoPickScenario from './LivePhotoPickScenario.vue';
import LivePhotoPlayer from './LivePhotoPlayer.vue';

const ROUTE = ROUTE_NAME.LivePhoto;
const IS_IOS = Platform.select({ ios: true, default: false });
const color = lineColorOf(ROUTE);

const source = shallowRef<ILivePhotoAsset | null>(null);

function setSource(asset: ILivePhotoAsset): void {
  source.value = asset;
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="live-photo-scroll"
    title="Live Photo"
    body="iOS only: show an Apple Live Photo, play its motion on a press and react to loading and playback events. It needs a Live Photo on the device, take one with the Camera app."
  >
    <ResultRow
      v-if="!IS_IOS"
      testID="live-photo-platform"
      label="Platform"
      value="Live Photos exist on iOS only, the view renders nothing here"
    />
    <LivePhotoPickScenario
      :color="color"
      @picked="setSource"
    />
    <LivePhotoLibraryScenario
      :color="color"
      @found="setSource"
    />
    <LivePhotoPlayer
      :source="source"
      :color="color"
    />
  </ScreenShell>
</template>
