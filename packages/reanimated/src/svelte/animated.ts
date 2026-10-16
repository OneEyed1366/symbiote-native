import { animatedModule } from '../core/animated-tag';
import AnimatedFlatList from './animated-flat-list.svelte';
import AnimatedScrollView from './animated-scroll-view.svelte';
import type { IAnimatedHostProps, IAnimatedTags } from './animated-host-props';

export type { IAnimatedHostProps };
export {
  createAnimatedComponent,
  createCSSAnimatedComponent,
} from '../core/animated-component';

const animated = animatedModule<
  IAnimatedTags,
  typeof AnimatedScrollView,
  typeof AnimatedFlatList
>(AnimatedScrollView, AnimatedFlatList);

export const { View, Text, Image, TextInput, ScrollView, FlatList } = animated;

export default animated.Animated;
