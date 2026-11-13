import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Bookmark,
  Check,
  Monitor,
  Smartphone,
  Sparkles,
  Copy,
  Share2,
} from 'lucide-react';
import { WallpaperItem } from '../types';
import { downloadWallpaperAsset, formatBytes } from '../utils/mediaEngine';
import { WallpaperMediaRender } from './WallpaperMediaRender';

interface WallpaperLightboxProps {
  wallpaper: WallpaperItem | null;
  onClose: () => void;
  onSavePin: (wallpaper: WallpaperItem, boardName: string) => void;
  onIncrementDownload: (wallpaper: WallpaperItem) => void;
  isSaved: boolean;
  defaultDownloadFormat: 'master_25mb' | 'uhd_8k' | 'uhd_4k' | 'original';
}

const PINTEREST_BOARDS = [
  'Obsidian Desk Setups',
  'OLED Mobile 9:16',
  'Live Motion Vault',
  'Minimalist Architecture',
];

export const WallpaperLightbox: React.FC<WallpaperLightboxProps> = ({
  wallpaper,
  onClose,
  onSavePin,
  onIncrementDownload,
  isSaved,
  defaultDownloadFormat,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<
    'master_25mb' | 'uhd_8k' | 'uhd_4k' | 'original'
  >(defaultDownloadFormat);
  const [selectedBoard, setSelectedBoard] = useState(PINTEREST_BOARDS[0]);
  const [previewFrame, setPreviewFrame] = useState<'raw' | 'desktop' | 'mobile'>('raw');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadReceipt, setDownloadReceipt] = useState<string | null>(null);
  const [copiedHex, setCopiedHex] = useState(false);
  const [sharedLink, setSharedLink] = useState(false);

  useEffect(() => {
    if (wallpaper) {
      if (wallpaper.mediaType === 'live' && !wallpaper.livePresetId) {
        setSelectedFormat('original');
      } else {
        setSelectedFormat(defaultDownloadFormat);
      }
      setDownloadReceipt(null);
    }
  }, [wallpaper, defaultDownloadFormat]);

  if (!wallpaper) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadReceipt(null);
    try {
      const result = await downloadWallpaperAsset(wallpaper, selectedFormat);
      onIncrementDownload(wallpaper);
      setDownloadReceipt(`Download started: ${result.fileName} (${formatBytes(result.byteSize)})`);
    } catch (err) {
      setDownloadReceipt(
        err instanceof Error ? `Download notice: ${err.message}` : 'Download completed.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const copyHex = () => {
    navigator.clipboard?.writeText(wallpaper.accentColor);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 1800);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setSharedLink(true);
    setTimeout(() => setSharedLink(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
    >
      <div className="relative w-full max-w-6xl rounded-2xl bg-[#0E0E14] border border-zinc-800 overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-12 my-auto max-h-[92vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-lg bg-black/70 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close inspector"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Media Stage (7 Cols) */}
        <div className="lg:col-span-7 bg-[#06060A] flex flex-col justify-between p-6 border-b lg:border-b-0 lg:border-r border-zinc-800/80 min-h-[380px]">
          {/* Frame Preview Switcher */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
              <button
                type="button"
                onClick={() => setPreviewFrame('raw')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  previewFrame === 'raw' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Unframed Master
              </button>
              <button
                type="button"
                onClick={() => setPreviewFrame('desktop')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                  previewFrame === 'desktop'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop 16:9</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewFrame('mobile')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                  previewFrame === 'mobile'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobile 9:16</span>
              </button>
            </div>

            <span className="text-xs font-mono-tabular text-zinc-400">
              {wallpaper.mediaType === 'live' ? '60FPS LIVE MOTION' : 'LOSSLESS RAW'} ·{' '}
              {wallpaper.aspectRatio}
            </span>
          </div>

          {/* Center Media Frame */}
          <div className="flex-1 flex items-center justify-center py-2">
            <div
              className={`relative overflow-hidden transition-all duration-200 ${
                previewFrame === 'mobile'
                  ? 'w-56 aspect-[9/16] rounded-3xl border-4 border-zinc-700 shadow-2xl'
                  : previewFrame === 'desktop'
                  ? 'w-full max-w-xl aspect-video rounded-xl border-4 border-zinc-700 shadow-2xl'
                  : 'w-full max-h-[52vh] rounded-xl flex items-center justify-center'
              }`}
            >
              <WallpaperMediaRender
                wallpaper={wallpaper}
                animate={true}
                className={`w-full h-full ${
                  previewFrame === 'raw' ? 'max-h-[52vh] object-contain' : 'object-cover'
                }`}
              />
            </div>
          </div>

          {/* Bottom Material Metadata Strip */}
          <div className="mt-4 pt-4 border-t border-zinc-900 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
            <div>
              <span>Curated by </span>
              <strong className="text-white">{wallpaper.authorName}</strong>
              <span aria-hidden="true"> · </span>
              <span>{wallpaper.category}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono-tabular">{wallpaper.resolutionLabel}</span>
            </div>
            <button
              type="button"
              onClick={copyHex}
              className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer"
            >
              <span
                className="w-3.5 h-3.5 rounded-sm border border-white/20"
                style={{ backgroundColor: wallpaper.accentColor }}
              />
              <span className="font-mono-tabular">
                {copiedHex ? 'Copied Hex!' : wallpaper.accentColor}
              </span>
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right Pinterest Material & Download Inspector (5 Cols) */}
        <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto max-h-[92vh]">
          <div className="space-y-6">
            {/* Top Pinterest Board Save Bar */}
            <div className="flex items-center justify-between gap-2 pr-10">
              <div className="flex items-center gap-2 flex-1">
                <select
                  value={selectedBoard}
                  onChange={(e) => setSelectedBoard(e.target.value)}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#E11D48]"
                >
                  {PINTEREST_BOARDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onSavePin(wallpaper, selectedBoard)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
                  }`}
                >
                  {isSaved ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                  <span>{isSaved ? 'Saved to Board' : 'Save Pin'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleShare}
                className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Copy direct link"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {sharedLink && (
              <p className="text-xs text-emerald-400">Wallpaper link copied to clipboard.</p>
            )}

            {/* Title & Description */}
            <div>
              <h2
                id="lightbox-title"
                className="font-display text-2xl font-bold text-white tracking-tight"
              >
                {wallpaper.title}
              </h2>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{wallpaper.description}</p>
            </div>

            {/* Download Resolution Tier Selector */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-zinc-300">
                Select Download Quality &amp; File Format
              </label>

              {[
                {
                  id: 'original' as const,
                  title:
                    wallpaper.mediaType === 'live'
                      ? 'Original Live Motion Video (.MP4 / .WEBM)'
                      : 'Original Uploaded Master File',
                  spec: `${wallpaper.resolutionLabel} · ${formatBytes(wallpaper.fileSizeBytes)}`,
                },
                {
                  id: 'master_25mb' as const,
                  title: '8K Studio Lossless Master (>25 MB)',
                  spec: '3000×2316 · 32-Bit Uncompressed RGBA BMP · 26.5 MB',
                },
                {
                  id: 'uhd_8k' as const,
                  title: '8K Ultra HD Display Edition (.PNG)',
                  spec: '3840×2160 · High-Density Lossless PNG',
                },
                {
                  id: 'uhd_4k' as const,
                  title: '2K / 4K Retina Mobile & Desktop (.PNG)',
                  spec: '2560×1440 · Instant Fast-Decode PNG',
                },
              ].map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedFormat(tier.id)}
                  className={`w-full p-3.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    selectedFormat === tier.id
                      ? 'bg-zinc-900/90 border-[#E11D48] text-white'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div>
                    <p className="text-xs font-semibold text-white">{tier.title}</p>
                    <p className="text-[11px] font-mono-tabular text-zinc-400 mt-0.5">{tier.spec}</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      selectedFormat === tier.id
                        ? 'border-[#E11D48] bg-[#E11D48]'
                        : 'border-zinc-700'
                    }`}
                  >
                    {selectedFormat === tier.id && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </button>
              ))}
            </div>

            {downloadReceipt && (
              <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/70 text-xs text-emerald-200 font-mono-tabular">
                {downloadReceipt}
              </div>
            )}
          </div>

          {/* Primary Download CTA */}
          <div className="pt-6 mt-6 border-t border-zinc-800 space-y-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full py-3.5 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-950/50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isDownloading
                  ? 'Starting High-Speed Download...'
                  : selectedFormat === 'master_25mb'
                  ? 'Download >25 MB Lossless Master Now'
                  : selectedFormat === 'original' && wallpaper.mediaType === 'live'
                  ? 'Download Live Wallpaper Video Now'
                  : 'Download Wallpaper Now'}
              </span>
            </button>

            <div className="flex items-center justify-between text-xs text-zinc-500 font-mono-tabular">
              <span>Downloads: {wallpaper.downloadsCount}</span>
              <span>Board Saves: {wallpaper.savesCount}</span>
              <span className="flex items-center gap-1 text-zinc-400">
                <Sparkles className="w-3 h-3 text-[#E11D48]" />
                Free Personal &amp; Studio Use
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
