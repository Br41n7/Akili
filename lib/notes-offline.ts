export interface PersonalNote {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type NoteSyncState = PersonalNote & { sync_state: 'pending' | 'synced' };

function storageKey(userId: string, projectId: string) {
  return `akili:notes:${userId}:${projectId}`;
}

function deletedKey(userId: string, projectId: string) {
  return `akili:notes-deleted:${userId}:${projectId}`;
}

export function readOfflineNotes(userId: string, projectId: string): NoteSyncState[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId, projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOfflineNotes(userId: string, projectId: string, notes: NoteSyncState[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId, projectId), JSON.stringify(notes));
  } catch {
    // Offline caching is best-effort. The server remains the source of truth.
  }
}

export function mergeNotes(serverNotes: PersonalNote[], localNotes: NoteSyncState[]): NoteSyncState[] {
  const byId = new Map<string, NoteSyncState>();
  for (const note of serverNotes) byId.set(note.id, { ...note, sync_state: 'synced' });

  for (const local of localNotes) {
    const server = byId.get(local.id);
    if (!server || new Date(local.updated_at).getTime() >= new Date(server.updated_at).getTime()) {
      byId.set(local.id, local);
    }
  }

  return [...byId.values()].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function newLocalNote(userId: string, projectId: string, title: string, content: string): NoteSyncState {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    user_id: userId,
    title,
    content,
    created_at: now,
    updated_at: now,
    sync_state: 'pending',
  };
}


export function readDeletedNoteIds(userId: string, projectId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(deletedKey(userId, projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function markNoteDeleted(userId: string, projectId: string, noteId: string) {
  if (typeof window === 'undefined') return;
  const ids = new Set(readDeletedNoteIds(userId, projectId));
  ids.add(noteId);
  try { localStorage.setItem(deletedKey(userId, projectId), JSON.stringify([...ids])); } catch { /* best effort */ }
}

export function clearDeletedNoteIds(userId: string, projectId: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  const remove = new Set(ids);
  const remaining = readDeletedNoteIds(userId, projectId).filter(id => !remove.has(id));
  try {
    if (remaining.length) localStorage.setItem(deletedKey(userId, projectId), JSON.stringify(remaining));
    else localStorage.removeItem(deletedKey(userId, projectId));
  } catch { /* best effort */ }
}
