/* Copie la version web de Cap (dossier parent) dans www/, que
   Capacitor embarque dans l'application Android. Le service worker
   n'est pas copié : les fichiers sont déjà dans l'application. */
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..');
const cible = path.join(__dirname, 'www');
const fichiers = ['index.html', 'style.css', 'app.js', 'manifest.json', 'logo-96.png', 'favicon-48.png',
  'icone-192.png', 'icone-512.png', 'icone-maskable-512.png', 'apple-touch-icon.png'];

fs.rmSync(cible, { recursive: true, force: true });
fs.mkdirSync(cible, { recursive: true });
fichiers.forEach(function (nom) {
  fs.copyFileSync(path.join(source, nom), path.join(cible, nom));
});
console.log(fichiers.length + ' fichiers copiés dans www/.');
