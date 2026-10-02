<script setup lang="ts">
import { computed } from 'vue';
import type { IImagePickerAsset } from '@symbiote-native/image-picker/vue';
import ResultRow from '../components/ResultRow.vue';
import { ASSET_TYPE_VIDEO } from './image-picker-form';

const props = defineProps<{ asset: IImagePickerAsset; index: number }>();

const rows = computed((): [string, string][] => [
  ['type', String(props.asset.type)],
  ['size', `${props.asset.width} × ${props.asset.height}`],
  ['fileName', String(props.asset.fileName)],
  ['fileSize', String(props.asset.fileSize)],
  ['duration', String(props.asset.duration)],
  ['assetId', String(props.asset.assetId)],
  ['exif', props.asset.exif ? `${Object.keys(props.asset.exif).length} keys` : 'none'],
  ['base64', props.asset.base64 ? `${props.asset.base64.length} chars` : 'none'],
  ['pairedVideoAsset', props.asset.pairedVideoAsset?.uri ?? 'none'],
]);
</script>

<template>
  <view :testID="`image-picker-asset-${index}`">
    <ResultRow
      v-for="[label, value] in rows"
      :key="label"
      :testID="`image-picker-asset-${index}-${label}`"
      :label="label"
      :value="value"
    />
    <image
      v-if="asset.type !== ASSET_TYPE_VIDEO"
      :testID="`image-picker-preview-${index}`"
      :source="{ uri: asset.uri }"
      :style="{ width: '100%', height: 180 }"
      resizeMode="contain"
    ></image>
  </view>
</template>
