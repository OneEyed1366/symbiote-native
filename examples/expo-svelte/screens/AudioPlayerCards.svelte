<script lang="ts">
  import { createAudioPlayer, useAudioPlayer } from '@symbiote-native/audio/svelte';
  import type { AudioPlayer } from '@symbiote-native/audio/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AudioPlayerStatusCard from './AudioPlayerStatusCard.svelte';
  import AudioSampleCard from './AudioSampleCard.svelte';
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

  let form = $state<IPlayerForm>({ ...INITIAL_PLAYER_FORM });
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
</script>

<Card testID="audio-player-form-card" title="Player inputs">
  <Field
    testID="audio-player-source-input"
    label="source uri (replace)"
    value={form.source}
    onChange={source => {
      form.source = source;
    }}
  />
  <Field
    testID="audio-player-interval-input"
    label="updateInterval ms"
    value={form.updateInterval}
    onChange={updateInterval => {
      form.updateInterval = updateInterval;
    }}
  />
  <ToggleRow
    testID="audio-player-download-switch"
    label="downloadFirst"
    value={form.isDownloadFirst}
    onChange={isDownloadFirst => {
      form.isDownloadFirst = isDownloadFirst;
    }}
    {color}
  />
  <ToggleRow
    testID="audio-player-keep-switch"
    label="keepAudioSessionActive (iOS)"
    value={form.isKeepSession}
    onChange={isKeepSession => {
      form.isKeepSession = isKeepSession;
    }}
    {color}
  />
  <Field
    testID="audio-player-buffer-input"
    label="preferredForwardBufferDuration s"
    value={form.forwardBuffer}
    onChange={forwardBuffer => {
      form.forwardBuffer = forwardBuffer;
    }}
  />
  <Field
    testID="audio-player-seconds-input"
    label="seekTo seconds"
    value={form.seconds}
    onChange={seconds => {
      form.seconds = seconds;
    }}
  />
  <Field
    testID="audio-player-rate-input"
    label="setPlaybackRate"
    value={form.rate}
    onChange={rate => {
      form.rate = rate;
    }}
  />
  <ChoiceRow
    testID="audio-player-quality"
    label="pitchCorrectionQuality (iOS)"
    options={QUALITIES}
    value={form.quality}
    onChange={quality => {
      form.quality = quality;
    }}
    {color}
  />
  <Field
    testID="audio-player-title-input"
    label="lock screen title"
    value={form.title}
    onChange={title => {
      form.title = title;
    }}
  />
  <Field
    testID="audio-player-artist-input"
    label="lock screen artist"
    value={form.artist}
    onChange={artist => {
      form.artist = artist;
    }}
  />
  <ToggleRow
    testID="audio-player-seek-buttons-switch"
    label="showSeekForward and showSeekBackward"
    value={form.isSeekButtons}
    onChange={isSeekButtons => {
      form.isSeekButtons = isSeekButtons;
    }}
    {color}
  />
  <ToggleRow
    testID="audio-player-live-switch"
    label="isLiveStream"
    value={form.isLiveStream}
    onChange={isLiveStream => {
      form.isLiveStream = isLiveStream;
    }}
    {color}
  />
</Card>
<CallConsole
  prefix="audio-player"
  title="useAudioPlayer controls"
  {color}
  hint="Changing an option recreates the player."
  calls={playerControls(player.current, form)}
/>
<CallConsole
  prefix="audio-lock"
  title="Lock screen"
  {color}
  calls={lockScreenCalls(player.current, form)}
/>
{#key player.current}
  <AudioPlayerStatusCard player={player.current} />
  <AudioSampleCard player={player.current} {color} />
{/key}
<CallConsole
  prefix="audio-imperative"
  title="createAudioPlayer (manual lifetime)"
  {color}
  calls={[
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
  ]}
/>
