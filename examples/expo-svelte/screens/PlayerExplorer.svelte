<script lang="ts">
  import { VideoView, useVideoPlayer } from '@symbiote-native/video/svelte';
  import type { IVideoAudioMixingMode, IVideoContentFit } from '@symbiote-native/video/svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { FIT_OPTIONS, METADATA_SOURCE, MIXING_OPTIONS } from './video-shared';

  const { color }: { color: string } = $props();

  const player = useVideoPlayer(() => METADATA_SOURCE);
  let isNowPlaying = $state(false);
  let mixing = $state<IVideoAudioMixingMode>('auto');
  let fit = $state<IVideoContentFit>('contain');
  let isTimecodes = $state(true);
  let isLinear = $state(false);
  let isPitchKept = $state(true);
  let isScreenOn = $state(true);
  let isBackground = $state(false);
</script>

<Explorer testID="video-explorer" {color}>
  <Card testID="video-playground" title="Every option">
    <VideoView
      testID="video-playground-view"
      player={player.current}
      nativeControls
      contentFit={fit}
      showsTimecodes={isTimecodes}
      requiresLinearPlayback={isLinear}
      class="vid-video"
    />
    <ChoiceRow testID="video-fit" label="contentFit" {color} value={fit} options={FIT_OPTIONS} onChange={value => (fit = value)} />
    <ToggleRow testID="video-timecodes" label="showsTimecodes (iOS)" value={isTimecodes} onChange={value => (isTimecodes = value)} {color} />
    <ToggleRow testID="video-linear" label="requiresLinearPlayback: no skipping" value={isLinear} onChange={value => (isLinear = value)} {color} />
    <ToggleRow
      testID="video-pitch"
      label="preservesPitch (try 2x speed)"
      value={isPitchKept}
      onChange={value => {
        player.current.preservesPitch = value;
        isPitchKept = value;
      }}
      {color}
    />
    <ToggleRow
      testID="video-keep-awake"
      label="keepScreenOnWhilePlaying"
      value={isScreenOn}
      onChange={value => {
        player.current.keepScreenOnWhilePlaying = value;
        isScreenOn = value;
      }}
      {color}
    />
    <ToggleRow
      testID="video-background"
      label="staysActiveInBackground (needs the audio background mode)"
      value={isBackground}
      onChange={value => {
        player.current.staysActiveInBackground = value;
        isBackground = value;
      }}
      {color}
    />
    <ToggleRow
      testID="video-now-playing"
      label="showNowPlayingNotification (lock screen card with the metadata)"
      value={isNowPlaying}
      onChange={value => {
        player.current.showNowPlayingNotification = value;
        isNowPlaying = value;
      }}
      {color}
    />
    <ChoiceRow
      testID="video-mixing"
      label="audioMixingMode: how it shares audio with other apps"
      {color}
      value={mixing}
      options={MIXING_OPTIONS}
      onChange={value => {
        player.current.audioMixingMode = value;
        mixing = value;
      }}
    />
  </Card>
</Explorer>
