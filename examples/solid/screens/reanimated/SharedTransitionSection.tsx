import { createSignal, Show } from 'solid-js';
import {
  FadeOutRight,
  SharedTransitionBoundary,
  SlideInDown,
} from '@symbiote-native/reanimated/solid';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { Section } from './Section';

const SHARED_TAG = 'demo-shared-box';
const FIRST = 'first';
const SECOND = 'second';

type IScreen = typeof FIRST | typeof SECOND;

// Two fake screens in one view: no navigator is needed when a boundary says which one is active
// The flag that turns the native side on is `ENABLE_SHARED_ELEMENT_TRANSITIONS` in `package.json`
export function SharedTransitionSection() {
  const [showing, setShowing] = createSignal<IScreen>(FIRST);

  return (
    <Section
      title="Shared element transition"
      note="the box flies from the first fake screen to the second, turning on the way"
    >
      <text class="ra-note">{`showing: ${showing()}`}</text>
      <view class="ra-fake-screen">
        <SharedTransitionBoundary isActive={showing() === FIRST}>
          <view
            class="ra-box ra-shared-first"
            {...{ sharedTransitionTag: SHARED_TAG }}
          />
        </SharedTransitionBoundary>
      </view>
      <Show when={showing() === SECOND}>
        <view
          class="ra-fake-screen"
          {...{ entering: SlideInDown, exiting: FadeOutRight }}
        >
          <SharedTransitionBoundary isActive>
            <view
              class="ra-box ra-shared-second"
              {...{ sharedTransitionTag: SHARED_TAG }}
            />
          </SharedTransitionBoundary>
        </view>
      </Show>
      <ActionButton
        testID="ra-shared-toggle"
        title="toggle screen"
        onPress={() => setShowing(showing() === FIRST ? SECOND : FIRST)}
        color={ACCENT}
      />
    </Section>
  );
}
