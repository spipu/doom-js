# UZDoom assets — GPL v3

The files in this directory are **not** covered by the MIT license of the rest
of lib3d_js. They are third-party assets taken verbatim from **UZDoom** and are
licensed under the **GNU General Public License v3** (see `LICENSE.md` in this
directory for the full text).

- **Source project**: UZDoom — https://github.com/UZDoom/uzdoom
- **Origin path in that repo**: `wadsrc/static/graphics/`
- **Copyright**: the ZDoom / GZDoom / UZDoom contributors (Marisa Heit,
  Christoph Oelckers et al.).

These are impact decal graphics (bullet chips and explosion scorches), which do
not exist in the Doom IWADs and cannot be reproduced faithfully by procedural
generation.

## Files (`doom/sprite/`)

| File | Role | Weapon / projectile |
|---|---|---|
| `chip1.png` … `chip5.png` | bullet impact chips (5 random variants) | Pistol / Chaingun / Shotgun / SuperShotgun / Chainsaw |
| `scorch1.png` | explosion scorch | Rocket |
| `plasma1.png`, `plasma2.png` | plasma lower scorch | Plasma Rifle |
| `bfglite1.png`, `bfglite2.png` | BFG lightning burst | BFG 9000 |
| `bfgscrc1.png`, `bfgscrc2.png` | BFG lower scorch | BFG 9000 |

## Files (`heretic/sprite/`)

| File | Role | Weapon / projectile |
|---|---|---|
| `cbowmark.png` | bolt scorch | Ethereal Crossbow |
| `cbalscr1.png`, `cbalscr2.png` | small lower scorch (RailScorchLower) | Gold Wand / Dragon Claw |
| `bal7scr1.png`, `bal7scr2.png` | ball scorch (BaronScorch) | Firemace |

(The Hellstaff and Phoenix Rod reuse `doom/sprite/plasma1.png` /
`plasma2.png` / `scorch1.png`, already loaded by the Doom profile.)

## Licensing consequence

Because these files are GPL v3, redistributing lib3d_js together with this
directory places the distributed combination under GPL v3 copyleft obligations
for these files. The rest of the project remains under the MIT license
(`/LICENSE.md`). Removing this directory restores a fully MIT distribution.
