import { createElement, type ReactNode } from "react";
import "@google/model-viewer";
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
// from the consolidated GLB (e.g. "Boxing_Practice", "Casual_Walk", "Attack").
// One <model-viewer> per frog is GPU-heavy — use for a few featured dwellers,
// not a whole crowd (use FrogChip 2D for the rest).
export function RoomFrog({
  anim,
  size = 150,
  onClick,
}: {
  anim?: string;
  size?: number;
  onClick?: () => void;
}) {
  return createElement("model-viewer", {
    src: FROG_MODEL,
    alt: "frog dweller",
    autoplay: true,
    ...(anim ? { "animation-name": anim } : {}),
    "camera-controls": false,
    "disable-zoom": true,
    "disable-pan": true,
    "interaction-prompt": "none",
    "shadow-intensity": "0.7",
    exposure: "1.1",
    "camera-orbit": "0deg 87deg 3.2m",
    "field-of-view": "26deg",
    loading: "eager",
    onClick,
    style: { width: `${size}px`, height: `${size * 1.15}px`, cursor: onClick ? "pointer" : "default" },
  });
}
