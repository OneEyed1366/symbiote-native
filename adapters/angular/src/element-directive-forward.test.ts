// Can a DIRECTIVE stand in for a schema — element known, props type-checked, and the value still
// reaching the engine?
//
// The AOT half is answered next door (`bare-intrinsic-tag-aot.test.ts`, cases I/J/K): a directive
// whose selector is the tag makes the element known with NO schema, still rejects a typo'd tag, and
// type-checks a declared prop — which is strictly more than either schema gives, since both return
// `true` for every property on a tag they admit (`dom_element_schema_registry.ts:407`, "we don't
// know which properties a custom element will get").
//
// This is the half that decides whether the route is usable at all. A binding claimed by a
// directive input NEVER reaches `Renderer2.setProperty` — Angular writes it to the directive
// instance instead — so on this route the directive owes the engine a forward. The question is
// whether that forward can be ONE generic loop rather than per-prop code, because per-prop
// forwarding is the component wrapper this whole migration exists to delete.
// The templates below are compiled at run time, so the JIT compiler has to be present.
import '@angular/compiler';
import {
  Component,
  Directive,
  ElementRef,
  Input,
  Renderer2,
  inject,
  type Type,
} from '@angular/core';
import type { OnChanges, SimpleChanges } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

const fabric = installFabric();
let nextRoot = 8_300;

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

const settle = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

// The forward, and the shape that matters: ONE loop over `SimpleChanges`, no per-prop code. What a
// real adapter would ship is this body with a generated `inputs` list per primitive.
@Directive({ selector: 'view' })
class ViewElementDirective implements OnChanges {
  @Input() testID?: string;
  @Input() accessibilityLabel?: string;

  // The adapter's own renderer, reached the ordinary way — the same instance the template would
  // have used had no directive claimed the binding.
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

describe('a directive standing in for a schema', () => {
  beforeEach(() => fabric.reset());

  // why: the deciding fact. If the value cannot get from the directive to the engine with one
  // generic loop, the route costs per-prop forwarding code and is a wrapper by another name.
  it('forwards a declared input to the committed payload', async () => {
    nextRoot += 1;
    const root = nextRoot;

    @Component({
      selector: `directive-forward-${root}`,
      standalone: true,
      imports: [ViewElementDirective],
      template: `<view [testID]="id" [accessibilityLabel]="label"></view>`,
    })
    class Fixture {
      id = 'probe';
      label = 'hello';
    }

    mount(root, Fixture satisfies Type<unknown>);
    await settle();

    const node = flatten(fabric.committed).find(
      candidate => candidate.props.testID === 'probe',
    );
    unmount(root);

    expect(node?.viewName).toBe('RCTView');
    expect(node?.props.accessibilityLabel).toBe('hello');
  });
});
