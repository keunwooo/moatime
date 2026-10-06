/**
 * Redrawing a Graphics, even clearing an empty one, makes Pixi rebuild the draw list of its
 * render group. In one big group that is the whole scene (thousands of sprites) every frame.
 * Things that redraw every frame get a small group of their own, and empty ones are not
 * cleared again.
 */

import type { Container, Graphics } from 'pixi.js';

/** Clears a Graphics only when something is drawn in it. */
export function clearIfDrawn(g: Graphics) {
  if (g.context.instructions.length > 0) g.clear();
}

/** Gives a container its own render group, so its redraws rebuild only its own draw list. */
export function ownGroup<T extends Container>(c: T): T {
  c.isRenderGroup = true;
  return c;
}
