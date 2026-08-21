// The Animated tab. Its own ScrollView, like every other tab — the demos are taller than a phone
// and the freeze button sits below the dots it is meant to be watched against.

import { ScrollView } from '@symbiote-native/solid';
import { AnimatedDemo } from '../components/AnimatedDemo';
import { AnimatedParityDemo } from '../components/AnimatedParityDemo';

export function AnimatedScreen() {
  return (
    <ScrollView class="scroll" contentContainerStyle="content">
      <AnimatedDemo />
      <AnimatedParityDemo />
    </ScrollView>
  );
}
