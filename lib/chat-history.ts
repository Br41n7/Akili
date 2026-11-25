/**
 * Ask AI history, saved per project so a refresh does not lose the conversation.
 * The database client is passed in, so tests can use a fake one.
 * Saving is best-effort: if the table is missing or the network drops, the chat still works for this visit.
 */
export interface ChatMessage { role: 'user' | 'ai'; text: string; failed?: boolean }

export const HISTORY_LOAD_LIMIT = 100;   // messages shown after a refresh
export const MAX_SAVED_CHARS = 30000;    // matches the column check

/** Minimal shape of the Supabase client used here. */
type Db = { from: (table: string) => any };

export async function loadChat(db: Db, projectId: string, userId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await db.from('chat_messages').select('role, content, created_at')
      .eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(HISTORY_LOAD_LIMIT);
    if (error || !Array.isArray(data)) return [];
    return data.slice().reverse()
      .filter((r: any) => (r.role === 'user' || r.role === 'ai') && typeof r.content === 'string' && r.content)
      .map((r: any) => ({ role: r.role, text: r.content }));
  } catch { return []; }
}

/** Returns true when saved. Failed (error) messages are never saved. */
export async function saveChatMessage(db: Db, projectId: string, userId: string, msg: ChatMessage): Promise<boolean> {
  if (msg.failed || !msg.text.trim()) return false;
  try {
    const { error } = await db.from('chat_messages').insert({ project_id: projectId, user_id: userId, role: msg.role, content: msg.text.slice(0, MAX_SAVED_CHARS) });
    return !error;
  } catch { return false; }
}

export async function clearChat(db: Db, projectId: string, userId: string): Promise<boolean> {
  try {
    const { error } = await db.from('chat_messages').delete().eq('project_id', projectId).eq('user_id', userId);
    return !error;
  } catch { return false; }
}
