<script lang="ts">
  import type { IImagePickerAsset } from '@symbiote-native/image-picker/svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { ASSET_TYPE_VIDEO } from './image-picker-form';

  let { asset, index }: { asset: IImagePickerAsset; index: number } = $props();

  const rows = $derived<[string, string][]>([
    ['type', String(asset.type)],
    ['size', `${asset.width} × ${asset.height}`],
    ['fileName', String(asset.fileName)],
    ['fileSize', String(asset.fileSize)],
    ['duration', String(asset.duration)],
    ['assetId', String(asset.assetId)],
    ['exif', asset.exif ? `${Object.keys(asset.exif).length} keys` : 'none'],
    ['base64', asset.base64 ? `${asset.base64.length} chars` : 'none'],
    ['pairedVideoAsset', asset.pairedVideoAsset?.uri ?? 'none'],
  ]);
</script>

<view testID={`image-picker-asset-${index}`}>
  {#each rows as [label, value] (label)}
    <ResultRow testID={`image-picker-asset-${index}-${label}`} {label} {value} />
  {/each}
  {#if asset.type !== ASSET_TYPE_VIDEO}
    <image
      testID={`image-picker-preview-${index}`}
      source={{ uri: asset.uri }}
      style={{ width: '100%', height: 180 }}
      resizeMode="contain"
    ></image>
  {/if}
</view>
