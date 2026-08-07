#!/usr/bin/env bun
import { Command } from 'commander'
import { transform } from './transform.js'

const program = new Command()

program.name('vt')

const pkg = await Bun.file('package.json').json()
program.version(pkg.version)

program
    .command('transform [list...]')
    .option(
        '-t, --type <type>',
        'type of transform, available: js, ts, esm, cjs, json',
        'json',
    )
    .option('-s, --space <space>', 'format space number', Number, 0)
    .option('-c, --config <config>', 'configure file', null)
    .option('-w, --cwd <cwd>', 'current work dir', null)
    .option('-o, --output <output>', 'output dir', null)
    .option('-d, --dest <dest>', 'dest dir', null)
    .option('-e, --ext <ext>', 'file ext', null)
    .option('-a, --addition', 'addition version', false)
    .option('-x, --notypes', 'disable types generation', false)
    .option('-m, --map', 'enable map generation', false)
    .action((list, options) => {
        if (!options.dest) options.dest = options.output
        options.list = list
        transform(options)
    })

program.parse(Bun.argv)
