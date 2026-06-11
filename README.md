# lib3d_js

A pure-JavaScript 3D rendering engine — no external dependency, just for fun.

Renders 3D objects with lights, textures, and projection entirely in the browser using the HTML5 `<canvas>` API. Includes a full FPS physics engine with collision detection, gravity, jumping, crouching, and animated objects.

The main demo (SpipuDoom, `index.html`) ships as a PWA: a generic webapp bootstrap layer (`js/webapp/`) loads everything from versioned definition files, and a Service Worker provides cache-first delivery and offline support.

## Requirements

- A modern browser (Chrome, Firefox, Edge)
- Any static HTTP server (Apache, Nginx, or `python3 -m http.server`)

## Getting started

Serve the `website/` directory with any HTTP server:

```bash
cd website
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

## Demo pages

| Page | Description |
|---|---|
| `index.html` | SpipuDoom — first-person navigation in Freedoom E1M1 (WIP), PWA, 1920×1080 virtual screen |
| `_examples/index.html` | Home page — links to all demos |
| `_examples/objects.html` | Object viewer — pick an object, resolution and renderer |
| `_examples/example.html` | Static render of the Lotus F1 |
| `_examples/lights.html` | Coloured light sources demo (arrow keys move lights) |
| `_examples/game.html` | Interactive van — drive it with the arrow keys |
| `_examples/world.html` | First-person navigation inside a 3D labyrinth |

## Controls (index.html / _examples/world.html)

| Input | Action |
|---|---|
| Arrow keys / ZQSD | Move forward / backward / strafe |
| Alt | Walk slowly |
| Ctrl | Crouch |
| Shift | Jump |
| E | Interact (open door, trigger lift) |
| Mouse (click canvas first) | Look around |
| IJKL | Rotate (keyboard fallback if no Pointer Lock) |
| ESC | Release mouse |

## Renderer modes

Four rendering modes are available via the **Renderer** selector on `objects.html`:

| Mode | Description |
|---|---|
| `webgl` | WebGL — GPU shaders, z-buffer, texture mapping (default, falls back to `full` if unavailable) |
| `full` | Per-pixel z-buffer with Gouraud shading and texture mapping |
| `flat` | Painter's algorithm with flat shading (one colour per face) |
| `fast` | Wireframe — no lighting, canvas 2D paths only |

## Objects

Thirteen 3D objects are included in `website/assets/objects/`:
`cube`, `sphere`, `torus`, `lotus`, `helico_military`, `helico_civil`, `tank`, `car`, `van`, `dyno`, `head`, `plane`, `ship`, `teddy`

## Architecture

```
website/
├── index.html                   SpipuDoom — empty shell (div#screen + progress bar)
├── appServiceWorker.js          Service Worker — cache-first, offline (must stay at webroot: SW scope)
├── manifest.webmanifest         PWA manifest
├── css/main.css                 Shell styles (fullscreen layout, loading bar)
├── _examples/                   Simple demos (example, objects, lights, game, world)
│   └── assets/                  Demo assets + one bootstrap definition JSON per demo
├── js/
│   ├── webapp/
│   │   └── appBootstrap.js      Generic webapp loader: stacked definitions, aggregate versioning,
│   │                            PWA/classic modes, buildUrl, fetchJson — reusable in any project
│   ├── doom/
│   │   ├── libBootstrap.json    Doom bootstrap definition (version + js list)
│   │   ├── doomGame.js          DoomGame class (screen, engine, HUD, game loop)
│   │   └── main.js              Entry point: loadApp() + appBootstrap.setReadyCallback(loadApp)
│   └── engine/
│       ├── libBootstrap.json    Engine bootstrap definition (version + js list)
│       ├── engine3d.js          Main engine (viewport, lights, matrix, rendering loop, DEG_TO_RAD)
│       ├── collision.js         FPS physics: floor/ceiling/wall detection, platform riding
│       ├── inputKeyboard.js     Keyboard input (e.code, Set-based)
│       ├── inputMouse.js        Mouse input via Pointer Lock API
│       ├── loader.js            Global Loader — synchronises all sub-loaders, fires app callback
│       ├── matrix.js            4×4 transformation matrices
│       ├── screenManager.js     Creates canvas + HUD overlay in #screen (fullscreen, fixed or virtual size)
│       ├── zBuffer.js           Z-buffer
│       ├── entity/
│       │   ├── abstractLoadedEntity.js  Base class: id, url, setLoaded(), finalizeInit()
│       │   ├── face.js          Face data (vertices, color, texture, UV, flags)
│       │   ├── interaction.js   Interaction entity: wraps AbstractInteraction, proxies triggered/update
│       │   ├── light.js         Point light source
│       │   ├── texture.js       Texture image data + alpha detection
│       │   ├── object3d.js      3D geometry (vertices, faces, normals, projection)
│       │   ├── instance.js      Animated 3D object (keyframes, triggers, start/stop, damage)
│       │   ├── user.js          FPS player (physics, gravity, jump, crouch, energy)
│       │   └── world.js         FPS scene (user, lights, collision, update loop)
│       ├── hud/
│       │   ├── abstractHud.js   Base HUD overlay: init(container), update(), bind helpers
│       │   └── hudDebug.js      Debug HUD: fps, position, energy, keyboard, mouse, damage flash
│       ├── interaction/
│       │   ├── abstractInteraction.js  Base interaction: code, triggered(instance), update(dt)
│       │   └── switchInteraction.js    Switch modes: once / timed / toggle, SW1↔SW2 texture swap
│       ├── loader/
│       │   ├── abstractLoader.js    Base loader: load/loadByCode/get/getByCode, registry, callbacks
│       │   ├── textureLoader.js     Loads images, deduplicates by URL
│       │   ├── object3dLoader.js    Parses .obj.json, feeds geometry to Object3d
│       │   ├── instanceLoader.js    Parses .instance.json, self-registers code, links to Object3d
│       │   ├── interactionLoader.js Loads interaction JS files async, FIFO queue, register()
│       │   └── worldLoader.js       Parses definition.json, creates User + lights + instances + interactions
│       └── renderer/
│           ├── object3dRendererBase.js   Shared renderer utilities
│           ├── object3dRendererList.js   Selects and instantiates the right renderer
│           ├── object3dRendererFull.js   Per-pixel z-buffer + textures (CPU)
│           ├── object3dRendererFlat.js   Flat shading + Painter's algorithm
│           ├── object3dRendererFast.js   Wireframe (canvas 2D)
│           └── object3dRendererWebGL.js  WebGL renderer (GLSL shaders, GPU z-buffer)
└── assets/
    ├── objects/                 Generic 3D objects (.obj.json)
    ├── texture/                 Generic textures
    ├── world/                   FPS world map + instances + textures
    └── doom/                    Freedoom E1M1 — all files generated by convert_wad.py
        ├── objects/             Map geometry + door/lift/switch meshes
        ├── instances/           Animated instances (doors, lifts, switches)
        ├── interactions/        JS interaction subclasses (generated per switch)
        └── textures/            Freedoom textures (JPEG + PNG)
```

## Webapp bootstrap

Every page is loaded by the generic `appBootstrap` (global instance). Each library declares its files in a `libBootstrap.json` definition (`{version, files: {assets, css, js}}`); pages stack the definitions they need and register their entry point:

```html
<div id="screen"></div>
<script src="/js/webapp/appBootstrap.js"></script>
<script>
function loadApp()
{
    loader.world().load('./assets/world/definition.json');
    loader.setCallback(init);
}

appBootstrap.disablePwaMode();                                       // demos only — doom keeps PWA mode
appBootstrap.addBootstrapDefinition('/js/engine/libBootstrap.json');
appBootstrap.addBootstrapDefinition('./assets/world.json');
appBootstrap.setReadyCallback(loadApp);
</script>
```

Versions are aggregated (`v1.383|v1.0`): a change in any stacked definition triggers a full update — in PWA mode the Service Worker clears its cache and re-downloads everything; in classic mode the page reloads with `?v=` cache-busted URLs (`appBootstrap.buildUrl`).

## Page pattern

```javascript
function init() {
    const world = loader.world().get();
    screen = new ScreenManager('screen', { fullscreen: true });  // or { width, height }
                                                                 // or { fullscreen: true, virtualWidth: 1920, virtualHeight: 1080 }
    mouse  = new InputMouse(screen.getCanvas());
    engine = new Engine3d(screen, new Object3dRendererList().getRenderer('webgl'));  // binds itself to the screen
    const hud = new HudDebug(engine)
        .bindUser(world.getUser()).bindKeyboard(keyboard).bindMouse(mouse)
        .addDescription('(c)2026 Spipu')
    ;
    screen.bindHud(hud);
    engine.initFromWorld(world);
    requestAnimationFrame(animate);
}

function animate(timestamp) {
    engine.calculateDeltaTime(timestamp);
    world.update(engine.getDeltaTime(), keyboard, mouse);
    engine.displayWorld(world);
    screen.update(); // updates HUD overlay
    requestAnimationFrame(animate);
}
```

## Versioning

After any file change, increment the `version` field of the `libBootstrap.json` of the modified library (engine, doom, or the demo's definition JSON). This drives both the PWA cache refresh and the classic-mode cache busting.

## License

This program is distributed under the LGPL License. For more information see the [./LICENSE.md](./LICENSE.md) file.
