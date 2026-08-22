<script lang="ts">
  // @symbiote-native/clipboard tour stop — a live value card (seeded via getStringAsync() on
  // mount, then refreshed on every useClipboard() change event — the event itself only carries the
  // changed content TYPES, not the string, see packages/clipboard/src/core/types.ts's
  // IClipboardEvent), a text input + setStringAsync "Copy text" card, a hasStringAsync() status
  // row, and an iOS-only URL get/set/has row. Svelte twin of
  // ../../expo-vue-sfc/screens/ClipboardScreen.vue.
  import {
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    TextInput,
    View,
  } from '@symbiote-native/svelte';
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

<SafeAreaView class="screen">
  <ScrollView
    testID="clipboard-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View class="hero-badge" style={{ backgroundColor: lineColor }}>
        <Text class="hero-badge-text">{lineInfo.code}</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">Clipboard</Text>
        <Text class="hero-body">
          @symbiote-native/clipboard — read and write the system clipboard's
          text and URL content, plus a live change-listener composable.
        </Text>
      </View>
    </View>
    <View testID="clipboard-value-card" class="clipboard-card">
      <Text class="clipboard-card-title">Current value</Text>
      <View class="clipboard-value-box">
        <Text testID="clipboard-current-text" class="clipboard-value-text">
          {clipboardText || '(empty)'}
        </Text>
      </View>
      <View class="clipboard-capability-row">
        <Text class="clipboard-capability-label">Has text</Text>
        <View
          class={`clipboard-status-badge clipboard-status-badge-${hasString}`}
        >
          <Text class="clipboard-status-text">
            {capabilityStatusText(hasString)}
          </Text>
        </View>
      </View>
    </View>
    <View testID="clipboard-copy-card" class="clipboard-card">
      <Text class="clipboard-card-title">Copy text</Text>
      <TextInput
        testID="clipboard-input"
        value={inputText}
        onValueChange={next => (inputText = next)}
        placeholder="Type something to copy…"
        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
        class="text-input"
      />
      <ActionButton
        testID="clipboard-copy-button"
        title="Copy text"
        onPress={handleCopy}
        color={lineColor}
      />
    </View>{#if Platform.OS === 'ios'}<View
        testID="clipboard-url-card"
        class="clipboard-card"
      >
        <Text class="clipboard-card-title">URL (iOS only)</Text>
        <TextInput
          testID="clipboard-url-input"
          value={urlInput}
          onValueChange={next => (urlInput = next)}
          placeholder="https://…"
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          class="text-input"
        />
        <View class="button-row">
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
        </View>
        <View class="clipboard-capability-row">
          <Text class="clipboard-capability-label">Has URL</Text>
          <View
            class={`clipboard-status-badge clipboard-status-badge-${hasUrl}`}
          >
            <Text class="clipboard-status-text">
              {capabilityStatusText(hasUrl)}
            </Text>
          </View>
        </View>
        <Text testID="clipboard-url-value" class="clipboard-value-text">
          {clipboardUrl ?? 'tap Get URL to read the clipboard'}
        </Text>
      </View>{/if}
  </ScrollView>
</SafeAreaView>
