// A second native screen, pushed onto the SAME RNSScreenStack every other screen lives in — proves
// push/pop, the native header (title from options, back button/back-title), and route.params
// round-tripping through the navigator handle. It has no menu row: the only way in is the deep
// link symbiotecanarysolid://details/:id that App.tsx's createLinkingIntegration resolves, so this
// screen is the DeepLinking stop's visible payoff.
//
// route() is CALLED, never destructured. useRoute() hands back an Accessor precisely because a
// Solid body runs once: navigation.setParams({...}) mints a new route object under the same key,
// and a `const { params } = route()` at body time would paint the params the screen was pushed
// with and then never move again — typechecking clean the whole way (the break the navigator's own
// "setParams reaches a mounted screen" test exists to catch).

import { createMemo } from 'solid-js';
import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import {
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/solid';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

export function DetailsScreen() {
  // Only ever mounted under a Stack, so useStackNavigation() narrows the handle union once, here.
  const route = useRoute();
  const navigation = useStackNavigation();

  const paramsLabel = createMemo(() => {
    const params = route().params;
    return typeof params === 'object' &&
      params !== null &&
      'openedFrom' in params
      ? String(params.openedFrom)
      : 'none';
  });

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <Text class="note-text">Navigation demo · Details screen</Text>
        <Text class="info-text">{`route.params: ${paramsLabel()}`}</Text>
        <Text class="info-text">{`canGoBack: ${navigation().canGoBack()}`}</Text>
        <ActionButton
          testID="nav-pop"
          title="← Pop back"
          onPress={() => navigation().pop()}
          color={LINE_COLOR.primitives}
        />
      </View>
    </SafeAreaView>
  );
}
