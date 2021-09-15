#!/usr/bin/env node
import commander from 'commander';
import { readFile } from 'fs/promises';
import { readXLSX, writeJSON, jobs as getJobs } from './io.js';
import { jobs as doJobs } from './transform/index.js';

commander
    .command('version')
    .action(async () => {
        console.info(
            JSON.parse(
                    await readFile('package.json')
                )
                .version
        );
    });

commander
    .command('transform [list...]')
    .action(async list => {
        await doJobs(
            await getJobs(list),
            readXLSX,
            writeJSON,
        );
    });

commander
    .name('vt');

commander.parse(process.argv);