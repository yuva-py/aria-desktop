// SpectralStreaks.jsx
// Razor-thin spectral ribbon streaks radiating from the orb.
// Each streak = camera-aligned ribbon from CatmullRomCurve3, re-tessellated
// every frame so the ribbon width always faces the camera.
//
// Layers:
//   IDLE    — 3 ultra-faint violet hair-lines, always rotating
//   PRIMARY — 4 bright full-spectrum beams  (executing only)
//   GHOST   — 6 secondary refraction beams  (executing only)
//   MICRO   — 10 short dense near-orb streaks (executing only)

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree }         from '@react-three/fiber';
import * as THREE from 'three';

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = `
  precision highp float;
  attribute float aAlpha;
  varying   vec2  vUv;
  varying   float vAlpha;
  void main() {
    vUv    = uv;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  #define PI 3.14159265359
  uniform float uOpacity;
  varying vec2  vUv;
  varying float vAlpha;

  vec3 spectralColor(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.17) return mix(vec3(1.00,0.05,0.02), vec3(1.00,0.40,0.00), t/0.17);
    if (t < 0.33) return mix(vec3(1.00,0.40,0.00), vec3(1.00,0.90,0.00), (t-0.17)/0.16);
    if (t < 0.50) return mix(vec3(1.00,0.90,0.00), vec3(0.10,1.00,0.20), (t-0.33)/0.17);
    if (t < 0.67) return mix(vec3(0.10,1.00,0.20), vec3(0.00,0.40,1.00), (t-0.50)/0.17);
    if (t < 0.83) return mix(vec3(0.00,0.40,1.00), vec3(0.40,0.00,1.00), (t-0.67)/0.16);
    return           mix(vec3(0.40,0.00,1.00), vec3(0.80,0.00,0.60), (t-0.83)/0.17);
  }

  void main() {
    float crossGlow = 1.0 - abs(vUv.y * 2.0 - 1.0);
    crossGlow = pow(crossGlow, 1.5);
    float lengthFade = sin(vUv.x * PI) * 0.8 + 0.2;
    float aberration = (vUv.y - 0.5) * 0.3;
    vec3  color = spectralColor(vUv.x + aberration * 0.1);
    float alpha = crossGlow * lengthFade * vAlpha * uOpacity;
    gl_FragColor = vec4(color * 1.5, alpha);
  }
`;

// ── Module-level reusables (never allocated inside the frame loop) ─────────────
const _tang    = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
const _wAxis   = new THREE.Vector3();
const _camPos  = new THREE.Vector3();

// ── Ribbon geometry helpers ───────────────────────────────────────────────────
function makeRibbonGeo(samples) {
  const positions = new Float32Array(samples * 2 * 3);
  const uvs       = new Float32Array(samples * 2 * 2);
  const alphas    = new Float32Array(samples * 2);
  const indices   = new Uint16Array((samples - 1) * 6);

  for (let i = 0; i < samples; i++) {
    const t     = i / (samples - 1);
    const taper = 1.0 - t * 0.75;
    uvs[i*4]   = t; uvs[i*4+1] = 0;
    uvs[i*4+2] = t; uvs[i*4+3] = 1;
    alphas[i*2] = alphas[i*2+1] = taper;
  }
  for (let i = 0; i < samples - 1; i++) {
    const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
    indices[i*6]   = a; indices[i*6+1] = b; indices[i*6+2] = c;
    indices[i*6+3] = b; indices[i*6+4] = d; indices[i*6+5] = c;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,  2));
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

function updateRibbon(geo, pts, camPos, hw) {
  const posAttr = geo.attributes.position;
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const pt   = pts[i];
    const prev = pts[Math.max(0, i-1)];
    const next = pts[Math.min(N-1, i+1)];

    _tang.subVectors(next, prev);
    if (_tang.lengthSq() < 1e-10) _tang.set(0, 0.001, 0);
    _tang.normalize();

    _viewDir.subVectors(pt, camPos);
    if (_viewDir.lengthSq() < 1e-10) _viewDir.set(0, 0, 1);
    _viewDir.normalize();

    _wAxis.crossVectors(_tang, _viewDir);
    if (_wAxis.lengthSq() < 1e-10) _wAxis.set(1, 0, 0);
    _wAxis.normalize();

    const taper = 1.0 - (i / (N-1)) * 0.75;
    const w = hw * taper;
    posAttr.setXYZ(i*2,   pt.x + _wAxis.x*w, pt.y + _wAxis.y*w, pt.z + _wAxis.z*w);
    posAttr.setXYZ(i*2+1, pt.x - _wAxis.x*w, pt.y - _wAxis.y*w, pt.z - _wAxis.z*w);
  }
  posAttr.needsUpdate = true;
  geo.computeBoundingSphere();
}

