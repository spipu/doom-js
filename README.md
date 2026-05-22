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
| `index.html` | Home page — links to all demos |
| `objects.html` | Object viewer — pick an object, resolution and renderer |
| `example.html` | Static render of the Lotus F1 |
| `lights.html` | Coloured light sources demo (arrow keys move lights) |
| `game.html` | Interactive van — drive it with the arrow keys |
| `world.html` | First-person navigation inside a 3D labyrinth |

## Controls (world.html)

| Input | Action |
|---|---|
| Arrow keys / ZQSD | Move forward / backward / strafe |
| Alt | Walk slowly |
| Ctrl | Crouch |
| Shift | Jump |
| E | Interact (open door, trigger lift) |
| Mouse (click canvas first) | Look around |
| U / I | Rotate left / right (keyboard fallback if no Pointer Lock) |
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

Thirteen 3D objects are included in `website/objects/`:
`cube`, `sphere`, `torus`, `lotus`, `helico_military`, `helico_civil`, `tank`, `car`, `van`, `dyno`, `head`, `plane`, `ship`, `teddy`

## Architecture

```
website/
├── js/
│   ├── loader.js                Loads all scripts; provides buildUrl() for cache busting
│   ├── constants.js             Shared constants (DEG_TO_RAD)
│   ├── engine3d.js              Main engine (viewport, lights, matrix, rendering)
│   ├── object3d.js              3D object (geometry, textures, projection)
│   ├── object3dFactory.js       Object registry and async JSON loader
│   ├── object3dRendererBase.js  Base renderer class (shared utilities)
│   ├── object3dRendererFull.js  Per-pixel z-buffer + textures (CPU)
│   ├── object3dRendererFlat.js  Flat shading + Painter's algorithm
│   ├── object3dRendererFast.js  Wireframe (canvas 2D)
│   ├── object3dRendererWebGL.js WebGL renderer (GLSL shaders, GPU z-buffer)
│   ├── object3dRendererFactory.js  Selects and instantiates the right renderer
│   ├── zBuffer.js               Z-buffer
│   ├── matrix.js                4×4 transformation matrices
│   ├── light.js                 Point light sources
│   ├── instance.js              Animated 3D object (keyframes, triggers, damage)
│   ├── instanceFactory.js       Instance registry and async JSON loader
│   ├── collision.js             FPS physics: floor/ceiling/wall detection, platform riding
│   ├── inputKeyboard.js         Keyboard input (e.code, Set-based)
│   ├── inputMouse.js            Mouse input via Pointer Lock API
│   ├── user.js                  FPS player (physics, gravity, jump, crouch, energy)
│   ├── world.js                 Scene orchestrator: loads definition.json, runs physics
│   └── debug.js                 Debug overlay (fps, keyboard, mouse, user state)
├── objects/                     3D objects in .obj.json format
├── world/
│   ├── definition.json          Scene definition (player, lights, instances)
│   ├── objects/                 Map and interactive object geometry
│   ├── instances/               Instance descriptors (.instance.json)
│   └── texture/                 World textures
└── texture/                     Shared texture images
```

## World definition format

The FPS world is defined in `world/definition.json`:

```json
{
  "user": { "position": [x, y, z], "yaw": 180, "height": 0.85, ... },
  "lights": { "ambient": [r, g, b], "sources": [...] },
  "map": "./world/objects/map.obj.json",
  "instances": { "door": "./world/instances/door.instance.json", ... }
}
```

Each `.instance.json` supports keyframe animation, collision, proximity/action triggers, and damage zones.

## Cache busting

`js/loader.js` exposes a global `loader` object. All asset URLs (JS, JSON, textures) are loaded via `loader.buildUrl(url)`, appending `?v=<version>`. Increment `this._version` in `loader.js` after any file change to force a browser cache refresh.

## License

This program is distributed under the LGPL License. For more information see the [./LICENSE.md](./LICENSE.md) file.
