import { join } from 'path';
import { parser } from './parser.js';
import { merge } from './merge.js';

async function jobs(jobs, r, w) {
    for(const { source, target } of jobs)
        await job(source, target, r, w);
}

async function job(source, target, r, w) {
    const merges = {};
    for(const xlsxPath of source) {
        const rawData = await r(xlsxPath);
        const { merge: mergeData, write } = transform(rawData);
        if(write) {
            for(const sheetName in write) {
                const savePath = join(target, `${sheetName}.json`);
                w(write[sheetName], savePath);
            }
        }

        if(mergeData) {
            for(const sheetName in mergeData) {
                if(!merges[sheetName]) {
                    merges[sheetName] = [ mergeData[sheetName] ];
                } else {
                    merges[sheetName].push(mergeData[sheetName]);
                }
            }

        }
    }

    for(const sheetName in merges) {
        const savePath = join(target, `${sheetName}.json`);
        const data = merge(merges[sheetName]);
        w(data, savePath);
    }
}

function transform(rawSheetsData) {
    const merge = {};
    const write = {};
    for(const rawSheetName in rawSheetsData) {
        const rawData = rawSheetsData[rawSheetName];
        if(rawSheetName[0] === "#") continue;
        let sheetName = rawSheetName;
        const isArray = rawSheetName.substr(-5) === "<arr>";
        if(isArray) sheetName = sheetName.substring(0, sheetName.length - 5);
        const isMerge = rawSheetName[0] === ">";
        if(isMerge) sheetName = sheetName.substr(1);
        const data = parser(rawData, isArray);
        if(isMerge) merge[sheetName] = data;
        else write[sheetName] = data;
    }
    return { merge, write };
}

export { jobs, job, transform };