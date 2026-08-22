import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  type Signal,
} from '@angular/core';
import {
  computeHideAnimationStyles,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../../core';

// Angular twin of React's `useHideAnimation` hook and Vue's `useHideAnimation` composable.
// Angular has no per-instance hook, so `connect()` stands in for it: call it ONCE (typically
// from a component's field initializer, inside an injection context) with a GETTER so it can
// keep reading the caller's own signals — same reason Vue's composable takes a getter too.
//
//   readonly hideAnimation = inject(HideAnimationService).connect(() => this.config());
//   // template: [style]="hideAnimation().container.style", (layout)="..." etc.
@Injectable({ providedIn: 'root' })
export class HideAnimationService {
  // Captured in the constructor (always run inside an injection context by Angular's own DI)
  // so `connect()` can create an `effect()` even when called from field-initializer code that
  // isn't itself an active injection context — mirrors create-tunnel.ts's `TunnelOut`.
  private readonly injector = inject(Injector);

  // The controller reads the native constants in its constructor, so a missing RNBootSplash
  // throws out of connect() and aborts the host component's construction — deliberately: that
  // is a build error, and a splash quietly stuck in light mode would ship unnoticed.
  connect(getConfig: () => IHideAnimationConfig): Signal<IHideAnimationResult> {
    const controller = new HideAnimationController(getConfig());

    effect(() => controller.updateConfig(getConfig()), {
      injector: this.injector,
    });

    return computed(() =>
      computeHideAnimationStyles(getConfig(), controller.constants, controller),
    );
  }
}
