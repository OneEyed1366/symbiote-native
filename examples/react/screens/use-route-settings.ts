import {
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/react';

// A panel keeps its state in the route params, the options resolver reads the same params
export function useRouteSettings<T extends object>(
  read: (params: unknown) => T,
) {
  const route = useRoute();
  const navigation = useStackNavigation();
  return {
    settings: read(route.params),
    update: (patch: Partial<T>) => navigation.setParams(patch),
    navigation,
  };
}
