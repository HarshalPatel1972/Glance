document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({ defaultOpacity: 1, snipExpirationDays: 7 }, (res) => {
    document.getElementById('default-opacity').value = res.defaultOpacity;
    document.getElementById('opacity-val').innerText = Math.round(res.defaultOpacity * 100) + '%';
    document.getElementById('expiration').value = res.snipExpirationDays;
  });
});

document.getElementById('default-opacity').addEventListener('input', (e) => {
  document.getElementById('opacity-val').innerText = Math.round(e.target.value * 100) + '%';
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({
    defaultOpacity: parseFloat(document.getElementById('default-opacity').value),
    snipExpirationDays: parseInt(document.getElementById('expiration').value, 10)
  }, () => {
    alert('Settings Saved!');
  });
});

document.getElementById('shortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});