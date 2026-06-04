#!/usr/bin/env python3
"""Convert a Doom WAD map to Proto3d format."""

import struct, json, math, os, sys
from collections import defaultdict
from PIL import Image

if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <path/to/freedoom.wad> [MAP_NAME]")
    print(f"  MAP_NAME defaults to E1M1")
    sys.exit(1)

WAD_PATH  = sys.argv[1]
MAP_NAME  = sys.argv[2].upper() if len(sys.argv) >= 3 else None
OUT_DIR   = os.path.dirname(os.path.abspath(__file__))
TEX_DIR   = os.path.join(OUT_DIR, "texture")
SCALE     = 1.0 / 64.0   # 64 Doom units = 1 metre

# ── Spawn override (set to override WAD THINGS position, leave None for WAD default) ──
SPAWN_POSITION = [19.31, 0.37, -11.68]
SPAWN_YAW      = 172.5
SPAWN_PITCH    = 0.0

# Linedef types that trigger door-open actions
# 2   = W1 Open Stay (walk, stays open) — 6x in E1M1
# 117 = DR Turbo door (same as 1 but faster); same sector geometry, different animation speed
DOOR_SPECIALS = {1, 2, 26, 27, 28, 31, 32, 33, 34, 63, 117, 118}

# Speed in Doom units/tic for each door special type (35 tics/s)
DOOR_SPEED_BY_SPECIAL = {
    # Slow (2 u/tic)
    1: 2, 2: 2, 3: 2, 4: 2, 26: 2, 27: 2, 28: 2, 29: 2,
    42: 2, 50: 2, 61: 2, 75: 2, 76: 2, 86: 2, 90: 2, 103: 2,
    # Fast (8 u/tic)
    31: 8, 32: 8, 33: 8, 34: 8, 63: 8,
    # Turbo (16 u/tic vanilla, slowed 25% for visual comfort → 12 u/tic)
    117: 12, 118: 12,
}
DOOR_WAIT_TICS = 150  # tics before auto-close (~4.3 s)

# Trigger type per door special ('action' = press E, 'always' = auto)
DOOR_TRIGGER_BY_SPECIAL = {
    # Press E (DR/D1/SR/S1): action
    1: 'action', 26: 'action', 27: 'action', 28: 'action',
    31: 'action', 32: 'action', 33: 'action', 34: 'action',
    63: 'action', 117: 'action', 118: 'action',
    # Walk (W1/WR): proximity
    2: 'proximity', 86: 'proximity', 75: 'proximity', 76: 'proximity', 90: 'proximity',
}
# Loop flag per door special
DOOR_LOOP_BY_SPECIAL = {
    # DR (repeatable): loop=false — plays once per press, restartable
    1: False, 26: False, 27: False, 28: False, 63: False, 117: False,
    # D1/W1 (one-shot open-stay): loop=false + onlyOnce — plays once, stays open
    2: False, 31: False, 32: False, 33: False, 34: False, 118: False,
}
# onlyOnce: door plays exactly once then stays at final position
DOOR_ONLY_ONCE_BY_SPECIAL = {
    # Open-stay (one-shot): never close after opening
    2: True, 31: True, 32: True, 33: True, 34: True, 118: True,
    # Repeatable: can retrigger
    1: False, 26: False, 27: False, 28: False, 63: False, 117: False,
}
# Animation type: 'round-trip' = open-wait-close, 'one-way' = open only
DOOR_ANIM_BY_SPECIAL = {
    2: 'one-way', 31: 'one-way', 32: 'one-way', 33: 'one-way', 34: 'one-way', 118: 'one-way',
    1: 'round-trip', 26: 'round-trip', 27: 'round-trip', 28: 'round-trip',
    63: 'round-trip', 117: 'round-trip',
}
# Action radius in metres (xz_diagonal/2 + this margin)
DOOR_ACTION_RADIUS = 0.5

# Linedef types that move a floor downward (Lower Lift, Lower Floor, etc.)
# Static map shows these sectors with floor at min(adjacent_fh)
FLOOR_MOVE_DOWN_SPECIALS = {23, 36, 37, 38, 56, 62, 82, 83, 84, 88}

# Lift/floor animation properties by special type
# Speed in Doom units/tic (35 tics/s) — Slow=2, Normal=4, Fast=8, Turbo=16
LIFT_SPEED_BY_SPECIAL = {
    62: 4,  88: 4,                    # Lower Lift: Normal (4 u/tic)
    23: 2,  38: 2,  82: 2,  83: 2,   # Lower Floor: Slow (2 u/tic)
    36: 8,  37: 2,  56: 2,  84: 2,   # Various floor movers
}
# 'round-trip' = goes down, waits, comes back up (loop)
# 'one-way'    = goes down once and stays
LIFT_ANIM_BY_SPECIAL = {
    62: 'round-trip', 88: 'round-trip',
    23: 'one-way', 36: 'one-way', 37: 'one-way', 38: 'one-way',
    56: 'one-way', 82: 'one-way', 83: 'one-way', 84: 'one-way',
}
LIFT_TRIGGER_BY_SPECIAL = {
    62: 'action',    # SR switch → press E
    88: 'proximity', # WR walk → approximated as proximity
    23: 'action',    # S1 switch → press E
    36: 'always', 37: 'always', 38: 'always',
    56: 'always', 82: 'always', 83: 'always', 84: 'always',
}
LIFT_LOOP_BY_SPECIAL = {
    62: False, 88: False,
    23: False, 36: False, 37: False, 38: False,
    56: False, 82: False, 83: False, 84: False,
}
LIFT_ONLY_ONCE_BY_SPECIAL = {
    62: False, 88: False,
    23: True, 36: True, 37: True, 38: True,
    56: True,  82: True, 83: True, 84: True,
}
LIFT_WAIT_TICS = 105  # tics at bottom before rising (Lower Lift)

# Linedef flags
ML_BLOCKING      = 0x01  # blocks players and monsters
ML_BLOCKMONSTERS = 0x02  # blocks monsters only
ML_DONTPEGTOP    = 0x08  # upper texture not pegged (anchored to lower ceiling)
ML_DONTPEGBOTTOM = 0x10  # lower/middle textures not pegged (anchored to floor)

# Doom picture-column format sentinel
PATCH_END_COLUMN = 0xFF

# Doom units left at the top of a door panel for the ceiling track mechanism
DOOR_TRACK_OFFSET = 4

# Half player height in metres — door local origin is placed at this Y above the floor
PLAYER_HEIGHT      = 0.875       # 56 doom units
HALF_PLAYER_HEIGHT = PLAYER_HEIGHT / 2  # 0.4375 m

# ─── WAD reader ───────────────────────────────────────────────────────────────

class WAD:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.data = f.read()
        _, num_lumps, dir_off = struct.unpack_from('<4sII', self.data, 0)
        self.lump_list = []
        self.lump_map  = {}
        for i in range(num_lumps):
            o = dir_off + i * 16
            loff, lsize = struct.unpack_from('<II', self.data, o)
            name = self.data[o+8:o+16].rstrip(b'\x00').decode('ascii', errors='replace')
            self.lump_list.append((name, loff, lsize))
            self.lump_map[name] = (loff, lsize)

    def get(self, name):
        if name not in self.lump_map: return None
        o, s = self.lump_map[name]
        return self.data[o:o+s]

    def get_between(self, start, end):
        """Return all non-empty lumps located between two marker lumps."""
        result, active = {}, False
        for name, o, s in self.lump_list:
            if name == start:  active = True;  continue
            if name == end:    active = False;  continue
            if active and s > 0:
                result[name] = self.data[o:o+s]
        return result

    def first_map_name(self):
        """Return the name of the first map found in the WAD (the lump before THINGS)."""
        for i, (name, o, s) in enumerate(self.lump_list):
            if i + 1 < len(self.lump_list) and self.lump_list[i + 1][0] == 'THINGS':
                return name
        return None

    def get_map_lumps(self, map_name):
        """Return the sub-lumps of a map (THINGS, LINEDEFS, …) in order."""
        ORDER = ['THINGS','LINEDEFS','SIDEDEFS','VERTEXES','SEGS',
                 'SSECTORS','NODES','SECTORS','REJECT','BLOCKMAP']
        result, found = {}, False
        for name, o, s in self.lump_list:
            if name == map_name: found = True; continue
            if found:
                if name in ORDER: result[name] = self.data[o:o+s]
                else: break
        return result

# ─── Map data parsers ─────────────────────────────────────────────────────────

