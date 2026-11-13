# mimblumi

An infinite, procedurally generated low-poly 3D world, built with [three.js](https://threejs.org/) r128,
TypeScript and [Vite](https://vite.dev/).

Live at **https://hiyroscript.github.io/mimblumi/**

## The intro

A cold start opens like hiyroscript's other game, Alva: the hiyroscript logo with "a game by hiyroscript",
a short black gap, then the Mimblumi logo, which stays as the title. A loading bar under it follows the real
start-up work; when the world is ready it turns into **Press to start**. A click, tap or key press runs the
screen from black through blue, green and brown to white, and the white fades away to show the world.
All timings and colours are in `CFG.splash` ([`src/config.ts`](src/config.ts)). With *reduce motion* turned
on, the logos do not zoom, the prompt does not pulse and the colour run becomes one short fade. A hot reload
that brings back a saved position skips the intro.

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
index.html                 page shell: #stage (the canvas host), #fail (the no-WebGL note), #splash (the intro)
hs.jpg, mimblumi.png       the hiyroscript and Mimblumi logos shown by the intro
src/
├─ main.ts                 boot: the start-up work as loader tasks, hot-reload hook, intro or quick start, error → #fail
├─ style.css               every style, including the intro's
├─ dom.ts                  the #stage, #fail and #splash elements
├─ boot/loader.ts          Loader: weighted start-up tasks that drive the loading bar
├─ intro/
│  ├─ splash.ts            the intro sequence: logos, loading bar, "Press to start", colour transition
│  └─ run.ts               one run of the intro; clear() stops all its timers, animations and listeners
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

- **One font for the whole game: `var(--font)`** (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
  Arial, sans-serif`, the same stack as Alva). Any new text uses `font-family: var(--font)`; never add another
  font-family.
- **New start-up work goes through the loader.** A model, texture or sound that has to be ready before the
  first frame is one line in `main.ts`, and it counts toward the loading bar on its own:
  `Loader.add('Birdsong', 2, async () => { ... })`. Long tasks can call the `report(fraction)` they are given
  so the bar moves while they run.

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
