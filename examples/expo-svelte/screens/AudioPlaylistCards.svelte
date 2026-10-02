<script lang="ts">
  import { createAudioPlaylist, useAudioPlaylist } from '@symbiote-native/audio/svelte';
  import type { AudioPlaylist } from '@symbiote-native/audio/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AudioPlaylistStatusCard from './AudioPlaylistStatusCard.svelte';
  import {
    EXTRA_TRACK,
    INITIAL_PLAYLIST_FORM,
    LOOPS,
    TRACKS,
    playlistControls,
  } from './audio-playlist-calls';
  import type { IPlaylistForm } from './audio-playlist-calls';

  const color = lineColorOf(ROUTE_NAME.Audio);

  let form = $state<IPlaylistForm>({ ...INITIAL_PLAYLIST_FORM });
  let imperative: AudioPlaylist | null = null;

  const playlist = useAudioPlaylist(() => ({
    sources: TRACKS,
    updateInterval: Number(form.interval),
    loop: form.loop,
  }));

  function live(): AudioPlaylist {
    if (imperative === null) {
      throw new Error('createAudioPlaylist first');
    }
    return imperative;
  }
</script>

<Card testID="audio-playlist-form-card" title="Playlist inputs">
  <ChoiceRow
    testID="audio-playlist-loop"
    label="loop"
    options={LOOPS}
    value={form.loop}
    onChange={loop => {
      form.loop = loop;
    }}
    {color}
  />
  <Field
    testID="audio-playlist-interval-input"
    label="updateInterval ms"
    value={form.interval}
    onChange={interval => {
      form.interval = interval;
    }}
  />
  <Field
    testID="audio-playlist-index-input"
    label="index (skipTo, insert, remove)"
    value={form.index}
    onChange={index => {
      form.index = index;
    }}
  />
  <Field
    testID="audio-playlist-seconds-input"
    label="seekTo seconds"
    value={form.seconds}
    onChange={seconds => {
      form.seconds = seconds;
    }}
  />
  <Field
    testID="audio-playlist-source-input"
    label="source uri (add, insert)"
    value={form.source}
    onChange={source => {
      form.source = source;
    }}
  />
</Card>
<CallConsole
  prefix="audio-playlist"
  title="useAudioPlaylist controls"
  {color}
  hint="Changing interval or loop recreates the playlist."
  calls={playlistControls(playlist.current, form)}
/>
{#key playlist.current}
  <AudioPlaylistStatusCard playlist={playlist.current} />
{/key}
<CallConsole
  prefix="audio-playlist-imperative"
  title="createAudioPlaylist (manual lifetime)"
  {color}
  calls={[
    {
      label: 'createAudioPlaylist',
      run: async () => {
        imperative = createAudioPlaylist({
          sources: [...TRACKS, EXTRA_TRACK],
          updateInterval: Number(form.interval),
          loop: form.loop,
        });
        return imperative.id;
      },
    },
    { label: 'play (imperative)', run: async () => live().play() },
    {
      label: 'destroy',
      run: async () => {
        live().destroy();
        imperative = null;
        return 'destroyed';
      },
    },
  ]}
/>
