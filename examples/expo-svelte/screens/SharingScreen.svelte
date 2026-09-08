<script lang="ts">
  // @symbiote-native/sharing tour stop — an isAvailableAsync capability row plus a share card
  // driving shareAsync against a file URI the user types in. Svelte twin of
  // ../../expo-vue-sfc/screens/SharingScreen.vue.
  import { ScrollView } from '@symbiote-native/svelte';
  import {
    isAvailableAsync,
    shareAsync,
  } from '@symbiote-native/sharing/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const PLACEHOLDER_COLOR = '#41506a';

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

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
  const lineColor = LINE_COLOR[lineInfo.line];

  let isAvailable = $state<ICapabilityStatus>('checking');
  let fileUri = $state('');
  let lastResult = $state('idle');

  $effect(() => {
    // Nothing reactive is read synchronously here, so the dependency set is empty and this runs
    // exactly once on mount — the twin of Vue's onMounted.
    void isAvailableAsync().then(available => {
      isAvailable = toCapabilityStatus(available);
    });
  });

  // The share sheet only accepts a real, readable local file — this canary ships no file-system
  // package to produce one, so the path comes from the input above and a bad one surfaces as the
  // native error message rather than a silent no-op.
  function handleShare(): void {
    lastResult = 'sharing…';
    void shareAsync(fileUri, { dialogTitle: 'Share the demo file' })
      .then(() => {
        lastResult = 'sheet dismissed';
      })
      .catch((error: Error) => {
        lastResult = `share failed: ${error.message}`;
      });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="sharing-scroll"
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
        <text class="hero-title">Sharing</text>
        <text class="hero-body">
          @symbiote-native/sharing — opens the platform share sheet for a local
          file. Outgoing only: it hands a file to another app, it does not
          receive one.
        </text>
      </view>
    </view>
    <view testID="sharing-capability-card" class="sharing-card">
      <text class="sharing-card-title">Capabilities</text>
      <view testID="sharing-available" class="sharing-row">
        <text class="sharing-row-label">Available</text>
        <view
          class={`sharing-status-badge sharing-status-badge-${isAvailable}`}
        >
          <text class="sharing-status-text">{toBadgeText(isAvailable)}</text>
        </view>
      </view>
      <text class="sharing-note">
        Reports on the native module, not on any device capability — it is true
        on every iOS and Android build.
      </text>
    </view>
    <view testID="sharing-share-card" class="sharing-card">
      <text class="sharing-card-title">Share a file</text>
      <text class="sharing-note">
        A real local file URI is required — something like
        file:///…/document.pdf that already exists and is readable. This app has
        no file-system package to create one, so type a path you know is there.
        Anything else comes back below as the native error.
      </text>
      <text-input
        testID="sharing-uri-input"
        value={fileUri}
        onValueChange={next => (fileUri = next)}
        placeholder="file:///path/to/file.pdf"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
        autoCapitalize="none"
        autoCorrect={false}
      ></text-input>
      <ActionButton
        testID="sharing-share-button"
        title="Share"
        onPress={handleShare}
        color={lineColor}
      />
      <view class="sharing-row">
        <text class="sharing-row-label">Last result</text>
        <text testID="sharing-result" class="sharing-value-text">
          {lastResult}
        </text>
      </view>
    </view>
  </ScrollView>
</safe-area-view>
