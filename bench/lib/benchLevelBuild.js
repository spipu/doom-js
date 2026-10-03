/**
 * Builds a level inside the app context exactly as DoomGame does: the loader
 * batch, the common DoomLevelLoader, the optional adoption by a main role,
 * then the loader callback. Reading the result is the suites' business.
 */
class BenchLevelBuild {
    /**
     * @param {BenchContext} app
     */
    constructor(app) {
        this._app = app;
    }

    /**
     * @param {object} wadFile - WadFile of the context
     * @returns {{profile: object, itemCatalog: object}}
     */
    resolveGame(wadFile) {
        return this._app.run(BenchLevelBuild.RESOLVE_SCRIPT, {__wad: wadFile});
    }

    /**
     * @param {object}      wadFile
     * @param {object}      game    - resolveGame() result
     * @param {string}      code    - level code
     * @param {object|null} options - {skill, thingFilter, role, events, onLevelExit}
     * @returns {Promise<{built: object, world: object, events: object}>}
     */
    build(wadFile, game, code, options = null) {
        options = (options ?? {});

        return this._app.run(BenchLevelBuild.BUILD_SCRIPT, {
            __wad:         wadFile,
            __game:        game,
            __code:        code,
            __skill:       (options.skill ?? BenchLevelBuild.DEFAULT_SKILL),
            __thingFilter: (options.thingFilter ?? null),
            __role:        (options.role ?? null),
            __events:      (options.events ?? null),
            __onLevelExit: (options.onLevelExit ?? null)
        });
    }
}

BenchLevelBuild.DEFAULT_SKILL = 3;

BenchLevelBuild.RESOLVE_SCRIPT = `(() => {
    const profile = new GameProfileList().getForWad(__wad);

    return {profile: profile, itemCatalog: new DoomItemCatalog(profile)};
})()`;

BenchLevelBuild.BUILD_SCRIPT = `(async () => {
    loader.reset();
    loader.world().setUserClass(DoomUser);
    loader.beginBatch();
    const events      = (__events ?? new DoomTurnEvents());
    const onLevelExit = (__onLevelExit ?? (() => {}));
    const built = await new DoomLevelLoader(__game.profile, __game.profile.createThingCatalog(), __game.profile.createMonsterCatalog(), __game.itemCatalog)
        .load(__wad, __code, {
            skill:       __skill,
            thingFilter: (__thingFilter ?? WadThingBuilder.SINGLE_PLAYER_FILTER),
            onLevelExit: onLevelExit,
            turnEvents:  events
        });
    if (__role !== null) {
        __role.adoptLevel(built, onLevelExit);
    }
    await new Promise((resolve) => {
        loader.setCallback(resolve);
        loader.endBatch();
    });
    loader.clearCallback();
    built.getEntityIds().index();

    return {built: built, world: loader.world().get(), events: events};
})()`;

module.exports = {BenchLevelBuild};
