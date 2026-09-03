// Control Flow — swapping the component itself, and the ONE documented gap on this screen.
//
// <Dynamic> is NOT available. It lives in solid-js/web, whose implementation branches on the type
// of `component`: a FUNCTION is called through untrack (renderer-agnostic), a STRING is turned
// into a host element through the DOM's own createElement (not). @symbiote-native/solid therefore
// withholds it rather than re-exporting half of it, alongside Portal, until a same-surface
// replacement over the universal renderer exists. Importing it from solid-js/web here would pull
// the DOM implementation into the bundle; writing <Dynamic> without importing it is worse — the
// name would resolve against the renderer module, read back undefined, and throw at RUNTIME with
// a clean build (.claude/rules/solid-descriptor-bridge.md §3).
//
// So this demo does not fake one. It uses the language-level form Solid's own docs give for a
// component held in a variable — a capitalized local as a JSX tag — which is exactly what
// <Dynamic>'s function branch does internally, and says so on screen.
//
// The swap rebuilds the subtree, and that is correct: a different component means different
// native views. It is the same rebuild <Dynamic> performs.

import { createSignal } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.presentation;

type IKind = 'info' | 'warn' | 'done';
type IVariantProps = { caption: string };

function InfoVariant(props: IVariantProps) {
  return (
    <View class="ap-panel">
      <Text class="ap-value">{`info · ${props.caption}`}</Text>
    </View>
  );
}

function WarnVariant(props: IVariantProps) {
  return (
    <View class="ap-item">
      <Text class="ap-note">{`warn · ${props.caption}`}</Text>
    </View>
  );
}

function DoneVariant(props: IVariantProps) {
  return (
    <View class="ap-item ap-item-on">
      <Text class="ap-item-text">{`done · ${props.caption}`}</Text>
    </View>
  );
}

const VARIANTS: Record<IKind, (props: IVariantProps) => JSX.Element> = {
  info: InfoVariant,
  warn: WarnVariant,
  done: DoneVariant,
};

const KINDS: readonly IKind[] = ['info', 'warn', 'done'];

export function DynamicSwapDemo() {
  const [kind, setKind] = createSignal<IKind>('info');

  return (
    <View class="section-nested">
      <Text class="section-label">component swap (Dynamic's replacement)</Text>
      {(() => {
        const Variant = VARIANTS[kind()];
        return <Variant caption={`swapped to ${kind()}`} />;
      })()}
      <ActionButton
        testID="dynamic-cycle"
        title="cycle variant"
        color={ACCENT}
        onPress={() =>
          setKind(
            current =>
              KINDS[(KINDS.indexOf(current) + 1) % KINDS.length] ?? 'info',
          )
        }
      />
      <Text class="ap-note" testID="dynamic-gap-note">
        &lt;Dynamic&gt; is not exported by @symbiote-native/solid —
        solid-js/web's implementation creates a host element from a STRING tag
        through the DOM, which has no equivalent here yet. Its function branch
        is renderer-agnostic, and that is the form above.
      </Text>
    </View>
  );
}
