/*
 * Lightweight WebGL "metallic interference waves" background.
 * Single fullscreen-triangle draw call, one fragment shader pass -
 * far cheaper than a noise-mesh gradient (no per-vertex noise, no large mesh).
 */

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 aspectUv = uv;
  aspectUv.x *= u_resolution.x / u_resolution.y;

  vec2 source = vec2(-0.1, 1.15);
  source.x *= u_resolution.x / u_resolution.y;
  vec2 p = aspectUv - source;

  float r = length(p);
  float angle = atan(p.y, p.x);

  float wave = sin(r * 26.0 - u_time * 0.9 + sin(angle * 4.0 + u_time * 0.15) * 0.6);
  float ridge = pow(max(wave, 0.0), 9.0);

  vec3 lightSide = vec3(0.80, 0.84, 0.98);
  vec3 darkSide = vec3(0.02, 0.02, 0.05);
  vec3 base = mix(lightSide, darkSide, smoothstep(0.0, 1.05, uv.x + (1.0 - uv.y) * 0.15));

  vec3 metal = vec3(0.35, 0.42, 0.95);
  vec3 highlight = vec3(0.75, 0.82, 1.0);
  vec3 ridgeColor = mix(metal, highlight, ridge);

  vec3 color = mix(base, ridgeColor, ridge * 0.9 + 0.06);

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

export function initMetallicWaves(selector) {
  const canvas = document.querySelector(selector);
  if (!canvas) return null;

  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) return null;

  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const positionLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const timeLoc = gl.getUniformLocation(program, "u_time");

  let playing = true;
  let rafId = null;
  let startTime = performance.now();
  let lastFrame = 0;

  function resize() {
    const width = canvas.clientWidth || canvas.offsetWidth;
    const height = canvas.clientHeight || canvas.offsetHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function render(now) {
    if (!playing) return;
    if (now - lastFrame < 1000 / 40) {
      rafId = requestAnimationFrame(render);
      return;
    }
    lastFrame = now;
    resize();
    gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, (now - startTime) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rafId = requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);
  resize();
  rafId = requestAnimationFrame(render);

  return {
    play() {
      if (playing) return;
      playing = true;
      rafId = requestAnimationFrame(render);
    },
    pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}
