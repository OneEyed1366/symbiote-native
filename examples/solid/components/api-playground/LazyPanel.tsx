// The lazy() target. Its own module purely so the dynamic import() in LazyDemo.tsx has a real
// module boundary to defer — the same arrangement as examples/react/components/LazyLoadedPanel.tsx.
//
// A DEFAULT export: lazy() resolves `mod.default` and nothing else.

import { onMount } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';

export default function LazyPanel(props: { mountedAt: () => void }) {
  onMount(() => props.mountedAt());

  return (
    <View class="ap-panel">
      <Text class="ap-value" testID="lazy-panel">
        loaded through lazy() — this module was not evaluated until the button
        above asked for it
      </Text>
    </View>
  );
}
