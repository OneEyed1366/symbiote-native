// Список с ключами, у которого меняется только порядок, должен сообщить платформе в своём коммите

import { createElement, useState } from 'react';

import { mount } from '@symbiote-native/react';

import {
  committedTexts,
  describe,
  expect,
  flushTimers,
  it,
  mounted,
  mountingLogs,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 4;
const ROW_HEIGHT = 40;

let rotate: (() => void) | undefined;

function startingOrder(): number[] {
  return Array.from({ length: ROWS }, (_unused, id) => id);
}

// Первая строка уходит в конец, как у `shuffle` в демо Reanimated
function Screen(): ReturnType<typeof createElement> {
  const [order, setOrder] = useState(startingOrder);
  rotate = () => setOrder(now => [...now.slice(1), ...now.slice(0, 1)]);

  // `nativeID` держит строку от схлопывания, иначе лог платформы пуст при любом движке
  return createElement(
    'view',
    { nativeID: 'list', style: { flexDirection: 'column' } },
    ...order.map(id =>
      createElement(
        'view',
        { key: id, nativeID: `row-${id}`, style: { height: ROW_HEIGHT } },
        createElement('text', null, `row ${id}`),
      ),
    ),
  );
}

const orderOf = (): string[] =>
  committedTexts().filter(text => text.startsWith('row '));

function mountAndSettle() {
  const surface = mount(ROOT_TAG, createElement(Screen));
  flushTimers();
  surface.commit();
  mounted();
  mountingLogs();
  return surface;
}

describe('a keyed list that only changes order', () => {
  it('puts the new order in the shadow tree', () => {
    const surface = mountAndSettle();
    expect(orderOf()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);

    rotate?.();
    flushTimers();
    surface.commit();
    flushTimers();
    mounted();

    expect(orderOf()).toEqual(['row 1', 'row 2', 'row 3', 'row 0']);
  });

  it('places each row at its new frame on the platform', () => {
    const surface = mountAndSettle();

    rotate?.();
    flushTimers();
    surface.commit();
    flushTimers();
    const list = mounted().children[0];
    const rows = list?.children ?? [];

    expect(rows.map(row => row.layout.y)).toEqual([
      0,
      ROW_HEIGHT,
      ROW_HEIGHT * 2,
      ROW_HEIGHT * 3,
    ]);
  });

  it('tells the platform about every row whose place changed', () => {
    const surface = mountAndSettle();

    rotate?.();
    flushTimers();
    surface.commit();
    flushTimers();
    mounted();
    const told = mountingLogs();

    expect(told.filter(line => line.startsWith('Update')).length).toBe(ROWS);
  });
});

report();
