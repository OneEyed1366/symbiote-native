import { Component, computed, signal } from '@angular/core';
import { Blob } from '@symbiote-native/blob';
import type { IBlobPart } from '@symbiote-native/blob';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ENDINGS = [
  { label: 'transparent', value: 'transparent' },
  { label: 'native', value: 'native' },
] as const;
type IEndings = (typeof ENDINGS)[number]['value'];
const MAX_PREVIEW_BYTES = 32;
const NO_BLOB_TEXT = 'no blob yet';

function optionalIndex(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
}

async function readStream(source: Blob): Promise<string> {
  if (!('ReadableStream' in globalThis)) {
    throw new Error('no ReadableStream polyfill, Hermes ships none');
  }
  const reader = source.stream().getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return `${total} bytes streamed`;
    }
    total += value.byteLength;
  }
}

@Component({
  selector: 'BlobScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    ChoiceRow,
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
      testID="blob-scroll"
      title="Blob"
      body="Handle binary data the web way: assemble a Blob from text, bytes and other blobs, then read or slice it without copying everything through JavaScript."
    >
      <Scenario
        testID="blob-create-card"
        title="Assemble a file body from pieces"
        why="Build an upload body or a generated file from text and binary parts. The data stays in native memory, so large payloads do not clog the JS thread."
        [steps]="createSteps"
        expect="The size in bytes and the type appear. The size matches the text you entered, and line endings follow the option in the explorer."
      >
        <ActionButton
          testID="blob-create-button"
          title="new Blob(parts, options)"
          [color]="color"
          (press)="create()"
        />
        <ResultRow testID="blob-size" label="size" [value]="sizeText()" />
        <ResultRow testID="blob-type" label="type" [value]="typeText()" />
        @if (error() !== '') {
          <ResultRow testID="blob-error" label="Error" [value]="error()" />
        }
      </Scenario>

      @if (blob()) {
        <Scenario
          testID="blob-read-card"
          title="Read the content back, whole or in part"
          why="Slice a chunk, such as the first bytes for a file-type check or one range of a big download, and read it as text, bytes or a stream."
          [steps]="readSteps"
          expect="Output shows the sliced text or bytes. A negative start counts from the end, and an empty range gives an empty result."
        >
          <Field
            testID="blob-slice-start-input"
            label="slice start (negative counts from the end)"
            [(value)]="start"
          />
          <Field
            testID="blob-slice-end-input"
            label="slice end"
            [(value)]="end"
          />
          <Field
            testID="blob-slice-type-input"
            label="slice contentType"
            [(value)]="sliceType"
          />
          <view class="button-row">
            <ActionButton
              testID="blob-slice-info-button"
              title="slice()"
              [color]="color"
              (press)="showSlice()"
            />
            <ActionButton
              testID="blob-text-button"
              title="text()"
              [color]="color"
              (press)="show('text', readText)"
            />
            <ActionButton
              testID="blob-bytes-button"
              title="bytes()"
              [color]="color"
              (press)="show('bytes', readBytes)"
            />
            <ActionButton
              testID="blob-array-buffer-button"
              title="arrayBuffer()"
              [color]="color"
              (press)="show('arrayBuffer', readArrayBuffer)"
            />
            <ActionButton
              testID="blob-stream-button"
              title="stream()"
              [color]="color"
              (press)="show('stream', readStreamed)"
            />
          </view>
          <ResultRow testID="blob-output" label="Output" [value]="output()" />
        </Scenario>
      }

      <Explorer testID="blob-explorer" [color]="color">
        <ng-template>
          <Card testID="blob-parts-card" title="Constructor">
            <Field
              testID="blob-text-input"
              label="string part (try a line break)"
              [(value)]="text"
              multiline
            />
            <ToggleRow
              testID="blob-bytes-switch"
              label="ArrayBufferView part (Uint8Array 1..4)"
              [(value)]="hasBytes"
              [color]="color"
            />
            <ToggleRow
              testID="blob-buffer-switch"
              label="ArrayBuffer part (4 zero bytes)"
              [(value)]="hasBuffer"
              [color]="color"
            />
            <ToggleRow
              testID="blob-nested-switch"
              label="Blob part (nested)"
              [(value)]="hasNestedBlob"
              [color]="color"
            />
            <Field
              testID="blob-type-input"
              label="type (MIME)"
              [(value)]="type"
              placeholder="text/plain"
            />
            <ChoiceRow
              testID="blob-endings"
              label="endings"
              [options]="endingsOptions"
              [(value)]="endings"
              [color]="color"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class BlobScreen {
  readonly route = ROUTE_NAME.Blob;
  readonly color = lineColorOf(ROUTE_NAME.Blob);
  readonly endingsOptions = ENDINGS;
  readonly createSteps = [
    'Press new Blob(parts, options) (the sample text is already set)',
    'Read and slice the result in the next card',
  ];
  readonly readSteps = ['Set a slice start and end', 'Press a read button'];

  readonly text = signal('Hello\nBlob');
  readonly hasBytes = signal(false);
  readonly hasBuffer = signal(false);
  readonly hasNestedBlob = signal(false);
  readonly type = signal('text/plain');
  readonly endings = signal<IEndings>('transparent');
  readonly blob = signal<Blob | null>(null);
  readonly error = signal('');
  readonly start = signal('');
  readonly end = signal('');
  readonly sliceType = signal('');
  readonly output = signal('nothing read yet');

  readonly sizeText = computed(() => {
    const blob = this.blob();
    return blob === null ? NO_BLOB_TEXT : `${blob.size} bytes`;
  });
  readonly typeText = computed(() => {
    const blob = this.blob();
    return blob === null ? NO_BLOB_TEXT : `"${blob.type}"`;
  });

  readonly readText = () => this.target().text();
  readonly readBytes = () =>
    this.target()
      .bytes()
      .then(bytes => Array.from(bytes.slice(0, MAX_PREVIEW_BYTES)).join(','));
  readonly readArrayBuffer = () =>
    this.target()
      .arrayBuffer()
      .then(buffer => `${buffer.byteLength} bytes`);
  readonly readStreamed = () => readStream(this.target());

  private buildParts(): IBlobPart[] {
    const built: IBlobPart[] = [this.text()];
    if (this.hasBytes()) {
      built.push(new Uint8Array([1, 2, 3, 4]));
    }
    if (this.hasBuffer()) {
      built.push(new ArrayBuffer(4));
    }
    if (this.hasNestedBlob()) {
      built.push(new Blob(['nested']));
    }
    return built;
  }

  create(): void {
    try {
      this.blob.set(
        new Blob(this.buildParts(), {
          type: this.type(),
          endings: this.endings(),
        }),
      );
      this.error.set('');
    } catch (failure) {
      this.error.set(
        failure instanceof Error ? failure.message : String(failure),
      );
    }
  }

  private target(): Blob {
    const blob = this.blob();
    if (blob === null) {
      throw new Error('create a blob first');
    }
    return blob.slice(
      optionalIndex(this.start()),
      optionalIndex(this.end()),
      this.sliceType(),
    );
  }

  show(label: string, read: () => Promise<string>): void {
    this.output.set(`${label}…`);
    Promise.resolve()
      .then(read)
      .then(value => this.output.set(`${label}: ${value}`))
      .catch((failure: Error) =>
        this.output.set(`${label} failed: ${failure.message}`),
      );
  }

  showSlice(): void {
    const sliced = this.target();
    this.output.set(`slice: size ${sliced.size}, type "${sliced.type}"`);
  }
}
