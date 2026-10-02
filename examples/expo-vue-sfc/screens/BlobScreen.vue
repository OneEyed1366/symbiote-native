<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Blob } from '@symbiote-native/blob';
import type { IBlobPart } from '@symbiote-native/blob';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.Blob;
const color = lineColorOf(ROUTE);
const ENDINGS = [
  { label: 'transparent', value: 'transparent' },
  { label: 'native', value: 'native' },
] as const;
type IEndings = (typeof ENDINGS)[number]['value'];
const MAX_PREVIEW_BYTES = 32;

const text = ref('Hello\nBlob');
const hasBytes = ref(false);
const hasBuffer = ref(false);
const hasNestedBlob = ref(false);
const type = ref('text/plain');
const endings = ref<IEndings>('transparent');
// A Blob is a native-backed class instance, so it stays outside deep reactivity
const blob = shallowRef<Blob | null>(null);
const error = ref('');
const start = ref('');
const end = ref('');
const sliceType = ref('');
const output = ref('nothing read yet');

function buildParts(): IBlobPart[] {
  const built: IBlobPart[] = [text.value];
  if (hasBytes.value) {
    built.push(new Uint8Array([1, 2, 3, 4]));
  }
  if (hasBuffer.value) {
    built.push(new ArrayBuffer(4));
  }
  if (hasNestedBlob.value) {
    built.push(new Blob(['nested']));
  }
  return built;
}

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

function handleCreate(): void {
  try {
    blob.value = new Blob(buildParts(), { type: type.value, endings: endings.value });
    error.value = '';
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
  }
}

function target(): Blob {
  if (blob.value === null) {
    throw new Error('create a blob first');
  }
  return blob.value.slice(optionalIndex(start.value), optionalIndex(end.value), sliceType.value);
}

function show(label: string, read: () => Promise<string>): void {
  output.value = `${label}…`;
  read()
    .then(value => {
      output.value = `${label}: ${value}`;
    })
    .catch((failure: Error) => {
      output.value = `${label} failed: ${failure.message}`;
    });
}

function showSlice(): void {
  const sliced = target();
  output.value = `slice: size ${sliced.size}, type "${sliced.type}"`;
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="blob-scroll"
    title="Blob"
    body="Handle binary data the web way: assemble a Blob from text, bytes and other blobs, then read or slice it without copying everything through JavaScript."
  >
    <Scenario
      testID="blob-create-card"
      title="Assemble a file body from pieces"
      why="Build an upload body or a generated file from text and binary parts. The data stays in native memory, so large payloads do not clog the JS thread."
      :steps="[
        'Press new Blob(parts, options) (the sample text is already set)',
        'Read and slice the result in the next card',
      ]"
      expect="The size in bytes and the type appear. The size matches the text you entered, and line endings follow the option in the explorer."
    >
      <ActionButton
        testID="blob-create-button"
        title="new Blob(parts, options)"
        :onPress="handleCreate"
        :color="color"
      />
      <ResultRow
        testID="blob-size"
        label="size"
        :value="blob === null ? 'no blob yet' : `${blob.size} bytes`"
      />
      <ResultRow
        testID="blob-type"
        label="type"
        :value="blob === null ? 'no blob yet' : `&quot;${blob.type}&quot;`"
      />
      <ResultRow v-if="error !== ''" testID="blob-error" label="Error" :value="error" />
    </Scenario>

    <Scenario
      v-if="blob"
      testID="blob-read-card"
      title="Read the content back, whole or in part"
      why="Slice a chunk, such as the first bytes for a file-type check or one range of a big download, and read it as text, bytes or a stream."
      :steps="['Set a slice start and end', 'Press a read button']"
      expect="Output shows the sliced text or bytes. A negative start counts from the end, and an empty range gives an empty result."
    >
      <Field
        testID="blob-slice-start-input"
        label="slice start (negative counts from the end)"
        :value="start"
        :onChange="next => (start = next)"
      />
      <Field
        testID="blob-slice-end-input"
        label="slice end"
        :value="end"
        :onChange="next => (end = next)"
      />
      <Field
        testID="blob-slice-type-input"
        label="slice contentType"
        :value="sliceType"
        :onChange="next => (sliceType = next)"
      />
      <view class="button-row">
        <ActionButton
          testID="blob-slice-info-button"
          title="slice()"
          :onPress="showSlice"
          :color="color"
        />
        <ActionButton
          testID="blob-text-button"
          title="text()"
          :onPress="() => show('text', () => target().text())"
          :color="color"
        />
        <ActionButton
          testID="blob-bytes-button"
          title="bytes()"
          :onPress="
            () =>
              show('bytes', () =>
                target()
                  .bytes()
                  .then(bytes => Array.from(bytes.slice(0, MAX_PREVIEW_BYTES)).join(',')),
              )
          "
          :color="color"
        />
        <ActionButton
          testID="blob-array-buffer-button"
          title="arrayBuffer()"
          :onPress="
            () =>
              show('arrayBuffer', () =>
                target()
                  .arrayBuffer()
                  .then(buffer => `${buffer.byteLength} bytes`),
              )
          "
          :color="color"
        />
        <ActionButton
          testID="blob-stream-button"
          title="stream()"
          :onPress="() => show('stream', () => readStream(target()))"
          :color="color"
        />
      </view>
      <ResultRow testID="blob-output" label="Output" :value="output" />
    </Scenario>

    <Explorer testID="blob-explorer" :color="color">
      <Card testID="blob-parts-card" title="Constructor">
        <Field
          testID="blob-text-input"
          label="string part (try a line break)"
          :value="text"
          :onChange="next => (text = next)"
          multiline
        />
        <ToggleRow
          testID="blob-bytes-switch"
          label="ArrayBufferView part (Uint8Array 1..4)"
          :value="hasBytes"
          :onChange="next => (hasBytes = next)"
          :color="color"
        />
        <ToggleRow
          testID="blob-buffer-switch"
          label="ArrayBuffer part (4 zero bytes)"
          :value="hasBuffer"
          :onChange="next => (hasBuffer = next)"
          :color="color"
        />
        <ToggleRow
          testID="blob-nested-switch"
          label="Blob part (nested)"
          :value="hasNestedBlob"
          :onChange="next => (hasNestedBlob = next)"
          :color="color"
        />
        <Field
          testID="blob-type-input"
          label="type (MIME)"
          :value="type"
          :onChange="next => (type = next)"
          placeholder="text/plain"
        />
        <ChoiceRow
          testID="blob-endings"
          label="endings"
          :options="ENDINGS"
          :value="endings"
          :onChange="next => (endings = next)"
          :color="color"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
