'use strict';
// Builds pinefall.html: index.html with the stylesheet and every script inlined,
// so the game is one file that opens by double-clicking.
// Usage: node tools/build_single.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const linkTag = '<link rel="stylesheet" href="css/style.css">';
if (html.indexOf(linkTag) < 0) throw new Error('stylesheet link not found in index.html');
html = html.replace(linkTag, () => '<style>\n' + css + '</style>');

const scriptRe = /<script src="(js\/[\w.-]+\.js)"><\/script>/g;
let count = 0;
html = html.replace(scriptRe, (m, rel) => {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  if (/<\/script/i.test(code)) throw new Error(rel + ' contains a closing script tag and cannot be inlined');
  count++;
  return '<script>\n' + code + '</script>';
});
if (count === 0) throw new Error('no scripts found in index.html');

const out = path.join(root, 'pinefall.html');
fs.writeFileSync(out, html);
console.log('wrote ' + path.relative(root, out) + ' (' + count + ' scripts inlined, ' + Math.round(html.length / 1024) + ' KB)');
