// The lazy() target. Its own module purely so the dynamic import() in LazyDemo.tsx has a real
// module boundary to defer — the same arrangement as examples/react/components/LazyLoadedPanel.tsx.
//
// A DEFAULT export: lazy() resolves `mod.default` and nothing else.

import { onMount } from 'solid-js';

export default function LazyPanel(props: { mountedAt: () => void }) {
  onMount(() => props.mountedAt());

  return (
    <view class="ap-panel">
      <text class="ap-value" testID="lazy-panel">
        loaded through lazy() — this module was not evaluated until the button
        above asked for it
      </text>
    </view>
  );
}
