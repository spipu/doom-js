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
| `index.html` | Main demo — pick an object, resolution and renderer |
| `example.html` | Static render of the Lotus F1 |
| `lights.html` | Coloured light sources demo (keyboard moves lights) |
| `game.html` | Interactive van — drive it with the keyboard |

## Renderer modes

Three rendering modes are available via the **Renderer** selector on `index.html`:

| Mode | Description |
|---|---|
| `full` | Per-pixel z-buffer with Gouraud shading and texture mapping |
| `flat` | Painter's algorithm with flat shading (one colour per face) |
| `fast` | Wireframe — no lighting, canvas 2D paths only |

## Objects

Thirteen 3D objects are included in `website/objects/`:
`cube`, `sphere`, `torus`, `lotus`, `helico_military`, `helico_civil`, `tank`, `car`, `van`, `dyno`, `head`, `plane`, `ship`, `ship`, `teddy`

## Architecture

```
website/
├── js/                  Engine source files
│   ├── loader.js        Loads all scripts in the correct order
│   ├── engine3d.js      Main engine (viewport, lights, matrix)
│   ├── object3d.js      3D object (geometry, textures)
│   ├── object3dFactory.js  Object registry and JSON loader
│   ├── object3dRenderer*.js  Rendering strategies
│   ├── zBuffer.js       Z-buffer
│   ├── matrix.js        4×4 transformation matrices
│   ├── light.js         Point light sources
│   └── input.js         Keyboard and mouse input
├── objects/             3D objects in .obj.json format
└── texture/             Texture images
```

## License

This program is distributed under the LGPL License. For more information see the [./LICENSE.md](./LICENSE.md) file.
