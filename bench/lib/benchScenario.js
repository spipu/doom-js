/**
 * A scripted run of the simulation: a level, a skill, and the command the
 * player sends at each frame. Plans are plain data so the suites can hand
 * them to the app context, which turns them into UserCommands.
 *
 * A plan step: {until, move: [x, y], look: [yaw, pitch], buttons: [...],
 * every: n} — the step holds from the previous step's end to `until`
 * (exclusive); `every` presses the buttons on one frame out of n only.
 */
class BenchScenario {
    /**
     * @param {string}   wad
     * @param {string}   level
     * @param {int}      skill
     * @param {int}      frames
     * @param {object[]} plan
     */
    constructor(wad, level, skill, frames, plan) {
        this.wad    = wad;
        this.level  = level;
        this.skill  = skill;
        this.frames = frames;
        this.plan   = plan;
    }

    get key() {
        return this.wad + '/' + this.level + '@' + this.skill;
    }

    /**
     * @returns {object} the plan as plain data for the app context
     */
    toData() {
        return {level: this.level, skill: this.skill, frames: this.frames, plan: this.plan};
    }

    // Cheat, sweep a full turn shooting, walk in, cycle the weapons, jump, use,
    // strafe under fire: the same choreography on every level, 20 s at 60 frames/s.
    static standardPlan() {
        return [
            {until: 1,    move: [0, 0],   look: [0, 0],    buttons: ['cheatFullKit']},
            {until: 241,  move: [0, 0],   look: [1.5, 0],  buttons: ['fire'], every: 3},
            {until: 300,  move: [0, 1],   look: [0, 0]},
            {until: 360,  move: [0, 0.5], look: [-1, 0],   buttons: ['weaponNext', 'fire'], every: 20},
            {until: 420,  move: [1, 0],   look: [0, -0.5]},
            {until: 440,  move: [1, 0],   look: [0, 0],    buttons: ['jump']},
            {until: 540,  move: [0, 1],   look: [0, 0.5],  buttons: ['action'], every: 30},
            {until: 600,  move: [0, -1],  look: [3, 0],    buttons: ['fire'], every: 3},
            {until: 660,  move: [-1, 0],  look: [0, 0],    buttons: ['weaponPrev'], every: 15},
            {until: 720,  move: [0, 0],   look: [0, 0],    buttons: ['crouch']},
            {until: 900,  move: [0, 1],   look: [-2, 0],   buttons: ['fire'], every: 4},
            {until: 1200, move: [0.5, 1], look: [0.5, 0],  buttons: ['action'], every: 45}
        ];
    }

    static standard() {
        return [
            new BenchScenario('Doom1',     'E1M1',  BenchScenario.SKILL, BenchScenario.FRAMES, BenchScenario.standardPlan()),
            new BenchScenario('Doom2',     'MAP01', BenchScenario.SKILL, BenchScenario.FRAMES, BenchScenario.standardPlan()),
            new BenchScenario('freedoom1', 'E1M1',  BenchScenario.SKILL, BenchScenario.FRAMES, BenchScenario.standardPlan()),
            new BenchScenario('heretic',   'E1M1',  BenchScenario.SKILL, BenchScenario.FRAMES, BenchScenario.standardPlan()),
            new BenchScenario('heretic',   'E1M3',  BenchScenario.SKILL, BenchScenario.FRAMES, BenchScenario.standardPlan())
        ];
    }
}

BenchScenario.FRAME_MS = 1000 / 60;
BenchScenario.FRAMES   = 1200;
BenchScenario.SKILL    = 3;

module.exports = {BenchScenario};
