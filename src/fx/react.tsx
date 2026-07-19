// React glue for the juice engine: animated count-up, a floating mute toggle,
// delegated UI click sounds, and tab-title idle-earnings ticker.
import { useEffect, useRef, useState } from "react";
import { isMuted, sfx, toggleMute } from "./juice";

/** Smoothly rolls a displayed number toward its target (spring-ish ease-out). */
export function useCountUp(target: number, ms = 450): number {
  const [display, setDisplay] = useState(target);
  const from = useRef(target);
  const start = useRef(0);
  const raf = useRef(0);
  const cur = useRef(target);

  useEffect(() => {
    // small deltas: snap (avoids perpetual micro-animation from idle income)
    if (Math.abs(target - cur.current) < 0.5) {
      cur.current = target;
      setDisplay(target);
      return;
    }
    from.current = cur.current;
    start.current = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - start.current) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = from.current + (target - from.current) * eased;
      cur.current = v;
      setDisplay(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return display;
}

/** Floating mute toggle, bottom-right. */
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

/** Delegated soft click sounds on buttons — one listener, no per-button wiring. */
export function useUiSounds() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = (e.target as HTMLElement | null)?.closest("button");
      if (!t || (t as HTMLButtonElement).disabled) return;
      if (t.classList.contains("fx-mute")) return;
      // louder confirm for primary actions, soft tick for the rest
      if (t.classList.contains("btn") && !t.classList.contains("ghost")) sfx.collect();
      else sfx.click();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
}

/** When the tab is hidden, show live idle earnings in the title bar. */
export function useTabTitleEarnings(goldPerSec: number, fed: boolean) {
  useEffect(() => {
    const base = "Idle Legion";
    let acc = 0;
    let id = 0;
    const onVis = () => {
      if (document.hidden) {
        acc = 0;
        id = window.setInterval(() => {
          acc += goldPerSec;
          document.title = `🪙 +${Math.floor(acc)} · ${base}`;
        }, 1000);
      } else {
        window.clearInterval(id);
        document.title = base;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      document.title = base;
    };
  }, [goldPerSec, fed]);
}
