import { dump as dumpYAML } from 'js-yaml'
import path from 'node:path'
import { writeFile, stat, mkdir } from 'node:fs/promises'

function j(data, space) {
    return JSON.stringify(data, null, space)
}

function jsonify(name, { data, addition }, space) {
    return j(addition ? { [name]: data, ...addition } : data, space)
}

function cjsify(name, data, space) {
    return `module.exports = ${jsonify(name, data, space)}`
}

function esmify(name, { data, addition }, space) {
    const main = `export const ${name} = ${jsonify(name, { data, addition }, space)}`
    const def = `export default ${name}`
    if (!addition) return `${main}\n${def}`
    const extra = Object.entries(addition)
        .map(([key, value]) => `export const ${key} = ${j(value, space)}`)
        .join('\n')
    return `${main}\n${extra}\n${def}`
}

function yamlify(name, { data, addition }, indent) {
    const options = { indent: indent || undefined }
    if (!addition) return dumpYAML(data, options)
    return dumpYAML({ [name]: data, ...addition }, options)
}

function tsify(name, { data, extra, addition }, space) {
    const { types, typeSign, isNativeMap } = extra
    if (!types)
        return `export default ${jsonify(name, { data, addition }, space)}`
    const raw = j(data, space)
    const d = isNativeMap ? `new Map(${raw})` : raw
    const main = `${types}\nexport const ${name} = ${d} as unknown as ${typeSign};`
    const def = `export default ${name}`
    if (!addition) return `${main}\n${def}`
    const extraExports = Object.entries(addition)
        .map(([key, value]) => `export const ${key} = ${j(value, space)}`)
        .join('\n')
    return `${main}\n${extraExports}\n${def}`
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
    console.info(`Dump ${sheet}`)
    await mkdirs(path.dirname(sheet))
    await writeFile(sheet, data)
}

export async function dump(sheet, data, type, space, name) {
    let ext, ify
    switch (type) {
        case 'ts':
            ext = '.ts'
            ify = tsify
            break
        case 'cjs':
            ext = '.js'
            ify = cjsify
            break
        case 'js':
        case 'mjs':
        case 'esm':
            ext = '.js'
            ify = esmify
            break
        case 'yaml':
        case 'yml':
            ext = '.yaml'
            ify = yamlify
            break
        case 'json':
        default:
            ext = '.json'
            ify = jsonify
            break
    }
    return write(`${sheet}${ext}`, ify(name, data, space))
}
