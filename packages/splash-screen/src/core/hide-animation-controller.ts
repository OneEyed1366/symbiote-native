import { dlog } from '@symbiote-native/engine';
import { hide } from './hide';
import { getHideAnimationConstants } from './native-module';
import type {
  IHideAnimationConfig,
  IHideAnimationConstants,
  IHideAnimationFailure,
} from './types';

type IReadinessState = {
  layoutReady: boolean;
  logoReady: boolean;
  brandReady: boolean;
  userReady: boolean;
  animate: () => void;
  onError: ((failure: IHideAnimationFailure) => void) | undefined;
  animateHasBeenCalled: boolean;
};

// Faithful port of react-native-bootsplash's useHideAnimation readiness gate (its
// src/index.ts): hide() fires exactly once, after layout + both images (if requested) +
// the caller all report ready, then the caller's own fade-out `animate()` runs. logoReady/
// brandReady are captured ONCE at construction (mirrors the original's useRef factory,
// evaluated only on first render) — a config that later drops its logo/brand source does
// NOT retroactively flip readiness back on, only updateConfig's animate/userReady do.
//
// DELIBERATE DIVERGENCE from upstream, one place only: upstream swallows a rejected hide() with a
// bare `.catch(() => {})`, which strands the app under a splash it can no longer dismiss (see
// maybeRunAnimate). We fail open and report instead. Everything else, the unguarded constants read
// included, stays a faithful port.
export class HideAnimationController {
  // Read once here rather than once per adapter: the values never change over a splash's lifetime.
  // Unguarded on purpose — a missing RNBootSplash is a build error that must stay loud, see
  // native-module.ts for the full reasoning before wrapping this in anything.
  readonly constants: IHideAnimationConstants;

  private readonly readiness: IReadinessState;

  // dlog is DEBUG-gated, so it is the developer's seam, not the report: config.onError is the
  // channel the app actually hears about this on.
  private readonly reportFailure = (failure: IHideAnimationFailure): void => {
    dlog(
      `splash-screen: hide animation degraded at "${failure.stage}": ${String(failure.error)}`,
    );
    this.readiness.onError?.(failure);
  };

  constructor(config: IHideAnimationConfig) {
    this.readiness = {
      layoutReady: false,
      logoReady: config.logo == null,
      brandReady: config.manifest.brand == null || config.brand == null,
      userReady: config.ready ?? true,
      animate: config.animate,
      onError: config.onError,
      animateHasBeenCalled: false,
    };
    this.constants = getHideAnimationConstants();
  }

  updateConfig(config: IHideAnimationConfig): void {
    this.readiness.animate = config.animate;
    this.readiness.onError = config.onError;
    this.readiness.userReady = config.ready ?? true;
    this.maybeRunAnimate();
  }

  readonly onContainerLayout = (): void => {
    this.readiness.layoutReady = true;
    this.maybeRunAnimate();
  };

  readonly onLogoLoadEnd = (): void => {
    this.readiness.logoReady = true;
    this.maybeRunAnimate();
  };

  readonly onBrandLoadEnd = (): void => {
    this.readiness.brandReady = true;
    this.maybeRunAnimate();
  };

  private maybeRunAnimate(): void {
    const state = this.readiness;

    if (
      state.layoutReady &&
      state.logoReady &&
      state.brandReady &&
      state.userReady &&
      !state.animateHasBeenCalled
    ) {
      state.animateHasBeenCalled = true;
      // Fail open. animateHasBeenCalled is already true by the time hide() settles, so the gate
      // is shut for good: on a rejection there is no readiness callback left that could retry,
      // and skipping animate() means the caller's splash overlay never fades out — the app sits
      // under it forever. Running animate() anyway costs at worst a fade over a native splash
      // that is still up; not running it costs the whole app.
      hide({ fade: false })
        .catch((error: unknown) => {
          this.reportFailure({ stage: 'hide', error });
        })
        .then(() => {
          state.animate();
        })
        .catch((error: unknown) => {
          // The caller's own animation throwing must not become an unhandled rejection either.
          this.reportFailure({ stage: 'animate', error });
        });
    }
  }
}
