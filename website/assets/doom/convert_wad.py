#!/usr/bin/env python3
"""Convert Freedoom Phase 1 E1M1 to Proto3d doom map format."""

import struct, json, math, os, sys
from collections import defaultdict
from PIL import Image

WAD_PATH  = "/home/lamin/git/test/lib3d_js/.old/freedoom/freedoom1.wad"
OUT_DIR   = "/home/lamin/git/test/lib3d_js/website/assets/doom"
TEX_DIR   = os.path.join(OUT_DIR, "texture")
MAP_NAME  = "E1M1"
SCALE     = 1.0 / 64.0   # 64 Doom units = 1 metre

DOOR_SPECIALS = {1, 26, 27, 28, 31, 32, 33, 34, 63, 118}  # types that open doors

# ─── WAD reader ──────────────────────────────────────────────────────────────

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
        result, active = {}, False
        for name, o, s in self.lump_list:
            if name == start:  active = True;  continue
            if name == end:    active = False;  continue
            if active and s > 0:
                result[name] = self.data[o:o+s]
        return result

    def get_map_lumps(self, map_name):
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
    w, h = struct.unpack_from('<HH', data, 0)
    img = Image.new('RGBA', (w, h), (0,0,0,0))
    pix = img.load()
    cols = struct.unpack_from(f'<{w}I', data, 8)
    for x in range(w):
        off = cols[x]
        while True:
            td = data[off]; off += 1
            if td == 0xFF: break
            ln = data[off]; off += 2
            for j in range(ln):
                y = td + j
                if 0 <= y < h:
                    r,g,b = palette[data[off]]
                    pix[x,y] = (r,g,b,255)
                off += 1
            off += 1
    return img

def build_wall_texture(wad, name, palette, pnames, patches):
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
    img = Image.new('RGB', (64, 64))
    pix = img.load()
    for y in range(64):
        for x in range(64):
            pix[x,y] = palette[data[y*64+x]]
    return img

_tex_abspath = {}  # name.upper() → absolute file path

def save_texture(img, name):
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
    return _tex_abspath.get(name.upper(), os.path.join(TEX_DIR, name.upper() + '.jpg'))

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
    n  = len(poly)
    a  = poly[(i-1) % n]
    b  = poly[i]
    c  = poly[(i+1) % n]
    if cross2d(a, b, c) <= 0: return False  # reflex vertex
    for j in range(n):
        if j in ((i-1)%n, i, (i+1)%n): continue
        if point_in_triangle(poly[j], a, b, c): return False
    return True

def triangulate(polygon):
    """Ear-clipping triangulation. polygon = [(x,z), ...] CCW."""
    poly = list(polygon)
    tris = []
    indices = list(range(len(poly)))
    while len(indices) > 3:
        progress = False
        for k in range(len(indices)):
            i  = indices[k]
            pi = [poly[indices[(k-1) % len(indices)]],
                  poly[i],
                  poly[indices[(k+1) % len(indices)]]]
            # check if ear using original polygon subset
            sub = [poly[idx] for idx in indices]
            kk  = k
            if is_ear(sub, kk):
                tris.append((indices[(k-1) % len(indices)],
                              i,
                              indices[(k+1) % len(indices)]))
                indices.pop(k)
                progress = True
                break
        if not progress:
            break  # degenerate polygon, give up
    if len(indices) == 3:
        tris.append(tuple(indices))
    return tris

def polygon_area_sign(poly):
    """Return + if CCW, - if CW (in x/z plane, z pointing down on screen)."""
    s = 0
    n = len(poly)
    for i in range(n):
        x0,z0 = poly[i]
        x1,z1 = poly[(i+1)%n]
        s += (x1-x0)*(z1+z0)
    return s  # positive = CW in standard coords (since z increases down)

# ─── Sector polygon builder ───────────────────────────────────────────────────

