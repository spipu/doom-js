/**
 * The StateSnapshot of a turn, events included, to and from its binary
 * message: pure encode / decode, fields in a fixed order, little-endian
 * throughout (NetByteWriter / NetByteReader). Float32 for positions, angles
 * and intensities, integers for ids, counts, flags and light levels; names
 * travel as ASCII. Decoding is fail-fast: the whole message is read before it
 * is handed over, and a read that does not end exactly on its last byte is
 * refused.
 *
 * Layout: type, turn, time step; then players, bodies, bodies born in play,
 * shots, map pickups (presence bits), movers, switches on, rewritten floors,
 * light levels, level statistics, events — each section behind its count.
 */
class DoomNetStateCodec {
    /**
     * @param {object} snapshot - a DoomNetStateCapture StateSnapshot
     * @returns {ArrayBuffer}
     */
    static encode(snapshot) {
        const w = new NetByteWriter();
        w.u8(DoomNetProtocol.MESSAGE_STATE).u32(snapshot.turn).f32(snapshot.elapsedMs);
        DoomNetStateCodec._list(w, snapshot.players, (player) => DoomNetStateCodec._writePlayer(w, player), true);
        DoomNetStateCodec._list(w, snapshot.bodies, (body) => DoomNetStateCodec._writeBody(w, body));
        DoomNetStateCodec._list(w, snapshot.bornBodies, (born) => w.u32(born.id).u8(((born.drop) ? 1 : 0)).ascii(born.kind));
        DoomNetStateCodec._list(w, snapshot.projectiles, (shot) => {
            w.u32(shot.id).ascii(shot.kind).u8(shot.frame).f32(shot.x).f32(shot.y).f32(shot.z);
        });
        DoomNetStateCodec._writeBits(w, snapshot.pickups);
        DoomNetStateCodec._list(w, snapshot.movers, (mover) => {
            w.u32(mover.id);
            DoomNetStateCodec._writeVector(w, mover.position);
            DoomNetStateCodec._writeVector(w, mover.translate);
            DoomNetStateCodec._writeVector(w, mover.rotate);
        });
        DoomNetStateCodec._list(w, snapshot.switches, (id) => w.u32(id));
        DoomNetStateCodec._list(w, snapshot.surfaces, (surface) => w.u16(surface.si).ascii(surface.flat));
        DoomNetStateCodec._list(w, snapshot.lights, (level) => w.u8(level));
        const stats = snapshot.stats;
        w.u16(stats.secrets).u16(stats.secretsTotal).u16(stats.kills).u16(stats.killsTotal)
            .u16(stats.items).u16(stats.itemsTotal).u32(Math.round(stats.timeMs));
        DoomNetStateCodec._list(w, snapshot.events, (event) => DoomNetStateCodec._writeEvent(w, event));

        return w.toBytes().buffer;
    }

    /**
     * @param {ArrayBuffer} buffer
     * @returns {object} the StateSnapshot
     * @throws {NetError} INVALID_MESSAGE, or a RangeError read past the end
     */
    static decode(buffer) {
        const r = new NetByteReader(new Uint8Array(buffer));
        if (r.u8() !== DoomNetProtocol.MESSAGE_STATE) {
            throw new NetError(NetError.INVALID_MESSAGE, 'Not a state message');
        }
        const snapshot = {turn: r.u32(), elapsedMs: r.f32()};
        snapshot.players     = DoomNetStateCodec._readList(r, () => DoomNetStateCodec._readPlayer(r), true);
        snapshot.bodies      = DoomNetStateCodec._readList(r, () => DoomNetStateCodec._readBody(r));
        snapshot.bornBodies  = DoomNetStateCodec._readList(r, () => ({id: r.u32(), drop: (r.u8() === 1), kind: r.ascii()}));
        snapshot.projectiles = DoomNetStateCodec._readList(r, () => ({id: r.u32(), kind: r.ascii(), frame: r.u8(), x: r.f32(), y: r.f32(), z: r.f32()}));
        snapshot.pickups     = DoomNetStateCodec._readBits(r);
        snapshot.movers      = DoomNetStateCodec._readList(r, () => ({
            id:        r.u32(),
            position:  DoomNetStateCodec._readVector(r),
            translate: DoomNetStateCodec._readVector(r),
            rotate:    DoomNetStateCodec._readVector(r)
        }));
        snapshot.switches    = DoomNetStateCodec._readList(r, () => r.u32());
        snapshot.surfaces    = DoomNetStateCodec._readList(r, () => ({si: r.u16(), flat: r.ascii()}));
        snapshot.lights      = DoomNetStateCodec._readList(r, () => r.u8());
        snapshot.stats       = {
            secrets: r.u16(), secretsTotal: r.u16(), kills: r.u16(), killsTotal: r.u16(),
            items: r.u16(), itemsTotal: r.u16(), timeMs: r.u32()
        };
        snapshot.events      = DoomNetStateCodec._readList(r, () => DoomNetStateCodec._readEvent(r));
        if (!r.isAtEnd()) {
            throw new NetError(NetError.INVALID_MESSAGE, 'State message longer than its content');
        }

        return snapshot;
    }

