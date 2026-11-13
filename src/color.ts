import * as THREE from 'three';
import { lerp } from './math/util';

/** A linear-space colour as [r, g, b]. */
export type RGB = [number, number, number];

/* Colours are authored in sRGB and stored linear, because r128 lights in linear space. */
export const rgb = (hex: number): RGB => { const c = new THREE.Color(hex).convertSRGBToLinear(); return [c.r, c.g, c.b]; };
export const mul = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
export const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
