import '@angular/compiler';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { firstResultOf } from './first-result';

let nextRootTag = 32_000;

// The scheduler of Angular runs on timers, so a test on fake time lets the clock move instead
async function letEffectsRun(): Promise<void> {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
    return;
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Runs `composable` in the constructor of a component under the Angular adapter, which is the
// injection context a primitive needs, and keeps what it returned
export async function renderComposable<Result>(composable: () => Result) {
  nextRootTag += 1;
  const rootTag = nextRootTag;
  const results: Result[] = [];

  // A selector of its own, as two hosts with one selector get the same component id
  @Component({
    selector: `composable-host-${rootTag}`,
    standalone: true,
    template: '',
  })
  class ComposableHost {
    constructor() {
      results.push(composable());
    }
  }

  mount(rootTag, ComposableHost);
  await letEffectsRun();

  return {
    result: (): Result => firstResultOf(results),
    unmount: (): void => unmount(rootTag),
  };
}
