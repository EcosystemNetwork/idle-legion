// Painterly room-interior backdrops (Fallout-Shelter "enter the room" look).
const B = import.meta.env.BASE_URL;

/** Interior backdrop per room/building type. */
export const INTERIOR: Record<string, string> = {
  mine: `${B}art/kit/int-mine.jpg`,
  forge: `${B}art/kit/int-forge.jpg`,
  granary: `${B}art/kit/int-granary.jpg`,
  quarters: `${B}art/kit/int-quarters.jpg`,
  hall: `${B}art/kit/int-quarters.jpg`,
  bazaar: `${B}art/kit/int-bazaar.jpg`,
  market: `${B}art/kit/int-bazaar.jpg`,
};

export const QUESTSCENES = `${B}art/kit/questscenes.jpg`;

/** The animated 3D frog dweller (all clips consolidated). */
export const FROG_MODEL = `${B}art/kekius-boss.glb`;
