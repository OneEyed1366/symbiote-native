<script lang="ts">
  // Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
  // root via useLinkingIntegration (App.svelte) for real OS deep links — here resolveRouteFromUrl is
  // called directly against a typed-in URL so the resolution itself is provable inside the running
  // app without needing an actual OS-level deep link. Svelte twin of
  // examples/vue-sfc/screens/DeepLinkingScreen.vue.
  import { SafeAreaView, Text, TextInput, View } from '@symbiote-native/svelte';
  import { resolveRouteFromUrl } from '@symbiote-native/navigation';
  import ActionButton from '../components/ActionButton.svelte';
  import { APP_LINKING_CONFIG, SAMPLE_DEEP_LINK_URL } from '../navigation-linking';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const PLACEHOLDER_COLOR = '#8a8a8a';
  const JSON_INDENT = 2;

  let url = $state(SAMPLE_DEEP_LINK_URL);
  let resolved = $state<string | undefined>(undefined);

  function onResolve(): void {
    const route = resolveRouteFromUrl(APP_LINKING_CONFIG, url);
    resolved = JSON.stringify(route, null, JSON_INDENT);
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];
</script>

<SafeAreaView class="screen"
  ><View class="section"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: LINE_COLOR.routing }}
        ><Text class="hero-badge-text">DL</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Deep linking</Text
        ><Text class="hero-body">A typed URL resolved to a route through resolveRouteFromUrl, the same path a real deep link or push notification would take.</Text
      ></View
    ></View
    ><Text class="info-text">prefixes: symbiotecanarysvelte:// · https://canary.symbiote-native.dev</Text
    ><Text class="note-text">Details → details/:id · HeaderOptions → header-options · TabsDemo → tabs</Text
    ><TextInput
      testID="deep-link-input"
      value={url}
      onValueChange={next => (url = next)}
      placeholder="symbiotecanarysvelte://details/42"
      placeholderTextColor={PLACEHOLDER_COLOR}
      class="text-input"
    /><ActionButton
      testID="deep-link-resolve"
      title="Resolve"
      onPress={onResolve}
      color={LINE_COLOR.routing}
    /><View class="parity-list"
      ><Text testID="deep-link-result" class="list-row-text">{resolved ?? 'tap Resolve to see the parsed route'}</Text></View
    ></View
  ></SafeAreaView
>
