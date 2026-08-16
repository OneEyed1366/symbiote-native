// Unit test for InteractionManager: pure JS, no native. We drive it
// over real 0ms macrotasks (the same setImmediate/setTimeout it schedules on).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let InteractionManager: typeof import('./index').InteractionManager;

beforeEach(async () => {
  vi.resetModules();
  ({ InteractionManager } = await import('./index'));
});

// Resolve on the next macrotask repeatedly, giving the manager's own next-tick scheduling
// room to fire and drain.
function nextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
  await nextTick();
}

describe('InteractionManager', () => {
  describe('runAfterInteractions (Positive)', () => {
    // why: this is the module's whole purpose -- a queued task runs on a later
    // tick, never synchronously, so it can't block the caller's own current frame.
    it('runs a plain-function task after the current tick when no handles are outstanding', async () => {
      let ran = false;
      InteractionManager.runAfterInteractions(() => {
        ran = true;
      });
      expect(ran).toBe(false);
      await settle();
      expect(ran).toBe(true);
    });

    // why: the object-task form with a sync `run` method (RN's ISimpleTask, used to
    // attach a `name` for debugging) must be invoked exactly like a plain function.
    it('runs an object task via its run() method', async () => {
      let ran = false;
      InteractionManager.runAfterInteractions({
        name: 'my-task',
        run: () => {
          ran = true;
        },
      });
      await settle();
      expect(ran).toBe(true);
    });

    // why: the async object-task form (`gen`) must be awaited -- the task isn't
    // "done" the instant gen() is called, only once its promise settles.
    it('runs an object task via its gen() method and awaits it', async () => {
      let ran = false;
      InteractionManager.runAfterInteractions({
        name: 'my-async-task',
        gen: async () => {
          await Promise.resolve();
          ran = true;
        },
      });
      await settle();
      expect(ran).toBe(true);
    });

    // why: `runAfterInteractions()` with no task at all is documented usage (e.g.
    // "wait until interactions settle" with no work attached) -- it must resolve
    // cleanly rather than reject or hang.
    it('resolves cleanly when called with no task', async () => {
      let resolved = false;
      InteractionManager.runAfterInteractions().then(() => {
        resolved = true;
      });
      await settle();
      expect(resolved).toBe(true);
    });

    // why: cancel() must be checked at RUN time, not at schedule time -- a task
    // cancelled before its tick arrives must never execute.
    it('cancel() prevents the task from running', async () => {
      let ran = false;
      const interaction = InteractionManager.runAfterInteractions(() => {
        ran = true;
      });
      interaction.cancel();
      await settle();
      expect(ran).toBe(false);
    });

    // why: a handle blocks the queue from draining until it clears -- this is the
    // entire mechanism animations use to keep JS work off their frames.
    it('defers a task while a handle is outstanding, until it clears', async () => {
      let ran = false;
      const handle = InteractionManager.createInteractionHandle();
      InteractionManager.runAfterInteractions(() => {
        ran = true;
      });
      await settle();
      expect(ran).toBe(false);

      InteractionManager.clearInteractionHandle(handle);
      await settle();
      expect(ran).toBe(true);
    });
  });

  describe('runAfterInteractions (Negative -- task failure)', () => {
    // why: a thrown plain-function task must reject the returned promise with the
    // real error, not swallow it or resolve as if nothing happened.
    it('rejects with the thrown error when a plain-function task throws', async () => {
      let error: unknown;
      InteractionManager.runAfterInteractions(() => {
        throw new Error('boom');
      }).then(
        () => {},
        (err: unknown) => {
          error = err;
        },
      );
      await settle();
      expect(error instanceof Error && error.message).toBe('boom');
    });

    // why: the same guarantee for the object-task `run` form -- a debug-named task
    // that throws must still surface the error through the promise.
    it('rejects with the thrown error when an object task run() throws', async () => {
      let error: unknown;
      InteractionManager.runAfterInteractions({
        name: 'failing-task',
        run: () => {
          throw new Error('run failed');
        },
      }).then(
        () => {},
        (err: unknown) => {
          error = err;
        },
      );
      await settle();
      expect(error instanceof Error && error.message).toBe('run failed');
    });

    // N/A: runTask's final branch (reject(new TypeError('...must have a gen or run
    // method.'))) guards a task object with neither `run` nor `gen`. ITask =
    // ISimpleTask | IPromiseTask | (() => void) -- constructing such a value would
    // fail TypeScript's structural check at the call site, so reaching this branch
    // from a type-safe caller requires an `as` cast, which is out of scope per this
    // task's rules. The branch is real defensive code for untyped JS callers, just
    // not exercisable through this module's own type contract -- left untested
    // rather than cast around.
  });

  describe('handle counting and events', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // why: RN's InteractionManager conflates any number of concurrent interactions
    // into a single "busy" state -- interactionStart must fire once on the 0->1
    // transition, NOT again on every additional handle, and interactionComplete
    // fires once only when the LAST handle clears (1->0), not on an intermediate clear.
    it('fires interactionStart/Complete only at the busy<->idle boundary, not on every handle', () => {
      let started = 0;
      let completed = 0;
      InteractionManager.addListener(InteractionManager.Events.interactionStart, () => {
        started += 1;
      });
      InteractionManager.addListener(InteractionManager.Events.interactionComplete, () => {
        completed += 1;
      });

      const first = InteractionManager.createInteractionHandle();
      const second = InteractionManager.createInteractionHandle();
      expect(started).toBe(1);

      InteractionManager.clearInteractionHandle(first);
      expect(completed).toBe(0);

      InteractionManager.clearInteractionHandle(second);
      expect(completed).toBe(1);
    });

    // why: the subscription returned by addListener must actually detach -- a
    // listener that already unsubscribed must not keep receiving events.
    it('addListener().remove() stops further notifications', () => {
      let started = 0;
      const sub = InteractionManager.addListener(InteractionManager.Events.interactionStart, () => {
        started += 1;
      });
      sub.remove();

      const handle = InteractionManager.createInteractionHandle();
      InteractionManager.clearInteractionHandle(handle);

      expect(started).toBe(0);
    });

    // why: `if (!handle) throw` guards a real usage bug -- calling clear with the
    // falsy handle 0/undefined (e.g. a caller that never captured the real handle)
    // must fail loudly rather than silently corrupt the outstanding count.
    it('clearInteractionHandle(0) throws', () => {
      expect(() => InteractionManager.clearInteractionHandle(0)).toThrow(
        'InteractionManager: Must provide a handle to clear.',
      );
    });

    // why: setDeadline's yield-mid-batch path is the reason InteractionManager
    // exists at all (letting touches interrupt a long task queue) -- with a real
    // positive deadline, a batch that overruns it must yield to the event loop
    // instead of draining the whole queue synchronously in one flush.
    it('setDeadline(> 0) yields to the event loop once a batch overruns it', async () => {
      const order: string[] = [];
      const nowSpy = vi.spyOn(Date, 'now');
      // startTime read, then the post-task-1 elapsed check reads 10ms later --
      // past the 5ms deadline, forcing a yield with task2/task3 still queued.
      // Once these two queued values are consumed, Date.now() falls through to
      // the real implementation for the resumed batch.
      nowSpy.mockReturnValueOnce(1_000_000).mockReturnValueOnce(1_000_010);

      InteractionManager.setDeadline(5);
      InteractionManager.runAfterInteractions(() => order.push('task1'));
      InteractionManager.runAfterInteractions(() => order.push('task2'));
      InteractionManager.runAfterInteractions(() => order.push('task3'));

      await nextTick();
      // Only the first batch (task1) ran before the deadline forced a yield.
      expect(order).toEqual(['task1']);

      await settle();
      // The resumed batch drains the rest.
      expect(order).toEqual(['task1', 'task2', 'task3']);
    });
  });
});