// ── Streak definitions ────────────────────────────────────────────────────────
const DEFS = [
  // Idle — always visible, ultra faint violet
  { layer:'idle',    hw:0.0008, opMax:0.08, rot:0.005, a:0,     rEnd:3.5, po:0.12, s:60 },
  { layer:'idle',    hw:0.0008, opMax:0.08, rot:0.005, a:2.094, rEnd:3.5, po:0.10, s:60 },
  { layer:'idle',    hw:0.0008, opMax:0.08, rot:0.005, a:4.188, rEnd:3.5, po:0.15, s:60 },
  // Primary
  { layer:'primary', hw:0.0025, opMax:1.0,  rot:0.015, a:0,     rEnd:5.0, po:0.20, s:60 },
  { layer:'primary', hw:0.0025, opMax:1.0,  rot:0.015, a:1.570, rEnd:4.8, po:0.18, s:60 },
  { layer:'primary', hw:0.0025, opMax:1.0,  rot:0.015, a:3.141, rEnd:5.2, po:0.22, s:60 },
  { layer:'primary', hw:0.0025, opMax:1.0,  rot:0.015, a:4.712, rEnd:4.7, po:0.16, s:60 },
  // Ghost
  { layer:'ghost',   hw:0.0012, opMax:0.40, rot:0.022, a:0.30,  rEnd:4.5, po:0.25, s:60 },
  { layer:'ghost',   hw:0.0012, opMax:0.40, rot:0.022, a:1.870, rEnd:4.3, po:0.20, s:60 },
  { layer:'ghost',   hw:0.0012, opMax:0.40, rot:0.022, a:3.441, rEnd:4.6, po:0.28, s:60 },
  { layer:'ghost',   hw:0.0012, opMax:0.40, rot:0.022, a:5.012, rEnd:4.4, po:0.22, s:60 },
  { layer:'ghost',   hw:0.0012, opMax:0.40, rot:0.022, a:0.785, rEnd:4.2, po:0.18, s:60 },
  { layer:'ghost',   hw:0.0012, opMax:0.40, rot:0.022, a:2.356, rEnd:4.5, po:0.24, s:60 },
  // Micro
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:0.20,  rEnd:2.8, po:0.08, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:0.83,  rEnd:2.6, po:0.10, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:1.46,  rEnd:2.9, po:0.07, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:2.09,  rEnd:2.7, po:0.09, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:2.72,  rEnd:2.8, po:0.08, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:3.35,  rEnd:2.6, po:0.11, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:3.98,  rEnd:2.9, po:0.07, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:4.61,  rEnd:2.7, po:0.09, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:5.24,  rEnd:2.8, po:0.08, s:30 },
  { layer:'micro',   hw:0.0006, opMax:0.25, rot:0.008, a:5.87,  rEnd:2.6, po:0.10, s:30 },
];

const TOTAL      = DEFS.length;
const RADIUS_START = 1.6;
const TOOL_OFFSET  = { browser_tool:0.3, file_tool:2.8, system_tool:1.57, code_tool:5.5 };

