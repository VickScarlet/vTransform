import { dump as dumpYAML } from 'js-yaml'
import path from 'node:path'
import { writeFile, stat, mkdir } from 'node:fs/promises'

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

function map(raw, pk, space) {
    const isArray = !pk || Array.isArray(raw)
    if (isArray || typeof raw !== 'object') {
        const data = jp(j(raw, space))
        return { data: jp(j(raw, space)), type: isArray ? 'array' : 'object' }
    }
    const data = Object.values(raw).map(v => [v[pk], v])
    console.info(`🔁 [Dump] Object -> Map [${pk}]`)
    return { data: `new Map(${jp(j(data, space))})`, type: 'map' }
}

function withType(main, sub, pk) {
    switch (main) {
        case 'array':
            return `${sub}[]`
        case 'map':
            if (sub === 'any') return `Map<${sub}, ${sub}>`
            return `Map<${sub}['${pk}'], ${sub}>`
        case 'object':
            return `{ [key: string]: ${sub} }`
        default:
            return sub
    }
}

function jsonify(name, data, space) {
    const { raw, addition, dts } = data
    const json = j(addition ? { [name]: raw, ...addition } : raw, space)
    return [json, dts]
}

function yamlify(name, data, indent) {
    const { raw, addition, dts } = data
    const opt = { indent: indent || undefined }
    const yaml = dumpYAML(addition ? { [name]: raw, ...addition } : raw, opt)
    return [yaml, dts]
}

function cjsify(name, data, space, types) {
    const { type, pk, dts, addition } = data
    const converted = map(data.raw, pk, space)
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

function esmify(name, data, space, types) {
    const { type, pk, dts, addition } = data
    const converted = map(data.raw, pk, space)
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

function tsify(name, data, space) {
    const { pk, addition } = data
    const converted = map(data.raw, pk, space)
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

async function mkdirs(dir) {
    try {
        await stat(dir)
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e
        }
        await mkdirs(path.dirname(dir))
        await mkdir(dir)
    }
}

async function write(sheet, data) {
    console.info(`📦 -> ${sheet}`)
    await mkdirs(path.dirname(sheet))
    await writeFile(sheet, data)
}

export async function dump({ sheet, data, type, space, name, ext, types }) {
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

    const [main, dts] = ify(name, data, space, types)
    const result = await write(`${sheet}${ext || e}`, main)
    if (types && dts) await write(`${sheet}.d.ts`, dts)

    // if (type !== 'ts' && data?.extra?.types) {
    //     const { types, typeSign } = data.extra
    //     const cleanTypes = String(types).trim() + '\n'

    //     const dtsLines = [
    //         cleanTypes,
    //         `export declare const ${name}: ${typeSign};`,
    //         `export default ${name};`,
    //     ]

    //     if (data.addition) {
    //         Object.entries(data.addition).forEach(([key, value]) => {
    //             dtsLines.push(`export declare const ${key}: ${typeof value};`)
    //         })
    //     }

    //     const dtsContent = dtsLines.join('\n') + '\n'
    //     await write(`${sheet}.d.ts`, dtsContent)
    // }

    return result
}
