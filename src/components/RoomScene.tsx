import type { ReactNode } from "react";
import Actor from "./Actor";
import { FROG_MODEL, INTERIOR } from "../game/interiors";

// A Fallout-Shelter-style room: the painterly interior backdrop with dwellers
// standing on the floor inside it. Drop dweller elements in as children — they
// sit on the .rs-floor. Reusable per building/room.
export function RoomScene({
  type,
  title,
  poster,
  children,
}: {
  type: string;
  title?: string;
  poster?: string;
  children?: ReactNode;
}) {
  return (
    <div className="room-scene">
      <img className="rs-bg" src={INTERIOR[type] ?? INTERIOR.hall} alt="" loading="lazy" />
      <div className="rs-shade" aria-hidden />
      {title && <div className="rs-title">{title}</div>}
      <div className="rs-floor">{children}</div>
      {poster && <div className="rs-vignette" aria-hidden />}
    </div>
  );
}

// A single animated 3D frog dweller standing in a room. `anim` picks a clip
// from the consolidated GLB. Real clips: Idle, Walk, Run, Attack, ComboAttack,
// Spin, Taunt, Dance, Arise, Dead.
// Rendered through the shared-context portal renderer, so a stronghold full of
// these costs ONE WebGL context in total rather than one apiece.
export function RoomFrog({
  anim,
  breaks,
  size = 150,
  onClick,
}: {
  anim?: string;
  /** One-shot flourishes played between loops of `anim`. */
  breaks?: string[];
  size?: number;
  onClick?: () => void;
}) {
  return (
    <Actor
      src={FROG_MODEL}
      anim={anim}
      breaks={breaks}
      fov={26}
      zoom={2}
      aim={0.5}
      onClick={onClick}
      title="Pepe legionary"
      style={{ width: size, height: size * 1.15 }}
    />
  );
}
