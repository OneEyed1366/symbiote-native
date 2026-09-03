// Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
// root via createLinkingIntegration (App.tsx) for real OS deep links — here resolveRouteFromUrl is
// called directly against a typed-in URL, so the resolution is provable inside the running app
// without needing an actual OS-level deep link. Resolving `details/42` prints the route the OS
// would push; firing the real link pushes DetailsScreen.
//
// resolveRouteFromUrl comes from the framework-agnostic root of @symbiote-native/navigation, not
// from /solid — it is a pure function over the config, owning no reactivity to wire.

import { createSignal } from 'solid-js';
import { SafeAreaView, Text, TextInput, View } from '@symbiote-native/solid';
import { resolveRouteFromUrl } from '@symbiote-native/navigation';
import { ActionButton } from '../components/ActionButton';
import {
  APP_LINKING_CONFIG,
  SAMPLE_DEEP_LINK_URL,
} from '../navigation-linking';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './DeepLinkingScreen.css';

const PLACEHOLDER_COLOR = '#5b678f';
const JSON_INDENT = 2;

export function DeepLinkingScreen() {
  const [url, setUrl] = createSignal(SAMPLE_DEEP_LINK_URL);
  const [resolved, setResolved] = createSignal<string | undefined>(undefined);

  const onResolve = (): void => {
    const route = resolveRouteFromUrl(APP_LINKING_CONFIG, url());
    setResolved(JSON.stringify(route, null, JSON_INDENT));
  };

  // A module constant indexed by a literal — nothing here to keep reactive.
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.routing }}
          >
            <Text class="hero-badge-text">DL</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Deep linking</Text>
            <Text class="hero-body">
              A typed URL resolved to a route through resolveRouteFromUrl, the
              same path a real deep link or push notification would take.
            </Text>
          </View>
        </View>
        <Text class="info-text">
          prefixes: symbiotecanarysolid:// · https://canary.symbiote-native.dev
        </Text>
        <Text class="note-text">
          Details → details/:id · HeaderOptions → header-options · TabsDemo →
          tabs
        </Text>
        <TextInput
          testID="deep-link-input"
          value={url()}
          onValueChange={next => setUrl(next)}
          placeholder="symbiotecanarysolid://details/42"
          placeholderTextColor={PLACEHOLDER_COLOR}
          autoCapitalize="none"
          autoCorrect={false}
          class="deep-link-field"
        />
        <ActionButton
          testID="deep-link-resolve"
          title="Resolve"
          onPress={onResolve}
          color={LINE_COLOR.routing}
        />
        <View class="deep-link-result">
          <Text testID="deep-link-result" class="deep-link-result-text">
            {resolved() ?? 'tap Resolve to see the parsed route'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
