import path from 'node:path'
import { load } from './loader.js'
import { prepare } from './prepare.js'
import { parser } from './parser.js'
import { dump } from './dump.js'
import { calibrateTsData } from './calibrator.js'

export async function transform(options) {
    const now = Date.now()
    const configurations = await load(options)
    for (const config of configurations) await task(config)
    console.info(`Transformed in ${Date.now() - now}ms`)
}

async function task(options) {
    console.info('Transform task config:', options)
    const { files, dest, cwd, addition, ...opts } = options
    const m = new Map()
    for (const file of files) {
        const dir = path.resolve(dest, path.dirname(file))
        await processPrepared(path.resolve(cwd, file), dir, m)
    }
    for (const [sheet, job] of m) {
        const data = await job.result(addition)
        await dump({ ...opts, sheet, data, name: job.name })
    }
}

async function processPrepared(src, dir, m) {
    const prepared = await prepare(src)
    const xlsxDir = path.dirname(src)
    for (const { name, data } of prepared) {
        if (name.startsWith('#')) continue
        const { sheet, keys, name: parsedName } = parseSheetAndKeys(name, dir)
        if (!m.has(sheet)) m.set(sheet, new JobData(parsedName, xlsxDir))
        m.get(sheet).append({ keys, data: parser(data) })
    }
}

function parseSheetAndKeys(name, dir) {
    let sheet = name.split('#')[0]
    sheet = sheet.replace('<arr>', '')
    if (sheet.startsWith('>')) sheet = sheet.substring(1)
    const keys = sheet.split('.')
    let key = keys.shift()
    sheet = path.resolve(dir, key)
    return { sheet, keys, name: key }
}

class JobData {
    constructor(name, xlsxDir) {
        this.#name = name
        this.#xlsxDir = xlsxDir
    }

    #data = []
    #pk = null
    #name = ''
    #xlsxDir = ''

    append({ data: [data, pk], keys }) {
        this.#data.push({ data, keys })
        if (pk) this.#pk = pk
    }

    async result(addition) {
        if (!this.#data.length) return { data: {}, extra: null }
        let result
        for (const { keys, data } of this.#data) {
            if (!keys.length) {
                result = this.#combine(result, data)
                continue
            }
            if (!result) result = {}
            let r = result
            let last = keys.pop()
            for (const key of keys) {
                if (!r[key]) r[key] = {}
                r = r[key]
            }
            r[last] = this.#combine(r[last], data)
        }
        const dts = path.join(this.#xlsxDir, `${this.#name}.types.ts`)
        const data = await calibrateTsData(result, this.#name, dts)
        return { ...data, pk: this.#pk, addition }
    }

    #combine(a, b) {
        if (a == null) return b
        if (b == null) return a
        if (Array.isArray(a) && Array.isArray(b)) {
            if (Array.isArray(b)) return a.concat(b)
            a.push(b)
            return a
        }
        if (Array.isArray(a)) return this.#combine(a, Object.values(b))
        if (Array.isArray(b)) return this.#combine(Object.values(a), b)
        const result = {}
        for (const key in a) result[key] = this.#combine(a[key], b[key])
        for (const key in b) if (!result[key]) result[key] = b[key]
        return result
    }

    get name() {
        return this.#name
    }
}
