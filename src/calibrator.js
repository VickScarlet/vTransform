import fs from 'node:fs'
import path from 'node:path'
import { generate } from 'ts-to-zod'

export async function calibrateTsData(data, name, types, pk) {
    // 如果没配对应的 .types.ts 文件，直接退回原始数据，类型签名为 any[]
    if (!types || !fs.existsSync(types)) {
        console.warn(
            `⚠️ 提示: 在 Excel 同级目录下未找到 [${name}.types.ts]，将退回普通无类型导出。`,
        )
        const isArray = Array.isArray(data)
        const extra = {
            typeSign: isArray ? 'any[]' : 'Map<any, any>',
            types: isArray ? `export type ${name.toUpperCase()} = any;` : '',
            isNativeMap: !isArray, // 👈 即使降级也需要同步对齐是否为 Map 的标记
        }
        return { data, extra }
    }

    console.info(
        `🔍 [vTransform TS] 成功在 Excel 目录定位规范，正在校准 [${name}]...`,
    )
    const sourceText = fs.readFileSync(types, 'utf-8')
    const options = { keepOptionalProperties: true }
    const zod = generate({ sourceText, options })
    const zodRawCode = zod
        .getZodSchemasFile()
        .replace(/z\.boolean\(\)/g, 'z.coerce.boolean()')
    const base64Code = Buffer.from(zodRawCode).toString('base64')
    const zodModule = await import(`data:text/javascript;base64,${base64Code}`)
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
    }
    // 2. Map 模式验证
    else if (typeof data === 'object' && data !== null) {
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
        // ========================================================
        // 🌟 终极修复：利用 Zod 原生验证自适应看穿 readonly 伪装
        // ========================================================
        let keyType = 'string'
        if (pk && RowZodValidator.shape && RowZodValidator.shape[pk]) {
            const validator = RowZodValidator.shape[pk]

            // 💡 核心黑科技：直接用 1（数字）和 "1"（字符串）去该字段的校验器里试探！
            // 无论它套了多少层 readonly() 还是可选约束，只要它不接受数字 1 校验，就说明它不是 number
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

    // 🌟 核心修改 2：在返回的 extra 元数据层，加上 isNativeMap 的明确布尔标记。
    // 这可以让下游的 dump.js 接收到它后，通过简单的一行流判断，决定是将 cleanData 渲染为普通 JSON，还是渲染为强大的 new Map(...)
    const extra = {
        typeSign,
        types: sourceText,
        isNativeMap: !Array.isArray(data), // 如果上游合并出来的不是数组（即Map模式），标记为 true
    }

    return { data: cleanData, extra }
}

/**
 * 统一的美化报错打印
 */
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
