// `[(ngModel)]` on `<text-input>`, via `TextInputValueAccessor`: `registerOnChange` ->
// `Renderer2.listen('valueChange')` -> `routeProp`; `registerOnTouched` writes `onBlur` as a
// function prop, wrapped into a synchronous `detectChanges()` from inside the native dispatch.
import '@angular/compiler';
import {
  ChangeDetectorRef,
  Component,
  Directive,
  Input,
  QueryList,
  EventEmitter,
  Output,
  ViewChild,
  ViewChildren,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
  viewChildren,
  type AfterViewInit,
} from '@angular/core';
// NOT `@angular/common` — this package does not depend on it, so the legacy `*ngIf`/`[ngClass]`
// halves of the canary screen are out of headless reach here and the built-in control flow stands
// in for them.
import { FormsModule } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  childrenOf,
  isSymbioteNode,
  propsOf,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';
import { SYMBIOTE_ELEMENTS } from '../elements';
import { SymbioteHostPropsDirective } from '../primitives/shared';

const ROOT_TAG = 9487;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'ng-model-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule],
  // A plain field and a static `class`, which is exactly what the canary screen writes.
  template: `
    <text-input testID="probe" class="ti" [(ngModel)]="value"></text-input>
    <text testID="readout">{{ value }}</text>
  `,
})
class NgModelHost {
  value = 'edit me';
}

// The keystroke's flush is `detectChanges()` on the WHOLE screen view, synchronously, inside the
// native event dispatch — so every other binding on that screen re-runs on every character. This
// arm carries the shapes ApiPlaygroundScreen puts beside its `[(ngModel)]`, since a throw from any
// of them lands on the keystroke rather than on the screen that opened cleanly.
@Component({
  selector: 'ng-model-screen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule, SymbioteHostPropsDirective],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="pg-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class="hero-badge" [style]="heroBadgeStyle">
          <text class="hero-badge-text">AP</text>
        </view>
        @if (legacyVisible) {
          <text class="info-text">visible</text>
        }
        @for (tag of legacyTags; track tag) {
          <text class="list-row-text">{{ tag }}</text>
        }
        @switch (legacyMode) {
          @case ('a') {
            <text class="info-text">a</text>
          }
          @default {
            <text class="info-text">default</text>
          }
        }
        @for (row of attrDemoRows; track row) {
          <view [symbioteHostProps]="attrRowProps(row)" class="pg-row"></view>
        }
        <view
          [class.pg-hb-active]="styleDotActive"
          testID="pg-classdot"
          class="pg-swatch"
        ></view>
        <view
          [style.borderWidth.px]="styleDotActive ? 4 : 1"
          class="pg-swatch"
          testID="pg-styledot"
        ></view>
        <text-input
          testID="probe"
          placeholder="type here"
          class="text-input"
          [(ngModel)]="value"
        ></text-input>
        <text testID="readout">{{ value }}</text>
      </scroll-view>
    </safe-area-view>
  `,
})
class NgModelScreen {
  value = 'edit me';
  legacyVisible = true;
  legacyMode = 'a';
  styleDotActive = false;
  readonly legacyTags: readonly string[] = ['alpha', 'beta'];
  readonly attrDemoRows: readonly number[] = [0, 1, 2];
  readonly heroBadgeStyle = { backgroundColor: '#dd0031' };

  // A FRESH object per call, as the screen writes it: every flush re-runs this binding.
  attrRowProps(row: number): { testID: string } {
    return { testID: `pg-attr-row-${row}` };
  }
}

/** ApiPlaygroundScreen's `PlaygroundQueryItemDirective`, reduced to what the queries below need. */
@Directive({ selector: '[queryItem]', standalone: true, exportAs: 'queryItem' })
class QueryItemDirective {
  @Input() label = '';
}

// ApiPlaygroundScreen's reactive core, transplanted: two `effect()`s that WRITE signals the
// template reads, a custom-`equal` signal, a `linkedSignal`, both query flavours read through a
// getter, and an `ngAfterViewInit` that forces its own `detectChanges()`.
@Component({
  selector: 'effectful-screen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule, QueryItemDirective],
  template: `
    <view class="section">
      <text class="info-text">{{
        'effect log: ' + effectLog().join(' | ')
      }}</text>
      <text class="info-text">{{
        'point: ' + pointSignal().x + ' · updates: ' + pointUpdateCount()
      }}</text>
      <text class="info-text">{{
        'base: ' + linkedBase() + ' · linked: ' + linkedDerived()
      }}</text>
      <text class="info-text">{{ signalGuardReadout() }}</text>
      <view queryItem label="tile A" class="pg-swatch"></view>
      <view queryItem label="tile B" class="pg-swatch"></view>
      <text testID="queries" class="info-text">{{ queryReadout }}</text>
      <text-input
        testID="probe"
        class="text-input"
        [(ngModel)]="value"
      ></text-input>
      <text testID="readout">{{ value }}</text>
    </view>
  `,
})
class EffectfulScreen implements AfterViewInit {
  value = 'edit me';

  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly trackedPing = signal(0);
  readonly untrackedPing = signal(0);
  readonly effectLog = signal<string[]>([]);

  readonly pingEffectRef = effect(onCleanup => {
    const tracked = this.trackedPing();
    const silent = untracked(() => this.untrackedPing());
    this.effectLog.update(log => [
      ...log.slice(-4),
      `tracked=${tracked} untracked=${silent}`,
    ]);
    onCleanup(() => {});
  });

  readonly pointSignal = signal(
    { x: 0, y: 0 },
    { equal: (a, b) => a.x === b.x && a.y === b.y },
  );
  readonly pointUpdateCount = signal(0);
  private readonly pointEffectRef = effect(() => {
    this.pointSignal();
    untracked(() => this.pointUpdateCount.update(count => count + 1));
  });

  readonly linkedBase = signal(10);
  readonly linkedDerived = linkedSignal(() => this.linkedBase() * 2);

  readonly manualCounter = signal(0);
  readonly signalGuardReadout = computed(
    () => `counter=${this.manualCounter()}`,
  );

  @ViewChild(QueryItemDirective) private firstQueryItem?: QueryItemDirective;
  @ViewChildren(QueryItemDirective)
  private allQueryItems?: QueryList<QueryItemDirective>;
  readonly firstQueryItemSignal = viewChild(QueryItemDirective);
  readonly allQueryItemsSignal = viewChildren(QueryItemDirective);

  // A getter, re-read on every pass, mixing both query flavours — the canary's own shape.
  get queryReadout(): string {
    return (
      `decorator: ${this.allQueryItems?.length ?? 0} ` +
      `(first: ${this.firstQueryItem?.label ?? '—'}) · ` +
      `signal: ${this.allQueryItemsSignal().length} ` +
      `(first: ${this.firstQueryItemSignal()?.label ?? '—'})`
    );
  }

  ngAfterViewInit(): void {
    this.changeDetector.detectChanges();
  }
}

// ApiPlaygroundScreen's `PlaygroundLifecycleLogger`, reduced to the three hooks that fire on EVERY
// change-detection pass. Emitting from them is the whole point of that component — it exists to
// show a developer when each hook runs — and it is exactly the shape a real app writes by accident.
@Component({
  selector: 'lifecycle-logger',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view class="pg-lifecycle-box"></view>`,
})
class LifecycleLogger {
  @Output() readonly hookFired = new EventEmitter<string>();

