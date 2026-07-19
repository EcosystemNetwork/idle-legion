// Floating mute toggle, bottom-right. Kept in its own file so fx/react.tsx can
// stay hooks-only (React Fast Refresh warns when a module mixes component and
// non-component exports).
import { useState } from "react";
import { isMuted, sfx, toggleMute } from "./juice";

export function MuteButton() {
  const [m, setM] = useState(isMuted());
  return (
    <button
      type="button"
      className="fx-mute"
      title={m ? "Sound off" : "Sound on"}
      aria-label={m ? "Unmute" : "Mute"}
      onClick={() => {
        const now = toggleMute();
        setM(now);
        if (!now) sfx.click();
      }}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}
