import { readFile, writeFile, stat, readdir } from 'fs/promises';
import * as XLSX from 'xlsx';
import { join, extname, dirname, resolve } from 'path';
import yaml from 'js-yaml';

function stringify(data, space) {
    return JSON.stringify(data, null, space);
}

function cjs(data, space) {
    return `module.exports = ${stringify(data, space)}`;
}

function esm(data, space) {
    return `export default ${stringify(data, space)}`;
}

function yamlify(data, space) {
    return yaml.dump(data, {
        indent: space || undefined,
    });
}

export async function read(xlsxPath) {
    const xlsxFileBuffer = await readFile(xlsxPath);
    const xlsx = XLSX.read(xlsxFileBuffer, {type: 'buffer'});
    const sheets = xlsx.Sheets;
    const data = {};
    for(const sheetName in sheets) {
        const sheetRawData = sheets[sheetName];
        if(!sheetRawData['!ref']) break;
        data[sheetName] = XLSX.utils.sheet_to_json(sheetRawData, { header: 1 });
    }
    return data;
}

export function getWrite(type, space) {
    let format, extname;
    switch(type) {
        case 'commonjs':
        case 'cjs':
            extname = '.cjs';
            format = cjs; break;
        case 'javascript':
        case 'js':
            extname = '.js';
            format = esm; break;
        case 'esm':
        case 'mjs':
            extname = '.mjs';
            format = esm; break;
        case 'yml':
        case 'yaml':
            extname = '.yaml';
            format = yamlify; break;
        case 'json':
        default:
            extname = '.json';
            format = stringify; break;
    }
    return (data, target, basename) => writeFile(
        join(target, `${basename}${extname}`),
        format(data, Number(space)||0)
    );
}

async function walk(filePath) {
    const xlsxPaths = [];
    if(Array.isArray(filePath)) {
        for(const subPath of filePath)
            xlsxPaths.push(await walk(subPath));
        return xlsxPaths.flat();
    }
    const fileStat = await stat(filePath);
    if(!fileStat.isDirectory()) {
        const ext = extname(filePath);
        if( ext=='.xls' || ext=='.xlsx' ) xlsxPaths.push(filePath);
        return xlsxPaths;
    }

    const dirData = await readdir(filePath);
    for(const subPath of dirData)
        xlsxPaths.push(await walk(join(filePath, subPath)));
    return xlsxPaths.flat();
}

async function req(config) {
    const { configurations } = JSON.parse(await readFile(config));
    const jobs = [];
    const dir = dirname(config);
    for(const { source, target } of configurations) {
        const job = {};
        if(Array.isArray(source)) {
            job.source = [];
            for(const p of source)
                job.source.push(await walk(resolve(dir, p)))
            job.source = job.source.flat();
        } else {
            job.source = await walk(resolve(dir, source));
        }
        job.target = resolve(dir, target);
        jobs.push(job);
    }
    return jobs;
}

export async function jobs(configs) {
    const list = [];
    const files = [];
    for(const config of configs) {
        switch(extname(config)) {
            case '.json':
                const jobs = await req(config);
                if(jobs) list.push(jobs);
                break;
            default:
                files.push(config);
                break;
        }
    }
    if(files.length > 0) {
        const source = await walk(files);
        const target = dirname(source[0]);
        list.push({ source, target });
    }
    return list.flat();
}