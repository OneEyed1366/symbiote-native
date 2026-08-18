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
  import { Text, View } from '@symbiote-native/svelte';

  // Context follows the RUNTIME render tree, not this file's lexical location — it reads whatever
  // CompositionDemo.svelte's ancestor instance set, even though this component is defined in a
  // different module (svelte-adapter-dom-shim skill, "Rendering declarative marker children").
  const theme = getContext<IApiPlaygroundTheme>(API_PLAYGROUND_THEME_CONTEXT);
  const hasTheme = hasContext(API_PLAYGROUND_THEME_CONTEXT);
  const contextKeyCount = getAllContexts().size;
</script>

<View class="row-align-center">
  <View class="hero-badge" style={{ backgroundColor: theme.accent }}>
    <Text class="hero-badge-text">ctx</Text>
  </View>
  <Text class="info-text-flex" testID="context-consumer-readout">
    {`hasContext: ${hasTheme} · getAllContexts().size: ${contextKeyCount} · accent via getContext: ${theme.accent}`}
  </Text>
</View>
