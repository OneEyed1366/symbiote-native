<script setup lang="ts">
import { ref } from 'vue';
import type { ICameraMode, ICameraViewHandle } from '@symbiote-native/camera/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import RecordedClip from './RecordedClip.vue';
import { MAX_RECORD_SECONDS, errorLine } from './camera-shared';

const props = defineProps<{ camera: ICameraViewHandle | null; mode: ICameraMode; color: string }>();

const EXPECT = `The recording ends on Stop or after ${MAX_RECORD_SECONDS} seconds, whichever is first, and the saved clip plays under the buttons with sound.`;

const uri = ref<string | null>(null);
const line = ref('not recording');

async function record(): Promise<void> {
  line.value = 'recording…';
  try {
    const result = await props.camera?.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
    uri.value = result?.uri ?? null;
    line.value = result === undefined ? 'stopped with no file' : 'saved';
  } catch (error) {
    line.value = `failed: ${errorLine(error)}`;
  }
}

async function togglePause(): Promise<void> {
  try {
    await props.camera?.toggleRecordingAsync();
  } catch (error) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="camera-video-scenario"
    title="Record a short video message"
    why="Chats, support forms and social apps record a clip of a limited length and play it back before sending. The recording stops by itself at the limit."
    :steps="['Switch the camera to the recording mode above', 'Press Record and wait, or press Stop after a few seconds', 'Play the clip below']"
    :expect="EXPECT"
  >
    <ResultRow
      testID="camera-mode-line"
      label="Camera mode"
      :value="mode"
    />
    <view class="button-row">
      <ActionButton
        testID="camera-record"
        title="Record"
        :color="color"
        @press="record"
      />
      <ActionButton
        testID="camera-stop"
        title="Stop"
        :color="color"
        @press="camera?.stopRecording()"
      />
      <ActionButton
        testID="camera-pause-record"
        title="Pause or resume (iOS 18)"
        :color="color"
        @press="togglePause"
      />
    </view>
    <ResultRow
      testID="camera-record-result"
      label="recordAsync"
      :value="line"
    />
    <RecordedClip
      v-if="uri !== null"
      :uri="uri"
    />
  </Scenario>
</template>
