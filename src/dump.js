import { dump as dumpYAML } from 'js-yaml'

function j(data, space) {
    return JSON.stringify(data, null, space)
}

function minij(json) {
    return json.replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)"\s*:/g, '$1:')
}

function jp(data, space) {
    const json = j(data, space).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return `JSON.parse(\n\t'${json}'\n)`
}

function map(raw, pk, space, enable) {
    if (Array.isArray(raw)) {
        return { data: jp(raw, space), type: 'array' }
    }
    if (!pk || !enable) return { data: jp(raw, space), type: 'object' }
    const data = Object.values(raw).map(v => [v[pk], v])
    console.info(`🔁 [Dump] Object -> Map [${pk}]`)
    return { data: `new Map(${jp(data, space)})`, type: 'map' }
}

function withType(main, sub, pk) {
    switch (main) {
        case 'array':
            return `${sub}[]`
        case 'map':
            if (sub === 'any') return `Map<${sub}, ${sub}>`
            return `Map<${sub}['${pk}'], ${sub}>`
        case 'object':
            return `Record<${sub}['${pk}'], ${sub}>`
        default:
            return sub
    }
}

function jsonify({ name, data, space }) {
    const { raw, addition, dts } = data
    const json = j(addition ? { [name]: raw, ...addition } : raw, space)
    return [json, dts]
}

function yamlify({ name, data, space }) {
    const { raw, addition, dts } = data
    const opt = { indent: space || undefined }
    const yaml = dumpYAML(addition ? { [name]: raw, ...addition } : raw, opt)
    return [yaml, dts]
}

function cjsify({ name, data, space, types, toMap }) {
    const { type, pk, dts, addition } = data
    const converted = map(data.raw, pk, space, toMap)
    const r = []
    if (types && dts) {
        r.push(`/** @typedef {import('./${name}').${type}} ${type} */`)
        r.push(`/** @type {${withType(converted.type, type, pk)}} */`)
    }
    r.push(`const ${name} = ${converted.data}`)
    const exports = [name]
    if (addition)
        Object.entries(addition).forEach(([key, value]) => {
            exports.push(key)
            r.push(`const ${key} = ${j(value, space)}`)
        })

    r.push(`module.exports = { ${exports.join(', ')} }`)
    return [r.join('\n'), dts]
}

function esmify({ name, data, space, types, toMap }) {
    const { type, pk, dts, addition } = data
    const converted = map(data.raw, pk, space, toMap)
    const rows = []
    if (types && dts) {
        rows.push(`/** @typedef {import('./${name}').${type}} ${type} */`)
        rows.push(`/** @type {${withType(converted.type, type, pk)}} */`)
    }
    rows.push(`export const ${name} = ${converted.data}`)
    if (addition)
        Object.entries(addition).forEach(([key, value]) => {
            rows.push(`export const ${key} = ${j(value, space)}`)
        })

    rows.push(`export default ${name}`)
    return [rows.join('\n'), dts]
}

function tsify({ name, data, space, toMap }) {
    const { pk, addition } = data
    const converted = map(data.raw, pk, space, toMap)
    const type = withType(converted.type, data.type, pk)
    const rows = [data.dts]
    rows.push(`export const ${name} = ${converted.data} as unknown as ${type};`)
    if (addition)
        Object.entries(addition).forEach(([key, value]) =>
            rows.push(`export const ${key} = ${j(value, space)}`),
        )
    rows.push(`export default ${name}`)
    return [rows.join('\n')]
}

async function write(sheet, data) {
    console.info(`📦 -> ${sheet}`)
    return await Bun.write(sheet, data)
}

export async function dump({ sheet, type, ext, map, types, ...args }) {
    let e, ify
    switch (type) {
        case 'ts':
            e = '.ts'
            ify = tsify
            break
        case 'cjs':
            e = '.js'
            ify = cjsify
            break
        case 'js':
        case 'mjs':
        case 'esm':
            e = '.js'
            ify = esmify
            break
        case 'yaml':
        case 'yml':
            e = '.yaml'
            ify = yamlify
            break
        case 'json':
        default:
            e = '.json'
            ify = jsonify
            break
    }

    const [main, dts] = ify({ ...args, types, toMap: map })
    const result = await write(`${sheet}${ext || e}`, main)
    if (types && dts) await write(`${sheet}.d.ts`, dts)
    return result
}
