const themeStatusDiv = document.getElementById('themeStatus');

function exit() {
    window.myApi.send('form-veri-gonder', { exit: true });
}

function clipboardBottom(number) {
    if (number === 1) {
        navigator.clipboard.writeText("https://mert.day");
        alert('Copied to clipboard: https://mert.day');
    } else if (number === 2) {
        navigator.clipboard.writeText('https://github.com/rufoa/ableton');
        alert('Copied to clipboard: https://github.com/rufoa/ableton');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const isDark = await window.myApi.getSystemTheme();
        updateThemeDisplay(isDark);
        if (isDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.add('light-mode');
        }
    } catch (error) {
        console.error(error)
    }
});

function updateThemeDisplay(isDark) {
    if (themeStatusDiv) {
        console.log(isDark ? 'DARK MODE' : 'LIGHT MODE');
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

    window.myApi.send('form-veri-gonder', formData);

    responseMessageDiv.style.display = 'block';
    responseMessageDiv.style.backgroundColor = '#d4edda';
    responseMessageDiv.style.borderColor = '#c3e6cb';
    responseMessageDiv.textContent = 'Processing...';
});

window.myApi.receive('form-isleme-tamamlandi', (response) => {
    responseMessageDiv.textContent = response.message;
    if (response.success) {
        responseMessageDiv.style.backgroundColor = '#d4edda';
        responseMessageDiv.style.borderColor = '#c3e6cb';
        responseMessageDiv.style.color = isDark ? 'black' : 'white';
        myForm.reset();
    } else {
        responseMessageDiv.style.backgroundColor = '#f8d7da';
        responseMessageDiv.style.borderColor = '#f5c6cb';
        responseMessageDiv.style.color = isDark ? 'black' : 'white';

    }
    responseMessageDiv.style.display = 'block';
});