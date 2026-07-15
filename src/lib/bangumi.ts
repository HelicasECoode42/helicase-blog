// ============================================
// HELICASE — Bangumi API Wrapper
// Searches subjects (anime/books/music/games/movies).
// Client-side fetch. CORS may need Cloudflare proxy.
// ============================================

const BGM_BASE = 'https://api.bgm.tv/v0';

export interface BangumiSubject {
  id: number;
  name: string;
  name_cn: string;
  cover: string;
  summary: string;
  rating: number | null;
  type: number; // 1=book 2=anime 3=music 4=game 6=film
  typeLabel: string;
}

const TYPE_LABELS: Record<number, string> = {
  1: '书籍', 2: '动画', 3: '音乐', 4: '游戏', 6: '电影',
};

export async function searchBangumi(keyword: string): Promise<BangumiSubject[]> {
  if (!keyword || keyword.length < 1) return [];
  try {
    const url = `${BGM_BASE}/search/subject/${encodeURIComponent(keyword)}?responseGroup=small&max_results=8`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const items = json.list || json.data || [];
    return items.map((item: any) => ({
      id: item.id,
      name: item.name || '',
      name_cn: item.name_cn || '',
      cover: (item.images?.common || item.images?.large || '').replace(/^http:\/\//, 'https://'),
      summary: item.summary || '',
      rating: item.rating?.score ?? null,
      type: item.type || 0,
      typeLabel: TYPE_LABELS[item.type] || '其他',
    }));
  } catch {
    return [];
  }
}

// ── Local favorites store (localStorage) ──

export interface FavoriteItem {
  bgmId: number;
  name: string;
  name_cn: string;
  cover: string;
  type: number;
  typeLabel: string;
  personalRating: number; // 1-10
  note: string;
  addedAt: string; // ISO date
}

const FAV_STORE = 'helicase-favorites';

export function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(FAV_STORE);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveFavorites(items: FavoriteItem[]) {
  localStorage.setItem(FAV_STORE, JSON.stringify(items));
}
