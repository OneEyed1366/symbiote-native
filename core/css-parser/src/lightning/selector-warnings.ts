import type { IDroppedSelector } from './selector-types.ts';

const PREFIX = '[@symbiote-native/css-parser]';

// Why the rule can never fire on a device, the half of the warning that says what to do instead
const DROP_EXPLANATION: Record<IDroppedSelector['reason'], string> = {
  root: 'a `:root` rule paints nothing, it exists to declare custom properties collected by their own pass',
  'pseudo-class':
    'React Native has no pseudo-class state (no hover/focus/nth-child)',
  'pseudo-element': 'React Native has no pseudo-elements',
  attribute: 'React Native has no attribute selectors',
  element: 'React Native has no element/tag selectors',
  id: 'React Native has no id selectors',
  universal: 'React Native has no universal selector',
  unsupported: 'this selector shape has no React Native equivalent',
  // Never reaches the shared sentence, `warnDropped` words it on its own
  'state-pseudo-class': '',
};

// `root` is returned to the caller and never announced here, it has no painting rule to lose
// `state-pseudo-class` gets its own sentence, since "can never match" is false for it
export function warnDropped(problem: IDroppedSelector, filename: string): void {
  if (problem.reason === 'root') return;

  if (problem.reason === 'state-pseudo-class') {
    console.warn(
      `${PREFIX} ${filename}: dropped \`:${problem.detail}\` — pseudo-class state is currently disabled in this parser. Use a functional style instead: style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}, which the engine resolves to style + activeStyle.`,
    );
    return;
  }
  console.warn(
    `${PREFIX} ${filename}: dropped a rule on \`${problem.detail}\` — ${DROP_EXPLANATION[problem.reason]}, so it can never match in React Native.`,
  );
}
