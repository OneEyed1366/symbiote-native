// This Tab is rendered AS the content of a root-Stack screen (NestedNavigatorsScreen.tsx), so
// useNavigation() here resolves to the nested Tab's OWN handle, while getParent() walks exactly one
// hop up the NavigationScope chain to reach the ENCLOSING Stack's handle. Solid twin of
// examples/svelte/screens/NestedTabHomeScreen.svelte.

import { createMemo } from 'solid-js';
import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import { useNavigation } from '@symbiote-native/navigation/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Module scope: ROUTE_LINE_INFO is a frozen lookup and the route this screen belongs to never
// changes, so there is nothing here to keep reactive.
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];

export function NestedTabHomeScreen() {
  // An ACCESSOR — called at each use site, never destructured or snapshotted. `parent` is a memo
  // over it rather than a `const parent = navigation().getParent()`: this body runs ONCE, so a
  // plain const would pin the ancestor the screen first mounted under and keep answering with it
  // after a re-scope.
  const navigation = useNavigation();
  const parent = createMemo(() => navigation().getParent());
  const canPopParent = createMemo(() => {
    const current = parent();
    return current !== undefined && 'pop' in current;
  });

  function popParent(): void {
    const current = parent();
    if (current !== undefined && 'pop' in current) current.pop();
  }

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.structure }}
          >
            <Text class="hero-badge-text">NN</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Nested navigators</Text>
            <Text class="hero-body">
              A Tab navigator nested inside a Stack screen, reaching its
              parent's own navigation handle through getParent().
            </Text>
          </View>
        </View>
        <Text class="info-text">
          {`parent navigator reachable via getParent(): ${canPopParent() ? 'yes (Stack)' : 'no'}`}
        </Text>
        <ActionButton
          testID="nested-pop-parent"
          title="Pop parent Stack (via getParent)"
          onPress={popParent}
          color={LINE_COLOR.structure}
        />
      </View>
    </SafeAreaView>
  );
}
