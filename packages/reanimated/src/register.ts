// Imported bare and never re-exported from a barrel: Metro's inline requires would otherwise drop a
// module nothing names as a value, and the claims would never be made in a release build
import {
  claimAnimatedPropsHandles,
  claimAnimatedStyleHandles,
} from './core/handle-binding';
import { claimCssStyle } from './core/css-binding';
import { claimEventHandlerProps } from './core/event-binding';
import { claimLayoutAnimationProps } from './core/layout-animations';
import { claimSharedTransitionProps } from './core/shared-transitions';

claimAnimatedStyleHandles();
claimAnimatedPropsHandles();
claimEventHandlerProps();
claimLayoutAnimationProps();
claimSharedTransitionProps();
claimCssStyle();
