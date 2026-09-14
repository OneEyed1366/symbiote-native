// The three engine behaviors that READ BACK what the app did with an event, inside the same
// microtask turn. Zoneless change detection is a macrotask, so without the renderer's flush all
// three read the PRE-event value and undo the user. Mechanism: `./change-detection-flush`.
//
// THE ORACLE IS THE NATIVE COMMAND, NOT THE COMMITTED PAYLOAD. Every case below ends up committing
// the right value either way — Angular's own scheduled tick lands a macrotask later and fixes the
// props — so a payload assertion stays green while the user's text is already gone. What reaches
// the device is the command the behavior fires in between, off the stale value.
//
// Break-tested by making `withChangeDetection` return its listener unwrapped: all three go red,
// each naming its own command.
import '@angular/compiler';
import { ApplicationRef, Component, inject } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import './register';
import { mount, unmount } from './render';
import { SYMBIOTE_ELEMENTS } from './elements';

const ROOT_TAG = 9481;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'read-back-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  // Plain fields, not signals: the shape `examples/angular`'s canary writes, and the one that
  // depends entirely on the listener marking the view dirty.
  template: `
    <text-input testID="flush-input" [(value)]="text"></text-input>
    <switch testID="flush-switch" [(value)]="on"></switch>
    <!-- The same read-back, written as a flat-bag PROP rather than an event binding. It reaches
         the engine through SymbioteElement.wrapCallback, not the renderer's listen(), so it is the
         arm that witnesses that wrapper's flushViewFor half - markForCheck alone only SCHEDULES,
         and the behavior reads back this turn. -->
    <switch
      testID="flush-switch-prop"
      [value]="onProp"
      [onValueChange]="acceptProp"
    ></switch>
    <refresh-control
      testID="flush-refresh"
      [refreshing]="refreshing"
      (refresh)="refreshing = true"
    ></refresh-control>
  `,
})
class ReadBackHost implements OnDestroy {
  text = '';
  on = false;
  onProp = false;
  refreshing = false;

  acceptProp = (): void => {
    this.onProp = true;
  };

  // `afterTick` is what makes an app-wide tick unsafe here: the zoneless scheduler subscribes to it
  // and opens its microtask window, which is the NG0103 path. See the last case.
  ticks = 0;
  private readonly subscription = inject(ApplicationRef).afterTick.subscribe(
    () => {
      this.ticks += 1;
    },
  );

  constructor() {
    // Exposes the instance via the module-level `host` var so assertions outside Angular's own
    // injection can reach it.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}

let host: ReadBackHost | undefined;

function hostInstance(): ReadBackHost {
  if (host === undefined) throw new Error('the host component never mounted');
  return host;
}

interface ICommitted {
  props: Record<string, unknown>;
  children: ICommitted[];
  instanceHandle: unknown;
}

function committed(testID: string): ICommitted {
  const visit = (node: ICommitted): ICommitted | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const hit = visit(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const hit = visit(root as unknown as ICommitted);
    if (hit !== undefined) return hit;
  }
  throw new Error(`no committed node carrying testID="${testID}"`);
}

const commandNames = (): string[] => fabric.commands.map(c => c.commandName);

// Two turns: the commit the behavior asks for, then Angular's own scheduled tick. Every command
// this file guards against is fired inside the first one.
async function settle(): Promise<void> {
  await tick();
  await tick();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('an engine behavior reads the app value back, not the pre-event one', () => {
  it('never commands a text-input back to the text the user replaced', async () => {
    mount(ROOT_TAG, ReadBackHost);
    await tick();

    fabric.fireEvent(committed('flush-input').instanceHandle, 'topChange', {
      text: 'A',
      eventCount: 1,
    });
    await settle();

    expect(commandNames()).not.toContain('setTextAndSelection');
    expect(committed('flush-input').props.text).toBe('A');
  });

  it('never snaps a switch back off after the app accepted the toggle', async () => {
    mount(ROOT_TAG, ReadBackHost);
    await tick();

    fabric.fireEvent(committed('flush-switch').instanceHandle, 'topChange', {
      value: true,
    });
    await settle();

    expect(commandNames()).not.toContain('setValue');
    expect(committed('flush-switch').props.value).toBe(true);
  });

  it('never snaps a switch back when the handler came in as a prop', async () => {
    mount(ROOT_TAG, ReadBackHost);
    await tick();

    fabric.fireEvent(
      committed('flush-switch-prop').instanceHandle,
      'topChange',
      {
        value: true,
      },
    );
    await settle();

    expect(commandNames()).not.toContain('setValue');
    expect(committed('flush-switch-prop').props.value).toBe(true);
  });

  it('never stops a refresh the app accepted', async () => {
    mount(ROOT_TAG, ReadBackHost);
    await tick();

    fabric.fireEvent(
      committed('flush-refresh').instanceHandle,
      'topRefresh',
      {},
    );
    await settle();

    expect(commandNames()).not.toContain('setNativeRefreshing');
    expect(committed('flush-refresh').props.refreshing).toBe(true);
  });

  // THE SAFETY PROPERTY, and the reason this is `ChangeDetectorRef.detectChanges()` rather than
  // `ApplicationRef.tick()`. `tick()` emits `afterTick` unconditionally; the zoneless scheduler
  // subscribes to it and calls `switchToMicrotaskScheduler`, leaving `useMicrotaskScheduler` set
  // for the rest of the turn — and every notification raised in that window counts toward
  // NG0103's limit of 100, with no reset until one is raised outside it. `detectChanges()` calls
  // `detectChangesInternal` on one view and emits nothing (upstream `render3/view_ref.ts`).
  //
  // Counted SYNCHRONOUSLY across the event: the flush is synchronous, and Angular's own scheduled
  // tick is a macrotask away, so anything counted here came from the flush.
  it('re-checks the view without running a whole-application tick', async () => {
    mount(ROOT_TAG, ReadBackHost);
    await tick();
    const app = hostInstance();
    app.ticks = 0;

    fabric.fireEvent(committed('flush-switch').instanceHandle, 'topChange', {
      value: true,
    });

    expect(app.ticks).toBe(0);
    // The control: the app's own field moved, so a zero above is the scoping and not a dead
    // harness. Not the COMMITTED payload — a commit is a microtask away and this reads in the turn.
    expect(app.on).toBe(true);
  });
});
