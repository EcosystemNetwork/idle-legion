// Actor — the lazy front door to ModelStage.
//
// Room keks and the Master are rendered from eagerly-imported modules, so the
// Three.js-backed ModelStage must be code-split here; otherwise three.js would
// be pulled straight back into the initial bundle. Until the chunk lands we
// render an equally-sized placeholder (the poster art when there is one), so the
// layout never shifts.
import { lazy, Suspense } from "react";
import type { ModelStageProps } from "./ModelStage";

const ModelStage = lazy(() => import("./ModelStage"));

export default function Actor(props: ModelStageProps) {
  const placeholder = (
    <div
      className={props.className}
      style={{
        ...props.style,
        backgroundImage: props.poster ? `url(${props.poster})` : undefined,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center bottom",
      }}
    />
  );
  return (
    <Suspense fallback={placeholder}>
      <ModelStage {...props} />
    </Suspense>
  );
}