def parse_vertexes(data):
    return [struct.unpack_from('<hh', data, i*4) for i in range(len(data)//4)]

def parse_linedefs(data):
    res = []
    for i in range(len(data)//14):
        o = i*14
        v1,v2,flags,special,tag = struct.unpack_from('<HHHHH', data, o)
        right,left = struct.unpack_from('<hh', data, o+10)
        res.append({'v1':v1,'v2':v2,'flags':flags,'special':special,
                    'tag':tag,'right':right,'left':left})
    return res

def parse_sidedefs(data):
    res = []
    for i in range(len(data)//30):
        o = i*30
        xo,yo = struct.unpack_from('<hh', data, o)
        upper  = data[o+4 :o+12].rstrip(b'\x00').decode('ascii','replace').upper()
        lower  = data[o+12:o+20].rstrip(b'\x00').decode('ascii','replace').upper()
        middle = data[o+20:o+28].rstrip(b'\x00').decode('ascii','replace').upper()
        sector = struct.unpack_from('<H', data, o+28)[0]
        res.append({'xo':xo,'yo':yo,'upper':upper,'lower':lower,'middle':middle,'sector':sector})
    return res

def parse_sectors(data):
    res = []
    for i in range(len(data)//26):
        o = i*26
        fh,ch = struct.unpack_from('<hh', data, o)
        ft = data[o+4 :o+12].rstrip(b'\x00').decode('ascii','replace').upper()
        ct = data[o+12:o+20].rstrip(b'\x00').decode('ascii','replace').upper()
        light,special,tag = struct.unpack_from('<HHH', data, o+20)
        res.append({'fh':fh,'ch':ch,'ft':ft,'ct':ct,
                    'light':light,'special':special,'tag':tag})
    return res

def parse_things(data):
    res = []
    for i in range(len(data)//10):
        o = i*10
        x, y = struct.unpack_from('<hh', data, o)
        angle, ttype, flags = struct.unpack_from('<HHH', data, o+4)
        res.append({'x':x, 'y':y, 'angle':angle, 'type':ttype, 'flags':flags})
    return res

# ─── Texture extraction ───────────────────────────────────────────────────────

def load_palette(wad):
    data = wad.get('PLAYPAL')
    return [(data[i*3], data[i*3+1], data[i*3+2]) for i in range(256)] if data \
           else [(i,i,i) for i in range(256)]

def load_pnames(wad):
    data = wad.get('PNAMES')
    if not data: return []
    n = struct.unpack_from('<I', data, 0)[0]
    return [data[4+i*8:4+i*8+8].rstrip(b'\x00').decode('ascii','replace').upper()
            for i in range(n)]

def patch_to_rgba(data, palette):
    """Decode a Doom picture (patch) into an RGBA PIL image.

    Column format: top_delta, count, unused_pad, pixels…, unused_pad.
    top_delta == PATCH_END_COLUMN marks the end of the column list.
    """
    w, h = struct.unpack_from('<HH', data, 0)
    img = Image.new('RGBA', (w, h), (0,0,0,0))
    pix = img.load()
    cols = struct.unpack_from(f'<{w}I', data, 8)
    for x in range(w):
        off = cols[x]
        while True:
            td = data[off]; off += 1
            if td == PATCH_END_COLUMN: break
            count = data[off]; off += 2  # skip count + leading unused pad
            for j in range(count):
                y = td + j
                if 0 <= y < h:
                    r,g,b = palette[data[off]]
                    pix[x,y] = (r,g,b,255)
                off += 1
            off += 1  # skip trailing unused pad
    return img

def build_wall_texture(wad, name, palette, pnames, patches):
    """Compose a wall texture from its patch list (TEXTURE1 / TEXTURE2 lumps)."""
    for lump_name in ('TEXTURE1', 'TEXTURE2'):
        tex = wad.get(lump_name)
        if not tex: continue
        n = struct.unpack_from('<I', tex, 0)[0]
        offsets = struct.unpack_from(f'<{n}I', tex, 4)
        for i in range(n):
            o = offsets[i]
            tname = tex[o:o+8].rstrip(b'\x00').decode('ascii','replace').upper()
            if tname != name: continue
            w,h = struct.unpack_from('<HH', tex, o+12)
            pc  = struct.unpack_from('<H', tex, o+20)[0]
            img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            for p in range(pc):
                po = o+22+p*10
                ox,oy = struct.unpack_from('<hh', tex, po)
                pi    = struct.unpack_from('<H', tex, po+4)[0]
                if pi >= len(pnames): continue
                pn = pnames[pi]
                if pn not in patches: continue
                patch = patch_to_rgba(patches[pn], palette)
                img.paste(patch, (ox, oy), mask=patch.split()[3])
            return img
    return None

def flat_to_image(data, palette):
    """Decode a Doom flat (64×64 raw palette indices) into a PIL RGB image."""
    img = Image.new('RGB', (64, 64))
    pix = img.load()
    for y in range(64):
        for x in range(64):
            pix[x,y] = palette[data[y*64+x]]
    return img

_tex_abspath = {}  # name.upper() → absolute file path (populated by save_texture)

def save_texture(img, name):
    """Save a PIL image to TEX_DIR as PNG (if transparent) or JPEG.

    Skips writing if the file already exists. Always registers the path in
    _tex_abspath so get_tex_abspath() can resolve it without filesystem hits.
    Returns the relative URL path for use in .obj.json files.
    """
    os.makedirs(TEX_DIR, exist_ok=True)
    uname = name.upper()
    has_alpha = (img.mode == 'RGBA' and img.getextrema()[3][0] < 255)
    if has_alpha:
        abspath = os.path.join(TEX_DIR, uname + '.png')
        relpath = './assets/doom/texture/' + uname + '.png'
        if not os.path.exists(abspath):
            img.save(abspath, 'PNG')
    else:
        abspath = os.path.join(TEX_DIR, uname + '.jpg')
        relpath = './assets/doom/texture/' + uname + '.jpg'
        if not os.path.exists(abspath):
            img.convert('RGB').save(abspath, 'JPEG', quality=85)
    _tex_abspath[uname] = abspath
    return relpath

def get_tex_abspath(name):
    """Return the absolute filesystem path of a previously saved texture.

    Falls back to guessing the extension when the texture is not registered
    (should not happen in normal operation, but avoids a hard crash).
    Checks for PNG first because transparent textures are saved as PNG.
    """
    uname = name.upper()
    if uname in _tex_abspath:
        return _tex_abspath[uname]
    png_path = os.path.join(TEX_DIR, uname + '.png')
    return png_path if os.path.exists(png_path) else os.path.join(TEX_DIR, uname + '.jpg')

# ─── Animated texture sequences ──────────────────────────────────────────────

def _parse_animated_lump(data, wad, flats):
    """Parse a Boom ANIMATED lump into animation sequences.

    Each 23-byte record: type(1) + last_name(9) + first_name(9) + speed(4).
    type 0xFF = end marker, 0 = flat, 1 = wall texture.

    Expands first→last ranges using the ordered flat/texture name lists from
    the WAD itself — no assumptions about naming conventions.
    """
    flat_names = list(flats.keys())

    wall_names = []
    for lump_name in ('TEXTURE1', 'TEXTURE2'):
        tex = wad.get(lump_name)
        if not tex:
            continue
        n = struct.unpack_from('<I', tex, 0)[0]
        offsets = struct.unpack_from(f'<{n}I', tex, 4)
        for i in range(n):
            o = offsets[i]
            name = tex[o:o+8].rstrip(b'\x00').decode('ascii', 'replace').upper()
            if name not in wall_names:
                wall_names.append(name)

    sequences = []
    i = 0
    while i < len(data):
        type_byte = data[i]
        if type_byte == 0xFF:
            break
        if i + 23 > len(data):
            break
        is_flat   = (type_byte == 0)
        last_name  = data[i+1 :i+10].rstrip(b'\x00').decode('ascii', 'replace').upper()
        first_name = data[i+10:i+19].rstrip(b'\x00').decode('ascii', 'replace').upper()
        i += 23

        name_list = flat_names if is_flat else wall_names
        if first_name not in name_list or last_name not in name_list:
            continue
        fi = name_list.index(first_name)
        li = name_list.index(last_name)
        if li < fi:
            continue
        speed_tics = struct.unpack_from('<I', data, i - 23 + 19)[0]
        frames = name_list[fi:li+1]
        if len(frames) > 1:
            sequences.append((is_flat, frames, speed_tics))

    return sequences


def load_anim_sequences(wad, flats):
    """Return animation sequences as a list of (is_flat, [frames], speed_tics).

    Reads the ANIMATED lump if present (Boom-compatible WADs).
    Falls back to the vanilla Doom hardcoded list (p_spec.c, speed = 8 tics).
    """
    animated = wad.get('ANIMATED')
    if animated:
        sequences = _parse_animated_lump(animated, wad, flats)
        if sequences:
            print(f"  ANIMATED lump: {len(sequences)} sequences")
            return sequences

    print("  No ANIMATED lump — using vanilla fallback sequences")
    return [
        (True,  ['NUKAGE1', 'NUKAGE2', 'NUKAGE3'],              8),
        (True,  ['FWATER1', 'FWATER2', 'FWATER3', 'FWATER4'],   8),
        (True,  ['SWATER1', 'SWATER2', 'SWATER3', 'SWATER4'],   8),
        (True,  ['LAVA1',   'LAVA2',   'LAVA3',   'LAVA4'],     8),
        (True,  ['BLOOD1',  'BLOOD2',  'BLOOD3'],                8),
        (True,  ['RROCK05', 'RROCK06', 'RROCK07', 'RROCK08'],   8),
        (True,  ['SLIME01', 'SLIME02', 'SLIME03', 'SLIME04'],   8),
        (True,  ['SLIME05', 'SLIME06', 'SLIME07', 'SLIME08'],   8),
        (True,  ['SLIME09', 'SLIME10', 'SLIME11', 'SLIME12'],   8),
        (False, ['BLODGR1', 'BLODGR2', 'BLODGR3', 'BLODGR4'],  8),
        (False, ['SLADRIP1', 'SLADRIP2', 'SLADRIP3'],           8),
        (False, ['BLODRIP1', 'BLODRIP2', 'BLODRIP3', 'BLODRIP4'], 8),
        (False, ['FIREWALA', 'FIREWALB', 'FIREWALL'],            8),
        (False, ['GSTFONT1', 'GSTFONT2', 'GSTFONT3'],           8),
        (False, ['FIRELAV3', 'FIRELAVA'],                        8),
        (False, ['FIREMAG1', 'FIREMAG2', 'FIREMAG3'],           8),
        (False, ['FIREBLU1', 'FIREBLU2'],                        8),
        (False, ['ROCKRED1', 'ROCKRED2', 'ROCKRED3'],           8),
        (False, ['BFALL1', 'BFALL2', 'BFALL3', 'BFALL4'],      8),
        (False, ['SFALL1', 'SFALL2', 'SFALL3', 'SFALL4'],       8),
        (False, ['WFALL1', 'WFALL2', 'WFALL3', 'WFALL4'],       8),
        (False, ['DBRAIN1', 'DBRAIN2', 'DBRAIN3', 'DBRAIN4'],  8),
    ]

# ─── Polygon triangulation (ear-clipping) ────────────────────────────────────

def cross2d(o, a, b):
    return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])

def point_in_triangle(p, a, b, c):
    d1 = cross2d(p, a, b)
    d2 = cross2d(p, b, c)
    d3 = cross2d(p, c, a)
    has_neg = (d1<0) or (d2<0) or (d3<0)
    has_pos = (d1>0) or (d2>0) or (d3>0)
    return not (has_neg and has_pos)

def is_ear(poly, i):
    """Return True if vertex i is a convex ear of polygon poly (CCW winding).

    Coordinate-duplicate vertices (bridge copies) are skipped in the interior
    test so that the duplicated bridge seam doesn't incorrectly block valid ears.
    """
    n = len(poly)
    a = poly[(i-1) % n]
    b = poly[i]
    c = poly[(i+1) % n]
    if cross2d(a, b, c) <= 0: return False  # reflex or collinear
    for j in range(n):
        if j in ((i-1)%n, i, (i+1)%n): continue
        p = poly[j]
        if p == a or p == b or p == c: continue  # coordinate duplicate (bridge seam)
        if point_in_triangle(p, a, b, c): return False
    return True

def triangulate(polygon):
    """Ear-clipping triangulation. polygon = [(x,z), ...] must be CCW.

    Returns a list of (i, j, k) index triples into the original polygon array.
    Stops early on degenerate (non-convex, self-intersecting) polygons.
    """
    poly    = list(polygon)
    tris    = []
    indices = list(range(len(poly)))
    while len(indices) > 3:
        progress = False
        for k in range(len(indices)):
            sub = [poly[idx] for idx in indices]
            if is_ear(sub, k):
                tris.append((indices[(k-1) % len(indices)],
                              indices[k],
                              indices[(k+1) % len(indices)]))
                indices.pop(k)
                progress = True
                break
        if not progress:
            break  # degenerate polygon, give up
    if len(indices) == 3:
        tris.append(tuple(indices))
    return tris

def point_in_polygon_2d(px, pz, poly):
    """Ray-casting point-in-polygon test in 2D (x, z)."""
    inside = False
    n = len(poly)
    for i in range(n):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % n]
        if ((az > pz) != (bz > pz)) and (px < (bx - ax) * (pz - az) / (bz - az) + ax):
            inside = not inside
    return inside


def merge_holes_into_polygon(outer, holes):
    """Merge hole polygons into outer polygon via bridge cuts (earcut/Eberly algorithm).

    Follows Mapbox earcut's approach:
    - For each hole, find its leftmost vertex M (min x)
    - Cast ray leftward from M; find nearest outer edge intersection
    - Bridge to the outer vertex with smallest x on that edge
    - Refine: if a reflex outer vertex is inside triangle (M, I, P), use it instead
    - Both bridge vertices are duplicated so the ear-clipper can handle the seam

    outer, holes: lists of (x, z) vertices in any winding.
    Returns a simple polygon for ear-clip triangulation.
    """
    result = list(outer)

    # Process holes sorted by leftmost vertex x, left-to-right (earcut convention)
    def leftmost_x(h):
        return min(v[0] for v in h)

    for hole in sorted(holes, key=leftmost_x):
        # M = leftmost vertex of hole
        m = min(range(len(hole)), key=lambda i: (hole[i][0], hole[i][1]))
        mx, mz = hole[m]

        # Cast ray leftward (−x direction) from M; find nearest intersecting outer edge
        best_x  = -float('inf')   # nearest means largest x (closest from the left)
        best_ix = -float('inf')   # x of intersection point
        best_vi = -1
        n = len(result)
        for i in range(n):
            ax, az = result[i]
            bx, bz = result[(i + 1) % n]
            if abs(bz - az) < 1e-9:
                continue
            s = (mz - az) / (bz - az)
            if s < 0.0 or s > 1.0:
                continue
            ix = ax + s * (bx - ax)
            if ix > mx:           # intersection must be to the LEFT of M
                continue
            if ix > best_x:       # nearest = largest x among those to the left
                best_x  = ix
                best_ix = ix
                # Candidate: outer endpoint whose x is closest to intersection ix
                best_vi = i if abs(ax - ix) < abs(bx - ix) else (i + 1) % n

        if best_vi < 0:
            continue

        # Refinement (Eberly): look for outer vertices inside triangle (M, I, P)
        # that form a smaller angle; pick the one minimising angle from M.
        px, pz = result[best_vi]
        import math
        best_angle = math.atan2(pz - mz, px - mx)
        for i in range(n):
            vx, vz = result[i]
            if vx >= mx or vx < best_x:
                continue  # must be in the left half and not beyond intersection
            if not point_in_polygon_2d(vx, vz, result):
                continue  # must be inside the outer polygon
            # Check inside the candidate triangle (M, intersection, P)
            angle = math.atan2(vz - mz, vx - mx)
            if abs(angle - best_angle) < 1e-9:
                if vx > px:       # closer to M → prefer it
                    best_vi = i
                    px, pz = vx, vz
                    best_angle = angle

        # Merge: result[:p+1] + [M, hole_m+1..m-1, M_copy, result[p]_copy] + result[p+1..]
        # Both M and result[p] duplicated (earcut splitPolygon convention).
        vi = best_vi
        hole_verts = [hole[(m + j) % len(hole)] for j in range(len(hole))]
        result = (result[:vi + 1] +
                  hole_verts + [hole[m], result[vi]] +
                  result[vi + 1:])

    return result


def polygon_area_sign(poly):
    """Shoelace sign for a polygon in the (x, z) plane.

    Uses Σ(x_{i+1}-x_i)(z_{i+1}+z_i) = -2 * signed_area, so:
      positive → CW winding
      negative → CCW winding
    triangulate() requires CCW input, so reverse the polygon when this returns positive.
    """
    s = 0
    n = len(poly)
    for i in range(n):
        x0,z0 = poly[i]
        x1,z1 = poly[(i+1)%n]
        s += (x1-x0)*(z1+z0)
    return s

# ─── Sector polygon builder ───────────────────────────────────────────────────

def build_sector_polygons(sector_id, linedefs, sidedefs, vertexes):
    """Return ordered vertex-index chains forming the boundary of a sector.

    Each chain is a list of vertex indices forming a closed loop.
    A sector may have multiple chains (outer boundary + inner islands).
    """
    edges = []
    for ld in linedefs:
        if ld['right'] >= 0 and ld['right'] < len(sidedefs):
            if sidedefs[ld['right']]['sector'] == sector_id:
                edges.append((ld['v1'], ld['v2']))
        if ld['left'] >= 0 and ld['left'] < len(sidedefs):
            if sidedefs[ld['left']]['sector'] == sector_id:
                edges.append((ld['v2'], ld['v1']))

    if not edges: return []

    # Build adjacency: start vertex → list of end vertices
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)

    # Walk chains greedily, consuming each directed edge at most once
    used   = set()
    chains = []
    for start_a, start_b in edges:
        if (start_a, start_b) in used: continue
        chain = [start_a, start_b]
        used.add((start_a, start_b))
        cur = start_b
        while True:
            nexts = [v for v in adj[cur] if (cur,v) not in used]
            if not nexts: break
            nxt = nexts[0]
            used.add((cur, nxt))
            if nxt == chain[0]:
                break  # closed loop
            chain.append(nxt)
            cur = nxt
        if len(chain) >= 3:
            chains.append(chain)

    return chains

# ─── Geometry builders ────────────────────────────────────────────────────────

def doom_to_world(dx, dy, dz_height=None):
    """Convert Doom map coordinates to world (x, y, z).

    Doom x → world x, Doom y → world z (same sign — not negated).
    Optional dz_height → world y (up axis).
    """
    x = dx * SCALE
    z = dy * SCALE
    if dz_height is not None:
        return x, dz_height * SCALE, z
    return x, z

def wall_length_doom(verts, v1, v2):
    """Return the 2D length of a wall segment in Doom units."""
    x1,y1 = verts[v1]
    x2,y2 = verts[v2]
    return math.sqrt((x2-x1)**2 + (y2-y1)**2)

def add_wall_quad(pts, faces, tex_idx,
                  x1, z1, x2, z2,
                  y_bot, y_top,
                  wall_len_doom, tex_w, tex_h,
                  x_off=0, y_off=0,
                  flip=False, light=128, clamp_v=False,
                  passable_user=False, passable_enemy=False):
    """Append a textured wall quad (two triangles) to pts and faces.

    flip=False → front face (normal on the right-hand side of v1→v2).
    flip=True  → back face (normal on the left-hand side).
    y_off is the pixel offset from the top of the texture.
    fcAdd applies v = 1-v on load, so stored V = 1 - display_V.
    """
    if y_bot >= y_top: return
    if tex_w <= 0 or tex_h <= 0: return

    u0 = x_off / tex_w
    u1 = (x_off + wall_len_doom) / tex_w
    h_doom = (y_top - y_bot) / SCALE
    vt = 1.0 - y_off / tex_h
    vb = 1.0 - (y_off + h_doom) / tex_h

    # 4 vertices: bottom-left, bottom-right, top-right, top-left
    i = len(pts)
    pts.append([x1, y_bot, z1])
    pts.append([x2, y_bot, z2])
    pts.append([x2, y_top, z2])
    pts.append([x1, y_top, z1])

    c = int(light)
    col = [c, c, c]

    def face(pts_list, map_list):
        f = {'pts': pts_list, 'color': col}
        if tex_idx >= 0:
            f['texture'] = tex_idx + 1
            f['map']     = map_list
        if clamp_v:
            f['clampV'] = True
        if passable_user:
            f['passableUser'] = True
        if passable_enemy:
            f['passableEnemy'] = True
        return f

    if not flip:
        # flip=False: viewer on left of v1→v2, so v1 is to viewer's right → u reversed
        faces.append(face([i+1,i+2,i+3], [[u1,vb],[u0,vb],[u0,vt]]))
        faces.append(face([i+1,i+3,i+4], [[u1,vb],[u0,vt],[u1,vt]]))
    else:
        faces.append(face([i+1,i+3,i+2], [[u0,vb],[u1,vt],[u1,vb]]))
        faces.append(face([i+1,i+4,i+3], [[u0,vb],[u0,vt],[u1,vt]]))

def add_flat_quad(pts, faces, tex_idx, poly_verts_2d, y_height,
                  is_floor, light=128, holes=None):
    """Triangulate and append a floor or ceiling polygon to pts and faces.

    poly_verts_2d: list of (doom_x, doom_y) pairs forming the sector polygon.
    holes: optional list of hole polygons (lists of (doom_x, doom_y) pairs).
    Doom flat UV tiles every 64 units, derived directly from Doom coordinates.
    """
    if len(poly_verts_2d) < 3: return

    c = int(light)
    col = [c, c, c]

    xz = [doom_to_world(vx, vy) for vx, vy in poly_verts_2d]

    # Merge holes into outer polygon via bridge cuts before triangulating.
    # Fallback to outer-only if the merged polygon fails to produce enough triangles.
    poly_local = list(poly_verts_2d)
    pre_tris   = None
    if holes:
        merged    = merge_holes_into_polygon(poly_local, holes)
        xz_merged = [doom_to_world(vx, vy) for vx, vy in merged]
        if polygon_area_sign(xz_merged) > 0:
            xz_merged = xz_merged[::-1]; merged = merged[::-1]
        t = triangulate(xz_merged)
        if len(t) >= len(merged) - 2 - len(holes):   # good enough
            poly_local = merged
            xz         = xz_merged
            pre_tris   = t

    # triangulate() requires CCW winding; reverse CW polygons
    if polygon_area_sign(xz) > 0:
        xz         = xz[::-1]
        poly_local = poly_local[::-1]

    base = len(pts)
    for (x, z) in xz:
        pts.append([x, y_height * SCALE, z])

    tris = pre_tris if pre_tris is not None else triangulate(xz)

    def flat_uv(idx):
        return [poly_local[idx][0] / 64.0, -poly_local[idx][1] / 64.0]

    for (a, b, c_idx) in tris:
        if is_floor:
            # CCW polygon → swap [a,b,c] to [a,c,b] for an upward-facing normal
            faces.append({'pts':[base+a+1, base+c_idx+1, base+b+1],
                          'color':col, 'texture':tex_idx+1,
                          'map':[flat_uv(a), flat_uv(c_idx), flat_uv(b)]})
        else:
            # CCW polygon → keep [a,b,c] for a downward-facing normal (visible from below)
            faces.append({'pts':[base+a+1, base+b+1, base+c_idx+1],
                          'color':col, 'texture':tex_idx+1,
                          'map':[flat_uv(a), flat_uv(b), flat_uv(c_idx)]})

# ─── JSON output ──────────────────────────────────────────────────────────────

def write_obj_json(obj, path):
    """Write a Proto3d .obj.json with one texture/point/face per line.

    This compact-per-entry format is required by the engine and keeps files
    grep-friendly without the verbosity of standard indented JSON.
    """
    lines = ['{\n']
    lines.append('"textures": [\n')
    for i, t in enumerate(obj['textures']):
        comma = ',' if i < len(obj['textures'])-1 else ''
        lines.append(f'{json.dumps(t)}{comma}\n')
    lines.append('],\n')
    lines.append('"points": [\n')
    for i, p in enumerate(obj['points']):
        comma = ',' if i < len(obj['points'])-1 else ''
        lines.append(f'{json.dumps(p)}{comma}\n')
    lines.append('],\n')
    lines.append('"faces": [\n')
    for i, f in enumerate(obj['faces']):
        comma = ',' if i < len(obj['faces'])-1 else ''
        lines.append(f'{json.dumps(f, separators=(",",":"))}{comma}\n')
    lines.append(']\n}')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as fp:
        fp.write(''.join(lines))

# ─── Main conversion ──────────────────────────────────────────────────────────

def main():
    os.makedirs(TEX_DIR, exist_ok=True)

    print("Loading WAD...")
    wad     = WAD(WAD_PATH)

    global MAP_NAME
    if MAP_NAME is None:
        MAP_NAME = wad.first_map_name()
        if MAP_NAME is None:
            print("Error: no map found in WAD")
            sys.exit(1)
        print(f"Auto-detected first map: {MAP_NAME}")

    palette = load_palette(wad)
    pnames  = load_pnames(wad)

    print("Loading patches and flats...")
    patches = wad.get_between('P_START', 'P_END')
    flats   = wad.get_between('F_START', 'F_END')
    # Some WADs use PP_START/PP_END instead of P_START/P_END
    if not patches:
        patches = wad.get_between('PP_START', 'PP_END')
    # Last resort: collect patch lumps by name from PNAMES
    if not patches:
        patches = {}
        for pn in pnames:
            data = wad.get(pn)
            if data and len(data) > 8:
                patches[pn] = data

    print(f"Found {len(patches)} patches, {len(flats)} flats")
    print("Loading animation sequences...")
    anim_sequences = load_anim_sequences(wad, flats)

    print(f"Loading map {MAP_NAME}...")
    lumps    = wad.get_map_lumps(MAP_NAME)
    vertexes = parse_vertexes(lumps['VERTEXES'])
    linedefs = parse_linedefs(lumps['LINEDEFS'])
    sidedefs = parse_sidedefs(lumps['SIDEDEFS'])
    sectors  = parse_sectors(lumps['SECTORS'])
    things   = parse_things(lumps['THINGS'])
    print(f"  {len(vertexes)} verts, {len(linedefs)} lines, "
          f"{len(sectors)} sectors, {len(things)} things")

    # ── Texture registry ──────────────────────────────────────────────────────
    tex_paths = []  # index → relative URL path
    tex_index = {}  # name → 0-based index

    def ensure_wall_tex(name):
        if not name or name == '-': return -1
        if name in tex_index: return tex_index[name]
        img = build_wall_texture(wad, name, palette, pnames, patches)
        if img is None:
            print(f"  WARN: wall texture '{name}' not found")
            return -1
        path = save_texture(img, name)
        idx = len(tex_paths)
        tex_paths.append(path)
        tex_index[name] = idx
        return idx

    def ensure_flat_tex(name):
        if not name or name == '-': return -1
        key = 'FLAT_' + name  # prefix avoids collisions with wall textures of the same name
        if key in tex_index: return tex_index[key]
        data = flats.get(name)
        if data is None:
            print(f"  WARN: flat '{name}' not found")
            return -1
        img = flat_to_image(data, palette)
        path = save_texture(img, name)
        idx = len(tex_paths)
        tex_paths.append(path)
        tex_index[key] = idx
        return idx

    def build_anim_groups(tex_list):
        """Append animation siblings to tex_list and return (new_list, anim_map).

        For each animated sequence where at least one frame is already in tex_list,
        appends the missing frames at the end. Only actually-used sequences get
        siblings — no unused textures added.

        Returns:
          new_list : original paths + appended siblings
          anim_map : dict mapping 1-based first-frame index →
                     {"ids": [idx1, idx2, ...], "duration": seconds_per_frame}
                     Used to patch individual faces.
        """
        def name_from_path(p):
            return os.path.splitext(os.path.basename(p))[0].upper()

        name_to_idx = {name_from_path(p): i + 1 for i, p in enumerate(tex_list)}
        new_list    = list(tex_list)
        anim_map    = {}

        for is_flat, frames, speed_tics in anim_sequences:
            if not any(f in name_to_idx for f in frames):
                continue
            for name in frames:
                if name in name_to_idx:
                    continue
                if is_flat:
                    data = flats.get(name)
                    if data:
                        p = save_texture(flat_to_image(data, palette), name)
                        name_to_idx[name] = len(new_list) + 1
                        new_list.append(p)
                else:
                    img = build_wall_texture(wad, name, palette, pnames, patches)
                    if img:
                        p = save_texture(img, name)
                        name_to_idx[name] = len(new_list) + 1
                        new_list.append(p)
            ids = [name_to_idx[f] for f in frames if f in name_to_idx]
            if len(ids) > 1:
                anim_map[ids[0]] = {'ids': ids, 'duration': round(speed_tics / 35, 4)}

        return new_list, anim_map

    # ── Identify door sectors ─────────────────────────────────────────────────
    # A linedef with a door special controls the sector referenced by its tag
    # (remote door) or by its left sidedef sector (local door, tag == 0).
    door_sector_ids      = set()
    door_sector_speed    = {}  # si → doom units/tic
    door_sector_trigger  = {}  # si → 'action' | 'always'
    door_sector_loop     = {}  # si → bool
    door_sector_onlyone  = {}  # si → bool
    door_sector_anim     = {}  # si → 'round-trip' | 'one-way'
    for ld in linedefs:
        if ld['special'] in DOOR_SPECIALS:
            sp       = ld['special']
            speed    = DOOR_SPEED_BY_SPECIAL.get(sp, 2)
            trigger  = DOOR_TRIGGER_BY_SPECIAL.get(sp, 'action')
            loop     = DOOR_LOOP_BY_SPECIAL.get(sp, False)
            onlyone  = DOOR_ONLY_ONCE_BY_SPECIAL.get(sp, False)
            anim     = DOOR_ANIM_BY_SPECIAL.get(sp, 'round-trip')
            if ld['tag'] != 0:
                for si, sec in enumerate(sectors):
                    if sec['tag'] == ld['tag']:
                        door_sector_ids.add(si)
                        door_sector_speed[si]   = speed
                        door_sector_trigger[si] = trigger
                        door_sector_loop[si]    = loop
                        door_sector_onlyone[si] = onlyone
                        door_sector_anim[si]    = anim
            elif ld['left'] >= 0:
                si = sidedefs[ld['left']]['sector']
                door_sector_ids.add(si)
                door_sector_speed[si]   = speed
                door_sector_trigger[si] = trigger
                door_sector_loop[si]    = loop
                door_sector_onlyone[si] = onlyone
                door_sector_anim[si]    = anim

    print(f"  {len(door_sector_ids)} door sectors identified")

    # ── Identify floor-moves-down sectors (lifts, descending floors) ─────────────
    # These linedefs reference target sectors via tag; patch fh before any geometry.
    moving_floor_down_ids = set()
    lift_sector_special   = {}  # si → linedef special that triggered it
    for ld in linedefs:
        if ld['special'] in FLOOR_MOVE_DOWN_SPECIALS and ld['tag'] != 0:
            for si, sec in enumerate(sectors):
                if sec['tag'] == ld['tag'] and si not in door_sector_ids:
                    moving_floor_down_ids.add(si)
                    lift_sector_special[si] = ld['special']

    # Save original fh and min adjacent fh before patching — needed for lift instances.
    lift_original_fh = {}  # si → original fh (Doom units, before patch)
    lift_min_adj_fh  = {}  # si → min(adjacent_fh) (Doom units)
    for si in moving_floor_down_ids:
        adj_fh = []
        for ld in linedefs:
            if ld['right'] < 0 or ld['left'] < 0: continue
            r_si = sidedefs[ld['right']]['sector']
            l_si = sidedefs[ld['left']]['sector']
            if r_si == si and l_si not in moving_floor_down_ids:
                adj_fh.append(sectors[l_si]['fh'])
            elif l_si == si and r_si not in moving_floor_down_ids:
                adj_fh.append(sectors[r_si]['fh'])
        lift_original_fh[si] = sectors[si]['fh']
        lift_min_adj_fh[si]  = min(adj_fh) if adj_fh else sectors[si]['fh']

    # Patch fh to min(adjacent_fh) so static map shows the lift in down position.
    for si in moving_floor_down_ids:
        sectors[si]['fh'] = lift_min_adj_fh[si]

    print(f"  {len(moving_floor_down_ids)} floor-moves-down sectors patched")

    # Pre-compute real room heights for each door sector via BFS on adjacent sectors.
    # Door sectors have fh=ch=-128 (underground); we need the actual corridor heights
    # to generate correct frame geometry (jambs and lintel) and floor/ceiling.
    door_room_heights = {}  # sector_id → (room_fh, room_ch) in Doom units
    for si in door_sector_ids:
        sec = sectors[si]
        room_fh     = max(0, sec['fh'])
        room_ch     = room_fh + 128  # fallback: standard Doom room height
        visited_bfs = {si}
        bfs_queue   = [si]
        found_ch    = False
        for _ in range(2):
            next_q = []
            for curr in bfs_queue:
                for ld in linedefs:
                    for r, l in [(ld['right'], ld['left']), (ld['left'], ld['right'])]:
                        if r < 0 or l < 0: continue
                        if sidedefs[r]['sector'] != curr: continue
                        other = sidedefs[l]['sector']
                        if other in visited_bfs or other in door_sector_ids: continue
                        visited_bfs.add(other)
                        ch = sectors[other]['ch']
                        if room_fh + 32 < ch <= room_fh + 192:
                            if not found_ch or ch > room_ch:
                                room_ch = ch
                                found_ch = True
                        next_q.append(other)
            bfs_queue = next_q
        door_room_heights[si] = (room_fh, room_ch)

    # Pre-compute floor/ceiling heights for door sectors (same logic as the flat rendering).
    # floor_h = min adjacent fh, ceil_h = min adjacent ch - DOOR_TRACK_OFFSET
    door_heights = {}  # sector_id → (floor_h, ceil_h) in Doom units
    for si in door_sector_ids:
        adj = []
        for ld in linedefs:
            if ld['right'] < 0 or ld['left'] < 0: continue
            if sidedefs[ld['right']]['sector'] == si:
                other = sidedefs[ld['left']]['sector']
                if other not in door_sector_ids: adj.append(sectors[other])
            elif sidedefs[ld['left']]['sector'] == si:
                other = sidedefs[ld['right']]['sector']
                if other not in door_sector_ids: adj.append(sectors[other])
        if not adj: continue
        floor_h = min(s['fh'] for s in adj)
        non_sky = [s for s in adj if not s['ct'].startswith('F_SKY')]
        ceil_h  = (min(s['ch'] for s in non_sky) - DOOR_TRACK_OFFSET) if non_sky else floor_h + 128
        door_heights[si] = (floor_h, ceil_h)

    # ── Wall geometry ─────────────────────────────────────────────────────────
    pts   = []
    faces = []

    print("Generating walls...")
    for ld in linedefs:
        v1i, v2i = ld['v1'], ld['v2']
        dx1, dy1 = vertexes[v1i]
        dx2, dy2 = vertexes[v2i]
        wx1, wz1 = doom_to_world(dx1, dy1)
        wx2, wz2 = doom_to_world(dx2, dy2)
        wall_len  = wall_length_doom(vertexes, v1i, v2i)

        has_right = ld['right'] >= 0
        has_left  = ld['left']  >= 0

        if not has_right:
            continue

        r_sd  = sidedefs[ld['right']]
        r_sec = sectors[r_sd['sector']]
        r_is_door = r_sd['sector'] in door_sector_ids

        if not has_left:
            if r_is_door:
                # One-sided lateral wall of door sector
                if r_sd['sector'] not in door_heights: continue
                floor_h, ceil_h = door_heights[r_sd['sector']]
                tex_name = r_sd['middle']
                if not tex_name or tex_name == '-': continue
                ti = ensure_wall_tex(tex_name)
                if ti < 0: continue
                tw, th = Image.open(get_tex_abspath(tex_name)).size
                lower_unpeg_ld = bool(ld['flags'] & ML_DONTPEGBOTTOM)
                yo = r_sd['yo'] + ((th - (ceil_h - floor_h) % th) % th if lower_unpeg_ld else 0)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              floor_h * SCALE, ceil_h * SCALE,
                              wall_len, tw, th,
                              r_sd['xo'], yo,
                              flip=True, light=r_sec['light'])
                continue
            # One-sided linedef → solid wall
            tex_name = r_sd['middle']
            ti = ensure_wall_tex(tex_name)
            if ti >= 0:
                tw, th = Image.open(get_tex_abspath(tex_name)).size
                h_doom = r_sec['ch'] - r_sec['fh']
                # ML_DONTPEGBOTTOM: texture bottom at floor instead of texture top at ceiling
                yo = r_sd['yo'] + (th - h_doom if bool(ld['flags'] & ML_DONTPEGBOTTOM) else 0)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              r_sec['fh'] * SCALE, r_sec['ch'] * SCALE,
                              wall_len, tw, th,
                              r_sd['xo'], yo,
                              flip=True, light=r_sec['light'])
        else:
            l_sd  = sidedefs[ld['left']]
            l_sec = sectors[l_sd['sector']]
            l_is_door = l_sd['sector'] in door_sector_ids
            r_is_lift = r_sd['sector'] in moving_floor_down_ids
            l_is_lift = l_sd['sector'] in moving_floor_down_ids

            r_fh = r_sec['fh'];  r_ch = r_sec['ch']
            l_fh = l_sec['fh'];  l_ch = l_sec['ch']

            upper_unpeg = bool(ld['flags'] & ML_DONTPEGTOP)
            lower_unpeg = bool(ld['flags'] & ML_DONTPEGBOTTOM)

            # Door sector two-sided linedefs — geometry handled by door instance, skip

            # Lower wall: step up from right sector floor to left sector floor
            if l_fh > r_fh and not r_is_door and not l_is_door:
                tex_name = r_sd['lower']
                ti = ensure_wall_tex(tex_name)
                tw, th = (128, 128) if ti < 0 else Image.open(get_tex_abspath(tex_name)).size
                # lower_unpeg: texture hangs from the front ceiling (r_ch) rather than the floor
                yo = r_sd['yo'] + (r_ch - l_fh if lower_unpeg else 0)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              r_fh*SCALE, l_fh*SCALE,
                              wall_len, tw, th,
                              r_sd['xo'], yo,
                              flip=True, light=r_sec['light'])

            # Lower wall from left side
            if r_fh > l_fh and not l_is_door and not r_is_door:
                tex_name = l_sd['lower']
                ti = ensure_wall_tex(tex_name)
                tw, th = (128, 128) if ti < 0 else Image.open(get_tex_abspath(tex_name)).size
                yo = l_sd['yo'] + (l_ch - r_fh if lower_unpeg else 0)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              l_fh*SCALE, r_fh*SCALE,
                              wall_len, tw, th,
                              l_sd['xo'], yo,
                              flip=False, light=l_sec['light'])

            # Upper wall: ceiling step down from right sector to left sector
            if l_ch < r_ch and not r_is_door and not l_is_door:
                tex_name = r_sd['upper']
                ti = ensure_wall_tex(tex_name)
                tw, th = (128, 128) if ti < 0 else Image.open(get_tex_abspath(tex_name)).size
                # Default: bottom of texture at lower ceiling (l_ch = y_bot).
                # DONTPEGTOP: top of texture at higher ceiling (r_ch = y_top).
                yo = r_sd['yo'] + (0 if upper_unpeg else (th - (r_ch - l_ch)))
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              l_ch*SCALE, r_ch*SCALE,
                              wall_len, tw, th,
                              r_sd['xo'], yo,
                              flip=True, light=r_sec['light'])

            # Upper wall from left side
            if r_ch < l_ch and not l_is_door and not r_is_door:
                tex_name = l_sd['upper']
                ti = ensure_wall_tex(tex_name)
                tw, th = (128, 128) if ti < 0 else Image.open(get_tex_abspath(tex_name)).size
                yo = l_sd['yo'] + (0 if upper_unpeg else (th - (l_ch - r_ch)))
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              r_ch*SCALE, l_ch*SCALE,
                              wall_len, tw, th,
                              l_sd['xo'], yo,
                              flip=False, light=l_sec['light'])

            # Middle texture — transparent fence/grating, rendered from both sides.
            # In Doom, middle textures are shown exactly ONCE (no vertical tiling):
            # the geometry is clipped to one texture height within the opening.
            # A two-sided linedef without ML_BLOCKING is a "false wall": visible but passable.
            mid_passable_user  = not bool(ld['flags'] & ML_BLOCKING)
            mid_passable_enemy = mid_passable_user and not bool(ld['flags'] & ML_BLOCKMONSTERS)
            for m_sd, m_sec, other_sec in [(r_sd, r_sec, l_sec), (l_sd, l_sec, r_sec)]:
                if not (m_sd['middle'] and m_sd['middle'] != '-'): continue
                if m_sd['sector'] in door_sector_ids: continue
                tex_name = m_sd['middle']
                ti = ensure_wall_tex(tex_name)
                if ti < 0: continue
                tw, th = Image.open(get_tex_abspath(tex_name)).size
                bot_du = max(r_fh, l_fh)
                top_du = min(r_ch, l_ch)
                if top_du <= bot_du: continue
                if lower_unpeg:
                    # DONTPEGBOTTOM: texture bottom anchored at floor, extends upward once
                    ybot = bot_du
                    ytop = min(top_du, bot_du + th)
                    h_vis = ytop - ybot
                    yo = m_sd['yo'] + (th - h_vis)  # ensures display_vb ≈ 1 at floor
                else:
                    # Default: texture top anchored at ceiling, hangs down once
                    ytop = top_du
                    ybot = max(bot_du, top_du - th)
                    yo = m_sd['yo']
                if ytop <= ybot: continue
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              ybot*SCALE, ytop*SCALE,
                              wall_len, tw, th,
                              m_sd['xo'], yo,
                              flip=True, light=m_sec['light'], clamp_v=True,
                              passable_user=mid_passable_user, passable_enemy=mid_passable_enemy)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              ybot*SCALE, ytop*SCALE,
                              wall_len, tw, th,
                              m_sd['xo'], yo,
                              flip=False, light=other_sec['light'], clamp_v=True,
                              passable_user=mid_passable_user, passable_enemy=mid_passable_enemy)
                break  # both sides already covered by the flip=True/False pair above

    # ── Floor and ceiling geometry ────────────────────────────────────────────
    print("Generating floors and ceilings...")
    for si, sec in enumerate(sectors):
        chains = build_sector_polygons(si, linedefs, sidedefs, vertexes)
        if not chains: continue

        if si in door_sector_ids:
            # Collect adjacent non-door sectors (both directions of two-sided linedefs)
            adj_sectors = []
            for ld in linedefs:
                if ld['right'] < 0 or ld['left'] < 0: continue
                if sidedefs[ld['right']]['sector'] == si:
                    other = sidedefs[ld['left']]['sector']
                    if other not in door_sector_ids: adj_sectors.append(sectors[other])
                elif sidedefs[ld['left']]['sector'] == si:
                    other = sidedefs[ld['right']]['sector']
                    if other not in door_sector_ids: adj_sectors.append(sectors[other])
            if not adj_sectors: continue
            # Floor at the lowest adjacent floor height
            floor_h = min(s['fh'] for s in adj_sectors)
            ft = ensure_flat_tex(sec['ft'])
            # Ceiling: P_FindLowestCeilingSurrounding − DOOR_TRACK_OFFSET (Doom exact behaviour)
            non_sky = [s for s in adj_sectors if not s['ct'].startswith('F_SKY')]
            ct      = ensure_flat_tex(sec['ct']) if non_sky else -1
            ceil_h  = (min(s['ch'] for s in non_sky) - DOOR_TRACK_OFFSET) if non_sky else None
            # Separate outer chains from hole chains, then merge holes into each outer
            main_sign = max((polygon_area_sign([vertexes[vi] for vi in c]) for c in chains),
                            key=abs)
            outers = [[vertexes[vi] for vi in c] for c in chains
                      if (polygon_area_sign([vertexes[vi] for vi in c]) > 0) == (main_sign > 0)]
            holes  = [[vertexes[vi] for vi in c] for c in chains
                      if (polygon_area_sign([vertexes[vi] for vi in c]) > 0) != (main_sign > 0)]
            for poly_doom in outers:
                own_holes = [h for h in holes if point_in_polygon_2d(h[0][0], h[0][1], poly_doom)]
                if ft >= 0:
                    add_flat_quad(pts, faces, ft, poly_doom, floor_h,
                                  is_floor=True, light=sec['light'], holes=own_holes or None)
                # Ceiling of door sector omitted — the door instance covers it
            continue

        ft         = ensure_flat_tex(sec['ft'])
        has_sky    = sec['ct'].startswith('F_SKY')
        ct         = ensure_flat_tex(sec['ct']) if not has_sky else -1
        # Separate outer chains from hole chains; merge holes into outer via bridge cuts.
        if chains:
            main_sign = max((polygon_area_sign([vertexes[vi] for vi in c]) for c in chains),
                            key=abs)
            outers = [[vertexes[vi] for vi in c] for c in chains
                      if (polygon_area_sign([vertexes[vi] for vi in c]) > 0) == (main_sign > 0)]
            holes  = [[vertexes[vi] for vi in c] for c in chains
                      if (polygon_area_sign([vertexes[vi] for vi in c]) > 0) != (main_sign > 0)]
        else:
            outers, holes = [], []
        for poly_doom in outers:
            # Only pass holes that are geometrically inside this outer polygon
            own_holes = [h for h in holes if point_in_polygon_2d(h[0][0], h[0][1], poly_doom)]
            if ft >= 0 and si not in moving_floor_down_ids:
                add_flat_quad(pts, faces, ft, poly_doom, sec['fh'],
                              is_floor=True, light=sec['light'], holes=own_holes or None)
            # Skip sky flats — outdoor areas have no ceiling geometry
            if ct >= 0:
                add_flat_quad(pts, faces, ct, poly_doom, sec['ch'],
                              is_floor=False, light=sec['light'], holes=own_holes or None)

    # ── Write map.obj.json ────────────────────────────────────────────────────
    print(f"Writing map.obj.json ({len(pts)} pts, {len(faces)} faces, "
          f"{len(tex_paths)} textures)...")

    map_path = os.path.join(OUT_DIR, 'objects', 'map.obj.json')
    map_texs, map_anim_map = build_anim_groups(tex_paths)
    for face in faces:
        idx = face.get('texture')
        if idx in map_anim_map:
            face['textures'] = map_anim_map[idx]
            del face['texture']
    write_obj_json({
        'textures': map_texs,
        'points':   [[round(p[0],4), round(p[1],4), round(p[2],4)] for p in pts],
        'faces':    faces
    }, map_path)

    # ── Door meshes and instances ─────────────────────────────────────────────
    print("Generating door instances...")
    inst_dir = os.path.join(OUT_DIR, 'instances')
    obj_dir  = os.path.join(OUT_DIR, 'objects')
    os.makedirs(inst_dir, exist_ok=True)
    os.makedirs(obj_dir,  exist_ok=True)
    door_instances = {}

    for si in sorted(door_sector_ids):
        sec = sectors[si]

        # Collect all directed boundary edges of this door sector
        bounds = []
        for ld in linedefs:
            if ld['right'] >= 0 and sidedefs[ld['right']]['sector'] == si:
                bounds.append((vertexes[ld['v1']], vertexes[ld['v2']]))
            if ld['left'] >= 0 and sidedefs[ld['left']]['sector'] == si:
                bounds.append((vertexes[ld['v2']], vertexes[ld['v1']]))
        if not bounds: continue

        all_vx = [v[0] for seg in bounds for v in seg]
        all_vy = [v[1] for seg in bounds for v in seg]
        cx = (min(all_vx)+max(all_vx))/2 * SCALE
        cz = (min(all_vy)+max(all_vy))/2 * SCALE

        # Floor and ceiling heights for this door sector (adjacent corridor heights)
        floor_h, ceil_h = door_heights[si]

        # Door panel height: from adjacent floor to door ceiling
        h      = (ceil_h - floor_h) * SCALE
        travel = round(h, 4)

        door_name = f'door_{si}'

        # ── Door mesh: world-space geometry, instance at [0,0,0] ─────────────
        # Vertices at actual world positions — UV mapping via add_wall_quad
        # exactly like the static map. No local-origin offset needed.
        h_doom = ceil_h - floor_h  # door height in Doom units
        d_pts_raw  = []
        d_faces_raw = []

        for ld in linedefs:
            r_has = ld['right'] >= 0
            l_has = ld['left']  >= 0
            if not r_has: continue
            r_si2 = sidedefs[ld['right']]['sector']
            l_si2 = sidedefs[ld['left']]['sector'] if l_has else -1
            if r_si2 != si and l_si2 != si: continue

            dx1, dy1 = vertexes[ld['v1']]
            dx2, dy2 = vertexes[ld['v2']]
            lwx1, lwz1 = doom_to_world(dx1, dy1)
            lwx2, lwz2 = doom_to_world(dx2, dy2)
            lwall_len  = wall_length_doom(vertexes, ld['v1'], ld['v2'])
            lower_unpeg = bool(ld['flags'] & ML_DONTPEGBOTTOM)
            upper_unpeg = bool(ld['flags'] & ML_DONTPEGTOP)

            if r_si2 == si and l_has and l_si2 not in door_sector_ids:
                # Two-sided: door on right, corridor on left
                # Panel covers from floor to THIS corridor's ceiling (not min of all adjacent)
                l_sd   = sidedefs[ld['left']]
                l_sec2 = sectors[l_si2]
                tex = l_sd['upper']
                if not tex or tex == '-': continue
                ti_g = ensure_wall_tex(tex)
                if ti_g < 0: continue
                tw, th = Image.open(get_tex_abspath(tex)).size
                h_panel = l_sec2['ch'] - floor_h
                yo = l_sd['yo'] + (0 if upper_unpeg else (th - h_panel))
                add_wall_quad(d_pts_raw, d_faces_raw, ti_g,
                              lwx1, lwz1, lwx2, lwz2,
                              floor_h*SCALE, l_sec2['ch']*SCALE,
                              lwall_len, tw, th, l_sd['xo'], yo,
                              flip=False, light=l_sec2['light'])

            elif l_si2 == si and r_has and r_si2 not in door_sector_ids:
                # Two-sided: door on left, corridor on right
                r_sd   = sidedefs[ld['right']]
                r_sec2 = sectors[r_si2]
                tex = r_sd['upper']
                if not tex or tex == '-': continue
                ti_g = ensure_wall_tex(tex)
                if ti_g < 0: continue
                tw, th = Image.open(get_tex_abspath(tex)).size
                h_panel = r_sec2['ch'] - floor_h
                yo = r_sd['yo'] + (0 if upper_unpeg else (th - h_panel))
                add_wall_quad(d_pts_raw, d_faces_raw, ti_g,
                              lwx1, lwz1, lwx2, lwz2,
                              floor_h*SCALE, r_sec2['ch']*SCALE,
                              lwall_len, tw, th, r_sd['xo'], yo,
                              flip=True, light=r_sec2['light'])

        # No top flat: at corridor ceiling (z-fight with static ceiling).
        # Bottom flat: ceiling flat of door sector, visible from below when panel rises.
        has_sky = sec['ct'].startswith('F_SKY')
        ct = ensure_flat_tex(sec['ct']) if not has_sky else -1
        if ct >= 0:
            chains = build_sector_polygons(si, linedefs, sidedefs, vertexes)
            for chain in chains:
                poly_doom = [vertexes[vi] for vi in chain]
                add_flat_quad(d_pts_raw, d_faces_raw, ct, poly_doom, floor_h,
                              is_floor=False, light=sec['light'])

        # Remap global tex indices (1-based) → local 1-based for this obj.json
        used_global = sorted(set(f['texture'] for f in d_faces_raw if 'texture' in f))
        g_to_local  = {g: i+1 for i, g in enumerate(used_global)}
        local_texs  = [tex_paths[g-1] for g in used_global]
        for f in d_faces_raw:
            if 'texture' in f:
                f['texture'] = g_to_local[f['texture']]
        d_pts_out = [[round(v, 4) for v in p] for p in d_pts_raw]

        door_texs, door_anim_map = build_anim_groups(local_texs)
        for face in d_faces_raw:
            idx = face.get('texture')
            if idx in door_anim_map:
                face['textures'] = door_anim_map[idx]
                del face['texture']
        write_obj_json({'textures': door_texs, 'points': d_pts_out, 'faces': d_faces_raw},
                       os.path.join(obj_dir, f'{door_name}.obj.json'))

        # ── Door instance ──────────────────────────────────────────────────────
        inst_path = os.path.join(inst_dir, f'{door_name}.instance.json')
        floor_h, ceil_h = door_heights[si]
        travel_y    = round((ceil_h - floor_h) * SCALE, 4)
        speed_tics  = door_sector_speed.get(si, 2)
        trigger     = door_sector_trigger.get(si, 'action')
        loop        = door_sector_loop.get(si, False)
        onlyone     = door_sector_onlyone.get(si, False)
        anim        = door_sector_anim.get(si, 'round-trip')

        # Radius: half of the XZ bounding diagonal — scales with door width,
        # minimum DOOR_ACTION_RADIUS for very small doors.
        if d_pts_raw:
            xs = [p[0] for p in d_pts_raw]
            zs = [p[2] for p in d_pts_raw]
            xz_diag = math.sqrt((max(xs) - min(xs))**2 + (max(zs) - min(zs))**2)
            radius = round(xz_diag / 2.0 + DOOR_ACTION_RADIUS, 4)
        else:
            radius = DOOR_ACTION_RADIUS
        loop_str    = 'true' if loop else 'false'
        oo_str      = 'true' if onlyone else 'false'
        open_s      = round((ceil_h - floor_h) / speed_tics / 35.0, 4)
        wait_s      = round(DOOR_WAIT_TICS / 35.0, 4)
        if anim == 'one-way':
            kf = [
                {"t": 0.0,    "translate": [0, 0, 0],        "rotate": [0, 0, 0]},
                {"t": open_s, "translate": [0, travel_y, 0], "rotate": [0, 0, 0]},
            ]
        else:
            t_rest = round(open_s + wait_s + open_s, 4)
            kf = [
                {"t": 0.0,                       "translate": [0, 0, 0],        "rotate": [0, 0, 0]},
                {"t": open_s,                    "translate": [0, travel_y, 0], "rotate": [0, 0, 0]},
                {"t": round(open_s + wait_s, 4), "translate": [0, travel_y, 0], "rotate": [0, 0, 0]},
                {"t": t_rest,                    "translate": [0, 0, 0],        "rotate": [0, 0, 0]},
                {"t": round(t_rest + 1.0, 4),    "translate": [0, 0, 0],        "rotate": [0, 0, 0]},
            ]
        kf_lines = ',\n    '.join(json.dumps(k, separators=(', ', ': ')) for k in kf)
        inst_str = (
            '{\n'
            f'  "object":     "./assets/doom/objects/{door_name}.obj.json",\n'
            '  "position":   [0, 0, 0],\n'
            '  "rotation":   [0, 0, 0],\n'
            f'  "trigger":    "{trigger}",\n'
            f'  "loop":       {loop_str},\n'
            f'  "onlyOnce":   {oo_str},\n'
            '  "collidable": true,\n'
            f'  "radius":     {radius},\n'
            '  "damage":     null,\n'
            f'  "keyframes":  [\n    {kf_lines}\n  ]\n'
            '}'
        )
        with open(inst_path, 'w') as f:
            f.write(inst_str)
        door_instances[door_name] = f'./assets/doom/instances/{door_name}.instance.json'

    # ── Lift meshes and instances ─────────────────────────────────────────────
    print("Generating lift instances...")
    lift_instances = {}

    for si in sorted(moving_floor_down_ids):
        sec     = sectors[si]
        orig_fh = lift_original_fh[si]
        min_fh  = lift_min_adj_fh[si]
        if orig_fh <= min_fh:
            continue

        lift_name   = f'lift_{si}'
        l_pts_raw   = []
        l_faces_raw = []

        # Top flat: floor surface of the platform at original height
        ft = ensure_flat_tex(sec['ft'])
        if ft >= 0:
            chains = build_sector_polygons(si, linedefs, sidedefs, vertexes)
            for chain in chains:
                poly_doom = [vertexes[vi] for vi in chain]
                add_flat_quad(l_pts_raw, l_faces_raw, ft, poly_doom, orig_fh,
                              is_floor=True, light=sec['light'])

        # Side walls: riser from min_fh to orig_fh, moves with the platform.
        # Same convention as doors: corridor sidedef + matching flip.
        for ld in linedefs:
            if ld['right'] < 0 or ld['left'] < 0:
                continue
            r_si2 = sidedefs[ld['right']]['sector']
            l_si2 = sidedefs[ld['left']]['sector']
            if r_si2 != si and l_si2 != si:
                continue
            if r_si2 in moving_floor_down_ids and l_si2 in moving_floor_down_ids:
                continue

            dx1, dy1    = vertexes[ld['v1']]
            dx2, dy2    = vertexes[ld['v2']]
            lwx1, lwz1  = doom_to_world(dx1, dy1)
            lwx2, lwz2  = doom_to_world(dx2, dy2)
            lwall_len   = wall_length_doom(vertexes, ld['v1'], ld['v2'])
            lower_unpeg = bool(ld['flags'] & ML_DONTPEGBOTTOM)

            if r_si2 == si and l_si2 not in door_sector_ids:
                # Lift on right, corridor on left — same as door: l_sd + flip=False
                l_sd2   = sidedefs[ld['left']]
                l_sec2  = sectors[l_si2]
                tex     = l_sd2['lower']
                if not tex or tex == '-':
                    continue
                ti_g = ensure_wall_tex(tex)
                if ti_g < 0:
                    continue
                tw, th = Image.open(get_tex_abspath(tex)).size
                yo = l_sd2['yo'] + (l_sec2['ch'] - orig_fh if lower_unpeg else 0)
                add_wall_quad(l_pts_raw, l_faces_raw, ti_g,
                              lwx1, lwz1, lwx2, lwz2,
                              min_fh*SCALE, orig_fh*SCALE,
                              lwall_len, tw, th, l_sd2['xo'], yo,
                              flip=False, light=l_sec2['light'])

            elif l_si2 == si and r_si2 not in door_sector_ids:
                # Lift on left, corridor on right — same as door: r_sd + flip=True
                r_sd2   = sidedefs[ld['right']]
                r_sec2  = sectors[r_si2]
                tex     = r_sd2['lower']
                if not tex or tex == '-':
                    continue
                ti_g = ensure_wall_tex(tex)
                if ti_g < 0:
                    continue
                tw, th = Image.open(get_tex_abspath(tex)).size
                yo = r_sd2['yo'] + (r_sec2['ch'] - orig_fh if lower_unpeg else 0)
                add_wall_quad(l_pts_raw, l_faces_raw, ti_g,
                              lwx1, lwz1, lwx2, lwz2,
                              min_fh*SCALE, orig_fh*SCALE,
                              lwall_len, tw, th, r_sd2['xo'], yo,
                              flip=True, light=r_sec2['light'])

        if not l_pts_raw:
            continue

        # Remap global tex indices → local 1-based (same pattern as doors)
        used_global = sorted(set(f['texture'] for f in l_faces_raw if 'texture' in f))
        g_to_local  = {g: i+1 for i, g in enumerate(used_global)}
        local_texs  = [tex_paths[g-1] for g in used_global]
        for f in l_faces_raw:
            if 'texture' in f:
                f['texture'] = g_to_local[f['texture']]
        l_pts_out = [[round(v, 4) for v in p] for p in l_pts_raw]

        lift_texs, lift_anim_map = build_anim_groups(local_texs)
        for face in l_faces_raw:
            idx = face.get('texture')
            if idx in lift_anim_map:
                face['textures'] = lift_anim_map[idx]
                del face['texture']
        write_obj_json({'textures': lift_texs, 'points': l_pts_out, 'faces': l_faces_raw},
                       os.path.join(obj_dir, f'{lift_name}.obj.json'))

        # Lift instance: animation selon le type, boucle auto
        special  = lift_sector_special.get(si, 88)
        speed    = LIFT_SPEED_BY_SPECIAL.get(special, 4)
        xs       = [p[0] for p in l_pts_raw]
        zs       = [p[2] for p in l_pts_raw]
        xz_diag  = math.sqrt((max(xs) - min(xs))**2 + (max(zs) - min(zs))**2)
        radius   = round(xz_diag / 2.0 + DOOR_ACTION_RADIUS, 4)
        travel_y = round((orig_fh - min_fh) * SCALE, 4)
        move_s   = round((orig_fh - min_fh) / (speed * 35.0), 4)
        wait_s   = round(LIFT_WAIT_TICS / 35.0, 4)
        anim     = LIFT_ANIM_BY_SPECIAL.get(special, 'round-trip')
        trigger  = LIFT_TRIGGER_BY_SPECIAL.get(special, 'action')
        loop     = LIFT_LOOP_BY_SPECIAL.get(special, False)
        onlyone  = LIFT_ONLY_ONCE_BY_SPECIAL.get(special, False)
        if anim == 'one-way':
            kf = [
                {"t": 0.0,    "translate": [0,  0,        0], "rotate": [0, 0, 0]},
                {"t": move_s, "translate": [0, -travel_y, 0], "rotate": [0, 0, 0]},
            ]
        else:
            t_rest = round(move_s + wait_s + move_s, 4)
            kf = [
                {"t": 0.0,                       "translate": [0,  0,        0], "rotate": [0, 0, 0]},
                {"t": move_s,                    "translate": [0, -travel_y, 0], "rotate": [0, 0, 0]},
                {"t": round(move_s + wait_s, 4), "translate": [0, -travel_y, 0], "rotate": [0, 0, 0]},
                {"t": t_rest,                    "translate": [0,  0,        0], "rotate": [0, 0, 0]},
                {"t": round(t_rest + 1.0, 4),    "translate": [0,  0,        0], "rotate": [0, 0, 0]},
            ]
        loop_str = 'true' if loop else 'false'
        oo_str   = 'true' if onlyone else 'false'
        kf_lines  = ',\n    '.join(json.dumps(k, separators=(', ', ': ')) for k in kf)
        inst_path = os.path.join(inst_dir, f'{lift_name}.instance.json')
        inst_str = (
            '{\n'
            f'  "object":     "./assets/doom/objects/{lift_name}.obj.json",\n'
            '  "position":   [0, 0, 0],\n'
            '  "rotation":   [0, 0, 0],\n'
            f'  "trigger":    "{trigger}",\n'
            f'  "loop":       {loop_str},\n'
            f'  "onlyOnce":   {oo_str},\n'
            '  "collidable": true,\n'
            f'  "radius":     {radius},\n'
            '  "damage":     null,\n'
            f'  "keyframes":  [\n    {kf_lines}\n  ]\n'
            '}'
        )
        with open(inst_path, 'w') as f:
            f.write(inst_str)
        lift_instances[lift_name] = f'./assets/doom/instances/{lift_name}.instance.json'

    print(f"  {len(lift_instances)} lift instances generated")

    # ── Player spawn from THINGS lump ─────────────────────────────────────────
    # Thing type 1 = Player 1 start. Doom angle 0 = east, 90 = north.
    # Engine yaw: 0 = north (+Z), 90 = east (+X). Conversion: yaw = (90 - doom_angle) % 360
    player1 = next((t for t in things if t['type'] == 1), None)
    if player1:
        spawn_x   = player1['x'] * SCALE
        spawn_z   = player1['y'] * SCALE
        spawn_yaw = (90 - player1['angle']) % 360
    else:
        spawn_x, spawn_z, spawn_yaw = -6.5, 4.0, 90

    # ── Write definition.json ─────────────────────────────────────────────────
    # Position/yaw/pitch always come from the WAD THINGS lump (computed above).
    # Other tunable settings (gravity, jump, background, ambient) are preserved
    # from an existing definition.json if present.
    # To force a custom debug spawn, add "spawn_override": [x,y,z,yaw,pitch] in
    # the user section of definition.json — the script will apply it on top.
    def_path = os.path.join(OUT_DIR, 'definition.json')
    spawn_y     = 0.3
    spawn_pitch = 0
    ambient    = [200, 200, 200]
    gravity     = 9.81
    max_jump    = 3.5
    step_height = 0.375
    background  = [200, 200, 200]
    if os.path.exists(def_path):
        with open(def_path) as f:
            existing = json.load(f)
        u = existing.get('user', {})
        ambient    = existing.get('lights', {}).get('ambient', ambient)
        gravity     = u.get('gravity',         gravity)
        max_jump    = u.get('maxJumpVelocity', max_jump)
        step_height = u.get('stepHeight',      step_height)
        background  = existing.get('background', background)

    # Apply script-level spawn overrides if set
    if SPAWN_POSITION is not None:
        spawn_x, spawn_y, spawn_z = SPAWN_POSITION
    if SPAWN_YAW is not None:
        spawn_yaw = SPAWN_YAW
    if SPAWN_PITCH is not None:
        spawn_pitch = SPAWN_PITCH

    defn = {
        'user': {
            'position':        [round(spawn_x,4), round(spawn_y,4), round(spawn_z,4)],
            'yaw':             spawn_yaw,
            'pitch':           spawn_pitch,
            'maxEnergy':       100,
            'height':          PLAYER_HEIGHT,
            'eyeRatio':        0.73,    # eyes at 41/56 of height
            'radius':          0.25,    # 16 doom units
            'gravity':         gravity         if os.path.exists(def_path) else 9.81,
            'maxJumpVelocity': max_jump        if os.path.exists(def_path) else 3.5,
            'maxSlopeAngle':   50,
            'moveSpeed':       0.0036,  # default +20% vs generic world; tune per map
            'stepHeight':      step_height,
        },
        'background': background if os.path.exists(def_path) else [200, 200, 200],
        'lights': {
            'ambient': ambient,
            'sources': []
        },
        'map': './assets/doom/objects/map.obj.json',
        'instances': {**door_instances, **lift_instances}
    }
    with open(def_path, 'w') as f:
        json.dump(defn, f, indent=2)

    # ── Export animation frame siblings ──────────────────────────────────────
    # For each animated sequence where at least one frame is referenced by the
    # map, export all remaining frames so the JS animation system can load them.
    print("Exporting animation frame siblings...")
    anim_exported = 0
    for is_flat, frames, _speed in anim_sequences:
        if is_flat:
            if not any('FLAT_' + f in tex_index for f in frames):
                continue
            for name in frames:
                if 'FLAT_' + name in tex_index:
                    continue
                data = flats.get(name)
                if data:
                    save_texture(flat_to_image(data, palette), name)
                    anim_exported += 1
        else:
            if not any(f in tex_index for f in frames):
                continue
            for name in frames:
                if name in tex_index:
                    continue
                img = build_wall_texture(wad, name, palette, pnames, patches)
                if img:
                    save_texture(img, name)
                    anim_exported += 1
    if anim_exported:
        print(f"  {anim_exported} additional animation frames exported")

    print(f"Done! {len(door_instances)} door instances.")
    print(f"Map: {map_path}")
    print(f"Textures: {len(tex_paths)} + {anim_exported} anim siblings saved to {TEX_DIR}")

if __name__ == '__main__':
    main()
