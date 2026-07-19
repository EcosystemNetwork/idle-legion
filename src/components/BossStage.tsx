// ---------------------------------------------------------------------------
// BossStage — a live, animated Three.js render of the Arena world boss.
//
// Built for scale (hundreds of concurrent players): a single ~900KB Draco+WebP
// GLB (all clips baked onto one skeleton, see scripts/build-boss.mjs) is fetched
// ONCE per URL and cached as an ArrayBuffer, the self-hosted Draco decoder lives
// under /draco, the renderer caps its pixel ratio, and the render loop pauses
// whenever the tab is hidden or the stage scrolls off-screen. All GPU resources
// are disposed on unmount. The whole module is loaded lazily (React.lazy) so
// Three.js stays out of the initial bundle.
//
// Combat drives the animation state machine:
//   • hitToken bumps  → play Attack once, then return to Idle (+ a red hit-flash)
//   • killToken bumps → Dead (hold) → Arise → Idle
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;

// --- One shared fetch per URL, one shared loader per session. ---------------
const glbCache = new Map<string, Promise<ArrayBuffer>>();
function fetchGLB(url: string): Promise<ArrayBuffer> {
  let p = glbCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`boss model ${r.status}`);
      return r.arrayBuffer();
    });
    // Drop failed fetches from the cache so a later mount can retry.
    p.catch(() => glbCache.delete(url));
    glbCache.set(url, p);
  }
  return p;
}

let _loader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (_loader) return _loader;
  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  _loader = new GLTFLoader().setDRACOLoader(draco);
  return _loader;
}

interface BossStageProps {
  modelUrl: string;
  /** 2D boss art shown if WebGL is unavailable or the model fails to load. */
  poster?: string;
  /** Bump to trigger an Attack swing. */
  hitToken: number;
  /** Bump to trigger the death → rise sequence. */
  killToken: number;
  className?: string;
}

/** Imperative handle wired up once the model is live. */
interface BossCtrl {
  attack: () => void;
  die: () => void;
}

