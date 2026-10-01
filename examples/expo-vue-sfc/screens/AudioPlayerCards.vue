<script setup lang="ts">
import { reactive } from 'vue';
import { createAudioPlayer, useAudioPlayer } from '@symbiote-native/audio/vue';
import type { AudioPlayer } from '@symbiote-native/audio/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AudioPlayerStatusCard from './AudioPlayerStatusCard.vue';
import AudioSampleCard from './AudioSampleCard.vue';
import {
  INITIAL_PLAYER_FORM,
  QUALITIES,
  TRACK_URL,
  lockScreenCalls,
  playerControls,
  toPlayerOptions,
} from './audio-player-calls';
import type { IPlayerForm } from './audio-player-calls';

const color = lineColorOf(ROUTE_NAME.Audio);

const form = reactive<IPlayerForm>({ ...INITIAL_PLAYER_FORM });
let imperative: AudioPlayer | null = null;

const player = useAudioPlayer(
  () => TRACK_URL,
  () => toPlayerOptions(form),
);

function live(): AudioPlayer {
  if (imperative === null) {
    throw new Error('createAudioPlayer first');
  }
  return imperative;
}

const imperativeCalls = [
  {
    label: 'createAudioPlayer',
    run: async () => {
      imperative = createAudioPlayer(form.source, toPlayerOptions(form));
      return imperative.id;
    },
  },
  { label: 'play (imperative)', run: async () => live().play() },
  { label: 'pause (imperative)', run: async () => live().pause() },
  {
    label: 'remove',
    run: async () => {
      live().remove();
      imperative = null;
      return 'removed';
    },
  },
];
</script>

<template>
  <Card testID="audio-player-form-card" title="Player inputs">
    <Field
      testID="audio-player-source-input"
      label="source uri (replace)"
      :value="form.source"
      :onChange="source => (form.source = source)"
    />
    <Field
      testID="audio-player-interval-input"
      label="updateInterval ms"
      :value="form.updateInterval"
      :onChange="updateInterval => (form.updateInterval = updateInterval)"
    />
    <ToggleRow
      testID="audio-player-download-switch"
      label="downloadFirst"
      :value="form.isDownloadFirst"
      :onChange="isDownloadFirst => (form.isDownloadFirst = isDownloadFirst)"
      :color="color"
    />
    <ToggleRow
      testID="audio-player-keep-switch"
      label="keepAudioSessionActive (iOS)"
      :value="form.isKeepSession"
      :onChange="isKeepSession => (form.isKeepSession = isKeepSession)"
      :color="color"
    />
    <Field
      testID="audio-player-buffer-input"
      label="preferredForwardBufferDuration s"
      :value="form.forwardBuffer"
      :onChange="forwardBuffer => (form.forwardBuffer = forwardBuffer)"
    />
    <Field
      testID="audio-player-seconds-input"
      label="seekTo seconds"
      :value="form.seconds"
      :onChange="seconds => (form.seconds = seconds)"
    />
    <Field
      testID="audio-player-rate-input"
      label="setPlaybackRate"
      :value="form.rate"
      :onChange="rate => (form.rate = rate)"
    />
    <ChoiceRow
      testID="audio-player-quality"
      label="pitchCorrectionQuality (iOS)"
      :options="QUALITIES"
      :value="form.quality"
      :onChange="quality => (form.quality = quality)"
      :color="color"
    />
    <Field
      testID="audio-player-title-input"
      label="lock screen title"
      :value="form.title"
      :onChange="title => (form.title = title)"
    />
    <Field
      testID="audio-player-artist-input"
      label="lock screen artist"
      :value="form.artist"
      :onChange="artist => (form.artist = artist)"
    />
    <ToggleRow
      testID="audio-player-seek-buttons-switch"
      label="showSeekForward and showSeekBackward"
      :value="form.isSeekButtons"
      :onChange="isSeekButtons => (form.isSeekButtons = isSeekButtons)"
      :color="color"
    />
    <ToggleRow
      testID="audio-player-live-switch"
      label="isLiveStream"
      :value="form.isLiveStream"
      :onChange="isLiveStream => (form.isLiveStream = isLiveStream)"
      :color="color"
    />
  </Card>
  <CallConsole
    prefix="audio-player"
    title="useAudioPlayer controls"
    :color="color"
    hint="Changing an option recreates the player."
    :calls="playerControls(player, form)"
  />
  <CallConsole
    prefix="audio-lock"
    title="Lock screen"
    :color="color"
    :calls="lockScreenCalls(player, form)"
  />
  <AudioPlayerStatusCard :key="player.id" :player="player" />
  <AudioSampleCard :key="player.id" :player="player" :color="color" />
  <CallConsole
    prefix="audio-imperative"
    title="createAudioPlayer (manual lifetime)"
    :color="color"
    :calls="imperativeCalls"
  />
</template>
