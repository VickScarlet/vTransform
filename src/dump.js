import yaml from 'js-yaml';
import path from 'path';
import { writeFile, stat, mkdir } from 'fs/promises';

function jsonify(data, space) {
    return JSON.stringify(data, null, space);
}

function cjsify(data, space) {
    return `module.exports = ${jsonify(data, space)}`;
}

function esmify(data, space) {
    return `export default ${jsonify(data, space)}`;
}

function yamlify(data, space) {
    return yaml.dump(data, {
        indent: space || undefined,
    });
}

async function mkdirs(dir) {
    try {
        await stat(dir);
    } catch(e) {
        await mkdirs(path.dirname(dir));
        mkdir(dir);
    }
};

async function write(sheet, data) {
    console.info(`Dump ${sheet}`);
    await mkdirs(path.dirname(sheet));
    await writeFile(sheet, data);
}

export async function dump(sheet, data, type, space) {
    let ext, ify;
    switch(type) {
        case 'cjs':
            ext = '.js';
            ify = cjsify;
            break;
        case 'js':
        case 'mjs':
        case 'esm':
            ext = '.js';
            ify = esmify;
            break;
        case 'yaml':
        case 'yml':
            ext = '.yaml';
            ify = yamlify;
            break;
        case 'json':
        default:
            ext = '.json';
            ify = jsonify;
            break;
    }
    return write(`${sheet}${ext}`, ify(data, space));
}