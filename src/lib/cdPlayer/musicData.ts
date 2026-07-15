// ============================================
// HELICASE — Music Data
// localStorage-backed playlist with CRUD + shuffle.
// Default demo tracks pre-seeded on first visit.
// Phase 1: visual only, external links for playback.
// ============================================

export interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string;       // URL or local path
  link: string;         // external: NetEase/QQ/Spotify/YouTube
  favorited?: boolean;
}

const STORAGE_KEY = 'helicase-playlist';

export const DEFAULT_PLAYLIST: Track[] = [
  { id: 'd1', title: 'I Really Want to Stay at Your House', artist: 'Rosa Walton',  cover: '/images/covers/track-01.svg', link: 'https://music.163.com/', favorited: true },
  { id: 'd2', title: 'Blinding Lights',                    artist: 'The Weeknd',    cover: '/images/covers/track-02.svg', link: 'https://music.163.com/' },
  { id: 'd3', title: 'Lemon',                               artist: '米津玄師',       cover: '/images/covers/track-03.svg', link: 'https://music.163.com/', favorited: true },
  { id: 'd4', title: '夜に駆ける',                            artist: 'YOASOBI',       cover: '/images/covers/track-04.svg', link: 'https://music.163.com/' },
  { id: 'd5', title: 'Duvet',                               artist: 'Bôa',           cover: '/images/covers/track-05.svg', link: 'https://music.163.com/', favorited: true },
];

export function loadPlaylist(): Track[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // First visit: seed defaults
  savePlaylist(DEFAULT_PLAYLIST);
  return [...DEFAULT_PLAYLIST];
}

export function savePlaylist(tracks: Track[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks)); } catch {}
}

export function addTrack(track: Track): Track[] {
  const list = loadPlaylist();
  list.push(track);
  savePlaylist(list);
  return list;
}

export function removeTrack(id: string): Track[] {
  const list = loadPlaylist().filter(t => t.id !== id);
  savePlaylist(list);
  return list;
}

export function toggleFavorite(id: string): Track[] {
  const list = loadPlaylist().map(t =>
    t.id === id ? { ...t, favorited: !t.favorited } : t
  );
  savePlaylist(list);
  return list;
}

export function shufflePlaylist(): Track[] {
  const list = loadPlaylist();
  // Fisher-Yates
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  savePlaylist(list);
  return list;
}

export function generateId(): string {
  return 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}
