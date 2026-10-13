import { animatedModule } from '../core/animated-tag';
import { AnimatedFlatList } from './animated-flat-list';
import { AnimatedScrollView } from './animated-scroll-view';
import type { IAnimatedTags } from './animated-host-props';

// A template writes the tags by name, so `Animated.View` is for code that names a tag in a variable
const animated = animatedModule<
  IAnimatedTags,
  typeof AnimatedScrollView,
  typeof AnimatedFlatList
>(AnimatedScrollView, AnimatedFlatList);

export const { View, Text, Image, TextInput, ScrollView, FlatList } = animated;

export default animated.Animated;
