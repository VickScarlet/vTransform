import fs from 'node:fs'
import path from 'node:path'
import { generate } from 'ts-to-zod'

export async function calibrateTsData(data, name, types, pk) {
    if (!types || !fs.existsSync(types)) {
        console.warn(
            `⚠️ 提示: 在 Excel 同级目录下未找到 [${name}.types.ts]，将退回普通无类型导出。`,
        )
        const isArray = Array.isArray(data)
        const extra = {
            typeSign: isArray ? 'any[]' : 'Map<any, any>',
            types: isArray ? `export type ${name.toUpperCase()} = any;` : '',
            isNativeMap: !isArray,
        }
        return { data, extra }
    }

    console.info(
        `🔍 [vTransform TS] 成功在 Excel 目录定位规范，正在校准 [${name}]...`,
    )
    const sourceText = fs.readFileSync(types, 'utf-8')
    const options = { keepOptionalProperties: true }
    const zod = generate({ sourceText, options })
    const tsFileBase64 = Buffer.from(sourceText).toString('base64')
    const configModule = await import(
        `data:text/javascript;base64,${tsFileBase64}`
    )
    const customTransformers = configModule.transformers || {}
    const mergedTransformers = {
        string: val => {
            if (val === null || val === undefined) return val
            return String(val)
        },
        boolean: val => {
            if (val === null || val === undefined) return val
            const strVal = String(val).toLowerCase().trim()
            if (strVal === 'true' || val === true || val === 1) return true
            if (strVal === 'false' || val === false || val === 0) return false
            return Boolean(val)
        },
    }
    const localZodPath = require.resolve('zod').replace(/\\/g, '/')
    let zodRawCode = zod.getZodSchemasFile()
    zodRawCode = zodRawCode.replace(
        /from\s+['"]zod['"]/g,
        `from "${localZodPath}"`,
    )
    zodRawCode = zodRawCode.replace(
        /z\.string\(\)/g,
        `z.preprocess(globalThis.__MERGED_TRANSFORMERS__.string, z.string())`,
    )
    zodRawCode = zodRawCode.replace(
        /z\.boolean\(\)/g,
        `z.preprocess(globalThis.__MERGED_TRANSFORMERS__.boolean, z.boolean())`,
    )
    Object.keys(customTransformers).forEach(fieldKey => {
        if (fieldKey === 'string' || fieldKey === 'boolean') return

        const targetRegex = new RegExp(
            `(${fieldKey}:\\s*)(z\\.[a-zA-Z_0-9]+(?:\\([^)]*\\))?)`,
            'g',
        )
        zodRawCode = zodRawCode.replace(
            targetRegex,
            (m, prefix, originalZodType) => {
                mergedTransformers[fieldKey] = customTransformers[fieldKey]
                return `${prefix}z.preprocess(globalThis.__MERGED_TRANSFORMERS__.${fieldKey}, ${originalZodType})`
            },
        )
    })

    globalThis.__MERGED_TRANSFORMERS__ = mergedTransformers
    const base64Code = Buffer.from(zodRawCode).toString('base64')
    const zodModule = await import(`data:text/javascript;base64,${base64Code}`)
    delete globalThis.__MERGED_TRANSFORMERS__
    const targetSchemaName = `${name}Schema`
    const RowZodValidator = zodModule[targetSchemaName]

    if (!RowZodValidator) {
        throw new Error(
            `无法从类型文件中自动推导出名为 ${targetSchemaName} 的主校验器。`,
        )
    }

    let cleanData
    let typeSign = ''
    const typeName = name.charAt(0).toUpperCase() + name.slice(1)

    if (Array.isArray(data)) {
        cleanData = []
        typeSign = `${typeName}[]`
        for (let i = 0; i < data.length; i++) {
            const parseResult = RowZodValidator.safeParse(data[i])
            if (!parseResult.success) {
                printZodError(
                    name,
                    `第 ${i + 1} 条数据`,
                    parseResult.error.issues,
                    data[i],
                )
            }
            cleanData.push(parseResult.data)
        }
        console.info(`📦 [Array 模式] 完美对齐数组规范`)
    } else if (typeof data === 'object' && data !== null) {
        const tempCleanMap = {}
        for (const key in data) {
            const parseResult = RowZodValidator.safeParse(data[key])
            if (!parseResult.success) {
                printZodError(
                    name,
                    `Key 为 [${key}] 的数据`,
                    parseResult.error.issues,
                    data[key],
                )
            }
            tempCleanMap[key] = parseResult.data
        }
        let keyType = 'string'
        if (pk && RowZodValidator.shape && RowZodValidator.shape[pk]) {
            const validator = RowZodValidator.shape[pk]
            if (
                validator.safeParse(1).success &&
                !validator.safeParse('1').success
            ) {
                keyType = 'number'
            }
        }

        const isNumKey = keyType === 'number'
        cleanData = Object.entries(tempCleanMap).map(([k, v]) => [
            isNumKey ? Number(k) : k,
            v,
        ])
        typeSign = `Map<${keyType}, ${typeName}>`
        console.info(
            `🎯 [Map 模式] 完美对齐原生 Map 规范，主键 [${pk}] 自动识别为: ${keyType}`,
        )
    }

    const extra = {
        typeSign,
        types: sourceText,
        isNativeMap: !Array.isArray(data),
    }
    return { data: cleanData, extra }
}

function printZodError(sheetName, positionLabel, issues, rawRowData) {
    console.error(`\n❌ [vTransform 数据校准失败]`)
    console.error(
        `👉 发生位置: 表格 [${sheetName}] ${positionLabel}不兼容你的 TS 类型限制！`,
    )
    console.error(`👉 冲突细节详情:`)
    issues.forEach(err => {
        const wrongField = err.path.join('.') || '根节点'
        console.error(`  - 错误字段: \x1b[33m${wrongField}\x1b[0m`)
        console.error(`  - 期待类型/约束: ${err.message}`)
        console.error(
            `  - 当前收到的脏数据值:`,
            rawRowData[wrongField] ?? '缺失字段',
        )
        console.error(`  -----------------------------------------`)
    })
    process.exit(1)
}
