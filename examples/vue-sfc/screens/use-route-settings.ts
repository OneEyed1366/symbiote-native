import { computed } from 'vue';
import { useRoute, useStackNavigation } from '@symbiote-native/navigation/vue';

// A panel keeps its state in the route params, the options resolver reads the same params
export function useRouteSettings<T extends object>(
  read: (params: unknown) => T,
) {
  const route = useRoute();
  const navigation = useStackNavigation();
  return {
    settings: computed(() => read(route.value.params)),
    update: (patch: Partial<T>) => navigation.value.setParams(patch),
    navigation,
  };
}
