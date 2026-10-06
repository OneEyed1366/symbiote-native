<script setup lang="ts">
import { ref } from 'vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import BasicScenario from './BasicScenario.vue';
import CacheScenario from './CacheScenario.vue';
import CustomControlsScenario from './CustomControlsScenario.vue';
import FeedScenario from './FeedScenario.vue';
import FullscreenScenario from './FullscreenScenario.vue';
import PlayerExplorer from './PlayerExplorer.vue';
import ReelsScenario from './ReelsScenario.vue';
import ThumbnailsScenario from './ThumbnailsScenario.vue';
import TracksScenario from './TracksScenario.vue';

const ROUTE = ROUTE_NAME.Video;
const color = lineColorOf(ROUTE);

const isMounted = ref(true);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="video-scroll"
    title="Video"
    body="expo-video: a native player object plus a view. System or custom controls, feeds, fullscreen, picture in picture, thumbnails, tracks and an on-disk cache."
  >
    <Card
      testID="video-mount-card"
      title="Players on this screen"
    >
      <ToggleRow
        testID="video-mount"
        label="Mount the players below"
        :value="isMounted"
        :color="color"
        @change="value => (isMounted = value)"
      />
      <ResultRow
        testID="video-mount-state"
        label="Why"
        value="the cache calls work only while no player exists"
      />
    </Card>
    <template v-if="isMounted">
      <BasicScenario />
      <CustomControlsScenario :color="color" />
      <FeedScenario :color="color" />
      <ReelsScenario :color="color" />
      <FullscreenScenario :color="color" />
      <ThumbnailsScenario :color="color" />
      <TracksScenario :color="color" />
    </template>
    <CacheScenario
      :color="color"
      :isMounted="isMounted"
    />
    <PlayerExplorer
      v-if="isMounted"
      :color="color"
    />
  </ScreenShell>
</template>
