<script lang="ts">
  import { Screen, Stack } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import InnerDetailScreen from './InnerDetailScreen.svelte';
  import InnerRootScreen from './InnerRootScreen.svelte';
  import { useNestedPanel } from './nested-panel';
  import { innerStackStyleOf } from './nested-settings';

  const INNER_HEADER = {
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#13243a' },
    headerUserInterfaceStyle: 'dark',
  } as const;
  const rootOptions = { title: 'Inner stack', ...INNER_HEADER };
  const detailOptions = { title: 'Inner detail', ...INNER_HEADER };

  const panel = useNestedPanel();
</script>

<Stack nativeContainerStyle={innerStackStyleOf(panel.settings)}>
  <Screen name="InnerRoot" component={InnerRootScreen} options={rootOptions} />
  <Screen
    name="InnerDetail"
    component={InnerDetailScreen}
    options={detailOptions}
  />
</Stack>
