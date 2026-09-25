/**
 * Screen after the episode choice: pick the skill, then the new game starts on
 * the episode's first level. The converter filters the THINGS lump by that
 * skill like vanilla does.
 */
class DifficultyScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     */
    constructor(navigator, display) {
        super(navigator, display);

        this._wadMeta = null;
        this._episode = null;

        // Skill 0 is our own exploration mode: the skill-1 world without
        // monsters. The names are a generic scale, not the vanilla titles.
        this._skills = [0, 1, 2, 3, 4, 5];
    }

    /**
     * @param {object} meta
     * @param {object} episode chosen episode ({episode, firstLevel, name})
     */
    setWad(meta, episode) {
        this._wadMeta = meta;
        this._episode = episode;

        return this;
    }

    _build() {
        const episodeLabel    = appTranslator.get('menu.episode.item', {episode: this._episode.episode});
        const {panel, listEl} = this._buildWadPanel(this._wadMeta, episodeLabel + ' — ' + appTranslator.get('menu.difficulty.title'));

        for (const skill of this._skills) {
            const item = this._addListItem(listEl, appTranslator.get('difficulty.' + skill), () => {
                this._onSelectSkill(skill);
            });

            this._addListItemInfos(item, appTranslator.get('menu.difficulty.skill', {skill: skill}));
        }

        this._addBackButton(panel);

        this._selectCurrentSkill();
    }

    _onBack() {
        this._navigator.openEpisodes(this._wadMeta);
    }

    _onSelectSkill(skill) {
        this._navigator.startNewGame(this._wadMeta, this._episode.firstLevel, skill);
    }

    _selectCurrentSkill() {
        const current = this._navigator.getSelectedDifficulty();
        const index   = this._skills.indexOf(current);

        this._nav.selectIndex(((index >= 0) ? index : 0));
    }
}
