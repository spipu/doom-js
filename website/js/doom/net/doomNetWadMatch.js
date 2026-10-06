/**
 * Finds, among the WADs stored on a sub, the one a main's invite is for: the
 * same file (SHA-256), else the refusal tells whether the sub holds the same
 * game in another version, or not at all.
 */
class DoomNetWadMatch {
    /**
     * @param {object[]} wads   - stored WAD metadata, their identity computed
     * @param {object}   invite - see DoomNetInvite.decodeInvite
     * @returns {object} the metadata of the WAD the main plays
     */
    static find(wads, invite) {
        const same = wads.find((meta) => (meta.sha256 === invite.wadSha256));
        if (same !== undefined) {
            return same;
        }
        if (DoomNetWadMatch._holdsTitle(wads, invite.wadTitle)) {
            throw new NetError(DoomNetWadMatch.OTHER_VERSION, 'The invite is for another version of a stored game', invite.wadLabel);
        }

        throw new NetError(DoomNetWadMatch.MISSING, 'The invite is for a WAD not stored here', invite.wadLabel);
    }

    // The title travels in ASCII: compared in the same form.
    static _holdsTitle(wads, title) {
        return ((title !== '') && wads.some((meta) => ((typeof meta.title === 'string') && (DoomNetInvite.asciiLabel(meta.title) === title))));
    }
}

DoomNetWadMatch.MISSING       = 'wad-missing';
DoomNetWadMatch.OTHER_VERSION = 'wad-other-version';