// ── Component ─────────────────────────────────────────────────────────────────
export default function SpectralStreaks({ phase, currentTool }) {
  const { camera } = useThree();
  const groupRef   = useRef();

  // All geometry/material created once and stored in a ref (not useMemo)
  // so they are never recreated on re-render.
  const dataRef = useRef(null);

  // Perpendicular axes per streak (static, computed once)
  const perpAxes = useMemo(() => DEFS.map(def => {
    const dir = new THREE.Vector3(Math.cos(def.a), 0.2, Math.sin(def.a)).normalize();
    const up  = new THREE.Vector3(0, 1, 0);
    const p1  = new THREE.Vector3().crossVectors(dir, up);
    if (p1.lengthSq() < 1e-6) p1.crossVectors(dir, new THREE.Vector3(1, 0, 0));
    p1.normalize();
    const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
    return { p1, p2 };
  }), []);

  // Pre-allocated sample buffers per streak
  const sampledBufs = useMemo(() =>
    DEFS.map(def => Array.from({ length: def.s }, () => new THREE.Vector3())), []);

  // Build all THREE objects imperatively after mount, add to group
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const geos  = [];
    const mats  = [];
    const state = [];

    for (let i = 0; i < TOTAL; i++) {
      const def = DEFS[i];

      const geo = makeRibbonGeo(def.s);
      const mat = new THREE.ShaderMaterial({
        vertexShader:   VERT,
        fragmentShader: FRAG,
        uniforms:       { uOpacity: { value: 0 } },
        transparent:    true,
        blending:       THREE.AdditiveBlending,
        depthWrite:     false,
        side:           THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);

      geos.push(geo);
      mats.push(mat);
      state.push({
        rotation: def.a,
        extendT:  def.layer === 'idle' ? 1.0 : 0.0,
        opacity:  def.layer === 'idle' ? def.opMax : 0.0,
      });
    }

    // CatmullRomCurve3 control points per streak
    const curves = DEFS.map(() => {
      const pts = [
        new THREE.Vector3(), new THREE.Vector3(),
        new THREE.Vector3(), new THREE.Vector3(),
      ];
      return { curve: new THREE.CatmullRomCurve3(pts), pts };
    });

    dataRef.current = { geos, mats, state, curves };

    return () => {
      geos.forEach(g => g.dispose());
      mats.forEach(m => m.dispose());
      while (group.children.length) group.remove(group.children[0]);
      dataRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevPhaseRef = useRef(phase);

  useFrame(({ clock }, dt) => {
    if (!dataRef.current) return;
    const { geos, mats, state, curves } = dataRef.current;

    const isExec = phase === 'executing';
    prevPhaseRef.current = phase;
    const toolBias = TOOL_OFFSET[currentTool] ?? 0;

    _camPos.setFromMatrixPosition(camera.matrixWorld);

    for (let i = 0; i < TOTAL; i++) {
      const def     = DEFS[i];
      const st      = state[i];
      const mat     = mats[i];
      const { curve, pts } = curves[i];
      const { p1, p2 }     = perpAxes[i];
      const sampled = sampledBufs[i];

      st.rotation += def.rot * dt;
      const angle  = st.rotation + (def.layer === 'primary' ? toolBias * 0.15 : 0);

      // Streak direction
      const dx = Math.cos(angle), dz = Math.sin(angle), dy = 0.15;
      const dl = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const nx = dx/dl, ny = dy/dl, nz = dz/dl;

      // Opacity / extendT
      if (def.layer === 'idle') {
        st.extendT = 1.0;
        st.opacity = THREE.MathUtils.lerp(st.opacity, def.opMax, Math.min(dt * 3, 1));
      } else {
        const tgt   = isExec ? 1.0 : 0.0;
        const spd   = isExec ? 2.5 : 3.5;
        st.extendT  = THREE.MathUtils.lerp(st.extendT, tgt, Math.min(dt * spd, 1));
        st.opacity  = THREE.MathUtils.lerp(st.opacity, isExec ? def.opMax : 0, Math.min(dt * 2.5, 1));
      }

      mat.uniforms.uOpacity.value = st.opacity;
      if (st.opacity < 0.002) continue;

      // Curve control points
      const rEnd = THREE.MathUtils.lerp(RADIUS_START, def.rEnd, st.extendT);
      pts[0].set(nx * RADIUS_START, ny * RADIUS_START, nz * RADIUS_START);
      pts[3].set(nx * rEnd, ny * rEnd, nz * rEnd);
      pts[1].lerpVectors(pts[0], pts[3], 0.33).addScaledVector(p1, def.po);
      pts[2].lerpVectors(pts[0], pts[3], 0.66).addScaledVector(p2, def.po * 0.7);

      // Sample curve into pre-allocated buffers
      const N = def.s;
      for (let j = 0; j < N; j++) {
        curve.getPoint(j / (N - 1), sampled[j]);
      }

      // Width pulse using elapsed time (not Date.now)
      const t    = clock.getElapsedTime();
      const pulse = 1.0 + Math.sin(t * 2.0 + i) * 0.15;
      updateRibbon(geos[i], sampled, _camPos, def.hw * pulse);
    }
  });

  return <group ref={groupRef} />;
}
