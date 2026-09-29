import {
  defineComponent,
  onMounted,
  onUnmounted,
  watch,
  type VNode,
} from '@vue/runtime-core';
import { useColorScheme } from '@symbiote-native/vue';
import {
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  type INavigationBarProps,
  type INavigationBarStackEntry,
} from '../core';

export const NavigationBar = defineComponent<INavigationBarProps>(
  props => {
    const colorScheme = useColorScheme();
    let stackEntry: INavigationBarStackEntry | null = null;

    onMounted(() => {
      stackEntry = pushStackEntry({ style: props.style, hidden: props.hidden });
    });

    onUnmounted(() => {
      if (stackEntry) popStackEntry(stackEntry);
    });

    watch([colorScheme, () => props.style, () => props.hidden], () => {
      if (stackEntry) {
        stackEntry = replaceStackEntry(stackEntry, {
          style: props.style,
          hidden: props.hidden,
        });
      }
    });

    return (): VNode | null => null;
  },
  { name: 'NavigationBar', props: ['style', 'hidden'] },
);
