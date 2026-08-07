import { read, utils } from 'xlsx'

export async function prepare(xlsxPath) {
    const ext = xlsxPath.substring(xlsxPath.lastIndexOf('.')).toLowerCase()
    switch (ext) {
        case '.xls':
        case '.xlsx':
            break
        default:
            return []
    }
    const xlsxFileBuffer = await Bun.file(xlsxPath).arrayBuffer()
    const xlsx = read(xlsxFileBuffer, { type: 'buffer' })
    const datas = []
    for (const name in xlsx.Sheets) {
        const sheetRawData = xlsx.Sheets[name]
        if (!sheetRawData['!ref']) continue
        const data = utils.sheet_to_json(sheetRawData, {
            header: 1,
            defval: null,
        })
        datas.push({ name, data })
    }
    return datas
}
