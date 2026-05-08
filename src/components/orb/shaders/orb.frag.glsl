// ARIA Orb — Fragment Shader
// Physically-based thin-film iridescence:
//   • Snell's law gives the refraction angle inside the film
//   • Optical path difference at that angle produces RGB interference
//   • Animated film thickness makes the color palette breathe over time
//
// Final look: the center is fully transparent (glass); the rim glows with
// angle-dependent prismatic color + the current phase state color.

precision highp float;

uniform float uTime;
uniform vec3  uStateColor;
uniform float uIntensity;
uniform float uIridescenceStrength;
uniform float uPulseSpeed;

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;
varying vec2 vUv;

#define PI 3.14159265359

// ─────────────────────────────────────────────────────────────────────────────
// Value noise — used for frosted-glass interior haze
//
// hash31: maps a vec3 seed to a pseudo-random float in [0,1]
// valueNoise: trilinear interpolation of 8 lattice corners
// ─────────────────────────────────────────────────────────────────────────────
float hash31(vec3 p) {
    p  = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    // Smoothstep — C2-continuous
    vec3 u = f * f * (3.0 - 2.0 * f);

    float v000 = hash31(i + vec3(0,0,0));
    float v100 = hash31(i + vec3(1,0,0));
    float v010 = hash31(i + vec3(0,1,0));
    float v110 = hash31(i + vec3(1,1,0));
    float v001 = hash31(i + vec3(0,0,1));
    float v101 = hash31(i + vec3(1,0,1));
    float v011 = hash31(i + vec3(0,1,1));
    float v111 = hash31(i + vec3(1,1,1));

    return mix(
        mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
        mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y),
        u.z
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin-film interference via Snell's law
//
// For a film of thickness T (nanometers), refractive index n2, illuminated
// from air (n1=1.0) at incidence angle θ1 (cosine = NdotV):
//
//   sinθ2 = (n1/n2) · sinθ1              ← Snell's law
//   cosθ2 = sqrt(1 - sinθ2²)
//   OPD   = 2 · n2 · T · cosθ2           ← path difference inside film
//   I(λ)  = 0.5 + 0.5·cos(2π·OPD/λ)     ← constructive/destructive
//
// λ values: R=650nm  G=550nm  B=450nm (approximate photopic primaries)
// ─────────────────────────────────────────────────────────────────────────────
vec3 thinFilm(float NdotV, float filmThickness) {
    const float n1 = 1.000;   // air
    const float n2 = 1.450;   // glass-like film

    // Snell's law: angle inside the film
    float sinTheta1 = sqrt(max(0.0, 1.0 - NdotV * NdotV));
    float sinTheta2 = (n1 / n2) * sinTheta1;
    float cosTheta2 = sqrt(max(0.0, 1.0 - sinTheta2 * sinTheta2));

    // Optical path difference (nm)
    float OPD = 2.0 * n2 * filmThickness * cosTheta2;

    // Per-channel interference
    float r = 0.5 + 0.5 * cos(2.0 * PI * OPD / 650.0);
    float g = 0.5 + 0.5 * cos(2.0 * PI * OPD / 550.0);
    float b = 0.5 + 0.5 * cos(2.0 * PI * OPD / 450.0);

    return vec3(r, g, b);
}

void main() {
    vec3 N    = normalize(vNormal);
    vec3 V    = normalize(vViewDirection);
    float NdotV = max(0.0, dot(N, V));

    // ── Fresnel ──────────────────────────────────────────────────────────────
    // Edge glow, transparent center.  Exponent 2.5 gives a broader, softer rim.
    float fresnel = pow(1.0 - NdotV, 2.5);

    // ── Base iridescence (static film thickness) ─────────────────────────────
    float baseThickness = 400.0; // nm
    vec3 iriBase = thinFilm(NdotV, baseThickness);

    // ── Animated shimmer layer — film thickness varies with time + position ──
    // This makes the colors slowly drift and cycle like a soap bubble in light.
    float animThickness = baseThickness
        + sin(uTime * 0.70) * 150.0
        + cos(uTime * 0.40 + vUv.y * 3.0) * 100.0;
    vec3 iriShimmer = thinFilm(NdotV, animThickness);

    // Blend static + shimmer
    vec3 iridescence = mix(iriBase, iriShimmer, 0.40) * uIridescenceStrength;

    // ── State-color tint at the rim ──────────────────────────────────────────
    // State color bleeds in at the outermost glancing angles (where fresnel≈1)
    // so executing/recovering/tier3 are still visually distinct.
    vec3 rimTinted   = mix(iridescence, uStateColor, 0.35);
    vec3 finalColor  = mix(iridescence, rimTinted, fresnel);
    finalColor      += uStateColor * fresnel * uIntensity * 0.60;

    // ── Organic breathing pulse ──────────────────────────────────────────────
    float pulse  = 0.84 + 0.16 * sin(uTime * uPulseSpeed);
    finalColor  *= pulse;

    // ── Frosted glass interior haze ──────────────────────────────────────────
    // Light diffuses through the glass body: strongest at center (NdotV≈1),
    // modulated by 3-D value noise to break up the uniformity.
    // Two octaves of noise give a soft granular frost texture.
    vec3  noiseCoord   = vWorldPosition * 3.0 + uTime * 0.10;
    float noiseVal     = valueNoise(noiseCoord) * 0.65
                       + valueNoise(noiseCoord * 2.1 + 7.3) * 0.35;
    float interiorHaze = (1.0 - NdotV) * 0.12 + noiseVal * 0.06;
    // Tint: mostly white milky light, lightly shaded by the current state color
    vec3  hazeColor    = mix(vec3(1.0), uStateColor, 0.30) * interiorHaze;
    finalColor        += hazeColor;

    // ── Prismatic internal caustics ──────────────────────────────────────────
    // Overlapping sin-wave interference → moving bright patches.
    // The spectral color split (0° / 120° / 240°) turns each patch prismatic.
    float caustic1 = sin(vWorldPosition.x *  8.0 + uTime * 0.30)
                   * sin(vWorldPosition.y *  6.0 + uTime * 0.20)
                   * sin(vWorldPosition.z *  7.0 + uTime * 0.25);
    float caustic2 = sin(vWorldPosition.x * 12.0 - uTime * 0.40)
                   * cos(vWorldPosition.y * 10.0 + uTime * 0.15);
    float caustics  = max(0.0, caustic1) * max(0.0, caustic2);
    caustics        = pow(caustics, 2.0) * 0.4;

    vec3 causticColor = vec3(
        pow(max(0.0, sin(caustics * PI + 0.00)), 2.0),
        pow(max(0.0, sin(caustics * PI + 2.09)), 2.0),
        pow(max(0.0, sin(caustics * PI + 4.19)), 2.0)
    ) * caustics * uIridescenceStrength;
    // Caustics show through the body; fade them at the rim where fresnel wins
    finalColor += causticColor * (1.0 - fresnel * 0.8);

    // ── Directional lighting — additive only, no darkening ──────────────
    // AdditiveBlending on a transparent Electron window means any
    // finalColor *= k (k < 1) turns the orb into an invisible dark disk.
    // Rule: we only ADD light.  No subtract, no multiply-below-1.
    //
    // Key light from upper-left — specular glint + warmth tint.
    vec3  lightDir = normalize(vec3(-0.6, 0.8, 0.5));
    vec3  halfVec  = normalize(lightDir + V);
    float spec     = pow(max(0.0, dot(N, halfVec)), 48.0);

    // Warm specular glint, strongest at the rim (where the orb is visible)
    finalColor += vec3(1.0, 0.98, 0.95) * spec * 0.55 * fresnel;

    // Subtle warmth on the lit hemisphere (+8 % max, non-darkening)
    float warmth = max(0.0, dot(N, lightDir)) * 0.08;
    finalColor  += finalColor * warmth;

    // ── Brightness boost — compensates for no Bloom pass ────────────────
    // Without EffectComposer/Bloom the rim must be self-luminous.
    // 1.8× keeps values well above what was boosted by bloom previously.
    finalColor *= 1.8;

    // ── Alpha — glass ring + frosted interior ───────────────────────────────
    // Center (NdotV≈1, fresnel≈0) → mostly transparent, but the frosted haze
    //   and caustics need a small alpha floor or AdditiveBlending makes them
    //   invisible (color × 0 alpha = nothing drawn over the desktop).
    // Rim   (NdotV≈0, fresnel≈1) → opaque glowing band.
    float bodyHaze = (1.0 - NdotV) * uIntensity * 0.12;
    // interiorHaze already computed above — add a fraction to alpha so the
    // frosted glow and caustics are composited onto the transparent window.
    float alpha    = clamp(fresnel * 2.2 + bodyHaze + interiorHaze * 0.50, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
}
