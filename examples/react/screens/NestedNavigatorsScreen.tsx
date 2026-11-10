import { Tab } from '@symbiote-native/navigation/react';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/react';
import { LINE_COLOR } from '../navigation-lines';
import {
  NestedHomeScreen,
  NestedInfoScreen,
  NestedInnerStack,
} from './nested/NestedScreens';
import { NestedPanelContext } from './nested/nested-panel';
import {
  nestedOptionsOf,
  nestedTabOptionsOf,
  readNestedSettings,
} from './nested/nested-settings';
import { useRouteSettings } from './use-route-settings';

// Opaque, so the bar of the parent and the bar of the inner stack read as two bars
export const nestedNavigatorsScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Nested Navigators',
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  ...nestedOptionsOf(readNestedSettings(route.params)),
});

// The panel lives in the params of this route, the screen above both navigators owns it
export function NestedNavigatorsScreen() {
  const { settings, update } = useRouteSettings(readNestedSettings);
  return (
    <NestedPanelContext.Provider value={{ settings, update }}>
      <Tab initialRouteName="NestedHome">
        <Tab.Screen
          name="NestedHome"
          component={NestedHomeScreen}
          options={nestedTabOptionsOf('NestedHome')}
        />
        <Tab.Screen
          name="NestedInner"
          component={NestedInnerStack}
          options={nestedTabOptionsOf('NestedInner')}
        />
        <Tab.Screen
          name="NestedInfo"
          component={NestedInfoScreen}
          options={nestedTabOptionsOf('NestedInfo')}
        />
      </Tab>
    </NestedPanelContext.Provider>
  );
}
