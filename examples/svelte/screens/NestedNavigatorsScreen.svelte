<script lang="ts" module>
  import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import {
    nestedOptionsOf,
    readNestedSettings,
  } from './nested/nested-settings';

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
</script>

<script lang="ts">
  import { Tab, TabScreen } from '@symbiote-native/navigation/svelte';
  import NestedInfoScreen from './nested/NestedInfoScreen.svelte';
  import NestedInnerStack from './nested/NestedInnerStack.svelte';
  import { provideNestedPanel } from './nested/nested-panel';
  import NestedScreens from './nested/NestedScreens.svelte';
  import { nestedTabOptionsOf } from './nested/nested-settings';
  import { useRouteSettings } from './use-route-settings.svelte';

  // The panel lives in the params of this route, the screen above both navigators owns it
  provideNestedPanel(useRouteSettings(readNestedSettings));
</script>

<Tab initialRouteName="NestedHome">
  <TabScreen
    name="NestedHome"
    component={NestedScreens}
    options={nestedTabOptionsOf('NestedHome')}
  />
  <TabScreen
    name="NestedInner"
    component={NestedInnerStack}
    options={nestedTabOptionsOf('NestedInner')}
  />
  <TabScreen
    name="NestedInfo"
    component={NestedInfoScreen}
    options={nestedTabOptionsOf('NestedInfo')}
  />
</Tab>