def build_sector_polygons(sector_id, linedefs, sidedefs, vertexes):
    """Return a list of vertex-index chains forming the sector boundary."""
    edges = []
    for ld in linedefs:
        if ld['right'] >= 0 and ld['right'] < len(sidedefs):
            if sidedefs[ld['right']]['sector'] == sector_id:
                edges.append((ld['v1'], ld['v2']))
        if ld['left'] >= 0 and ld['left'] < len(sidedefs):
            if sidedefs[ld['left']]['sector'] == sector_id:
                edges.append((ld['v2'], ld['v1']))

    if not edges: return []

    # Build adjacency: start -> list of ends
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)

    # Follow chains
    used  = set()
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
                break  # closed
            chain.append(nxt)
            cur = nxt
        if len(chain) >= 3:
            chains.append(chain)

    return chains

# ─── Geometry builders ────────────────────────────────────────────────────────

def doom_to_world(dx, dy, dz_height=None):
    """Convert Doom (x, y, height) to world (x, y, z)."""
    x = dx * SCALE
    z = dy * SCALE
    if dz_height is not None:
        return x, dz_height * SCALE, z
    return x, z

def wall_length_doom(verts, v1, v2):
    x1,y1 = verts[v1]
    x2,y2 = verts[v2]
    return math.sqrt((x2-x1)**2 + (y2-y1)**2)

def add_wall_quad(pts, faces, tex_idx,
                  x1, z1, x2, z2,
                  y_bot, y_top,
                  wall_len_doom, tex_w, tex_h,
                  x_off=0, y_off=0,
                  flip=False, light=128):
    if y_bot >= y_top: return
    if tex_w <= 0 or tex_h <= 0: return

    u0 = x_off / tex_w
    u1 = (x_off + wall_len_doom) / tex_w
    # fcAdd applies v = 1-v on load, so store (1 - display_v)
    # display_v at top = y_off/tex_h, at bottom = (y_off+h_doom)/tex_h
    h_doom = (y_top - y_bot) / SCALE
    vt = 1.0 - y_off / tex_h
    vb = 1.0 - (y_off + h_doom) / tex_h

    # 4 points: bottom-left, bottom-right, top-right, top-left
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
        return f

    if not flip:
        faces.append(face([i+1,i+2,i+3], [[u0,vb],[u1,vb],[u1,vt]]))
        faces.append(face([i+1,i+3,i+4], [[u0,vb],[u1,vt],[u0,vt]]))
    else:
        faces.append(face([i+1,i+3,i+2], [[u0,vb],[u1,vt],[u1,vb]]))
        faces.append(face([i+1,i+4,i+3], [[u0,vb],[u0,vt],[u1,vt]]))

def add_flat_quad(pts, faces, tex_idx, poly_verts_2d, y_height,
                  is_floor, light=128):
    """Add floor or ceiling triangles from a sector polygon."""
    if len(poly_verts_2d) < 3: return

    c = int(light)
    col = [c, c, c]

    # Convert to (x, z) for triangulation
    xz = [(doom_to_world(vx, vy)) for vx, vy in poly_verts_2d]

    # polygon_area_sign > 0 → CW in ear-clipping convention → no ears found
    # Always reverse to CCW (area < 0) so triangulate() works correctly
    poly_local = list(poly_verts_2d)
    area = polygon_area_sign(xz)
    if area > 0:
        xz = xz[::-1]
        poly_local = poly_local[::-1]

    base = len(pts)
    for (x, z) in xz:
        pts.append([x, y_height * SCALE, z])

    tris = triangulate(xz)

    for (a, b, c_idx) in tris:
        # UV from Doom coordinates (64x64 tile)
        def flat_uv(idx):
            return [poly_local[idx][0] / 64.0, -poly_local[idx][1] / 64.0]

        if is_floor:
            # CCW polygon → swap [a,b,c] to [a,c,b] for upward normal
            faces.append({'pts':[base+a+1, base+c_idx+1, base+b+1],
                          'color':col, 'texture':tex_idx+1,
                          'map':[flat_uv(a), flat_uv(c_idx), flat_uv(b)]})
        else:
            # CCW polygon → keep [a,b,c] for downward normal (visible from below)
            faces.append({'pts':[base+a+1, base+b+1, base+c_idx+1],
                          'color':col, 'texture':tex_idx+1,
                          'map':[flat_uv(a), flat_uv(b), flat_uv(c_idx)]})

