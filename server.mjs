import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { createExtractorFromFile } from 'node-unrar-js';

const app = express();
app.use(cors());
app.use(express.json());

// Directories
const DATA_DIR = path.join(process.cwd(), '.data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const DB_FILE = path.join(DATA_DIR, 'library.json');

for (const d of [DATA_DIR, UPLOADS_DIR, CACHE_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Simple JSON database
let library = [];
if (fs.existsSync(DB_FILE)) {
  library = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(library, null, 2)); }

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
const isImage = (name) => validExts.some(ext => name.toLowerCase().endsWith(ext)) && !path.basename(name).startsWith('.') && !name.toLowerCase().includes('__macosx');

// Upload config
const upload = multer({ dest: UPLOADS_DIR });

// ---- IMPORT: user uploads a file ----
app.post('/api/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const origName = req.file.originalname;
  const ext = path.extname(origName).toLowerCase();
  const format = (ext === '.cbr' || ext === '.rar') ? 'cbr' : 'cbz';
  const id = crypto.createHash('md5').update(origName + req.file.size).digest('hex');

  // Keep the file with a clean name
  const storedPath = path.join(UPLOADS_DIR, id + ext);
  fs.renameSync(req.file.path, storedPath);

  // Count pages
  let totalPages = 0;
  try {
    if (format === 'cbz') {
      const zip = new AdmZip(storedPath);
      totalPages = zip.getEntries().filter(e => !e.isDirectory && isImage(e.entryName)).length;
    } else {
      const extractor = await createExtractorFromFile({ filepath: storedPath });
      const list = extractor.getFileList();
      totalPages = [...list.fileHeaders].filter(h => !h.flags.directory && isImage(h.name)).length;
    }
  } catch (e) {
    console.error('Error counting pages:', e);
    return res.status(500).json({ error: e.message });
  }

  // Extract pages to cache
  const cacheDir = path.join(CACHE_DIR, id);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  try {
    if (format === 'cbz') {
      const zip = new AdmZip(storedPath);
      const entries = zip.getEntries().filter(e => !e.isDirectory && isImage(e.entryName)).sort((a, b) => naturalSort(a.entryName, b.entryName));
      for (let i = 0; i < entries.length; i++) {
        fs.writeFileSync(path.join(cacheDir, `${i}.jpg`), entries[i].getData());
      }
    } else {
      const extractor = await createExtractorFromFile({ filepath: storedPath, targetPath: cacheDir });
      const extracted = extractor.extract({ files: () => true });
      // We MUST iterate the generator to trigger the extraction to disk
      for (const _ of extracted.files) { /* extract */ }

      // Flatten extracted images
      const imgs = [];
      const walk = (dir) => {
        for (const item of fs.readdirSync(dir)) {
          const fp = path.join(dir, item);
          if (fs.statSync(fp).isDirectory()) walk(fp);
          else if (isImage(item)) imgs.push(fp);
        }
      };
      walk(cacheDir);
      imgs.sort((a, b) => naturalSort(a, b));
      for (let i = 0; i < imgs.length; i++) {
        const dest = path.join(cacheDir, `${i}.jpg`);
        if (imgs[i] !== dest) fs.renameSync(imgs[i], dest);
      }
      // Clean leftover subdirectories
      for (const item of fs.readdirSync(cacheDir)) {
        const fp = path.join(cacheDir, item);
        if (fs.statSync(fp).isDirectory()) fs.rmSync(fp, { recursive: true });
      }
    }
  } catch (e) {
    console.error('Error extracting:', e);
    return res.status(500).json({ error: e.message });
  }

  const comic = {
    id,
    title: origName.replace(/\.[^/.]+$/, ''),
    fileName: origName,
    format,
    totalPages,
    fileSize: req.file.size,
  };

  // Don't duplicate
  if (!library.find(c => c.id === id)) {
    library.push(comic);
    saveDB();
  }

  console.log(`Imported: ${origName} (${totalPages} pages)`);
  res.json(comic);
});

// ---- LIST ----
app.get('/api/comics', (req, res) => {
  res.json(library.map(c => ({
    ...c,
    coverImage: `http://localhost:3001/api/comic/${c.id}/page/0`,
  })));
});

// ---- INFO ----
app.get('/api/comic/:id/info', (req, res) => {
  const c = library.find(x => x.id === req.params.id);
  if (!c) return res.status(404).send('Not found');
  res.json({ id: c.id, totalPages: c.totalPages });
});

// ---- PAGE ----
app.get('/api/comic/:id/page/:pageIndex', (req, res) => {
  const c = library.find(x => x.id === req.params.id);
  if (!c) return res.status(404).send('Not found');

  const pageIndex = parseInt(req.params.pageIndex);
  const file = path.join(CACHE_DIR, c.id, `${pageIndex}.jpg`);

  if (!fs.existsSync(file)) return res.status(404).send('Page not found');

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(fs.readFileSync(file));
});

// ---- DELETE ----
app.delete('/api/comic/:id', (req, res) => {
  const idx = library.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).send('Not found');

  const c = library[idx];
  // Clean files
  const storedCbr = path.join(UPLOADS_DIR, c.id + (c.format === 'cbr' ? '.cbr' : '.cbz'));
  const cacheDir = path.join(CACHE_DIR, c.id);
  if (fs.existsSync(storedCbr)) fs.rmSync(storedCbr);
  if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true });

  library.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Comic server on http://localhost:${PORT}`));
