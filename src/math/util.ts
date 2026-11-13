export const clamp = (x: number, a: number, b: number): number => x < a ? a : x > b ? b : x;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Smoothstep of x between a and b. */
export const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential approach from a towards b at rate r. */
export const damp = (a: number, b: number, r: number, dt: number): number => a + (b - a) * (1 - Math.exp(-r * dt));
