#!/usr/bin/env node
/**
 * Golden-master bench of Spipu-Doom, run from the repository root:
 *
 *   node bench/run.js                      every suite against bench/golden/
 *   node bench/run.js --suite build        one suite (build | simulation | codecs | save | replica | progression)
 *   node bench/run.js --wad Doom1 --wad heretic
 *   node bench/run.js --update             rewrite the golden files from this run
 *   node bench/run.js --verbose            echo the app's console
 *
 * A wanted difference is recorded by --update in the same commit as its cause.
 */
const {BenchRunner} = require('./benchRunner');

new BenchRunner(process.argv.slice(2)).run()
    .then((failures) => {
        process.exitCode = ((failures > 0) ? 1 : 0);
    })
    .catch((error) => {
        process.stderr.write(String(error.stack ?? error) + '\n');
        process.exitCode = 2;
    });
