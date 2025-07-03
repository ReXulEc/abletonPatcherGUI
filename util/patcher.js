const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const asn1 = require('asn1.js');
const BN = require('bn.js');

const configPath = path.join(__dirname, '../config/config.json')
const cachePath = path.join(__dirname, '../config/cache.json');

// ------------------------IMPORTANT NOTE------------------------
// i tried to use this module on main index.js but it didn't work,
// thats why i moved it to a separate file with child process


let formData = {
    hwid: null,
    version: null,
    edition: null,
    file_path: null
}

if (fs.existsSync(cachePath)) {
    try {
        const cacheData = fs.readFileSync(cachePath, 'utf8');
        if (cacheData) {
            formData = JSON.parse(cacheData);
        }
    } catch (error) {
        console.error(`Cache file is corrupted or invalid: ${cachePath}`);
        process.exit(1);
    }
} else {
    console.error(`Cache file not found at: ${cachePath}`);
    process.exit(1);

}

fs.writeFileSync(cachePath, JSON.stringify({}, null, 2), 'utf8')


function loadConfig(filename, config2) {
    try {
        const filePath = path.resolve(filename);
        if (!fs.existsSync(filePath)) {
            console.error(`Configuration file not found: ${filePath}`);
            process.exit(1);

        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const {
            old_signkey,
            new_signkey,
            dsa_parameters,
        } = data;

        const authorize_file_output = 'Authorize.auz'
        const file_path = config2.file_path;

        let {
            hwid = '',
            edition = 'Suite',
            version = 12,
        } = config2;

        if (!file_path || !old_signkey || !new_signkey) {
            console.error("JSON file must contain 'file_path', 'old_signkey', and 'new_signkey'.");
            process.exit(1);

        }
        if (!dsa_parameters) {
            console.error("DSA parameters are missing in the configuration file.");
            process.exit(1);

        }

        hwid = hwid.toUpperCase();
        if (hwid.length === 24) {
            hwid = hwid.match(/.{1,4}/g).join('-');
        }
        if (!/^([0-9A-F]{4}-){5}[0-9A-F]{4}$/.test(hwid)) {
            console.error(`Hardware ID should be like '1111-1111-1111-1111-1111-1111', not '${hwid}'.`);
            process.exit(1);

        }


        return {
            filePath: file_path,
            oldSignkey: old_signkey,
            newSignkey: new_signkey,
            hwid,
            edition,
            version,
            authorizeFileOutput: authorize_file_output,
            dsaParams: dsa_parameters
        };

    } catch (error) {
        console.error(`Error loading configuration: ${error.message}`);
        process.exit(1);

    }
}


function constructKey(dsaParams) {
    const { p, q, g, y, x } = dsaParams;

    const strip0x = (hex) => hex.startsWith('0x') ? hex.substring(2) : hex;

    const DsaPrivateKey = asn1.define('DsaPrivateKey', function () {
        this.seq().obj(
            this.key('version').int(),
            this.key('p').int(),
            this.key('q').int(),
            this.key('g').int(),
            this.key('y').int(), // public key
            this.key('x').int()  // private key
        );
    });

    const keyData = {
        version: 0, // Hata düzeltmesi: "v1" yerine doğrudan 0 tamsayısını kullan
        p: new BN(strip0x(p), 16),
        q: new BN(strip0x(q), 16),
        g: new BN(strip0x(g), 16),
        y: new BN(strip0x(y), 16),
        x: new BN(strip0x(x), 16)
    };

    const der = DsaPrivateKey.encode(keyData, 'der');

    const pem = [
        '-----BEGIN DSA PRIVATE KEY-----',
        der.toString('base64').match(/.{1,64}/g).join('\n'),
        '-----END DSA PRIVATE KEY-----'
    ].join('\n');

    return crypto.createPrivateKey(pem);
}


function replaceSignkeyInFile(filePath, oldSignkey, newSignkey) {
    const oldKeyHex = oldSignkey.startsWith("0x") ? oldSignkey.substring(2) : oldSignkey;
    const newKeyHex = newSignkey.startsWith("0x") ? newSignkey.substring(2) : newSignkey;

    if (oldKeyHex.length !== newKeyHex.length) {
        console.error("New signature key must be the same length as the old signature key.");
        process.exit(1);

    }

    if (!/^[0-9a-fA-F]+$/.test(oldKeyHex) || !/^[0-9a-fA-F]+$/.test(newKeyHex)) {
        console.error("Signature keys must be valid hex strings.");
        process.exit(1);

    }

    try {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            process.exit(1);

        }

        let content = fs.readFileSync(filePath);
        const oldSignkeyBytes = Buffer.from(oldKeyHex, 'hex');

        if (content.indexOf(oldSignkeyBytes) === -1) {
            console.log(`Old signature key '${oldKeyHex.substring(0, 20)}...' not found in the file.`);
        } else {
            console.log(`Replacing old signature key...`);

            const contentHex = content.toString('hex');
            const newContentHex = contentHex.split(oldKeyHex).join(newKeyHex);
            const newContent = Buffer.from(newContentHex, 'hex');

            fs.writeFileSync(filePath, newContent);

            const finalContent = fs.readFileSync(filePath);
            if (finalContent.indexOf(oldSignkeyBytes) !== -1) {
                console.error("Old signature key still exists in the file after replacement.");
                process.exit(1);

            } else {
                console.log(`Signature key successfully replaced.`);
            }
        }
    } catch (error) {
        console.error(`Failed to replace signature key: ${error.message}`);
        process.exit(1);

    }
}

