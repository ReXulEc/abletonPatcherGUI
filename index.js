const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const asn1 = require('asn1.js');
const BN = require('bn.js');

/**
 * Yapılandırma dosyasını yükler ve işler.
 * @param {string} filename - Yapılandırma dosyasının yolu.
 * @param {object} config2 - Ek yapılandırma verileri (file_path, hwid, edition, version).
 * @returns {object} İşlenmiş yapılandırma nesnesi.
 */
function loadConfig(filename, config2) {
    try {
        const filePath = path.resolve(filename);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Yapılandırma dosyası bulunamadı: ${filePath}`);
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

/**
 * DSA parametrelerinden bir özel anahtar nesnesi oluşturur.
 * Bu kısım, 'UNSUPPORTED_ALGORITHM' hatasının ana kaynağı olabilir.
 * @param {object} dsaParams - DSA parametrelerini içeren nesne (p, q, g, y, x).
 * @returns {crypto.KeyObject} Oluşturulan özel anahtar nesnesi.
 */
function constructKey(dsaParams) {
    const { p, q, g, y, x } = dsaParams;

    // '0x' önekini kaldırır
    const strip0x = (hex) => hex.startsWith('0x') ? hex.substring(2) : hex;

    // DSA PrivateKey ASN.1 yapısını tanımlar
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

    try {
        // BN (BigNumber) nesneleri olarak anahtar verilerini hazırlar
        const keyData = {
            version: 0, // DSA PrivateKey ASN.1 standardına göre versiyon (genellikle 0)
            p: new BN(strip0x(p), 16),
            q: new BN(strip0x(q), 16),
            g: new BN(strip0x(g), 16),
            y: new BN(strip0x(y), 16),
            x: new BN(strip0x(x), 16)
        };

        // Hata ayıklama: ASN.1 kodlaması için hazırlanan anahtar verilerini logla
        console.log("DSA Key Data for ASN.1 encoding (hex values):", JSON.stringify(keyData, (key, value) =>
            value instanceof BN ? value.toString(16) : value
        ));

        // Anahtar verilerini DER formatında kodlar
        const der = DsaPrivateKey.encode(keyData, 'der');
        console.log("Generated DER (hex):", der.toString('hex'));

        // DER formatını PEM formatına dönüştürür
        const pem = [
            '-----BEGIN DSA PRIVATE KEY-----',
            der.toString('base64').match(/.{1,64}/g).join('\n'), // 64 karakterde bir satır sonu ekler
            '-----END DSA PRIVATE KEY-----'
        ].join('\n');

        // Hata ayıklama: Oluşturulan PEM anahtarını logla
        console.log("Generated PEM:\n", pem);

        // PEM formatından bir Node.js crypto.KeyObject oluşturur
        const privateKey = crypto.createPrivateKey(pem);
        console.log("DSA özel anahtarı başarıyla oluşturuldu (crypto.createPrivateKey).");
        return privateKey;
    } catch (error) {
        // Anahtar oluşturma sırasında bir hata oluşursa yakala ve detaylı logla
        console.error(`constructKey fonksiyonunda hata oluştu: ${error.message}`);
        if (error.code === 'ERR_OSSL_UNSUPPORTED') {
            console.error("OpenSSL desteklenmeyen algoritma hatası. Bu genellikle eski veya zayıf şifreleme algoritmalarıyla ilgilidir, veya PEM formatında bir sorun olabilir.");
        }
        throw error; // Hatanın çağrı yığınında yukarı yayılmasını sağlar
    }
}

/**
 * Verilen anahtarla bir mesajı imzalar.
 * @param {crypto.KeyObject} k - İmzalama için kullanılacak özel anahtar.
 * @param {string} m - İmzalanacak mesaj.
 * @returns {string} Oluşturulan imzanın hex stringi.
 */
function sign(k, m) {
    try {
        // SHA256 algoritması ile bir imzalayıcı oluşturur (SHA1 yerine SHA256 kullanıldı)
        const signer = crypto.createSign('sha256');
        signer.update(m); // Mesajı imzalayıcıya ekler
        signer.end(); // İmzalama işlemini bitirir

        // Anahtarı ve varsayılan DSA kodlama formatını ('der') kullanarak imzayı oluşturur
        const signature = signer.sign({
            key: k,
            dsaEncoding: 'der' // Açıkça 'der' kodlaması belirtildi
        });

        console.log("İmza başarıyla oluşturuldu.");
        return signature.toString('hex').toUpperCase();
    } catch (error) {
        // İmzalama sırasında bir hata oluşursa yakala ve detaylı logla
        console.error(`sign fonksiyonunda hata oluştu: ${error.message}`);
        if (error.code === 'ERR_OSSL_UNSUPPORTED') {
            console.error("OpenSSL desteklenmeyen algoritma hatası. Bu genellikle DSA anahtarının kendisiyle veya imza kodlama formatıyla ilgili bir uyumsuzluk olabilir.");
        }
        throw error; // Hatanın çağrı yığınında yukarı yayılmasını sağlar
    }
}

/**
 * Grup sağlama toplamını düzeltir.
 * @param {number} groupNumber - Grup numarası.
 * @param {number} n - Grup değeri.
 * @returns {number} Düzeltilmiş grup değeri.
 */
function fixGroupChecksum(groupNumber, n) {
    const checksum = (n >> 4 & 0xf) ^
        (n >> 5 & 0x8) ^
        (n >> 9 & 0x7) ^
        (n >> 11 & 0xe) ^
        (n >> 15 & 0x1) ^
        groupNumber;
    return (n & 0xfff0) | checksum;
}

/**
 * Genel sağlama toplamını hesaplar.
 * @param {number[]} groups - Grup değerleri dizisi.
 * @returns {number} Genel sağlama toplamı.
 */
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

/**
 * Rastgele bir seri numarası oluşturur.
 * @returns {string} Oluşturulan seri numarası.
 */
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

/**
 * Tek bir yetkilendirme satırı oluşturur.
 * @param {crypto.KeyObject} k - İmzalama için özel anahtar.
 * @param {number} id1 - İlk ID.
 * @param {number} id2 - İkinci ID.
 * @param {string} hwid - Donanım ID'si.
 * @returns {string} Yetkilendirme satırı.
 */
function generateSingle(k, id1, id2, hwid) {
    const serial = randomSerial();
    const msg = `${serial},${id1.toString(16).toUpperCase().padStart(2, '0')},${id2.toString(16).toUpperCase().padStart(2, '0')},Standard,${hwid}`;
    const sig = sign(k, msg); // İmzalama işlemi burada gerçekleşir
    return `${serial},${id1.toString(16).toUpperCase().padStart(2, '0')},${id2.toString(16).toUpperCase().padStart(2, '0')},Standard,${sig}`;
}

/**
 * Tüm yetkilendirme satırlarını oluşturan bir jeneratör fonksiyonu.
 * @param {crypto.KeyObject} k - İmzalama için özel anahtar.
 * @param {string} edition - Sürüm (Lite, Intro, Standard, Suite).
 * @param {number} version - Versiyon numarası.
 * @param {string} hwid - Donanım ID'si.
 * @yields {string} Yetkilendirme satırı.
 */
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

/**
 * Dosyadaki eski imza anahtarını yenisiyle değiştirir.
 * @param {string} filePath - Dosyanın yolu.
 * @param {string} oldSignkey - Eski imza anahtarının hex stringi.
 * @param {string} newSignkey - Yeni imza anahtarının hex stringi.
 */
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

            // Dosya içeriğini hex stringe çevirip değiştirme yapar
            const contentHex = content.toString('hex');
            const newContentHex = contentHex.split(oldKeyHex).join(newKeyHex); // .replace() sadece ilkini değiştirir
            const newContent = Buffer.from(newContentHex, 'hex');

            fs.writeFileSync(filePath, newContent);

            // Değişikliğin başarılı olup olmadığını kontrol eder
            const finalContent = fs.readFileSync(filePath);
            if (finalContent.indexOf(oldSignkeyBytes) !== -1) {
                console.error("Hata: Eski imza anahtarı hala dosyada mevcut.");
            } else {
                console.log("İmza anahtarı başarıyla değiştirildi.");
            }
        }
    } catch (error) {
        console.error(`Bir hata oluştu (replaceSignkeyInFile): ${error.message}`);
    }
}

/**
 * Ana işlem fonksiyonu.
 * @param {object} formData - Renderer sürecinden gelen form verileri.
 */
function main(formData) {
    console.log("Node.js Yetkilendirme Betiği Başlatılıyor...");

    try {
        const config = loadConfig('config.json', formData);
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
    } catch (error) {
        console.error(`Ana işlem sırasında bir hata oluştu: ${error.message}`);
        // Electron uygulamasında kullanıcıya hata mesajı göstermek için IPC kullanabilirsiniz
        // mainWindow.webContents.send('hata-mesaji', error.message);
    }
}

// ------------ Main Process ------------
// ---------ELECTRON MAIN PROCESS---------
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');

let mainWindow;

/**
 * Ana pencereyi oluşturur.
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'AbletonPatcherGUI',
        //icon: path.join(__dirname, 'icon.png'), // Uygulama simgesi
        width: 400,
        height: 500,
        transparent: true,
        frame: true,
        resizable: false,
        vibrancy: 'fullscreen-ui',    // on MacOS
        backgroundMaterial: 'acrylic', // on Windows 11
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Node.js API'lerini renderer sürecinde devre dışı bırakır
            contextIsolation: true // Güvenlik için bağlam izolasyonunu etkinleştirir
        }
    });

    mainWindow.loadFile(path.join(__dirname, './renderer/index.html'));
    // mainWindow.webContents.openDevTools(); // Geliştirme araçlarını açmak için yorum satırını kaldırın
}

// Electron uygulaması hazır olduğunda pencereyi oluşturur
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        // macOS'ta dock simgesine tıklandığında pencere yoksa yeniden oluşturur
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Sistem temasını renderer sürecine göndermek için IPC handler
    ipcMain.handle('get-system-theme', () => {
        return nativeTheme.shouldUseDarkColors;
    });
});


/*
// Tüm pencereler kapatıldığında uygulamadan çıkar (macOS hariç)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
*/


// Renderer Sürecinden gelen 'form-veri-gonder' sinyalini dinle
ipcMain.on('form-veri-gonder', (event, formData) => {
    console.log('Main Sürecinde form verileri alındı:', formData);
    // Form verilerini ana işlem fonksiyonuna ilet
    main(formData);
});
