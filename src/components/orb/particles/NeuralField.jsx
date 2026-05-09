// src/components/orb/particles/NeuralField.jsx
//
// 60-node neural constellation — replaces AmbientParticles.
//
// POPULATIONS
//   INNER  15 nodes   r 1.9–2.3   faster drift   opacity 0.60
//   MID    30 nodes   r 2.8–4.0   medium drift    opacity 0.35–0.50
//   OUTER  15 nodes   r 5.0–7.0   almost still    opacity 0.25
//
// CONNECTIONS
//   LineSegments with vertex-encoded brightness (AdditiveBlending).
//   Pairs within CONNECTION_THRESH (1.2 units) form an edge.
//   Opacity = (1 – dist/thresh) × 0.12 × cOp.  Cap: 80 edges.
//   idle cOp=0.60 → faint constellation; executing cOp=1.40 → network alive.
//   Rebuilt every 3 frames for performance.
//
// ACTIVATION WAVES
//   On 'executing': seed the inner node nearest the tool direction,
//   propagate 3 hops at 150 ms intervals with decaying amplitude.
//   Each node's activation decays to 0 over 0.80 s.
//
// COMPLETE FLASH
//   All nodes ramp to full white over 200 ms then decay over ~1 s.

import { useRef, useMemo, useEffect }  from 'react';
import { useFrame, useThree }          from '@react-three/fiber';
import * as THREE                      from 'three';
import useAriaStore                    from '../../../store/ariaStore';
import { getOrbUniforms }              from '../OrbStateMapper';
import { audioState }                  from '../../../hooks/useAudioReactivity';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const N         = 60;
const N_INNER   = 15;
const N_MID     = 30;
// N_OUTER = 15  (indices 45–59)

const THRESH    = 1.2;    // connection distance threshold (Three.js units)
const MAX_CONNS = 80;     // cap on simultaneously rendered edges

// ── Population descriptors ────────────────────────────────────────────────────
// { count, rMin, rMax, szMin, szMax, opBase, vMax }
const POPS = [
  // INNER
  { n: N_INNER, rMin: 1.9, rMax: 2.3, szMin: 0.035, szMax: 0.065, opBase: 0.60, vMax: 0.006  },
  // MID
  { n: N_MID,   rMin: 2.8, rMax: 4.0, szMin: 0.045, szMax: 0.085, opBase: 0.42, vMax: 0.004  },
  // OUTER
  { n: 15,      rMin: 5.0, rMax: 7.0, szMin: 0.100, szMax: 0.160, opBase: 0.25, vMax: 0.0015 },
];

// ── Tool accent colours (mirrors OrbStateMapper) ──────────────────────────────
const TOOL_ACC = {
  browser: new THREE.Color(0.55, 0.35, 0.95),
  file:    new THREE.Color(0.95, 0.65, 0.10),
  system:  new THREE.Color(0.10, 0.85, 0.90),
  code:    new THREE.Color(0.20, 0.90, 0.45),
};
const TOOL_DIR = {
  browser: new THREE.Vector3( 1.0,  0.4,  0.0).normalize(),
  file:    new THREE.Vector3(-1.0, -1.0,  0.0).normalize(),
  system:  new THREE.Vector3( 0.0,  1.0,  0.0).normalize(),
  code:    new THREE.Vector3( 1.0, -0.7,  0.0).normalize(),
};
const DEF_ACC = new THREE.Color(0.25, 0.55, 1.0);

// ── Tool key extractor — outside component, created once ─────────────────────
function getToolKey(tool) {
  if (!tool) return null;
  return Object.keys(TOOL_ACC).find(k => tool.toLowerCase().includes(k)) ?? null;
}

