<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { readGpuInfo } from './gl-headless';
  import type { IInfoResult } from './gl-headless';

  const { color }: { color: string } = $props();

  const NOT_READ = 'not read';
  let result = $state.raw<IInfoResult>({ info: null, line: 'logging off' });

  async function read(): Promise<void> {
    const next = await readGpuInfo();
    result = { info: next.info ?? result.info, line: next.line };
  }
</script>

<Card testID="gl-info-card" title="What this GPU offers, and call logging">
  <text class="hero-body">
    Apps check the limits before choosing a texture size, and turn on call logging to debug a black view. Logging prints to the Metro console with console.warn.
  </text>
  <ActionButton testID="gl-info" title="Read GPU info and log two calls" {color} onPress={read} />
  <ResultRow testID="gl-info-version" label="VERSION" value={result.info?.version ?? NOT_READ} />
  <ResultRow testID="gl-info-renderer" label="RENDERER" value={result.info?.renderer ?? NOT_READ} />
  <ResultRow testID="gl-info-vendor" label="VENDOR" value={result.info?.vendor ?? NOT_READ} />
  <ResultRow testID="gl-info-max-texture" label="MAX_TEXTURE_SIZE" value={result.info?.maxTexture ?? NOT_READ} />
  <ResultRow testID="gl-info-logging" label="__expoSetLogging" value={result.line} />
  <text class="hero-body">
    Not shown here: getWorkletContext hands the context to a Reanimated worklet thread.
  </text>
</Card>
