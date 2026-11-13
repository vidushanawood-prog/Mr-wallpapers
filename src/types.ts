export type WallpaperCategory =
  | 'Abstract'
  | 'Cyber'
  | 'Nature'
  | 'Architecture'
  | 'Minimal'
  | 'Anime'
  | 'Space'
  | 'Live Motion';

export type WallpaperMediaType = 'static' | 'live';

export type WallpaperAspectRatio = '9:16' | '16:9' | '4:3' | '1:1' | '21:9';

export interface WallpaperItem {
  id: string;
  title: string;
  description: string;
  category: WallpaperCategory;
  mediaType: WallpaperMediaType;
  aspectRatio: WallpaperAspectRatio;
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
  isLocalOnly?: boolean;
  livePresetId?: string;
}

export interface UserPublicRecord {
  uid: string;
  displayName: string;
  role: 'member' | 'creator';
  createdAt: string;
}

export interface UserPrivateRecord {
  uid: string;
  email: string;
  displayName: string;
  accountType: 'signin' | 'register';
  createdAt: string;
}

export interface SavedPinRecord {
  id: string;
  userId: string;
  wallpaperId: string;
  boardName: string;
  createdAt: string;
}

export interface AppSettings {
  gridDensity: 'comfortable' | 'compact' | 'gallery';
  defaultDownloadFormat: 'master_25mb' | 'uhd_8k' | 'uhd_4k' | 'original';
  livePlaybackMode: 'always' | 'hover' | 'saver';
  turboFastCache: boolean;
  accentColorHex: '#E11D48' | '#F59E0B' | '#2563EB';
}

export const BLUEPRINT_CONSTRAINTS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  MAX_ID_LENGTH: 128,
  MAX_DISPLAY_NAME: 80,
  MAX_EMAIL: 160,
  MAX_TITLE: 120,
  MAX_DESCRIPTION: 600,
  MAX_RESOLUTION_LABEL: 40,
  MAX_PREVIEW_DATA_URL: 750000,
  MAX_CHUNK_DATA: 800000,
  MAX_BOARD_NAME: 60,
} as const;

export const CATEGORIES: WallpaperCategory[] = [
  'Abstract',
  'Cyber',
  'Nature',
  'Architecture',
  'Minimal',
  'Anime',
  'Space',
  'Live Motion',
];

export const ASPECT_RATIOS: { value: WallpaperAspectRatio; label: string; device: string }[] = [
  { value: '9:16', label: '9:16 Vertical', device: 'Mobile OLED' },
  { value: '16:9', label: '16:9 Widescreen', device: 'Desktop 4K/8K' },
  { value: '21:9', label: '21:9 Cinema', device: 'Ultrawide Monitor' },
  { value: '4:3', label: '4:3 Editorial', device: 'Tablet / Studio' },
  { value: '1:1', label: '1:1 Square', device: 'Cover / Frame' },
];
