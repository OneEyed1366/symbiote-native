<script lang="ts">
  // @symbiote-native/tracking-transparency tour stop — usePermissions() auto-fetches the current
  // status on mount; get()/request() re-fetch on demand. getAdvertisingId() is a plain synchronous
  // core call that may return null (iOS Simulator, not yet authorized, or declined). Svelte twin
  // of ../../expo-vue-sfc/screens/TrackingTransparencyScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
  import {
    getAdvertisingId,
    usePermissions,
  } from '@symbiote-native/tracking-transparency/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  // The rune hands back a boxed object whose `status` is a getter — Svelte 5 reactivity is
  // lexically scoped, so destructuring it here would freeze the value at its initial null.
  const permissions = usePermissions();
  let advertisingId = $state<string | null>(getAdvertisingId());

  const statusText = $derived(permissions.status?.status ?? 'checking…');
  const grantedStatus: ICapabilityStatus = $derived.by(() => {
    if (permissions.status === null) return 'checking';
    return permissions.status.granted ? 'yes' : 'no';
  });

  function toBadgeText(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }

  function handleGet(): void {
    void permissions.get();
  }

  function handleRequest(): void {
    void permissions.request().then(() => {
      advertisingId = getAdvertisingId();
    });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="tracking-transparency-scroll"
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
        <text class="hero-title">Tracking Transparency</text>
        <text class="hero-body">
          @symbiote-native/tracking-transparency — App Tracking Transparency
          permission status plus the advertising ID it gates. Android/web always
          report granted.
        </text>
      </view>
    </view>
    <view
      testID="tracking-transparency-permission-card"
      class="tracking-transparency-card"
    >
      <text class="tracking-transparency-card-title">Permission</text>
      <view class="tracking-transparency-row">
        <text class="tracking-transparency-row-label">Status</text>
        <text
          testID="tracking-transparency-status-value"
          class="tracking-transparency-value-text"
        >
          {statusText}
        </text>
      </view>
      <view class="tracking-transparency-row">
        <text class="tracking-transparency-row-label">Granted</text>
        <view
          class={`tracking-transparency-status-badge tracking-transparency-status-badge-${grantedStatus}`}
        >
          <text class="tracking-transparency-status-text">
            {toBadgeText(grantedStatus)}
          </text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton
          testID="tracking-transparency-get-button"
          title="Get"
          onPress={handleGet}
          color={lineColor}
        />
        <ActionButton
          testID="tracking-transparency-request-button"
          title="Request"
          onPress={handleRequest}
          color={lineColor}
        />
      </view>
    </view>
    <view
      testID="tracking-transparency-advertising-id-card"
      class="tracking-transparency-card"
    >
      <text class="tracking-transparency-card-title">Advertising ID</text>
      <view class="tracking-transparency-result-box">
        <text
          testID="tracking-transparency-advertising-id-value"
          class="tracking-transparency-result-text"
        >
          {advertisingId ?? 'null'}
        </text>
      </view>
    </view>
  </ScrollView>
</safe-area-view>
