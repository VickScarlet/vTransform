import yaml from 'js-yaml';

function parseStruct(head) {
    const layer = [];
    const subs = {};
    const json = [];

    for(const col in head) {
        let key = head[col].trim();
        if(key[0] == '#') continue;
        if(key[0] == '@') {
            json.push(col);
            key = key.substr(1);
        }
        let [first, ...last] = key.split(/[\.:]/);
        first = first.trim();
        if(!subs[first]) {
            layer.push(first);
        }
        if(last.length > 0) {
            if(!subs[first]) subs[first] = {};
            subs[first][col] = last.join('.');
        } else {
            if(first.substr(-2) == '[]') {
                if(!subs[first]) subs[first] = [];
                subs[first].push(col);
            } else {
                subs[first] = col;
            }
        }

    }

    const struct = {
        type: 'object',
        subs: [],
        json
    };

    for(const key of layer) {
        if(key[0] == '$') {
            struct.key = `#${subs[key]}`;
        }
        switch(key.substr(-2)) {
            case '{}':
                struct.subs.push({
                    type: 'object',
                    key: key.substr(0, key.length -2),
                    subs: [ parseStruct(subs[key]) ]
                });
                break;
            case '[]':
                struct.subs.push({
                    type: 'array',
                    key: key.substr(0, key.length -2),
                    subs: Array.isArray(subs[key])
                        ? subs[key].map(col => ({
                            type: 'value',
                            source: col
                        }))
                        : [parseStruct(subs[key])]
                });
                break;
            default:
                struct.subs.push(
                    typeof subs[key] == 'string'
                        ? ({
                            type: 'value',
                            key: key[0] == '$'
                                ? key.substr(1)
                                : key,
                            source: subs[key]
                        })
                        : {
                            key,
                            type: 'object',
                            subs: parseStruct(subs[key]).subs
                        }
                );
        }
    }

    return struct;
}

function formatRow({type, key, source, subs}, row, original, json) {
    if(row[0] == '#' || (''+row[0])[0] == '#') return null;
    if(key && key[0] == '#') key = row[key.substr(1)];
    switch(type) {
        case 'value':
            const value = row[source];
            if(value != void 0) {
                try {
                    return {
                        key,
                        value: json.includes(source)
                            ? yaml.load(value)
                            : value
                    };
                } catch(e) {
                    return null;
                }
            }
            return null;
        case 'array':
            const arr = original?.[key] || [];
            for(const sub of subs) {
                const data = formatRow(sub, row, arr, json);
                if(data) {
                    arr.push(data.value);
                }
            }
            if(arr.length) {
                return { key, value: arr };
            }
            return null;
        case 'object':
            const obj = original?.[key] || {};
            let r = false;
            for(const sub of subs) {
                const data = formatRow(sub, row, obj, json);
                if(data) {
                    r = true;
                    obj[data.key] = data.value;
                }
            }
            if(r) {
                return { key, value: obj };
            }
            return null;
    }
}

function formatSheet(struct, rawSheet, json) {
    let data;
    if(struct.key == void 0) {
        data = [];
        for(const row of rawSheet) {
            const temp = formatRow(struct, row, null, json);
            if(temp) data.push(temp.value);
        }
    } else {
        data = {};
        for(const row of rawSheet) {
            const temp = formatRow(struct, row, data, json);
            if(temp) data[temp.key] = temp.value;
        }
    }

    return data;
}

export function parser(rawSheet) {
    const struct = parseStruct(rawSheet.shift());
    rawSheet.shift();
    return formatSheet(struct, rawSheet, struct.json);
}