  ngDoCheck(): void {
    this.hookFired.emit('ngDoCheck');
  }

  ngAfterContentChecked(): void {
    this.hookFired.emit('ngAfterContentChecked');
  }

  ngAfterViewChecked(): void {
    this.hookFired.emit('ngAfterViewChecked');
  }
}

// The parent writes a signal its own template reads, from a child hook that runs on every pass —
// so the view re-dirties itself forever. Angular's scheduler tolerates this; `detectChanges()`
// does not.
@Component({
  selector: 'self-dirtying-screen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule, LifecycleLogger],
  template: `
    <view class="section">
      <text class="info-text">{{ 'log: ' + lifecycleLog().join(' -> ') }}</text>
      <lifecycle-logger (hookFired)="onHookFired($event)"></lifecycle-logger>
      <text-input
        testID="probe"
        class="text-input"
        [(ngModel)]="value"
      ></text-input>
      <text testID="readout">{{ value }}</text>
    </view>
  `,
})
class SelfDirtyingScreen {
  value = 'edit me';
  readonly lifecycleLog = signal<string[]>([]);

  onHookFired(hookName: string): void {
    this.lifecycleLog.update(log => [...log.slice(-9), hookName]);
  }
}

// MOUNTED AS A CHILD, which is the device's shape and not a detail: `mount()` calls
// `appRef.tick()` directly, so a root that loops throws out of `mount` itself and the screen never
// appears. On device this screen is a ROUTE — it is first rendered by a SCHEDULER tick, which runs
// inside `ApplicationRef`'s own try/catch and hands NG0103 to `ErrorHandler`. That is why the
// canary renders, logs NG0103 quietly, and dies only on the keystroke.
const showScreen = signal(false);

@Component({
  selector: 'self-dirtying-root',
  standalone: true,
  imports: [SelfDirtyingScreen],
  template: `
    @if (showScreen()) {
      <self-dirtying-screen></self-dirtying-screen>
    }
  `,
})
class SelfDirtyingRoot {
  readonly showScreen = showScreen;
}

function readout(): string | undefined {
  const node = fabric.find(n => n.props.testID === 'readout');
  if (node === undefined) return undefined;
  const [rawText] = childrenOf(node.handle);
  if (rawText === undefined) return undefined;
  const text = propsOf(rawText).text;
  return typeof text === 'string' ? text : undefined;
}

@Component({
  selector: 'switch-ng-model-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule],
  template: `
    <switch testID="probe" [(ngModel)]="on"></switch>
    <text testID="readout">{{ on }}</text>
  `,
})
class SwitchNgModelHost {
  on = false;
}

function nodeFor(testID: string): ISymbioteNode {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  if (!isSymbioteNode(node.instanceHandle))
    throw new Error(`testID=${testID} is not a symbiote node`);
  return node.instanceHandle;
}

