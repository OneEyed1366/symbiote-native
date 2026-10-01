import { defineComponent, ref, shallowRef } from 'vue';
import { Blob } from '@symbiote-native/blob';
import type { IBlobPart } from '@symbiote-native/blob';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Blob;
const color = lineColorOf(ROUTE);
const ENDINGS = [
  { label: 'transparent', value: 'transparent' },
  { label: 'native', value: 'native' },
] as const;
type IEndings = (typeof ENDINGS)[number]['value'];
const MAX_PREVIEW_BYTES = 32;

type IParts = {
  text: string;
  hasBytes: boolean;
  hasBuffer: boolean;
  hasNestedBlob: boolean;
};
type ISetParts = (patch: Partial<IParts>) => void;

function buildParts(parts: IParts): IBlobPart[] {
  const built: IBlobPart[] = [parts.text];
  if (parts.hasBytes) {
    built.push(new Uint8Array([1, 2, 3, 4]));
  }
  if (parts.hasBuffer) {
    built.push(new ArrayBuffer(4));
  }
  if (parts.hasNestedBlob) {
    built.push(new Blob(['nested']));
  }
  return built;
}

function optionalIndex(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

type IPartsCardProps = {
  parts: IParts;
  setParts: ISetParts;
  type: string;
  setType: (value: string) => void;
  endings: IEndings;
  setEndings: (value: IEndings) => void;
};

function PartsCard(props: IPartsCardProps) {
  return (
    <Card testID="blob-parts-card" title="Constructor">
      <Field
        testID="blob-text-input"
        label="string part (try a line break)"
        value={props.parts.text}
        onChange={text => props.setParts({ text })}
        multiline
      />
      <ToggleRow
        testID="blob-bytes-switch"
        label="ArrayBufferView part (Uint8Array 1..4)"
        value={props.parts.hasBytes}
        onChange={hasBytes => props.setParts({ hasBytes })}
        color={color}
      />
      <ToggleRow
        testID="blob-buffer-switch"
        label="ArrayBuffer part (4 zero bytes)"
        value={props.parts.hasBuffer}
        onChange={hasBuffer => props.setParts({ hasBuffer })}
        color={color}
      />
      <ToggleRow
        testID="blob-nested-switch"
        label="Blob part (nested)"
        value={props.parts.hasNestedBlob}
        onChange={hasNestedBlob => props.setParts({ hasNestedBlob })}
        color={color}
      />
      <Field
        testID="blob-type-input"
        label="type (MIME)"
        value={props.type}
        onChange={props.setType}
        placeholder="text/plain"
      />
      <ChoiceRow
        testID="blob-endings"
        label="endings"
        options={ENDINGS}
        value={props.endings}
        onChange={props.setEndings}
        color={color}
      />
    </Card>
  );
}

async function readStream(blob: Blob): Promise<string> {
  if (!('ReadableStream' in globalThis)) {
    throw new Error('no ReadableStream polyfill, Hermes ships none');
  }
  const reader = blob.stream().getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return `${total} bytes streamed`;
    }
    total += value.byteLength;
  }
}

