import type { IScrollViewProps } from '@symbiote-native/svelte';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { IAnimatedHostProps } from './animated-host-props';

export type IAnimatedScrollViewProps = IAnimatedHostProps<IScrollViewProps> & {
  // Receives the scroll position of this view
  scrollViewOffset?: SharedValue<number>;
};
