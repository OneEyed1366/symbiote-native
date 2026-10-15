<script lang="ts">
  import {
    FadeOutRight,
    SharedTransitionBoundary,
    SlideInDown,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaSection from './RaSection.svelte';

  const SHARED_TAG = 'demo-shared-box';
  const FIRST = 'first';
  const SECOND = 'second';

  type IScreen = typeof FIRST | typeof SECOND;

  // Two fake screens in one view: no navigator is needed when a boundary says which one is active
  // The flag that turns the native side on is `ENABLE_SHARED_ELEMENT_TRANSITIONS` in `package.json`
  let showing = $state<IScreen>(FIRST);

  const toggle = () => {
    showing = showing === FIRST ? SECOND : FIRST;
  };
</script>

<RaSection
  title="Shared element transition"
  note="the box flies from the first fake screen to the second, turning on the way"
>
  <text class="ra-note">{`showing: ${showing}`}</text>
  <view class="ra-fake-screen">
    <SharedTransitionBoundary isActive={showing === FIRST}>
      <view
        class="ra-box ra-shared-first"
        p={{ sharedTransitionTag: SHARED_TAG }}
      />
    </SharedTransitionBoundary>
  </view>
  {#if showing === SECOND}
    <view
      class="ra-fake-screen"
      p={{ entering: SlideInDown, exiting: FadeOutRight }}
    >
      <SharedTransitionBoundary isActive>
        <view
          class="ra-box ra-shared-second"
          p={{ sharedTransitionTag: SHARED_TAG }}
        />
      </SharedTransitionBoundary>
    </view>
  {/if}
  <ActionButton
    testID="ra-shared-toggle"
    title="toggle screen"
    onPress={toggle}
    color={ACCENT}
  />
</RaSection>
