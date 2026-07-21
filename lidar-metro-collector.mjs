// Collecteur LiDAR Métropole : lit les manifests officiels IGN MNH/MNT,
// télécharge avec reprise, puis produit un inventaire de couverture.
// Usage : node lidar-metro-collector.mjs --mnh manifests/mnh.txt --mnt manifests/mnt.txt
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, values) => value.startsWith('--') ? [...all, [value.slice(2), values[index + 1]]] : all, []));
const output = path.resolve(args.out || 'data/lidar/metro');
const concurrency = Math.max(1, Math.min(4, Number(args.concurrency || 3)));
if (!args.mnh || !args.mnt) throw new Error('Fournis les manifests IGN : --mnh manifests/mnh.txt --mnt manifests/mnt.txt');

async function urls(file) {
  const content = await readFile(file, 'utf8');
  return [...new Set((content.match(/https?:\/\/[^\s"']+/g) || []).map(value => value.trim()))];
}

function tileName(url) {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/LHD_FXX_\d{4}_\d{4}_(?:MNH|MNT)_O_0M50_LAMB93_IGN69/);
  if (!match) throw new Error(`Nom de dalle introuvable dans l’URL : ${url}`);
  return match[0];
}

async function exists(file) {
  try { return (await stat(file)).size > 1_000_000; } catch { return false; }
}

async function download(kind, url) {
  const name = tileName(url);
  const directory = path.join(output, kind, name);
  const target = path.join(directory, name);
  if (await exists(target)) return { name, kind, state: 'déjà présent', bytes: (await stat(target)).size };
  let failure;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const tiff = data.subarray(0, 2).toString('ascii');
      if (data.length < 1_000_000 || !['II', 'MM'].includes(tiff)) throw new Error('réponse IGN non exploitable');
      await mkdir(directory, { recursive: true });
      await writeFile(target, data);
      return { name, kind, state: 'téléchargé', bytes: data.length };
    } catch (error) {
      failure = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  return { name, kind, state: 'erreur', error: failure.message };
}

async function limited(items, worker) {
  const results = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
      process.stdout.write(`• ${results[index].kind} ${results[index].name} : ${results[index].state}\n`);
    }
  }));
  return results;
}

const [mnh, mnt] = await Promise.all([urls(args.mnh), urls(args.mnt)]);
const results = await limited([...mnh.map(url => ['mnh', url]), ...mnt.map(url => ['mnt', url])], ([kind, url]) => download(kind, url));
const inventory = { createdAt: new Date().toISOString(), source: 'Manifests LiDAR HD IGN', output, total: results.length, downloaded: results.filter(item => item.state === 'téléchargé').length, existing: results.filter(item => item.state === 'déjà présent').length, errors: results.filter(item => item.state === 'erreur'), tiles: results };
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'coverage.json'), JSON.stringify(inventory, null, 2));
console.log(`Inventaire créé : ${inventory.total} fichiers, ${inventory.downloaded} téléchargés, ${inventory.errors.length} erreur(s).`);
