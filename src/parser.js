import { load } from 'js-yaml'

function isCommentKey(key) {
    return key.startsWith('#')
}

function isJsonKey(key) {
    return key.startsWith('@')
}

function processHeaderColumn(col, head, layer, subs, json) {
    let key = head[col].trim()
    if (isCommentKey(key)) return
    if (isJsonKey(key)) {
        json.push(col)
        key = key.substr(1)
    }
    const [first, ...parts] = key.split(/[.:]/).map(p => p.trim())
    if (!subs[first]) layer.push(first)
    if (parts.length > 0) {
        if (!subs[first]) subs[first] = {}
        subs[first][col] = parts.join('.')
    } else if (first.endsWith('[]')) {
        if (!subs[first]) subs[first] = []
        subs[first].push(col)
    } else {
        subs[first] = col
    }
}

function createObjectSub(key, subs) {
    subs = [parseStruct(subs[key])]
    key = key.substr(0, key.length - 2)
    return { type: 'object', key, subs }
}

function createArraySub(key, subs) {
    if (Array.isArray(subs[key]))
        subs = subs[key].map(source => ({ type: 'value', source }))
    else subs = [parseStruct(subs[key])]
    key = key.substr(0, key.length - 2)
    return { type: 'array', key, subs }
}

function createValueSub(key, subs) {
    const source = subs[key]
    if (key.startsWith('$')) key = key.substr(1)
    return { type: 'value', key, source }
}

function createNestedObjectSub(key, subs) {
    return { type: 'object', key, subs: parseStruct(subs[key]).subs }
}

function createSubFromKey(key, subs) {
    if (key.endsWith('{}')) return createObjectSub(key, subs)
    if (key.endsWith('[]')) return createArraySub(key, subs)
    if (typeof subs[key] === 'string') return createValueSub(key, subs)
    return createNestedObjectSub(key, subs)
}

function parseStruct(head) {
    const layer = []
    const subs = {}
    const json = []
    for (const col in head) processHeaderColumn(col, head, layer, subs, json)
    const struct = { type: 'object', subs: [], json }
    for (const key of layer) {
        if (key.startsWith('$')) struct.key = `#${subs[key]}`
        const sub = createSubFromKey(key, subs)
        struct.subs.push(sub)
    }
    return struct
}

function formatRow({ type, key, source, subs }, row, original, json) {
    if (('' + row[0]).startsWith('#')) return null
    if (key?.startsWith('#')) key = row[key.substr(1)]
    switch (type) {
        case 'value':
            return formatValue(key, source, row[source], json)
        case 'array':
            return formatArray(key, subs, row, original, json)
        case 'object':
            return formatObject(key, subs, row, original, json)
    }
}

function formatValue(key, source, value, json) {
    if (value == null) return null
    if (json.includes(source)) value = load(value)
    return { key, value }
}

function formatArray(key, subs, row, original, json) {
    const arr = original?.[key] || []
    for (const sub of subs) {
        const data = formatRow(sub, row, arr, json)
        if (data) arr.push(data.value)
    }
    return arr.length ? { key, value: arr } : null
}

function formatObject(key, subs, row, original, json) {
    const obj = original?.[key] || {}
    let hasData = false
    for (const sub of subs) {
        const data = formatRow(sub, row, obj, json)
        if (data) {
            hasData = true
            obj[data.key] = data.value
        }
    }
    return hasData ? { key, value: obj } : null
}

function formatSheet(struct, rawSheet, json) {
    let data
    if (struct.key == void 0) {
        data = []
        for (const row of rawSheet) {
            const temp = formatRow(struct, row, null, json)
            if (temp) data.push(temp.value)
        }
    } else {
        data = {}
        for (const row of rawSheet) {
            const temp = formatRow(struct, row, data, json)
            if (temp) data[temp.key] = temp.value
        }
    }

    return data
}

export function parser(rawSheet) {
    const struct = parseStruct(rawSheet.shift())
    rawSheet.shift()
    return formatSheet(struct, rawSheet, struct.json)
}
