// The runtime twin of `babel-lower-host-primitives`'s spec-projection guard, and the reason it has
// to exist: `SPEC_FIELDS_IGNORED = ['defaults']` says the transform deliberately does not read that
// field because the RENDERER seeds it. So `defaults` is the one spec field whose only consumer is
// runtime code, and until this file it had no guard at all — a third default, a changed op or a
// changed value would have reached every compile-time projection check and nothing else.
//
// Asserted through the COMMITTED payload rather than by reading the renderer's TEXT_FOLDS map. That
// keeps the oracle a capability ("does a bare tag commit what the spec declares") rather than a
// shape, so it survives the folds being reorganised, moved into `resolveTextProps`, or lifted into
// the engine — all of which are on the table.
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);

interface IDefaultRule {
  readonly op: string;
  readonly value?: unknown;
}
interface IPrimitiveSpec {
  readonly intrinsic: string;
  readonly defaults?: Record<string, IDefaultRule>;
}

const SPECS = HOST_PRIMITIVES as Record<string, IPrimitiveSpec>;

function declaresDefaults(name: string): boolean {
  return Object.keys(SPECS[name].defaults ?? {}).length > 0;
}

// The op vocabulary is CLOSED here on purpose: a spec that grows a third op fails this file rather
// than being silently skipped, which is the failure mode the whole guard exists to prevent.
function resolve(rule: IDefaultRule, authored: unknown): unknown {
  if (rule.op === 'nullish') return authored ?? rule.value;
  if (rule.op === 'notFalse') return authored !== false;
  throw new Error(
    `unknown default op "${rule.op}" — teach this test how to resolve it, and teach the renderer too`,
  );
}

const ROOT_TAG = 8_811;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve_ => setTimeout(resolve_, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function committedText(
  props: Record<string, unknown>,
): Promise<IFakeNode> {
  fabric.reset();
  mount(ROOT_TAG, () => <symbiote-text {...props} />);
  await tick();
  return fabric.appRoot().children[0];
}

describe('the renderer default folds against the shared spec', () => {
  // Self-expiring: the moment a second primitive declares defaults this fails, and the message says
  // what to do. A generic loop is not possible — the universal renderer ships no Dynamic, so a tag
  // cannot be chosen at runtime in JSX (see create-animated-component's string branch).
  it('Text is still the ONLY primitive declaring defaults', () => {
    const withDefaults = Object.keys(SPECS).filter(declaresDefaults);
    expect(withDefaults).toEqual(['Text']);
  });

  it('every declared default reaches a bare tag, for every authored input', async () => {
    const defaults = SPECS.Text.defaults ?? {};
    expect(Object.keys(defaults).length).toBeGreaterThan(0);

    for (const [key, rule] of Object.entries(defaults)) {
      // Four inputs, and the fourth is the one that earns its place. `undefined`, `null` and
      // `false` do NOT separate `notFalse` from a plain `??`: on all three the two agree, so a
      // renderer implementing `value ?? true` passed this file until `0` was added — measured by
      // break-testing, which is the only reason the gap was visible. A falsy value that is neither
      // nullish nor `false` is what splits them (`0 ?? true` is 0; `0 !== false` is true).
      for (const authored of [undefined, null, false, 0]) {
        const node = await committedText(
          authored === undefined ? {} : { [key]: authored },
        );
        expect(node.props[key], `${key}={${String(authored)}}`).toEqual(
          resolve(rule, authored),
        );
      }
    }
  });
});
