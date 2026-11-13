import React from 'react';
import {
  X,
  Sliders,
  Compass,
  Film,
  Bookmark,
  LogIn,
  UserPlus,
  LogOut,
  Upload,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppSettings } from '../types';

interface MenuSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  activeView: 'all' | 'live' | 'saved';
  onSelectView: (view: 'all' | 'live' | 'saved') => void;
  currentUser: User | null;
  onOpenAuth: (mode: 'signin' | 'register') => void;
  onSignOut: () => void;
  isCreatorUnlocked: boolean;
  onOpenCreatorPortal: () => void;
  savedCount: number;
  totalWallpapers: number;
}

export const MenuSettingsDrawer: React.FC<MenuSettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  activeView,
  onSelectView,
  currentUser,
  onOpenAuth,
  onSignOut,
  isCreatorUnlocked,
  onOpenCreatorPortal,
  savedCount,
  totalWallpapers,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="MR Wallpapers Menu and Settings"
    >
      <div className="relative w-full max-w-md bg-[#0E0E11] border-l border-zinc-800 h-full flex flex-col justify-between p-6 overflow-y-auto shadow-2xl">
        <div className="space-y-7">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <h2 className="font-display text-xl font-bold text-white tracking-tight">
                MR Wallpapers Menu &amp; Settings
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Engineered for instant load times &amp; &gt;25MB studio downloads
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Account & Database Section */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">Member Account</span>
              <span className="text-[11px] font-mono-tabular text-zinc-500">
                Firestore Email Sync
              </span>
            </div>

            {currentUser ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {currentUser.displayName || 'Verified Member'}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono-tabular">{currentUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSignOut();
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth('signin');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth('register');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register</span>
                </button>
              </div>
            )}
          </div>

          {/* Navigation Views */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400">Pinterest Vault Navigation</p>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectView('all');
                  onClose();
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  activeView === 'all'
                    ? 'bg-zinc-900 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-[#E11D48]" />
                  <span>All Curated Wallpapers</span>
                </span>
                <span className="font-mono-tabular text-zinc-500">{totalWallpapers}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('live');
                  onClose();
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  activeView === 'live'
                    ? 'bg-zinc-900 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Film className="w-4 h-4 text-[#E11D48]" />
                  <span>Live 60FPS Motion Wallpapers</span>
                </span>
                <span className="font-mono-tabular text-zinc-500">60FPS</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('saved');
                  onClose();
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  activeView === 'saved'
                    ? 'bg-zinc-900 text-white border border-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Bookmark className="w-4 h-4 text-[#E11D48]" />
                  <span>Saved Pinterest Boards</span>
                </span>
                <span className="font-mono-tabular text-zinc-500">{savedCount}</span>
              </button>

              {isCreatorUnlocked && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCreatorPortal();
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between bg-[#E11D48]/15 border border-[#E11D48]/40 text-white hover:bg-[#E11D48]/25 transition-colors cursor-pointer mt-2"
                >
                  <span className="flex items-center gap-2.5">
                    <Upload className="w-4 h-4 text-[#E11D48]" />
                    <span>Vidusha Creator Upload Portal</span>
                  </span>
                  <span className="font-mono-tabular text-[#E11D48]">UNLOCKED</span>
                </button>
              )}
            </div>
          </div>

          {/* All Display & Performance Settings */}
          <div className="space-y-4 pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <Sliders className="w-4 h-4 text-[#E11D48]" />
              <span>Engine &amp; Quality Settings</span>
            </div>

            {/* Setting 1: Default Download Format */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                Default Download Architecture
              </label>
              <select
                value={settings.defaultDownloadFormat}
                onChange={(e) =>
                  onUpdateSettings({
                    defaultDownloadFormat: e.target.value as AppSettings['defaultDownloadFormat'],
                  })
                }
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-[#E11D48]"
              >
                <option value="master_25mb">&gt;25 MB Lossless 32-Bit Studio Master (.BMP)</option>
                <option value="uhd_8k">8K Ultra HD (5120×2880 PNG)</option>
                <option value="uhd_4k">4K UHD (3840×2160 PNG)</option>
                <option value="original">Original Uploaded File / Live Stream</option>
              </select>
            </div>

            {/* Setting 2: Masonry Grid Density */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                Pinterest Masonry Column Density
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                {(
                  [
                    { id: 'gallery', label: '3-Col Wide' },
                    { id: 'comfortable', label: '4-Col Standard' },
                    { id: 'compact', label: '5-Col Dense' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ gridDensity: opt.id })}
                    className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      settings.gridDensity === opt.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 3: Live Wallpaper Motion Playback */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                Live Wallpaper Motion Playback
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                {(
                  [
                    { id: 'always', label: 'Always 60FPS' },
                    { id: 'hover', label: 'On Hover' },
                    { id: 'saver', label: 'Static Saver' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ livePlaybackMode: opt.id })}
                    className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      settings.livePlaybackMode === opt.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 4: Turbo Fast-Load Cache */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#E11D48]" />
                  <span>Sub-100ms Turbo IndexedDB Cache</span>
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Pre-decodes WebP thumbnails while keeping &gt;25MB masters off-thread
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ turboFastCache: !settings.turboFastCache })
                }
                className={`px-3 py-1 rounded-md text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                  settings.turboFastCache
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {settings.turboFastCache ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Attribution */}
        <div className="pt-6 mt-6 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#E11D48]" />
            <span>MR Wallpapers Vault</span>
          </span>
          <span className="text-zinc-300 font-semibold">Created by Vidusha</span>
        </div>
      </div>
    </div>
  );
};
