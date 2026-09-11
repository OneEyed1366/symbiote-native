// Two arms, and neither alone is worth anything.
//
// The COVERAGE arm is derived on both sides: the names come off `behaviors/**` on disk, the calls
// off `register.ts`'s own source. A behavior added later joins the audit by existing — the failure
// it catches is a new `register*Behavior` nobody wired, which registers nothing, reddens nothing,
// and only shows up as a tag that commits inert on a device.
//
// The RUNTIME arm is the control. A source scan is satisfied by a file that is pure text, so
// without this the coverage arm would stay green on a module the bundler never evaluates — which
// is the exact production-only failure `register.ts`'s header exists to describe.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PRESSABLE_TAG, SCROLL_VIEW_TAG } from './index';
import { hostBehaviorFor } from '@symbiote-native/engine';
import './register';

const BEHAVIORS = join(__dirname, 'behaviors');
const REGISTER = join(__dirname, 'register.ts');

function exportedRegistrars(dir: string): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const name of exportedRegistrars(full)) found.add(name);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
    for (const match of readFileSync(full, 'utf8').matchAll(
      /export function (register\w+Behavior)/g,
    )) {
      found.add(match[1]);
    }
  }
  return found;
}

describe('the shared registration module', () => {
  it('calls every behavior registrar that exists', () => {
    const source = readFileSync(REGISTER, 'utf8');
    const declared = [...exportedRegistrars(BEHAVIORS)].sort();
    expect(
      declared.length,
      'no registrars found — the scan is broken',
    ).toBeGreaterThan(10);

    const called = declared.filter(name =>
      new RegExp(`^\\s*${name}\\(\\);$`, 'm').test(source),
    );
    expect(called).toEqual(declared);
  });

  it('registers on import, so the module is evaluated and not merely present', () => {
    expect(hostBehaviorFor(PRESSABLE_TAG)).toBeDefined();
    expect(hostBehaviorFor(SCROLL_VIEW_TAG)).toBeDefined();
  });
});
