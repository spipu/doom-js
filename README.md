# lib3d_js

A pure-JavaScript 3D rendering engine — no external dependency, just for fun.

Renders 3D objects with lights, textures, and projection entirely in the browser using the HTML5 `<canvas>` API.

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
| `world.html` | First-person navigation inside a 3D labyrinth (ZQSD/arrows + mouse) |

## Controls (world.html)

| Input | Action |
|---|---|
| Arrow keys / ZQSD | Move forward / backward / strafe |
| Mouse (click canvas first) | Look around |
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
│   ├── constants.js             Shared constants (DEG_TO_RAD)
│   ├── loader.js                Loads all scripts in the correct order
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
│   ├── inputKeyboard.js         Keyboard input (e.code, Set-based)
│   ├── inputMouse.js            Mouse input via Pointer Lock API
│   ├── user.js                  FPS player (position, yaw/pitch, walk animation)
│   └── debug.js                 Debug overlay (fps, keyboard, mouse, user state)
├── objects/                     3D objects in .obj.json format
├── world/                       World map objects and textures (world.html)
└── texture/                     Texture images
```

## License

This program is distributed under the LGPL License. For more information see the [./LICENSE.md](./LICENSE.md) file.
