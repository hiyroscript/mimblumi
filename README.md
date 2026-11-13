# mavooli

An infinite, procedurally generated low-poly 3D world, built with [three.js](https://threejs.org/) r128,
TypeScript and [Vite](https://vite.dev/).

Live at **https://hiyroscript.github.io/moo/**

> **TODO — new artwork.** The game has been renamed Mavooli. `mavooli.png` (the logo the intro shows),
> `favicon.ico` and `apple-touch-icon.png` are still the logo from before the rename, kept as placeholders.
> Replace all three with Mavooli artwork (same file names and sizes: the favicon at 16, 32 and 48 px, the
> touch icon at 180 px).

## The intro

A cold start opens like hiyroscript's other game, Alva: the hiyroscript logo with "a game by hiyroscript",
a short black gap, then the Mavooli logo, which stays as the title. A loading bar under it follows the real
start-up work; when the world is ready it turns into **Press to start**. A click, tap or key press stops the
pulse, fades the screen to solid white over the logo, holds the white for a moment while the Home Screen is
set up underneath, then fades the white away to show the Home Screen. All timings are in `CFG.splash`
([`src/config.ts`](src/config.ts)). With *reduce motion* turned on, the logos do not zoom, the prompt does
not pulse, and the white fades in and out quickly with no hold. A hot reload that brings back a saved
position skips the intro and the Home Screen and goes straight back into the game.

## The Home Screen

Behind the Home Screen is a **new random world every time it opens**: a fresh seed goes through
`setWorldSeed()` ([`src/world/fields.ts`](src/world/fields.ts)), which rebuilds the noise fields and the
world hashes, before its chunks are generated (they are generated behind the loading bar). The camera
drifts slowly across it on its own, with a gentle side-to-side turn, and chunks stream in ahead of it just
as they do ahead of the player. It is drawn with the game's own renderer, lights, fog and materials; there
is no player and no input.

Over it sit three square-cornered glass cards (the glass is Alva's `.glass--panel`), left to right:

- **Play with friends!** (globe): online play is not set up yet, so it is shown unavailable and only says
  "Coming soon" when pressed.
- **Survival** (play): the larger middle card. Starts the game.
- **Creative mode** (tools): for now starts the same game, with `Game.mode === 'creative'`
  ([`src/game/mode.ts`](src/game/mode.ts)) for creative-only features to check later.

The cards fall in from above the screen together, with a tiny stagger, as the white fades away. They work
with mouse, touch and keyboard (Tab or the arrow keys, then Enter or Space). Picking a mode lifts the cards
away under a white cover; the game's world (`CFG.seed`, the same world every time) is built under the white
around the player, and the white fades away. Speeds, camera distance, drift direction and animation timings
are in `CFG.home`.

## Controls

- **Drag anywhere** (mouse or one finger) to walk. Drag further to run.
- **WASD** or the **arrow keys** to walk; hold **Shift** to run.
- **Mouse wheel** or **two-finger pinch** to zoom.

## Running it locally

You need Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev        # dev server with hot reload, at http://localhost:5173/moo/
```

Other scripts:

| Command               | What it does                                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| `npm run build`       | Type-checks (`tsc --noEmit`), then bundles the site into `dist/`                     |
| `npm run preview`     | Serves the built `dist/` at http://localhost:4173/moo/                               |
| `npm run typecheck`   | Type-checks only                                                                     |
| `npm run build:itch`  | Builds, validates and zips the itch.io release: `dist/itch/` and `dist/mavooli-itch.zip` |
| `npm run verify:itch` | Checks that release is the Pages build but for its URLs, then serves it under a nested path and plays it in a cross-origin iframe |
| `npm test`            | The tests (`node --test`): the itch.io tools and both builds                          |

## Deploying

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the
site and publishes `dist/` to GitHub Pages. You can also run it by hand from the **Actions** tab
("Deploy to GitHub Pages" → **Run workflow**).

> **One-time setup:** in the repository, go to **Settings → Pages → Build and deployment → Source** and
> change it from "Deploy from a branch" to **"GitHub Actions"**. Until you do, Pages keeps serving the raw
> `index.html` from the repository root, which is now only the Vite entry point and loads TypeScript
> that browsers cannot run.

The game is called Mavooli, but the repository is **moo**, so GitHub Pages serves it from `/moo/` and the
site is built for that sub-path (`base` in [`vite.config.ts`](vite.config.ts)). If the repository is
renamed, or the site moves to a custom domain or a `<user>.github.io` repository, change `base` to match.

## itch.io

The same game, built with every URL relative so it runs inside itch.io's `<iframe>` from any path, and
zipped with `index.html` at the root of the archive (7 files, under 1 MB):

```sh
npm run build:itch     # dist/itch/ and dist/mavooli-itch.zip, validated; ends with OK
npm run verify:itch    # the same game as on GitHub Pages, then served under a nested path and played in a cross-origin iframe
```

Every push to `main` also runs [`.github/workflows/itch-release.yml`](.github/workflows/itch-release.yml)
("itch.io release"), beside the GitHub Pages deployment: the tests, the build, the check, and then it keeps
`mavooli-itch.zip` on the run's page (**Actions** → the run → **Artifacts**; unzip GitHub's wrapper once).
Upload it to itch.io as an **HTML** project and tick **This file will be played in the browser**. With the
secret `BUTLER_API_KEY` and the variable `ITCH_PROJECT` (for example `hiyroscript/mavooli`) set, the
workflow also pushes it to itch.io itself with butler; without them it uploads nothing. The build, the
validation, the embed options to choose on itch.io and what differs inside its page are in
[the itch.io release](docs/itch-release.md).

## How the code is organised

```
.github/workflows/
├─ deploy.yml              GitHub Pages: builds dist/ and publishes it, on every push to main
└─ itch-release.yml        itch.io: tests, builds, validates and plays the release, keeps the ZIP; optional butler push
docs/itch-release.md       the itch.io release: the build, the validation, the checks, publishing on itch.io
tools/itch/                the itch.io release's tools (Node, no dependencies of their own)
├─ build.mjs               npm run build:itch: type check, Vite's itch build, validation, the ZIP, the report
├─ validate.mjs            itch.io's limits, every URL relative and present, nothing extra or development-only
├─ verify.mjs              npm run verify:itch: equivalence, then served under a nested path, played in a cross-origin iframe
├─ equivalence.mjs         the release against the GitHub Pages build: byte for byte the same but for their URLs
├─ browser.mjs             the headless Chrome verify.mjs drives over its DevTools pipe
├─ hosts.mjs               the rule about other hosts: nothing loaded from anywhere else
├─ zip.mjs                 the deterministic ZIP writer and reader
└─ release.mjs             what they share: paths, limits, development-only files, content types
tests/itch/                node --test: the tools, and both builds (Pages keeps /moo/, itch.io is relative, the same game)
vite.config.ts             two builds by mode: GitHub Pages (base /moo/, dist/) and itch.io (--mode itch: base ./, dist/itch/)
index.html                 page shell: #stage (the canvas host), #fail (the no-WebGL note), #home (the Home Screen), #splash (the intro)
hs.jpg, mavooli.png        the hiyroscript and Mavooli logos shown by the intro (mavooli.png is still the old art: see the TODO above)
favicon.ico                the tab icon (old art at 16, 32 and 48 px, its stroke thickened to stay legible; to be replaced)
apple-touch-icon.png       the home-screen icon (old art at 180 px; to be replaced)
src/
├─ main.ts                 boot: the start-up work as loader tasks, hot-reload hook, intro → Home Screen → game, or quick start; error → #fail
├─ style.css               every style: the intro's, the Alva glass and the Home Screen's
├─ dom.ts                  the #stage, #fail, #home and #splash elements
├─ boot/loader.ts          Loader: weighted start-up tasks that drive the loading bar
├─ intro/
│  ├─ splash.ts            the intro sequence: logos, loading bar, "Press to start", white into the Home Screen
│  └─ run.ts               one run of the intro (also used by the Home Screen); clear() stops all its timers, animations and listeners
├─ home/
│  ├─ home.ts              the Home Screen: builds the three cards, their fall-in, the choice, the white into the game
│  ├─ flyover.ts           the camera drifting on its own over the Home Screen's random world
│  └─ icons.ts             the globe, play and tools icons, as inline SVG
├─ game/mode.ts            which mode is being played: 'survival' or 'creative'
├─ config.ts               CFG (seed, chunk size, speeds, zoom limits, camera yaw, intro and Home Screen timings), CH, TAU
├─ color.ts                rgb() (sRGB hex → linear), mul, mixc, the RGB type
├─ math/                   util (clamp, lerp, smoothstep, damp), random (mulberry32, hashInt…), noise (seeded simplex)
├─ world/
│  ├─ palette.ts           every authored colour
│  ├─ fields.ts            the world-space noise fields: height, terrain tiles, forest, moisture, colour…; setWorldSeed()
│  ├─ chunk.ts             makeChunk: terrain mesh + object placement for one 32×32 chunk
│  └─ worldManager.ts      World: which chunks to build or drop, building a whole ring, refilling the instance pools, collisions
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
├─ input/
│  ├─ input.ts             drag joystick, pinch, wheel, keyboard
│  └─ embed.ts             inside another page's frame (itch.io): a press takes the keyboard focus, keys never scroll the page
├─ perf.ts                 drops the render resolution on slow devices
└─ loop.ts                 the per-frame update, in one of two states: 'home' (the flyover) or 'game' (the player)
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
  reshuffles everything that follows it. `setWorldSeed()` changes which world the fields and chunk hashes
  describe (the Home Screen's random one, or `CFG.seed` for the game); the asset shapes in `render/pools.ts`
  are always built from `CFG.seed`. After changing the seed, drop the old chunks (`World.reset()`) before
  building new ones.
- **three.js is pinned to r128 (`three@0.128.0`).** Later versions renamed or removed APIs this code uses
  (`outputEncoding`, `sRGBEncoding`, `convertSRGBToLinear`, `updateRange`), changed the default lighting
  units, and rewrote the shader chunks that `render/shaders.ts` patches. Upgrading changes how the world
  looks and needs its own careful port.
- **Everything the game loads comes from its own files, named literally.** Import an asset
  (`import url from './x.png'`) or name it in `index.html` (its `/…` paths are fine: Vite rewrites them);
  Vite then emits it under the right `base` for both builds. In the code, never build a path at run time,
  write one starting with `/` or `/moo/`, or load anything from another host: the itch.io build's
  validation fails on each (docs/itch-release.md). Nothing is saved yet; anything saved later goes in
  `try`/`catch`, since itch.io's frame may block storage.
- **Set-up order matters.** `main.ts` creates the renderer, scene, lights, materials, pools and player in
  a fixed order through explicit init functions, never as a side effect of importing a module. three.js
  breaks ties in draw order by creation order, so this keeps the rendered image the same.
