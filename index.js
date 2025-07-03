const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const cachePath = path.join(__dirname, '/config/cache.json');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'AbletonPatcherGUI',
        width: 400,
        height: 500,
        transparent: true,
        frame: true,
        resizable: false,
        vibrancy: 'fullscreen-ui',    // on MacOS
        backgroundMaterial: 'acrylic', // on Windows 11
        webPreferences: {
            preload: path.join(__dirname, './util/preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, './renderer/index.html'));
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    ipcMain.handle('get-system-theme', () => {
        return nativeTheme.shouldUseDarkColors;
    });
});

/*
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
*/
let outputLogs = [];
ipcMain.on('form-veri-gonder', (event, formData) => {
    if (formData.exit === true) {
        console.log('Uygulama kapatılıyor...');
        app.quit();
        return;
    } else {
        outputLogs = []; // Her işlem için logları temizle
        console.log('Main Sürecinde form verileri alındı:', formData);

        fs.writeFileSync(cachePath, JSON.stringify(formData, null, 2), 'utf8')
        console.log('Form verileri cache.json dosyasına yazıldı.');
        const scriptPath = path.join(__dirname, 'util/patcher.js');

        const child = spawn('node', [scriptPath]);

        child.stdout.on('data', (data) => {
            console.log(`Alt işlem çıktısı: ${data}`);
            outputLogs.push(data.toString());
            event.sender.send('form-isleme-tamamlandi', { success: true, message: outputLogs.join('\n') });
        });

        child.stderr.on('data', (data) => {
            console.log(`Alt işlem çıktısı: ${data}`);
            outputLogs.push(data.toString());
            event.sender.send('form-isleme-tamamlandi', { success: false, message: outputLogs.join('\n') });
        });
    }

    /* 
        child.on('error', (err) => {
            console.error('Alt işlem başlatılamadı:', err);
            event.sender.send('form-isleme-tamamlandi', { success: false, message: err });
        });
    
        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`Alt işlem başarısız oldu, kod: ${code}`);
                event.sender.send('form-isleme-tamamlandi', { success: false, message: 'İşlem başarısız oldu.' });
                return;
            } else {
                console.log('Alt işlem başarıyla tamamlandı.');
                event.sender.send('form-isleme-tamamlandi', { success: true, message: 'İşlem tamamlandı.' });
            }
        });
    */

})


