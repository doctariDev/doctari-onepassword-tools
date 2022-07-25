#!/usr/bin/env node

const fs = require('fs');
const child_process = require("child_process");
const path = require("path");

const SKIPPED_DIRS = ['node_modules'];
const TEMPLATE_NAME = 'env.template.json'
const KEYWORDS = ['_refs'];

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

function findTemplates(folder) {
    try {
        const results = [];
        const children = fs.readdirSync(folder, {withFileTypes: true})
        for (const child of children) {
            if (SKIPPED_DIRS.includes(child.name)) {
                continue;
            }
            if (child.isDirectory()) {
                results.push(...findTemplates(path.join(folder, child.name)));
            }
            if (child.name === TEMPLATE_NAME) {
                results.push(path.resolve(path.join(folder, child.name)));
            }
        }
        return results;
    }
    catch (e) {
        console.error(e.message);
        return [];
    }
}

async function loadEnvironment(folder, environment, token) {
    const templates = findTemplates(folder);

    if (!templates.length) {
        console.warn(`No templates found in folder ${folder}, make sure to name them env.template.json`);
        return;
    }

    for (const template of templates) {
        const env = await processTemplate(template, environment, token)
        const outputPath = path.join(
            path.dirname(template),
            '.env',
        );
        fs.writeFileSync(outputPath, env, { encoding: 'utf-8' });
    }
}

function escapeValue(value) {
    const escaped = value
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\r/g, "\\r");

    if (/[~`#$&*()\\|\[\]{};'<>/?! ]/.test(escaped) || escaped !== value) {
        return `"${escaped.replace(/"/g, value)}"`;
    }

    return value;
}


function getEnvContents(inputPath, env) {
    const template = JSON.parse(fs.readFileSync(inputPath, {encoding: 'utf8'}));
    const processedLines = [];
    for (const [key, value] of Object.entries(template)) {
        if (KEYWORDS.includes(key)) {
            continue;
        }
        if (typeof value === 'string') {
            processedLines.push(`${key}=${escapeValue(envSubstitution(value))}`);
            continue;
        }
        if (!value[env]) {
            throw new Error('Missing value for ${key}[${env}], please fix the template');
        }
        processedLines.push(`${key}=${value[env]}`);
    }

    if (Array.isArray(template['_refs'])) {
        for (const ref of template['_refs']) {
            const refPath = path.resolve(path.dirname(inputPath), ref);
            processedLines.push(...getEnvContents(refPath, env));
        }
    }

    processedLines.sort((a, b) => (a === b) ? 0 : (a < b ? -1 : 1));

    return processedLines;
}
async function processTemplate(inputPath, env, token) {
    console.log(`[info] Processing template at ${inputPath} (${env})`);
    const processedLines = getEnvContents(inputPath, env);
    const content = processedLines.join('\n').trim();
    if (!content.length) {
        console.warn(`[warn] Empty template at ${inputPath}, skipping`);
        return '';
    }
    return op(['inject', '--session', token], processedLines.join('\n'));
}

async function main() {
    const env = process.env.STAGE;
    if (!env) {
        throw new Error('no stage set, use export STAGE=<stage>');
    }

    const [folder] = process.argv.slice(2);
    if (!folder) {
        throw new Error('Usage: load-secrets <path-to-template>');
    }

    console.log(`[info] 1password-cli version: ${op(['--version']).trim()}`);
    const token = process.env.OP_SESSION_TOKEN || op(['signin', '--raw']);

    await loadEnvironment(folder, env, token);
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
