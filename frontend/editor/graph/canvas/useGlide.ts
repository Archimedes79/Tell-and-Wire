import { useEffect, useRef, useState } from 'react';
import type { Node } from 'reactflow';

/**
 * Cards that are put somewhere else glide there, instead of jumping: the columns after
 * a card that was put into the gap between two slide over, and the card let go settles on
 * its cell. The store holds where the table says each card stands; this is only how that is
 * shown, so wires, which follow the cards drawn, follow the glide.
 *
 * *hand*: a card being held is drawn pulled toward the cell it would land on, not under the pointer.
 * *document*: another document was opened, and its cards are drawn where they stand at once.
 */
export function useGlide<T extends Node>(nodes: T[], document: unknown, hand: { id: string; x: number; y: number } | null): T[] {
  const shown = useRef(new Map<string, { x: number; y: number }>());
  const goals = useRef(new Map<string, { x: number; y: number }>());
  const held = useRef<string | null>(null);
  const was = useRef<unknown>(document);
  const running = useRef(0);
  const [, frame] = useState(0);

  if (was.current !== document) {
    was.current = document;
    shown.current.clear();
  }
  held.current = hand?.id ?? null;
  goals.current = new Map(nodes.map((node) => {
    const pulled = hand && hand.id === node.id
      ? { x: node.position.x + (hand.x - node.position.x) * 0.6, y: node.position.y + (hand.y - node.position.y) * 0.6 }
      : node.position;
    return [node.id, pulled];
  }));
  for (const id of [...shown.current.keys()]) if (!goals.current.has(id)) shown.current.delete(id);
  // What was not there before appears where it stands.
  for (const [id, goal] of goals.current) if (!shown.current.has(id)) shown.current.set(id, goal);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof requestAnimationFrame !== 'function') {
    for (const [id, goal] of goals.current) shown.current.set(id, goal);
  }

  useEffect(() => {
    const apart = (): boolean => [...goals.current].some(([id, goal]) => {
      const at = shown.current.get(id)!;
      return Math.abs(at.x - goal.x) > 0.4 || Math.abs(at.y - goal.y) > 0.4;
    });
    if (running.current || !apart()) return;
    let before = performance.now();
    const step = (now: number): void => {
      const dt = Math.min(64, now - before);
      before = now;
      let moving = false;
      for (const [id, goal] of goals.current) {
        const at = shown.current.get(id);
        if (!at) continue;
        // The card in the hand follows quickly; the others take their time.
        const k = 1 - Math.exp(-dt / (id === held.current ? 40 : 80));
        const dx = goal.x - at.x;
        const dy = goal.y - at.y;
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
          shown.current.set(id, { x: at.x + dx * k, y: at.y + dy * k });
          moving = true;
        } else if (dx || dy) {
          shown.current.set(id, goal);
        }
      }
      frame((n) => n + 1);
      running.current = moving ? requestAnimationFrame(step) : 0;
    };
    running.current = requestAnimationFrame(step);
  });

  useEffect(() => () => {
    if (running.current) cancelAnimationFrame(running.current);
    running.current = 0;
  }, []);

  return nodes.map((node) => {
    const at = shown.current.get(node.id);
    return at && (at.x !== node.position.x || at.y !== node.position.y) ? { ...node, position: at } : node;
  });
}
