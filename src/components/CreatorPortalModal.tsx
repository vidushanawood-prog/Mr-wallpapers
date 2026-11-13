import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Film,
  Image as ImageIcon,
  Database,
  CheckCircle2,
  Trash2,
  CloudUpload,
  Play,
  Lock,
} from 'lucide-react';
import { User, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  ASPECT_RATIOS,
  BLUEPRINT_CONSTRAINTS,
  CATEGORIES,
  UserPrivateRecord,
  WallpaperAspectRatio,
  WallpaperCategory,
  WallpaperItem,
} from '../types';
import {
  fileToDataUrl,
  formatBytes,
  processUploadedMediaFile,
  renderProceduralPreviewToDataUrl,
  saveMasterBlobToIDB,
  saveWallpaperItemToIDB,
} from '../utils/mediaEngine';
import { LiveCanvasPreview } from './LiveCanvasPreview';
import { WallpaperMediaRender } from './WallpaperMediaRender';

interface CreatorPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLockPortal: () => void;
  currentUser: User | null;
  onWallpaperPublished: (item: WallpaperItem) => void;
  onDeleteWallpaper: (id: string) => void;
  wallpapers: WallpaperItem[];
  registeredEmails: UserPrivateRecord[];
}

const LIVE_SHADER_PRESETS = [
  { id: 'crimson_horizon', name: 'Crimson Horizon 60FPS', accent: '#E11D48' },
  { id: 'obsidian_prism', name: 'Obsidian Cobalt Prism', accent: '#2563EB' },
  { id: 'solar_monolith', name: 'Solar Gold Monolith', accent: '#F59E0B' },
  { id: 'emerald_matrix', name: 'Emerald Fluid Contour', accent: '#10B981' },
];

