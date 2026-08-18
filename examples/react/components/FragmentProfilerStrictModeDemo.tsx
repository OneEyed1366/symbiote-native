import { Fragment, Profiler, StrictMode, useEffect, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

function FragmentRows() {
  // <>...</> groups these three Text lines under one Fragment — no extra host View wraps them,
  // so they lay out exactly as if they were direct siblings of whatever renders <FragmentRows />.
  return (
    <>
      <Text className="list-row-text">fragment row 1</Text>
      <Text className="list-row-text">fragment row 2</Text>
      <Text className="list-row-text">fragment row 3</Text>
    </>
  );
}

function StrictCounter() {
  const [mountEffects, setMountEffects] = useState(0);
  useEffect(() => {
    setMountEffects(current => current + 1);
  }, []);
  return (
    <Text testID="strict-mode-mounts" className="info-text">
      {`mount effect ran ${mountEffects} time(s) — StrictMode double-invokes it in dev`}
    </Text>
  );
}

export function FragmentProfilerStrictModeDemo() {
  const [renderDuration, setRenderDuration] = useState('not measured yet');
  const [bump, setBump] = useState(0);

  return (
    <View className="section-nested">
      <Text className="section-label">Fragment · Profiler · StrictMode</Text>
      <Fragment>
        <FragmentRows />
      </Fragment>
      <Profiler
        id="api-playground-profiler"
        onRender={(_id, phase, actualDuration) =>
          setRenderDuration(`${phase} took ${actualDuration.toFixed(2)}ms`)
        }
      >
        <Text testID="profiler-duration" className="info-text">
          {`Profiler onRender: ${renderDuration} (bump ${bump})`}
        </Text>
      </Profiler>
      <ActionButton
        testID="profiler-rerender"
        title="Re-render the profiled subtree"
        onPress={() => setBump(current => current + 1)}
        color={LINE_COLOR.introspection}
      />
      <StrictMode>
        <StrictCounter />
      </StrictMode>
    </View>
  );
}
