import { readXLSX, writeJSON, jobs as getJobs } from './io.js';
import { jobs as doJobs } from './transform/index.js';

async function main() {
    await doJobs(
        await getJobs(
            process
                .argv
                .slice(2)
        ),
        readXLSX,
        writeJSON,
    );
}

main();