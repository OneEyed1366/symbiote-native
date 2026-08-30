// Throwaway probe — twin of adapters/react/src/node-census.probe.test.tsx. Same logical row,
// same shape of work: mount empty, then push 1000 rows in reactively and time only that.
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { defineComponent, h, shallowRef } from 'vue';
import { installFabric } from '@symbiote-native/test-utils';
import { censusRetainedTree, readCommitProfile } from '@symbiote-native/engine';
import { mount, unmount, View, Text, Pressable } from './index';

const fabric = installFabric();
const ROOT_TAG = 4243;
const ROWS = Number(process.env.BENCH_ROWS ?? 1000);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const noop = (): void => {};

const Row = defineComponent({
  props: { id: { type: Number, required: true } },
  setup: props => () =>
    h(View, { class: 'bench-row' }, () => [
      h(Text, { class: 'bench-row-id' }, () => String(props.id)),
      h(Pressable, { class: 'flex1', onPress: noop }, () => [
        h(
          Text,
          { class: 'bench-row-label' },
          () => `row label number ${props.id}`,
        ),
      ]),
      h(Pressable, { class: 'bench-row-remove', onPress: noop }, () => [
        h(Text, { class: 'bench-row-remove-text' }, () => 'x'),
      ]),
    ]),
});

const rows = shallowRef<readonly number[]>([]);

const App = defineComponent({
  setup: () => () =>
    h(View, { class: 'screen' }, () =>
      rows.value.map(id => h(Row, { key: id, id })),
    ),
});

describe('node census', () => {
  it('prices a reactive create of 1000 rows', async () => {
    const surface = mount(ROOT_TAG, App);
    await tick();
    fabric.reset();
    readCommitProfile();

    const ids = Array.from({ length: ROWS }, (_, index) => index);
    const started = performance.now();
    rows.value = ids;
    await tick();
    const elapsed = performance.now() - started;

    const profile = readCommitProfile();
    const census = censusRetainedTree(surface.children);
    writeFileSync(
      'census-vue.txt',
      `vue ms=${elapsed.toFixed(1)} nodes=${census.nodes} walkMs=${profile.walkMs.toFixed(1)} ` +
        `visited=${profile.nodesVisited} writes=${profile.propWrites}/${profile.propNoops}\n`,
    );
    console.log(
      `CENSUS vue rows=${ROWS} ms=${elapsed.toFixed(1)} nodes=${census.nodes} ` +
        `anchors=${census.anchors} createNode=${fabric.counts.createNode} ` +
        `appendChild=${fabric.counts.appendChild} clone=${fabric.counts.clone} ` +
        `completeRoot=${fabric.counts.completeRoot} | propWrites=${profile.propWrites} ` +
        `propNoops=${profile.propNoops} nodesVisited=${profile.nodesVisited} ` +
        `commits=${profile.commits} walkMs=${profile.walkMs.toFixed(1)}`,
    );
    unmount(ROOT_TAG);
  });
});
