// Что `checkbox` и его галочка отправляют в native: правила тегов `checkbox` и `checkbox-mark`
// Порт стилей и a11y из `ExpoCheckbox.tsx`, цвета по умолчанию iOS (Android в `.android.itest.ts`)

import { registerCheckboxBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerCheckboxBehavior();

type IPayload = Readonly<Record<string, unknown>>;

type ICommitted = {
  readonly host: IPayload;
  readonly mark: IPayload;
  readonly folds: number;
};

// `routeProp`, т.к. `value` и `onValueChange` проходят маршрутизацию владельца
function commit(props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, 'checkbox');
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  const mark = node.childHost;
  if (mark === undefined) throw new Error('the behavior built no checkmark');

  surface.appendChild(node);
  surface.commit();
  mounted();

  const host = committedPayloadOf(node);
  const markPayload = committedPayloadOf(mark);
  if (host === undefined || markPayload === undefined)
    throw new Error('nothing committed');
  return {
    host,
    mark: markPayload,
    folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0,
  };
}

const GRAY = 0xff_65_77_86;
const IOS_BLUE = 0xff_00_7a_ff;
const DISABLED_GRAY = 0xff_cc_d6_dd;
const DISABLED_CHECKED_GRAY = 0xff_aa_b8_c2;
const CUSTOM = 0xff_46_30_eb;

describe('what a checkbox sends native', () => {
  it('is a 20 point box with a 2 point gray border', () => {
    const { host } = commit({});
    expect(host.width).toBe(20);
    expect(host.height).toBe(20);
    expect(host.borderRadius).toBe(2);
    expect(host.borderWidth).toBe(2);
    expect(host.borderColor).toBe(GRAY);
  });

  it('pins the checkbox role and stays a focus stop', () => {
    const { host } = commit({});
    expect(host.accessibilityRole).toBe('checkbox');
    expect(host.accessible).toBe(true);
    expect(host.focusable).toBe(true);
  });

  // Голый Pressable ставит `collapsable={false}`, иначе Fabric схлопнет бокс вместе с галочкой
  it('is not collapsed away', () => {
    expect(commit({}).host.collapsable).toBe(false);
  });

  it('announces the value as accessibilityState.checked', () => {
    expect(commit({ value: true }).host.accessibilityState).toEqual({
      checked: true,
    });
    expect(commit({ value: false }).host.accessibilityState).toEqual({
      checked: false,
    });
  });

  it('fills and outlines a checked box with the platform color', () => {
    const { host } = commit({ value: true });
    expect(host.backgroundColor).toBe(IOS_BLUE);
    expect(host.borderColor).toBe(IOS_BLUE);
  });

  it('paints an authored color on the border, and on the fill when checked', () => {
    const off = commit({ color: '#4630EB' }).host;
    expect(off.borderColor).toBe(CUSTOM);
    expect(off.backgroundColor).toBe(undefined);
    const on = commit({ value: true, color: '#4630EB' }).host;
    expect(on.borderColor).toBe(CUSTOM);
    expect(on.backgroundColor).toBe(CUSTOM);
  });

  it('lets an authored style override the base look', () => {
    const { host } = commit({ style: { width: 32, height: 32 } });
    expect(host.width).toBe(32);
    expect(host.height).toBe(32);
    expect(host.borderWidth).toBe(2);
  });

  // `disabled` не нативный проп View, до screen reader он доходит только через state
  it('folds disabled into the accessibility state and drops the raw prop', () => {
    const { host } = commit({ value: true, disabled: true });
    expect(host.accessibilityState).toEqual({ checked: true, disabled: true });
    expect(host.disabled).toBe(undefined);
  });

  it('greys out a disabled box', () => {
    const { host } = commit({ disabled: true });
    expect(host.borderColor).toBe(DISABLED_GRAY);
    expect(host.backgroundColor).toBe(0);
  });

  it('greys out a disabled checked box darker', () => {
    const { host } = commit({ value: true, disabled: true });
    expect(host.borderColor).toBe(DISABLED_CHECKED_GRAY);
    expect(host.backgroundColor).toBe(DISABLED_CHECKED_GRAY);
  });

  // В `ExpoCheckbox.tsx` `color` стоит в списке стилей раньше `disabled`, серый его перебивает
  it('lets the disabled grey win over the color on the border', () => {
    const { host } = commit({ disabled: true, color: '#4630EB' });
    expect(host.borderColor).toBe(DISABLED_GRAY);
  });

  // Fabric молча дропает ключи без ViewConfig, утечку не видно глазами
  it('keeps value and color off the host payload', () => {
    const { host } = commit({ value: true, color: '#4630EB' });
    expect(host.value).toBe(undefined);
    expect(host.color).toBe(undefined);
  });

  it('costs no trip into JS at all', () => {
    const one = commit({});
    print(`DEBUG checkbox folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

describe('what a checkmark sends native', () => {
  it('fills the box absolutely', () => {
    const { mark } = commit({ value: true });
    expect(mark.position).toBe('absolute');
    expect(mark.top).toBe(0);
    expect(mark.bottom).toBe(0);
    expect(mark.left).toBe(0);
    expect(mark.right).toBe(0);
  });

  // В upstream у неотмеченного бокса картинки нет, здесь она есть, но скрыта
  it('is displayed only while the owner is checked', () => {
    expect(commit({ value: true }).mark.display).toBe(undefined);
    expect(commit({ value: false }).mark.display).toBe('none');
    expect(commit({}).mark.display).toBe('none');
  });
});

report();
