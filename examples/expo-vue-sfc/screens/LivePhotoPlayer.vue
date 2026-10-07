<script setup lang="ts">
import { ref } from 'vue';
import { LivePhotoView } from '@symbiote-native/live-photo/vue';
import type { ILivePhotoAsset, ILivePhotoContentFit, ILivePhotoViewHandle } from '@symbiote-native/live-photo/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { FIT_OPTIONS, errorLine, pushLogLine } from './live-photo-shared';

defineProps<{ source: ILivePhotoAsset | null; color: string }>();

const handle = ref<ILivePhotoViewHandle | null>(null);
const lines = ref<string[]>([]);
const isMuted = ref(true);
const isGesture = ref(true);
const fit = ref<ILivePhotoContentFit>('contain');

function log(line: string): void {
  lines.value = pushLogLine(lines.value, line);
}

function guard(action: () => void): void {
  try {
    action();
  } catch (error: unknown) {
    log(`failed: ${errorLine(error)}`);
  }
}
</script>

<template>
  <Card
    testID="live-photo-player-card"
    title="The Live Photo view"
  >
    <LivePhotoView
      v-if="source !== null"
      ref="handle"
      testID="live-photo-view"
      class="live-view"
      :source="source"
      :isMuted="isMuted"
      :contentFit="fit"
      :useDefaultGestureRecognizer="isGesture"
      @loadStart="log('load start')"
      @previewPhotoLoad="log('preview photo loaded')"
      @loadComplete="log('ready to play')"
      @loadError="error => log(`load error: ${error.message}`)"
      @playbackStart="log('playback start')"
      @playbackStop="log('playback stop')"
    />
    <view
      v-else
      testID="live-photo-placeholder"
      class="live-placeholder"
    >
      <text class="hero-body">
        Pick or load a Live Photo above, it is shown here.
      </text>
    </view>
    <view class="button-row">
      <ActionButton
        testID="live-photo-hint"
        title="Play a hint"
        :color="color"
        @press="guard(() => handle?.startPlayback('hint'))"
      />
      <ActionButton
        testID="live-photo-full"
        title="Play fully"
        :color="color"
        @press="guard(() => handle?.startPlayback('full'))"
      />
      <ActionButton
        testID="live-photo-stop"
        title="Stop"
        :color="color"
        @press="guard(() => handle?.stopPlayback())"
      />
    </view>
    <ResultRow
      v-if="lines.length === 0"
      testID="live-photo-log-empty"
      label="Events"
      value="none yet"
    />
    <template v-else>
      <ResultRow
        v-for="line in lines"
        :key="line"
        testID="live-photo-log"
        label="event"
        :value="line"
      />
    </template>
    <Explorer
      testID="live-photo-explorer"
      :color="color"
    >
      <ToggleRow
        testID="live-photo-muted"
        label="isMuted"
        :value="isMuted"
        :color="color"
        @change="value => (isMuted = value)"
      />
      <ToggleRow
        testID="live-photo-gesture"
        label="useDefaultGestureRecognizer: press and hold plays"
        :value="isGesture"
        :color="color"
        @change="value => (isGesture = value)"
      />
      <ChoiceRow
        testID="live-photo-fit"
        label="contentFit"
        :color="color"
        :value="fit"
        :options="FIT_OPTIONS"
        @change="value => (fit = value)"
      />
    </Explorer>
  </Card>
</template>
