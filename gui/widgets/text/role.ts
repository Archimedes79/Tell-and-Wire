// How a piece of prose is set: a heading, a paragraph or a caption.
//
// Its own tiny module, like `text_io/role.ts`, because the gui imports it too:
// the gui draws the block by it, and the designer writes into it by it.

export type TextRole = 'heading' | 'body' | 'caption';

/** What a stored mode means: anything but the three is a paragraph. */
export function textRole(mode: unknown): TextRole {
  const role = String(mode ?? 'body');
  return (['heading', 'body', 'caption'].includes(role) ? role : 'body') as TextRole;
}
