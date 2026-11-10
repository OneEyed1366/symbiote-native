import { Component, effect, Input, signal } from '@angular/core';
import type { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { overrideReducedMotion } from '../core/reduced-motion';

// Lets you overwrite the default reduce motion behavior for the whole app, while it stands
@Component({ selector: 'ReducedMotionConfig', standalone: true, template: '' })
export class ReducedMotionConfig {
  private readonly current = signal<ReduceMotion | undefined>(undefined);

  @Input({ required: true }) set mode(next: ReduceMotion) {
    this.current.set(next);
  }

  constructor() {
    effect(onCleanup => {
      const mode = this.current();
      if (mode !== undefined) onCleanup(overrideReducedMotion(mode));
    });
  }
}
