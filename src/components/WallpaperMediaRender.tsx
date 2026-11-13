import React, { useEffect, useState } from 'react';
import { WallpaperItem } from '../types';
import { getMasterBlobFromIDB } from '../utils/mediaEngine';
import { LiveCanvasPreview } from './LiveCanvasPreview';

interface WallpaperMediaRenderProps {
  wallpaper: WallpaperItem;
  animate?: boolean;
  className?: string;
}

export const WallpaperMediaRender: React.FC<WallpaperMediaRenderProps> = ({
  wallpaper,
  animate = true,
  className = 'w-full h-auto object-cover block',
}) => {
  const [resolvedBlobUrl, setResolvedBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentObjectUrl: string | null = null;

    async function resolveLocalBlob() {
      const blob = await getMasterBlobFromIDB(wallpaper.id);
      if (active && blob) {
        currentObjectUrl = URL.createObjectURL(blob);
        setResolvedBlobUrl(currentObjectUrl);
      } else if (active) {
        setResolvedBlobUrl(null);
      }
    }

    resolveLocalBlob();

    return () => {
      active = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [wallpaper.id]);

  // 1. Procedural 60FPS Live Wallpaper
  if (wallpaper.livePresetId) {
    return (
      <LiveCanvasPreview
        presetId={wallpaper.livePresetId}
        animate={animate}
        className={className}
      />
    );
  }

  // 2. Uploaded Live Video Wallpaper (.mp4, .webm, .mov, or video blob)
  const videoSrc =
    resolvedBlobUrl ||
    (wallpaper.mediaUrl &&
    (wallpaper.mediaUrl.endsWith('.mp4') ||
      wallpaper.mediaUrl.endsWith('.webm') ||
      wallpaper.mimeType?.startsWith('video/'))
      ? wallpaper.mediaUrl
      : wallpaper.previewDataUrl.startsWith('data:video/')
      ? wallpaper.previewDataUrl
      : null);

  if (wallpaper.mediaType === 'live' && videoSrc) {
    return (
      <video
        src={videoSrc}
        poster={
          wallpaper.previewDataUrl.startsWith('data:image/')
            ? wallpaper.previewDataUrl
            : undefined
        }
        autoPlay={animate}
        loop
        muted
        playsInline
        preload="auto"
        className={className}
      />
    );
  }

  // 3. Static Image or Animated GIF Wallpaper
  const imageSrc = resolvedBlobUrl || wallpaper.mediaUrl || wallpaper.previewDataUrl;

  return (
    <img
      src={imageSrc}
      alt={wallpaper.title}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const target = e.currentTarget;
        if (target.src !== wallpaper.previewDataUrl && wallpaper.previewDataUrl) {
          target.src = wallpaper.previewDataUrl;
        }
      }}
      className={className}
    />
  );
};
