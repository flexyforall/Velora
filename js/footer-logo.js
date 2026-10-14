// Footer wordmark (Figma «Footer», 1455:2859): the logo starts broken up by the «Pattern refraction»
// effect of the first frame (lenticular stripes at 45°, strength −7) and comes together into the clean
// logo of the second frame as the page is scrolled to the end. Figma runs that effect as a WebGPU
// shader; this is the same shader ported to WebGL, so it works in every browser. Without WebGL, or
// with reduced motion, the static logo from the Home frame stays.

// Figma «Pattern refraction» parameters of the first frame, already converted the way the effect's
// render() converts them: radius 8.16% → 20 + 0.0816 × 980 px, angle 45° → −45°, strength −7 → −70 px,
// dispersion 4% → 0.01, smoothness 0 → 0.001.
const REFRACTION = { size: 99.968, angle: (-45 * Math.PI) / 180, amount: -70, dispersion: 0.01, seamlessness: 0.001 };

const VERTEX_SHADER = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// N × N samples per pixel, as the original's MSAA loop (6 × 6 for still frames).
const fragmentShader = (samples) => `
precision highp float;
#define N ${samples}
const float PI = 3.14159265358979323846;
uniform sampler2D uTexture;
uniform vec2 uDims;
uniform vec2 uCenter;
uniform float uAngle;
uniform float uSize;
uniform float uAmount;
uniform float uSeamlessness;
uniform float uDispersion;
varying vec2 vUv;

float patternHeight(vec2 p, mat2 rotation, float invSize) {
  vec2 pos = rotation * (p - uCenter) * invSize;
  vec2 gridPos = fract(pos) * 2.0 - 1.0;
  float height = pow(sin((gridPos.x * 0.5 + 0.5) * PI), 0.7); // lenticular
  height = clamp(height, 0.0, 1.0);
  return height * pow(height, uSeamlessness);
}

vec3 patternNormals(vec2 p, mat2 rotation, float invSize) {
  float height = patternHeight(p, rotation, invSize);
  float h1 = patternHeight(p + vec2(0.125, 0.0), rotation, invSize);
  float v1 = patternHeight(p + vec2(0.0, 0.125), rotation, invSize);
  return normalize(vec3(height - h1, height - v1, 0.0125));
}

// Edge wrap «Zero»: nothing outside the layer.
vec4 sampleAt(vec2 pixelPos) {
  vec2 uv = pixelPos / uDims;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uTexture, uv);
}

void main() {
  vec2 localPos = vUv * uDims;
  vec3 ray = vec3(0.0, 0.0, -1.0);
  mat2 rotation = mat2(cos(uAngle), sin(uAngle), -sin(uAngle), cos(uAngle));
  float invSize = 1.0 / uSize;
  float iorR = 1.333 + uDispersion;
  float iorG = 1.333;
  float iorB = 1.333 - uDispersion;

  vec4 accum = vec4(0.0);
  for (int i = 0; i < N; i++) {
    for (int j = 0; j < N; j++) {
      vec2 offset = vec2(float(i), float(j)) / float(N) - (float(N) - 1.0) / float(N) * 0.5;
      vec3 nor = patternNormals(localPos + offset, rotation, invSize);
      accum.r += sampleAt(localPos + refract(ray, nor, iorR).xy * uAmount).r;
      vec4 colG = sampleAt(localPos + refract(ray, nor, iorG).xy * uAmount);
      accum.g += colG.g;
      accum.a += colG.a;
      accum.b += sampleAt(localPos + refract(ray, nor, iorB).xy * uAmount).b;
    }
  }
  gl_FragColor = accum / float(N * N);
}`;

// Draws `image` (the clean logo) through the refraction effect into `canvas`, whose CSS size is the
// layer size in the design. Returns render(strength, still): strength 1 is the first frame's effect,
// 0 the clean logo; `still` uses the full 6 × 6 sampling. Returns null without WebGL.
const createLogoRefraction = (canvas, image) => {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const link = (samples) => {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader(samples)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniform = (name) => gl.getUniformLocation(program, name);
    return {
      program,
      aPos: gl.getAttribLocation(program, 'aPos'),
      aUv: gl.getAttribLocation(program, 'aUv'),
      uniforms: Object.fromEntries(['uTexture', 'uDims', 'uCenter', 'uAngle', 'uSize', 'uAmount', 'uSeamlessness', 'uDispersion']
        .map((name) => [name, uniform(name)])),
    };
  };

  let programs;
  try {
    // 6 × 6 like the original for still frames, 3 × 3 while scrolling to keep it light.
    programs = { still: link(6), moving: link(3) };
  } catch (error) {
    return null;
  }

  // Full-screen quad: position, uv (uv y runs down, as in the original).
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0,
    -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0,
  ]), gl.STATIC_DRAW);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  // Non-power-of-two texture: clamp and no mipmaps.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return (strength, still) => {
    // Pattern size and strength are in layer pixels, so the effect is the same at any pixel density.
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, pixelWidth, pixelHeight);

    const { program, aPos, aUv, uniforms } = still ? programs.still : programs.moving;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform2f(uniforms.uDims, width, height);
    gl.uniform2f(uniforms.uCenter, width / 2, height / 2);
    gl.uniform1f(uniforms.uAngle, REFRACTION.angle);
    gl.uniform1f(uniforms.uSize, REFRACTION.size);
    gl.uniform1f(uniforms.uAmount, REFRACTION.amount * strength);
    gl.uniform1f(uniforms.uSeamlessness, REFRACTION.seamlessness);
    gl.uniform1f(uniforms.uDispersion, REFRACTION.dispersion);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
};

const footerWordmark = document.querySelector('.footer__wordmark');

if (footerWordmark && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const canvas = footerWordmark.querySelector('.footer__wordmark-canvas');
  const image = new Image();
  image.decoding = 'async';
  image.src = canvas.dataset.src;

  image.decode().then(() => {
    const render = createLogoRefraction(canvas, image);
    if (!render) return;

    // 0 when the logo's top reaches the bottom of the screen, 1 at the end of the page.
    const progress = () => {
      const top = footerWordmark.getBoundingClientRect().top + window.scrollY;
      const start = top - window.innerHeight;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      return end > start ? Math.min(1, Math.max(0, (window.scrollY - start) / (end - start))) : 1;
    };

    let ticking = false;
    let settleTimer;
    let lastStrength = -1;
    const draw = (still) => {
      const p = progress();
      const strength = 1 - p * p; // holds the broken-up look longer, comes together towards the end
      if (!still && Math.abs(strength - lastStrength) < 0.001) return;
      lastStrength = strength;
      render(strength, still);
    };
    const update = () => {
      ticking = false;
      const rect = footerWordmark.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return; // off screen
      draw(false);
      // Once scrolling pauses, redraw the frame with full sampling.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => draw(true), 150);
    };
    const requestUpdate = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    draw(true);
    footerWordmark.classList.add('is-live');
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', () => {
      lastStrength = -1;
      draw(true);
    });
  }).catch(() => {});
}
