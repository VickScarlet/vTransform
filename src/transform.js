import path from 'path';
import { load } from './loader.js';
import { prepare } from './prepare.js';
import { parser } from './parser.js';
import { dump } from './dump.js';

export async function transform(options) {
    const now = Date.now();
    const configurations = await load(options);
    for (const config of configurations)
        await task(config);
    console.info(`Transformed in ${Date.now() - now}ms`);
}

async function task({ files, dest, cwd, type, space, addition }) {
    console.info('Transform task config:', { files, dest, cwd, type, space });
    const m = new Map();
    for (const file of files) {
        const dir = path.resolve(dest, path.dirname(file));
        for (const { name, data } of (await prepare(path.resolve(cwd, file)))) {
            if (name[0] === "#") continue;
            let sheet = name.split('#')[0];
            sheet = sheet.replace('<arr>', '');
            if (sheet[0] === '>') sheet = sheet.substring(1);
            const keys = sheet.split('.');
            sheet = path.resolve(dir, keys.shift());
            if (!m.has(sheet))
                m.set(sheet, new JobData());
            m.get(sheet).append({
                keys, data: parser(data)
            });
        }
    }
    for (const [sheet, job] of m) {
        const data = job.result();
        if (addition)
            await dump(sheet, { data, ...addition }, type, space);
        else
            await dump(sheet, data, type, space);
    }
}

class JobData {
    constructor(data) {
        if (data) this.append(data);
    }

    #data = [];

    append(data) {
        this.#data.push(data);
    }

    result() {
        if (!this.#data.length) return {};
        let result;
        for (const { keys, data } of this.#data) {
            if (!keys.length) {
                result = this.#combine(result, data);
                continue;
            }
            if (!result) result = {};
            let r = result;
            let last = keys.pop();
            for (const key of keys) {
                if (!r[key]) r[key] = {};
                r = r[key];
            }
            r[last] = this.#combine(r[last], data);
        }
        return result;
    }

    #combine(a, b) {
        if (a == null) return b;
        if (b == null) return a;
        if (Array.isArray(a) && Array.isArray(b)) {
            if (Array.isArray(b)) return a.concat(b);
            a.push(b);
            return a;
        }
        if (Array.isArray(a))
            return this.#combine(a, Object.values(b));
        if (Array.isArray(b))
            return this.#combine(Object.values(a), b);
        const result = {};
        for (const key in a) result[key] = this.#combine(a[key], b[key]);
        for (const key in b) if (!result[key]) result[key] = b[key];
        return result;
    }
}