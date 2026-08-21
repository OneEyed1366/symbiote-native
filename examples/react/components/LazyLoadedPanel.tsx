import { Text } from '@symbiote-native/react';

// The component React.lazy() dynamically imports (SuspenseActivityLazyDemo.tsx) — split into
// its own module so the import() call has a real module boundary to defer.
export default function LazyLoadedPanel() {
  return (
    <Text testID="lazy-loaded-panel" className="info-text">
      lazy()-loaded panel is here
    </Text>
  );
}
