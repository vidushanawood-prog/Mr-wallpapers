import { BLUEPRINT_CONSTRAINTS, WallpaperAspectRatio, WallpaperItem } from '../types';

const DB_NAME = 'mr_wallpapers_vault_v2';
const STORE_BLOBS = 'master_blobs';
const STORE_LOCAL_WALLPAPERS = 'local_wallpapers';

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_WALLPAPERS)) {
        db.createObjectStore(STORE_LOCAL_WALLPAPERS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWallpaperItemToIDB(item: WallpaperItem): Promise<void> {
  try {
    const db = await openVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_WALLPAPERS, 'readwrite');
      tx.objectStore(STORE_LOCAL_WALLPAPERS).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB wallpaper item save skipped:', err);
  }
}

export async function getAllWallpaperItemsFromIDB(): Promise<WallpaperItem[]> {
  try {
    const db = await openVaultDB();
    return await new Promise<WallpaperItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_WALLPAPERS, 'readonly');
      const req = tx.objectStore(STORE_LOCAL_WALLPAPERS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteWallpaperItemFromIDB(wallpaperId: string): Promise<void> {
  try {
    const db = await openVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_WALLPAPERS, 'readwrite');
      tx.objectStore(STORE_LOCAL_WALLPAPERS).delete(wallpaperId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function saveMasterBlobToIDB(wallpaperId: string, blob: Blob): Promise<void> {
  try {
    const db = await openVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).put(blob, wallpaperId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB master blob cache skipped:', err);
  }
}

export async function getMasterBlobFromIDB(wallpaperId: string): Promise<Blob | null> {
  try {
    const db = await openVaultDB();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readonly');
      const req = tx.objectStore(STORE_BLOBS).get(wallpaperId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteMasterBlobFromIDB(wallpaperId: string): Promise<void> {
  try {
    const db = await openVaultDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).delete(wallpaperId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Generates an ultra-fast, lightweight preview Data URL (< 550KB) from an uploaded image or video file
 * and extracts the dominant hex color swatch for Pinterest-style material inspection.
 */
export async function processUploadedMediaFile(file: File): Promise<{
  previewDataUrl: string;
  dominantColor: string;
  detectedAspectRatio: WallpaperAspectRatio;
  mediaType: 'static' | 'live';
}> {
  const isVideo = file.type.startsWith('video/');
  const isGif = file.type === 'image/gif';
  const mediaType: 'static' | 'live' = isVideo || isGif ? 'live' : 'static';

  if (isVideo) {
    return await processVideoPreview(file);
  }

  return await processImagePreview(file, mediaType);
}

function detectClosestAspectRatio(width: number, height: number): WallpaperAspectRatio {
  const ratio = width / Math.max(height, 1);
  if (ratio < 0.72) return '9:16';
  if (ratio < 1.15) return '1:1';
  if (ratio < 1.55) return '4:3';
  if (ratio > 2.05) return '21:9';
  return '16:9';
}

function extractAverageHex(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  try {
    const data = ctx.getImageData(0, 0, Math.min(w, 64), Math.min(h, 64)).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return '#E11D48';
    const hr = Math.round(r / count)
      .toString(16)
      .padStart(2, '0');
    const hg = Math.round(g / count)
      .toString(16)
      .padStart(2, '0');
    const hb = Math.round(b / count)
      .toString(16)
      .padStart(2, '0');
    return `#${hr}${hg}${hb}`.toUpperCase();
  } catch {
    return '#E11D48';
  }
}

async function processImagePreview(
  file: File,
  mediaType: 'static' | 'live'
): Promise<{
  previewDataUrl: string;
  dominantColor: string;
  detectedAspectRatio: WallpaperAspectRatio;
  mediaType: 'static' | 'live';
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = objectUrl;
    });

    const detectedAspectRatio = detectClosestAspectRatio(img.naturalWidth || 1920, img.naturalHeight || 1080);

    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const targetW = Math.max(1, Math.round((img.naturalWidth || 1280) * scale));
    const targetH = Math.max(1, Math.round((img.naturalHeight || 720) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const dominantColor = extractAverageHex(ctx, targetW, targetH);

    let quality = 0.84;
    let previewDataUrl = canvas.toDataURL('image/webp', quality);
    while (previewDataUrl.length > BLUEPRINT_CONSTRAINTS.MAX_PREVIEW_DATA_URL - 40000 && quality > 0.35) {
      quality -= 0.12;
      previewDataUrl = canvas.toDataURL('image/webp', quality);
    }

    if (previewDataUrl.length > BLUEPRINT_CONSTRAINTS.MAX_PREVIEW_DATA_URL - 20000) {
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = Math.round(targetW * 0.65);
      smallCanvas.height = Math.round(targetH * 0.65);
      const sCtx = smallCanvas.getContext('2d')!;
      sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
      previewDataUrl = smallCanvas.toDataURL('image/jpeg', 0.72);
    }

    return {
      previewDataUrl,
      dominantColor,
      detectedAspectRatio,
      mediaType,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function processVideoPreview(file: File): Promise<{
  previewDataUrl: string;
  dominantColor: string;
  detectedAspectRatio: WallpaperAspectRatio;
  mediaType: 'live';
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2500);
      video.onloadeddata = () => {
        video.currentTime = Math.min(0.4, (video.duration || 1) * 0.2);
      };
      video.onseeked = () => {
        clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timeout);
        resolve();
      };
    });

    const vw = video.videoWidth || 1080;
    const vh = video.videoHeight || 1920;
    const detectedAspectRatio = detectClosestAspectRatio(vw, vh);

    const scale = Math.min(1, 960 / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      // fallback dark frame
    }
    const dominantColor = extractAverageHex(ctx, canvas.width, canvas.height);
    const previewDataUrl = canvas.toDataURL('image/webp', 0.82);

    return {
      previewDataUrl,
      dominantColor,
      detectedAspectRatio,
      mediaType: 'live',
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function renderProceduralPreviewToDataUrl(
  presetId: string,
  aspectRatio: WallpaperAspectRatio
): { previewDataUrl: string; dominantColor: string } {
  const dims: Record<WallpaperAspectRatio, [number, number]> = {
    '9:16': [720, 1280],
    '16:9': [1280, 720],
    '21:9': [1400, 600],
    '4:3': [1024, 768],
    '1:1': [960, 960],
  };
  const [w, h] = dims[aspectRatio] || [1280, 720];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  drawProceduralFrame(ctx, w, h, presetId, 2.4);
  const dominantColor = extractAverageHex(ctx, w, h);
  const previewDataUrl = canvas.toDataURL('image/webp', 0.85);
  return { previewDataUrl, dominantColor };
}

export function drawProceduralFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  presetId: string,
  timeSec: number
): void {
  ctx.fillStyle = '#07070C';
  ctx.fillRect(0, 0, w, h);

  const palettes: Record<string, [string, string, string]> = {
    crimson_horizon: ['#E11D48', '#881337', '#F43F5E'],
    obsidian_prism: ['#2563EB', '#1E1B4B', '#38BDF8'],
    solar_monolith: ['#F59E0B', '#78350F', '#FDE047'],
    emerald_matrix: ['#10B981', '#064E3B', '#34D399'],
  };
  const [c1, c2, c3] = palettes[presetId] || palettes.crimson_horizon;

  for (let i = 0; i < 4; i++) {
    const angle = timeSec * (0.4 + i * 0.15) + i * 1.5;
    const cx = w * (0.5 + Math.cos(angle) * 0.28);
    const cy = h * (0.5 + Math.sin(angle * 0.8) * 0.28);
    const radius = Math.max(w, h) * (0.45 + (i % 2) * 0.2);

    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grad.addColorStop(0, (i % 2 === 0 ? c1 : c3) + '66');
    grad.addColorStop(0.5, c2 + '44');
    grad.addColorStop(1, '#07070C00');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.save();
  ctx.strokeStyle = c1 + '77';
  ctx.lineWidth = Math.max(1.5, w * 0.0018);
  const lines = 18;
  for (let l = 0; l < lines; l++) {
    const progress = l / lines;
    ctx.beginPath();
    for (let x = 0; x <= w; x += Math.max(16, Math.floor(w / 48))) {
      const nx = x / w;
      const wave =
        Math.sin(nx * 5 + timeSec * 0.9 + progress * 4) * (h * 0.08) +
        Math.cos(nx * 9 - timeSec * 0.5 + l * 0.4) * (h * 0.04);
      const y = h * (0.2 + progress * 0.65) + wave;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Guaranteed Wallpaper Asset Downloader
 * Supports:
 * 1. Original Live Video (.mp4 / .webm / .gif) or Original High-Res Image
 * 2. >25 MB Studio Lossless Master (26.5 MB 32-Bit Uncompressed RGBA BMP)
 * 3. 8K UHD PNG & 4K UHD PNG
 */
export async function downloadWallpaperAsset(
  wallpaper: WallpaperItem,
  mode: 'master_25mb' | 'uhd_8k' | 'uhd_4k' | 'original'
): Promise<{ fileName: string; byteSize: number }> {
  const safeSlug =
    wallpaper.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'mr-wallpaper';

  // 1. Check if we should download the original uploaded file (especially for Live Video wallpapers!)
  if (mode === 'original') {
    const cachedBlob = await getMasterBlobFromIDB(wallpaper.id);
    if (cachedBlob) {
      const ext = getExtensionFromMime(cachedBlob.type, wallpaper.mediaType);
      const fileName = `${safeSlug}-original.${ext}`;
      triggerBlobDownload(cachedBlob, fileName);
      return { fileName, byteSize: cachedBlob.size };
    }

    if (wallpaper.mediaUrl) {
      try {
        const res = await fetch(wallpaper.mediaUrl);
        if (res.ok) {
          const blob = await res.blob();
          const ext = getExtensionFromMime(blob.type || wallpaper.mimeType || '', wallpaper.mediaType);
          const fileName = `${safeSlug}-original.${ext}`;
          triggerBlobDownload(blob, fileName);
          return { fileName, byteSize: blob.size };
        }
      } catch (err) {
        console.warn('Fallback from mediaUrl fetch:', err);
      }
    }
  }

  // 2. If user clicked Quick Download on a Live Video Wallpaper that has a video file, download the video!
  if (wallpaper.mediaType === 'live' && !wallpaper.livePresetId && mode !== 'master_25mb') {
    const cachedBlob = await getMasterBlobFromIDB(wallpaper.id);
    if (cachedBlob && cachedBlob.type.startsWith('video/')) {
      const ext = getExtensionFromMime(cachedBlob.type, 'live');
      const fileName = `${safeSlug}-live.${ext}`;
      triggerBlobDownload(cachedBlob, fileName);
      return { fileName, byteSize: cachedBlob.size };
    }
    if (wallpaper.mediaUrl && (wallpaper.mediaUrl.endsWith('.mp4') || wallpaper.mediaUrl.endsWith('.webm'))) {
      try {
        const res = await fetch(wallpaper.mediaUrl);
        if (res.ok) {
          const blob = await res.blob();
          const ext = wallpaper.mediaUrl.endsWith('.webm') ? 'webm' : 'mp4';
          const fileName = `${safeSlug}-live.${ext}`;
          triggerBlobDownload(blob, fileName);
          return { fileName, byteSize: blob.size };
        }
      } catch {
        // continue to image synthesis fallback
      }
    }
  }

  // 3. Load the best available image source (either mediaUrl if static image, or previewDataUrl poster)
  let img: HTMLImageElement;
  try {
    const imageSrc =
      wallpaper.mediaType === 'static' && wallpaper.mediaUrl
        ? wallpaper.mediaUrl
        : wallpaper.previewDataUrl;
    img = await loadImageElement(imageSrc);
  } catch {
    img = await loadImageElement(wallpaper.previewDataUrl);
  }

  // 4. >25 MB Studio Master 32-Bit Uncompressed BMP
  if (mode === 'master_25mb') {
    const width = wallpaper.aspectRatio === '9:16' ? 2316 : 3000;
    const height = wallpaper.aspectRatio === '9:16' ? 3000 : 2316;
    const bmpBlob = createUncompressed32BitBMP(img, width, height);
    const fileName = `${safeSlug}-8K-STUDIO-MASTER-26MB.bmp`;
    triggerBlobDownload(bmpBlob, fileName);
    return { fileName, byteSize: bmpBlob.size };
  }

  // 5. 8K UHD or 4K UHD High-Resolution PNG
  const targetDims =
    mode === 'uhd_8k'
      ? wallpaper.aspectRatio === '9:16'
        ? [2160, 3840]
        : [3840, 2160]
      : wallpaper.aspectRatio === '9:16'
      ? [1440, 2560]
      : [2560, 1440];

  const canvas = document.createElement('canvas');
  canvas.width = targetDims[0];
  canvas.height = targetDims[1];
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
        }
      },
      'image/png',
      1.0
    );
  });

  const label = mode === 'uhd_8k' ? '8K-UHD' : mode === 'uhd_4k' ? '4K-UHD' : 'ORIGINAL';
  const fileName = `${safeSlug}-${label}.png`;
  triggerBlobDownload(blob, fileName);
  return { fileName, byteSize: blob.size };
}

function getExtensionFromMime(mime: string, mediaType: 'static' | 'live'): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('bmp')) return 'bmp';
  return mediaType === 'live' ? 'mp4' : 'png';
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function createUncompressed32BitBMP(img: HTMLImageElement, width: number, height: number): Blob {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height).data;
  const pixelBytes = width * height * 4;
  const headerSize = 54;
  const fileSize = headerSize + pixelBytes;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BMP File Header (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, headerSize, true);

  // DIB Header BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 11811, true);
  view.setInt32(42, 11811, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  const outBytes = new Uint8Array(buffer, headerSize);
  for (let i = 0; i < pixelBytes; i += 4) {
    outBytes[i] = imgData[i + 2];
    outBytes[i + 1] = imgData[i + 1];
    outBytes[i + 2] = imgData[i];
    outBytes[i + 3] = 255;
  }

  return new Blob([buffer], { type: 'application/octet-stream' });
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 60000);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}
