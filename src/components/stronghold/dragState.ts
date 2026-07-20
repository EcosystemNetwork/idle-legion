// Who is currently being dragged.
//
// HTML5 drag-and-drop deliberately hides `dataTransfer` contents during
// `dragover` (it's a security boundary — a page shouldn't be able to read a file
// you're merely hovering). That is exactly the moment a chamber needs to know
// WHO is inbound so it can show the aptitude verdict before the player commits.
//
// So the dragged hero is published to this tiny store on dragstart. The
// dataTransfer payload is still set as the real, authoritative handoff — this is
// only for preview, and every drop path re-reads the id from the event.
import { useSyncExternalStore } from "react";
import type { Dweller } from "../../game/types";

let dragged: Dweller | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function beginHeroDrag(d: Dweller) {
  dragged = d;
  emit();
}

export function endHeroDrag() {
  if (!dragged) return;
  dragged = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The hero currently under the cursor, or null. */
export function useDraggedHero(): Dweller | null {
  return useSyncExternalStore(
    subscribe,
    () => dragged,
    () => null,
  );
}
