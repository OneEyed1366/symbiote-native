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

  // Context follows the RUNTIME render tree, not this file's lexical location — it reads whatever
  // CompositionDemo.svelte's ancestor instance set, even though this component is defined in a
  // different module (svelte-adapter-dom-shim skill, "Rendering declarative marker children").
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
