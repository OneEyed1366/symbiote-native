import { Activity, lazy, Suspense, useState } from 'react';
import { ActionButton } from './ActionButton';
import { CaveatNote } from './CaveatNote';
import { LINE_COLOR } from '../navigation-lines';

const LazyLoadedPanel = lazy(() => import('./LazyLoadedPanel'));

export function SuspenseActivityLazyDemo() {
  const [showLazy, setShowLazy] = useState(false);
  const [activityMode, setActivityMode] = useState<'visible' | 'hidden'>(
    'visible',
  );

  return (
    <view className="section-nested">
      <text className="section-label">Suspense · lazy · Activity</text>
      <ActionButton
        testID="suspense-toggle"
        title={
          showLazy ? 'Unmount lazy panel' : 'Mount lazy panel (lazy + Suspense)'
        }
        onPress={() => setShowLazy(current => !current)}
        color={LINE_COLOR.introspection}
      />
      {showLazy && (
        <Suspense
          fallback={<text className="info-text">loading lazy panel…</text>}
        >
          <LazyLoadedPanel />
        </Suspense>
      )}
      <ActionButton
        testID="activity-toggle"
        title={
          activityMode === 'visible' ? 'Hide via Activity' : 'Show via Activity'
        }
        onPress={() =>
          setActivityMode(current =>
            current === 'visible' ? 'hidden' : 'visible',
          )
        }
        color={LINE_COLOR.introspection}
      />
      <Activity mode={activityMode}>
        <text testID="activity-content" className="info-text">
          Activity-wrapped content — state stays alive while hidden
        </text>
      </Activity>
      <CaveatNote testID="suspense-activity-caveat">
        host-config.ts's hideInstance/unhideInstance are no-op stubs, so content
        Suspense/Activity mark as hidden likely stays visually painted — only
        React's own bookkeeping treats it as hidden, not the actual view tree.
      </CaveatNote>
    </view>
  );
}
