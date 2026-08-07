import { load as loadYAML } from 'js-yaml'

export async function load(args) {
    const { config, list, ...a } = args
    const version = new Date().toISOString()
    const type = args.type || 'json'
    const cwd = args.cwd || Bun.cwd
    const space = Number(args.space) || 0
    const dest = args.dest || cwd
    const types = !args.notypes
    const map = args.map || false
    const def = { ...a, cwd, type, space, dest, types, map }
    const m = (...l) => globit(Object.assign({}, ...l))
    const cfgs = []

    if (list?.length) cfgs.unshift(await m(def, { glob: list }))

    if (config) {
        const cfgData = await loadConfigData(config, def, m)
        cfgs.push(...cfgData)
    }

    for (const cfg of cfgs) {
        if (cfg.addition) cfg.addition = { version, timestamp: version }
    }

    return cfgs
}

async function loadConfigData(config, def, m) {
    const c = await loadConfig(config)
    const dir = config.substring(0, config.lastIndexOf('/')) || '.'
    const cdef = {}

    if (c.cwd) cdef.cwd = `${dir}/${c.cwd}`
    if (c.type) cdef.type = c.type
    if (typeof c.space == 'number') cdef.space = c.space
    if (c.dest) cdef.dest = `${dir}/${c.dest}`
    const cfgs = []

    for (const cfg of c.configurations) {
        if (cfg.cwd) cfg.cwd = `${dir}/${cfg.cwd}`
        if (cfg.dest) cfg.dest = `${dir}/${cfg.dest}`
        cfgs.push(await m(def, cdef, cfg))
    }

    return cfgs
}

async function loadConfig(config) {
    const ext = config.substring(config.lastIndexOf('.'))
    switch (ext) {
        case '.json':
        case '.yaml':
        case '.yml':
            return loadYAML(await Bun.file(config).text())
        case '.js':
        case '.mjs':
        case '.ts':
            return (await import(config)).default
        default:
            throw new Error(`Unknown config file type: ${config}`)
    }
}

async function globit(options) {
    const { glob: gs, cwd } = options
    const files = []

    const scanGlob = async pattern => {
        const globInstance = new Bun.Glob(pattern)
        const matched = []
        for await (const file of globInstance.scan({ cwd })) {
            matched.push(file)
        }
        return matched
    }

    if (Array.isArray(gs)) {
        for (const p of gs) files.push(...(await scanGlob(p)))
    } else if (typeof gs == 'string') {
        files.push(...(await scanGlob(gs)))
    } else {
        throw new Error(`Unknown glob type: ${gs}`)
    }

    return { ...options, files }
}
