import { defineComponent, ref } from 'vue';
import Reanimated, {
  FadeOutRight,
  SharedTransitionBoundary,
  SlideInDown,
} from '@symbiote-native/reanimated/vue';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { Section } from './Section';

const SHARED_TAG = 'demo-shared-box';
const FIRST = 'first';
const SECOND = 'second';

type IScreen = typeof FIRST | typeof SECOND;

// Two fake screens in one view: no navigator is needed when a boundary says which one is active
// The flag that turns the native side on is `ENABLE_SHARED_ELEMENT_TRANSITIONS` in `package.json`
export const SharedTransitionSection = defineComponent(() => {
  const showing = ref<IScreen>(FIRST);

  return () => (
    <Section
      title="Shared element transition"
      note="the box flies from the first fake screen to the second, turning on the way"
    >
      <text class="ra-note">{`showing: ${showing.value}`}</text>
      <view class="ra-fake-screen">
        <SharedTransitionBoundary isActive={showing.value === FIRST}>
          <Reanimated.View
            sharedTransitionTag={SHARED_TAG}
            class="ra-box ra-shared-first"
          />
        </SharedTransitionBoundary>
      </view>
      {showing.value === SECOND ? (
        <Reanimated.View
          entering={SlideInDown}
          exiting={FadeOutRight}
          class="ra-fake-screen"
        >
          <SharedTransitionBoundary isActive>
            <Reanimated.View
              sharedTransitionTag={SHARED_TAG}
              class="ra-box ra-shared-second"
            />
          </SharedTransitionBoundary>
        </Reanimated.View>
      ) : null}
      <ActionButton
        testID="ra-shared-toggle"
        title="toggle screen"
        onPress={() => (showing.value = showing.value === FIRST ? SECOND : FIRST)}
        color={ACCENT}
      />
    </Section>
  );
});