const ReadCard = defineComponent<{ blob: Blob }>(
  props => {
    const start = ref('');
    const end = ref('');
    const sliceType = ref('');
    const output = ref('nothing read yet');
    const show = (label: string, read: () => Promise<string>) => {
      output.value = `${label}…`;
      read()
        .then(value => {
          output.value = `${label}: ${value}`;
        })
        .catch((error: Error) => {
          output.value = `${label} failed: ${error.message}`;
        });
    };
    const target = () =>
      props.blob.slice(
        optionalIndex(start.value),
        optionalIndex(end.value),
        sliceType.value,
      );

    return () => (
      <Scenario
        testID="blob-read-card"
        title="Read the content back, whole or in part"
        why="Slice a chunk, such as the first bytes for a file-type check or one range of a big download, and read it as text, bytes or a stream."
        steps={['Set a slice start and end', 'Press a read button']}
        expect="Output shows the sliced text or bytes. A negative start counts from the end, and an empty range gives an empty result."
      >
        <Field
          testID="blob-slice-start-input"
          label="slice start (negative counts from the end)"
          value={start.value}
          onChange={text => {
            start.value = text;
          }}
        />
        <Field
          testID="blob-slice-end-input"
          label="slice end"
          value={end.value}
          onChange={text => {
            end.value = text;
          }}
        />
        <Field
          testID="blob-slice-type-input"
          label="slice contentType"
          value={sliceType.value}
          onChange={text => {
            sliceType.value = text;
          }}
        />
        <view class="button-row">
          <ActionButton
            testID="blob-slice-info-button"
            title="slice()"
            onPress={() => {
              const sliced = target();
              output.value = `slice: size ${sliced.size}, type "${sliced.type}"`;
            }}
            color={color}
          />
          <ActionButton
            testID="blob-text-button"
            title="text()"
            onPress={() => show('text', () => target().text())}
            color={color}
          />
          <ActionButton
            testID="blob-bytes-button"
            title="bytes()"
            onPress={() =>
              show('bytes', () =>
                target()
                  .bytes()
                  .then(bytes => Array.from(bytes.slice(0, MAX_PREVIEW_BYTES)).join(',')),
              )
            }
            color={color}
          />
          <ActionButton
            testID="blob-array-buffer-button"
            title="arrayBuffer()"
            onPress={() =>
              show('arrayBuffer', () =>
                target()
                  .arrayBuffer()
                  .then(buffer => `${buffer.byteLength} bytes`),
              )
            }
            color={color}
          />
          <ActionButton
            testID="blob-stream-button"
            title="stream()"
            onPress={() => show('stream', () => readStream(target()))}
            color={color}
          />
        </view>
        <ResultRow testID="blob-output" label="Output" value={output.value} />
      </Scenario>
    );
  },
  { name: 'ReadCard', props: ['blob'] },
);

export const BlobScreen = defineComponent(
  () => {
    const parts = ref<IParts>({
      text: 'Hello\nBlob',
      hasBytes: false,
      hasBuffer: false,
      hasNestedBlob: false,
    });
    const type = ref('text/plain');
    const endings = ref<IEndings>('transparent');
    const blob = shallowRef<Blob | null>(null);
    const error = ref('');
    const setParts: ISetParts = patch => {
      parts.value = { ...parts.value, ...patch };
    };

    const handleCreate = () => {
      try {
        blob.value = new Blob(buildParts(parts.value), {
          type: type.value,
          endings: endings.value,
        });
        error.value = '';
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
      }
    };

    return () => (
      <ScreenShell
        route={ROUTE}
        testID="blob-scroll"
        title="Blob"
        body="Handle binary data the web way: assemble a Blob from text, bytes and other blobs, then read or slice it without copying everything through JavaScript."
      >
        <Scenario
          testID="blob-create-card"
          title="Assemble a file body from pieces"
          why="Build an upload body or a generated file from text and binary parts. The data stays in native memory, so large payloads do not clog the JS thread."
          steps={['Press new Blob(parts, options) (the sample text is already set)', 'Read and slice the result in the next card']}
          expect="The size in bytes and the type appear. The size matches the text you entered, and line endings follow the option in the explorer."
        >
          <ActionButton
            testID="blob-create-button"
            title="new Blob(parts, options)"
            onPress={handleCreate}
            color={color}
          />
          <ResultRow
            testID="blob-size"
            label="size"
            value={blob.value === null ? 'no blob yet' : `${blob.value.size} bytes`}
          />
          <ResultRow
            testID="blob-type"
            label="type"
            value={blob.value === null ? 'no blob yet' : `"${blob.value.type}"`}
          />
          {error.value !== '' && (
            <ResultRow testID="blob-error" label="Error" value={error.value} />
          )}
        </Scenario>
        {blob.value !== null && <ReadCard blob={blob.value} />}
        <Explorer testID="blob-explorer" color={color}>
          <PartsCard
            parts={parts.value}
            setParts={setParts}
            type={type.value}
            setType={text => {
              type.value = text;
            }}
            endings={endings.value}
            setEndings={next => {
              endings.value = next;
            }}
          />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'BlobScreen' },
);
