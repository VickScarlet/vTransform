import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { read, utils } from 'xlsx'

export async function prepare(xlsxPath) {
    switch (path.extname(xlsxPath)) {
        case '.xls':
        case '.xlsx':
            break
        default:
            return []
    }
    const xlsxFileBuffer = await readFile(xlsxPath)
    const xlsx = read(xlsxFileBuffer, { type: 'buffer' })
    const datas = []
    for (const name in xlsx.Sheets) {
        const sheetRawData = xlsx.Sheets[name]
        if (!sheetRawData['!ref']) break
        const data = utils.sheet_to_json(sheetRawData, { header: 1 })
        datas.push({ name, data })
    }
    return datas
}
