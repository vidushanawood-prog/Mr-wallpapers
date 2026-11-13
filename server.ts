import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.wallpaper_vault');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const META_FILE = path.join(DATA_DIR, 'wallpapers.json');

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

interface StoredWallpaperMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  mediaType: 'static' | 'live';
  aspectRatio: string;
  resolutionLabel: string;
  fileSizeBytes: number;
  previewDataUrl: string;
  mediaUrl?: string;
  mimeType?: string;
  accentColor: string;
  authorId: string;
  authorName: string;
  visibility: 'public';
  downloadsCount: number;
  savesCount: number;
  createdAt: string;
  livePresetId?: string;
}

function readStoredWallpapers(): StoredWallpaperMeta[] {
  try {
    if (!fs.existsSync(META_FILE)) return [];
    const raw = fs.readFileSync(META_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeStoredWallpapers(items: StoredWallpaperMeta[]): void {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write wallpapers metadata:', err);
  }
}

async function startServer() {
  const app = express();

  // Support large >25MB base64/binary uploads up to 150MB
  app.use(express.json({ limit: '150mb' }));
  app.use(express.urlencoded({ extended: true, limit: '150mb' }));

  // 1. Get all uploaded wallpapers
  app.get('/api/wallpapers', (_req, res) => {
    const items = readStoredWallpapers();
    res.json({ wallpapers: items });
  });

  // 2. Upload a wallpaper (with optional raw binary / base64 master media)
  app.post('/api/wallpapers', (req, res) => {
    try {
      const { item, base64Media, mimeType } = req.body as {
        item: StoredWallpaperMeta;
        base64Media?: string;
        mimeType?: string;
      };

      if (!item || !item.id) {
        res.status(400).json({ error: 'Invalid wallpaper payload' });
        return;
      }

      const safeId = item.id.replace(/[^a-zA-Z0-9_\-]/g, '');
      let mediaUrl = item.mediaUrl;

      if (base64Media) {
        const commaIdx = base64Media.indexOf(',');
        const rawBase64 = commaIdx >= 0 ? base64Media.slice(commaIdx + 1) : base64Media;
        const buffer = Buffer.from(rawBase64, 'base64');
        const ext =
          mimeType?.includes('mp4')
            ? 'mp4'
            : mimeType?.includes('webm')
            ? 'webm'
            : mimeType?.includes('gif')
            ? 'gif'
            : mimeType?.includes('webp')
            ? 'webp'
            : mimeType?.includes('jpeg') || mimeType?.includes('jpg')
            ? 'jpg'
            : 'png';
        const fileName = `${safeId}.${ext}`;
        const filePath = path.join(MEDIA_DIR, fileName);
        fs.writeFileSync(filePath, buffer);
        mediaUrl = `/api/media/${fileName}`;
      }

      const record: StoredWallpaperMeta = {
        ...item,
        id: safeId,
        mediaUrl,
        mimeType: mimeType || item.mimeType || 'image/png',
      };

      const existing = readStoredWallpapers().filter((w) => w.id !== safeId);
      const updated = [record, ...existing];
      writeStoredWallpapers(updated);

      res.json({ wallpaper: record });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to store wallpaper on server' });
    }
  });

  // 3. Stream media file (supports Range requests for HTML5 <video> live wallpapers)
  app.get('/api/media/:fileName', (req, res) => {
    const safeFile = path.basename(req.params.fileName);
    const filePath = path.join(MEDIA_DIR, safeFile);
    if (!fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(safeFile).toLowerCase();
    const contentType =
      ext === '.mp4'
        ? 'video/mp4'
        : ext === '.webm'
        ? 'video/webm'
        : ext === '.gif'
        ? 'image/gif'
        : ext === '.webp'
        ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : 'image/png';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // 4. Delete a wallpaper
  app.delete('/api/wallpapers/:id', (req, res) => {
    const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '');
    const items = readStoredWallpapers();
    const target = items.find((w) => w.id === safeId);
    if (target?.mediaUrl) {
      const fileName = path.basename(target.mediaUrl);
      const filePath = path.join(MEDIA_DIR, fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
      }
    }
    const next = items.filter((w) => w.id !== safeId);
    writeStoredWallpapers(next);
    res.json({ ok: true });
  });

  // 5. Increment download or save counter on server
  app.post('/api/wallpapers/:id/metric', (req, res) => {
    const safeId = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '');
    const { type } = req.body as { type: 'download' | 'save' };
    const items = readStoredWallpapers();
    const updated = items.map((w) => {
      if (w.id !== safeId) return w;
      return {
        ...w,
        downloadsCount: type === 'download' ? (w.downloadsCount || 0) + 1 : w.downloadsCount,
        savesCount: type === 'save' ? (w.savesCount || 0) + 1 : w.savesCount,
      };
    });
    writeStoredWallpapers(updated);
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MR Wallpapers server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
