import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
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
import { Card } from '../components/Card';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const MAX_LOGGED_EVENTS = 12;
const MAX_LISTED_VOICES = 8;

function parseOptional(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
}

@Component({
  selector: 'SpeechScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="speech-scroll"
      title="Speech"
      body="Make the app speak with the phone's built-in voices: pick a language and voice, change pitch and speed, and follow start and finish callbacks. Works offline."
    >
      <Scenario
        testID="speech-controls-card"
        title="Read a message aloud"
        why="Give an app a voice for accessibility, language learning or hands-free prompts. The phone's own speech engine does the work, with no network and no audio files."
        [steps]="controlSteps"
        expect="The sentence is spoken. The callback log below shows start, done or stopped, and isSpeaking tells whether it is still talking."
      >
        <ActionButton
          testID="speech-speak-button"
          title="speak"
          [color]="color"
          (press)="speakText()"
        />
        <ActionButton
          testID="speech-stop-button"
          title="stop"
          [color]="color"
          (press)="report('stop', stopSpeech())"
        />
        <ActionButton
          testID="speech-pause-button"
          title="pause (iOS)"
          [color]="color"
          (press)="report('pause', pauseSpeech())"
        />
        <ActionButton
          testID="speech-resume-button"
          title="resume (iOS)"
          [color]="color"
          (press)="report('resume', resumeSpeech())"
        />
        <ActionButton
          testID="speech-is-speaking-button"
          title="isSpeakingAsync"
          [color]="color"
          (press)="checkSpeaking()"
        />
        <ResultRow
          testID="speech-is-speaking"
          label="isSpeaking"
          [value]="speaking()"
        />
        <ResultRow
          testID="speech-max-length"
          label="maxSpeechInputLength"
          [value]="maxLength"
        />
      </Scenario>

      <Card testID="speech-log-card" title="Callback log">
        <text testID="speech-log" class="info-text">{{ logText() }}</text>
      </Card>

      <Explorer testID="speech-explorer" [color]="color">
        <ng-template>
          <Card testID="speech-options-card" title="Options">
            <Field testID="speech-text-input" label="text" [(value)]="text" />
            <Field
              testID="speech-language-input"
              label="language (BCP-47)"
              [(value)]="language"
              placeholder="en-US"
            />
            <Field
              testID="speech-pitch-input"
              label="pitch (0.5 - 2.0)"
              [(value)]="pitch"
              placeholder="1.0"
            />
            <Field
              testID="speech-rate-input"
              label="rate (0.1 - 2.0)"
              [(value)]="rate"
              placeholder="1.0"
            />
            <Field
              testID="speech-volume-input"
              label="volume (0 - 1, iOS)"
              [(value)]="volume"
              placeholder="1.0"
            />
            <Field
              testID="speech-voice-input"
              label="voice identifier"
              [(value)]="voice"
            />
            <ToggleRow
              testID="speech-session-switch"
              label="useApplicationAudioSession (iOS)"
              [(value)]="useApplicationAudioSession"
              [color]="color"
            />
            <ToggleRow
              testID="speech-boundary-switch"
              label="onBoundary events (iOS)"
              [(value)]="isBoundaryListened"
              [color]="color"
            />
          </Card>

          <Card testID="speech-voices-card" title="Voices">
            <ActionButton
              testID="speech-voices-button"
              title="getAvailableVoicesAsync"
              [color]="color"
              (press)="loadVoices()"
            />
            <ResultRow
              testID="speech-voices-count"
              label="Installed voices"
              [value]="voicesCount()"
            />
            @if (voicesError() !== '') {
              <ResultRow
                testID="speech-voices-error"
                label="Error"
                [value]="voicesError()"
              />
            }
            @for (item of listedVoices(); track item.identifier) {
              <ActionButton
                [testID]="'speech-voice-' + item.identifier"
                [title]="
                  item.name + ' · ' + item.language + ' · ' + qualityLabel(item)
                "
                [color]="color"
                (press)="pickVoice(item)"
              />
            }
            <text class="info-text"
              >Tap a voice to fill the voice identifier and language
              above.</text
            >
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class SpeechScreen {
  readonly route = ROUTE_NAME.Speech;
  readonly color = lineColorOf(ROUTE_NAME.Speech);
  readonly controlSteps = [
    'Press speak',
    'Try pause and resume (iOS), then stop mid-sentence',
  ];
  readonly maxLength = String(maxSpeechInputLength);
  readonly stopSpeech = stop;
  readonly pauseSpeech = pause;
  readonly resumeSpeech = resume;

  readonly text = signal('Hello from the Symbiote canary');
  readonly language = signal('');
  readonly pitch = signal('');
  readonly rate = signal('');
  readonly volume = signal('');
  readonly voice = signal('');
  readonly useApplicationAudioSession = signal(true);
  readonly isBoundaryListened = signal(false);
  private readonly lines = signal<string[]>([]);
  readonly speaking = signal('unknown');
  private readonly voices = signal<IVoice[] | null>(null);
  readonly voicesError = signal('');

  readonly logText = computed(() => {
    const lines = this.lines();
    return lines.length === 0 ? 'no events yet' : lines.join('\n');
  });
  readonly voicesCount = computed(() => {
    const voices = this.voices();
    return voices === null ? 'not loaded' : String(voices.length);
  });
  readonly listedVoices = computed(
    () => this.voices()?.slice(0, MAX_LISTED_VOICES) ?? [],
  );

  private pushLog(line: string): void {
    this.lines.update(lines => [line, ...lines].slice(0, MAX_LOGGED_EVENTS));
  }

  qualityLabel(item: IVoice): string {
    return item.quality === VoiceQuality.Enhanced ? 'enhanced' : 'default';
  }

  pickVoice(item: IVoice): void {
    this.voice.set(item.identifier);
    this.language.set(item.language);
  }

  loadVoices(): void {
    getAvailableVoicesAsync()
      .then(list => {
        this.voices.set(list);
        this.voicesError.set('');
      })
      .catch((failure: Error) => this.voicesError.set(failure.message));
  }

  speakText(): void {
    speak(this.text(), {
      language: this.language().trim() || undefined,
      pitch: parseOptional(this.pitch()),
      rate: parseOptional(this.rate()),
      volume: parseOptional(this.volume()),
      voice: this.voice().trim() || undefined,
      useApplicationAudioSession: this.useApplicationAudioSession(),
      onStart: () => this.pushLog('onStart'),
      onStopped: () => this.pushLog('onStopped'),
      onDone: () => this.pushLog('onDone'),
      onError: (error: Error) => this.pushLog(`onError: ${error.message}`),
      onBoundary: this.isBoundaryListened()
        ? (event: { charIndex: number; charLength: number }) =>
            this.pushLog(`onBoundary @${event.charIndex}+${event.charLength}`)
        : null,
    });
  }

  report(label: string, promise: Promise<void>): void {
    promise.catch((error: Error) =>
      this.pushLog(`${label} failed: ${error.message}`),
    );
  }

  checkSpeaking(): void {
    void isSpeakingAsync().then(value => this.speaking.set(String(value)));
  }
}
