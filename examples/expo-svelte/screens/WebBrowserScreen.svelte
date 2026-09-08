<script lang="ts">
  // @symbiote-native/web-browser tour stop — opens the in-app browser (SFSafariViewController on
  // iOS, a Custom Tab on Android) for a URL typed above, reports the result type it resolves with,
  // and exposes the Android-only Custom Tabs service trio behind a Platform guard. Svelte twin of
  // ../../expo-vue-sfc/screens/WebBrowserScreen.vue.
  import { Platform, ScrollView } from '@symbiote-native/svelte';
  import {
    coolDownAsync,
    dismissBrowser,
    getCustomTabsSupportingBrowsersAsync,
    openBrowserAsync,
    warmUpAsync,
  } from '@symbiote-native/web-browser/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const PLACEHOLDER_COLOR = '#41506a';
  const BROWSER_PACKAGE_SEPARATOR = ', ';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.WebBrowser];
  const lineColor = LINE_COLOR[lineInfo.line];

  let url = $state('https://symbiote-native.dev');
  let lastResult = $state('idle');
  let servicePackage = $state<string | null>(null);
  let supportingBrowsers = $state<string | null>(null);

  function handleOpen(): void {
    lastResult = 'opening…';
    void openBrowserAsync(url)
      .then(result => {
        lastResult = `result: ${result.type}`;
      })
      .catch((error: Error) => {
        lastResult = `open failed: ${error.message}`;
      });
  }

  // iOS only — a Custom Tab cannot be closed programmatically, so this rejects on Android. It also
  // rejects on iOS with no browser presented, which is the state this screen is in whenever the
  // button is reachable; the rejection is the demo.
  function handleDismiss(): void {
    void dismissBrowser()
      .then(result => {
        lastResult = `dismissed: ${result.type}`;
      })
      .catch((error: Error) => {
        lastResult = `dismiss failed: ${error.message}`;
      });
  }

  // getCustomTabsSupportingBrowsersAsync throws on iOS rather than resolving empty (its native stub
  // is registered without the Async suffix), so every call below stays behind the Android branch.
  function handleListBrowsers(): void {
    supportingBrowsers = 'listing…';
    void getCustomTabsSupportingBrowsersAsync()
      .then(result => {
        supportingBrowsers =
          result.browserPackages.length === 0
            ? '(no supporting browser installed)'
            : result.browserPackages.join(BROWSER_PACKAGE_SEPARATOR);
      })
      .catch((error: Error) => {
        supportingBrowsers = `failed: ${error.message}`;
      });
  }

  function handleWarmUp(): void {
    void warmUpAsync()
      .then(result => {
        servicePackage = result.servicePackage ?? '(none)';
        lastResult = 'warmed up';
      })
      .catch((error: Error) => {
        lastResult = `warm-up failed: ${error.message}`;
      });
  }

  function handleCoolDown(): void {
    void coolDownAsync()
      .then(() => {
        servicePackage = null;
        lastResult = 'cooled down';
      })
      .catch((error: Error) => {
        lastResult = `cool-down failed: ${error.message}`;
      });
  }
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="web-browser-scroll"
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
        <text class="hero-title">Web Browser</text>
        <text class="hero-body">
          @symbiote-native/web-browser — an in-app browser that keeps the user
          inside the app, unlike Linking.openURL, plus the OAuth auth session
          built on it.
        </text>
      </view>
    </view>
    <view testID="web-browser-open-card" class="web-browser-card">
      <text class="web-browser-card-title">Open a page</text>
      <text-input
        testID="web-browser-url-input"
        value={url}
        onValueChange={next => (url = next)}
        placeholder="https://example.com"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
        autoCapitalize="none"
        autoCorrect={false}
      ></text-input>
      <ActionButton
        testID="web-browser-open-button"
        title="Open"
        onPress={handleOpen}
        color={lineColor}
      />
      <ActionButton
        testID="web-browser-dismiss-button"
        title="Dismiss"
        onPress={handleDismiss}
        color={lineColor}
      />
      <view class="web-browser-row">
        <text class="web-browser-row-label">Last result</text>
        <text testID="web-browser-result" class="web-browser-value-text">
          {lastResult}
        </text>
      </view>
      <text class="web-browser-note">
        iOS resolves once the browser closes (cancel, or dismiss when closed
        from code); Android resolves opened as soon as the Custom Tab launches
        and never reports the close. Dismiss is iOS-only.
      </text>
    </view>
    {#if Platform.OS === 'android'}<view
        testID="web-browser-custom-tabs-card"
        class="web-browser-card"
      >
        <text class="web-browser-card-title">Custom Tabs service</text>
        <ActionButton
          testID="web-browser-list-browsers-button"
          title="List supporting browsers"
          onPress={handleListBrowsers}
          color={lineColor}
        />
        <view class="web-browser-row">
          <text class="web-browser-row-label">Browsers</text>
          <text testID="web-browser-browsers" class="web-browser-value-text">
            {supportingBrowsers ?? '(not queried)'}
          </text>
        </view>
        <ActionButton
          testID="web-browser-warm-up-button"
          title="Warm up"
          onPress={handleWarmUp}
          color={lineColor}
        />
        <ActionButton
          testID="web-browser-cool-down-button"
          title="Cool down"
          onPress={handleCoolDown}
          color={lineColor}
        />
        <view class="web-browser-row">
          <text class="web-browser-row-label">Service package</text>
          <text
            testID="web-browser-service-package"
            class="web-browser-value-text"
          >
            {servicePackage ?? '(not warmed up)'}
          </text>
        </view>
        <text class="web-browser-note">
          Android only. Listing the browsers throws on iOS, so this whole card
          is behind a Platform.OS check.
        </text>
      </view>{/if}
  </ScrollView>
</safe-area-view>
