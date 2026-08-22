// Async — lazy() + <Suspense>.
//
// Metro bundles everything into one file, so a dynamic import() resolves from memory almost
// instantly and the fallback would flash past unseen. The delay below is DELIBERATE and additive:
// the import is a real one, and the timer only holds the resolved module back long enough to make
// the boundary observable on device. Nothing about lazy() itself is stubbed.

import { Suspense, createSignal, lazy } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.routing;
const ARTIFICIAL_DELAY_MS = 600;

const LazyPanel = lazy(() =>
  import('./LazyPanel').then(
    module =>
      new Promise<typeof module>(resolve => {
        setTimeout(() => resolve(module), ARTIFICIAL_DELAY_MS);
      }),
  ),
);

export function LazyDemo() {
  const [mounted, setMounted] = createSignal(false);
  const [loadedAt, setLoadedAt] = createSignal<string>('never');

  return (
    <View class="section-nested">
      <Text class="section-label">lazy · Suspense</Text>
      <ActionButton
        testID="lazy-mount"
        title={mounted() ? 'unmount lazy panel' : 'mount lazy panel'}
        color={ACCENT}
        onPress={() => setMounted(value => !value)}
      />
      <Suspense
        fallback={
          <Text class="subtle" testID="lazy-fallback">
            Suspense fallback — module in flight
          </Text>
        }
      >
        {mounted() ? (
          <LazyPanel
            mountedAt={() =>
              setLoadedAt(new Date().toISOString().slice(11, 19))
            }
          />
        ) : null}
      </Suspense>
      <Text class="subtle" testID="lazy-loaded-at">
        {`module first evaluated at ${loadedAt()}`}
      </Text>
    </View>
  );
}
