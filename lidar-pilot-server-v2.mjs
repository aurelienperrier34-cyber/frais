// Pilote Prades : carte locale et calcul LiDAR terrain + sursol.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const lidarBucket = typeof process !== 'undefined' ? process.env.GCS_BUCKET : '';
let storageClient;
async function readLidarFile(file) {
  try {
    return await readFile(file);
  } catch (localError) {
    if (!lidarBucket) throw localError;
    if (!storageClient) {
      const { Storage } = await import('@google-cloud/storage');
      storageClient = new Storage();
    }
    const bucket = storageClient.bucket(lidarBucket);
    const objectName = path.relative(root, file).split(path.sep).join('/');
    try {
      const [content] = await bucket.file(objectName).download();
      return content;
    } catch (nestedObjectError) {
      const [content] = await bucket.file(path.basename(file)).download();
      return content;
    }
  }
}
const mnhNames = ['LHD_FXX_0768_6288_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0768_6289_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0769_6288_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0769_6289_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0769_6290_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0770_6288_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0770_6289_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0770_6290_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0771_6289_MNH_O_0M50_LAMB93_IGN69','LHD_FXX_0771_6290_MNH_O_0M50_LAMB93_IGN69'];
const mntNames = ['LHD_FXX_0767_6288_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0767_6289_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0767_6290_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0768_6288_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0768_6289_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0768_6290_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0769_6288_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0769_6289_MNT_O_0M50_LAMB93_IGN69','LHD_FXX_0769_6290_MNT_O_0M50_LAMB93_IGN69'];
const files = (kind, names) => names.map(name => path.join(root, 'data', 'lidar', 'prades', kind, name, name));
const mnhTiles = files('mnh', mnhNames), mntTiles = files('mnt', mntNames);
const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 }, cache = new Map();
function values(b, type, count, at) { const size = sizes[type] * count, start = size <= 4 ? at : b.readUInt32LE(at), out = []; for (let i = 0; i < count; i++) { const p = start + i * sizes[type]; out.push(type === 3 ? b.readUInt16LE(p) : type === 4 ? b.readUInt32LE(p) : type === 12 ? b.readDoubleLE(p) : b.readUInt8(p)); } return out; }
async function tile(file) {
  // Tous les points d'un trajet utilisent les mêmes quelques dalles. On met
  // aussi en cache le chargement en cours pour éviter 400 lectures du même TIFF.
  if (cache.has(file)) return await cache.get(file);
  const loading = (async () => {
    const b = await readLidarFile(file), ifd = b.readUInt32LE(4), count = b.readUInt16LE(ifd), tags = {};
    for (let i = 0; i < count; i++) { const at = ifd + 2 + i * 12; tags[b.readUInt16LE(at)] = values(b, b.readUInt16LE(at + 2), b.readUInt32LE(at + 4), at + 8); }
    return { b, width: tags[256][0], height: tags[257][0], bytes: tags[258][0] / 8, offset: tags[273][0], sx: tags[33550][0], sy: tags[33550][1], x0: tags[33922][3], y0: tags[33922][4] };
  })();
  cache.set(file, loading);
  try {
    const loaded = await loading;
    cache.set(file, loaded);
    return loaded;
  } catch (error) {
    cache.delete(file);
    throw error;
  }
}
function l93(lat, lon) { const e = .0818191910428158, n = .725607765053267, c = 11754255.426096, xs = 700000, ys = 12655612.049876, la = lat * Math.PI / 180, lo = lon * Math.PI / 180, iso = Math.atanh(Math.sin(la)) - e * Math.atanh(e * Math.sin(la)), r = c * Math.exp(-n * iso), g = n * (lo - 3 * Math.PI / 180); return [xs + r * Math.sin(g), ys - r * Math.cos(g)]; }
async function height(tiles, lat, lon) { const [x, y] = l93(lat, lon); for (const file of tiles) { const t = await tile(file), col = Math.floor((x - t.x0) / t.sx), row = Math.floor((t.y0 - y) / t.sy); if (col < 0 || row < 0 || col >= t.width || row >= t.height) continue; const z = t.b.readFloatLE(t.offset + (row * t.width + col) * t.bytes); return Number.isFinite(z) && z > -9999 ? z : null; } return null; }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const servicePort = Number(globalThis.FRAIS_PORT || (typeof process !== 'undefined' && process.env.PORT) || 8004);
http.createServer(async (req, res) => { const url = new URL(req.url, 'http://local'); try {
  if (url.pathname === '/feedback' && req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); await mkdir(path.join(root, 'feedback'), { recursive: true }); await writeFile(path.join(root, 'feedback', `mobile-feedback-${Date.now()}.multipart`), Buffer.concat(chunks)); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  if (url.pathname === '/api/lidar') { const points = (url.searchParams.get('points') || '').split('|').filter(Boolean).map(s => s.split(',').map(Number)); const [elevations, terrain] = await Promise.all([Promise.all(points.map(([lat, lon]) => height(mnhTiles, lat, lon))), Promise.all(points.map(([lat, lon]) => height(mntTiles, lat, lon)))]); res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ source: 'MNH + MNT LiDAR HD local — Prades', elevations, terrain })); }
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname, file = path.resolve(root, '.' + requestPath); if (!file.startsWith(root)) throw Error(); const content = await readFile(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
} catch { res.writeHead(404); res.end('Introuvable'); } }).listen(servicePort, '0.0.0.0', () => console.log(`Frais : http://localhost:${servicePort}`));
