import { describe, expect, it } from 'vitest';
import { MENU_SECTIONS, sectionGroups } from './menu-sections';
import { ROUTE_LINE_INFO } from './navigation-lines';
import { ROUTE_NAME } from './routes';

const itemRoutes = MENU_SECTIONS.flatMap(section =>
  section.items.map(item => item.route),
);
const hubRoutes = MENU_SECTIONS.map(section => section.route);

function sectionOf(route: string): string | undefined {
  return MENU_SECTIONS.find(section =>
    section.items.some(item => item.route === route),
  )?.key;
}

describe('root menu sections', () => {
  it('offers the four sections in menu order', () => {
    expect(MENU_SECTIONS.map(section => section.key)).toEqual([
      'framework',
      'navigation',
      'packages',
      'benchmarks',
    ]);
  });

  it('gives every section its own registered hub route', () => {
    expect(new Set(hubRoutes).size).toBe(MENU_SECTIONS.length);
    const registered: string[] = Object.values(ROUTE_NAME);
    for (const route of hubRoutes) {
      expect(registered).toContain(route);
    }
  });

  it('lists every tour stop in exactly one section', () => {
    const tourStops = Object.keys(ROUTE_LINE_INFO).sort();
    expect([...itemRoutes].sort()).toEqual(tourStops);
  });

  it('never lists the menu, the details target or a hub as a stop', () => {
    const notStops: string[] = [
      ROUTE_NAME.Menu,
      ROUTE_NAME.Details,
      ...hubRoutes,
    ];
    for (const route of itemRoutes) {
      expect(notStops).not.toContain(route);
    }
  });

  it('puts each stop in the section the operator chose', () => {
    expect(sectionOf(ROUTE_NAME.Canary)).toBe('framework');
    expect(sectionOf(ROUTE_NAME.ApiPlayground)).toBe('framework');
    expect(sectionOf(ROUTE_NAME.StyleShowcase)).toBe('framework');
    expect(sectionOf(ROUTE_NAME.HeaderOptions)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.NativeTabs)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.HeaderViews)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.Gestures)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.Events)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.OverlayContainers)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.TransitionProgress)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.InsetsStatusBar)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.StackTransitions)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.RuntimeConfig)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.HeaderOptions)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.StatePersistence)).toBe('navigation');
    expect(sectionOf(ROUTE_NAME.Reanimated)).toBe('packages');
    expect(sectionOf(ROUTE_NAME.Benchmark)).toBe('benchmarks');
  });

  it('shows no empty section', () => {
    for (const section of MENU_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });
});

function sectionByKey(key: string) {
  const section = MENU_SECTIONS.find(candidate => candidate.key === key);
  if (section === undefined) throw new Error(`no ${key} section`);
  return section;
}

describe('hub grouping', () => {
  it('splits the navigation hub into one group per line', () => {
    const groups = sectionGroups(sectionByKey('navigation'));
    const lines = groups.map(group => group.line);
    expect(new Set(lines).size).toBe(lines.length);
    for (const group of groups) {
      for (const item of group.items) {
        expect(ROUTE_LINE_INFO[item.route].line).toBe(group.line);
      }
    }
  });

  it('keeps every navigation stop exactly once, in menu order inside its group', () => {
    const section = sectionByKey('navigation');
    const grouped = sectionGroups(section).flatMap(group =>
      group.items.map(item => item.route),
    );
    expect([...grouped].sort()).toEqual(
      section.items.map(item => item.route).sort(),
    );
    const menuOrder = section.items.map(item => item.route);
    for (const group of sectionGroups(section)) {
      const positions = group.items.map(item => menuOrder.indexOf(item.route));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('leaves the other hubs as one list with no group title', () => {
    for (const key of ['framework', 'packages', 'benchmarks']) {
      const section = sectionByKey(key);
      expect(sectionGroups(section)).toEqual([
        { line: undefined, items: section.items },
      ]);
    }
  });
});
