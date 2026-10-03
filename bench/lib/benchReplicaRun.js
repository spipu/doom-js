/**
 * A main and a sub in two app contexts, wired directly: what the main's turn
 * cycle sends reaches the sub's role as the message it is, and the sub's
 * answer comes back the same way — no transport, no clock, the turn N+1 only
 * once the sub answered the state N, as the synchronous cycle wants. The sub
 * re-captures the state it applied and compares it, section by section, to
 * the state it received: a replica must hold what the main sent.
 */
const {BenchLevelBuild} = require('./benchLevelBuild');
const {BenchScenario}   = require('./benchScenario');

class BenchReplicaRun {
    /**
     * @param {BenchContext} mainApp
     * @param {BenchContext} subApp
     */
    constructor(mainApp, subApp) {
        this._main = mainApp;
        this._sub  = subApp;
    }

    /**
     * @param {string}        wadPath
     * @param {BenchScenario} scenario - the main's plan; the sub plays BenchReplicaRun.subPlan() of it
     * @param {string}        mode     - BenchReplicaRun.SCREEN_SHARING | COOPERATIVE
     * @returns {Promise<object>} what the sub saw and the main did
     */
    async run(wadPath, scenario, mode) {
        this._main.seedRandom(BenchReplicaRun.SEED);
        this._sub.seedRandom(BenchReplicaRun.SEED);
        const wire  = {toSub: [], toMain: []};
        const host  = this._main.run(BenchReplicaRun.HOST_SCRIPT, {
            __build: (wad, game, code, options) => new BenchLevelBuild(this._main).build(wad, game, code, options),
            __out:   {control: (m) => wire.toSub.push(['control', JSON.parse(JSON.stringify(m))]), binary: (b) => wire.toSub.push(['binary', new Uint8Array(b).slice()])}
        })(this._main.readWad(wadPath), scenario.toData(), mode);
        const guest = this._sub.run(BenchReplicaRun.GUEST_SCRIPT, {
            __build: (wad, game, code, options) => new BenchLevelBuild(this._sub).build(wad, game, code, options),
            __out:   {control: (m) => wire.toMain.push(['control', JSON.parse(JSON.stringify(m))]), binary: (b) => wire.toMain.push(['binary', new Uint8Array(b).slice()])}
        })(this._sub.readWad(wadPath), {...scenario.toData(), plan: BenchReplicaRun.subPlan(scenario.plan)}, mode);

        await host.start();
        await this._pump(wire, host, guest);
        for (let frame = 0; frame < scenario.frames; frame++) {
            const now = frame * BenchScenario.FRAME_MS;
            guest.frame(frame, now);
            host.frame(frame, now);
            await this._pump(wire, host, guest);
        }

        return {main: host.finish(), sub: guest.finish()};
    }

    // Delivers every pending message in order, until both directions are empty.
    async _pump(wire, host, guest) {
        while ((wire.toSub.length > 0) || (wire.toMain.length > 0)) {
            while (wire.toSub.length > 0) {
                const [kind, data] = wire.toSub.shift();
                await ((kind === 'control') ? guest.receiveControl(data) : guest.receiveBinary(data));
            }
            while (wire.toMain.length > 0) {
                const [kind, data] = wire.toMain.shift();
                host.receive(kind, data);
            }
        }
    }

    // The sub's choreography: the main's, mirrored left to right.
    static subPlan(plan) {
        return plan.map((step) => Object.assign({}, step, {move: [-step.move[0], step.move[1]], look: [-step.look[0], step.look[1]]}));
    }
}

BenchReplicaRun.SEED           = 7;
BenchReplicaRun.SCREEN_SHARING = 'screen';
BenchReplicaRun.COOPERATIVE    = 'coop';
BenchReplicaRun.SUB_PEER_ID    = 1;
BenchReplicaRun.SUB_PLAYER_ID  = 2;
BenchReplicaRun.PRECISION      = 10000;

// Shared by both scripts.
BenchReplicaRun.COMMON_SCRIPT = `
    ${BenchScenario.COMMAND_SCRIPT}
    const round = (v) => (Math.round(v * ${BenchReplicaRun.PRECISION}) / ${BenchReplicaRun.PRECISION});
`;

BenchReplicaRun.HOST_SCRIPT = `((wadFile, scenario, mode) => {
    ${BenchReplicaRun.COMMON_SCRIPT}
    const coop    = (mode === '${BenchReplicaRun.COOPERATIVE}');
    const rules   = ((coop) ? new DoomCoopRules({friendlyFire: true}) : new DoomSinglePlayerRules());
    const netMode = ((coop) ? DoomNetProtocol.MODE_COOPERATIVE : DoomNetProtocol.MODE_SCREEN_SHARING);
    const game    = {profile: new GameProfileList().getForWad(wadFile)};
    game.itemCatalog = new DoomItemCatalog(game.profile);
    const roster  = new DoomPlayerRoster().setLocal(new DoomPlayer(DoomPlayer.MAIN_ID));
    const events  = new DoomTurnEvents();
    const role    = new DoomMainRole(roster, rules, events).useProfile(game.profile, game.itemCatalog, scenario.skill);
    const removed = [];
    const trace   = [];
    let cycle = null;
    const peer    = {getId: () => ${BenchReplicaRun.SUB_PEER_ID}, sendControl: (m) => __out.control(m), sendBinary: (b) => __out.binary(b), setLivenessSuspended: () => {}};
    const session = {
        playerIdOf: () => ${BenchReplicaRun.SUB_PLAYER_ID}, nicknameOf: () => 'SUB', getMode: () => netMode, getOptions: () => ((coop) ? rules.getOptions() : {}),
        remove: (id, reason) => removed.push(reason), setCycle: (c) => { cycle = c; }
    };
    return {
        start: async () => {
            const {world} = await __build(wadFile, game, scenario.level, {skill: scenario.skill, thingFilter: rules.thingFilter(), role: role, events: events});
            role.enterLevel(world, null, null);
            role.levelStarted({levelCode: scenario.level, skill: scenario.skill, thingFilter: role.thingFilter()});
            role.startHosting(session, () => {});
            cycle.admitted(peer);
        },
        receive: (kind, data) => {
            if (kind === 'control') { cycle.control(peer, data); } else { cycle.binary(peer, Uint8Array.from(data).buffer); }
        },
        frame: (frame, now) => {
            if (!role.isTurnReady(now)) { trace.push('held'); return; }
            const command = commandAt(scenario.plan, frame);
            role.advance(1000 / 60, {sample: () => command}, () => {}, now);
            const user = roster.getLocal().getUser();
            trace.push([round(user.x), round(user.y), round(user.z), user.getEnergy(), roster.getInLevel().length]);
        },
        finish: () => ({trace: trace, removed: removed, players: roster.getInLevel().map((p) => p.getId())})
    };
})`;

