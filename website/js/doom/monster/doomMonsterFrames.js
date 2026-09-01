/**
 * Billboard views of one monster type, keyed by DoomMonsterDef.viewKey.
 *
 * Every spawn frame carries its full rotation set (1 or 8 raw sprite-bank
 * entries): the world builder pre-builds one shared billboard per (frame,
 * rotation) — no padded common canvas, each view keeps its own vanilla anchor
 * (the doomEffects pattern).
 *
 * Shared by the placed monsters (WadThingBuilder) and the ones born mid-game
 * (lost souls, minotaur bodies): both need the exact same view set, and a
 * runtime spawn has no second chance to load a missing sprite.
 */
class DoomMonsterFrames {
    /**
     * @param {DoomMonsterDef} def
     * @param {WadSpriteBank}  spriteBank
     * @param {boolean}        quiet  a missing body is expected (runtime type of
     *                                another game), no warning
     * @returns {object|null} viewKey → rotation set, null when the type has no
     *                        usable body (its spawn views are missing)
     */
    static build(def, spriteBank, quiet = false) {
        // The spawn views are the monster's body: without them the monster is
        // dropped. The other views are optional (freedoom gaps): a state whose
        // views are missing just keeps showing the previous ones.
        const frames = {};
        for (const pair of def.getFramePairs(['spawn'])) {
            const views = spriteBank.getFrameRotations(pair.sprite, pair.frame, quiet);
            if (views === null) {
                return null;
            }
            frames[DoomMonsterDef.viewKey(pair.sprite, pair.frame)] = views;
        }
        for (const pair of def.getAllFramePairs()) {
            const viewKey = DoomMonsterDef.viewKey(pair.sprite, pair.frame);
            if (frames[viewKey] !== undefined) {
                continue;
            }
            const views = spriteBank.getFrameRotations(pair.sprite, pair.frame);
            if (views !== null) {
                frames[viewKey] = views;
            }
        }

        return frames;
    }
}