    // --- Players ---

    static _writePlayer(w, p) {
        w.u8(p.id);
        for (const value of [p.x, p.y, p.z, p.yaw, p.pitch, p.cameraY, p.lean]) {
            w.f32(value);
        }
        w.u8(((p.dead) ? 1 : 0));
        for (const value of [p.energy, p.armor, p.maxArmor, p.armorAbsorb, p.energyFlash, p.pickupFlash]) {
            w.f32(value);
        }
        DoomNetStateCodec._writeName(w, p.activeWeapon);
        DoomNetStateCodec._list(w, p.weapons, (code) => w.ascii(code), true);
        DoomNetStateCodec._list(w, p.ammo, (ammo) => w.ascii(ammo.type).u16(ammo.count).u16(ammo.max), true);
        DoomNetStateCodec._list(w, p.items, (code) => w.ascii(code), true);
        DoomNetStateCodec._list(w, p.effects, (effect) => w.ascii(effect.code).f32(effect.ms), true);
        const weapon = p.weapon;
        DoomNetStateCodec._writeName(w, weapon.weapon);
        DoomNetStateCodec._writeName(w, weapon.lump);
        w.u8(((weapon.bright) ? 1 : 0));
        DoomNetStateCodec._writeName(w, weapon.flashLump);
        w.f32(weapon.offsetX).f32(weapon.offsetY).u8(((weapon.lowered) ? 1 : 0)).u8(weapon.extraLight);
    }

    static _readPlayer(r) {
        const p = {id: r.u8(), x: r.f32(), y: r.f32(), z: r.f32(), yaw: r.f32(), pitch: r.f32(), cameraY: r.f32(), lean: r.f32()};
        p.dead         = (r.u8() === 1);
        p.energy       = r.f32();
        p.armor        = r.f32();
        p.maxArmor     = r.f32();
        p.armorAbsorb  = r.f32();
        p.energyFlash  = r.f32();
        p.pickupFlash  = r.f32();
        p.activeWeapon = DoomNetStateCodec._readName(r);
        p.weapons      = DoomNetStateCodec._readList(r, () => r.ascii(), true);
        p.ammo         = DoomNetStateCodec._readList(r, () => ({type: r.ascii(), count: r.u16(), max: r.u16()}), true);
        p.items        = DoomNetStateCodec._readList(r, () => r.ascii(), true);
        p.effects      = DoomNetStateCodec._readList(r, () => ({code: r.ascii(), ms: r.f32()}), true);
        p.weapon       = {
            weapon:     DoomNetStateCodec._readName(r),
            lump:       DoomNetStateCodec._readName(r),
            bright:     (r.u8() === 1),
            flashLump:  DoomNetStateCodec._readName(r),
            offsetX:    r.f32(),
            offsetY:    r.f32(),
            lowered:    (r.u8() === 1),
            extraLight: r.u8()
        };

        return p;
    }

    // --- Bodies ---

    // The offset is always written, its flag says if it counts; the squash of
    // a crouching player follows only when its flag is set.
    static _writeBody(w, b) {
        const scaled = (b.scale !== 1);
        const flags  = ((b.bright) ? DoomNetStateCodec.BODY_BRIGHT : 0)
            | ((b.crushed) ? DoomNetStateCodec.BODY_CRUSHED : 0)
            | ((b.offset !== null) ? DoomNetStateCodec.BODY_OFFSET : 0)
            | ((scaled) ? DoomNetStateCodec.BODY_SCALED : 0);
        w.u32(b.id).f32(b.x).f32(b.y).f32(b.z).f32(b.facing)
            .u16(b.frame ?? DoomNetStateCodec.NONE_U16).u8(flags).u16(b.sector ?? DoomNetStateCodec.NONE_U16);
        DoomNetStateCodec._writeVector(w, (b.offset ?? DoomNetStateCodec.ZERO_VECTOR));
        if (scaled) {
            w.f32(b.scale);
        }
    }

