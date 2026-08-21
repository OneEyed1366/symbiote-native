// The golden snapshot pins the BYTES compileCssFile emits; it cannot say whether the runtime
// registry still finds them. Both halves have to meet, and they are compiled by different
// packages — which is exactly how every scoped compound rule stayed dead for months (see
// core/engine/src/style-registry's scopedCompoundKey comment).
//
// This matters most for what a `.module.*` file registers for a COMPOUND or DESCENDANT selector.
// The compiler emits the class-token SET the selector was written with, each token already
// carrying the scope (`['card__module__h', 'big__module__h']`), and the registry matches a rule
// whose tokens are a SUBSET of the element's. Nothing is collapsed into a name and nothing is
// guessed back apart; this proves the two ends agree on that.
//
// Reaches into core/engine by relative path on purpose: neither package depends on the other and
// neither should, same arrangement golden-corpus.test.ts uses for the adapters.
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  registerRules,
  resolveClassName,
  type IStyleRule,
} from '../../../engine/src/style-registry/index.ts';
import { compileCssFile } from './index.ts';

const FIXTURE = 'core/css-parser/src/golden-corpus/fixtures/theme.module.css';
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

function payloadOf(code: string, pattern: RegExp): Record<string, unknown> {
  const match = pattern.exec(code);
  if (match === null || match[1] === undefined) {
    throw new Error(`compileCssFile emitted no ${pattern.source}`);
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${pattern.source} payload is not an object`);
  }
  return { ...parsed };
}

// The emitted `registerRules([...])` argument, narrowed entry by entry into the engine's own
// IStyleRule — parsed JSON arrives as `unknown`, and spreading a value already checked to be a
// non-null object is what turns its style bag into a style record without a cast.
function rulesFrom(code: string): IStyleRule[] {
  const match = /registerRules\((\[.*\])\);/.exec(code);
  if (match?.[1] === undefined) {
    throw new Error('compileCssFile emitted no registerRules(...) call');
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (!Array.isArray(parsed)) {
    throw new Error('the registerRules payload is not an array');
  }
  return parsed.map(toRule);
}

function toRule(value: unknown): IStyleRule {
  if (!isRecord(value)) {
    throw new Error('a registerRules entry is not an object');
  }
  const { tokens, specificity, order, style } = value;
  if (!isStringArray(tokens)) throw new Error('a rule carries no token list');
  if (!isSpecificity(specificity)) {
    throw new Error('a rule carries no (a,b,c) specificity');
  }
  if (typeof order !== 'number') throw new Error('a rule carries no order');
  if (typeof style !== 'object' || style === null) {
    throw new Error('a rule carries no style');
  }
  return { tokens, specificity, order, style: { ...style } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isSpecificity(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(item => typeof item === 'number')
  );
}

function classOf(classMap: Record<string, unknown>, name: string): string {
  const value = classMap[name];
  if (typeof value !== 'string') {
    throw new Error(`no exported class \`${name}\``);
  }
  return value;
}

let classMap: Record<string, unknown>;

beforeEach(async () => {
  clearGlobalStyles();
  const { code } = await compileCssFile(
    readFileSync(path.join(REPO_ROOT, FIXTURE), 'utf8'),
    FIXTURE,
  );
  registerRules(rulesFrom(code));
  classMap = payloadOf(code, /export default (.*);/);
});

describe('.module.css rules the registry has to match', () => {
  it('resolves a compound rule from its two scoped tokens', () => {
    const both = `${classOf(classMap, 'card')} ${classOf(classMap, 'big')}`;
    expect(resolveClassName(both)).toEqual({ padding: 20 });
  });

  it('resolves a descendant rule whose second token is :global()', () => {
    expect(resolveClassName(`${classOf(classMap, 'card')} legacy`)).toEqual({
      padding: 12,
      borderWidth: 1,
    });
  });

  it('layers a composed class under the composing one', () => {
    expect(resolveClassName(classOf(classMap, 'inherited'))).toEqual({
      padding: 12,
      color: '#fff',
    });
  });

  it('keeps a :global() class reachable by its authored name', () => {
    expect(resolveClassName('legacy-reset')).toEqual({ margin: 0 });
  });
});
