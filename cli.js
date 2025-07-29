const p = require('@clack/prompts');
const color = require('picocolors');
const path = require('path');
const fs = require('fs');
let cachePath = path.join(__dirname, '/config/cache.json');
const { spawn } = require('child_process');


async function main() {
    console.clear();

    p.updateSettings({
        aliases: {
            w: 'up',
            s: 'down',
            a: 'left',
            d: 'right',
        },
    });

    p.intro(`${color.bgCyan(color.black(' abletonPatcherCLI '))} ${color.bold('1.0.0')}`);

    const infos = await p.group(
        {
            file_path: () =>
                p.text({
                    message: `What is the file path of your Ableton App?`,
                    placeholder: '//Applications//Ableton Live 11 Suite.app//Contents//MacOS//Live',
                }),
            version: () =>
                p.select({
                    message: `Select a version`,
                    maxItems: 1,
                    options: [
                        { value: '9', label: '9' },
                        { value: '10', label: '10' },
                        { value: '11', label: '11' },
                        { value: '12', label: '12' },
                    ],
                }),
            edition: () =>
                p.select({
                    message: `Select a edition`,
                    maxItems: 1,
                    options: [
                        { value: 'Lite', label: 'Lite' },
                        { value: 'Intro', label: 'Intro' },
                        { value: 'Standard', label: 'Standard' },
                        { value: 'Suite', label: 'Suite' },
                    ],
                }),
            hwid: () =>
                p.text({
                    message: `What is Your HWID?`,
                    placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
                }),
        },
        {
            onCancel: () => {
                p.cancel('İşlem iptal edildi.');
                process.exit(0);
            },
        }
    );

    outputLogs = [];

    fs.writeFileSync(cachePath, JSON.stringify(infos, null, 2), 'utf8')
    const scriptPath = path.join(__dirname, 'util/patcher.js');

    const child = spawn('node', [scriptPath]);

    await child.stdout.on('data', (data) => {
        p.log.success(data.toString());
    });

    child.stderr.on('data', (data) => {
        p.log.error(data.toString());

    });

}

    p.outro("Made with <3 by rexulec. The Implementation of the KeyGen was made by rufoa.", 'About:');

main().catch(console.error);