import { rgb } from '../color';

/* Ground colours, sampled per terrain tile by Fields.cellColor. */
export const PAL = {
  forest: rgb(0x4a7438), olive: rgb(0x7c8a48), sage: rgb(0x8ea77a), floor: rgb(0x566a38),
  earth: rgb(0x7d5f42), sand: rgb(0xb8a47c), wallEarth: rgb(0x6f563d)
};

/* Trees and bushes. */
export const LEAF = {
  oak: [rgb(0x4f7d3a), rgb(0x5f8f43), rgb(0x3f6a34), rgb(0x6f9a4c)],
  pine: [rgb(0x28503a), rgb(0x2f5d3e), rgb(0x3d6d47)],
  blossom: [rgb(0xe2b3ba), rgb(0xd79aa8), rgb(0xeecfd2), rgb(0xcf8f9e)],
  birch: [rgb(0x93a654), rgb(0xa7b565), rgb(0x7f9a4e), rgb(0xb7bd68)],
  bush: [rgb(0x5a8444), rgb(0x4a7240), rgb(0x6c9150)]
};
export const BARK = { oak: rgb(0x6a4a30), dark: rgb(0x4f3826), pine: rgb(0x5a4030), birch: rgb(0xd9d3c2), mark: rgb(0x3c352c) };

/* Rocks. */
export const STONE = [rgb(0x8d8b84), rgb(0x77756f), rgb(0x9a968c), rgb(0x8a7b68), rgb(0x75685a)];
export const MOSS = rgb(0x66803f);

/* Flowers. */
export const STEM = rgb(0x5c7a3c), LEAFG = rgb(0x6b8f45), POLLEN = rgb(0xe3c24e);
