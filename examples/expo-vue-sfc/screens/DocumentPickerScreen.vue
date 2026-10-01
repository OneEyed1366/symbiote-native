<script setup lang="ts">
import { ref } from 'vue';
import { getDocumentAsync } from '@symbiote-native/document-picker';
import type { IDocumentPickerAsset } from '@symbiote-native/document-picker';
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

const ROUTE = ROUTE_NAME.DocumentPicker;
const color = lineColorOf(ROUTE);

const TYPE_PRESETS = [
  { label: 'any', value: '*/*' },
  { label: 'images', value: 'image/*' },
  { label: 'pdf', value: 'application/pdf' },
  { label: 'pdf+text', value: 'application/pdf,text/plain' },
] as const;

const type = ref<string>('*/*');
const copyToCacheDirectory = ref(true);
const multiple = ref(false);
const status = ref('idle');
const assets = ref<IDocumentPickerAsset[]>([]);

function handlePick(): void {
  status.value = 'picker open…';
  const types = type.value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  getDocumentAsync({
    type: types.length === 1 ? types[0] : types,
    copyToCacheDirectory: copyToCacheDirectory.value,
    multiple: multiple.value,
  })
    .then(result => {
      status.value = result.canceled ? 'canceled' : `picked ${result.assets.length}`;
      assets.value = result.canceled ? [] : result.assets;
    })
    .catch((error: Error) => {
      status.value = `failed: ${error.message}`;
    });
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="document-picker-scroll"
    title="Document Picker"
    body="Let users attach files from anywhere: Files, iCloud Drive, Google Drive or local storage. Filter by type, allow several files and get a readable local copy."
  >
    <Scenario
      testID="document-picker-result-card"
      title="Attach a file from the user's storage"
      why="Upload a contract, import a backup or attach a PDF. The system picker shows every storage provider, so the app needs no storage permission."
      :steps="[
        'Press Pick a file',
        'Choose any file (or several after enabling multiple in the explorer)',
        'Cancel once to see that too',
      ]"
      expect="The status says picked N with each file's name, size and type. Cancelling says canceled and lists nothing."
    >
      <ActionButton
        testID="document-picker-pick-button"
        title="Pick a file"
        :onPress="handlePick"
        :color="color"
      />
      <ResultRow testID="document-picker-status" label="canceled / assets" :value="status" />
      <view
        v-for="(asset, index) in assets"
        :key="asset.uri"
        :testID="`document-picker-asset-${index}`"
      >
        <ResultRow :testID="`document-picker-name-${index}`" label="name" :value="asset.name" />
        <ResultRow
          :testID="`document-picker-size-${index}`"
          label="size"
          :value="asset.size === undefined ? 'unknown' : `${asset.size} bytes`"
        />
        <ResultRow
          :testID="`document-picker-mime-${index}`"
          label="mimeType"
          :value="asset.mimeType ?? 'unknown'"
        />
        <ResultRow
          :testID="`document-picker-modified-${index}`"
          label="lastModified"
          :value="new Date(asset.lastModified).toISOString()"
        />
        <ResultRow :testID="`document-picker-uri-${index}`" label="uri" :value="asset.uri" />
      </view>
    </Scenario>
    <Explorer testID="document-picker-explorer" :color="color">
      <Card testID="document-picker-options-card" title="Options">
        <ChoiceRow
          testID="document-picker-type-preset"
          label="type presets"
          :options="TYPE_PRESETS"
          :value="type"
          :onChange="next => (type = next)"
          :color="color"
        />
        <Field
          testID="document-picker-type-input"
          label="type (MIME types, comma separated)"
          :value="type"
          :onChange="next => (type = next)"
        />
        <ToggleRow
          testID="document-picker-copy-switch"
          label="copyToCacheDirectory"
          :value="copyToCacheDirectory"
          :onChange="next => (copyToCacheDirectory = next)"
          :color="color"
        />
        <ToggleRow
          testID="document-picker-multiple-switch"
          label="multiple"
          :value="multiple"
          :onChange="next => (multiple = next)"
          :color="color"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
