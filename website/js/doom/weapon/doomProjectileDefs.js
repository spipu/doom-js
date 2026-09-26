/**
 * The flight definitions of a game's projectiles (profile projectileDefs()):
 * the in-flight billboards, built inside the load batch, and the kinematics.
 * Part of the level every device builds: a sub draws the projectiles it
 * receives with the same billboards.
 */
class DoomProjectileDefs {
    /**
     * @param {DoomWeaponSpriteBank} bank
     * @param {AbstractGameProfile}  profile
     * @returns {object} kind → definition, null when the WAD lacks its sprites
     */
    static build(bank, profile) {
        const defs = {};
        for (const spec of profile.projectileDefs()) {
            defs[spec.kind] = DoomProjectileDefs._buildDef(bank, spec);
        }
        return defs;
    }

    // In-flight billboard(s) + kinematics for one projectile kind; null if the
    // WAD lacks the sprites. speed/gravity are in map units per tic (squared
    // for gravity), converted to world units.
    static _buildDef(bank, spec) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of spec.letters) {
            const spr = DoomProjectileDefs._pickSprite(bank, spec.sprite, letter);
            if (spr === null) {
                return null;
            }
            const geo = WadGeometry.spriteBillboardData(spr);
            frames.push({
                objId:  loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     geo.halfWidth,
                    height:        geo.height,
                    anchorOffsetX: geo.anchorOffsetX,
                    anchorOffsetY: 0,
                    light:         255,
                    alpha:         spec.alpha,
                    additive:      spec.additive,
                }),
                height: geo.height,
            });
        }
        return {
            kind:             spec.kind,
            frames,
            speed:            spec.speed * scale,
            // FastSpeed (actor.zs): the nightmare skill swaps it in on spawn.
            fastSpeed:        ((spec.fastSpeed !== undefined) ? spec.fastSpeed * scale : null),
            flightTics:       spec.flightTics,
            explosion:        spec.explosion,
            splashDamage:     spec.splashDamage,
            impactDamage:     spec.impactDamage ?? 0,
            kickback:         spec.kickback ?? null,
            spray:            spec.spray ?? null,
            decalType:        spec.decalType ?? null,
            gravity:          (spec.gravity ?? 0) * scale,
            gravityDelayTics: spec.gravityDelayTics ?? 0,
            dropSpeed:        (spec.dropSpeed ?? 0) * scale,
            lob:              (spec.lob === true),
            trailEffect:      spec.trailEffect ?? null,
            trailEveryTics:   spec.trailEveryTics ?? 0,
            // Floor bounce (Heretic mace family): {damping, minVz (u/tic,
            // pre-damping energy floor), maxBounces, spawnKind (balls spat
            // sideways at each bounce)} — null = explode on any impact.
            bounce:           spec.bounce ?? null,
            // Sound events (logical names): SeeSound at spawn, DeathSound at
            // detonation, macebounce at each floor bounce.
            seeSound:         spec.seeSound ?? null,
            deathSound:       spec.deathSound ?? null,
            bounceSound:      spec.bounceSound ?? null,
            // Muzzle height in map units above the FEET (A_FireMacePL1 spawns
            // the lobbed ball at Pos + 28); null = the eye (camera) height.
            spawnHeight:      ((spec.spawnHeight !== undefined) ? spec.spawnHeight * scale : null),
            // Homing (A_SeekerMissile / A_Tracer2): {threshold, turnMax} in
            // degrees, everyTics = the state cadence the vanilla action runs
            // at. null = it flies straight.
            seek:             (spec.seek ?? null),
            // Ripping shot (Heretic Whirlwind): it passes THROUGH bodies and
            // grinds whoever it overlaps every damageEvery tics instead of
            // detonating on the first one. Needs lifeTics to ever end.
            ripper:           (spec.ripper ?? null),
            // Forced lifetime in tics (0 = only an impact ends the flight).
            lifeTics:         (spec.lifeTics ?? 0),
            // Rise per tic while a shot is still growing (A_LichFireGrow).
            growRise:         (spec.growRise ?? 0) * scale,
            // Floor-hugging shot (Heretic MinotaurFX2, +FLOORHUGGER): it never
            // rises, never dives, and its trail is left ON the floor.
            floorHugger:      (spec.floorHugger === true),
            // A_GenWizard: a shot that hatches a body instead of exploding —
            // {kind, afterTics, retryTics}. It keeps flying while the spot is
            // taken, which is exactly what vanilla's spawner does.
            spawnMonster:     (spec.spawnMonster ?? null),
            // What a shot aimed at a spot does on arrival: {fog, telefrag}.
            // The Icon of Sin's cube (SpawnShot, +NOCLIP) is the one that has
            // it — WHAT it hatches is not def data, the level's DoomBossBrain
            // draws it per cube.
            hatchAtSpot:      (spec.hatchAtSpot ?? null),
            hatchSound:       spec.hatchSound ?? null,
            // A standing shot (MinotaurFX3): it never travels, so no segment
            // ever crosses a body — it goes off on whoever OVERLAPS it, within
            // this radius in map units.
            contactRadius:    (spec.contactRadius ?? 0) * scale,
            // Projectiles sown along the flight instead of a mere effect (the
            // floor fire the maulotaur's crawling flame leaves behind), at
            // trailEveryTics, scattered by trailScatter map units.
            trailKind:        (spec.trailKind ?? null),
            trailScatter:     (spec.trailScatter ?? 0) * scale,
            // +THRUGHOST: the shot passes through Heretic's phantoms.
            thruGhost:        (spec.thruGhost === true),
        };
    }

    // A single billboard cannot rotate 8 ways, and the rocket ships no MISLA0:
    // take rotation 0 when present, else the rear view 5, else rotation 1.
    static _pickSprite(bank, base, letter) {
        return bank.getFrameView(base, letter, DoomProjectileDefs.VIEW_PREFERENCE);
    }
}

DoomProjectileDefs.VIEW_PREFERENCE = ['0', '5', '1'];
