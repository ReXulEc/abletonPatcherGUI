const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const asn1 = require('asn1.js');
const BN = require('bn.js');

function loadConfig(filename) {
    try {
        const filePath = path.resolve(filename);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Yapılandırma dosyası bulunamadı: ${filePath}`);
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const {
            file_path,
            old_signkey,
            new_signkey,
            dsa_parameters
        } = data;
        let {
            hwid = '',
            edition = 'Suite',
            version = 12,
            authorize_file_output = 'Authorize.auz'
        } = data;

        if (!file_path || !old_signkey || !new_signkey) {
            throw new Error("JSON dosyası 'file_path', 'old_signkey' ve 'new_signkey' içermelidir.");
        }
        if (!dsa_parameters) {
            throw new Error("DSA parametreleri yapılandırma dosyasında eksik.");
        }

        hwid = hwid.toUpperCase();
        if (hwid.length === 24) {
            hwid = hwid.match(/.{1,4}/g).join('-');
        }
        if (!/^([0-9A-F]{4}-){5}[0-9A-F]{4}$/.test(hwid)) {
            throw new Error(`Donanım ID'si '1111-1111-1111-1111-1111-1111' gibi olmalı, '${hwid}' değil.`);
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
        console.error(`Yapılandırma yüklenirken hata oluştu: ${error.message}`);
        process.exit(1);
    }
}

function constructKey(dsaParams) {
    const { p, q, g, y, x } = dsaParams;

    const strip0x = (hex) => hex.startsWith('0x') ? hex.substring(2) : hex;

    const DsaPrivateKey = asn1.define('DsaPrivateKey', function() {
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
        throw new Error("Yeni imza anahtarı, eski imza anahtarıyla aynı uzunlukta olmalıdır.");
    }

    if (!/^[0-9a-fA-F]+$/.test(oldKeyHex) || !/^[0-9a-fA-F]+$/.test(newKeyHex)) {
        throw new Error("İmza anahtarları geçerli hex dizeleri olmalıdır.");
    }

    try {
        if (!fs.existsSync(filePath)) {
            console.log(`Dosya bulunamadı: '${filePath}'`);
            return;
        }

        let content = fs.readFileSync(filePath);
        const oldSignkeyBytes = Buffer.from(oldKeyHex, 'hex');

        if (content.indexOf(oldSignkeyBytes) === -1) {
            console.log(`Eski imza anahtarı '${oldKeyHex.substring(0, 20)}...' dosyada bulunamadı.`);
        } else {
            console.log(`Eski imza anahtarı bulundu. Değiştiriliyor...`);
            
            const contentHex = content.toString('hex');
            const newContentHex = contentHex.split(oldKeyHex).join(newKeyHex); // .replace() sadece ilkini değiştirir
            const newContent = Buffer.from(newContentHex, 'hex');

            fs.writeFileSync(filePath, newContent);

            const finalContent = fs.readFileSync(filePath);
            if (finalContent.indexOf(oldSignkeyBytes) !== -1) {
                console.error("Hata: Eski imza anahtarı hala dosyada mevcut.");
            } else {
                console.log("İmza anahtarı başarıyla değiştirildi.");
            }
        }
    } catch (error) {
        console.error(`Bir hata oluştu: ${error.message}`);
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

function main() {
    console.log("Node.js Yetkilendirme Betiği Başlatılıyor...");

    const config = loadConfig('config.json');
    console.log("Yapılandırma başarıyla yüklendi.");

    const privateKey = constructKey(config.dsaParams);
    console.log("DSA özel anahtarı başarıyla oluşturuldu.");

    const lines = Array.from(generateAll(privateKey, config.edition, config.version, config.hwid));
    try {
        fs.writeFileSync(config.authorizeFileOutput, lines.join("\n"), { encoding: 'utf8' });
        console.log(`Yetkilendirme dosyası '${config.authorizeFileOutput}' başarıyla oluşturuldu.`);
    } catch (error) {
        console.error(`Yetkilendirme dosyası yazılırken hata oluştu: ${error.message}`);
        process.exit(1);
    }
    
    replaceSignkeyInFile(config.filePath, config.oldSignkey, config.newSignkey);
    
    console.log("\nİşlem tamamlandı.");
}

main();
// aglıcam calısırsa