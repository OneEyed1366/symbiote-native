<script lang="ts">
  // @symbiote-native/clipboard tour stop — a live value card (seeded via getStringAsync() on
  // mount, then refreshed on every useClipboard() change event — the event itself only carries the
  // changed content TYPES, not the string, see packages/clipboard/src/core/types.ts's
  // IClipboardEvent), a text input + setStringAsync "Copy text" card, a hasStringAsync() status
  // row, and an iOS-only URL get/set/has row. Svelte twin of
  // ../../expo-vue-sfc/screens/ClipboardScreen.vue.
  import { Platform, ScrollView } from '@symbiote-native/svelte';
  import type { ITextInputChangeEvent } from '@symbiote-native/svelte';
  import {
    getStringAsync,
    getUrlAsync,
    hasStringAsync,
    hasUrlAsync,
    setStringAsync,
    setUrlAsync,
    useClipboard,
  } from '@symbiote-native/clipboard/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  // Matches App.css's own muted input chrome — the placeholder color is a native prop, not a
  // stylesheet rule, so it cannot come from the `.text-input` class the way the rest does.
  const PLACEHOLDER_TEXT_COLOR = '#41506a';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function capabilityStatusText(status: ICapabilityStatus): string {
    if (status === 'checking') return 'CHECKING…';
    return status === 'yes' ? 'YES' : 'NO';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  const lineColor = LINE_COLOR[lineInfo.line];

  let clipboardText = $state('checking…');
  let hasString = $state<ICapabilityStatus>('checking');
  let inputText = $state('');

  function refreshClipboardString(): void {
    void getStringAsync().then(value => {
      clipboardText = value;
    });
    void hasStringAsync().then(value => {
      hasString = toCapabilityStatus(value);
    });
  }

  // Reads nothing reactive (both writes land in async continuations), so this is the Svelte
  // equivalent of Vue's onMounted — it runs exactly once.
  $effect(() => {
    refreshClipboardString();
  });

  // useClipboard() fires on every clipboard change (own writes included) — each firing re-reads
  // the string, since the event payload itself carries no content. Reading `.current` is what
  // subscribes this effect; the null guard makes the initial run a no-op, matching Vue's
  // non-immediate watch.
  const clipboardChange = useClipboard();
  $effect(() => {
    if (clipboardChange.current) refreshClipboardString();
  });

  function handleCopy(): void {
    void setStringAsync(inputText).then(refreshClipboardString);
  }

  let clipboardUrl = $state<string | null>(null);
  let hasUrl = $state<ICapabilityStatus>('checking');
  let urlInput = $state('https://symbiotenative.dev');

  function refreshUrlStatus(): void {
    void hasUrlAsync().then(value => {
      hasUrl = toCapabilityStatus(value);
    });
  }

  $effect(() => {
    if (Platform.OS === 'ios') {
      refreshUrlStatus();
    }
  });

  function handleGetUrl(): void {
    void getUrlAsync().then(value => {
      clipboardUrl = value;
    });
  }

  function handleSetUrl(): void {
    void setUrlAsync(urlInput).then(refreshUrlStatus);
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="clipboard-scroll"
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
        <text class="hero-title">Clipboard</text>
        <text class="hero-body">
          @symbiote-native/clipboard — read and write the system clipboard's
          text and URL content, plus a live change-listener composable.
        </text>
      </view>
    </view>
    <view testID="clipboard-value-card" class="clipboard-card">
      <text class="clipboard-card-title">Current value</text>
      <view class="clipboard-value-box">
        <text testID="clipboard-current-text" class="clipboard-value-text">
          {clipboardText || '(empty)'}
        </text>
      </view>
      <view class="clipboard-capability-row">
        <text class="clipboard-capability-label">Has text</text>
        <view
          class={`clipboard-status-badge clipboard-status-badge-${hasString}`}
        >
          <text class="clipboard-status-text">
            {capabilityStatusText(hasString)}
          </text>
        </view>
      </view>
    </view>
    <view testID="clipboard-copy-card" class="clipboard-card">
      <text class="clipboard-card-title">Copy text</text>
      <text-input
        testID="clipboard-input"
        value={inputText}
        onValueChange={(event: ITextInputChangeEvent) => (inputText = event.text)}
        placeholder="Type something to copy…"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        class="text-input"
      ></text-input>
      <ActionButton
        testID="clipboard-copy-button"
        title="Copy text"
        onPress={handleCopy}
        color={lineColor}
      />
    </view>
    {#if Platform.OS === 'ios'}<view
        testID="clipboard-url-card"
        class="clipboard-card"
      >
        <text class="clipboard-card-title">URL (iOS only)</text>
        <text-input
          testID="clipboard-url-input"
          value={urlInput}
          onValueChange={(event: ITextInputChangeEvent) => (urlInput = event.text)}
          placeholder="https://…"
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          class="text-input"
        ></text-input>
        <view class="button-row">
          <ActionButton
            testID="clipboard-set-url-button"
            title="Set URL"
            onPress={handleSetUrl}
            color={lineColor}
          />
          <ActionButton
            testID="clipboard-get-url-button"
            title="Get URL"
            onPress={handleGetUrl}
            color={lineColor}
          />
        </view>
        <view class="clipboard-capability-row">
          <text class="clipboard-capability-label">Has URL</text>
          <view
            class={`clipboard-status-badge clipboard-status-badge-${hasUrl}`}
          >
            <text class="clipboard-status-text">
              {capabilityStatusText(hasUrl)}
            </text>
          </view>
        </view>
        <text testID="clipboard-url-value" class="clipboard-value-text">
          {clipboardUrl ?? 'tap Get URL to read the clipboard'}
        </text>
      </view>{/if}
  </ScrollView>
</safe-area-view>
