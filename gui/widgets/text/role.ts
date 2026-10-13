// How a piece of prose is set: a first-level heading, a second-level heading, a paragraph or a caption.
//
// Its own tiny module, like `text_io/role.ts`, because the GUI imports it too:
// the GUI draws the block by it, and the designer writes into it by it.

export type TextRole = 'h1' | 'h2' | 'body' | 'caption';

/**
 * What a stored mode means. `heading` -- what a heading was called before there were two levels -- is
 * the second; anything that is not one of the four is a paragraph.
 */
export function textRole(mode: unknown): TextRole {
  const role = String(mode ?? 'body');
  if (role === 'heading') return 'h2';
  return (['h1', 'h2', 'body', 'caption'].includes(role) ? role : 'body') as TextRole;
}

/** A heading of either level: one line, standing as its own words. */
export function isHeadingRole(role: TextRole): boolean {
  return role === 'h1' || role === 'h2';
}
