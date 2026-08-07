import { generate } from 'ts-to-zod'
import { z } from 'zod'
globalThis.__GLOBAL_ZOD__ = z

export async function calibrateTsData(raw, name, dts) {
    const targetFile = Bun.file(dts)
    if (!dts || !(await targetFile.exists())) {
        console.warn(`⚠️ [Calibrator] ${name}.types.ts`)
        return { raw, type: 'any', dts: '' }
    }

    console.info(`🔍 [Calibrator] ${name}.types.ts`)

    const sourceText = await targetFile.text()

    const options = {
        keepOptionalProperties: true,
        getSchemaName: identifier => `${identifier}Schema`,
    }
    const zod = generate({ sourceText, ...options })
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
    let zodRawCode = zod.getZodSchemasFile()

    globalThis.__RUNNER_CONFIG_MODULE__ = configModule
    zodRawCode = zodRawCode.replace(
        /import\s+\{([^}]+)\}\s+from\s+['"]undefined['"];?/g,
        (match, enumNamesStr) =>
            `const {${enumNamesStr}} = globalThis.__RUNNER_CONFIG_MODULE__;`,
    )

    zodRawCode = zodRawCode.replace(
        /import\s+\{\s*z\s*\}\s+from\s+['"]zod['"];?/g,
        'const z = globalThis.__GLOBAL_ZOD__;',
    )
    zodRawCode = zodRawCode.replace(
        /z\.string\(\)/g,
        `z.preprocess(globalThis.__MERGED_TRANSFORMERS__.string, z.string())`,
    )
    zodRawCode = zodRawCode.replace(
        /z\.boolean\(\)/g,
        `z.preprocess(globalThis.__MERGED_TRANSFORMERS__.boolean, z.boolean())`,
    )

    globalThis.__MERGED_TRANSFORMERS__ = mergedTransformers
    const base64Code = Buffer.from(zodRawCode).toString('base64')
    const zodModule = await import(`data:text/javascript;base64,${base64Code}`)

    const search = `${name.replace(/[-_]/g, '')}Schema`.toLocaleLowerCase()
    const targetSchemaName = Object.keys(zodModule).find(key => {
        if (key.toLocaleLowerCase() === search) {
            console.info(`🎯 [Calibrator] ${name} -> ${key}`)
            return true
        }
    })
    const RowZodValidator = zodModule[targetSchemaName]
    if (!RowZodValidator) {
        delete globalThis.__MERGED_TRANSFORMERS__
        delete globalThis.__RUNNER_CONFIG_MODULE__
        throw new Error(`❌ [Calibrator] ${targetSchemaName} Missmatch`)
    }
    const typeName = targetSchemaName.replace(/Schema$/, '')
    dts = sourceText.split(/.*@vt-types-end.*/i)[0]
    const data = { raw, dts, type: typeName }
    Object.keys(customTransformers).forEach(fieldKey => {
        if (fieldKey === 'string' || fieldKey === 'boolean') return
        if (RowZodValidator.shape && RowZodValidator.shape[fieldKey]) {
            const originalValidator = RowZodValidator.shape[fieldKey]
            RowZodValidator.shape[fieldKey] = z.preprocess(
                customTransformers[fieldKey],
                originalValidator,
            )
            mergedTransformers[fieldKey] = customTransformers[fieldKey]
        }
    })

    globalThis.__MERGED_TRANSFORMERS__ = mergedTransformers
    if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
            const parseResult = RowZodValidator.safeParse(raw[i])
            if (!parseResult.success) {
                delete globalThis.__MERGED_TRANSFORMERS__
                delete globalThis.__RUNNER_CONFIG_MODULE__
                printZodError(name, i, parseResult.error.issues, raw[i])
            }
            raw[i] = parseResult.data
        }
        console.info(`✅ [Calibrator] array`)
    } else if (typeof raw === 'object' && raw !== null) {
        for (const key in raw) {
            const parseResult = RowZodValidator.safeParse(raw[key])
            if (!parseResult.success) {
                delete globalThis.__MERGED_TRANSFORMERS__
                delete globalThis.__RUNNER_CONFIG_MODULE__
                printZodError(name, key, parseResult.error.issues, raw[key])
            }
            raw[key] = parseResult.data
        }
        console.info(`✅ [Calibrator] object`)
    }

    delete globalThis.__MERGED_TRANSFORMERS__
    delete globalThis.__RUNNER_CONFIG_MODULE__
    return data
}

function printZodError(sheetName, key, issues, rawRowData) {
    console.error(`❌ [Calibrator] ${sheetName}\x1b[33m[${key}]\x1b[0m`)
    issues.forEach(err => {
        const wrongField = err.path.join('.') || 'root'
        console.error(
            `  - \x1b[33m${wrongField}\x1b[0m:`,
            rawRowData[wrongField],
        )
        console.error(`  - ${err.message}`)
    })
    process.exit(1)
}
