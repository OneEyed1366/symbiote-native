// Порт `accessibilityPropsSuite` и `testIDPropSuite` из RN (Image, Text, Pressable, Touchable*)
// Компонент здесь функция: свойства на входе, пропсы смонтированного хост-узла на выходе

import { createRoot } from './culling-fixture';
import { beforeEach, describe, expect, it } from './harness';

export type IMountedProps = Readonly<Record<string, unknown>>;
export type IPropsReader = (props: Record<string, unknown>) => IMountedProps;

const ACCESSIBILITY_ROLES = [
  'none',
  'button',
  'link',
  'search',
  'image',
  'keyboardkey',
  'text',
  'adjustable',
  'imagebutton',
  'header',
  'summary',
  'alert',
  'checkbox',
  'combobox',
  'menu',
  'menubar',
  'menuitem',
  'progressbar',
  'radio',
  'radiogroup',
  'scrollbar',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'timer',
  'toolbar',
] as const satisfies readonly string[];

// В RN в списке дважды `treeitem`, здесь один раз, на проверку это не влияет
const ROLES = [
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'directory',
  'document',
  'feed',
  'figure',
  'form',
  'grid',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'summary',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
] as const satisfies readonly string[];

const STATES = [
  'disabled',
  'selected',
  'busy',
  'expanded',
] as const satisfies readonly string[];

const CHECKED_LABELS = [
  [true, 'Checked'],
  [false, 'Unchecked'],
  ['mixed', 'Mixed'],
] as const;

export function testIDPropSuite(read: IPropsReader): void {
  describe('testID', () => {
    beforeEach(() => createRoot(200, 200));

    it('can be set', () => {
      expect(read({ testID: 'test' }).testID).toBe('test');
    });
  });
}

export function rolePropSuite(read: IPropsReader): void {
  describe('role', () => {
    beforeEach(() => createRoot(200, 200));

    it(`'role' has none by default`, () => {
      expect(read({}).role).toBe(undefined);
    });

    it(`'role' maps invalid values to 'none'`, () => {
      expect(read({ role: '__some_invalid_value' }).role).toBe('none');
    });

    for (const role of ROLES) {
      it(`'role' can be set to ${role}`, () => {
        expect(read({ role }).role).toBe(role);
      });
    }
  });
}

export function accessibilityPropsSuite(
  read: IPropsReader,
  accessibleByDefault = true,
): void {
  describe('accessibility', () => {
    beforeEach(() => createRoot(200, 200));

    describe('accessible', () => {
      it(
        accessibleByDefault
          ? 'is accessible by default'
          : 'is not accessible by default',
        () => {
          expect(read({}).accessible).toBe(
            accessibleByDefault ? 'true' : undefined,
          );
        },
      );

      it('can be set to accessible', () => {
        expect(read({ accessible: true }).accessible).toBe('true');
      });

      it('can be set to not accessible', () => {
        expect(read({ accessible: false }).accessible).toBe(undefined);
      });
    });

    it('accessibilityLabel can be set', () => {
      expect(read({ accessibilityLabel: 'Touch' }).accessibilityLabel).toBe(
        'Touch',
      );
    });

    it('accessibilityHint can be set next to the label', () => {
      const props = read({
        accessibilityLabel: 'Touchable',
        accessibilityHint: 'Can be pressed to interact',
      });

      expect(props.accessibilityLabel).toBe('Touchable');
      expect(props.accessibilityHint).toBe('Can be pressed to interact');
    });

    describe('accessibilityRole', () => {
      for (const accessibilityRole of ACCESSIBILITY_ROLES) {
        it(`can be set to ${accessibilityRole}`, () => {
          expect(read({ accessibilityRole }).accessibilityRole).toBe(
            accessibilityRole,
          );
        });
      }

      it(`has 'accessibilityRole' of higher priority than "role"`, () => {
        const props = read({ accessibilityRole: 'button', role: 'radio' });

        expect(props.accessibilityRole).toBe('button');
      });
    });

    describe('accessibilityState', () => {
      for (const state of STATES) {
        it(`can be "${state}"`, () => {
          const shown = read({ accessibilityState: { [state]: true } });

          expect(
            String(shown.accessibilityState).includes(`${state}:true`),
          ).toBe(true);
        });
      }

      for (const [checked, label] of CHECKED_LABELS) {
        it(`checked can be set to ${String(checked)}`, () => {
          const shown = read({ accessibilityState: { checked } });

          expect(
            String(shown.accessibilityState).includes(`checked:${label}`),
          ).toBe(true);
        });
      }
    });

    it('accessibilityActions can be set to list of actions', () => {
      const accessibilityActions = [
        { name: 'activate' },
        { name: 'spawn', label: 'open a panel' },
        { name: 'escape' },
      ];

      expect(read({ accessibilityActions }).accessibilityActions).toBe(
        "[activate, spawn: 'open a panel', escape]",
      );
    });
  });
}
