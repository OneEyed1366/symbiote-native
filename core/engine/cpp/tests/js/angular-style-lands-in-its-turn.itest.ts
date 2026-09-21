// WHICH COMMIT an Angular `[style]` change lands in, asked of the REAL pipeline.
//
// The renderer holds a styling run: Angular's `ɵɵstyleMap` delivers one key per `setStyle`, so the
// keys are accumulated and RN's one `style` prop is written once, when anything else happens —
// `registerBeforeFlush` being the guarantee that "anything else" includes the commit.
//
// THE BENCH ARM AND THE VITEST SUITE DISAGREED ABOUT WHETHER THAT WORKS, which is what this file is
// for. `adapters/angular/src/renderer/styling-coalesces.test.ts` asserts the update reaches its own
// commit and passes; the eight-step arm reported `select` with `setProps=0` and the row's clone
// turning up two steps later, in `remove`. One of those readings is an artifact and a wall-clock
// number cannot say which — the recording host is not this pipeline, and the arm's per-step line is
// telemetry read after the fact rather than a claim about a particular commit.
//
// `readCommitProfile` settles it, because it COUNTS rather than describes: one commit and one prop
// write for one style change is the claim, and a second commit is precisely what "the write missed
// its own turn and had to be chased out later" looks like.
//
// TWO INSTRUMENTS WERE TRIED FIRST AND BOTH ANSWER A DIFFERENT QUESTION, which is worth recording
// because they read as if they answer this one. `readSurfaceTelemetry` reports the CURRENT revision,
// so a step whose commit did nothing shows the previous commit's numbers — that is the whole of why
// the bench arm's `select` line read `setProps=0`. And `mountingLogs()` is reset per commit rather
// than accumulated, so it describes only the LAST commit of a turn; a turn that ends with an empty
// commit reports an empty log however much the one before it did.

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { mount, unmount } from '@symbiote-native/angular';
import { readCommitProfile } from '@symbiote-native/engine';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';

const ROOT_TAG = 1;

const flush = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
  });

let host: StyleTurnHost | undefined;

// A BARE TAG with no element directive imported, because that is the only shape that reaches
// Angular's own styling engine — a matched `SymbioteElement` declares `style` as an `@Input()` and
// the binding arrives whole at `setProperty`, which was never the subject.
@Component({
  selector: 'style-turn-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view testID="probe" [style]="style()"></view>`,
})
class StyleTurnHost {
  readonly style = signal<Record<string, unknown>>({
    height: 44,
    paddingLeft: 10,
  });
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

function drive(): StyleTurnHost {
  if (host === undefined) throw new Error('the host was never mounted');
  return host;
}

describe('an angular style change on the real pipeline', () => {
  // why: THE WHOLE QUESTION. A held run that the commit does not close paints the old style for a
  // frame and surfaces in whatever turn happens to write a prop next — which on the bench arm would
  // be two steps later. The differ's log is the only witness that names the commit.
  it('reaches the platform in the turn that made it', async () => {
    mount(ROOT_TAG, StyleTurnHost);
    await flush();
    flushTimers();
    await flush();

    // `getDebugProps` reports values as STRINGS — it is RN's own introspection, not our payload.
    const before = findByTestId('probe');
    expect(before?.props.height).toBe('44');

    // Zeroes the window, so what follows is this turn's alone.
    readCommitProfile();

    // TWO keys move, which is what makes this case discriminate. A one-key update costs one write
    // whether the run is coalesced or published per key, so the first spelling of this case stayed
    // green under its own break-test and was measuring nothing.
    drive().style.set({ height: 60, paddingLeft: 20 });
    await flush();
    flushTimers();
    await flush();

    const profile = readCommitProfile();

    expect(findByTestId('probe')?.props.height).toBe('60');
    // ONE prop write, because the run coalesced three `setStyle` calls into RN's one `style` prop —
    // and ONE commit, because a second means the write missed the commit its own turn scheduled and
    // had to be chased out by another. That second commit is a full `completeRoot` plus a Yoga pass,
    // and on the bench arm it lands in whichever step's microtask happens to run it.
    expect(profile.propWrites).toBe(1);
    expect(profile.commits).toBe(1);

    unmount(ROOT_TAG);
    host = undefined;
  });
});

report();
