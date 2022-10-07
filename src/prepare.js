import path from 'path';
import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';

export async function prepare(xlsxPath) {
    switch(path.extname(xlsxPath)) {
        case '.xls':
        case '.xlsx':
            break;
        default:
            return [];
    }
    const xlsxFileBuffer = await readFile(xlsxPath);
    const xlsx = XLSX.read(xlsxFileBuffer, {type: 'buffer'});
    const sheets = xlsx.Sheets;
    const data = [];
    for(const sheetName in sheets) {
        const sheetRawData = sheets[sheetName];
        if(!sheetRawData['!ref']) break;
        data.push({
            name: sheetName,
            data: XLSX.utils.sheet_to_json(sheetRawData, { header: 1 })
        });
    }
    return data;
}