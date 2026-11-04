'use strict';
// Builds yunwang_paradise.html: index.html with the stylesheet, every script and both music
// tracks inlined, so the game is one file that opens by double-clicking. Also writes
// yunwang_paradise.zip holding that file, which GitHub serves as a one-click download.
// Usage: node tools/build_single.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const linkTag = '<link rel="stylesheet" href="css/style.css">';
if (html.indexOf(linkTag) < 0) throw new Error('stylesheet link not found in index.html');
html = html.replace(linkTag, () => '<style>\n' + css + '</style>');

function dataUri(file) {
  const p = path.join(root, 'assets', file);
  if (!fs.existsSync(p)) throw new Error('missing assets/' + file);
  return 'data:audio/mpeg;base64,' + fs.readFileSync(p).toString('base64');
}
const music = { theme: dataUri('yunwang_theme.mp3'), quiet: dataUri('quiet_room.mp3') };

const scriptRe = /<script src="(js\/[\w.-]+\.js)"><\/script>/g;
let count = 0;
html = html.replace(scriptRe, (m, rel) => {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  if (/<\/script/i.test(code)) throw new Error(rel + ' contains a closing script tag and cannot be inlined');
  const prefix = count === 0 ? '<script>window.YW_MUSIC = ' + JSON.stringify(music) + ';</script>\n' : '';
  count++;
  return prefix + '<script>\n' + code + '</script>';
});
if (count === 0) throw new Error('no scripts found in index.html');

const outName = 'yunwang_paradise.html';
const htmlBuf = Buffer.from(html, 'utf8');
fs.writeFileSync(path.join(root, outName), htmlBuf);

const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Single-entry zip with a fixed timestamp so rebuilding unchanged files gives identical bytes.
function zipOne(name, data) {
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const cdSize = central.length + nameBuf.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, comp, central, nameBuf, end]);
}

const zip = zipOne(outName, htmlBuf);
fs.writeFileSync(path.join(root, 'yunwang_paradise.zip'), zip);
console.log('wrote ' + outName + ' (' + count + ' scripts, 2 music tracks, ' + (htmlBuf.length / 1048576).toFixed(1) + ' MB) and yunwang_paradise.zip (' + (zip.length / 1048576).toFixed(1) + ' MB)');
