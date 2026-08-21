// Nested navigators demo: THIS screen's content is a whole Tab navigator (not a plain View),
// proving a navigator can be nested inside another navigator's screen. NestedTabHomeScreen's
// "Pop parent Stack" button proves useNavigation()().getParent() reaches back through the Tab's own
// scope to the enclosing root Stack and can drive it (pop this very screen off). Solid twin of
// examples/svelte/screens/NestedNavigatorsScreen.svelte.
//
// The two <Tab.Screen> markers register from their OWN bodies onto the collector this Tab publishes
// on context, exactly as the root Stack's do — the inner Tab captures them and the outer Stack does
// not, because there is one collector key and the owner chain shadows it (see
// packages/navigation/src/solid/nested-navigation.test.tsx).

import { Tab } from '@symbiote-native/navigation/solid';
import { NestedTabHomeScreen } from './NestedTabHomeScreen';
import { NestedTabInfoScreen } from './NestedTabInfoScreen';

export function NestedNavigatorsScreen() {
  return (
    <Tab initialRouteName="NestedHome">
      <Tab.Screen
        name="NestedHome"
        component={NestedTabHomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="NestedInfo"
        component={NestedTabInfoScreen}
        options={{ tabBarLabel: 'Info' }}
      />
    </Tab>
  );
}
