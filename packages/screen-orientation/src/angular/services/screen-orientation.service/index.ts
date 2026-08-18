import {
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import {
  addOrientationChangeListener,
  getOrientationAsync,
  getOrientationLockAsync,
  Orientation,
  OrientationLock,
  type ScreenOrientationState,
} from '../../../core';

// Angular twin of React's `useScreenOrientation` hook and Vue's `useScreenOrientation`
// composable.
//
//   readonly screenOrientation = inject(ScreenOrientationService).connect();
//   // template: {{ screenOrientation().orientation }}
@Injectable({ providedIn: 'root' })
export class ScreenOrientationService {
  private readonly injector = inject(Injector);

  connect(): Signal<ScreenOrientationState> {
    const screenOrientation = signal<ScreenOrientationState>({
      orientation: Orientation.UNKNOWN,
      orientationLock: OrientationLock.UNKNOWN,
    });

    effect(
      onCleanup => {
        Promise.all([getOrientationAsync(), getOrientationLockAsync()]).then(
          ([orientation, orientationLock]) =>
            screenOrientation.set({ orientation, orientationLock }),
        );
        const subscription = addOrientationChangeListener(event =>
          screenOrientation.set({
            orientation: event.orientationInfo.orientation,
            orientationLock: event.orientationLock,
          }),
        );
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return screenOrientation.asReadonly();
  }
}
