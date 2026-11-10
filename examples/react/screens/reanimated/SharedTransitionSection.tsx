import { useState } from 'react';
import Animated, {
  FadeOutRight,
  SharedTransitionBoundary,
  SlideInDown,
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const TOGGLE_COLOR = '#4ea1ff';
const SHARED_TAG = 'demo-shared-box';
const FIRST = 'first';
const SECOND = 'second';

type IScreen = typeof FIRST | typeof SECOND;

// Two fake screens in one view: no navigator is needed when a boundary says which one is active.
// The flag that turns the native side on is `ENABLE_SHARED_ELEMENT_TRANSITIONS` in this app's
// `package.json`, read when the native build is made
export function SharedTransitionSection() {
  const [showing, setShowing] = useState<IScreen>(FIRST);

  return (
    <Section
      title="Shared element transition"
      note="the box flies from the first fake screen to the second, turning on the way"
    >
      <text className="ra-note">{`showing: ${showing}`}</text>
      <view className="ra-fake-screen">
        <SharedTransitionBoundary isActive={showing === FIRST}>
          <Animated.View
            sharedTransitionTag={SHARED_TAG}
            className="ra-box ra-shared-first"
          />
        </SharedTransitionBoundary>
      </view>
      {showing === SECOND ? (
        <Animated.View
          entering={SlideInDown}
          exiting={FadeOutRight}
          className="ra-fake-screen"
        >
          <SharedTransitionBoundary isActive>
            <Animated.View
              sharedTransitionTag={SHARED_TAG}
              className="ra-box ra-shared-second"
            />
          </SharedTransitionBoundary>
        </Animated.View>
      ) : null}
      <ActionButton
        testID="ra-shared-toggle"
        title="toggle screen"
        onPress={() => setShowing(showing === FIRST ? SECOND : FIRST)}
        color={TOGGLE_COLOR}
      />
    </Section>
  );
}
