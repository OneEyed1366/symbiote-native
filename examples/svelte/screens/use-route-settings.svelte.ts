import {
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/svelte';

// A panel keeps its state in the route params, the options resolver reads the same params
export function useRouteSettings<T extends object>(
  read: (params: unknown) => T,
) {
  const route = useRoute();
  const navigation = useStackNavigation();
  const settings = $derived(read(route.current.params));
  return {
    get settings() {
      return settings;
    },
    update: (patch: Partial<T>) => navigation.current.setParams(patch),
    navigation,
  };
}
