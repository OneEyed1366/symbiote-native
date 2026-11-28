<script>
  // `Stack` is imported past the barrel: its `register` pulls all of `react-native` into the bundle
  import Screen from '@symbiote-native/navigation/svelte/screen.svelte';
  import { Stack } from '@symbiote-native/navigation/svelte/stack';
  import Detail from './svelte-stack-detail-probe.svelte';
  import Home from './svelte-stack-home-probe.svelte';
</script>

<Stack>
  <Screen name="home" component={Home} />
  <Screen name="detail" component={Detail} />
</Stack>
