/**
 * Vanilla A_BossDeath (p_enemy.c, heretic A_HBossDeath): when the LAST live
 * monster of a boss def dies on its map, the map action fires — tagged movers
 * start (floors no linedef declares, the code is their only activator) or the
 * level simply exits. Built per level by WadWorldBuilder from the profile's
 * bossActions(); stateless — the monster records and the instance anims
 * already carry everything a save needs.
 */
class DoomBossDeath {
    /**
     * @param {DoomMonsterSystem} monsters
     * @param {object[]}          rules - [{def, targets: [instance codes], exit}]
     * @param {function|null}     exitCallback
     */
    constructor(monsters, rules, exitCallback) {
        this._monsters     = monsters;
        this._rules        = rules;
        this._exitCallback = exitCallback;
    }

    onDeath(def) {
        const rule = this._rules.find((r) => (r.def === def)) ?? null;
        if ((rule === null) || (this._monsters.countAliveOfDef(def) > 0)) {
            return;
        }
        if (rule.exit === true) {
            if (this._exitCallback !== null) {
                this._exitCallback(false);
            }
            return;
        }
        for (const code of rule.targets) {
            loader.instances().getByCode(code).start();
        }
    }
}
