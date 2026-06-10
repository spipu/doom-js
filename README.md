# lib3d_js

A pure-JavaScript 3D rendering engine — no external dependency, just for fun.

Renders 3D objects with lights, textures, and projection entirely in the browser using the HTML5 `<canvas>` API. Includes a full FPS physics engine with collision detection, gravity, jumping, crouching, and animated objects.

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
| `index.html` | First-person navigation in Freedoom E1M1 (WIP) — fullscreen |
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
├── index.html                   Freedoom E1M1 — fullscreen FPS (WIP)
├── _examples/                   Simple demos (example, objects, lights, game, world)
│   └── assets/                  Demo-specific 3D objects and textures
├── js/
│   ├── bootstrap.js             First script loaded; loads all engine scripts, buildUrl, fetchJson, DEG_TO_RAD
│   └── engine/
│       ├── engine3d.js          Main engine (viewport, lights, matrix, rendering loop)
│       ├── collision.js         FPS physics: floor/ceiling/wall detection, platform riding
│       ├── inputKeyboard.js     Keyboard input (e.code, Set-based)
│       ├── inputMouse.js        Mouse input via Pointer Lock API
│       ├── loader.js            Global Loader — synchronises all sub-loaders, fires app callback
│       ├── matrix.js            4×4 transformation matrices
│       ├── screenManager.js     Canvas container + HUD overlay (fullscreen or fixed size)
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

## Loading pattern

All asset loading is coordinated by the global `loader` object:

```javascript
// Pages without a world (example, game, lights)
loader.objects().loadByCode('van', 'assets/objects/van.obj.json');
loader.setCallback(init);

// FPS pages (world, doom)
loader.world().load('./assets/world/definition.json');
loader.setCallback(init);

function init() {
    const world = loader.world().get();
    engine = new Engine3d('canvasElem', new Object3dRendererList().getRenderer('webgl'));
    const hud = new HudDebug(engine).bindUser(world.getUser()).bindKeyboard(keyboard).bindMouse(mouse);
    screen = new ScreenManager(engine, hud, { fullscreen: true }); // or { width: 640, height: 480 }
    // ...
}

function animate(timestamp) {
    engine.calculateDeltaTime(timestamp);
    world.update(engine.getDeltaTime(), keyboard, mouse);
    engine.displayWorld(world);
    screen.update(); // updates HUD overlay
    requestAnimationFrame(animate);
}
```

## Cache busting

All asset URLs go through `bootstrap.buildUrl(url)`, appending `?v=<version>`. Increment `this._version` in `bootstrap.js` after any file change to force a browser cache refresh.

## License

This program is distributed under the LGPL License. For more information see the [./LICENSE.md](./LICENSE.md) file.
