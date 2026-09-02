// The THIRD way a pressed look arrives, and the one that makes a public primitive TAG possible: a
// FUNCTION `style`, resolved here at runtime instead of by a compiler.
//
// A lowering transform normally splits `style={({pressed}) => …}` at build time into `style` +
// `activeStyle` (that is what active-style-variant.test.ts covers). But a primitive exposed as a
// bare tag has no transform in front of it on three of the five adapters, so the callback arrives
// in `routeProp` intact. Before this existed the failure was silent and total: a function is not an
// `on*` name, so it misses `setEventListener`, lands in `setProp` as a function value, and
// `fabricProps` drops function props — the node committed with NO style at all.
//
// So the compile-time split is now an OPTIMIZATION and this is the mechanism, the same relationship
// `foldHostBag` has with the compile-time prop folds.
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  routeProp,
  setNodePressed,
  type ISymbioteNode,
} from '../index';

installFabric();
let nextRootTag = 8600;

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function slots(node: ISymbioteNode): unknown[] {
  const style = node.props.style;
  return Array.isArray(style) ? style : [];
}

afterEach(() => {
  clearGlobalStyles();
});

describe('runtime state-style resolution', () => {
  describe('Positive', () => {
    // why: this is the whole point — the resting half must reach the node as a plain object, not as
    // the callback. A committed function is the silent-blank-style failure this file exists for.
    it('resolves a function style to its resting half', () => {
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.6 : 1,
      }));
      mount(node);
      expect(slots(node)[1]).toEqual({ opacity: 1 });
    });

    // why: the pressed half has to be resolved EAGERLY at write time, not looked up on press — the
    // callback is gone by then in the lowered path, and both paths must behave alike.
    it('swaps to the pressed half and restores on release', () => {
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.6 : 1,
      }));
      mount(node);

      setNodePressed(node, true);
      expect(slots(node)[1]).toEqual({ opacity: 0.6 });

      setNodePressed(node, false);
      expect(slots(node)[1]).toEqual({ opacity: 1 });
    });

    // why: the contract is "pure in `pressed`", and it is only honest if the engine reads the
    // callback a bounded number of times. Twice per write — once per state — and never again on a
    // press, which is what makes a press cost no user code.
    it('invokes the callback exactly twice, and not again on press', () => {
      let calls = 0;
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => {
        calls += 1;
        return { opacity: pressed ? 0.6 : 1 };
      });
      mount(node);
      expect(calls).toBe(2);

      setNodePressed(node, true);
      setNodePressed(node, false);
      expect(calls).toBe(2);
    });

    // why: an update must re-resolve both halves, or a node keeps the first render's pressed look
    // forever — the shape that would make a themed button stop responding after a theme change.
    it('re-resolves both halves when the callback is replaced', () => {
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.6 : 1,
      }));
      mount(node);
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.2 : 0.9,
      }));

      expect(slots(node)[1]).toEqual({ opacity: 0.9 });
      setNodePressed(node, true);
      expect(slots(node)[1]).toEqual({ opacity: 0.2 });
    });
  });

  describe('Negative', () => {
    // why: switching from a callback to a plain object must not leave the derived pressed look
    // standing. This is the case the `activeStyleFromCallback` flag exists for, and without it the
    // node would press to a look nothing in the source mentions any more.
    it('drops the derived pressed half when style becomes a plain value', () => {
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.6 : 1,
      }));
      mount(node);
      routeProp(node, 'style', { opacity: 0.9 });

      setNodePressed(node, true);
      expect(slots(node)[1]).toEqual({ opacity: 0.9 });
    });

    // why: the mirror, and the reason the flag is a flag rather than a null check. A transform
    // writes `style` and `activeStyle` as INDEPENDENT props in an unspecified order, so a plain
    // `style` write must never clear a variant the transform supplied — only one we derived.
    it('keeps a transform-supplied activeStyle across a plain style write', () => {
      const node = createElement('RCTView');
      routeProp(node, 'activeStyle', { opacity: 0.5 });
      routeProp(node, 'style', { opacity: 1 });
      mount(node);

      setNodePressed(node, true);
      expect(slots(node)[1]).toEqual({ opacity: 0.5 });
    });

    // why: the MIXED sequence, and the one neither half of the flag covered on its own. A callback
    // sets the flag; a later explicit `activeStyle` replaces slot 1 but said nothing about the
    // flag, so a plain `style` arriving third read a flag that was no longer true of the slot's
    // contents and cleared a variant the engine never derived. Found by the Solid session against
    // the flag's own contract, 2026-09-01.
    //
    // Not reachable from a lowering transform — it either specialises into two plain writes or
    // refuses and keeps the component, so a callback and an explicit `activeStyle` never reach one
    // node from the same emission. A flat-bag adapter routing a `p={{…}}` bag key by key can carry
    // both, which is what makes it a latent hole rather than a dead branch.
    it('keeps an explicit activeStyle written AFTER a callback style', () => {
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.2 : 1,
      }));
      routeProp(node, 'activeStyle', { opacity: 0.5 });
      routeProp(node, 'style', { opacity: 1 });
      mount(node);

      setNodePressed(node, true);
      expect(slots(node)[1]).toEqual({ opacity: 0.5 });
    });

    // why: the committed payload is the only thing that ships. A callback reaching Fabric is
    // dropped by fabricProps with no error, so asserting on node.props alone would miss exactly the
    // failure this whole mechanism prevents.
    it('never commits the callback itself', () => {
      const node = createElement('RCTView');
      routeProp(node, 'style', ({ pressed }: { pressed: boolean }) => ({
        opacity: pressed ? 0.6 : 1,
      }));
      mount(node);
      for (const slot of slots(node)) {
        expect(typeof slot).not.toBe('function');
      }
    });
  });
});