function handle(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('[(ngModel)] on a text-input tag', () => {
  // THE CONTROLLED HANDSHAKE, and `[(ngModel)]` is the one binding that can lose it. The behaviour's
  // `afterCommit` re-commands the native text whenever `props.value` and what native last reported
  // disagree — which is what makes a controlled input controlled. The synchronous flush exists so
  // the app's new value is ON THE NODE by then; @angular/forms writes its half through
  // `resolvedPromise.then` instead, so it lands a microtask LATER than the flush and the commit
  // reads the value from before the keystroke.
  //
  // Without this, the field snaps back to `edit me` after every character.
  it('does not command the pre-keystroke text back', async () => {
    mount(ROOT_TAG, NgModelHost);
    await tick();

    const before = fabric.commands.length;
    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'edit mex',
      eventCount: 1,
    });
    await tick();
    await tick();

    const commanded = fabric.commands
      .slice(before)
      .filter(entry => entry.commandName === 'setTextAndSelection')
      .map(entry => entry.args[1]);
    expect(commanded).not.toContain('edit me');
    expect(readout()).toBe('edit mex');
  });

  // The SWITCH twin, because the accessor is one base class and `<switch>` has the same shape of
  // read-back: `behaviors/switch.ts` snaps back on a `queueMicrotask` that reads `props.value`.
  it('does not snap a switch back after a toggle', async () => {
    mount(ROOT_TAG, SwitchNgModelHost);
    await tick();
    expect(readout()).toBe('false');

    fabric.fireEvent(handle('probe'), 'topChange', { value: true });
    await tick();
    await tick();

    expect(readout()).toBe('true');
    expect(propsOf(nodeFor('probe')).value).toBe(true);
  });

  it('carries a keystroke into the model and back onto the screen', async () => {
    mount(ROOT_TAG, NgModelHost);
    await tick();
    expect(readout()).toBe('edit me');

    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'edit mee',
      eventCount: 1,
    });
    await tick();
    await tick();

    expect(readout()).toBe('edit mee');
  });

  it('survives a keystroke on a screen whose flush re-runs every other binding', async () => {
    mount(ROOT_TAG, NgModelScreen);
    await tick();
    expect(readout()).toBe('edit me');

    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'edit mee',
      eventCount: 1,
    });
    await tick();
    await tick();

    expect(readout()).toBe('edit mee');
  });

  // The real gesture, in the real order. `registerOnTouched` writes `onBlur` as a FUNCTION PROP
  // the renderer wraps, so blur runs a synchronous `detectChanges()` from the native dispatch.
  it('survives focus, several keystrokes and blur in one gesture', async () => {
    mount(ROOT_TAG, NgModelScreen);
    await tick();

    const probe = handle('probe');
    fabric.fireEvent(probe, 'topFocus', {});
    await tick();

    let eventCount = 0;
    for (const text of ['edit mee', 'edit meee', 'edit me']) {
      eventCount += 1;
      fabric.fireEvent(probe, 'topChange', { text, eventCount });
      await tick();
      await tick();
      expect(readout()).toBe(text);
    }

    fabric.fireEvent(probe, 'topBlur', {});
    await tick();
    expect(readout()).toBe('edit me');
  });

  // THE DEVICE FAILURE, and it is not about the text input at all.
  //
  // `flushViewFor` is `ChangeDetectorRef.detectChanges()`, which is `detectChangesInViewWhileDirty`
  // — it re-runs the view while `requiresRefreshOrTraversal` holds and throws NG0103 after
  // MAXIMUM_REFRESH_RERUNS (upstream `instructions/change_detection.ts:102-128`). So a view that
  // RE-DIRTIES ITSELF on every pass cannot be flushed at all, and the keystroke is merely the first
  // thing on this screen that asks for a synchronous flush.
  it('flushes a screen whose own effects write signals the template reads', async () => {
    mount(ROOT_TAG, EffectfulScreen);
    await tick();

    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'typed',
      eventCount: 1,
    });
    await tick();
    await tick();

    expect(readout()).toBe('typed');
  });

  // THE DEVICE FAILURE. `PlaygroundLifecycleLogger` emits from `ngDoCheck`,
  // `ngAfterContentChecked` and `ngAfterViewChecked`; the parent's handler writes a signal its own
  // template reads. So the screen re-dirties itself on every pass, and the flush's
  // `detectChangesInViewWhileDirty` loop never terminates.
  //
  // THE CONTROL IS THE FIRST ASSERTION, and it is what makes this the ADAPTER's problem rather
  // than the screen's: Angular's own scheduler carries the same screen without complaint. A
  // keystroke must not be stricter than a tick.
  it('flushes a screen that re-dirties itself on every pass', async () => {
    showScreen.set(false);
    mount(ROOT_TAG, SelfDirtyingRoot);
    await tick();
    // Navigated to, as on device: rendered by a SCHEDULER tick rather than by `mount`.
    showScreen.set(true);
    await tick();
    await tick();
    expect(readout()).toBe('edit me');

    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'typed',
      eventCount: 1,
    });
    await tick();
    await tick();

    expect(readout()).toBe('typed');
  });
});
