let thumbnailCache: Map<string, string> | null = null;

function getCache(): Map<string, string> {
  if (!thumbnailCache) {
    thumbnailCache = new Map<string, string>();
  }
  return thumbnailCache;
}

const MAX_THUMBNAILS = 100;

export function cacheThumbnail(id: string, url: string): void {
  const cache = getCache();
  const existing = cache.get(id);
  if (existing) URL.revokeObjectURL(existing);
  cache.set(id, url);
  if (cache.size <= MAX_THUMBNAILS) return;
  const firstEntry = cache.entries().next().value;
  if (!firstEntry) return;
  const [oldestId, oldestUrl] = firstEntry;
  URL.revokeObjectURL(oldestUrl);
  cache.delete(oldestId);
}

export function getCachedThumbnail(id: string): string | undefined {
  return getCache().get(id);
}
