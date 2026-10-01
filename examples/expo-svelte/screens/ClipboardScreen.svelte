<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
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
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  const lineColor = LINE_COLOR[lineInfo.line];

  const clipboardChange = useClipboard();
  let clipboardText = $state<string | null>(null);
  let hasString = $state<ICapabilityStatus>('checking');
  let clipboardUrl = $state<string | null>(null);
  let hasUrl = $state<ICapabilityStatus>('checking');
  let inputText = $state('');
  let urlText = $state('');

  // The change event carries only content types, so the text is re-read on every change
  $effect(() => {
    void clipboardChange.current;
    let isCurrent = true;
    void Promise.all([getStringAsync(), hasStringAsync()]).then(
      ([text, hasText]) => {
        if (isCurrent) {
          clipboardText = text;
          hasString = toCapabilityStatus(hasText);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  });

  // URL get/set/has exists on iOS only
  $effect(() => {
    void clipboardChange.current;
    if (Platform.OS !== 'ios') {
      return;
    }
    let isCurrent = true;
    void Promise.all([getUrlAsync(), hasUrlAsync()]).then(([url, hasUrlValue]) => {
      if (isCurrent) {
        clipboardUrl = url;
        hasUrl = toCapabilityStatus(hasUrlValue);
      }
    });
    return () => {
      isCurrent = false;
    };
  });

  function handleCopy(): void {
    void setStringAsync(inputText);
  }

  function handleSetUrl(): void {
    void setUrlAsync(urlText).then(() =>
      getUrlAsync().then(value => {
        clipboardUrl = value;
      }),
    );
  }
</script>

{#snippet capabilityRow(testID: string, label: string, status: ICapabilityStatus)}
  <view {testID} class="capability-row">
    <text class="capability-label">{label}</text>
    <view class={`status-badge status-badge-${status}`}>
      <text class="status-badge-text">{CAPABILITY_LABEL[status]}</text>
    </view>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
    testID="clipboard-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Clipboard</text>
        <text class="hero-body">
          Copy and paste from the app: write text or a link to the system
          clipboard, read it back and follow changes live. Copy something in
          another app to see the value below update on its own.
        </text>
      </view>
    </view>

    <Scenario
      testID="clipboard-scenario"
      title="Copy a promo code or an invite link with one tap"
      why="Copy buttons save users from selecting text by hand. Reading the clipboard lets the app offer to paste a code or a link the user just copied elsewhere."
      steps={[
        'Write some text and press copy',
        'Open another app and paste',
        'Copy something in another app and come back',
      ]}
      expect="The pasted text matches what you copied. The value card updates by itself when the clipboard changes outside the app."
    />

    <view testID="clipboard-value-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Current value</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">Clipboard text</text>
        <text class="value-text">
          {clipboardText === null ? 'checking…' : clipboardText || '(empty)'}
        </text>
      </view>
      {@render capabilityRow('clipboard-has-string', 'Has string', hasString)}
    </view>

    <view testID="clipboard-copy-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Copy text</text>
      </view>
      <text-input
        testID="clipboard-copy-input"
        value={inputText}
        onValueChange={event => {
          inputText = event.text;
        }}
        placeholder="Type something to copy"
        placeholderTextColor="#41506a"
        class="text-input"
      ></text-input>
      <ActionButton
        testID="clipboard-copy-button"
        title="Copy text"
        onPress={handleCopy}
        color={lineColor}
      />
    </view>

    {#if Platform.OS === 'ios'}
      <view testID="clipboard-url-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">URL (iOS only)</text>
        </view>
        <view class="capability-row">
          <text class="capability-label">Clipboard URL</text>
          <text class="value-text">
            {clipboardUrl === null ? 'checking…' : clipboardUrl || '(none)'}
          </text>
        </view>
        {@render capabilityRow('clipboard-has-url', 'Has URL', hasUrl)}
        <text-input
          testID="clipboard-url-input"
          value={urlText}
          onValueChange={event => {
            urlText = event.text;
          }}
          placeholder="https://example.com"
          placeholderTextColor="#41506a"
          class="text-input"
        ></text-input>
        <ActionButton
          testID="clipboard-set-url-button"
          title="Set URL"
          onPress={handleSetUrl}
          color={lineColor}
        />
      </view>
    {/if}
  </scroll-view>
</safe-area-view>
