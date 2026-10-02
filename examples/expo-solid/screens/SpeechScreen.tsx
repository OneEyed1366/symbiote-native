import { For, Show, createSignal } from 'solid-js';
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
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Speech;
const MAX_LOGGED_EVENTS = 12;
const MAX_LISTED_VOICES = 8;

type IOptions = {
  text: string;
  language: string;
  pitch: string;
  rate: string;
  volume: string;
  voice: string;
  useApplicationAudioSession: boolean;
  isBoundaryListened: boolean;
};
type ISetOptions = (patch: Partial<IOptions>) => void;
type IPushLog = (line: string) => void;

function parseOptional(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function qualityLabel(voice: IVoice): string {
  return voice.quality === VoiceQuality.Enhanced ? 'enhanced' : 'default';
}

function OptionsCard(props: { options: IOptions; setOptions: ISetOptions }) {
  const color = lineColorOf(ROUTE);
  return (
    <Card testID="speech-options-card" title="Options">
      <Field
        testID="speech-text-input"
        label="text"
        value={props.options.text}
        onChange={text => props.setOptions({ text })}
      />
      <Field
        testID="speech-language-input"
        label="language (BCP-47)"
        value={props.options.language}
        onChange={language => props.setOptions({ language })}
        placeholder="en-US"
      />
      <Field
        testID="speech-pitch-input"
        label="pitch (0.5 - 2.0)"
        value={props.options.pitch}
        onChange={pitch => props.setOptions({ pitch })}
        placeholder="1.0"
      />
      <Field
        testID="speech-rate-input"
        label="rate (0.1 - 2.0)"
        value={props.options.rate}
        onChange={rate => props.setOptions({ rate })}
        placeholder="1.0"
      />
      <Field
        testID="speech-volume-input"
        label="volume (0 - 1, iOS)"
        value={props.options.volume}
        onChange={volume => props.setOptions({ volume })}
        placeholder="1.0"
      />
      <Field
        testID="speech-voice-input"
        label="voice identifier"
        value={props.options.voice}
        onChange={voice => props.setOptions({ voice })}
      />
      <ToggleRow
        testID="speech-session-switch"
        label="useApplicationAudioSession (iOS)"
        value={props.options.useApplicationAudioSession}
        onChange={useApplicationAudioSession =>
          props.setOptions({ useApplicationAudioSession })
        }
        color={color}
      />
      <ToggleRow
        testID="speech-boundary-switch"
        label="onBoundary events (iOS)"
        value={props.options.isBoundaryListened}
        onChange={isBoundaryListened => props.setOptions({ isBoundaryListened })}
        color={color}
      />
    </Card>
  );
}

function VoicesCard(props: { setOptions: ISetOptions }) {
  const [voices, setVoices] = createSignal<IVoice[] | null>(null);
  const [error, setError] = createSignal('');

  const handleLoad = () => {
    getAvailableVoicesAsync()
      .then(list => {
        setVoices(list);
        setError('');
      })
      .catch((failure: Error) => setError(failure.message));
  };

  return (
    <Card testID="speech-voices-card" title="Voices">
      <ActionButton
        testID="speech-voices-button"
        title="getAvailableVoicesAsync"
        onPress={handleLoad}
        color={lineColorOf(ROUTE)}
      />
      <ResultRow
        testID="speech-voices-count"
        label="Installed voices"
        value={voices() === null ? 'not loaded' : String(voices()?.length)}
      />
      <Show when={error() !== ''}>
        <ResultRow testID="speech-voices-error" label="Error" value={error()} />
      </Show>
      <For each={voices()?.slice(0, MAX_LISTED_VOICES)}>
        {voice => (
          <ActionButton
            testID={`speech-voice-${voice.identifier}`}
            title={`${voice.name} · ${voice.language} · ${qualityLabel(voice)}`}
            onPress={() =>
              props.setOptions({ voice: voice.identifier, language: voice.language })
            }
            color={lineColorOf(ROUTE)}
          />
        )}
      </For>
      <text class="info-text">
        Tap a voice to fill the voice identifier and language above.
      </text>
    </Card>
  );
}

function buildSpeakOptions(options: IOptions, pushLog: IPushLog) {
  return {
    language: options.language.trim() || undefined,
    pitch: parseOptional(options.pitch),
    rate: parseOptional(options.rate),
    volume: parseOptional(options.volume),
    voice: options.voice.trim() || undefined,
    useApplicationAudioSession: options.useApplicationAudioSession,
    onStart: () => pushLog('onStart'),
    onStopped: () => pushLog('onStopped'),
    onDone: () => pushLog('onDone'),
    onError: (error: Error) => pushLog(`onError: ${error.message}`),
    onBoundary: options.isBoundaryListened
      ? (event: { charIndex: number; charLength: number }) =>
          pushLog(`onBoundary @${event.charIndex}+${event.charLength}`)
      : null,
  };
}

function ControlsCard(props: { options: IOptions; pushLog: IPushLog }) {
  const color = lineColorOf(ROUTE);
  const [speaking, setSpeaking] = createSignal('unknown');
  const report = (label: string) => (promise: Promise<void>) =>
    promise.catch((error: Error) => props.pushLog(`${label} failed: ${error.message}`));

  return (
    <Scenario
      testID="speech-controls-card"
      title="Read a message aloud"
      why="Give an app a voice for accessibility, language learning or hands-free prompts. The phone's own speech engine does the work, with no network and no audio files."
      steps={['Press speak', 'Try pause and resume (iOS), then stop mid-sentence']}
      expect="The sentence is spoken. The callback log below shows start, done or stopped, and isSpeaking tells whether it is still talking."
    >
      <ActionButton
        testID="speech-speak-button"
        title="speak"
        onPress={() => speak(props.options.text, buildSpeakOptions(props.options, props.pushLog))}
        color={color}
      />
      <ActionButton
        testID="speech-stop-button"
        title="stop"
        onPress={() => report('stop')(stop())}
        color={color}
      />
      <ActionButton
        testID="speech-pause-button"
        title="pause (iOS)"
        onPress={() => report('pause')(pause())}
        color={color}
      />
      <ActionButton
        testID="speech-resume-button"
        title="resume (iOS)"
        onPress={() => report('resume')(resume())}
        color={color}
      />
      <ActionButton
        testID="speech-is-speaking-button"
        title="isSpeakingAsync"
        onPress={() =>
          isSpeakingAsync().then(value => setSpeaking(String(value)))
        }
        color={color}
      />
      <ResultRow testID="speech-is-speaking" label="isSpeaking" value={speaking()} />
      <ResultRow
        testID="speech-max-length"
        label="maxSpeechInputLength"
        value={String(maxSpeechInputLength)}
      />
    </Scenario>
  );
}

function LogCard(props: { lines: string[] }) {
  return (
    <Card testID="speech-log-card" title="Callback log">
      <text testID="speech-log" class="info-text">
        {props.lines.length === 0 ? 'no events yet' : props.lines.join('\n')}
      </text>
    </Card>
  );
}

export function SpeechScreen() {
  const [options, setOptionsState] = createSignal<IOptions>({
    text: 'Hello from the Symbiote canary',
    language: '',
    pitch: '',
    rate: '',
    volume: '',
    voice: '',
    useApplicationAudioSession: true,
    isBoundaryListened: false,
  });
  const [lines, setLines] = createSignal<string[]>([]);
  const setOptions: ISetOptions = patch =>
    setOptionsState(previous => ({ ...previous, ...patch }));
  const pushLog: IPushLog = line =>
    setLines(previous => [line, ...previous].slice(0, MAX_LOGGED_EVENTS));

  return (
    <ScreenShell
      route={ROUTE}
      testID="speech-scroll"
      title="Speech"
      body="Make the app speak with the phone's built-in voices: pick a language and voice, change pitch and speed, and follow start and finish callbacks. Works offline."
    >
      <ControlsCard options={options()} pushLog={pushLog} />
      <LogCard lines={lines()} />
      <Explorer testID="speech-explorer" color={lineColorOf(ROUTE)}>
        <OptionsCard options={options()} setOptions={setOptions} />
        <VoicesCard setOptions={setOptions} />
      </Explorer>
    </ScreenShell>
  );
}
