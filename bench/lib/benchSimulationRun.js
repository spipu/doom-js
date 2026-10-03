/**
 * Drives a scenario through DoomMainRole, the path the game takes without
 * its presentation: build, enter, then one advance() per frame with the
 * scripted command. Returns the per-frame trace and the final save snapshot.
 * A run may instead resume a save: the level is rebuilt and restored as
 * DoomGame does on a load, and the frames start where the save was taken.
 */
const {BenchLevelBuild} = require('./benchLevelBuild');
const {BenchScenario}   = require('./benchScenario');

class BenchSimulationRun {
    /**
     * @param {BenchContext} app
     */
    constructor(app) {
        this._app    = app;
        this._builds = new BenchLevelBuild(app);
    }

    /**
     * @param {object}        wadFile  - WadFile of the context
     * @param {BenchScenario} scenario
     * @param {object|null}   hooks    - {afterEnter(ctx), afterFrame(frame, ctx)}, called inside the context
     * @param {object|null}   restore  - {snapshot, fromFrame}: the save to resume from, and the first frame played
     * @returns {Promise<{trace: Array, snapshot: object, reloaded: object|null, exits: boolean[], dead: boolean, energy: number}>}
     *          reloaded = the save captured again right after the restore, before any frame
     */
    run(wadFile, scenario, hooks = null, restore = null) {
        this._app.seedRandom(BenchSimulationRun.SEED);
        const build = (wad, game, code, options) => this._builds.build(wad, game, code, options);

        return this._app.run(BenchSimulationRun.RUN_SCRIPT, {__build: build, __precision: BenchSimulationRun.TRACE_PRECISION})(wadFile, scenario.toData(), BenchScenario.FRAME_MS, (hooks ?? {}), restore);
    }
}

BenchSimulationRun.SEED            = 7;
BenchSimulationRun.TRACE_PRECISION = 10000;

BenchSimulationRun.RUN_SCRIPT = `(async (wadFile, scenario, frameMs, hooks, restore) => {
    const game   = {profile: new GameProfileList().getForWad(wadFile)};
    game.itemCatalog = new DoomItemCatalog(game.profile);
    const roster = new DoomPlayerRoster().setLocal(new DoomPlayer(DoomPlayer.MAIN_ID));
    const rules  = new DoomSinglePlayerRules();
    const events = new DoomTurnEvents();
    const role   = new DoomMainRole(roster, rules, events).useProfile(game.profile, game.itemCatalog, scenario.skill);
    const exits  = [];
    const frameEvents = [];
    events.addListener((event) => frameEvents.push(event.type + ((event.name !== undefined) ? (':' + event.name) : '')));

    const {built, world} = await __build(wadFile, game, scenario.level, {skill: scenario.skill, role: role, events: events, onLevelExit: (secret) => exits.push(secret)});
    const saved = ((restore !== null) ? restore.snapshot : null);
    role.enterLevel(world, saved, ((saved !== null) ? DoomGameSnapshot.spawnOverrideOf(saved) : null));
    let reloaded = null;
    if (saved !== null) {
        role.restoreSnapshot(saved);
        reloaded = role.captureSnapshot(saved.wadId, scenario.level);
        delete reloaded.savedAt;
    }
    if (hooks.afterEnter !== undefined) {
        hooks.afterEnter({role: role, roster: roster, built: built, events: events});
    }

    const user  = roster.getLocal().getUser();
    const trace = [];
    const round = (v) => (Math.round(v * __precision) / __precision);
    let step = 0;
    for (let frame = ((restore !== null) ? restore.fromFrame : 0); frame < scenario.frames; frame++) {
        while (scenario.plan[step].until <= frame) {
            step++;
        }
        const s = scenario.plan[step];
        const command = new UserCommand().setMove(s.move[0], s.move[1]).setLook(s.look[0], s.look[1]);
        if ((s.buttons !== undefined) && ((s.every === undefined) || (frame % s.every === 0))) {
            s.buttons.forEach((b) => command.press(b));
        }
        frameEvents.length = 0;
        role.advance(frameMs, {sample: () => command}, () => {}, frame * frameMs);
        trace.push([round(user.x), round(user.y), round(user.z), round(user.yaw), round(user.pitch), user.isDead(), user.getEnergy(), user.getArmor(),
            user.getActiveWeapon(), user.exportState(), role.getLevelStats().exportCounts(), frameEvents.slice()]);
        if (hooks.afterFrame !== undefined) {
            hooks.afterFrame(frame, {role: role, roster: roster, built: built, command: command});
        }
    }
    const snapshot = role.captureSnapshot('bench', scenario.level);
    delete snapshot.savedAt;

    return {trace: trace, snapshot: snapshot, reloaded: reloaded, exits: exits, dead: user.isDead(), energy: user.getEnergy()};
})`;

module.exports = {BenchSimulationRun};
