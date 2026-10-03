/**
 * Every level of every WAD converted as the game does (skill 3, single-player
 * things), fingerprinted on what the loader holds afterwards. Reads private
 * fields of the engine entities on purpose: a diagnostic tool, not game code.
 */
const crypto = require('crypto');
const {BenchLevelBuild}  = require('../lib/benchLevelBuild');
const {BenchFingerprint} = require('../lib/benchFingerprint');

class BenchBuildSuite {
    static get name() {
        return 'build';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level" → {sha, counts…}
     */
    static async run(app, wads, progress) {
        const builds = new BenchLevelBuild(app);
        const result = {};
        for (const wad of wads) {
            const wadFile = app.readWad(wad.path);
            const game    = builds.resolveGame(wadFile);
            for (const code of app.run('__wad.getLevelNames()', {__wad: wadFile})) {
                const key = wad.name + '/' + code;
                progress(key);
                app.seedRandom(BenchBuildSuite.SEED);
                try {
                    const {built, world} = await builds.build(wadFile, game, code);
                    result[key] = BenchBuildSuite._digest(app.run(BenchBuildSuite.SUMMARY_SCRIPT)(built, world));
                } catch (error) {
                    result[key] = {error: String(error.message).split('\n')[0]};
                }
                app.takeLogs();
            }
        }

        return result;
    }

    static _digest(summary) {
        const textureShas = summary.textures.map((t) => [t.code, t.width, t.height, t.alpha, crypto.createHash(BenchFingerprint.HASH).update(t.data).digest('hex')]);
        const faces  = summary.objects.reduce((n, o) => (n + o.faces.length), 0);
        const points = summary.objects.reduce((n, o) => (n + o.points.length), 0);

        return {
            sha:          BenchFingerprint.sha({objects: summary.objects, textures: textureShas, instances: summary.instances, interactions: summary.interactions, level: summary.level}),
            objects:      summary.objects.length,
            points:       points,
            faces:        faces,
            textures:     summary.textures.length,
            instances:    summary.instances.length,
            interactions: summary.interactions.length,
            kills:        summary.level.totals[1],
            items:        summary.level.totals[2],
            secrets:      summary.level.totals[0]
        };
    }
}

BenchBuildSuite.SEED = 1;

BenchBuildSuite.SUMMARY_SCRIPT = `((built, world) => {
    const codeOf = (entity) => (((entity !== null) && (entity !== undefined)) ? (entity._code ?? null) : null);
    const face = (fc) => [fc.pts, fc.textureId, fc.map, fc.color, fc.alpha, fc.clampV, fc.passableUser, fc.passableEnemy,
        fc.collisionOnly, fc.passableShot, fc.noDecal, fc.uvScroll, fc.lightGroup, ((fc.animTextures !== null) ? fc.animTextures.ids : null),
        ((fc.uvAnchor !== null) ? [fc.uvAnchor.code, fc.uvAnchor.v] : null), (fc.blendAdd ?? null)];
    const objects = loader.objects().getAll().filter(Boolean).map((o) => ({
        code: codeOf(o), kind: o.constructor.name, points: o.pt3d, faces: o.faceList.map(face), textures: o._textureIds
    }));
    const textures = loader.textures().getAll().filter(Boolean).map((t) => ({
        code: codeOf(t), width: t.width, height: t.height, alpha: t.isAlpha(), data: t.data
    }));
    const instances = loader.instances().getAll().filter(Boolean).map((inst) => ({
        code:         codeOf(inst),
        object:       inst._objectId,
        transform:    inst.getTransform(),
        collision:    [inst.getCollisionShape(), inst.getCollisionRadius(), inst.getCollisionHeight()],
        trigger:      inst._trigger,
        interaction:  [inst._interactionRadius, inst._interactionShape, (inst._interactionReachBelow ?? null), (inst._interactionReachAbove ?? null)],
        anim:         [inst._animLoop, inst._animOnlyOnce, inst._autoStart, inst._animKeyframes, (inst._keyframeVariants ?? null), (inst._defaultVariant ?? null), (inst._stageEnds ?? null)],
        pressure:     [inst.getBlockedBehavior(), inst._blockedSlowFactor, inst._crushDamage],
        damage:       inst.getDamage(),
        rideOn:       codeOf(inst.getRideOn()),
        renderOffset: inst.getRenderTransform()
    }));
    const interactions = loader.interactions().getAll().filter(Boolean).map((e) => {
        const i = e.getInteraction();

        return {
            type:           i.constructor.name,
            code:           (i._code ?? null),
            targets:        (i._targets ?? null),
            reverseTargets: (i._reverseTargets ?? null),
            cycleVariant:   (i._cycleVariant ?? null),
            stageRules:     (i._stageRules ?? null),
            exit:           ((i._exitCallback !== undefined) ? [(i._exitCallback !== null), i._exitSecret] : null),
            effect:         (i._effect ?? null),
            state:          ((typeof i.exportState === 'function') ? i.exportState() : null)
        };
    });
    const user       = world.getUser();
    const placements = built.getMonsterPlacements();
    const level = {
        totals:      [built.getSecretsTotal(), built.getKillsTotal(), built.getItemsTotal()],
        starts:      built.getPlayerStarts(),
        dmStarts:    built.getDeathmatchStarts(),
        bossRules:   built.getBossRules(),
        pickups:     (built.getPickups() ?? []).length,
        teleports:   Object.keys(built.getTeleports() ?? {}),
        pushZones:   (built.getPushZones() ?? []).length,
        secretZones: (built.getSecretZones() ?? []).length,
        monsters:    ((placements !== null) ? placements.map((p) => [((p.def !== undefined) ? p.def.getCode() : null), p.position, p.facing, p.flags, p.si]) : null),
        spawnables:  Object.keys(built.getMonsterSpawnables() ?? {}),
        bodyViews:   built.getBodyViews().size,
        lightLevels: ((built.getLightEffects() !== null) ? built.getLightEffects().getLevels() : null),
        user:        [user.x, user.y, user.z, user.yaw, user.getHeight(), user.getRadius()],
        gunLines:    ((built.getGunTriggers() !== null) ? (built.getGunTriggers()._lines ?? []).length : null)
    };

    return {objects: objects, textures: textures, instances: instances, interactions: interactions, level: level};
})`;

module.exports = {BenchBuildSuite};
