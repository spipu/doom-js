# UZDoom assets — GPL v3

The files in this directory are **not** covered by the MIT license of the rest
of lib3d_js. They are third-party assets taken verbatim from **UZDoom** and are
licensed under the **GNU General Public License v3** (see `LICENSE.md` in this
directory for the full text).

- **Source project**: UZDoom — https://github.com/UZDoom/uzdoom
- **Origin paths in that repo**: `wadsrc/static/graphics/` (the `sprite/`
  directories below), `libraries/Translation/games/<game>/{en_US,fr}.po` (the
  `text/` ones).
- **Copyright**: the ZDoom / GZDoom / UZDoom contributors (Marisa Heit,
  Christoph Oelckers et al.) for the graphics and the French translations; the
  original English texts are id Software's and Raven Software's, UZDoom being
  the vehicle under which they are redistributed here.

Two kinds of files: impact decal graphics (bullet chips and explosion
scorches), which do not exist in the Doom IWADs and cannot be reproduced
faithfully by procedural generation; and the end-of-chapter story texts, which
live in the game executables rather than in the IWADs, so a WAD alone cannot
provide them. A WAD that carries its own (Freedoom, in its `DEHACKED` lump)
always wins over these.

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

## Files (`doom/text/`, `heretic/text/`)

`finale.json` — the story text shown between two chapters and at the end of the
game, as a translation catalog (`{code: {fr, en}}`) merged straight into the
app's own. Its codes are namespaced by game profile, matching the cluster codes
of the vanilla `mapinfo` (`finale.doom.E1TEXT` … `C6TEXT`,
`finale.heretic.HE1TEXT` … `HE5TEXT`).

| File | Codes | Covers |
|---|---|---|
| `doom/text/finale.json` | `E1TEXT`…`E4TEXT`, `C1TEXT`…`C6TEXT` | Doom, Doom II |
| `heretic/text/finale.json` | `HE1TEXT`…`HE5TEXT` | Heretic |

Transcribed verbatim, line breaks included. The game drops the ones inside a
paragraph when it displays them (the modal reflows on its own), and applies
that same rule to the texts a WAD provides — so the choice lives in the code,
not in this transcription.

## Licensing consequence

Because these files are GPL v3, redistributing lib3d_js together with this
directory places the distributed combination under GPL v3 copyleft obligations
for these files. The rest of the project remains under the MIT license
(`/LICENSE.md`). Removing this directory restores a fully MIT distribution.
