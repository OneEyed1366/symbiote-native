<script lang="ts">
  // @symbiote-native/store-review tour stop — a capabilities card (isAvailableAsync/hasAction,
  // checked on mount) plus a Request Review action, mirroring BatteryScreen's
  // capabilities-card/status-badge shape. No store-URL options passed — this demo relies on the
  // native review flow alone (see the core's IStoreReviewUrlOptions fallback for real apps).
  // Svelte twin of ../../expo-vue-sfc/screens/StoreReviewScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
  import {
    hasAction,
    isAvailableAsync,
    requestReview,
  } from '@symbiote-native/store-review/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function toBadgeText(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
  const lineColor = LINE_COLOR[lineInfo.line];

  let isAvailable = $state<ICapabilityStatus>('checking');
  let hasReviewAction = $state<ICapabilityStatus>('checking');
  let lastResult = $state('idle');

  $effect(() => {
    // Nothing reactive is read synchronously here, so the dependency set is empty and this runs
    // exactly once on mount — the twin of Vue's onMounted.
    void isAvailableAsync().then(value => {
      isAvailable = toCapabilityStatus(value);
    });
    void hasAction().then(value => {
      hasReviewAction = toCapabilityStatus(value);
    });
  });

  // Neither store reports whether a prompt appeared — a suppressed dialog and a rejected call
  // look identical unless the outcome is shown.
  function handleRequestReview(): void {
    lastResult = 'requesting…';
    void requestReview()
      .then(() => {
        lastResult = 'resolved';
      })
      .catch((error: Error) => {
        lastResult = `rejected: ${error.message}`;
      });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="store-review-scroll"
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
        <text class="hero-title">Store Review</text>
        <text class="hero-body">
          @symbiote-native/store-review — prompts the platform's native in-app
          review flow.
        </text>
      </view>
    </view>
    <view testID="store-review-capabilities-card" class="store-review-card">
      <text class="store-review-card-title">Capabilities</text>
      <view class="store-review-row">
        <text class="store-review-row-label">Available</text>
        <view
          class={`store-review-status-badge store-review-status-badge-${isAvailable}`}
        >
          <text class="store-review-status-text">
            {toBadgeText(isAvailable)}
          </text>
        </view>
      </view>
      <view class="store-review-row">
        <text class="store-review-row-label">Has action</text>
        <view
          class={`store-review-status-badge store-review-status-badge-${hasReviewAction}`}
        >
          <text class="store-review-status-text">
            {toBadgeText(hasReviewAction)}
          </text>
        </view>
      </view>
    </view>
    <view testID="store-review-actions-card" class="store-review-card">
      <text class="store-review-card-title">Actions</text>
      <ActionButton
        testID="store-review-request-button"
        title="Request Review"
        onPress={handleRequestReview}
        color={lineColor}
      />
      <view class="store-review-row">
        <text class="store-review-row-label">Last result</text>
        <text testID="store-review-result" class="store-review-value-text">
          {lastResult}
        </text>
      </view>
      <text class="info-text">
        resolved means the call completed, not that a prompt appeared. On
        Android the Play dialog only shows for a build installed from Google
        Play (internal test track, internal app sharing, or production); a
        sideloaded debug build resolves silently. iOS shows it in debug builds.
        Both stores also enforce a quota.
      </text>
    </view>
  </ScrollView>
</safe-area-view>
