#!/usr/bin/env node

function getDownloadUrl(version) {
    const platform = process.platform;
    const arch = process.arch;

    const urls = {
        darwin: {
            x64: `https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_apple_universal_v${version}.pkg`,
            arm64: `https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_apple_universal_v${version}.pkg`,
        },
        linux: {
            ia32: `https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_386_v${version}.zip`,
            x64: `https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_amd64_v${version}.zip`,
            arm: `https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_arm_v${version}.zip`,
            arm64: `https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_arm64_v${version}.zip`,
        },
    }

    if (urls[platform] && urls[platform][arch]) {
        return {
            downloadUrl: urls[platform][arch],
            packageType: (platform === 'darwin') ? 'pkg' : 'zip',
        };
    }

    throw new Error(`Unsupported platform / architecture: ${platform} / ${arch}`);
}

try {
    const data = getDownloadUrl(process.env.OP_VERSION || '2.4.1')
    console.log([
        `export op_download_url="${data.downloadUrl}"`,
        `export op_entry="${data.entry}"`,
        `export op_package_type="${data.packageType}"`,
    ].join('\n'))
}
catch(e) {
    console.error(e.message);
    process.exit(1);
}
