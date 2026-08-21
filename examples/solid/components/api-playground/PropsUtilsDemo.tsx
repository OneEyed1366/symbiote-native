// Component Model / Props — mergeProps · splitProps · children().
//
// `children?: JSX.Element` below is imported from '@symbiote-native/solid/jsx-runtime', NOT from
// 'solid-js'. solid-js's own Element union is built on the DOM's `Node`, which does not resolve in
// a React Native program — skipLibCheck swallows the error and leaves the union collapsed to
// `any`, so every child position in the file would go unchecked
// (.claude/rules/solid-jsx-namespace.md).
//
// THE mergeProps TRAP, on screen rather than in a comment: mergeProps takes the last NON-UNDEFINED
// value per key, while a JS spread is last-wins including undefined. Code moved over from the
// React adapter changes meaning without changing shape. The two readouts below diverge the moment
// the label is cleared.

import { children, createSignal, mergeProps, splitProps } from 'solid-js';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.primitives;

type ITone = 'muted' | 'loud';
type IBadgeProps = {
  tone?: ITone;
  label?: string;
  testID?: string;
};

const BADGE_DEFAULTS: { tone: ITone; label: string } = {
  tone: 'muted',
  label: 'unnamed',
};

function Badge(props: IBadgeProps) {
  // Defaults first, caller second — "the caller wins unless it says nothing", which is the case
  // mergeProps was designed for and the one where its undefined rule is the desired behaviour.
  const merged = mergeProps(BADGE_DEFAULTS, props);
  // splitProps keeps both halves reactive; destructuring here would freeze them.
  const [own, rest] = splitProps(merged, ['tone', 'label']);

  return (
    <View
      class={own.tone === 'loud' ? 'ap-pill ap-pill-on' : 'ap-pill'}
      {...rest}
    >
      <Text class="ap-pill-text">{own.label}</Text>
    </View>
  );
}

function Panel(props: { children?: JSX.Element }) {
  // children() resolves nested arrays and zero-argument accessors into one memo, so the count
  // below is the real node count rather than "one children prop".
  const resolved = children(() => props.children);

  return (
    <View class="ap-panel">
      <Text class="subtle" testID="props-children-count">
        {`children() resolved ${resolved.toArray().length} node(s)`}
      </Text>
      {resolved()}
    </View>
  );
}

export function PropsUtilsDemo() {
  const [label, setLabel] = createSignal<string | undefined>('named');
  const [tone, setTone] = createSignal<ITone>('muted');

  // A getter, not a snapshot: the source has to stay live for mergeProps to keep resolving it.
  const incoming = {
    get label(): string | undefined {
      return label();
    },
  };
  const viaMerge = mergeProps(BADGE_DEFAULTS, incoming);
  const viaSpread = (): { tone: ITone; label: string | undefined } => ({
    ...BADGE_DEFAULTS,
    label: label(),
  });

  return (
    <View class="section-nested">
      <Text class="section-label">mergeProps · splitProps · children()</Text>

      <View class="ap-wrap">
        <Badge testID="props-badge-default" />
        <Badge testID="props-badge-live" tone={tone()} label={label()} />
      </View>

      <Text class="ap-value" testID="props-merge-result">
        {`mergeProps → "${viaMerge.label}"`}
      </Text>
      <Text class="ap-value" testID="props-spread-result">
        {`object spread → "${String(viaSpread().label)}"`}
      </Text>

      <View class="ap-wrap">
        <ActionButton
          testID="props-clear-label"
          title={
            label() === undefined ? 'restore label' : 'set label undefined'
          }
          color={ACCENT}
          onPress={() =>
            setLabel(current => (current === undefined ? 'named' : undefined))
          }
        />
        <ActionButton
          testID="props-tone"
          title="toggle tone"
          color={ACCENT}
          onPress={() =>
            setTone(current => (current === 'muted' ? 'loud' : 'muted'))
          }
        />
      </View>

      <Panel>
        <Text class="ap-value">first child, supplied by PropsUtilsDemo</Text>
        <Text class="ap-value">second child — children() counts both</Text>
      </Panel>
    </View>
  );
}
