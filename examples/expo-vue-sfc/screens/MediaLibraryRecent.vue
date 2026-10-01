<script setup lang="ts">
import { ref } from 'vue';
import { getAssetsAsync, requestPermissionsAsync } from '@symbiote-native/media-library/legacy';
import type { IMediaLibraryAsset } from '@symbiote-native/media-library/legacy';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const RECENT_COUNT = 6;

const assets = ref<IMediaLibraryAsset[]>([]);
const status = ref('idle');

function load(): void {
  status.value = 'loading…';
  requestPermissionsAsync()
    .then(permission => {
      if (!permission.granted) {
        throw new Error('photo access was not granted');
      }
      return getAssetsAsync({ first: RECENT_COUNT, mediaType: 'photo', sortBy: 'creationTime' });
    })
    .then(page => {
      assets.value = page.assets;
      status.value = `${page.assets.length} of ${page.totalCount} photos`;
    })
    .catch((error: Error) => {
      status.value = `failed: ${error.message}`;
    });
}
</script>

<template>
  <Scenario
    testID="media-library-recent-scenario"
    title="Show the user's latest photos in your own gallery"
    why="Build a custom photo picker, a memories strip or a photo backup screen by reading the library directly, with access the user can limit to selected photos."
    :steps="['Press Show latest photos and allow access', 'Choose a limited selection or full access']"
    expect="Up to six of the newest photos appear as thumbnails and the status shows how many photos the library holds. Denying access shows the reason instead."
  >
    <ActionButton
      testID="media-library-recent-button"
      title="Show latest photos"
      :onPress="load"
      :color="color"
    />
    <ResultRow testID="media-library-recent-status" label="Status" :value="status" />
    <view class="thumb-row">
      <image
        v-for="asset in assets"
        :key="asset.id"
        :source="{ uri: asset.uri }"
        class="thumb"
      ></image>
    </view>
  </Scenario>
</template>
