import path from 'path';
import { load } from './loader.js';
import { prepare } from './prepare.js';
import { parser } from './parser.js';
import { dump } from './dump.js';

export async function transform(options) {
    const now = Date.now();
    const configurations = await load(options);
    for(const config of configurations)
        await task(config);
    console.info(`Transformed in ${Date.now() - now}ms`);
}

async function task({files, dest, cwd, type, space}) {
    console.info('Transform task config:', {files, dest, cwd, type, space});
    const m = new Map();
    for(const file of files) {
        const dir = path.resolve(dest, path.dirname(file));
        for(const {name, data} of (await prepare(path.resolve(cwd, file)))) {
            if(name[0] === "#") continue;
            let sheet = name.split('#')[0];
            sheet = sheet.replace('<arr>', '');
            if(sheet[0] === '>') sheet = sheet.substring(1);
            const keys = sheet.split('.');
            sheet = path.resolve(dir, keys.shift());
            if(!m.has(sheet))
                m.set(sheet, new JobData());
            m.get(sheet).append({
                keys, data: parser(data)
            });
        }
    }
    for(const [sheet, data] of m)
        await dump(sheet, data.result(), type, space);
}

class JobData {
    constructor(data) {
        if(data) this.append(data);
    }

    #data = [];

    append(data) {
        this.#data.push(data);
    }

    result() {
        if(!this.#data.length) return {};
        const d = this.#data;
        let result;
        if(Array.isArray(d[0].data)) {
            result = [];
            for(const {data} of d)
                result.push(...Object.values(data));
        } else {
            result = {};
            for(const {keys, data} of d) {
                if(!keys.length) {
                    Object.assign(result, data);
                    continue;
                }
                let r = result;
                for(const key of keys) {
                    if(!r[key]) r[key] = {};
                    r = r[key];
                }
                Object.assign(r, data);
            }
        }
        return result;
    }
}