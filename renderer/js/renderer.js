// renderer.js
// const { ipcRenderer } = require('electron'); // BU SATIRI KULLANMA!

const themeStatusDiv = document.getElementById('themeStatus');

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const isDark = await window.myApi.getSystemTheme();
        console.log('Sistem Teması (Başlangıç):', isDark ? 'Karanlık' : 'Aydınlık');
        updateThemeDisplay(isDark);
        if (isDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.add('light-mode');
        }
    } catch (error) {
        console.error('Tema bilgisi alınırken hata oluştu:', error);
        if (themeStatusDiv) {
            themeStatusDiv.textContent = 'Tema bilgisi alınamadı.';
        }
    }
});

function updateThemeDisplay(isDark) {
    if (themeStatusDiv) {
        themeStatusDiv.textContent = `Sistem Teması: ${isDark ? 'Karanlık Mod' : 'Aydınlık Mod'}`;
    }
}

const myForm = document.getElementById('myForm');
const responseMessageDiv = document.getElementById('responseMessage');

myForm.addEventListener('submit', (event) => {
    event.preventDefault(); 

    const formData = {
        hwid: document.getElementById('hwid').value,
        version: parseInt(document.getElementById('version').value),
        edition: document.getElementById('edition').value,
        file_path: document.getElementById('fp').value,
    };

    console.log('Form verileri hazırlanıyor (Renderer):', formData); // Bu log'u kontrol et!

    window.myApi.send('form-veri-gonder', formData);

    responseMessageDiv.style.display = 'block';
    responseMessageDiv.style.backgroundColor = '#d4edda';
    responseMessageDiv.style.borderColor = '#c3e6cb';
    responseMessageDiv.textContent = 'Veriler gönderiliyor... Lütfen bekleyin.';
});

window.myApi.receive('form-isleme-tamamlandi', (response) => {
    console.log('Main Sürecinden cevap alındı (Renderer):', response); // Bu log'u kontrol et!
    responseMessageDiv.textContent = response.message;
    if (response.success) {
        responseMessageDiv.style.backgroundColor = '#d4edda';
        responseMessageDiv.style.borderColor = '#c3e6cb';
        myForm.reset();
    } else {
        responseMessageDiv.style.backgroundColor = '#f8d7da';
        responseMessageDiv.style.borderColor = '#f5c6cb';
    }
    responseMessageDiv.style.display = 'block';
});