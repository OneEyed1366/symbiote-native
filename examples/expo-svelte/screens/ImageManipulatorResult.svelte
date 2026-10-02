<script lang="ts">
  import type { IImageResult } from '@symbiote-native/image-manipulator/svelte';
  import ResultRow from '../components/ResultRow.svelte';

  let { result }: { result: IImageResult } = $props();
</script>

<ResultRow testID="image-manipulator-size" label="width × height" value={`${result.width} × ${result.height}`} />
<ResultRow testID="image-manipulator-uri" label="uri" value={result.uri} />
<ResultRow
  testID="image-manipulator-base64"
  label="base64"
  value={result.base64 ? `${result.base64.length} chars` : 'not requested'}
/>
<image
  testID="image-manipulator-image"
  source={{ uri: result.uri }}
  style={{ width: '100%', height: 220 }}
  resizeMode="contain"
></image>
