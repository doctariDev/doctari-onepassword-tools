# CLI Tools and Github Actions for 1password integrations

This repository defines a set of Github Actions and CLI tools
for seamless integration with [1password](https://1password.com/) (password manager)

## Prerequisites
- nodejs
- op-cli

For using the bundled `op-load-env` script, you will need to install and configure
`op-cli` (see [here](https://1password.com/downloads/command-line/)). For validating 
the instalation, please run 
```shell
op signin --raw
```
If you see the session token everything was configured properly.

## Env generator script (`op-load-env`)
You can use the provided `op-load-env` script to generate environment files from JSON
templates that reference 1password secrets.
### Installation
```shell
npm install @doctariDev/onepassword-tools
```
or, depending on your package manager:
```shell
yarn add @doctariDev/onepassword-tools
```
### Usage
```shell
STAGE=<dev|staging|production> op-load-env <folder>
```
When called, `op-load-env` will look inside `folder` and its subfolders for
files called `env.template.json`. For each template found, an `.env` file 
will be created in the same directory as the template. It will contain the
variables defined by the template, as well as the other template files it
references (see [Template structure](#template-structure))

### Arguments
- `<folder>` **(required)** - the path that will be searched for `env.template.json`
templates

### Environment variables
- `STAGE` **(required)** - name of the stage, can be either `dev`, `staging` or `production`
- `GITHUB_ACTIONS` (optional) - if this is set to `true`, secret values are masked with workflow commands
- `OP_PRINT_ENVIRONMENT` (optional) - if set to true, generated `.env` files will be printed to the console
- `OP_SESSION_TOKEN` (optional) - if set, the value will be sent to op-cli via the `--session` flag; otherwise, 
authentication will be handled by 1password CLI.

### Avoiding login on each invocation
If you hate to input your password every time you run `op-load-env`, you can use the `OP_SESSION_TOKEN`
to persist the session by running the following command:
```shell
export OP_SESSION_TOKEN=$(op signin --raw)
```

### Template structure
An environment template is actually just a JSON file in which 
- keys represent environment variable names
- values can be
  - strings - either plain values or references to 1password secrets
  - objects - where keys are stage names and values are strings as defined above

Special preprocessing instructions can be passed with reserved keys:
- `_refs` (optional) - array of paths to other templates that will be included in the result; 
environment variables from templates loaded with `_refs` can be overwritten by other templates in
`_refs`, as well as variable definitions from the current template. Refs are processed recursively.

Secrets from 1password can be referenced by the following syntax:
```
op://<vault>/<item>[/<section>]/<field>
```
More information about this topic can be found under
[Secret reference syntax](https://developer.1password.com/docs/cli/secrets-reference-syntax)
(1password CLI documentation).

It is also possible to use environment variables inside template values. They will
be interpolated inside values, but not variable names.

### Example - Stage selection and environment variable interpolations
```json
// folder/env.template.json
{
  "API_HOST": {
    "dev": "development.someservice.com",
    "staging": "stage.someservice.com",
    "production": "api.someservice.com"
  },
  "DEPLOYMENT_STAGE": "$STAGE",
  "MICROSERVICE_NAME": "$PREFIX-microservice-$STAGE"
}
```
When running `op-load-template`:
```shell
PREFIX=my STAGE=dev op-load-env folder
```
We will get:
```shell
API_HOST=development.someservice.com
DEPLOYMENT_STAGE=dev
MICROSERVICE_NAME=my-microservice-dev
```

### Example - Referenced templates
```json
// ./microservice/env.template.json
{
  "API_KEY": "microservice-api-key",
  "MICROSERVICE_VAR": "microservice",
  "_refs": [
    "../global.template.json"
  ]
}

// ./global.template.json
{
  "API_KEY": "global-api-key",
  "GLOBAl_VAR": "global"
}
```
When running `op-load-template`:
```shell
STAGE=dev op-load-env folder
```
We will get:
```shell
API_KEY=microservice-api-key
GLOBAl_VAR=global
MICROSERVICE_VAR=microservice
```

### Example - secret references
```json
{
  "DB_PASSWORD": "op://my-vault-$STAGE/mysql/password"
}
```

# Github Actions
This repository exports two github actions:
- `op-install` - downloads op-cli in the build environment
- `op-login` - sets up the 1password account and generates a session token

### Example
```yaml
name: 1password actions test
on: 
  workflow_dispatch:
jobs:
  FetchASecret:
    runs-on: ubuntu-latest
    steps:
      - name: install op-cli
        uses: doctariDev/doctari-onepassword-tools/actions/op-install@main

      - name: check version
        run: op --version

      - name: configure 1password account
        id: op-login
        uses: doctariDev/doctari-onepassword-tools/actions/op-login@main
        with:
          username: ${{ secrets.OP_USERNAME }}
          password: ${{ secrets.OP_PASSWORD }}
          secretKey: ${{ secrets.OP_SECRET_KEY }}
          domain: doctari.1password.eu

      - name: test env
        run: |
          op item get database \
            --session "${{ steps.op-login.outputs.sessionToken }}" \
            --fields username \
            --vault backend-test
```
