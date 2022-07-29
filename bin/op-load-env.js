#!/usr/bin/env node

const fs = require('fs');
const child_process = require("child_process");
const path = require("path");

const SKIPPED_DIRS = ['node_modules'];
const TEMPLATE_NAME = '.env.template.json'
const KEYWORDS = ['_refs'];
const ALLOWED_STAGES = ["dev", "staging", "production"];

function runningInGithub() {
    return process.env.GITHUB_ACTIONS === "true";
}

function printingEnabled() {
    return process.env.OP_PRINT_ENVIRONMENT === "true";
}

function op(args, input, environment = null) {
    const config = input
        ? { stdio: 'pipe', input: Buffer.from(input) }
        : { stdio: ['inherit', 'pipe', 'pipe'] };

    if (environment) {
        config.env = environment;
    }

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
        console.warn(`[warn] No templates found in folder ${folder}, make sure to name them ${TEMPLATE_NAME}`);
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

    if (/[~`#$&*()\\|\[\]{};'<>/?!" ]/.test(escaped) || escaped !== value) {
        return `"${escaped.replace(/"/g, '\\"')}"`;
    }

    return value;
}


function getEnvContent(inputPath, env, alreadyProcessed = []) {
    if (alreadyProcessed.includes(inputPath)) {
        throw new Error(`Cyclic dependency detected:\n${inputPath}\n${alreadyProcessed.map((v) => `^ ${v}`).join('\n')}`);
    }

    const template = JSON.parse(fs.readFileSync(inputPath, {encoding: 'utf8'}));
    let result = {};

    if (Array.isArray(template['_refs'])) {
        for (const ref of template['_refs']) {
            const refPath = path.resolve(path.dirname(inputPath), ref);
            result = {
                ...result,
                ...getEnvContent(refPath, env, [inputPath, ...alreadyProcessed]),
            };
        }
    }

    for (const [key, value] of Object.entries(template)) {
        if (KEYWORDS.includes(key)) {
            continue;
        }
        if (typeof value === 'string') {
            result[key] = envSubstitution(value);
            continue;
        }
        if (!value[env]) {
            throw new Error('Missing value for ${key}[${env}], please fix the template');
        }
        result[key] = envSubstitution(value[env]);
    }

    return result;
}

function envExporter(prefix) {
    const vars = Object.entries(process.env)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ([k.slice(prefix.length), v]))
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
    console.log(JSON.stringify(vars, null, '\t'))
}

function getPrefixedEnvironment(obj, prefix) {
    return Object.entries(obj)
        .filter(([_, v]) => String(v).indexOf('op://') >= 0)
        .reduce((acc, [k, v]) => {
            acc[`${prefix}${k}`] = v;
            return acc;
        }, {...process.env})
}

function customMasking(value) {
    value = String(value);
    if (value.length < 5) {
        return '***';
    }
    const chars = (value.length > 12) ? 3: 2;
    return [
        value.slice(0, chars),
        "*".repeat(Math.min(15, value.length - 2 * chars)),
        value.slice(-chars),
    ].join('');
}

function printEnv(content, secrets) {
    if (!printingEnabled()) return;

    const entries = Object.entries({...content, ...secrets});
    entries.sort((a, b) => (a[0] === b[0]) ? 0 : (a[0] < b[0] ? -1 : 1));

    runningInGithub()
        ? console.log("::group::Generated .env file")
        : console.log("[info] Generated .env file\n-");

    for (const [k, v] of entries) {
        const value = secrets.hasOwnProperty(k)
            ? customMasking(v)
            : v;
        console.log(`${k} = ${value}`)
    }

    runningInGithub()
        ? console.log("::endgroup::")
        : console.log("-");
}

async function processTemplate(inputPath, env, token) {
    console.log(`[info] Processing template at ${inputPath} (${env})`);

    const content = getEnvContent(inputPath, env);
    if (!Object.keys(content).length) {
        console.warn(`[warn] Empty template at ${inputPath}, skipping`);
        return '';
    }

    const prefix = 'OP_INJECT_'
    const processedValues = JSON.parse(op([
        'run', '--no-masking', '--session', token, '--',
        'node', '-e', `(${envExporter.toString()})('${prefix}');`
    ], null, getPrefixedEnvironment(content, prefix)));

    if (runningInGithub()) {
        for (const value of Object.values(processedValues)) {
            console.log(`::add-mask::${value}`);
        }
    }

    const output = [];
    for (const [key, value] of Object.entries({ ...content, ...processedValues})) {
        output.push(`${key}=${escapeValue(value)}`)
    }

    output.sort((a, b) => (a === b) ? 0 : (a < b ? -1 : 1));

    printEnv(content, processedValues);
    return output.join('\n');
}

async function main() {
    const env = process.env.STAGE;
    if (!env) {
        throw new Error('[error] no stage set, use export STAGE=<stage>');
    }
    if (!ALLOWED_STAGES.includes(env)) {
        throw new Error(`[error] STAGE must be one of ${ALLOWED_STAGES.join('|')}`)
    }

    const [folder] = process.argv.slice(2);
    if (!folder) {
        throw new Error('Usage: load-secrets <path-to-template>');
    }

    console.log(`[info] op-cli version: ${op(['--version']).trim()}`);
    const token = process.env.OP_SESSION_TOKEN || op(['signin', '--raw']);

    await loadEnvironment(folder, env, token);
}

main().then(
    () => {
        console.error('[info] Done')
    },
    (e) => {
        console.error(`[error] ${e.message}`);
        process.exit(1);
    }
);
