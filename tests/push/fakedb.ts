/** A small in-memory stand-in for the Supabase admin client: enough for the push routes. */
export type Row = Record<string, any>;
export function makeDb(tables: Record<string, Row[]>) {
  const log: { op: string; table: string; payload?: any; filters?: any[] }[] = [];
  const client = {
    from(table: string) {
      const filters: [string, string, any][] = []; let mode: 'select' | 'delete' | 'update' | 'upsert' = 'select';
      let patch: Row = {}; let head = false; let counted = false; let orderBy: [string, boolean] | null = null; let max = Infinity; let upsertRow: Row | null = null; let conflict = '';
      const match = () => (tables[table] ||= []).filter(r => filters.every(([c, op, v]) => op === 'eq' ? r[c] === v : op === 'lte' ? r[c] <= v : op === 'gte' ? r[c] >= v : op === 'lt' ? r[c] < v : op === 'gt' ? r[c] > v : true));
      const exec = () => {
        if (mode === 'delete') { const gone = match(); tables[table] = tables[table].filter(r => !gone.includes(r)); log.push({ op: 'delete', table, filters: [...filters] }); return { data: null, error: null }; }
        if (mode === 'update') { match().forEach(r => Object.assign(r, patch)); log.push({ op: 'update', table, payload: patch, filters: [...filters] }); return { data: null, error: null }; }
        if (mode === 'upsert') {
          const existing = (tables[table] ||= []).find(r => r[conflict] === upsertRow![conflict]);
          if (existing) Object.assign(existing, upsertRow); else tables[table].push({ id: `id${tables[table].length + 1}`, created_at: new Date(Date.now() + tables[table].length).toISOString(), ...upsertRow });
          log.push({ op: 'upsert', table, payload: upsertRow }); return { data: null, error: null };
        }
        let rows = match();
        if (orderBy) { const [c, asc] = orderBy; rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
        rows = rows.slice(0, max);
        return counted ? { data: head ? null : rows, count: match().length, error: null } : { data: rows, error: null };
      };
      const b: any = {
        select: (_c?: string, o?: { count?: string; head?: boolean }) => { counted = !!o?.count; head = !!o?.head; return b; },
        eq: (c: string, v: any) => { filters.push([c, 'eq', v]); return b; }, lte: (c: string, v: any) => { filters.push([c, 'lte', v]); return b; },
        gte: (c: string, v: any) => { filters.push([c, 'gte', v]); return b; },
        lt: (c: string, v: any) => { filters.push([c, 'lt', v]); return b; }, gt: (c: string, v: any) => { filters.push([c, 'gt', v]); return b; },
        order: (c: string, o?: { ascending?: boolean }) => { orderBy = [c, o?.ascending !== false]; return b; }, limit: (n: number) => { max = n; return b; },
        delete: () => { mode = 'delete'; return b; }, update: (p: Row) => { mode = 'update'; patch = p; return b; },
        upsert: (r: Row, o?: { onConflict?: string }) => { mode = 'upsert'; upsertRow = r; conflict = o?.onConflict || 'id'; return b; },
        maybeSingle: async () => { const r = exec(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
        single: async () => { const r = exec(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
        then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
      };
      return b;
    },
  };
  return { client, tables, log };
}
