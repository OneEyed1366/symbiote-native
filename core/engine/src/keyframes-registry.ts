// `@keyframes` of the stylesheets, by the name an animation names them with
// They ride the rules array as a rule with no tokens whose style keys read `@keyframes <name>`
import {
  clearGlobalStyles as clearTokenStyles,
  registerRules as registerTokenRules,
  type IStyleRule,
} from './style-registry';

const KEYFRAMES_PREFIX = '@keyframes ';

const registered = new Map<string, object>();

function isSteps(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

// Keys that are not keyframes are left alone, so the carrier can grow other at-rules
function registerKeyframesFrom(style: Readonly<Record<string, unknown>>): void {
  for (const [key, steps] of Object.entries(style)) {
    if (key.startsWith(KEYFRAMES_PREFIX) && isSteps(steps)) {
      registered.set(key.slice(KEYFRAMES_PREFIX.length), steps);
    }
  }
}

// The token registry skips a rule with no tokens, so its keyframes are taken here first
export function registerRules(rules: readonly IStyleRule[]): void {
  for (const rule of rules) {
    if (rule.tokens.length === 0) registerKeyframesFrom(rule.style);
  }
  registerTokenRules(rules);
}

export function clearGlobalStyles(): void {
  registered.clear();
  clearTokenStyles();
}

export function keyframesNamed(name: string): object | undefined {
  return registered.get(name);
}