    static _readBody(r) {
        const b      = {id: r.u32(), x: r.f32(), y: r.f32(), z: r.f32(), facing: r.f32()};
        const frame  = r.u16();
        const flags  = r.u8();
        const si     = r.u16();
        const offset = DoomNetStateCodec._readVector(r);
        b.frame   = ((frame !== DoomNetStateCodec.NONE_U16) ? frame : null);
        b.bright  = ((flags & DoomNetStateCodec.BODY_BRIGHT) !== 0);
        b.crushed = ((flags & DoomNetStateCodec.BODY_CRUSHED) !== 0);
        b.sector  = ((si !== DoomNetStateCodec.NONE_U16) ? si : null);
        b.offset  = (((flags & DoomNetStateCodec.BODY_OFFSET) !== 0) ? offset : null);
        b.scale   = (((flags & DoomNetStateCodec.BODY_SCALED) !== 0) ? r.f32() : 1);

        return b;
    }

    // --- Events ---

    static _writeEvent(w, event) {
        w.u8(DoomNetStateCodec.EVENT_TYPES.indexOf(event.type));
        switch (event.type) {
            case DoomTurnEvents.SOUND_AT:
                w.ascii(event.name);
                DoomNetStateCodec._writeOptionalVector(w, event.point);
                DoomNetStateCodec._writeSoundOptions(w, event);
                break;
            case DoomTurnEvents.SOUND_FROM_BODY:
                w.ascii(event.name).u32(event.body);
                DoomNetStateCodec._writeSoundOptions(w, event);
                break;
            case DoomTurnEvents.SOUND_FROM_PLAYER:
                w.ascii(event.name).u8(event.player);
                DoomNetStateCodec._writeName(w, event.channel);
                break;
            case DoomTurnEvents.SOUND_TO_PLAYER:
                w.ascii(event.name).u8(event.player);
                break;
            case DoomTurnEvents.EFFECT:
                DoomNetStateCodec._writeEffect(w, event);
                break;
            case DoomTurnEvents.DECAL:
                w.ascii(event.key).u16(event.variant);
                DoomNetStateCodec._writeVector(w, event.position);
                DoomNetStateCodec._writeVector(w, event.rotation);
                DoomNetStateCodec._writeOptionalId(w, event.owner);
                w.u8(((event.fade) ? 1 : 0));
                break;
            case DoomTurnEvents.PLAYER_TELEPORTED:
                w.u8(event.player);
                break;
        }
    }

    static _readEvent(r) {
        const type = DoomNetStateCodec.EVENT_TYPES[r.u8()];
        switch (type) {
            case DoomTurnEvents.SOUND_AT:
                return Object.assign({type: type, name: r.ascii(), point: DoomNetStateCodec._readOptionalVector(r)}, DoomNetStateCodec._readSoundOptions(r));
            case DoomTurnEvents.SOUND_FROM_BODY:
                return Object.assign({type: type, name: r.ascii(), body: r.u32()}, DoomNetStateCodec._readSoundOptions(r));
            case DoomTurnEvents.SOUND_FROM_PLAYER:
                return {type: type, name: r.ascii(), player: r.u8(), channel: DoomNetStateCodec._readName(r)};
            case DoomTurnEvents.SOUND_TO_PLAYER:
                return {type: type, name: r.ascii(), player: r.u8()};
            case DoomTurnEvents.EFFECT:
                return DoomNetStateCodec._readEffect(r);
            case DoomTurnEvents.DECAL:
                return {
                    type:     type,
                    key:      r.ascii(),
                    variant:  r.u16(),
                    position: DoomNetStateCodec._readVector(r),
                    rotation: DoomNetStateCodec._readVector(r),
                    owner:    DoomNetStateCodec._readOptionalId(r),
                    fade:     (r.u8() === 1)
                };
            case DoomTurnEvents.PLAYER_TELEPORTED:
                return {type: type, player: r.u8()};
        }
        throw new NetError(NetError.INVALID_MESSAGE, 'Unknown event type');
    }

    static _writeSoundOptions(w, event) {
        w.u8(((event.attenuation !== null) ? 1 : 0)).f32(event.attenuation ?? 0);
        DoomNetStateCodec._writeName(w, event.replaceKey);
    }

    static _readSoundOptions(r) {
        const hasAttenuation = (r.u8() === 1);
        const attenuation    = r.f32();

        return {attenuation: ((hasAttenuation) ? attenuation : null), replaceKey: DoomNetStateCodec._readName(r)};
    }

