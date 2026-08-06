import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform, SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/vue';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEFAULT_URL = 'https://symbiote-native.dev';

/**
 * Web Browser demo: @symbiote-native/web-browser — the in-app browser
 * (SFSafariViewController on iOS, a Custom Tab on Android). The Custom Tabs service card below is
 * Android-only: getCustomTabsSupportingBrowsersAsync throws on iOS rather than resolving empty,
 * and warm-up/cool-down have nothing to talk to there.
 */
export const WebBrowserScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.WebBrowser];
    const lineColor = LINE_COLOR[lineInfo.line];
    const isAndroid = Platform.OS === 'android';

    const url = ref(DEFAULT_URL);
    const lastResult = ref('idle');
    const servicePackage: Ref<string | null> = ref(null);
    const supportingBrowsers = ref('not queried');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function handleOpen() {
      lastResult.value = 'opening…';
      openBrowserAsync(url.value, { toolbarColor: '#0b1622', controlsColor: lineColor })
        .then(result => {
          if (!isMounted) return;
          lastResult.value = `type: ${result.type}`;
        })
        .catch((error: Error) => {
          if (!isMounted) return;
          lastResult.value = `open failed: ${error.message}`;
        });
    }

    function handleDismiss() {
      dismissBrowser()
        .then(result => {
          if (!isMounted) return;
          lastResult.value = `dismissed, type: ${result.type}`;
        })
        .catch((error: Error) => {
          if (!isMounted) return;
          lastResult.value = `dismiss failed: ${error.message}`;
        });
    }

    function handleWarmUp() {
      warmUpAsync()
        .then(result => {
          if (!isMounted) return;
          servicePackage.value = result.servicePackage ?? null;
          lastResult.value = `warmed up: ${result.servicePackage ?? '(no service package)'}`;
        })
        .catch((error: Error) => {
          if (!isMounted) return;
          lastResult.value = `warm-up failed: ${error.message}`;
        });
    }

    function handleCoolDown() {
      coolDownAsync(servicePackage.value ?? undefined)
        .then(result => {
          if (!isMounted) return;
          servicePackage.value = null;
          lastResult.value = `cooled down: ${result.servicePackage ?? '(no service package)'}`;
        })
        .catch((error: Error) => {
          if (!isMounted) return;
          lastResult.value = `cool-down failed: ${error.message}`;
        });
    }

    function handleListBrowsers() {
      supportingBrowsers.value = 'querying…';
      getCustomTabsSupportingBrowsersAsync()
        .then(result => {
          if (!isMounted) return;
          supportingBrowsers.value =
            result.browserPackages.length === 0
              ? '(no supporting browser installed)'
              : result.browserPackages.join(', ');
        })
        .catch((error: Error) => {
          if (!isMounted) return;
          supportingBrowsers.value = `query failed: ${error.message}`;
        });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView
          testID="web-browser-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Web Browser</Text>
              <Text class="hero-body">
                @symbiote-native/web-browser — an in-app browser that keeps the user inside the
                app, unlike Linking.openURL handing them off to the system browser.
              </Text>
            </View>
          </View>

          <View testID="web-browser-open-card" class="web-browser-card">
            <Text class="web-browser-card-title">Open a page</Text>
            <TextInput
              testID="web-browser-url-input"
              value={url.value}
              onValueChange={(text: string) => {
                url.value = text;
              }}
              placeholder="https://example.com"
              placeholderTextColor="#41506a"
              class="text-input"
            />
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
            <Text class="web-browser-note">
              iOS resolves once the browser closes — cancel when the user dismissed it, dismiss
              when the Dismiss button did. Android resolves opened the moment the Custom Tab
              launches and never reports the close, and cannot be dismissed programmatically.
            </Text>
          </View>

          <View testID="web-browser-result-card" class="web-browser-card">
            <Text class="web-browser-card-title">Last result</Text>
            <View class="web-browser-row">
              <Text class="web-browser-row-label">Outcome</Text>
              <Text testID="web-browser-result" class="web-browser-value-text">
                {lastResult.value}
              </Text>
            </View>
          </View>

          {isAndroid && (
            <View testID="web-browser-service-card" class="web-browser-card">
              <Text class="web-browser-card-title">Custom Tabs service</Text>
              <View class="web-browser-row">
                <Text class="web-browser-row-label">Warmed service</Text>
                <Text testID="web-browser-service-package" class="web-browser-value-text">
                  {servicePackage.value === null ? '(none)' : servicePackage.value}
                </Text>
              </View>
              <View class="web-browser-row">
                <Text class="web-browser-row-label">Supporting browsers</Text>
                <Text testID="web-browser-supporting-browsers" class="web-browser-value-text">
                  {supportingBrowsers.value}
                </Text>
              </View>
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
              <ActionButton
                testID="web-browser-list-browsers-button"
                title="List supporting browsers"
                onPress={handleListBrowsers}
                color={lineColor}
              />
              <Text class="web-browser-note">
                Android only. getCustomTabsSupportingBrowsersAsync throws on iOS — its native stub
                is registered without the Async suffix, so the availability check fires before the
                empty-result branch is reached.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'WebBrowserScreen' },
);
