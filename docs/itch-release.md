# The itch.io release

GitHub Pages stays the site: `npm run build` makes `dist/` for
<https://hiyroscript.github.io/moo/>, every URL under `/moo/`, as before
([Deploying](../README.md#deploying)). itch.io shows an HTML5 game in an
`<iframe>`, from a path of its own choosing on its game host
(`https://html-classic.itch.zone/html/<upload>/index.html`), so the
**release** is the same game built a second time with every URL relative,
zipped with `index.html` at the root of the archive. It is 7 files and under
1 MB. It is never edited by hand and never the source of truth: change the
repository, then rebuild.

```sh
npm ci                         # once: Vite and TypeScript, the build's tools
npm run build:itch             # dist/itch/ and dist/mavooli-itch.zip, validated, with a report
npm run verify:itch            # served under a nested path, then played in a cross-origin iframe
node tools/itch/validate.mjs   # validate an existing dist/ again
node --test                    # the tests of the tools and of both builds
```

Node 22 or later. `dist/` and `node_modules/` are ignored by Git.

## What the build does

[`tools/itch/build.mjs`](../tools/itch/build.mjs), with what it shares
with the checks in [`tools/itch/release.mjs`](../tools/itch/release.mjs):

1. Empties `dist/itch/` and removes the last `dist/mavooli-itch.zip`.
2. Type-checks the game (`tsc --noEmit`), as `npm run build` does.
3. Builds it with Vite in its `itch` mode (`vite build --mode itch`), after
   checking that [`vite.config.ts`](../vite.config.ts) still gives that mode
   `base: './'` and `outDir: 'dist/itch'` (anything else would write over the
   Pages build or make a release that cannot run on itch.io).
4. Validates the folder (below). Only a valid release gets its archive,
   `dist/mavooli-itch.zip`: `index.html` at its root, no enclosing folder,
   which is then validated against the folder in turn.
5. Prints the report: every file and its size, the totals against
   itch.io's limits, the archive. Any problem fails the build (exit code 1)
   and leaves no archive. A good build ends by printing `OK`.

The same commit always makes the same files (Vite names each asset by a hash
of its content) and, with the same zlib, the same archive: fixed entry order,
one fixed timestamp (1980-01-01), no directory entries
([`tools/itch/zip.mjs`](../tools/itch/zip.mjs), adapted from Alva's).

```
dist/
  mavooli-itch.zip                    the upload: everything below, index.html at its root (about 0.49 MB)
  itch/
    index.html                        the page (under 1 KB), every URL relative (./assets/…)
    assets/
      index-<hash>.js                 the game and three.js r128, one module (about 545 KB)
      index-<hash>.css                src/style.css as written (about 11 KB)
      mavooli-<hash>.png              the Mavooli logo, from the intro (about 250 KB)
      hs-<hash>.jpg                   the hiyroscript logo, from the intro (about 150 KB)
      favicon-<hash>.ico              the tab icon (about 4 KB)
      apple-touch-icon-<hash>.png     the home-screen icon (about 10 KB)
```

`npm run build:itch` replaces only `dist/itch/` and the ZIP, so a GitHub
Pages build in `dist/` stays beside them. `npm run build` empties all of
`dist/` first, the itch.io release with it: build the release again after it.
(On GitHub each runs in a job of its own, so they never meet.)

## Two builds of one game

Both come from the same `index.html`, the same code and the same assets,
with the same options (`cssMinify: false`, `chunkSizeWarningLimit: 700`).
The mode changes only two things:

| | GitHub Pages (`vite build`) | itch.io (`vite build --mode itch`) |
| --- | --- | --- |
| `base` | `/moo/` | `./` |
| output | `dist/` | `dist/itch/` |
| a URL in the page | `/moo/assets/hs-<hash>.jpg` | `./assets/hs-<hash>.jpg` |
| an image the code imports (`hs.jpg`, `mavooli.png`) | `"/moo/assets/hs-<hash>.jpg"` | `new URL("hs-<hash>.jpg", import.meta.url)` |

`index.html` names its files root-absolute (`/favicon.ico`, `/hs.jpg`,
`/mavooli.png`, `/src/main.ts`…). Vite reads those from the repository root
and emits each as a hashed asset under `base`, so nothing had to move to
`public/`. The game itself reads nothing from the address: no `location`,
`history`, `localStorage`, `sessionStorage`, `fetch` or `/moo/` anywhere in
`src/`.

For the frame it is shown in, the game does two small things
([`src/input/embed.ts`](../src/input/embed.ts)); on GitHub Pages, where the
game is the whole page, neither changes anything:

- **Keyboard focus.** A press on "Press to start" or on the world gives the
  game's frame the focus (`window.focus()` from the press), so WASD and the
  arrows work at once.
- **Keys never scroll the page around it.** In a frame, a key the game does
  not cancel scrolls itch.io's page instead, and can scroll the game out of
  view, where the browser stops drawing it (the game then stalls until it is
  scrolled back). The arrows, Space, Page Up/Down, Home and End are
  cancelled for the whole game, from the first moment; only the scroll is
  cancelled, so the Home Screen's arrows, Home and End and the game's arrows
  still work, and Space or Enter on a focused card still presses it.

## The validation

[`tools/itch/validate.mjs`](../tools/itch/validate.mjs), run by the build
and on its own:

- itch.io's limits: fewer than 1,000 files (a warning above 950), at most
  500 MB in all and 200 MB a file, paths of at most 240 characters, no two
  names differing only in case, plain characters only (`A-Z a-z 0-9 . _ - /`).
- `index.html` at the root, starting with `<!doctype html>`, loading a
  module script.
- Complete, under exact names, and relative: every URL in the page (`src`,
  `href`, `srcset`), in the stylesheet (`url()`, `@import`) and in the script
  (`new URL(…, import.meta.url)`, imports, and any string naming a file by
  its extension) resolves to a file of the release, case-sensitively,
  against the right base (the file naming it, or the page). None is
  root-absolute, none leaves the release, and none uses GitHub Pages'
  `/moo/` (a Pages build zipped by mistake fails here, saying so).
- Nothing extra: every file of the release is something the page loads.
- Nothing development-only (`DEVELOPMENT_ONLY` in `release.mjs`): no
  `src/`, `tools/`, `tests/`, `docs/`, `node_modules/`, `dist/`, `public/`,
  no dot-files (`.git`, `.github`, …), source maps, `.ts`, `.mjs` or Markdown
  files, `package.json`, `tsconfig.json`, `vite.config.ts`, `README` or
  `max`. No `sourceMappingURL` in the script or stylesheet either.
- No other host ([`tools/itch/hosts.mjs`](../tools/itch/hosts.mjs), adapted
  from Alva's): the page, stylesheet and script name no `http(s)://` or
  `ws(s)://` address, so nothing (script, style, image, font, fetch, socket)
  comes from anywhere else. The only exceptions are listed there one by one:
  the two XML namespace names `document.createElementNS()` takes
  (`http://www.w3.org/2000/svg` for the Home Screen's icons and
  `http://www.w3.org/1999/xhtml` in three.js), which are identifiers and
  never fetched, and `OPENED_LINKS`, links the player opens in their own
  browser. Mavooli has none yet; a credit or store link added to the game
  goes there, exactly as written in the code.
- The archive: every entry intact (CRC-32), exactly the folder's files and
  bytes, `index.html` at its root, no duplicate or directory entries, no
  unsafe paths (`..`, absolute, backslashes).

An absolute `/foo.png` in the page, a `.map` file, an `https://` script, a
file in the wrong case or one nothing loads each fail the build with a
message naming it, and no archive is made
([`tests/itch/validate.test.mjs`](../tests/itch/validate.test.mjs) plants
each of them).

## The check over HTTP and in a browser

`npm run verify:itch` ([`tools/itch/verify.mjs`](../tools/itch/verify.mjs))
checks the built release the way itch.io serves it:

1. The release and its archive are valid (the validation above).
2. **Over HTTP.** A tiny Node static server serves `dist/itch/` under a
   nested, unrelated path, `/html/16180339/`, like itch.io's, with nothing
   at its root. The page and every file it loads, requested by the URL a
   browser resolves, must answer 200 with the content type it is loaded as:
   the module script as JavaScript, the stylesheet as CSS, the images as
   images (`CONTENT_TYPES` in `release.mjs`).
3. **In a browser.** A headless Chrome, Chromium or Edge the machine already
   has (`CHROME_PATH`, or the usual places; GitHub's `ubuntu-latest` runners
   have Google Chrome) is driven over its DevTools pipe
   ([`tools/itch/browser.mjs`](../tools/itch/browser.mjs): nothing to
   install, software WebGL). The game is loaded in a cross-origin
   `<iframe allow="fullscreen">` on a taller page of another site, as on
   itch.io, and:
   - the intro reaches "Press to start" with its logos loaded;
   - a click there gives the frame the keyboard and opens the Home Screen;
   - a click on Survival starts the game;
   - the arrows, Space, Page Down, End and W reach the game and never scroll
     the page around it, and neither does the mouse wheel;
   - a click outside the game and back on the world gives the keys back;
   - no console error, no uncaught exception, no failed request, nothing
     requested outside the nested path.

   With no browser on the machine, step 3 is skipped with a note, except in
   CI (the `CI` variable set, as on GitHub), where that is a failure.
   `npm run verify:itch -- --no-browser` skips it on purpose.

Alva's equivalence check (its bundle played against its modules) has no
counterpart here: Mavooli is not re-bundled for itch.io. Both builds are
Vite's, from the same code, and differ only in their URLs.

## The tests

`node --test` runs [`tests/itch/`](../tests/itch/): the ZIP writer and
reader round-trip (and the system `unzip` agrees), the rule about other
hosts, the validation on small releases with each mistake planted in turn,
and both real Vite builds (into temporary folders): the itch build's page
has only relative URLs and passes the validation, the Pages build keeps
`/moo/` and the validation refuses it for itch.io.

## Testing the release locally

```sh
python3 -m http.server 8000 --directory dist/itch
# then open http://localhost:8000
```

Play it as a player would: the intro and its loading bar, "Press to start",
the Home Screen, Survival and Creative, walking with the keys and by
dragging, zooming with the wheel and by pinching, on a phone in portrait and
in landscape. To see it the way itch.io shows it, load it in an `<iframe>`
from another origin, for example this page saved as `frame.html` in an empty
folder and served on another port (`python3 -m http.server 8001`, then
<http://127.0.0.1:8001/frame.html>):

```html
<!doctype html>
<body style="margin:0;height:3000px;background:#333">
<iframe src="http://localhost:8000/" width="960" height="540" allow="fullscreen" style="border:0"></iframe>
</body>
```

The page is taller than the window on purpose: the game's keys and wheel
must never scroll it. `npm run verify:itch` does all of this, and serves
the game under a nested path too.

## Publishing on itch.io

itch.io's own rules for HTML5 games are at
<https://itch.io/docs/creators/html5>; check them before uploading, since
they can change.

### Getting the ZIP

Either:

- **From GitHub, nothing to install.** Every push to `main` runs
  [`.github/workflows/itch-release.yml`](../.github/workflows/itch-release.yml)
  ("itch.io release"): the tests (`node --test`), `npm run build:itch` and
  `npm run verify:itch`, and keeps the ZIP on the run's page for 90 days
  (the **Actions** tab, the run, **Artifacts**, `mavooli-itch-<commit>`). A
  failure anywhere means no ZIP from that run. **Run workflow** there makes
  one from any branch. GitHub hands an artifact over wrapped in a ZIP of its
  own: unzip that once, and upload the `mavooli-itch.zip` inside.
- **On your computer:** `npm ci` once, then `npm run build:itch`; it must
  end with `OK`, and the ZIP is `dist/mavooli-itch.zip`.

The workflow runs beside the GitHub Pages one
([`deploy.yml`](../.github/workflows/deploy.yml)), on the same pushes; each
works without the other.

### Pushing it automatically with butler (optional)

The workflow's second job can push each new ZIP from `main` to itch.io with
[butler](https://itch.io/docs/butler/), itch.io's uploader. It does so only
when both of these are set in the repository's **Settings → Secrets and
variables → Actions**; until then it shows a notice ("No itch.io upload…")
and succeeds:

1. On itch.io, **Settings → API keys → Generate new API key**. Store it as
   the **secret** `BUTLER_API_KEY` (Secrets tab). It is never printed.
2. Create the project on itch.io first (the first upload below), then set
   the **variable** `ITCH_PROJECT` (Variables tab) to `user/game`, the two
   parts of the project's address: `hiyroscript/mavooli` for
   `https://hiyroscript.itch.io/mavooli`.

The job pushes the very ZIP the release job built and checked to the
project's `html` channel, `butler push dist/mavooli-itch.zip
"$ITCH_PROJECT:html" --userversion "<version>-<commit>"` (the version from
`package.json`, then the commit's short SHA, as `1.0.0-ab84a36`). Only `main`
is pushed: a manual run on another branch builds its ZIP but uploads
nothing. Two pushes never overlap: a later one waits, and a newer waiting
run replaces an older one, so the channel always ends on the newest build.
After the first butler push, check on the project's **Edit game** page that
the upload in the `html` channel has **This file will be played in the
browser** ticked, and remove any older manual upload.

### The first upload

1. On itch.io, **Create new project**. **Kind of project: HTML**.
2. **Uploads**: upload `mavooli-itch.zip` and tick **This file will be
   played in the browser**.
3. **Embed options**:
   - **Viewport dimensions**: a 16:9 size such as **1280 × 720** (or
     **960 × 540**); the game fills any size.
   - **Mobile friendly**: on. **Orientation**: **Default**, since the game
     plays in portrait as well as landscape (in portrait it widens its field
     of view to keep the same width of world in sight).
   - **Fullscreen button**: on.
   - **Click to launch in fullscreen** (or leaving **Automatically start on
     page load** off, so the page shows a **Run game** button): recommended.
     The click that starts the game gives it the keyboard focus, and the
     intro's "Press to start" waits for a press anyway.
   - **Enable scrollbars**: off. **SharedArrayBuffer support**: off (not
     needed).
4. Save, then open the page while it is still a draft or restricted, and
   verify it: the intro plays and its loading bar fills, "Press to start"
   opens the Home Screen, Survival and Creative both start, the keys walk
   after a click into the game and never scroll the page, dragging walks,
   the wheel and a pinch zoom, fullscreen works, the browser console shows
   no errors, and on a phone both orientations work.
5. Publish when it is right.

### Updating it

After a push to `main`, take the new ZIP (from the run, or
`npm run build:itch`), and on itch.io upload it, tick **This file will be
played in the browser** and delete the older upload. With butler set up,
the workflow does this on its own. After a large change, play the itch.io
page on real devices again.

### What is different inside itch.io's page

itch.io shows the game in an `<iframe>` on its own game host. The game is
the same; the page around it decides a few things:

- **Keyboard focus.** Keys reach the game once its frame has the focus: a
  click or tap into it gives it (itch.io's click-to-launch, "Press to start"
  or a press on the world). A key alone cannot start the game before then.
  A click on the page outside the game takes the focus away (and lets go of
  any key held); a click back on the world returns it.
- **Keys and the page.** The arrows, Space, Page Up/Down, Home and End
  never scroll itch.io's page while the game has the focus (above). Scrolled
  out of view, a game is paused by the browser until it is back in view.
- **Storage.** Mavooli saves nothing: no settings, no progress, no
  `localStorage` or `sessionStorage`, so the partitioned or blocked
  third-party storage of a frame changes nothing. Something saved later must
  be wrapped in `try`/`catch` and work without it.
- **WebGL in a frame.** The same WebGL as on the page itself; a browser or
  device without it shows the game's own no-WebGL note, as on GitHub Pages.
  Fullscreen is itch.io's button (the frame's `allow="fullscreen"`); the
  game follows the frame's size.
- **Touch.** Dragging and pinching on the game never scroll or zoom
  itch.io's page (`touch-action: none` and cancelled touch events); a drag
  that starts outside the game scrolls the page as usual. The mouse wheel
  over the game zooms it during play; over the intro and the Home Screen it
  scrolls the page as it would over any picture.
- **No `/moo/`.** The game's address on itch.io is whatever itch.io gives
  it; every URL in the release is relative to the page, so it does not
  matter.
- **The hot-reload host** (`window.claude.hot`, `src/main.ts`) is not there,
  so every visit plays the intro, as on GitHub Pages.