    static _writeEffect(w, e) {
        w.ascii(e.name).f32(e.x).f32(e.y).f32(e.z).u8(e.startFrame).u16(e.elapsed).f32(e.jitterY)
            .u8(((e.mirror) ? 1 : 0)).f32(e.roll);
        DoomNetStateCodec._writeOptionalVector(w, e.velocity);
        w.u8(((e.follow !== null) ? 1 : 0));
        if (e.follow !== null) {
            DoomNetStateCodec._writeOptionalId(w, e.follow.body);
            w.u8(e.follow.player ?? 0).f32(e.follow.ahead);
        }
    }

    static _readEffect(r) {
        const e = {type: DoomTurnEvents.EFFECT, name: r.ascii(), x: r.f32(), y: r.f32(), z: r.f32(), startFrame: r.u8(), elapsed: r.u16(), jitterY: r.f32()};
        e.mirror   = (r.u8() === 1);
        e.roll     = r.f32();
        e.velocity = DoomNetStateCodec._readOptionalVector(r);
        e.follow   = null;
        if (r.u8() === 1) {
            const body   = DoomNetStateCodec._readOptionalId(r);
            const player = r.u8();
            e.follow = {player: ((body === null) ? player : null), body: body, ahead: r.f32()};
        }

        return e;
    }

    // --- Shared fields ---

    // A section behind its count: u16, or u8 for the small ones of a player.
    static _list(w, items, write, small = false) {
        if (small) {
            w.u8(items.length);
        } else {
            w.u16(items.length);
        }
        for (const item of items) {
            write(item);
        }
    }

    static _readList(r, read, small = false) {
        const count = ((small) ? r.u8() : r.u16());
        const items = [];
        for (let i = 0; i < count; i++) {
            items.push(read());
        }

        return items;
    }

    static _writeName(w, name) {
        w.u8(((name !== null) ? 1 : 0));
        if (name !== null) {
            w.ascii(name);
        }
    }

    static _readName(r) {
        return ((r.u8() === 1) ? r.ascii() : null);
    }

    static _writeVector(w, v) {
        w.f32(v[0]).f32(v[1]).f32(v[2]);
    }

    static _readVector(r) {
        return [r.f32(), r.f32(), r.f32()];
    }

    static _writeOptionalVector(w, v) {
        w.u8(((v !== null) ? 1 : 0));
        if (v !== null) {
            DoomNetStateCodec._writeVector(w, v);
        }
    }

    static _readOptionalVector(r) {
        return ((r.u8() === 1) ? DoomNetStateCodec._readVector(r) : null);
    }

    static _writeOptionalId(w, id) {
        w.u32(id ?? DoomNetStateCodec.NONE_U32);
    }

    static _readOptionalId(r) {
        const id = r.u32();

        return ((id !== DoomNetStateCodec.NONE_U32) ? id : null);
    }

    static _writeBits(w, bits) {
        w.u16(bits.length);
        const bytes = new Uint8Array(Math.ceil(bits.length / DoomNetStateCodec.BITS_PER_BYTE));
        bits.forEach((bit, i) => {
            if (bit) {
                bytes[Math.floor(i / DoomNetStateCodec.BITS_PER_BYTE)] |= (1 << (i % DoomNetStateCodec.BITS_PER_BYTE));
            }
        });
        w.bytes(bytes);
    }

    static _readBits(r) {
        const count = r.u16();
        const bytes = r.bytes(Math.ceil(count / DoomNetStateCodec.BITS_PER_BYTE));
        const bits  = [];
        for (let i = 0; i < count; i++) {
            bits.push((bytes[Math.floor(i / DoomNetStateCodec.BITS_PER_BYTE)] & (1 << (i % DoomNetStateCodec.BITS_PER_BYTE))) !== 0);
        }

        return bits;
    }
}

// The event type byte: the rank in this list, fixed.
DoomNetStateCodec.EVENT_TYPES = [
    DoomTurnEvents.SOUND_AT,
    DoomTurnEvents.SOUND_FROM_BODY,
    DoomTurnEvents.SOUND_FROM_PLAYER,
    DoomTurnEvents.SOUND_TO_PLAYER,
    DoomTurnEvents.EFFECT,
    DoomTurnEvents.DECAL,
    DoomTurnEvents.PLAYER_TELEPORTED
];
DoomNetStateCodec.BODY_BRIGHT   = 1;
DoomNetStateCodec.BODY_CRUSHED  = 2;
DoomNetStateCodec.BODY_OFFSET   = 4;
DoomNetStateCodec.BODY_SCALED   = 8;
DoomNetStateCodec.NONE_U16      = 0xFFFF;
DoomNetStateCodec.NONE_U32      = 0xFFFFFFFF;
DoomNetStateCodec.BITS_PER_BYTE = 8;
DoomNetStateCodec.ZERO_VECTOR   = [0, 0, 0];