function sign(k, m) {
    const signer = crypto.createSign('sha1');
    signer.update(m);
    signer.end();

    const signature = signer.sign({
        key: k,
        dsaEncoding: 'ieee-p1363'
    });

    return signature.toString('hex').toUpperCase();
}

function fixGroupChecksum(groupNumber, n) {
    const checksum = (n >> 4 & 0xf) ^
        (n >> 5 & 0x8) ^
        (n >> 9 & 0x7) ^
        (n >> 11 & 0xe) ^
        (n >> 15 & 0x1) ^
        groupNumber;
    return (n & 0xfff0) | checksum;
}

function overallChecksum(groups) {
    let r = 0;
    for (let i = 0; i < 20; i++) {
        const g = Math.floor(i / 4);
        const digit = i % 4;
        const v = (groups[g] >> (digit * 8)) & 0xff;
        r ^= v << 8;
        for (let j = 0; j < 8; j++) {
            r <<= 1;
            if (r & 0x10000) {
                r ^= 0x8005;
            }
        }
    }
    return r & 0xffff;
}

function randomSerial() {
    const randint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    let groups = [
        randint(0x3000, 0x3fff),
        randint(0x0000, 0xffff),
        randint(0x0000, 0xffff),
        randint(0x0000, 0xffff),
        randint(0x0000, 0xffff)
    ];

    for (let i = 0; i < 5; i++) {
        groups[i] = fixGroupChecksum(i, groups[i]);
    }

    const d = overallChecksum(groups);

    const formatHex = (num) => num.toString(16).toUpperCase().padStart(4, '0');

    return `${formatHex(groups[0])}-${formatHex(groups[1])}-${formatHex(groups[2])}-${formatHex(groups[3])}-${formatHex(groups[4])}-${formatHex(d)}`;
}

function generateSingle(k, id1, id2, hwid) {
    const serial = randomSerial();
    const msg = `${serial},${id1.toString(16).toUpperCase().padStart(2, '0')},${id2.toString(16).toUpperCase().padStart(2, '0')},Standard,${hwid}`;
    const sig = sign(k, msg);
    return `${serial},${id1.toString(16).toUpperCase().padStart(2, '0')},${id2.toString(16).toUpperCase().padStart(2, '0')},Standard,${sig}`;
}

function* generateAll(k, edition, version, hwid) {
    const EDITIONS = {
        "Lite": 4,
        "Intro": 3,
        "Standard": 0,
        "Suite": 2,
    };

    yield generateSingle(k, EDITIONS[edition], version << 4, hwid);
    for (let i = 0x40; i <= 0xff; i++) {
        yield generateSingle(k, i, 0x10, hwid);
    }
    for (let i = 0x8000; i <= 0x80ff; i++) {
        yield generateSingle(k, i, 0x10, hwid);
    }
}

function main(configPath) {
    const config = loadConfig(configPath, formData);
    console.log('Configuration loaded successfully.');

    const privateKey = constructKey(config.dsaParams);
    console.log('DSA private key constructed successfully.');

    const lines = Array.from(generateAll(privateKey, config.edition, config.version, config.hwid));
    try {
        fs.writeFileSync(config.authorizeFileOutput, lines.join("\n"), { encoding: 'utf8' });
        console.log(`Authorization file '${config.authorizeFileOutput}' created successfully.`);
    } catch (error) {
        console.error(`Failed to write authorization file: ${error.message}`);
        process.exit(1);

    }

    replaceSignkeyInFile(config.filePath, config.oldSignkey, config.newSignkey);

    console.log("Done!")
}
main(configPath);