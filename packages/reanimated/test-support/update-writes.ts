import { vi } from 'vitest';
import type { updateProps } from 'react-native-reanimated/src/updateProps';

export type IUpdateWrite = {
  views: unknown[];
  updates: unknown;
  isAnimatedProps: boolean | undefined;
};

// What each write of the UI side reached, read when it happened: the views are a live shared value
export function recordUpdateWrites(
  mocked: typeof updateProps,
  writes: IUpdateWrite[],
): void {
  writes.length = 0;
  vi.mocked(mocked).mockImplementation((views, updates, isAnimatedProps) => {
    writes.push({ views: [...(views.value ?? [])], updates, isAnimatedProps });
  });
}
