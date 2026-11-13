# mimblumi

An infinite, procedurally generated low-poly 3D world, built with [three.js](https://threejs.org/) r128,
TypeScript and [Vite](https://vite.dev/).

Live at **https://hiyroscript.github.io/mimblumi/**

## Controls

- **Drag anywhere** (mouse or one finger) to walk. Drag further to run.
- **WASD** or the **arrow keys** to walk; hold **Shift** to run.
- **Mouse wheel** or **two-finger pinch** to zoom.

## Running it locally

You need Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev        # dev server with hot reload, at http://localhost:5173/mimblumi/
```

Other scripts:

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run build`     | Type-checks (`tsc --noEmit`), then bundles the site into `dist/` |
| `npm run preview`   | Serves the built `dist/` at http://localhost:4173/mimblumi/     |
| `npm run typecheck` | Type-checks only                                                |

## Deploying

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the
site and publishes `dist/` to GitHub Pages. You can also run it by hand from the **Actions** tab
("Deploy to GitHub Pages" → **Run workflow**).

> **One-time setup:** in the repository, go to **Settings → Pages → Build and deployment → Source** and
> change it from "Deploy from a branch" to **"GitHub Actions"**. Until you do, Pages keeps serving the raw
> `index.html` from the repository root, which is now only the Vite entry point and loads TypeScript
> that browsers cannot run.

The site is built for the `/mimblumi/` sub-path (`base` in [`vite.config.ts`](vite.config.ts)). If the
repository is renamed, or the site moves to a custom domain or a `<user>.github.io` repository, change
`base` to match.

## How the code is organised

```
index.html                 page shell: #stage (the canvas host) and #fail (the no-WebGL note)
src/
├─ main.ts                 boot: set-up in a fixed order, hot-reload hook, start(), error → #fail
├─ style.css
├─ dom.ts                  the #stage and #fail elements
├─ config.ts               CFG (seed, chunk size, speeds, zoom limits, camera yaw), CH, TAU
├─ color.ts                rgb() (sRGB hex → linear), mul, mixc, the RGB type
├─ math/                   util (clamp, lerp, smoothstep, damp), random (mulberry32, hashInt…), noise (seeded simplex)
├─ world/
│  ├─ palette.ts           every authored colour
│  ├─ fields.ts            the world-space noise fields: height, terrain tiles, forest, moisture, colour…
│  ├─ chunk.ts             makeChunk: terrain mesh + object placement for one 32×32 chunk
│  └─ worldManager.ts      World: which chunks to build or drop, refilling the instance pools, collisions
├─ geometry/GeoB.ts        builder for the chunky boxes, leaves, petals and grass blades
├─ assets/                 trees, rocks, flowers, grass (each a geometry built from a seeded rng)
├─ render/
│  ├─ renderer.ts          WebGL renderer, scene, fog, camera
│  ├─ lights.ts            sun, sky and bounce light; the shadow frustum that follows the camera
│  ├─ materials.ts         materials and their shared uniforms
│  ├─ shaders.ts           GLSL patched into three's built-in shaders (canopy see-through window, wind)
│  └─ pools.ts             one InstancedMesh per asset variant
├─ player/player.ts        the character: model, movement, procedural walk/run animation
├─ camera/rig.ts           camera follow, zoom, resize and portrait field of view
├─ input/input.ts          drag joystick, pinch, wheel, keyboard
├─ perf.ts                 drops the render resolution on slow devices
└─ loop.ts                 the per-frame update
```

### Things to keep in mind when changing it

- **The world is generated from a seed, and the order of random draws is the world.** Every tree, rock,
  flower and grass tuft depends on the exact sequence of `rng()` calls in `render/pools.ts`,
  `world/chunk.ts`, `assets/*` and `player/player.ts`. Reordering, adding or removing a single call
  reshuffles everything that follows it.
- **three.js is pinned to r128 (`three@0.128.0`).** Later versions renamed or removed APIs this code uses
  (`outputEncoding`, `sRGBEncoding`, `convertSRGBToLinear`, `updateRange`), changed the default lighting
  units, and rewrote the shader chunks that `render/shaders.ts` patches. Upgrading changes how the world
  looks and needs its own careful port.
- **Set-up order matters.** `main.ts` creates the renderer, scene, lights, materials, pools and player in
  a fixed order through explicit init functions, never as a side effect of importing a module. three.js
  breaks ties in draw order by creation order, so this keeps the rendered image the same.
