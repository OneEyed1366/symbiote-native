import { vi } from 'vitest';

// The native calls of the CSS manager, every one recorded and none reaching a module
export function createCssProxyMock() {
  return {
    setViewStyle: vi.fn(),
    setCSSEventHandler: vi.fn(),
    markNodeAsRemovable: vi.fn(),
    unmarkNodeAsRemovable: vi.fn(),
    registerCSSKeyframes: vi.fn(),
    unregisterCSSKeyframes: vi.fn(),
    applyCSSAnimations: vi.fn(),
    unregisterCSSAnimations: vi.fn(),
    runCSSTransition: vi.fn(),
    unregisterCSSTransition: vi.fn(),
    registerPseudoStyles: vi.fn(),
    unregisterPseudoStyles: vi.fn(),
  };
}
