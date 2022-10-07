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
            sheet = path.resolve(dir, sheet);
            if(!m.has(sheet))
                m.set(sheet, new JobData());
            m.get(sheet).append(parser(data));
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
        const data = this.#data;
        let result;
        if(Array.isArray(data[0])) {
            result = [];
            for(const subs of data)
                result.push(...Object.values(subs));
        } else {
            result = {};
            for(const subs of data)
                Object.assign(result, subs);
        }
        return result;
    }
}