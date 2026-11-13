/*
 * GLSL injected into r128's built-in MeshLambertMaterial shaders through onBeforeCompile.
 * Each patch is a plain string or regex replacement against r128's shader templates,
 * so these anchors and snippets have to match r128 character for character.
 */

/** Anchor: the opening of main() in the built-in vertex and fragment shaders. */
export const MAIN_OPEN = /void\s+main\s*\(\s*\)\s*\{/;
/** Anchor: the vertex chunk that computes mvPosition and gl_Position. */
export const PROJECT_VERTEX = '#include <project_vertex>';
/** Anchor: the vertex chunk that declares `transformed`. */
export const BEGIN_VERTEX = '#include <begin_vertex>';

/* Trees: anything standing between the camera and the player dissolves into a soft dithered window. */
export const TREE_VERT_MAIN = 'varying float vObsDepth;\nvoid main() {';
export const TREE_VERT_PROJECT = '#include <project_vertex>\n  vObsDepth = -mvPosition.z;';
export const TREE_FRAG_MAIN =
    'uniform vec4 uObs;\nvarying float vObsDepth;\nvoid main() {\n' +
    '  if (vObsDepth < uObs.z - 0.7) {\n' +
    '    float od = length(gl_FragCoord.xy - uObs.xy) / uObs.w;\n' +
    '    if (od < 1.0) {\n' +
    '      float th = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));\n' +
    '      if (th > od * od * 0.92 + 0.06) discard;\n' +
    '    }\n' +
    '  }\n';

/* Grass and flowers: sway with one shared wind field, and shade both faces alike. */
export const VEG_VERT_MAIN = 'uniform float uTime;\nuniform float uWind;\nvoid main() {';
export const VEG_VERT_BEGIN = '#include <begin_vertex>\n' +
      '#ifdef USE_INSTANCING\n' +
      '  vec4 wpos = instanceMatrix * vec4(position, 1.0);\n' +
      '  float wy = max(position.y, 0.0);\n' +
      '  float wph = uTime * 1.35 + wpos.x * 0.21 + wpos.z * 0.16;\n' +
      '  float wv = sin(wph) + 0.45 * sin(wph * 2.3 + 1.7);\n' +
      '  float wamt = wy * wy * uWind + wy * uWind * 0.25;\n' +
      '  transformed.x += wv * wamt;\n' +
      '  transformed.z += wv * wamt * 0.55;\n' +
      '#endif\n';
/** Every use of gl_FrontFacing in the fragment shader is replaced by `true`, so back faces shade like front faces. */
export const FRONT_FACING = 'gl_FrontFacing';
export const FRONT_FACING_ALWAYS = 'true';
