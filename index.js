const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, nativeTheme, utilityProcess } = require('electron');
const cachePath = path.join(__dirname, './config/cache.json');
const { spawn } = require('child_process');


let mainWindow;

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

    // Sistem temasını renderer sürecine göndermek için IPC handler
    ipcMain.handle('get-system-theme', () => {
        return nativeTheme.shouldUseDarkColors;
    });
});

/*
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
*/

ipcMain.on('form-veri-gonder', (event, formData) => {
    console.log('Main Sürecinde form verileri alındı:', formData);

    // write the formData into cachePath
    fs.writeFileSync(cachePath, JSON.stringify(formData, null, 2), 'utf8')
    console.log('Form verileri cache.json dosyasına yazıldı.');
    const scriptPath = path.join(__dirname, 'util/patcher.js');

    const child = spawn('node', [scriptPath], {
        stdio: 'inherit' // Bu, alt işlemin konsol çıktısının ana konsolda görünmesini sağlar
    });

    // Alt işlem kapandığında tetiklenir
    child.on('close', (code) => {
        console.log(`Alt işlem ${code} koduyla sona erdi.`);
    });

    // Alt işlem sırasında bir hata oluştuğunda tetiklenir
    child.on('error', (err) => {
        console.error('Alt işlem başlatılamadı:', err);
    });

})


