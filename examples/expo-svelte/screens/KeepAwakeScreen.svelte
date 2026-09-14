<script lang="ts">
  // @symbiote-native/keep-awake tour stop — useKeepAwake() has no on/off switch of its own: it
  // activates inside its own $effect and deactivates in that effect's teardown. The Vue twin
  // toggles a one-line holder component in and out of the tree to drive that; Svelte cannot
  // declare a second component inside one file, so the equivalent here is a NESTED effect (see
  // the toggle effect below). Svelte twin of examples/expo-vue-sfc/screens/KeepAwakeScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
  import {
    isAvailableAsync,
    useKeepAwake,
  } from '@symbiote-native/keep-awake/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_BADGE_TEXT: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
  const lineColor = LINE_COLOR[lineInfo.line];

  let isHeld = $state(false);
  let isAvailable = $state<ICapabilityStatus>('checking');

  $effect(() => {
    void isAvailableAsync().then(value => {
      isAvailable = toCapabilityStatus(value);
    });
  });

  // Nested effect: this one reads `isHeld`, so flipping the toggle re-runs it, and re-running an
  // effect destroys every effect created inside it — including the one useKeepAwake() registers.
  // That teardown is the same deactivate call unmounting Vue's holder component makes, so the
  // lock is acquired and released on exactly the same edges as the Vue twin.
  $effect(() => {
    if (isHeld) {
      useKeepAwake();
    }
  });

  function handleToggle(): void {
    isHeld = !isHeld;
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="keep-awake-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Keep Awake</text>
        <text class="hero-body">
          @symbiote-native/keep-awake — keeps the screen on for as long as a
          component holding useKeepAwake() stays mounted.
        </text>
      </view>
    </view>
    <view testID="keep-awake-card" class="keep-awake-card">
      <text class="keep-awake-card-title">Screen lock</text>
      <view class="keep-awake-row">
        <text class="keep-awake-row-label">Available</text>
        <view
          class={`keep-awake-status-badge keep-awake-status-badge-${isAvailable}`}
        >
          <text class="keep-awake-status-text">
            {CAPABILITY_BADGE_TEXT[isAvailable]}
          </text>
        </view>
      </view>
      <view class="keep-awake-row">
        <text class="keep-awake-row-label">Held</text>
        <text testID="keep-awake-held-value" class="keep-awake-value-text">
          {isHeld ? 'true' : 'false'}
        </text>
      </view>
      <ActionButton
        testID="keep-awake-toggle-button"
        title={isHeld ? 'Release keep-awake' : 'Activate keep-awake'}
        onPress={handleToggle}
        color={lineColor}
      />
    </view>
  </ScrollView>
</safe-area-view>
