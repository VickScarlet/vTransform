import { readFile, writeFile, stat, readdir } from 'fs/promises';
import * as XLSX from 'xlsx';
import { join, extname, dirname, resolve } from 'path';


async function readXLSX(xlsxPath) {
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

async function writeJSON(data, savePath) {
    await writeFile(
        savePath,
        JSON.stringify(data, null, 4),
    )
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
            job.source.flat();
        } else {
            job.source = await walk(resolve(dir, source));
        }
        job.target = resolve(dir, target);
        jobs.push(job);
    }
    return jobs;
}

async function jobs(configs) {
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

export { readXLSX, writeJSON, jobs };