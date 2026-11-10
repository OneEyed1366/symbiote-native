import {
  drop,
  isDeepPath,
  pushToken,
  type IBuilder,
} from './selector-builder.ts';

// `:active` is off but its machinery stays, so one line turns it back on. The pressed look has
// a second route, a functional `style`, and two live routes mean two cascade slots for one look
//
// Typed `boolean`, not the literal `false`, or tsc prunes the enabled branch of the test
export const IS_STATE_TOKEN_ENABLED: boolean = false;

// lightningcss reports a plain state pseudo-class by name in `kind`
export const STATE_PSEUDO_CLASS = 'active';

// Keeps the colon, so no class name can spell it
const STATE_TOKEN = ':active';

// Shared by the parsed walk and the raw `:global()` stream, so one source reads the same under
// both `cssModules` modes. A deep path refuses it: only the node owning the press machine has it
export function applyStateToken(builder: IBuilder): void {
  if (isDeepPath(builder)) {
    drop(
      builder,
      'pseudo-class',
      `${STATE_PSEUDO_CLASS} through a deep combinator`,
    );
    return;
  }
  if (!IS_STATE_TOKEN_ENABLED) {
    drop(builder, 'state-pseudo-class', STATE_PSEUDO_CLASS);
    return;
  }
  pushToken(builder, STATE_TOKEN);
}
