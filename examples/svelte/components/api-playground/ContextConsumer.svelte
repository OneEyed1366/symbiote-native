<script lang="ts" module>
  // setContext/getContext/hasContext/getAllContexts demo (Component Composition · Yes) — the
  // context key CompositionDemo.svelte's provider registers this consumer against. A plain
  // Symbol, not a magic string, so the two files can only agree by importing the same value.
  export const API_PLAYGROUND_THEME_CONTEXT = Symbol('api-playground-theme');

  export type IApiPlaygroundTheme = {
    accent: string;
  };
</script>

<script lang="ts">
  import { getAllContexts, getContext, hasContext } from 'svelte';

  // Context follows the runtime render tree, not the lexical location of this file
  // It reads what the ancestor instance in `CompositionDemo.svelte` set
  const theme = getContext<IApiPlaygroundTheme>(API_PLAYGROUND_THEME_CONTEXT);
  const hasTheme = hasContext(API_PLAYGROUND_THEME_CONTEXT);
  const contextKeyCount = getAllContexts().size;
</script>

<view class="row-align-center">
  <view class="hero-badge" style={{ backgroundColor: theme.accent }}>
    <text class="hero-badge-text">ctx</text>
  </view>
  <text class="info-text-flex" testID="context-consumer-readout">
    {`hasContext: ${hasTheme} · getAllContexts().size: ${contextKeyCount} · accent via getContext: ${theme.accent}`}
  </text>
</view>
