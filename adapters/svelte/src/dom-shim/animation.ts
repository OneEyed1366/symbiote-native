// `Element.animate()`, the subset `svelte/transition`/`svelte/animate` call: Svelte's own tick
// loop already bakes each frame's `css(t, u)` into the keyframe array, so this only replays them
// over real time (`.currentTime`/`.playState`/`.onfinish`/`.effect`/`.cancel()` contract).

import {
  isSymbioteNode,
  requestCommitFor,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { ShimElement } from './element';

export type IKeyframe = Readonly<Record<string, string>>;

export type IShimAnimation = {
  onfinish: (() => void) | null;
  effect: unknown;
  readonly playState: 'idle' | 'running' | 'finished';
  readonly currentTime: number;
  cancel(): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// `opacity` parses to a number, matching a real CSSStyleDeclaration read back; every other key
// (transform, filter, ...) passes through as the authored string.
function applyKeyframe(
  node: ISymbioteNode,
  style: unknown,
  frame: IKeyframe,
): void {
  const next: Record<string, unknown> = isRecord(style) ? { ...style } : {};
  for (const [key, value] of Object.entries(frame)) {
    next[key] = key === 'opacity' ? Number(value) : value;
  }
  routeProp(node, 'style', next);
  // Our own rAF loop, not a framework render - nothing else publishes this write per frame.
  requestCommitFor(node);
}

class ShimAnimation implements IShimAnimation {
  onfinish: (() => void) | null = null;
  effect: unknown = null;
  playState: 'idle' | 'running' | 'finished' = 'idle';
  private startTime: number | undefined = undefined;
  private rafId: number | undefined = undefined;
  private cancelled = false;

  constructor(
    private readonly node: ISymbioteNode | undefined,
    private readonly currentStyle: unknown,
    private readonly keyframes: readonly IKeyframe[],
    private readonly duration: number,
  ) {
    if (node === undefined || keyframes.length === 0 || duration <= 0) {
      this.playState = 'finished';
      // Guarded like `tick`: a same-tick `cancel()` (Svelte replacing this animation before the
      // microtask runs) must not fire a handler for a transition that never got to play.
      void Promise.resolve().then(() => {
        if (!this.cancelled) this.onfinish?.();
      });
      return;
    }
    this.playState = 'running';
    this.rafId = requestAnimationFrame(this.tick);
  }

  get currentTime(): number {
    return this.startTime === undefined ? 0 : Date.now() - this.startTime;
  }

  private tick = (now: number): void => {
    if (this.cancelled || this.node === undefined) return;
    this.startTime ??= now;
    const progress = Math.min((now - this.startTime) / this.duration, 1);
    const index = Math.round(progress * (this.keyframes.length - 1));
    const frame = this.keyframes[index];
    if (frame !== undefined) applyKeyframe(this.node, this.currentStyle, frame);
    if (progress >= 1) {
      this.playState = 'finished';
      this.onfinish?.();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  cancel(): void {
    this.cancelled = true;
    this.playState = 'idle';
    if (this.rafId !== undefined) cancelAnimationFrame(this.rafId);
  }
}

// A node not yet live plays no animation - the same shape Svelte's own dummy zero-duration
// animation already takes, so a caller sees a normal, already-finished Animation.
export function animateShimElement(
  element: ShimElement,
  keyframes: readonly IKeyframe[],
  duration: number,
): IShimAnimation {
  const node = element.engineNode;
  return new ShimAnimation(
    isSymbioteNode(node) ? node : undefined,
    element.p.style,
    keyframes,
    duration,
  );
}
