<script lang="ts">
  // A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives in —
  // proves push/pop, the native header (title from options, back button/back-title), and
  // route.params round-tripping through the navigator handle. Svelte twin of
  // examples/vue-sfc/screens/DetailsScreen.vue.
  import { SafeAreaView, Text, View } from '@symbiote-native/svelte';
  import { useRoute, useStackNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { LINE_COLOR } from '../navigation-lines';

  // This screen is only ever mounted under a Stack, so useStackNavigation() hands back the
  // Stack-specific handle (pop/canGoBack/…) directly — no union narrowing. useRoute() reads the
  // current route off the navigation scope on the context.
  const route = useRoute();
  const navigation = useStackNavigation();

  const paramsLabel = $derived.by<string>(() => {
    const params = route.current.params;
    return typeof params === 'object' && params !== null && 'openedFrom' in params
      ? String(params.openedFrom)
      : 'none';
  });
</script>

<SafeAreaView class="screen"
  ><View class="section"
    ><Text class="section-label">Navigation demo · Details screen</Text
    ><Text class="info-text">{`route.params: ${paramsLabel}`}</Text
    ><Text class="info-text">{`canGoBack: ${navigation.current.canGoBack()}`}</Text
    ><ActionButton
      testID="nav-pop"
      title="← Pop back"
      onPress={() => navigation.current.pop()}
      color={LINE_COLOR.primitives}
    /></View
  ></SafeAreaView
>
