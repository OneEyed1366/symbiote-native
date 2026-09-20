<script lang="ts">
  import { Screen, Stack } from '@symbiote-native/navigation/svelte';
  import MenuScreen from './MenuScreen.svelte';
  import DetailsScreen from './DetailsScreen.svelte';
  import './App.css';

  const screenOptions = {
    headerTranslucent: true,
    headerTintColor: '#ffffff',
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark' as const,
  };
</script>

<Stack initialRouteName="Menu">
  <Screen name="Menu" component={MenuScreen} options={{ title: 'Home', ...screenOptions }} />
  <Screen name="Details" component={DetailsScreen} options={{ title: 'Details', ...screenOptions }} />
</Stack>
