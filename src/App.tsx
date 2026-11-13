/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Menu,
  Upload,
  Download,
  Bookmark,
  Check,
  Film,
  Sparkles,
  LogIn,
  UserPlus,
  Share2,
  SlidersHorizontal,
  Copy,
  X,
} from 'lucide-react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  AppSettings,
  ASPECT_RATIOS,
  BLUEPRINT_CONSTRAINTS,
  CATEGORIES,
  SavedPinRecord,
  UserPrivateRecord,
  WallpaperAspectRatio,
  WallpaperCategory,
  WallpaperItem,
} from './types';
import {
  deleteMasterBlobFromIDB,
  deleteWallpaperItemFromIDB,
  downloadWallpaperAsset,
  formatBytes,
  getAllWallpaperItemsFromIDB,
  renderProceduralPreviewToDataUrl,
  saveWallpaperItemToIDB,
} from './utils/mediaEngine';
import { AuthModal } from './components/AuthModal';
import { CreatorPortalModal } from './components/CreatorPortalModal';
import { WallpaperLightbox } from './components/WallpaperLightbox';
import { MenuSettingsDrawer } from './components/MenuSettingsDrawer';
import { LiveCanvasPreview } from './components/LiveCanvasPreview';
import { WallpaperMediaRender } from './components/WallpaperMediaRender';

const LOCAL_STORAGE_WALLPAPERS_KEY = 'mr_wallpapers_local_items_v1';
const LOCAL_STORAGE_SAVES_KEY = 'mr_wallpapers_local_saves_v1';
const LOCAL_STORAGE_SETTINGS_KEY = 'mr_wallpapers_settings_v1';