export const CreatorPortalModal: React.FC<CreatorPortalModalProps> = ({
  isOpen,
  onClose,
  onLockPortal,
  currentUser,
  onWallpaperPublished,
  onDeleteWallpaper,
  wallpapers,
  registeredEmails,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'live_synthesizer' | 'database' | 'manage'>('upload');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<WallpaperCategory>('Cyber');
  const [aspectRatio, setAspectRatio] = useState<WallpaperAspectRatio>('16:9');
  const [resolutionLabel, setResolutionLabel] = useState('8K RAW · >25MB Master');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localFileObjectUrl, setLocalFileObjectUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detectedMediaType, setDetectedMediaType] = useState<'static' | 'live'>('static');
  const [dominantColor, setDominantColor] = useState('#E11D48');
  const [selectedPreset, setSelectedPreset] = useState(LIVE_SHADER_PRESETS[0].id);
  const [isPublishing, setIsPublishing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (localFileObjectUrl) {
        URL.revokeObjectURL(localFileObjectUrl);
      }
    };
  }, [localFileObjectUrl]);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setFeedback(null);
    setSelectedFile(file);

    if (localFileObjectUrl) {
      URL.revokeObjectURL(localFileObjectUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setLocalFileObjectUrl(objUrl);

    if (!title.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      setTitle(baseName.slice(0, BLUEPRINT_CONSTRAINTS.MAX_TITLE));
    }

    try {
      const processed = await processUploadedMediaFile(file);
      setPreviewUrl(processed.previewDataUrl);
      setDominantColor(processed.dominantColor);
      setAspectRatio(processed.detectedAspectRatio);
      setDetectedMediaType(processed.mediaType);
      if (processed.mediaType === 'live') {
        setCategory('Live Motion');
        setResolutionLabel('4K 60FPS Live Motion');
      } else if (file.size > 25 * 1024 * 1024) {
        setResolutionLabel(`8K Master · ${formatBytes(file.size)}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not process media file.');
    }
  };

  const publishWallpaper = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);

    if (activeTab === 'upload' && !previewUrl && !selectedFile) {
      setErrorMsg('Please select a static image or live video wallpaper file first.');
      return;
    }

    setIsPublishing(true);
    try {
      const rawId = `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const cleanId = rawId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH);

      let finalPreviewUrl = previewUrl || '';
      let finalColor = dominantColor;
      let finalMediaType: 'static' | 'live' = detectedMediaType;
      let finalByteSize = selectedFile ? selectedFile.size : 27792000;

      if (activeTab === 'live_synthesizer') {
        const rendered = renderProceduralPreviewToDataUrl(selectedPreset, aspectRatio);
        finalPreviewUrl = rendered.previewDataUrl;
        finalColor = rendered.dominantColor;
        finalMediaType = 'live';
        finalByteSize = 28450000;
      }

      const cleanTitle = (title.trim() || 'Vidusha Signature Edition').slice(
        0,
        BLUEPRINT_CONSTRAINTS.MAX_TITLE
      );
      const cleanDesc = (
        description.trim() ||
        'Curated high-bit-depth master wallpaper by Vidusha. Supports >25MB 32-bit uncompressed studio download.'
      ).slice(0, BLUEPRINT_CONSTRAINTS.MAX_DESCRIPTION);
      const cleanRes = (resolutionLabel.trim() || '8K RAW · >25MB Master').slice(
        0,
        BLUEPRINT_CONSTRAINTS.MAX_RESOLUTION_LABEL
      );

      // 1. Save full raw Blob in IndexedDB so local playback & downloads are instant
      if (selectedFile) {
        await saveMasterBlobToIDB(cleanId, selectedFile);
      }

      const activeUser = auth.currentUser;
      const authorUid = (activeUser?.uid || 'vidusha_creator').slice(
        0,
        BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH
      );

      let newItem: WallpaperItem = {
        id: cleanId,
        title: cleanTitle,
        description: cleanDesc,
        category: activeTab === 'live_synthesizer' ? 'Live Motion' : category,
        mediaType: finalMediaType,
        aspectRatio,
        resolutionLabel: cleanRes,
        fileSizeBytes: finalByteSize,
        previewDataUrl: finalPreviewUrl.slice(0, BLUEPRINT_CONSTRAINTS.MAX_PREVIEW_DATA_URL),
        mimeType: selectedFile?.type || (finalMediaType === 'live' ? 'video/mp4' : 'image/png'),
        accentColor: finalColor.slice(0, 20),
        authorId: authorUid,
        authorName: 'Vidusha',
        visibility: 'public',
        downloadsCount: 0,
        savesCount: 0,
        createdAt: new Date().toISOString(),
        isLocalOnly: !activeUser,
        livePresetId: activeTab === 'live_synthesizer' ? selectedPreset : undefined,
      };

      // 2. Upload to Express Server (/api/wallpapers) so video streaming & shared host links work immediately
      try {
        let base64Media: string | undefined;
        if (selectedFile && selectedFile.size <= 110 * 1024 * 1024) {
          base64Media = await fileToDataUrl(selectedFile);
        }
        const resp = await fetch('/api/wallpapers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: newItem,
            base64Media,
            mimeType: selectedFile?.type,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.wallpaper?.mediaUrl) {
            newItem = {
              ...newItem,
              mediaUrl: data.wallpaper.mediaUrl,
            };
          }
        }
      } catch (serverErr) {
        console.warn('Server media sync skipped:', serverErr);
      }

      // 3. Save full item metadata to IndexedDB
      await saveWallpaperItemToIDB(newItem);

      // 4. Sync to Firestore if signed in
      if (activeUser) {
        const wpRef = doc(db, 'wallpapers', cleanId);
        try {
          await setDoc(wpRef, {
            title: newItem.title,
            description: newItem.description,
            category: newItem.category,
            mediaType: newItem.mediaType,
            aspectRatio: newItem.aspectRatio,
            resolutionLabel: newItem.resolutionLabel,
            fileSizeBytes: Math.min(1073741824, Math.max(0, Math.round(newItem.fileSizeBytes))),
            previewDataUrl: newItem.previewDataUrl,
            accentColor: newItem.accentColor,
            authorId: activeUser.uid,
            authorName: newItem.authorName,
            visibility: 'public',
            downloadsCount: 0,
            savesCount: 0,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn('Firestore sync warning:', err);
        }
      }

      onWallpaperPublished(newItem);
      setFeedback(`"${cleanTitle}" is now live and playing on the home screen!`);
      setTitle('');
      setDescription('');
      setSelectedFile(null);
      setPreviewUrl(null);
      if (localFileObjectUrl) {
        URL.revokeObjectURL(localFileObjectUrl);
        setLocalFileObjectUrl(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleQuickCloudSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setFeedback('Creator Cloud Identity verified! All uploads sync to Firestore.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in cancelled.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-title"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-[#0E0E14] border border-zinc-800 p-6 sm:p-8 shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <p className="text-xs font-mono-tabular text-[#E11D48] mb-1">
              PRIVATE CREATOR STUDIO · VIDUSHA ONLY
            </p>
            <h2 id="portal-title" className="font-display text-2xl sm:text-3xl font-bold text-white">
              MR Wallpapers Upload Studio
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Upload static 8K wallpapers and live video wallpapers. Everything uploaded here appears and plays immediately on the home screen.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onLockPortal}
              className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Hide upload icon from header until you search your keyword again"
            >
              <Lock className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>Hide Upload Icon</span>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Close Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cloud Sync Status Bar */}
        <div className="mt-5 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/90 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-300">
            {currentUser ? (
              <span>
                Server &amp; Cloud Sync Active · Signed in as{' '}
                <strong className="text-white">{currentUser.email || currentUser.displayName}</strong>
              </span>
            ) : (
              <span>
                Server Streaming Vault Active · Connect Google Auth to also sync to Firestore
              </span>
            )}
          </div>
          {!currentUser && (
            <button
              type="button"
              onClick={handleQuickCloudSignIn}
              className="px-3.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Connect Creator Cloud Auth
            </button>
          )}
        </div>

        {/* Mode Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl mt-6 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'upload' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image / Live Video</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('live_synthesizer')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'live_synthesizer' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Live 60FPS Motion Generator</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'manage' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Manage Uploads ({wallpapers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'database' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Registered Emails DB ({registeredEmails.length})</span>
          </button>
        </div>

        {/* Tab 1 & 2: Upload Form or Live Motion Synthesizer */}
        {(activeTab === 'upload' || activeTab === 'live_synthesizer') && (
          <form onSubmit={publishWallpaper} className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Media Dropzone / Live Shader Picker */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {activeTab === 'upload' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative min-h-[280px] rounded-2xl border-2 border-dashed border-zinc-700 hover:border-[#E11D48] bg-zinc-950/90 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors overflow-hidden"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {localFileObjectUrl || previewUrl ? (
                    <div className="w-full h-full flex flex-col items-center">
                      {detectedMediaType === 'live' && selectedFile?.type.startsWith('video/') && localFileObjectUrl ? (
                        <video
                          src={localFileObjectUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full max-h-56 object-contain rounded-lg mb-3"
                        />
                      ) : (
                        <img
                          src={localFileObjectUrl || previewUrl || ''}
                          alt="Upload preview"
                          referrerPolicy="no-referrer"
                          className="w-full max-h-56 object-contain rounded-lg mb-3"
                        />
                      )}
                      <span className="text-xs text-zinc-300 font-medium">
                        {selectedFile?.name} · {formatBytes(selectedFile?.size || 0)}
                      </span>
                      <span className="text-xs text-[#E11D48] mt-1">Click to replace file</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#E11D48] group-hover:scale-105 transition-transform mb-4">
                        <CloudUpload className="w-7 h-7" />
                      </div>
                      <p className="text-sm font-semibold text-white mb-1">
                        Select Wallpaper Image or Live Video
                      </p>
                      <p className="text-xs text-zinc-400 max-w-xs">
                        Supports PNG, JPG, WEBP, AVIF, BMP, GIF, MP4 &amp; WEBM. Live videos automatically play on the home screen.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
                  <div className="aspect-video rounded-xl overflow-hidden border border-zinc-800 relative">
                    <LiveCanvasPreview presetId={selectedPreset} animate={true} />
                    <div className="absolute bottom-3 left-3 text-xs font-mono-tabular text-white bg-black/70 px-2.5 py-1 rounded">
                      LIVE 60FPS PROCEDURAL ENGINE
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {LIVE_SHADER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          setDominantColor(preset.accent);
                          if (!title) setTitle(preset.name);
                        }}
                        className={`p-2.5 rounded-lg border text-left text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                          selectedPreset === preset.id
                            ? 'bg-zinc-900 border-[#E11D48] text-white'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 shrink-0 text-[#E11D48]" />
                        <span className="truncate">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Metadata Controls */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Wallpaper Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={BLUEPRINT_CONSTRAINTS.MAX_TITLE}
                  placeholder="e.g. Obsidian Cyber Monolith 8K"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E11D48]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as WallpaperCategory)}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-[#E11D48]"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as WallpaperAspectRatio)}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-[#E11D48]"
                  >
                    {ASPECT_RATIOS.map((ar) => (
                      <option key={ar.value} value={ar.value}>
                        {ar.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Resolution Spec
                  </label>
                  <input
                    type="text"
                    value={resolutionLabel}
                    onChange={(e) => setResolutionLabel(e.target.value)}
                    maxLength={BLUEPRINT_CONSTRAINTS.MAX_RESOLUTION_LABEL}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white font-mono-tabular focus:outline-none focus:border-[#E11D48]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Material &amp; Aesthetic Notes
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={BLUEPRINT_CONSTRAINTS.MAX_DESCRIPTION}
                  placeholder="Describe lighting, display calibration, OLED black levels, or motion loop cadence..."
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E11D48]"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-200">
                  {errorMsg}
                </div>
              )}

              {feedback && (
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{feedback}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-lg border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  Done
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-6 py-2.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {isPublishing
                      ? 'Publishing to Home Screen...'
                      : activeTab === 'live_synthesizer'
                      ? 'Publish Live 60FPS Wallpaper'
                      : 'Publish Wallpaper Now'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 3: Manage Uploaded Wallpapers */}
        {activeTab === 'manage' && (
          <div className="mt-6">
            {wallpapers.length === 0 ? (
              <div className="p-10 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                <p className="text-sm text-zinc-300 font-medium">
                  No wallpapers uploaded yet. Use the Upload tab to publish your first wallpaper!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {wallpapers.map((wp) => (
                  <div
                    key={wp.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                        <WallpaperMediaRender
                          wallpaper={wp}
                          animate={false}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{wp.title}</p>
                        <p className="text-xs text-zinc-400 font-mono-tabular">
                          {wp.mediaType === 'live' ? 'LIVE' : 'STATIC'} · {wp.aspectRatio} ·{' '}
                          {formatBytes(wp.fileSizeBytes)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteWallpaper(wp.id)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                      aria-label={`Delete ${wp.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Registered User Emails Database */}
        {activeTab === 'database' && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-zinc-400">
                Firestore Collection: <code className="text-zinc-200">/user_private</code> (Registered Member Emails)
              </p>
              <span className="text-xs font-mono-tabular text-zinc-400">
                Total Records: {registeredEmails.length}
              </span>
            </div>
            {registeredEmails.length === 0 ? (
              <div className="p-8 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-xs text-zinc-400">
                No member emails recorded yet, or sign in as{' '}
                <strong className="text-zinc-200">vidushanawood@gmail.com</strong> to view all global member emails.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-3 px-4 font-medium">Display Name</th>
                      <th className="py-3 px-4 font-medium">Email Address</th>
                      <th className="py-3 px-4 font-medium">Flow</th>
                      <th className="py-3 px-4 font-medium">UID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {registeredEmails.map((rec) => (
                      <tr key={rec.uid} className="text-zinc-200">
                        <td className="py-3 px-4 font-medium">{rec.displayName}</td>
                        <td className="py-3 px-4 font-mono-tabular text-emerald-400">{rec.email}</td>
                        <td className="py-3 px-4 capitalize">{rec.accountType}</td>
                        <td className="py-3 px-4 font-mono-tabular text-zinc-500">
                          {rec.uid.slice(0, 12)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
