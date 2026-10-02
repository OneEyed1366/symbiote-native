<script lang="ts">
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
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const ROUTE = ROUTE_NAME.Speech;
  const color = lineColorOf(ROUTE);
  const MAX_LOGGED_EVENTS = 12;
  const MAX_LISTED_VOICES = 8;

  let text = $state('Hello from the Symbiote canary');
  let language = $state('');
  let pitch = $state('');
  let rate = $state('');
  let volume = $state('');
  let voice = $state('');
  let useApplicationAudioSession = $state(true);
  let isBoundaryListened = $state(false);
  let lines = $state<string[]>([]);
  let speaking = $state('unknown');
  let voices = $state<IVoice[] | null>(null);
  let voicesError = $state('');

  function pushLog(line: string): void {
    lines = [line, ...lines].slice(0, MAX_LOGGED_EVENTS);
  }

  function parseOptional(value: string): number | undefined {
    const parsed = Number(value);
    return value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
  }

  function qualityLabel(item: IVoice): string {
    return item.quality === VoiceQuality.Enhanced ? 'enhanced' : 'default';
  }

  function handleLoadVoices(): void {
    getAvailableVoicesAsync()
      .then(list => {
        voices = list;
        voicesError = '';
      })
      .catch((failure: Error) => {
        voicesError = failure.message;
      });
  }

  function handleSpeak(): void {
    speak(text, {
      language: language.trim() || undefined,
      pitch: parseOptional(pitch),
      rate: parseOptional(rate),
      volume: parseOptional(volume),
      voice: voice.trim() || undefined,
      useApplicationAudioSession,
      onStart: () => pushLog('onStart'),
      onStopped: () => pushLog('onStopped'),
      onDone: () => pushLog('onDone'),
      onError: (error: Error) => pushLog(`onError: ${error.message}`),
      onBoundary: isBoundaryListened
        ? (event: { charIndex: number; charLength: number }) =>
            pushLog(`onBoundary @${event.charIndex}+${event.charLength}`)
        : null,
    });
  }

  function report(label: string, promise: Promise<void>): void {
    promise.catch((error: Error) => pushLog(`${label} failed: ${error.message}`));
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="speech-scroll"
  title="Speech"
  body="Make the app speak with the phone's built-in voices: pick a language and voice, change pitch and speed, and follow start and finish callbacks. Works offline."
>
  <Scenario
    testID="speech-controls-card"
    title="Read a message aloud"
    why="Give an app a voice for accessibility, language learning or hands-free prompts. The phone's own speech engine does the work, with no network and no audio files."
    steps={[
      'Press speak',
      'Try pause and resume (iOS), then stop mid-sentence',
    ]}
    expect="The sentence is spoken. The callback log below shows start, done or stopped, and isSpeaking tells whether it is still talking."
  >
    <ActionButton testID="speech-speak-button" title="speak" onPress={handleSpeak} {color} />
    <ActionButton
      testID="speech-stop-button"
      title="stop"
      onPress={() => report('stop', stop())}
      {color}
    />
    <ActionButton
      testID="speech-pause-button"
      title="pause (iOS)"
      onPress={() => report('pause', pause())}
      {color}
    />
    <ActionButton
      testID="speech-resume-button"
      title="resume (iOS)"
      onPress={() => report('resume', resume())}
      {color}
    />
    <ActionButton
      testID="speech-is-speaking-button"
      title="isSpeakingAsync"
      onPress={() =>
        isSpeakingAsync().then(value => {
          speaking = String(value);
        })}
      {color}
    />
    <ResultRow testID="speech-is-speaking" label="isSpeaking" value={speaking} />
    <ResultRow
      testID="speech-max-length"
      label="maxSpeechInputLength"
      value={String(maxSpeechInputLength)}
    />
  </Scenario>

  <Card testID="speech-log-card" title="Callback log">
    <text testID="speech-log" class="info-text">
      {lines.length === 0 ? 'no events yet' : lines.join('\n')}
    </text>
  </Card>

  <Explorer testID="speech-explorer" {color}>
    <Card testID="speech-options-card" title="Options">
      <Field
        testID="speech-text-input"
        label="text"
        value={text}
        onChange={next => {
          text = next;
        }}
      />
      <Field
        testID="speech-language-input"
        label="language (BCP-47)"
        value={language}
        onChange={next => {
          language = next;
        }}
        placeholder="en-US"
      />
      <Field
        testID="speech-pitch-input"
        label="pitch (0.5 - 2.0)"
        value={pitch}
        onChange={next => {
          pitch = next;
        }}
        placeholder="1.0"
      />
      <Field
        testID="speech-rate-input"
        label="rate (0.1 - 2.0)"
        value={rate}
        onChange={next => {
          rate = next;
        }}
        placeholder="1.0"
      />
      <Field
        testID="speech-volume-input"
        label="volume (0 - 1, iOS)"
        value={volume}
        onChange={next => {
          volume = next;
        }}
        placeholder="1.0"
      />
      <Field
        testID="speech-voice-input"
        label="voice identifier"
        value={voice}
        onChange={next => {
          voice = next;
        }}
      />
      <ToggleRow
        testID="speech-session-switch"
        label="useApplicationAudioSession (iOS)"
        value={useApplicationAudioSession}
        onChange={next => {
          useApplicationAudioSession = next;
        }}
        {color}
      />
      <ToggleRow
        testID="speech-boundary-switch"
        label="onBoundary events (iOS)"
        value={isBoundaryListened}
        onChange={next => {
          isBoundaryListened = next;
        }}
        {color}
      />
    </Card>

    <Card testID="speech-voices-card" title="Voices">
      <ActionButton
        testID="speech-voices-button"
        title="getAvailableVoicesAsync"
        onPress={handleLoadVoices}
        {color}
      />
      <ResultRow
        testID="speech-voices-count"
        label="Installed voices"
        value={voices === null ? 'not loaded' : String(voices.length)}
      />
      {#if voicesError !== ''}
        <ResultRow testID="speech-voices-error" label="Error" value={voicesError} />
      {/if}
      {#each voices?.slice(0, MAX_LISTED_VOICES) ?? [] as item (item.identifier)}
        <ActionButton
          testID={`speech-voice-${item.identifier}`}
          title={`${item.name} · ${item.language} · ${qualityLabel(item)}`}
          onPress={() => {
            voice = item.identifier;
            language = item.language;
          }}
          {color}
        />
      {/each}
      <text class="info-text">
        Tap a voice to fill the voice identifier and language above.
      </text>
    </Card>
  </Explorer>
</ScreenShell>
