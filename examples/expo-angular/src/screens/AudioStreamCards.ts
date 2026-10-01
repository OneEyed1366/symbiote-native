import { Component, signal } from '@angular/core';
import {
  createAudioStream,
  injectAudioStream,
} from '@symbiote-native/audio/angular';
import type {
  AudioStream,
  IAudioStreamBuffer,
  IAudioStreamEncoding,
} from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ENCODINGS: readonly { label: string; value: IAudioStreamEncoding }[] = [
  { label: 'float32', value: 'float32' },
  { label: 'int16', value: 'int16' },
];

@Component({
  selector: 'AudioStreamCards',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ResultRow],
  template: `
    <Card testID="audio-stream-form-card" title="Stream inputs">
      <Field
        testID="audio-stream-rate-input"
        label="sampleRate"
        [(value)]="sampleRate"
      />
      <Field
        testID="audio-stream-channels-input"
        label="channels"
        [(value)]="channels"
      />
      <ChoiceRow
        testID="audio-stream-encoding"
        label="encoding"
        [options]="encodings"
        [(value)]="encoding"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="audio-stream"
      title="useAudioStream (needs the microphone permission)"
      [color]="color"
      [calls]="hookCalls"
    />
    <Card testID="audio-stream-status-card" title="Stream state">
      <ResultRow
        testID="audio-stream-streaming"
        label="isStreaming"
        [value]="'' + result().isStreaming"
      />
      <ResultRow
        testID="audio-stream-buffer"
        label="last buffer (onBuffer)"
        [value]="last()"
      />
    </Card>
    <CallConsole
      prefix="audio-stream-imperative"
      title="createAudioStream (manual lifetime)"
      [color]="color"
      [calls]="imperativeCalls"
    />
  `,
})
export class AudioStreamCards {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly encodings = ENCODINGS;

  readonly sampleRate = signal('48000');
  readonly channels = signal('1');
  readonly encoding = signal<IAudioStreamEncoding>('float32');
  readonly last = signal('no buffer yet');
  private imperative: AudioStream | null = null;

  readonly result = injectAudioStream(() => ({
    sampleRate: Number(this.sampleRate()),
    channels: Number(this.channels()),
    encoding: this.encoding(),
    onBuffer: (data: IAudioStreamBuffer) => this.onBuffer(data),
  }));

  private onBuffer(data: IAudioStreamBuffer): void {
    this.last.set(
      `${data.data.byteLength} bytes, ${data.sampleRate} Hz, ${data.channels} ch, t=${data.timestamp.toFixed(2)}`,
    );
  }

  private live(): AudioStream {
    if (this.imperative === null) {
      throw new Error('createAudioStream first');
    }
    return this.imperative;
  }

  readonly hookCalls = [
    { label: 'start', run: () => this.result().stream.start() },
    { label: 'stop', run: async () => this.result().stream.stop() },
    {
      label: 'stream properties',
      run: async () => ({
        id: this.result().stream.id,
        sampleRate: this.result().stream.sampleRate,
        channels: this.result().stream.channels,
        isStreaming: this.result().stream.isStreaming,
      }),
    },
  ];

  readonly imperativeCalls = [
    {
      label: 'createAudioStream',
      run: async () => {
        this.imperative = createAudioStream({
          sampleRate: Number(this.sampleRate()),
          channels: Number(this.channels()),
          encoding: this.encoding(),
        });
        return this.imperative.id;
      },
    },
    { label: 'start (imperative)', run: () => this.live().start() },
    { label: 'stop (imperative)', run: async () => this.live().stop() },
  ];
}
