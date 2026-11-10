import { createMemo } from 'solid-js';
import {
  useRoute,
  useStackNavigation,
} from '@symbiote-native/navigation/solid';

// A panel keeps its state in the route params, the options resolver reads the same params
export function useRouteSettings<T extends object>(
  read: (params: unknown) => T,
) {
  const route = useRoute();
  const navigation = useStackNavigation();
  return {
    settings: createMemo(() => read(route().params)),
    update: (patch: Partial<T>) => navigation().setParams(patch),
    navigation,
  };
}
