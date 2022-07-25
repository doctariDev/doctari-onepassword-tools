#!/usr/bin/env node

const fs = require('fs');
const child_process = require("child_process");

function op(args, input) {
    const config = input
        ? { stdio: 'pipe', input: Buffer.from(input) }
        : { stdio: ['inherit', 'pipe', 'pipe'] };

    const {status, error, stdout, stderr} = child_process.spawnSync( "op", args, config);

    if (error) {
        throw error;
    }

    if (stderr && stderr.length) {
        throw new Error(stderr.toString('utf-8'));
    }

    if (status !== 0) {
        throw new Error(`command exited with status ${status}`);
    }

    return stdout.toString('utf-8');
}

function envSubstitution(input) {
    for (const [key, value] of Object.entries(process.env)) {
        const regex = new RegExp(`\\$${key}`, 'g');
        input = input.replace(regex, value);
    }

    return input;
}

async function main() {

    const token = process.env.OP_SESSION_TOKEN || op(['signin', '--raw']);

    const env = process.env.ENV;
    const allowedEnvs = ['dev', 'stage', 'prod'];
    if (!allowedEnvs.includes(env)) {
        throw new Error(`invalid environment ${env}, expecting ${allowedEnvs.join('|')}`);
    }

    const [input] = process.argv.slice(2);
    if (!input) {
        throw new Error('Usage: load-secrets <path-to-template>');
    }

    console.error(`Environment: ${env}`);
    console.error(`1password-cli version: ${op(['--version'])}`);
    console.error(`Input file: ${input}`);

    const template = JSON.parse(fs.readFileSync(input, {encoding: 'utf8'}));
    const processedLines = [];
    for (const [key, value] of Object.entries(template)) {
        if (typeof value === 'string') {
            processedLines.push(`${key}=${envSubstitution(value)}`);
            continue;
        }
        if (!value[env]) {
            throw new Error('Missing value for ${key}[${env}], please fix the template');
        }
        processedLines.push(`${key}=${value[env]}`);
    }

    const out = op(['inject', '--session', token], processedLines.join('\n'));
    console.log(out);
}

main().then(
    () => {
        console.error('Done')
    },
    (e) => {
        console.error(e.message);
        process.exit(1);
    }
);
