#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { transform } from './transform.js';

(async() => {

const program = new Command();

program.name('vt');
program.version(JSON.parse(await readFile('package.json')).version);
program
    .command('transform [list...]')
    .option('-t, --type <type>', 'type of transform, available: js, esm, cjs, json', 'json')
    .option('-s, --space <space>', 'format space number', 0)
    .option('-c, --config <config>', 'configure file', null)
    .option('-w, --cwd <cwd>', 'current work dir', null)
    .option('-o, --output <output>', 'output dir', null)
    .option('-d, --dest <dest>', 'dest dir', null)
    .action((list, options) => {
        if(!options.dest) options.dest = options.output;
        options.list = list;
        transform(options);
    });

program.parse(process.argv);

})();