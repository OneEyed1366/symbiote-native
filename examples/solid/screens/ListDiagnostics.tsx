// On-screen readout of the list's windowing state, for photographing a device. The residual it
// exists to show cannot exist headlessly: the test fake reports back exactly the layout the model
// asked for, so `raw` and `model` are equal there by construction. Only a real Yoga can disagree.
//
// Read it top-down:
//
//   RESID   model - raw for the window's first cell. This is THE number. A measured cell is stored
//           verbatim, so it must be 0.00. Anything else means the spacer under that cell no longer
//           describes where the host actually put it, and the next layout will move it again.
//   LEN     a cell the host re-reported at a different HEIGHT. This is the one that names a culprit:
//           a run of MOV entries all shifting by the same amount means something ABOVE them resized,
//           and only this line says which index it was.
//   MOV     cells the host re-reported at a different y, newest first. During a steady drag this
//           should be silent — the viewport moves, the content does not. A running stream of these
//           is the oscillation itself: spacer changes -> cells shift -> re-measure -> spacer changes.
//   lead    the leading / trailing spacer extents. Moving while the cells hold still points at the
//   trail   spacer rather than at the content.
//   d       change in the window's first index between two consecutive recomputes. Flipping sign
//           (+1 then -1 at a steady scroll direction) means the window is hunting.
//
// Δ columns are deltas against the previous frame, so a screenshot mid-drag shows the motion rather
// than one static sample.

import { For, createSignal, onCleanup, onMount } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import {
  subscribeListDiagnostics,
  type IListDiagnosticFrame,
  type IListDiagnosticMove,
} from '@symbiote-native/components';

const FRAMES = 6;
const MOVES = 8;
// The row COUNT is fixed and the slots start empty. A HUD that grows as it fills would change its
// own height, which changes the list's viewport, which triggers the very recompute being measured —
// the instrument would be feeding the thing it is pointed at.
const FRAME_SLOTS = Array.from({ length: FRAMES }, (_unused, slot) => slot);
const MOVE_SLOTS = Array.from({ length: MOVES }, (_unused, slot) => slot);
// Two decimals: the failure mode being hunted is sub-pixel (a @3x device lays out on thirds), and
// rounding it away would hide exactly the residual this screen exists to show.
const PRECISION = 2;

// Fixed WIDTH, not just fixed precision. A row that grows by a character can wrap, and a wrapped
// row makes the readout one line taller — which shrinks the list's viewport and shifts everything
// below it. That is not a cosmetic concern: it is the artifact this screen spent an afternoon
// chasing, because the long values (`d+1.00`, `Δ+59.00`) appear exactly at a window transition, so
// the readout jumped precisely when the list was under suspicion. Pair it with numberOfLines={1} —
// padding keeps the line honest, the clamp makes it impossible.
const WIDTH = 9;
// Indices widen too: f8 -> f10 is another character, and another chance to wrap.
const INDEX_WIDTH = 2;
const idx = (value: number): string => String(value).padStart(INDEX_WIDTH);

const px = (value: number | undefined): string =>
  (value === undefined ? '—' : value.toFixed(PRECISION)).padStart(WIDTH);

const signed = (value: number | undefined): string => {
  if (value === undefined) return '—'.padStart(WIDTH);
  const text = value.toFixed(PRECISION);
  return (value > 0 ? `+${text}` : text).padStart(WIDTH);
};

export function ListDiagnostics() {
  const [frames, setFrames] = createSignal<IListDiagnosticFrame[]>([]);
  const [moves, setMoves] = createSignal<IListDiagnosticMove[]>([]);
  const [frameCount, setFrameCount] = createSignal(0);
  const [moveCount, setMoveCount] = createSignal(0);

  onMount(() => {
    const unsubscribe = subscribeListDiagnostics({
      onFrame: frame => {
        setFrameCount(total => total + 1);
        setFrames(current => [frame, ...current].slice(0, FRAMES));
      },
      onMove: move => {
        setMoveCount(total => total + 1);
        setMoves(current => [move, ...current].slice(0, MOVES));
      },
    });
    onCleanup(unsubscribe);
  });

  const latest = (): IListDiagnosticFrame | undefined => frames()[0];
  // model - raw for the window's first cell. Undefined while that cell has never been measured,
  // which is normal right after a jump into unmeasured territory.
  const residual = (): number | undefined => {
    const frame = latest();
    if (frame?.firstRaw === undefined) return undefined;
    return frame.firstOffset - frame.firstRaw;
  };

  return (
    <View class="hud">
      <Text class="hud-line" numberOfLines={1}>
        RESID {signed(residual())} · frames {frameCount()} · moved {moveCount()}
      </Text>
      <Text class="hud-line" numberOfLines={1}>
        win {latest()?.first ?? '—'}..{latest()?.last ?? '—'} · target{' '}
        {latest()?.targetFirst ?? '—'}..{latest()?.targetLast ?? '—'} · measured{' '}
        {latest()?.measuredCount ?? 0}/{latest()?.count ?? 0}
      </Text>
      <Text class="hud-line" numberOfLines={1}>
        avg len {px(latest()?.averageLength)} · stride{' '}
        {px(latest()?.averageStride)} · total {px(latest()?.total)}
      </Text>
      <Text class="hud-line" numberOfLines={1}>
        lead {px(latest()?.leadingExtent)} · trail{' '}
        {px(latest()?.trailingExtent)}
      </Text>

      <For each={FRAME_SLOTS}>
        {slot => {
          const frame = (): IListDiagnosticFrame | undefined => frames()[slot];
          const delta = (
            read: (one: IListDiagnosticFrame) => number,
          ): string => {
            const current = frame();
            const earlier = frames()[slot + 1];
            return current === undefined || earlier === undefined
              ? '—'
              : signed(read(current) - read(earlier));
          };
          const line = (): string => {
            const current = frame();
            if (current === undefined) return '·';
            return `y ${px(current.scrollOffset)} Δ${delta(one => one.scrollOffset)} · f${idx(current.first)} d${delta(one => one.first)} · model ${px(current.firstOffset)} Δ${delta(one => one.firstOffset)} · raw ${px(current.firstRaw)}`;
          };
          return (
            <Text class="hud-row" numberOfLines={1}>
              {line()}
            </Text>
          );
        }}
      </For>

      <For each={MOVE_SLOTS}>
        {slot => {
          const line = (): string => {
            const move = moves()[slot];
            if (move === undefined) return '·';
            const tag = move.kind === 'sized' ? 'LEN' : 'MOV';
            return `${tag} #${idx(move.index)} ${px(move.from)} → ${px(move.to)} (${signed(move.to - move.from)})`;
          };
          return (
            <Text class="hud-move" numberOfLines={1}>
              {line()}
            </Text>
          );
        }}
      </For>
    </View>
  );
}
