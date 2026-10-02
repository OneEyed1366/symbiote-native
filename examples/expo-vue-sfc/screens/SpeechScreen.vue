<script setup lang="ts">
import { ref } from 'vue';
import {
  VoiceQuality,
  getAvailableVoicesAsync,
  isSpeakingAsync,
  maxSpeechInputLength,
  pause,
  resume,
  speak,
  stop,
} from '@symbiote-native/speech';
import type { IVoice } from '@symbiote-native/speech';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Speech;
const color = lineColorOf(ROUTE);
const MAX_LOGGED_EVENTS = 12;
const MAX_LISTED_VOICES = 8;

const text = ref('Hello from the Symbiote canary');
const language = ref('');
const pitch = ref('');
const rate = ref('');
const volume = ref('');
const voice = ref('');
const useApplicationAudioSession = ref(true);
const isBoundaryListened = ref(false);
const lines = ref<string[]>([]);
const speaking = ref('unknown');
const voices = ref<IVoice[] | null>(null);
const voicesError = ref('');

function pushLog(line: string): void {
  lines.value = [line, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
}

function parseOptional(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
}

function qualityLabel(item: IVoice): string {
  return item.quality === VoiceQuality.Enhanced ? 'enhanced' : 'default';
}

function listedVoices(): IVoice[] {
  return voices.value?.slice(0, MAX_LISTED_VOICES) ?? [];
}

function pickVoice(item: IVoice): void {
  voice.value = item.identifier;
  language.value = item.language;
}

function handleLoadVoices(): void {
  getAvailableVoicesAsync()
    .then(list => {
      voices.value = list;
      voicesError.value = '';
    })
    .catch((failure: Error) => {
      voicesError.value = failure.message;
    });
}

function handleSpeak(): void {
  speak(text.value, {
    language: language.value.trim() || undefined,
    pitch: parseOptional(pitch.value),
    rate: parseOptional(rate.value),
    volume: parseOptional(volume.value),
    voice: voice.value.trim() || undefined,
    useApplicationAudioSession: useApplicationAudioSession.value,
    onStart: () => pushLog('onStart'),
    onStopped: () => pushLog('onStopped'),
    onDone: () => pushLog('onDone'),
    onError: (error: Error) => pushLog(`onError: ${error.message}`),
    onBoundary: isBoundaryListened.value
      ? (event: { charIndex: number; charLength: number }) =>
          pushLog(`onBoundary @${event.charIndex}+${event.charLength}`)
      : null,
  });
}

function report(label: string, promise: Promise<void>): void {
  promise.catch((error: Error) => pushLog(`${label} failed: ${error.message}`));
}

function handleIsSpeaking(): void {
  void isSpeakingAsync().then(value => {
    speaking.value = String(value);
  });
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="speech-scroll"
    title="Speech"
    body="Make the app speak with the phone's built-in voices: pick a language and voice, change pitch and speed, and follow start and finish callbacks. Works offline."
  >
    <Scenario
      testID="speech-controls-card"
      title="Read a message aloud"
      why="Give an app a voice for accessibility, language learning or hands-free prompts. The phone's own speech engine does the work, with no network and no audio files."
      :steps="['Press speak', 'Try pause and resume (iOS), then stop mid-sentence']"
      expect="The sentence is spoken. The callback log below shows start, done or stopped, and isSpeaking tells whether it is still talking."
    >
      <ActionButton testID="speech-speak-button" title="speak" :onPress="handleSpeak" :color="color" />
      <ActionButton
        testID="speech-stop-button"
        title="stop"
        :onPress="() => report('stop', stop())"
        :color="color"
      />
      <ActionButton
        testID="speech-pause-button"
        title="pause (iOS)"
        :onPress="() => report('pause', pause())"
        :color="color"
      />
      <ActionButton
        testID="speech-resume-button"
        title="resume (iOS)"
        :onPress="() => report('resume', resume())"
        :color="color"
      />
      <ActionButton
        testID="speech-is-speaking-button"
        title="isSpeakingAsync"
        :onPress="handleIsSpeaking"
        :color="color"
      />
      <ResultRow testID="speech-is-speaking" label="isSpeaking" :value="speaking" />
      <ResultRow
        testID="speech-max-length"
        label="maxSpeechInputLength"
        :value="String(maxSpeechInputLength)"
      />
    </Scenario>

    <Card testID="speech-log-card" title="Callback log">
      <text testID="speech-log" class="info-text">
        {{ lines.length === 0 ? 'no events yet' : lines.join('\n') }}
      </text>
    </Card>

    <Explorer testID="speech-explorer" :color="color">
      <Card testID="speech-options-card" title="Options">
        <Field testID="speech-text-input" label="text" :value="text" :onChange="next => (text = next)" />
        <Field
          testID="speech-language-input"
          label="language (BCP-47)"
          :value="language"
          :onChange="next => (language = next)"
          placeholder="en-US"
        />
        <Field
          testID="speech-pitch-input"
          label="pitch (0.5 - 2.0)"
          :value="pitch"
          :onChange="next => (pitch = next)"
          placeholder="1.0"
        />
        <Field
          testID="speech-rate-input"
          label="rate (0.1 - 2.0)"
          :value="rate"
          :onChange="next => (rate = next)"
          placeholder="1.0"
        />
        <Field
          testID="speech-volume-input"
          label="volume (0 - 1, iOS)"
          :value="volume"
          :onChange="next => (volume = next)"
          placeholder="1.0"
        />
        <Field
          testID="speech-voice-input"
          label="voice identifier"
          :value="voice"
          :onChange="next => (voice = next)"
        />
        <ToggleRow
          testID="speech-session-switch"
          label="useApplicationAudioSession (iOS)"
          :value="useApplicationAudioSession"
          :onChange="next => (useApplicationAudioSession = next)"
          :color="color"
        />
        <ToggleRow
          testID="speech-boundary-switch"
          label="onBoundary events (iOS)"
          :value="isBoundaryListened"
          :onChange="next => (isBoundaryListened = next)"
          :color="color"
        />
      </Card>

      <Card testID="speech-voices-card" title="Voices">
        <ActionButton
          testID="speech-voices-button"
          title="getAvailableVoicesAsync"
          :onPress="handleLoadVoices"
          :color="color"
        />
        <ResultRow
          testID="speech-voices-count"
          label="Installed voices"
          :value="voices === null ? 'not loaded' : String(voices.length)"
        />
        <ResultRow v-if="voicesError !== ''" testID="speech-voices-error" label="Error" :value="voicesError" />
        <ActionButton
          v-for="item in listedVoices()"
          :key="item.identifier"
          :testID="`speech-voice-${item.identifier}`"
          :title="`${item.name} · ${item.language} · ${qualityLabel(item)}`"
          :onPress="() => pickVoice(item)"
          :color="color"
        />
        <text class="info-text">Tap a voice to fill the voice identifier and language above.</text>
      </Card>
    </Explorer>
  </ScreenShell>
</template>
