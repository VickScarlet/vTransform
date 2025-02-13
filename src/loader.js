import glob from 'glob';
import yaml from 'js-yaml';
import path from 'path';
import { readFile } from 'fs/promises';

export async function load({ type, space, config, dest, list, cwd, addition }) {
    const version = new Date().toISOString();
    type = type || 'json';
    cwd = cwd || process.cwd();
    space = Number(space) || 0;
    dest = dest || cwd;
    const def = { cwd, type, space, dest, addition };
    const m = (...l) => globit(Object.assign({}, ...l));
    const cfgs = [];

    if (list?.length)
        cfgs.unshift(await m(def, { glob: list }));

    if (config) {
        const c = await loadConfig(config);
        const dir = path.dirname(config);
        const cdef = {};
        if (c.cwd) cdef.cwd = path.resolve(dir, c.cwd);
        if (c.type) cdef.type = c.type;
        if (typeof c.space == 'number') cdef.space = c.space;
        if (c.dest) cdef.dest = path.resolve(dir, c.dest);
        for (const cfg of c.configurations) {
            if (cfg.cwd) cfg.cwd = path.resolve(dir, cfg.cwd);
            if (cfg.dest) cfg.dest = path.resolve(dir, cfg.dest);
            cfgs.push(await m(def, cdef, cfg));
        }
    }

    for (const cfg of cfgs)
        if (cfg.addition)
            cfg.addition = { version, timestamp: version }

    return cfgs;
}

async function loadConfig(config) {
    switch (path.extname(config)) {
        case '.json':
        case '.yaml':
        case '.yml':
            return yaml.load(
                await readFile(config)
            );
        case '.js':
        case '.mjs':
            return (await import(config)).default;
        default:
            throw new Error(`Unknown config file type: ${config}`);
    }
}

async function globit(options) {
    const { glob: gs, cwd } = options;
    const files = [];
    const g = p => new Promise(r => glob(
        p, { cwd }, (err, files) => r(err ? [] : files)
    ))
    if (Array.isArray(gs))
        for (const p of gs)
            files.push(...await g(p));
    else if (typeof gs == 'string')
        files.push(...await g(gs));
    else
        throw new Error(`Unknown glob type: ${gs}`);

    return Object.assign({ files }, options);
}