export default function BossStage({ modelUrl, poster, hitToken, killToken, className }: BossStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<BossCtrl | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // --- Scene lifecycle: set up once per model, tear down on unmount. --------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    setStatus("loading");

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    // Soft studio reflections without shipping an HDR — generated from RoomEnvironment.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Cinematic three-point-ish lighting tuned to the game's dark-vibrant theme.
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x1a1020, 0.55));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9d5bff, 2.0); // purple rim = theme accent
    rim.position.set(-3, 2.5, -2.5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xff7a3d, 0.7); // warm amber bounce
    fill.position.set(-2, 0.5, 2);
    scene.add(fill);

    // Fake soft contact shadow (a radial-gradient sprite) — no shadow maps needed.
    scene.add(makeContactShadow());

    const mixer = new THREE.AnimationMixer(scene);
    const clock = new THREE.Clock();
    let raf = 0;
    let running = false;
    let root: THREE.Object3D | null = null;
    let hitFlash = 0; // 0..1, decays each frame
    let flashMat: THREE.MeshStandardMaterial | null = null;
    let baseEmissive: THREE.Color | null = null;

    const actions = new Map<string, THREE.AnimationAction>();
    let current: THREE.AnimationAction | null = null;

    function play(name: string, opts: { loop?: boolean; clamp?: boolean; fade?: number } = {}) {
      const next = actions.get(name);
      if (!next) return null;
      const { loop = true, clamp = false, fade = 0.25 } = opts;
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = clamp;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.fadeIn(fade).play();
      if (current && current !== next) current.crossFadeTo(next, fade, false);
      current = next;
      return next;
    }

    // Return to a looping Idle after a one-shot finishes — except Dead, which
    // holds on the last frame until the scheduled Arise takes over.
    mixer.addEventListener("finished", (e) => {
      if (disposed) return;
      const finished = (e as unknown as { action: THREE.AnimationAction }).action;
      if (finished.getClip().name === "Dead") return;
      play("Idle", { fade: 0.3 });
    });

    function frameModel(obj: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // Drop feet to y=0, recenter horizontally.
      obj.position.x -= center.x;
      obj.position.z -= center.z;
      obj.position.y -= box.min.y;

      const height = size.y || 1;
      const target = new THREE.Vector3(0, height * 0.55, 0);
      const dist = height * 1.9;
      camera.position.set(dist * 0.28, height * 0.72, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    }

    function renderFrame() {
      const dt = Math.min(clock.getDelta(), 0.05);
      mixer.update(dt);
      if (root) {
        // Gentle turntable sway for presence; eased, never dizzying.
        root.rotation.y += dt * 0.25;
      }
      if (hitFlash > 0 && flashMat && baseEmissive) {
        hitFlash = Math.max(0, hitFlash - dt * 3);
        flashMat.emissive.copy(baseEmissive).lerp(new THREE.Color(0xff2a1a), hitFlash);
        flashMat.emissiveIntensity = 1 + hitFlash * 2.5;
      }
      renderer.render(scene, camera);
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      renderFrame();
    }
    function start() {
      if (running || disposed) return;
      running = true;
      clock.getDelta(); // discard the gap so animation doesn't jump
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    // --- Pause when hidden or scrolled off-screen. --------------------------
    const onScreen = { value: true };
    function maybeStart() {
      if (!document.hidden && onScreen.value) start();
      else stop();
    }
    const onVisibility = () => maybeStart();
    const io = new IntersectionObserver(
      ([e]) => { onScreen.value = e.isIntersecting; maybeStart(); },
      { threshold: 0.01 },
    );
    document.addEventListener("visibilitychange", onVisibility);
    io.observe(host);

    // --- Resize with the container. ----------------------------------------
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    // --- Load the model. ---------------------------------------------------
    fetchGLB(modelUrl)
      .then((buf) => {
        if (disposed) return;
        // Copy the buffer: the Draco worker transfers (detaches) what it parses.
        getLoader().parse(buf.slice(0), "", (gltf) => {
          if (disposed) return;
          root = gltf.scene;
          root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.frustumCulled = false; // skinned bounds are unreliable; keep it drawn
              const mat = mesh.material as THREE.MeshStandardMaterial;
              if (mat && !flashMat) {
                flashMat = mat;
                baseEmissive = mat.emissive.clone();
              }
            }
          });
          scene.add(root);
          frameModel(root);

          for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
          play("Idle", { fade: 0 });

          setStatus("ready");
          const deadDur = actions.get("Dead")?.getClip().duration ?? 1.6;
          ctrlRef.current = {
            attack: () => { play("Attack", { loop: false, clamp: false }); hitFlash = 1; },
            die: () => {
              play("Dead", { loop: false, clamp: true, fade: 0.2 });
              // Once the death beat has fully played, rise again (boss respawns tougher).
              window.setTimeout(() => { if (!disposed) play("Arise", { loop: false }); }, deadDur * 1000 + 500);
            },
          };
          maybeStart();
        }, (err) => {
          console.error("[BossStage] parse failed", err);
          if (!disposed) setStatus("error");
        });
      })
      .catch((err) => {
        console.error("[BossStage] fetch failed", err);
        if (!disposed) setStatus("error");
      });

    // --- Teardown. ---------------------------------------------------------
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      ro.disconnect();
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      ctrlRef.current = null;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach((mm) => disposeMaterial(mm));
          else if (m) disposeMaterial(m);
        }
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
    // Re-init only when the model source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  // --- Combat → animation. Skip the initial mount so we start on Idle. ------
  const firstHit = useRef(true);
  useEffect(() => {
    if (firstHit.current) { firstHit.current = false; return; }
    ctrlRef.current?.attack();
  }, [hitToken]);

  const firstKill = useRef(true);
  useEffect(() => {
    if (firstKill.current) { firstKill.current = false; return; }
    ctrlRef.current?.die();
  }, [killToken]);

  return (
    <div ref={hostRef} className={`boss-3d${className ? ` ${className}` : ""}`}>
      {status === "loading" && <div className="boss-3d-spinner" aria-label="Summoning the boss…" />}
      {status === "error" && (
        <div className="boss-3d-fallback" style={poster ? { backgroundImage: `url(${poster})` } : undefined} />
      )}
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function disposeMaterial(m: THREE.Material) {
  const mat = m as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.normalMap?.dispose();
  mat.roughnessMap?.dispose();
  mat.metalnessMap?.dispose();
  mat.emissiveMap?.dispose();
  m.dispose();
}

/** A cheap soft ground shadow: a radial-gradient texture on a floor plane. */
function makeContactShadow(): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.001;
  return plane;
}