// ── Phase config ──────────────────────────────────────────────────────────────
const PC = {
  idle:       { cOp: 0.60, drift: 1.0 },
  planning:   { cOp: 0.80, drift: 1.1 },
  executing:  { cOp: 1.40, drift: 1.3 },
  recovering: { cOp: 0.70, drift: 1.1 },
  error:      { cOp: 0.80, drift: 1.2 },
  complete:   { cOp: 1.00, drift: 1.5 },
  tier3:      { cOp: 0.45, drift: 0.8 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (called once on init, outside React lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

function buildGlowTexture() {
  const sz = 64;
  const c  = document.createElement('canvas');
  c.width  = c.height = sz;
  const ctx = c.getContext('2d');
  const h   = sz / 2;
  const g   = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0,    'rgba(255,255,255,1.00)');
  g.addColorStop(0.20, 'rgba(255,255,255,0.60)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  return new THREE.CanvasTexture(c);
}

function rndOnSphere(r) {
  // Uniform sampling on sphere surface (Marsaglia / spherical coords)
  const th  = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(th),
    r * Math.sin(phi) * Math.sin(th),
    r * Math.cos(phi),
  );
}

function initNodes() {
  const nodes = [];
  let   pop   = 0;
  for (const p of POPS) {
    for (let i = 0; i < p.n; i++) {
      const r  = p.rMin + Math.random() * (p.rMax - p.rMin);
      const sp = p.vMax * (0.4 + Math.random() * 0.6);
      nodes.push({
        pop,
        pos:    rndOnSphere(r),
        vel:    new THREE.Vector3(
          (Math.random() - 0.5) * sp * 2,
          (Math.random() - 0.5) * sp * 2,
          (Math.random() - 0.5) * sp * 2,
        ),
        nomR:   r,
        vMax:   p.vMax,
        sz:     p.szMin + Math.random() * (p.szMax - p.szMin),
        opBase: p.opBase,
        // Twinkle: each node oscillates independently at its own speed/phase
        twinkleSpeed: 0.3 + Math.random() * 0.9,
        twinklePhase: Math.random() * Math.PI * 2,
        isBright:     Math.random() < 0.15,   // 15% chance of being a bright node
      });
    }
    pop++;
  }
  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function NeuralField({ phase, currentTool }) {
  const { camera } = useThree();

  // ── Stable mutable node state ─────────────────────────────────────────────
  const nodesRef = useRef(null);
  if (!nodesRef.current) nodesRef.current = initNodes();

  const frameN        = useRef(0);
  const elapsedRef    = useRef(0);       // accumulated time (seconds) for twinkle
  const connCache     = useRef([]);      // rebuilt every 3 frames
  const timers        = useRef([]);      // wave setTimeout ids
  const lastWaveMs    = useRef(0);       // throttle mini activation waves during speech

  // Per-node activation: Float32Array[60], range 0–1, decays to 0 in 0.8 s
  const actRef    = useRef(new Float32Array(N));
  const actColRef = useRef(Array.from({ length: N }, () => new THREE.Color(1, 1, 1)));

  // ── Derived / lerped visual state ─────────────────────────────────────────
  const targetUniforms = useMemo(
    () => getOrbUniforms(phase, currentTool),
    [phase, currentTool],
  );
  const lColor = useRef(new THREE.Color(...targetUniforms.uStateColor));
  const lCOp   = useRef(PC[phase]?.cOp   ?? 0.60);
  const lDrift = useRef(PC[phase]?.drift ?? 1.0);

  // ── Pre-allocated frame-reusable objects ──────────────────────────────────
  const _mat       = useMemo(() => new THREE.Matrix4(),    []);
  const _pos       = useMemo(() => new THREE.Vector3(),    []);
  const _scl       = useMemo(() => new THREE.Vector3(),    []);
  const _qCam      = useMemo(() => new THREE.Quaternion(), []);
  const _col       = useMemo(() => new THREE.Color(),      []);
  const _tgt       = useMemo(() => new THREE.Color(),      []);
  const _t3Col     = useMemo(() => new THREE.Color(0.80, 0.10, 0.10), []);
  const _restDir   = useMemo(() => new THREE.Vector3(),    []);
  const _nCol      = useMemo(() => Array.from({ length: N }, () => new THREE.Color()), []);

  // ── Three.js objects ──────────────────────────────────────────────────────
  const tex     = useMemo(() => buildGlowTexture(), []);

  const lineGeo = useMemo(() => {
    const geo  = new THREE.BufferGeometry();
    const posA = new Float32Array(MAX_CONNS * 6);  // MAX_CONNS edges × 2 verts × 3 xyz
    const colA = new Float32Array(MAX_CONNS * 6);
    geo.setAttribute('position',
      new THREE.BufferAttribute(posA, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color',
      new THREE.BufferAttribute(colA, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const lineMat = useMemo(() => new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent:  true,
    opacity:      1.0,
    depthWrite:   false,
    blending:     THREE.AdditiveBlending,
    toneMapped:   false,
  }), []);

  const meshRef = useRef();

  // ── Activation wave / complete flash ─────────────────────────────────────
  useEffect(() => {
    // Clear any in-flight wave before starting a new one
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (phase === 'executing') {
      const nd  = nodesRef.current;
      const a   = actRef.current;
      const ac  = actColRef.current;
      const key = getToolKey(currentTool);
      const acc = key ? TOOL_ACC[key] : DEF_ACC;
      const dir = key ? TOOL_DIR[key] : new THREE.Vector3(0, 1, 0);

      // Find inner node closest to tool direction
      let seed = 0, best = -Infinity;
      for (let i = 0; i < N_INNER; i++) {
        const d = nd[i].pos.clone().normalize().dot(dir);
        if (d > best) { best = d; seed = i; }
      }

      // Adjacent nodes within threshold
      const adj = (idx) => {
        const r = [];
        for (let j = 0; j < N; j++) {
          if (j !== idx && nd[idx].pos.distanceTo(nd[j].pos) < THRESH) r.push(j);
        }
        return r;
      };

      // Hop 0 — seed fires immediately
      a[seed] = 1.0;
      ac[seed].copy(acc);
      const hop1 = adj(seed);

      // Hop 1 — 150 ms
      timers.current.push(setTimeout(() => {
        hop1.forEach(i => { a[i] = Math.max(a[i], 0.70); ac[i].copy(acc); });

        // Gather hop-2 candidates: connected to hop-1, not already bright
        const h2set = new Set();
        hop1.forEach(i => adj(i).forEach(j => { if (a[j] < 0.55) h2set.add(j); }));
        const hop2 = [...h2set];

        // Hop 2 — 300 ms
        timers.current.push(setTimeout(() => {
          hop2.forEach(i => { a[i] = Math.max(a[i], 0.45); ac[i].copy(acc); });

          const h3set = new Set();
          hop2.forEach(i => adj(i).forEach(j => { if (a[j] < 0.30) h3set.add(j); }));

          // Hop 3 — 450 ms
          timers.current.push(setTimeout(() => {
            [...h3set].forEach(i => { a[i] = Math.max(a[i], 0.25); ac[i].copy(acc); });
          }, 150));
        }, 150));
      }, 150));

    } else if (phase === 'complete') {
      // Full-network white flash: ramp to full brightness over 200 ms (4 × 50 ms steps)
      // then let the normal 0.8 s decay handle the fade.
      const a  = actRef.current;
      const ac = actColRef.current;
      for (let s = 1; s <= 4; s++) {
        timers.current.push(setTimeout(() => {
          for (let i = 0; i < N; i++) {
            a[i] = Math.max(a[i], s / 4);
            ac[i].setRGB(1, 1, 1);
          }
        }, s * 50));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentTool]);

  // Cleanup timers on unmount
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // ── Per-frame update ──────────────────────────────────────────────────────
  useFrame((_, dt) => {
    frameN.current++;
    elapsedRef.current += dt;
    const elapsed = elapsedRef.current;

    const nd  = nodesRef.current;
    const cfg = PC[phase] ?? PC.idle;

    // Lerp factors (framerate-independent exponential approach)
    const fC = 1 - Math.pow(1 - 0.018, dt * 60);
    const fO = 1 - Math.pow(1 - 0.028, dt * 60);

    // ── 1. Lerp global visual state ───────────────────────────────────────
    _tgt.setRGB(...targetUniforms.uStateColor);
    lColor.current.lerp(_tgt, fC);
    if (phase === 'tier3') lColor.current.lerp(_t3Col, 0.025);
    lCOp.current   += (cfg.cOp   - lCOp.current)   * fO;
    lDrift.current += (cfg.drift - lDrift.current)  * fO;

    // ── 2. Node drift + soft radial boundary ─────────────────────────────
    // Speaking: field becomes agitated — drift speed rises with amplitude
    // Listening: nodes pulse outward with user's voice energy (Jarvis effect)
    const ampDriftMult = audioState.isSpeaking
      ? 1.0 + audioState.ttsAmplitude * 5.0     // stronger speaking surge
      : audioState.isListening
        ? 1.0 + audioState.micAmplitude * 4.0   // strong listening pulse
        : 1.0;
    const ds = lDrift.current * dt * 60 * ampDriftMult;

    // Listening: strong inward convergence with amplitude — field "breathes"
    const listenPull = audioState.isListening ? audioState.micAmplitude * 0.40 : 0;

    for (let i = 0; i < N; i++) {
      const n = nd[i];

      // Advance position
      n.pos.addScaledVector(n.vel, ds * 0.001);

      // Target radius (tier3: outer sentinels drawn inward; listening: slight pull)
      const nomR = (phase === 'tier3' && n.pop === 2)
        ? n.nomR - 0.60
        : n.nomR - listenPull;

      // Soft restoring force when outside tolerance band
      const dev = n.pos.length() - nomR;
      if (Math.abs(dev) > 0.35) {
        _restDir.copy(n.pos).normalize();
        if (dev > 0) _restDir.negate();   // pull toward center
        n.vel.addScaledVector(_restDir, Math.abs(dev) * 0.00008 * ds);
      }

      // Damping + velocity cap
      n.vel.multiplyScalar(0.9993);
      const vLen = n.vel.length();
      if (vLen > n.vMax) n.vel.setLength(n.vMax);
    }

    // ── 2.5. Amplitude-driven activation waves ───────────────────────────────
    // TTS: waves on loud moments (ARIA speaking) — cyan/tool colour
    // Mic: waves on speech peaks (user speaking) — soft white pulse
    const nowMs = performance.now();

    const ttsPeak = audioState.isSpeaking && audioState.ttsAmplitude > 0.45;
    const micPeak = audioState.isListening && audioState.micAmplitude > 0.12;

    if ((ttsPeak || micPeak) && nowMs - lastWaveMs.current > 380) {
      lastWaveMs.current = nowMs;
      const seedIdx = Math.floor(Math.random() * N_INNER);
      const key     = getToolKey(currentTool);
      const acc     = micPeak
        ? new THREE.Color(0.7, 0.9, 1.0)    // mic = cool white-blue
        : (key ? TOOL_ACC[key] : DEF_ACC);

      const amp = micPeak ? 0.65 : Math.min(1.0, audioState.ttsAmplitude * 1.5);
      actRef.current[seedIdx] = amp;
      actColRef.current[seedIdx].copy(acc);

      const hop1 = [];
      for (let j = 0; j < N; j++) {
        if (j !== seedIdx && nd[seedIdx].pos.distanceTo(nd[j].pos) < THRESH)
          hop1.push(j);
      }
      timers.current.push(setTimeout(() => {
        hop1.forEach((i) => {
          actRef.current[i] = Math.max(actRef.current[i], amp * 0.60);
          actColRef.current[i].copy(acc);
        });
        // Extra second hop for mic peaks (user voice → bigger ripple)
        if (micPeak) {
          const hop2 = new Set();
          hop1.forEach((i) => {
            for (let j = 0; j < N; j++) {
              if (j !== i && actRef.current[j] < 0.35 &&
                  nd[i].pos.distanceTo(nd[j].pos) < THRESH) hop2.add(j);
            }
          });
          setTimeout(() => {
            hop2.forEach((i) => {
              actRef.current[i] = Math.max(actRef.current[i], amp * 0.35);
              actColRef.current[i].copy(acc);
            });
          }, 120);
        }
      }, 100));
    }

    // ── 3. Decay per-node activations ─────────────────────────────────────
    const a   = actRef.current;
    const ac  = actColRef.current;
    const dec = dt / 0.80;   // full decay in 0.80 s
    for (let i = 0; i < N; i++) {
      if (a[i] > 0) a[i] = Math.max(0, a[i] - dec);
    }

    // ── 4. Compute per-node display colour (state + activation overlay) ───
    for (let i = 0; i < N; i++) {
      _nCol[i].copy(lColor.current);
      if (a[i] > 0) _nCol[i].lerp(ac[i], a[i]);
    }

    // ── 5. Rebuild connection cache every 3 frames ────────────────────────
    if (frameN.current % 3 === 0) {
      const nc = [];
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const d = nd[i].pos.distanceTo(nd[j].pos);
          if (d < THRESH) {
            nc.push({ i, j, op: (1 - d / THRESH) * 0.12 });
          }
        }
      }
      // Brightest connections first; cap at MAX_CONNS
      nc.sort((x, y) => y.op - x.op);
      if (nc.length > MAX_CONNS) nc.length = MAX_CONNS;
      connCache.current = nc;
    }

    // ── 6. Write connection geometry ──────────────────────────────────────
    const cc  = connCache.current;
    const pA  = lineGeo.attributes.position.array;
    const cA  = lineGeo.attributes.color.array;

    // Tier3: slow sine pulse on connection brightness
    const t3P = (phase === 'tier3')
      ? 0.65 + 0.35 * Math.sin(performance.now() * 0.0010)
      : 1.0;

    // Audio amplitude scales connection brightness (Jarvis-style):
    //   speaking → strong flare with TTS amplitude
    //   listening → dramatic pulse with user's voice energy
    const connAmpMult = audioState.isSpeaking
      ? 0.5 + audioState.ttsAmplitude * 3.5     // bright flare when ARIA speaks
      : audioState.isListening
        ? 0.3 + audioState.micAmplitude * 3.0   // breathes with user's voice
        : 1.0;

    for (let c = 0; c < cc.length; c++) {
      const { i, j, op } = cc[c];
      const ci    = c * 6;
      const effOp = op * lCOp.current * t3P * connAmpMult;

      // Vertex positions
      pA[ci]   = nd[i].pos.x;  pA[ci+1] = nd[i].pos.y;  pA[ci+2] = nd[i].pos.z;
      pA[ci+3] = nd[j].pos.x;  pA[ci+4] = nd[j].pos.y;  pA[ci+5] = nd[j].pos.z;

      // Vertex colours: blended node colours scaled by effective opacity.
      // With AdditiveBlending and no alpha, the "opacity" lives in the RGB values.
      const cr = (_nCol[i].r + _nCol[j].r) * 0.5 * effOp;
      const cg = (_nCol[i].g + _nCol[j].g) * 0.5 * effOp;
      const cb = (_nCol[i].b + _nCol[j].b) * 0.5 * effOp;
      cA[ci]   = cr;  cA[ci+1] = cg;  cA[ci+2] = cb;
      cA[ci+3] = cr;  cA[ci+4] = cg;  cA[ci+5] = cb;
    }

    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate    = true;
    lineGeo.setDrawRange(0, cc.length * 2);   // 2 vertices per segment

    // ── 7. Update node sprite instances ──────────────────────────────────
    const mesh = meshRef.current;
    if (!mesh) return;

    camera.getWorldQuaternion(_qCam);

    for (let i = 0; i < N; i++) {
      const n = nd[i];

      // Per-node twinkle: slow sinusoidal shimmer at each node's own frequency
      let twinkle  = 1.0 + Math.sin(elapsed * n.twinkleSpeed + n.twinklePhase) * 0.3;
      let sizeMult = 1.0;
      if (n.isBright) {
        twinkle  *= 1.8;   // bright nodes flare harder (range ≈ 1.26–2.34)
        sizeMult  = 1.4;   // and sit visually larger
      }

      // Nodes swell with amplitude — speaking grows from TTS, listening from mic
      const ampNodeMult = audioState.isSpeaking
        ? 1.0 + audioState.ttsAmplitude * 0.70
        : audioState.isListening
          ? 1.0 + audioState.micAmplitude * 0.55
          : 1.0;

      // Activated nodes grow up to 1.5× their base size; twinkle + audio add shimmer
      _scl.setScalar(n.sz * sizeMult * (1.0 + a[i] * 0.50) * twinkle * ampNodeMult);
      _pos.copy(n.pos);
      _mat.compose(_pos, _qCam, _scl);
      mesh.setMatrixAt(i, _mat);

      // Opacity: base + activation boost × twinkle; baked into RGB for AdditiveBlending
      const opacity = (n.opBase + a[i] * (1.0 - n.opBase)) * twinkle;
      _col.copy(_nCol[i]).multiplyScalar(opacity);
      mesh.setColorAt(i, _col);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // ── Dispose on unmount ────────────────────────────────────────────────────
  useEffect(() => () => {
    lineGeo.dispose();
    lineMat.dispose();
    tex.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Node glow sprites — camera-billboarded InstancedMesh */}
      <instancedMesh
        ref={meshRef}
        args={[null, null, N]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={tex}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      {/* Synapse connections — 1-px LineSegments, vertex-colour opacity */}
      <lineSegments
        geometry={lineGeo}
        material={lineMat}
        frustumCulled={false}
      />
    </>
  );
}