BenchReplicaRun.GUEST_SCRIPT = `((wadFile, scenario, mode) => {
    ${BenchReplicaRun.COMMON_SCRIPT}
    const coop    = (mode === '${BenchReplicaRun.COOPERATIVE}');
    const netMode = ((coop) ? DoomNetProtocol.MODE_COOPERATIVE : DoomNetProtocol.MODE_SCREEN_SHARING);
    const game    = {profile: new GameProfileList().getForWad(wadFile)};
    game.itemCatalog = new DoomItemCatalog(game.profile);
    const localId = ((coop) ? ${BenchReplicaRun.SUB_PLAYER_ID} : DoomPlayer.MAIN_ID);
    const roster  = new DoomPlayerRoster().setLocal(new DoomPlayer(localId));
    const played  = [];
    const flags   = {invalid: 0, phases: 0, ended: []};
    const session = {
        setCycle: function () { return this; }, setOnEnd: function (cb) { flags.onEnd = cb; return this; }, setLivenessSuspended: () => {},
        sendControl: (m) => __out.control(m), sendBinary: (b) => __out.binary(b), getMode: () => netMode, getHostNickname: () => 'HOST',
        endInvalid: () => { flags.invalid++; }, leave: () => {}
    };
    const role = new DoomSubRole(roster, session);
    let built = null, world = null, capture = null, pending = null;
    const mismatches = {};
    const samples    = [];
    let turns = 0;
    role.follow((event) => played.push(event.type + ((event.name !== undefined) ? (':' + event.name) : '')),
        (level) => { pending = level; }, () => {}, () => { flags.phases++; }, (reason) => flags.ended.push(reason), () => {});
    const sections = ['bodies', 'bornBodies', 'projectiles', 'pickups', 'movers', 'switches', 'surfaces', 'lights', 'stats'];
    const json = (v) => JSON.stringify(v, (k, x) => ((typeof x === 'number' && Object.is(x, -0)) ? 0 : x));
    const compare = (received, mine) => {
        for (const section of sections) {
            if (json(received[section]) !== json(mine[section])) {
                mismatches[section] = (mismatches[section] ?? 0) + 1;
                if (samples.length < 3) { samples.push(section + '@' + received.turn + ': ' + json(received[section]).substring(0, 160) + ' | ' + json(mine[section]).substring(0, 160)); }
            }
        }
        // The sub's own player, once it has entered the main's level (a coop player enters with its first command).
        const got  = received.players.find((p) => (p.id === localId));
        const have = mine.players.find((p) => (p.id === localId));
        if ((got !== undefined) && (json(got) !== json(have ?? null))) {
            mismatches.player = (mismatches.player ?? 0) + 1;
            if (samples.length < 3) { samples.push('player@' + received.turn + ': ' + json(got ?? null).substring(0, 200) + ' | ' + json(have ?? null).substring(0, 200)); }
        }
    };
    const trace = [];
    return {
        receiveControl: async (message) => {
            if (message.type === DoomNetProtocol.LEVEL_LOAD) {
                role.levelLoad(message);
                role.prepareLevel(pending);
                ({built, world} = await __build(wadFile, game, pending.levelCode, {skill: pending.skill, thingFilter: pending.thingFilter}));
                role.adoptLevel(built);
                role.enterLevel(world);
                capture = new DoomNetStateCapture(roster, built, role.getLevelStats(), {drain: () => []});
                role.levelStarted();
                return;
            }
            if (message.type === DoomNetProtocol.WAITING) { role.waiting(message.nicknames); return; }
            if ([DoomNetProtocol.PAUSE, DoomNetProtocol.INTERMISSION, DoomNetProtocol.FINALE].includes(message.type)) { role.phase(message); }
        },
        receiveBinary: (bytes) => {
            const buffer   = Uint8Array.from(bytes).buffer;
            const received = DoomNetStateCodec.decode(buffer);
            role.state(buffer);
            turns++;
            compare(received, capture.capture(received.turn));
            const user = roster.getLocal().getUser();
            trace.push([received.turn, round(user.x), round(user.y), round(user.z), user.getEnergy(), received.players.length, received.bodies.length]);
        },
        frame: (frame, now) => {
            const command = commandAt(scenario.plan, frame);
            role.advance(1000 / 60, {sample: () => command}, () => {}, now);
        },
        finish: () => ({turns: turns, trace: trace, played: played, mismatches: mismatches, samples: samples, flags: flags})
    };
})`;

module.exports = {BenchReplicaRun};
