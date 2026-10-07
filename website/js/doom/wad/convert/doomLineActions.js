/**
 * The game actions a crossed or used line runs beyond its movers
 * (WadConstants.LINE_ACTION_BY_SPECIAL): each action name is served by the
 * system that owns it, registered at level build.
 */
class DoomLineActions {
    constructor() {
        this._handlers = {};
    }

    /**
     * @param {string}           name
     * @param {function(object)} handler - receives a WadMapAnalyzer.lineActionOf action
     */
    register(name, handler) {
        this._handlers[name] = handler;

        return this;
    }

    /**
     * @param {object|null} action - a WadMapAnalyzer.lineActionOf action
     * @returns {function|null} what a trigger calls to run it, null for no action
     */
    bind(action) {
        if (action === null) {
            return null;
        }

        return () => {
            const handler = (this._handlers[action.name] ?? null);
            if (handler !== null) {
                handler(action);
            }
        };
    }
}