# ─── Main conversion ──────────────────────────────────────────────────────────

def main():
    os.makedirs(TEX_DIR, exist_ok=True)

    print("Loading WAD...")
    wad     = WAD(WAD_PATH)
    palette = load_palette(wad)
    pnames  = load_pnames(wad)

    print("Loading patches and flats...")
    patches = wad.get_between('P_START', 'P_END')
    flats   = wad.get_between('F_START', 'F_END')
    # Also try PP markers (some WADs use PP_START/PP_END)
    if not patches:
        patches = wad.get_between('PP_START', 'PP_END')
    # Fall back: collect all patch lumps listed in PNAMES
    if not patches:
        patches = {}
        for pn in pnames:
            data = wad.get(pn)
            if data and len(data) > 8:
                patches[pn] = data

    print(f"Found {len(patches)} patches, {len(flats)} flats")

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
    # We'll build lists of textures needed, cache them, assign indices
    tex_paths  = []   # index → relative path
    tex_index  = {}   # name → index (0-based)

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
        key = 'FLAT_' + name
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

    # ── Identify door sectors ─────────────────────────────────────────────────
    door_sector_ids = set()
    for ld in linedefs:
        if ld['special'] in DOOR_SPECIALS:
            # The sector tagged by ld['tag'] is the door sector
            # OR (for local doors) the left sidedef sector
            if ld['tag'] != 0:
                for si, sec in enumerate(sectors):
                    if sec['tag'] == ld['tag']:
                        door_sector_ids.add(si)
            elif ld['left'] >= 0:
                door_sector_ids.add(sidedefs[ld['left']]['sector'])

    print(f"  {len(door_sector_ids)} door sectors identified")

    # ── Geometry generation ───────────────────────────────────────────────────
    pts   = []
    faces = []

    # Walls
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
        # skip door sectors for walls (they'll be instances)
        r_is_door = r_sd['sector'] in door_sector_ids

        if not has_left:
            # One-sided wall (solid)
            if r_is_door: continue
            tex_name = r_sd['middle']
            ti = ensure_wall_tex(tex_name)
            if ti >= 0:
                tw, th = Image.open(get_tex_abspath(tex_name)).size
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              r_sec['fh'] * SCALE, r_sec['ch'] * SCALE,
                              wall_len, tw, th,
                              r_sd['xo'], r_sd['yo'],
                              flip=True, light=r_sec['light'])
        else:
            l_sd  = sidedefs[ld['left']]
            l_sec = sectors[l_sd['sector']]
            l_is_door = l_sd['sector'] in door_sector_ids

            r_fh = r_sec['fh'];  r_ch = r_sec['ch']
            l_fh = l_sec['fh'];  l_ch = l_sec['ch']

            flags = ld['flags']
            upper_unpeg = bool(flags & 0x08)  # ML_DONTPEGTOP
            lower_unpeg = bool(flags & 0x10)  # ML_DONTPEGBOTTOM

            # Lower wall (step up from right to left floor)
            if l_fh > r_fh and not r_is_door and not l_is_door:
                tex_name = r_sd['lower']
                ti = ensure_wall_tex(tex_name)
                tw, th = (128, 128) if ti < 0 else Image.open(get_tex_abspath(tex_name)).size
                # lower_unpeg: texture hangs from front sector ceiling (r_ch)
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

            # Upper wall (ceiling step down from right to left)
            if l_ch < r_ch and not r_is_door and not l_is_door:
                tex_name = r_sd['upper']
                ti = ensure_wall_tex(tex_name)
                tw, th = (128, 128) if ti < 0 else Image.open(get_tex_abspath(tex_name)).size
                # upper_unpeg: v=0 anchored to lower ceiling — shift by wall height
                yo = r_sd['yo'] + (r_ch - l_ch if upper_unpeg else 0)
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
                yo = l_sd['yo'] + (l_ch - r_ch if upper_unpeg else 0)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              r_ch*SCALE, l_ch*SCALE,
                              wall_len, tw, th,
                              l_sd['xo'], yo,
                              flip=False, light=l_sec['light'])

            # Middle texture (fence/grating — visible from BOTH sides)
            for m_sd, m_sec, other_sec in [(r_sd, r_sec, l_sec), (l_sd, l_sec, r_sec)]:
                if not (m_sd['middle'] and m_sd['middle'] != '-'): continue
                if m_sd['sector'] in door_sector_ids: continue
                tex_name = m_sd['middle']
                ti = ensure_wall_tex(tex_name)
                if ti < 0: continue
                tw, th = Image.open(get_tex_abspath(tex_name)).size
                bot = max(r_fh, l_fh)
                top = min(r_ch, l_ch)
                opening_h = top - bot
                # lower_unpeg: bottom-anchored (texture sits on floor)
                yo = m_sd['yo'] - (opening_h if lower_unpeg else 0)
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              bot*SCALE, top*SCALE,
                              wall_len, tw, th,
                              m_sd['xo'], yo,
                              flip=True, light=m_sec['light'])
                add_wall_quad(pts, faces, ti,
                              wx1, wz1, wx2, wz2,
                              bot*SCALE, top*SCALE,
                              wall_len, tw, th,
                              m_sd['xo'], yo,
                              flip=False, light=other_sec['light'])
                break  # generate once — both sides already covered by flip=True/False

    # Floors and ceilings
    print("Generating floors and ceilings...")
    for si, sec in enumerate(sectors):
        chains = build_sector_polygons(si, linedefs, sidedefs, vertexes)
        if not chains: continue

        poly_doom = [vertexes[vi] for vi in chains[0]]  # use first (outer) polygon

        if si in door_sector_ids: continue

        # Floor
        ft = ensure_flat_tex(sec['ft'])
        if ft >= 0:
            add_flat_quad(pts, faces, ft, poly_doom, sec['fh'],
                          is_floor=True, light=sec['light'])

        # Ceiling (skip SKY flats - they are skybox)
        if not sec['ct'].startswith('F_SKY'):
            ct = ensure_flat_tex(sec['ct'])
            if ct >= 0:
                add_flat_quad(pts, faces, ct, poly_doom, sec['ch'],
                              is_floor=False, light=sec['light'])

    # ── Write map.obj.json ────────────────────────────────────────────────────
    print(f"Writing map.obj.json ({len(pts)} pts, {len(faces)} faces, "
          f"{len(tex_paths)} textures)...")

    out_obj = {
        'textures': tex_paths,
        'points':   [[round(p[0],4), round(p[1],4), round(p[2],4)] for p in pts],
        'faces':    faces
    }

    def one_line_encoder(obj):
        """Write each texture/point/face on one line."""
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
        return ''.join(lines)

    map_path = os.path.join(OUT_DIR, 'objects', 'map.obj.json')
    os.makedirs(os.path.dirname(map_path), exist_ok=True)
    with open(map_path, 'w') as f:
        f.write(one_line_encoder(out_obj))

    # ── Write door objects + instances ───────────────────────────────────────
    print("Generating door instances...")
    inst_dir = os.path.join(OUT_DIR, 'instances')
    obj_dir  = os.path.join(OUT_DIR, 'objects')
    os.makedirs(inst_dir, exist_ok=True)
    os.makedirs(obj_dir,  exist_ok=True)
    door_instances = {}

    for si in sorted(door_sector_ids):
        sec = sectors[si]

        # Collect sector boundary edges
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

        # Floor: use 0 if door sector is underground (fh < 0 is a Doom door track trick)
        room_fh = max(0, sec['fh'])

        # Ceiling: 1-2 hop BFS, only accept ceilings in [room_fh+32, room_fh+192]
        # to avoid sky sectors or tiny track sectors
        room_ch = room_fh + 128  # fallback: standard Doom room height
        visited_bfs = {si}
        bfs_queue = [si]
        found_ch = False
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
                        osec = sectors[other]
                        ch = osec['ch']
                        if room_fh + 32 < ch <= room_fh + 192:
                            if not found_ch or ch > room_ch:
                                room_ch = ch
                                found_ch = True
                        next_q.append(other)
            bfs_queue = next_q

        h      = (room_ch - 4 - room_fh) * SCALE  # door panel height
        travel = round(h, 4)

        door_name = f'door_{si}'

        # ── Door obj: parallélépipède centré en (0, 0, 0) ────────────────────
        # Dimensions dans l'espace doom → world
        w = (max(all_vx) - min(all_vx)) * SCALE   # largeur
        d = (max(all_vy) - min(all_vy)) * SCALE   # profondeur
        # h already computed above from room heights

        hw, hd = w/2, d/2
        # Trouver la meilleure texture de porte (middle des linedefs bordant le secteur)
        door_tex_name = None
        for ld in linedefs:
            if ld['right'] >= 0 and sidedefs[ld['right']]['sector'] == si:
                t = sidedefs[ld['right']]['middle']
                if t and t != '-': door_tex_name = t; break
            if ld['left'] >= 0 and sidedefs[ld['left']]['sector'] == si:
                t = sidedefs[ld['left']]['middle']
                if t and t != '-': door_tex_name = t; break
        if not door_tex_name:
            door_tex_name = sec['ft']
            door_tex = ensure_flat_tex(door_tex_name)
        else:
            door_tex = ensure_wall_tex(door_tex_name)

        textures = [tex_paths[door_tex]] if door_tex >= 0 else []
        ti = 1  # 1-based texture index

        # 8 sommets du parallélépipède (y=0 bas, y=h haut)
        d_pts = [
            [-hw, 0, -hd],  # 1 bas-avant-gauche
            [ hw, 0, -hd],  # 2 bas-avant-droite
            [ hw, h, -hd],  # 3 haut-avant-droite
            [-hw, h, -hd],  # 4 haut-avant-gauche
            [-hw, 0,  hd],  # 5 bas-arrière-gauche
            [ hw, 0,  hd],  # 6 bas-arrière-droite
            [ hw, h,  hd],  # 7 haut-arrière-droite
            [-hw, h,  hd],  # 8 haut-arrière-gauche
        ]
        d_pts = [[round(v,4) for v in p] for p in d_pts]

        col = [200, 200, 200]
        # Face avant  (z=-hd, normale -z)
        # Face arrière (z=+hd, normale +z)
        # Face gauche (x=-hw, normale -x)
        # Face droite (x=+hw, normale +x)
        # Face bas    (y=0,   normale -y)
        # Face haut   (y=h,   normale +y)
        d_faces = [
            # Avant (normale vers -z = vers le joueur qui arrive du nord)
            {'pts':[1,3,2],'color':col,'texture':ti,'map':[[0,1],[1,0],[1,1]]},
            {'pts':[1,4,3],'color':col,'texture':ti,'map':[[0,1],[0,0],[1,0]]},
            # Arrière
            {'pts':[6,8,5],'color':col,'texture':ti,'map':[[0,1],[1,0],[1,1]]},
            {'pts':[6,7,8],'color':col,'texture':ti,'map':[[0,1],[0,0],[1,0]]},
            # Gauche
            {'pts':[5,4,1],'color':col,'texture':ti,'map':[[0,1],[1,0],[1,1]]},
            {'pts':[5,8,4],'color':col,'texture':ti,'map':[[0,1],[0,0],[1,0]]},
            # Droite
            {'pts':[2,7,6],'color':col,'texture':ti,'map':[[0,1],[1,0],[1,1]]},
            {'pts':[2,3,7],'color':col,'texture':ti,'map':[[0,1],[0,0],[1,0]]},
            # Haut (dessous de la porte, visible quand elle monte)
            {'pts':[4,7,3],'color':col,'texture':ti,'map':[[0,0],[1,1],[1,0]]},
            {'pts':[4,8,7],'color':col,'texture':ti,'map':[[0,0],[0,1],[1,1]]},
        ]

        door_obj_path = os.path.join(obj_dir, f'{door_name}.obj.json')
        with open(door_obj_path, 'w') as f:
            f.write(one_line_encoder({'textures': textures,
                                      'points':   d_pts,
                                      'faces':    d_faces}))

        # ── Door instance ──────────────────────────────────────────────────────
        inst_path = os.path.join(inst_dir, f'{door_name}.instance.json')
        inst_str = (
            '{\n'
            f'  "object":     "./assets/doom/objects/{door_name}.obj.json",\n'
            f'  "position":   [{round(cx,4)}, {round(room_fh*SCALE,4)}, {round(cz,4)}],\n'
            '  "rotation":   [0, 0, 0],\n'
            '  "trigger":    "action",\n'
            '  "collidable": true,\n'
            '  "radius":     1.5,\n'
            '  "damage":     null,\n'
            '  "keyframes":  [\n'
            f'    {{"t": 0.0, "translate": [0, 0, 0],          "rotate": [0,0,0]}},\n'
            f'    {{"t": 2.0, "translate": [0, {travel}, 0],   "rotate": [0,0,0]}},\n'
            f'    {{"t": 5.0, "translate": [0, {travel}, 0],   "rotate": [0,0,0]}},\n'
            f'    {{"t": 7.0, "translate": [0, 0, 0],          "rotate": [0,0,0]}}\n'
            '  ]\n'
            '}'
        )
        with open(inst_path, 'w') as f:
            f.write(inst_str)
        door_instances[door_name] = f'./assets/doom/instances/{door_name}.instance.json'

    # ── Compute player spawn from THINGS ─────────────────────────────────────
    player1 = next((t for t in things if t['type'] == 1), None)
    if player1:
        spawn_x = player1['x'] * SCALE
        spawn_z = player1['y'] * SCALE
        spawn_yaw = (90 - player1['angle']) % 360
    else:
        spawn_x, spawn_z, spawn_yaw = -6.5, 4.0, 90

    # ── Write definition.json (fully generated) ───────────────────────────────
    def_path = os.path.join(OUT_DIR, 'definition.json')
    defn = {
        'user': {
            'position':        [round(spawn_x,4), 0.3, round(spawn_z,4)],
            'yaw':             spawn_yaw,
            'pitch':           0,
            'maxEnergy':       100,
            'height':          0.875,
            'eyeRatio':        0.73,
            'radius':          0.25,
            'gravity':         9.81,
            'maxJumpVelocity': 2.7,
            'maxSlopeAngle':   50
        },
        'background': [255, 0, 255],
        'lights': {
            'ambient': [200, 200, 200],
            'sources': []
        },
        'map': './assets/doom/objects/map.obj.json',
        'instances': {}  # instances disabled — add manually in definition.json
    }
    with open(def_path, 'w') as f:
        json.dump(defn, f, indent=2)

    print(f"Done! {len(door_instances)} door instances.")
    print(f"Map: {map_path}")
    print(f"Textures: {len(tex_paths)} saved to {TEX_DIR}")

if __name__ == '__main__':
    main()
