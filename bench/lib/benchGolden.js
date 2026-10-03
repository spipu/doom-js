/**
 * Golden entry comparison: every field counts except the informative ones
 * (prefixed "~"), printed next to their golden value and never failing a run.
 */
class BenchGolden {
    /**
     * @param {object} expected - the golden entry
     * @param {object} actual   - the entry of this run
     * @returns {boolean}
     */
    static same(expected, actual) {
        return (JSON.stringify(BenchGolden._compared(expected)) === JSON.stringify(BenchGolden._compared(actual)));
    }

    /**
     * @returns {string} the readable fields that differ; the shas alone say nothing to a reader
     */
    static describe(expected, actual) {
        const parts = [];
        for (const field of new Set([...Object.keys(BenchGolden._compared(expected)), ...Object.keys(BenchGolden._compared(actual))])) {
            if ((!field.toLowerCase().endsWith('sha')) && (JSON.stringify(expected[field]) !== JSON.stringify(actual[field]))) {
                parts.push(field + ' ' + JSON.stringify(expected[field]) + ' → ' + JSON.stringify(actual[field]));
            }
        }

        return ((parts.length > 0) ? (' (' + parts.join(', ') + ')') : ' (same counts, different content)');
    }

    /**
     * @returns {string|null} the informative fields with their golden value, null when the entry has none
     */
    static inform(expected, actual) {
        const parts = Object.keys(actual)
            .filter((field) => field.startsWith(BenchGolden.INFORMATIVE_PREFIX))
            .map((field) => (field + ' ' + JSON.stringify(actual[field]) + ' (golden ' + JSON.stringify(expected[field]) + ')'));

        return ((parts.length > 0) ? parts.join(', ') : null);
    }

    /**
     * @returns {object} the entry of a run that threw: always a difference, never a golden value
     */
    static errorEntry(error) {
        return {[BenchGolden.ERROR]: String(error.message).split('\n')[0]};
    }

    static isError(entry) {
        return (entry[BenchGolden.ERROR] !== undefined);
    }

    static informative(name) {
        return BenchGolden.INFORMATIVE_PREFIX + name;
    }

    static _compared(entry) {
        return Object.fromEntries(Object.entries(entry).filter(([field]) => !field.startsWith(BenchGolden.INFORMATIVE_PREFIX)));
    }
}

BenchGolden.INFORMATIVE_PREFIX = '~';
BenchGolden.ERROR              = 'error';

module.exports = {BenchGolden};