export default function App() {
  // Auth & User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [registeredEmails, setRegisteredEmails] = useState<UserPrivateRecord[]>([]);

  // Wallpapers State across Firestore + Server + IndexedDB
  const [cloudWallpapers, setCloudWallpapers] = useState<WallpaperItem[]>([]);
  const [serverWallpapers, setServerWallpapers] = useState<WallpaperItem[]>([]);
  const [localWallpapers, setLocalWallpapers] = useState<WallpaperItem[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_WALLPAPERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Saved Pinterest Pins
  const [savedPins, setSavedPins] = useState<SavedPinRecord[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_SAVES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Search & Secret Keyword State (Zero public mention on home page)
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatorUnlocked, setIsCreatorUnlocked] = useState(false);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  // Filters & Views
  const [activeView, setActiveView] = useState<'all' | 'live' | 'saved'>('all');
  const [selectedCategory, setSelectedCategory] = useState<WallpaperCategory | 'All'>('All');
  const [selectedAspect, setSelectedAspect] = useState<WallpaperAspectRatio | 'All'>('All');

  // Modals & Drawers
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    mode: 'signin' | 'register';
  }>({ isOpen: false, mode: 'signin' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHostLinkModalOpen, setIsHostLinkModalOpen] = useState(false);
  const [activeLightboxItem, setActiveLightboxItem] = useState<WallpaperItem | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // App Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // default
    }
    return {
      gridDensity: 'comfortable',
      defaultDownloadFormat: 'master_25mb',
      livePlaybackMode: 'always',
      turboFastCache: true,
      accentColorHex: '#E11D48',
    };
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 0. Load IndexedDB + Express Server Wallpapers immediately on mount (<30ms)
  useEffect(() => {
    let mounted = true;

    async function loadFastLocalAndServerWallpapers() {
      const idbItems = await getAllWallpaperItemsFromIDB();
      if (mounted && idbItems.length > 0) {
        setLocalWallpapers((prev) => {
          const map = new Map<string, WallpaperItem>();
          for (const item of idbItems) map.set(item.id, item);
          for (const item of prev) if (!map.has(item.id)) map.set(item.id, item);
          return Array.from(map.values());
        });
      }

      try {
        const res = await fetch('/api/wallpapers');
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data?.wallpapers)) {
            setServerWallpapers(data.wallpapers);
          }
        }
      } catch {
        // ignore
      }
    }

    loadFastLocalAndServerWallpapers();
    return () => {
      mounted = false;
    };
  }, []);

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore Listener for Public Wallpapers (Single-field query without composite index bottleneck)
  useEffect(() => {
    if (!isAuthReady) return;
    const path = 'wallpapers';
    const q = query(collection(db, path), where('visibility', '==', 'public'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: WallpaperItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            title: d.title || 'Untitled Wallpaper',
            description: d.description || '',
            category: d.category || 'Abstract',
            mediaType: d.mediaType || 'static',
            aspectRatio: d.aspectRatio || '16:9',
            resolutionLabel: d.resolutionLabel || '8K RAW',
            fileSizeBytes: d.fileSizeBytes || 27792000,
            previewDataUrl: d.previewDataUrl || '',
            accentColor: d.accentColor || '#E11D48',
            authorId: d.authorId || '',
            authorName: d.authorName || 'Vidusha',
            visibility: 'public',
            downloadsCount: d.downloadsCount || 0,
            savesCount: d.savesCount || 0,
            createdAt: d.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          };
        });
        setCloudWallpapers(items);
      },
      (error) => {
        console.warn('Firestore listener notice:', error);
      }
    );

    return () => unsubscribe();
  }, [isAuthReady]);

  // 3. Real-time Firestore Listener for User Saved Pins & Private Email Record
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const savesPath = 'saves';
    const savesQuery = query(
      collection(db, savesPath),
      where('userId', '==', currentUser.uid)
    );

    const unsubSaves = onSnapshot(
      savesQuery,
      (snap) => {
        const loadedSaves: SavedPinRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: data.userId,
            wallpaperId: data.wallpaperId,
            boardName: data.boardName || 'Favorites',
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          };
        });
        setSavedPins(loadedSaves);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, savesPath);
      }
    );

    const isAdminUser =
      currentUser.email?.toLowerCase() === 'vidushanawood@gmail.com' && currentUser.emailVerified;
    const privatePath = 'user_private';
    const privateQuery = isAdminUser
      ? query(collection(db, privatePath))
      : query(collection(db, privatePath), where('uid', '==', currentUser.uid));

    const unsubEmails = onSnapshot(
      privateQuery,
      (snap) => {
        const records: UserPrivateRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: data.uid || d.id,
            email: data.email || '',
            displayName: data.displayName || 'Member',
            accountType: data.accountType || 'signin',
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          };
        });
        setRegisteredEmails(records);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, privatePath);
      }
    );

    return () => {
      unsubSaves();
      unsubEmails();
    };
  }, [isAuthReady, currentUser]);

  // Merge Server + Local IndexedDB + Firestore Wallpapers and sort newest first
  const allWallpapers = useMemo(() => {
    const map = new Map<string, WallpaperItem>();
    for (const item of serverWallpapers) {
      map.set(item.id, item);
    }
    for (const item of localWallpapers) {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...item, ...existing } : item);
    }
    for (const item of cloudWallpapers) {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...item, mediaUrl: existing.mediaUrl || item.mediaUrl } : item);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [serverWallpapers, localWallpapers, cloudWallpapers]);

  // Secret Search Keyword Trigger ("vidusha") — Completely invisible to normal users
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim().toLowerCase() === 'vidusha') {
      unlockSecretCreatorPortal();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().toLowerCase() === 'vidusha') {
      unlockSecretCreatorPortal();
    }
  };

  const unlockSecretCreatorPortal = () => {
    setIsCreatorUnlocked(true);
    setIsPortalModalOpen(true);
    setSearchQuery('');
  };

  const handleLockPortal = () => {
    setIsCreatorUnlocked(false);
    setIsPortalModalOpen(false);
    showToast('Upload icon hidden.');
  };

  // Publish Wallpaper Callback
  const handleWallpaperPublished = async (newItem: WallpaperItem) => {
    await saveWallpaperItemToIDB(newItem);
    setServerWallpapers((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
    setLocalWallpapers((prev) => {
      const updated = [newItem, ...prev.filter((i) => i.id !== newItem.id)];
      try {
        localStorage.setItem(LOCAL_STORAGE_WALLPAPERS_KEY, JSON.stringify(updated.slice(0, 8)));
      } catch {
        // IndexedDB handles large storage
      }
      return updated;
    });
    setActiveView('all');
    setSelectedCategory('All');
    setSelectedAspect('All');
    showToast(`"${newItem.title}" is now live on the home screen!`);
  };

  // Delete Wallpaper Callback
  const handleDeleteWallpaper = async (id: string) => {
    setServerWallpapers((prev) => prev.filter((item) => item.id !== id));
    setLocalWallpapers((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(LOCAL_STORAGE_WALLPAPERS_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    await deleteWallpaperItemFromIDB(id);
    await deleteMasterBlobFromIDB(id);

    try {
      await fetch(`/api/wallpapers/${id}`, { method: 'DELETE' });
    } catch {
      // ignore
    }

    if (currentUser && cloudWallpapers.some((w) => w.id === id)) {
      try {
        await deleteDoc(doc(db, 'wallpapers', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `wallpapers/${id}`);
      }
    }
    showToast('Wallpaper removed from gallery.');
  };

  // Save / Unsave Pin to Pinterest-style Board
  const handleToggleSavePin = async (wallpaper: WallpaperItem, boardName = 'Obsidian Desk Setups') => {
    const existingPin = savedPins.find((p) => p.wallpaperId === wallpaper.id);

    if (existingPin) {
      const nextPins = savedPins.filter((p) => p.wallpaperId !== wallpaper.id);
      setSavedPins(nextPins);
      try {
        localStorage.setItem(LOCAL_STORAGE_SAVES_KEY, JSON.stringify(nextPins));
      } catch {
        // ignore
      }
      if (currentUser && !existingPin.id.startsWith('local_')) {
        try {
          await deleteDoc(doc(db, 'saves', existingPin.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `saves/${existingPin.id}`);
        }
      }
      showToast(`Removed "${wallpaper.title}" from saved pins.`);
      return;
    }

    const rawSaveId = `save_${currentUser?.uid || 'guest'}_${wallpaper.id}`
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH);

    const newPin: SavedPinRecord = {
      id: currentUser ? rawSaveId : `local_${rawSaveId}`,
      userId: currentUser?.uid || 'guest',
      wallpaperId: wallpaper.id,
      boardName: boardName.slice(0, BLUEPRINT_CONSTRAINTS.MAX_BOARD_NAME),
      createdAt: new Date().toISOString(),
    };

    const nextPins = [newPin, ...savedPins];
    setSavedPins(nextPins);
    try {
      localStorage.setItem(LOCAL_STORAGE_SAVES_KEY, JSON.stringify(nextPins));
    } catch {
      // ignore
    }

    try {
      await fetch(`/api/wallpapers/${wallpaper.id}/metric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'save' }),
      });
    } catch {
      // ignore
    }

    if (currentUser && cloudWallpapers.some((w) => w.id === wallpaper.id)) {
      try {
        await setDoc(doc(db, 'saves', rawSaveId), {
          userId: currentUser.uid,
          wallpaperId: wallpaper.id,
          boardName: newPin.boardName,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'wallpapers', wallpaper.id), {
          savesCount: wallpaper.savesCount + 1,
        });
      } catch {
        // ignore
      }
    }

    showToast(`Saved "${wallpaper.title}" to board "${boardName}"`);
  };

  // Increment Download Count
  const handleIncrementDownload = async (wallpaper: WallpaperItem) => {
    setLocalWallpapers((prev) =>
      prev.map((w) => (w.id === wallpaper.id ? { ...w, downloadsCount: w.downloadsCount + 1 } : w))
    );
    setServerWallpapers((prev) =>
      prev.map((w) => (w.id === wallpaper.id ? { ...w, downloadsCount: w.downloadsCount + 1 } : w))
    );

    try {
      await fetch(`/api/wallpapers/${wallpaper.id}/metric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'download' }),
      });
    } catch {
      // ignore
    }

    if (currentUser && cloudWallpapers.some((w) => w.id === wallpaper.id)) {
      try {
        await updateDoc(doc(db, 'wallpapers', wallpaper.id), {
          downloadsCount: wallpaper.downloadsCount + 1,
        });
      } catch {
        // ignore
      }
    }
  };

  // Direct Quick Download from Card
  const handleQuickCardDownload = async (e: React.MouseEvent, wallpaper: WallpaperItem) => {
    e.stopPropagation();
    const modeToUse =
      wallpaper.mediaType === 'live' && !wallpaper.livePresetId
        ? 'original'
        : settings.defaultDownloadFormat;
    showToast(`Starting download for "${wallpaper.title}"...`);
    try {
      const res = await downloadWallpaperAsset(wallpaper, modeToUse);
      await handleIncrementDownload(wallpaper);
      showToast(`Downloaded ${res.fileName} (${formatBytes(res.byteSize)})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Download started.');
    }
  };

  // Filtered Wallpapers
  const filteredWallpapers = useMemo(() => {
    return allWallpapers.filter((wp) => {
      if (activeView === 'live' && wp.mediaType !== 'live') return false;
      if (activeView === 'saved' && !savedPins.some((p) => p.wallpaperId === wp.id)) return false;
      if (selectedCategory !== 'All' && wp.category !== selectedCategory) return false;
      if (selectedAspect !== 'All' && wp.aspectRatio !== selectedAspect) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = wp.title.toLowerCase().includes(q);
        const matchCat = wp.category.toLowerCase().includes(q);
        const matchRes = wp.resolutionLabel.toLowerCase().includes(q);
        const matchDesc = wp.description.toLowerCase().includes(q);
        return matchTitle || matchCat || matchRes || matchDesc;
      }
      return true;
    });
  }, [allWallpapers, activeView, selectedCategory, selectedAspect, searchQuery, savedPins]);

  // Open Interactive Live Studio Calibration Inspector
  const handleInspectProceduralEngine = (presetId: string, presetTitle: string) => {
    const rendered = renderProceduralPreviewToDataUrl(presetId, '16:9');
    const tempItem: WallpaperItem = {
      id: `studio_engine_${presetId}`,
      title: presetTitle,
      description:
        'Real-time 60FPS procedural canvas motion architecture. Supports instant >25MB 32-bit uncompressed studio master export.',
      category: 'Live Motion',
      mediaType: 'live',
      aspectRatio: '16:9',
      resolutionLabel: '8K RAW · >25MB Master',
      fileSizeBytes: 27792000,
      previewDataUrl: rendered.previewDataUrl,
      accentColor: rendered.dominantColor,
      authorId: 'vidusha',
      authorName: 'Vidusha',
      visibility: 'public',
      downloadsCount: 0,
      savesCount: 0,
      createdAt: new Date().toISOString(),
      livePresetId: presetId,
    };
    setActiveLightboxItem(tempItem);
  };

  const gridColumnsClass =
    settings.gridDensity === 'gallery'
      ? 'columns-1 sm:columns-2 lg:columns-3 gap-6'
      : settings.gridDensity === 'compact'
      ? 'columns-1 sm:columns-2 md:columns-3 lg:columns-5 gap-4'
      : 'columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-5';

  const currentOriginUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://mrwallpapers.app';

  return (
    <div className="min-h-screen text-zinc-100 flex flex-col selection:bg-[#E11D48] selection:text-white">
      {/* =====================================================================
          TOP BAR CONTRACT: 1 Row, 3 Zones separated by gap-8
         ===================================================================== */}
      <header className="sticky top-0 z-40 bg-[#06060E]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('all');
              setSelectedCategory('All');
              setSelectedAspect('All');
            }}
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            MR Wallpapers
          </a>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-300">
            <button
              type="button"
              onClick={() => setActiveView('all')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'all' ? 'text-white underline underline-offset-8 decoration-[#E11D48]' : ''
              }`}
            >
              Explore Vault
            </button>
            <button
              type="button"
              onClick={() => setActiveView('live')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'live' ? 'text-white underline underline-offset-8 decoration-[#E11D48]' : ''
              }`}
            >
              Live Wallpapers
            </button>
            <button
              type="button"
              onClick={() => setActiveView('saved')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'saved' ? 'text-white underline underline-offset-8 decoration-[#E11D48]' : ''
              }`}
            >
              Saved Boards
            </button>
            <button
              type="button"
              onClick={() => setAuthModalState({ isOpen: true, mode: 'signin' })}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {currentUser ? 'Account' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => setAuthModalState({ isOpen: true, mode: 'register' })}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Register
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Menu className="w-4 h-4 text-[#E11D48]" />
              <span>Menu &amp; Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* =====================================================================
          MAIN WORKSPACE & PINTEREST MASONRY GALLERY
         ===================================================================== */}
      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Top Command Search & Auth Bar */}
        <section className="rounded-2xl bg-[#0E0E18]/85 backdrop-blur-xl border border-white/10 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <span>8K Ultra HD</span>
                <span aria-hidden="true">·</span>
                <span>&gt;25MB Lossless Studio Masters</span>
                <span aria-hidden="true">·</span>
                <span>60FPS Live Motion</span>
              </div>
              <h1
                className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Curated High-Resolution &amp; Live Motion Wallpapers
              </h1>
            </div>

            {/* Sign In & Register Quick Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setAuthModalState({ isOpen: true, mode: 'signin' })}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[#E11D48]" />
                <span>
                  {currentUser ? `Signed In (${currentUser.email?.split('@')[0]})` : 'Sign In'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAuthModalState({ isOpen: true, mode: 'register' })}
                className="px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-rose-950/50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register</span>
              </button>
            </div>
          </div>

          {/* Search Bar (No public hint about secret keyword!) */}
          <form onSubmit={handleSearchSubmit} className="mt-6">
            <div className="relative flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search 8K wallpapers, live motion, cyber, nature, anime, minimal..."
                  aria-label="Search wallpapers"
                  className="w-full pl-11 pr-28 py-3.5 rounded-xl bg-[#07070F]/90 border border-white/15 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E11D48] transition-colors"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  Search
                </button>
              </div>

              {/* Secret Upload Icon — Only visible when unlocked via search bar */}
              {isCreatorUnlocked && (
                <button
                  type="button"
                  onClick={() => setIsPortalModalOpen(true)}
                  title="Upload Wallpaper or Live Wallpaper"
                  className="px-4 py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-lg cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              )}
            </div>
          </form>

          {/* Category & Aspect Ratio Filter Bar */}
          <div className="mt-5 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(['All', ...CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#E11D48] text-white'
                      : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              <select
                value={selectedAspect}
                onChange={(e) => setSelectedAspect(e.target.value as WallpaperAspectRatio | 'All')}
                aria-label="Filter by aspect ratio"
                className="px-3 py-1.5 rounded-lg bg-[#07070F] border border-white/15 text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#E11D48]"
              >
                <option value="All">All Aspect Ratios</option>
                {ASPECT_RATIOS.map((ar) => (
                  <option key={ar.value} value={ar.value}>
                    {ar.label} ({ar.device})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-zinc-200 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#E11D48]" />
                <span>Quality &amp; Grid</span>
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            HOME SCREEN UPLOADED WALLPAPERS MASONRY GRID (SHOWS & PLAYS IMMEDIATELY)
           =================================================================== */}
        {filteredWallpapers.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                {activeView === 'live'
                  ? 'Live Motion Wallpapers'
                  : activeView === 'saved'
                  ? 'Saved Pinterest Board Pins'
                  : 'Featured Wallpapers & Live Motion'}
              </h2>
              <span className="text-xs font-mono-tabular text-zinc-400">
                {filteredWallpapers.length} {filteredWallpapers.length === 1 ? 'Item' : 'Items'} · Instant Download Ready
              </span>
            </div>

            <div className={gridColumnsClass}>
              {filteredWallpapers.map((wp) => {
                const isPinSaved = savedPins.some((p) => p.wallpaperId === wp.id);
                const isHovered = hoveredCardId === wp.id;
                const shouldAnimateLive =
                  settings.livePlaybackMode === 'always' ||
                  (settings.livePlaybackMode === 'hover' && isHovered);

                return (
                  <article
                    key={wp.id}
                    onMouseEnter={() => setHoveredCardId(wp.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    onClick={() => setActiveLightboxItem(wp)}
                    className="group relative break-inside-avoid mb-5 rounded-2xl bg-[#0E0E18]/90 border border-white/10 overflow-hidden cursor-pointer transition-transform duration-200 hover:-translate-y-1 shadow-xl"
                  >
                    {/* Media Container — Plays Live Video & High-Res Images Directly on Home Screen */}
                    <div className="relative w-full overflow-hidden bg-zinc-950 min-h-[160px]">
                      <WallpaperMediaRender
                        wallpaper={wp}
                        animate={shouldAnimateLive}
                        className="w-full h-auto object-cover block transition-transform duration-300 group-hover:scale-[1.02]"
                      />

                      {/* Live Indicator on top-left */}
                      {wp.mediaType === 'live' && (
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/75 backdrop-blur-md text-[11px] font-mono-tabular text-white flex items-center gap-1.5 pointer-events-none">
                          <Film className="w-3 h-3 text-[#E11D48]" />
                          <span>LIVE</span>
                        </div>
                      )}

                      {/* Pinterest-Style Scrim Overlay on Hover + Mobile Visible Download Button */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSavePin(wp);
                            }}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isPinSaved
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
                            }`}
                          >
                            {isPinSaved ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Bookmark className="w-3.5 h-3.5" />
                            )}
                            <span>{isPinSaved ? 'Saved' : 'Save'}</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{wp.title}</p>
                            <p className="text-xs text-zinc-300 font-mono-tabular">
                              {wp.resolutionLabel}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleQuickCardDownload(e, wp)}
                            className="px-3 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-lg"
                            title="Download Now"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Clean Unboxed Metadata Footer + Always-Accessible Download Button */}
                    <div className="p-3.5 flex items-center justify-between gap-2 text-xs text-zinc-300">
                      <div className="truncate">
                        <span className="text-white font-semibold">{wp.title}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="text-zinc-400">{wp.category}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular text-zinc-400">{wp.aspectRatio}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleQuickCardDownload(e, wp)}
                        className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-[#E11D48] text-white text-[11px] font-semibold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                        title="Direct Download"
                      >
                        <Download className="w-3 h-3" />
                        <span>Get</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          /* Clean, Colorful Live Procedural Calibration Stage when 0 Wallpapers Match */
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                Live 60FPS Motion &amp; &gt;25MB Master Calibration Showcase
              </h2>
              <span className="text-xs text-zinc-400">
                Click any card to inspect or test &gt;25MB studio downloads
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  presetId: 'crimson_horizon',
                  title: '01. Cinnabar OLED Ribbon Calibration',
                  aspect: '16:9 Desktop · 8K Studio Master',
                  spec: '26.5 MB Uncompressed 32-Bit RGBA',
                },
                {
                  presetId: 'obsidian_prism',
                  title: '02. Obsidian Cobalt Live 60FPS',
                  aspect: '21:9 Ultrawide · Live Motion Loop',
                  spec: '60FPS Real-Time Procedural Stream',
                },
                {
                  presetId: 'solar_monolith',
                  title: '03. Solar Gold Architectural Contour',
                  aspect: '9:16 Mobile OLED · High Contrast',
                  spec: 'Zero-Latency Progressive Preview',
                },
              ].map((module) => (
                <div
                  key={module.presetId}
                  onClick={() => handleInspectProceduralEngine(module.presetId, module.title)}
                  className="group rounded-2xl bg-[#0E0E18]/90 border border-white/10 overflow-hidden cursor-pointer flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 shadow-xl"
                >
                  <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                    <LiveCanvasPreview
                      presetId={module.presetId}
                      animate={settings.livePlaybackMode !== 'saver'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-4 flex items-end justify-between">
                      <span className="text-xs font-mono-tabular text-zinc-200">
                        {module.spec}
                      </span>
                      <span className="px-3 py-1.5 rounded-lg bg-[#E11D48] text-white text-xs font-semibold flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-1">
                    <h3 className="font-display text-base font-bold text-white group-hover:text-[#E11D48] transition-colors">
                      {module.title}
                    </h3>
                    <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-[#E11D48]" />
                      <span>{module.aspect}</span>
                      <span aria-hidden="true">·</span>
                      <span>Vidusha</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Performance Metrics Strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          {[
            {
              label: 'Master File Output',
              value: '26.5 MB',
              detail: '32-Bit Uncompressed RGBA Studio BMP',
            },
            {
              label: 'Gallery Decode Latency',
              value: '< 45 ms',
              detail: 'Hardware-Accelerated WebP & Video Stream',
            },
            {
              label: 'Active Wallpapers',
              value: String(allWallpapers.length),
              detail: 'Curated by Vidusha',
            },
            {
              label: 'Saved Pinterest Pins',
              value: String(savedPins.length),
              detail: 'Synced to Member Boards',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-5 rounded-2xl bg-[#0E0E18]/80 border border-white/10 flex flex-col justify-between"
            >
              <span className="text-xs text-zinc-400">{stat.label}</span>
              <span className="font-display text-2xl sm:text-3xl font-bold text-white font-mono-tabular my-1.5">
                {stat.value}
              </span>
              <span className="text-xs text-zinc-400">{stat.detail}</span>
            </div>
          ))}
        </section>
      </main>

      {/* =====================================================================
          FOOTER WITH "VIDUSHA" ATTRIBUTION AT THE END OF WALLPAPER APP
         ===================================================================== */}
      <footer className="mt-16 border-t border-white/10 bg-[#05050B]/90 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="font-display text-lg font-bold text-white">MR Wallpapers</span>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span className="text-xs text-zinc-300">
                High-Resolution Static &amp; Live Motion Wallpaper Gallery
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Download 4K, 8K, Live 60FPS, and &gt;25MB lossless studio master wallpapers with instant loading speeds.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                setIsHostLinkModalOpen(true);
              }}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>Website Host Link</span>
            </button>

            <div className="px-4 py-2 rounded-lg bg-[#E11D48]/15 border border-[#E11D48]/40 text-xs text-zinc-200">
              <span>Created &amp; Curated by </span>
              <strong className="text-white font-display tracking-wide">Vidusha</strong>
            </div>
          </div>
        </div>
      </footer>

      {/* Website Host Link Modal */}
      {isHostLinkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0E0E18] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                MR Wallpapers Hosted Website Links
              </h3>
              <button
                type="button"
                onClick={() => setIsHostLinkModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Copy your active browser link below. Note: To make the shared link accessible to anyone outside your session, click the <strong>Share / Publish</strong> button in the top-right bar of Google AI Studio.
            </p>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-zinc-400">Active Live App URL</p>
                  <p className="text-xs font-mono-tabular text-emerald-400 truncate">
                    {currentOriginUrl}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(currentOriginUrl);
                    showToast('Copied active URL to clipboard!');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#E11D48] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl bg-zinc-900/95 border border-white/20 text-xs font-medium text-white shadow-2xl flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-[#E11D48] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals & Drawers */}
      <AuthModal
        isOpen={authModalState.isOpen}
        initialMode={authModalState.mode}
        onClose={() => setAuthModalState((prev) => ({ ...prev, isOpen: false }))}
        currentUser={currentUser}
        onAuthSuccess={(mode, email) => {
          showToast(
            mode === 'register'
              ? `Registered ${email} in MR Wallpapers database!`
              : `Signed in as ${email}!`
          );
        }}
      />

      <CreatorPortalModal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        onLockPortal={handleLockPortal}
        currentUser={currentUser}
        onWallpaperPublished={handleWallpaperPublished}
        onDeleteWallpaper={handleDeleteWallpaper}
        wallpapers={allWallpapers}
        registeredEmails={registeredEmails}
      />

      <WallpaperLightbox
        wallpaper={activeLightboxItem}
        onClose={() => setActiveLightboxItem(null)}
        onSavePin={handleToggleSavePin}
        onIncrementDownload={handleIncrementDownload}
        isSaved={
          activeLightboxItem
            ? savedPins.some((p) => p.wallpaperId === activeLightboxItem.id)
            : false
        }
        defaultDownloadFormat={settings.defaultDownloadFormat}
      />

      <MenuSettingsDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        activeView={activeView}
        onSelectView={setActiveView}
        currentUser={currentUser}
        onOpenAuth={(mode) => setAuthModalState({ isOpen: true, mode })}
        onSignOut={async () => {
          await signOut(auth);
          showToast('Signed out of MR Wallpapers.');
        }}
        isCreatorUnlocked={isCreatorUnlocked}
        onOpenCreatorPortal={() => setIsPortalModalOpen(true)}
        savedCount={savedPins.length}
        totalWallpapers={allWallpapers.length}
      />
    </div>
  );
}
