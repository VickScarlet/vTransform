import { parser } from './parser.js';
import { merge } from './merge.js';

export async function jobs(jobs, r, w) {
    for(const { source, target } of jobs)
        await job(source, target, r, w);
}

export async function job(source, target, r, w) {
    const merges = {};
    for(const xlsxPath of source) {
        const rawData = await r(xlsxPath);
        const { merge: mergeData, write } = transform(rawData);
        if(write) {
            for(const sheetName in write) {
                w(write[sheetName], target, sheetName);
            }
        }

        if(mergeData) {
            for(const sheetName in mergeData) {
                const [a, b] = sheetName.split('.');
                if(b) {
                    const data = {[b]: mergeData[sheetName]}
                    if(!merges[a]) {
                        merges[a] = [ data ];
                    } else {
                        merges[a].push(data);
                    }
                    continue;
                }
                if(!merges[sheetName]) {
                    merges[sheetName] = [ mergeData[sheetName] ];
                } else {
                    merges[sheetName].push(mergeData[sheetName]);
                }
            }

        }
    }

    for(const sheetName in merges) {
        const data = merge(merges[sheetName]);
        w(data, target, sheetName);
    }
}

export function transform(rawSheetsData) {
    const merge = {};
    const write = {};
    for(const rawSheetName in rawSheetsData) {
        const rawData = rawSheetsData[rawSheetName];
        if(rawSheetName[0] === "#") continue;
        let sheetName = rawSheetName;
        const isArray = rawSheetName.substring(
            rawSheetName.length - 5,
            rawSheetName.length
        ) === "<arr>";
        if(isArray) sheetName = sheetName.substring(0, sheetName.length - 5);
        const isMerge = rawSheetName[0] === ">";
        if(isMerge) sheetName = sheetName.substring(1);
        const data = parser(rawData, isArray);
        if(isMerge) merge[sheetName] = data;
        else write[sheetName] = data;
    }
    return { merge, write };
}