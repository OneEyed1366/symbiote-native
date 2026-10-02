<script setup lang="ts">
import { ref } from 'vue';
import { File, Paths } from '@symbiote-native/file-system/vue';
import { shareAsync } from '@symbiote-native/sharing/vue';
import ActionButton from '../components/ActionButton.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sharing);

const fileUri = ref('');
const mimeType = ref('');
const uti = ref('');
const dialogTitle = ref('Share from the Symbiote canary');
const anchorX = ref('');
const anchorY = ref('');
const anchorWidth = ref('');
const anchorHeight = ref('');
const lastResult = ref('idle');

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

function createSample(): void {
  const sample = new File(Paths.cache, 'symbiote-share-sample.txt');
  try {
    if (!sample.exists) {
      sample.create();
    }
    sample.write('Shared from the Symbiote canary');
    fileUri.value = sample.uri;
    mimeType.value = 'text/plain';
    lastResult.value = 'sample file created';
  } catch (error) {
    lastResult.value = `sample failed at ${sample.uri}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function share(): void {
  lastResult.value = 'sheet open…';
  shareAsync(fileUri.value, {
    mimeType: optional(mimeType.value),
    UTI: optional(uti.value),
    dialogTitle: optional(dialogTitle.value),
    anchor: {
      x: optionalNumber(anchorX.value),
      y: optionalNumber(anchorY.value),
      width: optionalNumber(anchorWidth.value),
      height: optionalNumber(anchorHeight.value),
    },
  })
    .then(() => {
      lastResult.value = 'sheet dismissed';
    })
    .catch((error: Error) => {
      lastResult.value = `share failed: ${error.message}`;
    });
}
</script>

<template>
  <Scenario
    testID="sharing-share-card"
    title="Let users send a file to another app"
    why="Export a report, a photo or a backup through the system share sheet, so the user picks Messages, Mail, AirDrop or any installed app. The file must be a local file:// path."
    :steps="[
      'Press Create a sample file',
      'Press Share',
      'Pick a target in the share sheet, or dismiss it',
    ]"
    expect="The share sheet opens with the sample file. Last result says sheet dismissed after you pick a target or cancel."
  >
    <ActionButton
      testID="sharing-sample-button"
      title="Create a sample file"
      :onPress="createSample"
      :color="color"
    />
    <Field
      testID="sharing-uri-input"
      label="file uri"
      :value="fileUri"
      :onChange="next => (fileUri = next)"
      placeholder="file:///path/to/file.pdf"
    />
    <ActionButton testID="sharing-share-button" title="Share" :onPress="share" :color="color" />
    <ResultRow testID="sharing-result" label="Last result" :value="lastResult" />
    <Explorer testID="sharing-options-explorer" :color="color">
      <Field
        testID="sharing-mime-input"
        label="mimeType (Android)"
        :value="mimeType"
        :onChange="next => (mimeType = next)"
      />
      <Field testID="sharing-uti-input" label="UTI (iOS)" :value="uti" :onChange="next => (uti = next)" />
      <Field
        testID="sharing-title-input"
        label="dialogTitle"
        :value="dialogTitle"
        :onChange="next => (dialogTitle = next)"
      />
      <Field
        testID="sharing-anchor-x-input"
        label="anchor.x (iPad popover)"
        :value="anchorX"
        :onChange="next => (anchorX = next)"
      />
      <Field
        testID="sharing-anchor-y-input"
        label="anchor.y"
        :value="anchorY"
        :onChange="next => (anchorY = next)"
      />
      <Field
        testID="sharing-anchor-width-input"
        label="anchor.width"
        :value="anchorWidth"
        :onChange="next => (anchorWidth = next)"
      />
      <Field
        testID="sharing-anchor-height-input"
        label="anchor.height"
        :value="anchorHeight"
        :onChange="next => (anchorHeight = next)"
      />
    </Explorer>
  </Scenario>
</template>
