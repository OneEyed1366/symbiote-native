import { describe, expect, it, vi } from 'vitest';
import { workletOf } from '../../test-support/worklet';
import {
  createComposedEventHandler,
  createEventHandler,
  createHandlerState,
} from './event-handlers';

type IEvent = { eventName: string; x?: number };

function handlerOf(
  fn: (event: IEvent) => void,
  closure: unknown[] = [],
  hash = 1,
) {
  return workletOf(fn, closure, hash);
}

describe('the handler state of a hook', () => {
  it('reports changed dependencies the first time it sees the handlers', () => {
    const state = createHandlerState();

    const { doDependenciesDiffer } = state.observe({
      onScroll: handlerOf(() => undefined),
    });

    expect(doDependenciesDiffer).toBe(true);
  });

  it('reports unchanged dependencies for the same worklets once committed', () => {
    const state = createHandlerState();
    state.commit({ onScroll: handlerOf(() => undefined, [1], 5) });

    const next = state.observe({
      onScroll: handlerOf(() => undefined, [1], 5),
    });

    expect(next.doDependenciesDiffer).toBe(false);
  });

  it('reports changed dependencies when a closure value differs', () => {
    const state = createHandlerState();
    state.commit({ onScroll: handlerOf(() => undefined, [1], 5) });

    const next = state.observe({
      onScroll: handlerOf(() => undefined, [2], 5),
    });

    expect(next.doDependenciesDiffer).toBe(true);
  });

  it('hands out one shareable context, created on first use', () => {
    const state = createHandlerState();

    const first = state.observe({ a: handlerOf(() => undefined) }).context;
    const second = state.observe({ a: handlerOf(() => undefined) }).context;

    expect(first).toBe(second);
  });

  it('refuses a handler that is not a worklet', () => {
    const state = createHandlerState();

    expect(() => state.observe({ onScroll: () => undefined })).toThrow(
      /not worklets/,
    );
  });
});

describe('an event handler made by the controller', () => {
  it('keeps the worklet and the event names it was made with', () => {
    const worklet = handlerOf(() => undefined);

    const { workletEventHandler } = createEventHandler(worklet, ['onScroll']);

    expect(workletEventHandler.worklet).toBe(worklet);
    expect(workletEventHandler.eventNames).toEqual(['onScroll']);
  });

  it('is the same handler again unless it is asked to rebuild', () => {
    const controller = createEventHandler(
      handlerOf(() => undefined),
      ['a'],
    );

    const again = controller.refresh(
      handlerOf(() => undefined),
      ['b'],
      false,
    );

    expect(again.workletEventHandler).toBe(controller.workletEventHandler);
    expect(again.workletEventHandler.eventNames).toEqual(['a']);
  });

  it('takes the new worklet and names on the same handler when it rebuilds', () => {
    const controller = createEventHandler(
      handlerOf(() => undefined),
      ['a'],
    );
    const next = handlerOf(() => undefined, [], 2);

    const rebuilt = controller.refresh(next, ['b'], true);

    expect(rebuilt.workletEventHandler).toBe(controller.workletEventHandler);
    expect(rebuilt.workletEventHandler.worklet).toBe(next);
    expect(rebuilt.workletEventHandler.eventNames).toEqual(['b']);
  });
});

describe('handlers composed into one', () => {
  function built(
    eventName: string,
    run: (event: IEvent) => void,
    hash: number,
  ) {
    return createEventHandler(handlerOf(run, [], hash), [eventName]);
  }

  it('listens to every event name the handlers listen to', () => {
    const composed = createComposedEventHandler().compose([
      built('onScroll', () => undefined, 1),
      built('onBegin', () => undefined, 2),
    ]);

    expect(new Set(composed.workletEventHandler.eventNames)).toEqual(
      new Set(['onScroll', 'onBegin']),
    );
  });

  it('runs the worklets of each handler registered for the event that arrived', () => {
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();

    const composed = createComposedEventHandler().compose([
      built('onScroll', first, 1),
      built('onScroll', second, 2),
      built('onBegin', other, 3),
    ]);
    const event = { eventName: 'onScroll', x: 3 };
    composed.workletEventHandler.worklet(event);

    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);
    expect(other).not.toHaveBeenCalled();
  });

  it('skips a null entry', () => {
    const composed = createComposedEventHandler().compose([
      null,
      built('onScroll', () => undefined, 1),
    ]);

    expect(composed.workletEventHandler.eventNames).toEqual(['onScroll']);
  });

  it('keeps one event handler across composes and rebuilds it when a handler changed', () => {
    const composer = createComposedEventHandler();
    const first = composer.compose([built('onScroll', vi.fn(), 1)]);
    const firstWorklet = first.workletEventHandler.worklet;
    composer.commit();

    const unchanged = composer.compose([built('onScroll', vi.fn(), 1)]);
    composer.commit();
    const unchangedWorklet = unchanged.workletEventHandler.worklet;
    const changed = composer.compose([built('onScroll', vi.fn(), 2)]);

    expect(unchanged.workletEventHandler).toBe(first.workletEventHandler);
    expect(unchangedWorklet).toBe(firstWorklet);
    expect(changed.workletEventHandler).toBe(first.workletEventHandler);
    expect(changed.workletEventHandler.worklet).not.toBe(firstWorklet);
  });
});
