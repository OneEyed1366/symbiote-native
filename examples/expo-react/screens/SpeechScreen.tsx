import { useCallback, useState } from 'react';
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

function OptionsCard({
  options,
  setOptions,
}: {
  options: IOptions;
  setOptions: ISetOptions;
}) {
  const color = lineColorOf(ROUTE);
  return (
    <Card testID="speech-options-card" title="Options">
      <Field
        testID="speech-text-input"
        label="text"
        value={options.text}
        onChange={text => setOptions({ text })}
      />
      <Field
        testID="speech-language-input"
        label="language (BCP-47)"
        value={options.language}
        onChange={language => setOptions({ language })}
        placeholder="en-US"
      />
      <Field
        testID="speech-pitch-input"
        label="pitch (0.5 - 2.0)"
        value={options.pitch}
        onChange={pitch => setOptions({ pitch })}
        placeholder="1.0"
      />
      <Field
        testID="speech-rate-input"
        label="rate (0.1 - 2.0)"
        value={options.rate}
        onChange={rate => setOptions({ rate })}
        placeholder="1.0"
      />
      <Field
        testID="speech-volume-input"
        label="volume (0 - 1, iOS)"
        value={options.volume}
        onChange={volume => setOptions({ volume })}
        placeholder="1.0"
      />
      <Field
        testID="speech-voice-input"
        label="voice identifier"
        value={options.voice}
        onChange={voice => setOptions({ voice })}
      />
      <ToggleRow
        testID="speech-session-switch"
        label="useApplicationAudioSession (iOS)"
        value={options.useApplicationAudioSession}
        onChange={useApplicationAudioSession =>
          setOptions({ useApplicationAudioSession })
        }
        color={color}
      />
      <ToggleRow
        testID="speech-boundary-switch"
        label="onBoundary events (iOS)"
        value={options.isBoundaryListened}
        onChange={isBoundaryListened => setOptions({ isBoundaryListened })}
        color={color}
      />
    </Card>
  );
}

function VoicesCard({ setOptions }: { setOptions: ISetOptions }) {
  const [voices, setVoices] = useState<IVoice[] | null>(null);
  const [error, setError] = useState('');

  const handleLoad = useCallback(() => {
    getAvailableVoicesAsync()
      .then(list => {
        setVoices(list);
        setError('');
      })
      .catch((failure: Error) => setError(failure.message));
  }, []);

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
        value={voices === null ? 'not loaded' : String(voices.length)}
      />
      {error !== '' && (
        <ResultRow testID="speech-voices-error" label="Error" value={error} />
      )}
      {voices?.slice(0, MAX_LISTED_VOICES).map(voice => (
        <ActionButton
          key={voice.identifier}
          testID={`speech-voice-${voice.identifier}`}
          title={`${voice.name} · ${voice.language} · ${qualityLabel(voice)}`}
          onPress={() =>
            setOptions({ voice: voice.identifier, language: voice.language })
          }
          color={lineColorOf(ROUTE)}
        />
      ))}
      <text className="info-text">
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

function ControlsCard({
  options,
  pushLog,
}: {
  options: IOptions;
  pushLog: IPushLog;
}) {
  const color = lineColorOf(ROUTE);
  const [speaking, setSpeaking] = useState('unknown');
  const report = (label: string) => (promise: Promise<void>) =>
    promise.catch((error: Error) => pushLog(`${label} failed: ${error.message}`));

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
        onPress={() => speak(options.text, buildSpeakOptions(options, pushLog))}
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
      <ResultRow testID="speech-is-speaking" label="isSpeaking" value={speaking} />
      <ResultRow
        testID="speech-max-length"
        label="maxSpeechInputLength"
        value={String(maxSpeechInputLength)}
      />
    </Scenario>
  );
}

function LogCard({ lines }: { lines: string[] }) {
  return (
    <Card testID="speech-log-card" title="Callback log">
      <text testID="speech-log" className="info-text">
        {lines.length === 0 ? 'no events yet' : lines.join('\n')}
      </text>
    </Card>
  );
}

export function SpeechScreen() {
  const [options, setOptionsState] = useState<IOptions>({
    text: 'Hello from the Symbiote canary',
    language: '',
    pitch: '',
    rate: '',
    volume: '',
    voice: '',
    useApplicationAudioSession: true,
    isBoundaryListened: false,
  });
  const [lines, setLines] = useState<string[]>([]);
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
      <ControlsCard options={options} pushLog={pushLog} />
      <LogCard lines={lines} />
      <Explorer testID="speech-explorer" color={lineColorOf(ROUTE)}>
        <OptionsCard options={options} setOptions={setOptions} />
        <VoicesCard setOptions={setOptions} />
      </Explorer>
    </ScreenShell>
  );
}
