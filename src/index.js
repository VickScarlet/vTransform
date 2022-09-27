#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { read, getWrite, jobs as getJobs } from './io.js';
import { jobs as doJobs } from './transform/index.js';

(async() => {

const program = new Command();

program.name('vt');
program.version(JSON.parse(await readFile('package.json')).version);
program
    .command('transform [list...]')
    .option('-t, --type <type>', 'type of transform, available: js, esm, cjs, json', 'json')
    .option('-s, --space <space>', 'format space number', 0)
    .action(async (list, {type, space}) => doJobs(
        await getJobs(list), read, getWrite(type, space),
    ));

program.parse(process.argv);

})();