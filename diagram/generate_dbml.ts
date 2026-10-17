import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db.js';

const GROUPS: Record<string, string[]> = {
  'Користувачі та ролі': ['roles', 'users'],
  'Довідники та арени': ['sports', 'venues', 'ticket_categories', 'sponsors'],
  'Команди': ['teams', 'team_members'],
  'Турніри': ['tournaments', 'tournament_stages', 'tournament_teams', 'tournament_sponsors'],
  'Матчі': ['matches', 'match_results', 'match_events', 'match_officials'],
  'Квитки': ['tickets'],
  'Аудит': ['audit_log'],
};

const TABLE_NOTES: Record<string, string> = {
  users: 'SOFT DELETE + AUDIT (created_by, updated_at/updated_by, deleted_at/deleted_by)',
  venues: 'SOFT DELETE + AUDIT',
  sponsors: 'SOFT DELETE',
  teams: 'SOFT DELETE + AUDIT',
  tournaments: 'SOFT DELETE + AUDIT',
  matches: 'SOFT DELETE + AUDIT',
  match_results: '1:1 з matches (UNIQUE match_id); NULL у winner_team_id = нічия',
  match_events: 'GIN індекс на details_jsonb; Hash індекс на event_type',
  tickets: 'SOFT DELETE + AUDIT; частковий UNIQUE на (match_id, seat_number)',
  audit_log: 'Журнал змін зі старими і новими значеннями в JSONB (GIN + BRIN індекси)',
};

const AUDIT_FK = new Set(['created_by', 'updated_by', 'deleted_by', 'changed_by']);

function dbmlType(t: string): string {
  return t
    .replace('character varying', 'varchar')
    .replace('timestamp with time zone', 'timestamptz')
    .replace(/\s+/g, '_');
}

async function main(): Promise<void> {
  try {
    const enumsRes = await pool.query<{ typname: string; labels: string[] }>(`
      SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `);

    const colsRes = await pool.query<{
      relname: string;
      attname: string;
      typ: string;
      attnotnull: boolean;
      adsrc: string | null;
      attidentity: string;
    }>(`
      SELECT c.relname,
             a.attname,
             format_type(a.atttypid, a.atttypmod) AS typ,
             a.attnotnull,
             pg_get_expr(d.adbin, d.adrelid) AS adsrc,
             a.attidentity
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
    `);

    const pkRes = await pool.query<{ relname: string; cols: string[] }>(`
      SELECT c.relname, array_agg(a.attname::text ORDER BY array_position(k.conkey, a.attnum)) AS cols
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(k.conkey)
      WHERE n.nspname = 'public' AND k.contype = 'p'
      GROUP BY c.relname
    `);
    const pkMap = new Map(pkRes.rows.map((r) => [r.relname, r.cols]));

    const uniqRes = await pool.query<{ relname: string; attname: string }>(`
      SELECT c.relname, a.attname
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.conkey[1]
      WHERE n.nspname = 'public' AND k.contype = 'u' AND array_length(k.conkey, 1) = 1
    `);
    const uniqSet = new Set(uniqRes.rows.map((r) => `${r.relname}.${r.attname}`));

    const fkRes = await pool.query<{
      relname: string;
      attname: string;
      ref_table: string;
      ref_col: string;
    }>(`
      SELECT c.relname, a.attname, rc.relname AS ref_table, ra.attname AS ref_col
      FROM pg_constraint k
      JOIN pg_class c  ON c.oid = k.conrelid
      JOIN pg_class rc ON rc.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a  ON a.attrelid = c.oid  AND a.attnum  = k.conkey[1]
      JOIN pg_attribute ra ON ra.attrelid = rc.oid AND ra.attnum = k.confkey[1]
      WHERE n.nspname = 'public' AND k.contype = 'f'
      ORDER BY 1, 2
    `);
    const fkMap = new Map(
      fkRes.rows.map((r) => [`${r.relname}.${r.attname}`, `${r.ref_table}.${r.ref_col}`])
    );

    const idxRes = await pool.query<{
      relname: string;
      iname: string;
      amname: string;
      indisunique: boolean;
      idef: string;
      pred: string | null;
    }>(`
      SELECT t.relname,
             i.relname AS iname,
             am.amname,
             ix.indisunique,
             pg_get_indexdef(ix.indexrelid) AS idef,
             pg_get_expr(ix.indpred, ix.indrelid) AS pred
      FROM pg_index ix
      JOIN pg_class i  ON i.oid = ix.indexrelid
      JOIN pg_class t  ON t.oid = ix.indrelid
      JOIN pg_am am    ON am.oid = i.relam
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relkind = 'r'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = ix.indexrelid)
      ORDER BY 1, 2
    `);

    const out: string[] = [
      '// Система управління спортивними подіями',
      'Project sports_management {',
      "  database_type: 'PostgreSQL'",
      "  Note: 'Турніри, команди, матчі, події, квитки, спонсори та аудит'",
      '}',
      '',
    ];

    for (const e of enumsRes.rows) {
      out.push(`Enum ${e.typname} {`);
      for (const l of e.labels) {
        out.push(`  ${l}`);
      }
      out.push('}', '');
    }

    for (const [groupName, tables] of Object.entries(GROUPS)) {
      out.push(`TableGroup "${groupName}" {`);
      for (const t of tables) {
        out.push(`  ${t}`);
      }
      out.push('}', '');
    }

    const tableCols = new Map<string, typeof colsRes.rows>();
    for (const row of colsRes.rows) {
      if (!tableCols.has(row.relname)) tableCols.set(row.relname, []);
      tableCols.get(row.relname)!.push(row);
    }

    const allTables = Object.values(GROUPS).flat();
    for (const t of allTables) {
      out.push(`Table ${t} {`);
      const pks = pkMap.get(t) ?? [];
      for (const c of tableCols.get(t) ?? []) {
        const flags: string[] = [];
        const isPk = pks.includes(c.attname) && pks.length === 1;
        if (isPk) flags.push('pk');
        if (c.attidentity) flags.push('increment');
        if (c.attnotnull && !isPk) flags.push('not null');
        if (uniqSet.has(`${t}.${c.attname}`)) flags.push('unique');
        if (c.adsrc) {
          const clean = c.adsrc.replace(/::[a-z_ ]+(\(\d+\))?/gi, '').replace(/`/g, '');
          flags.push(`default: \`${clean}\``);
        }
        const fkTarget = fkMap.get(`${t}.${c.attname}`);
        if (fkTarget) {
          if (fkTarget === 'users.id' && AUDIT_FK.has(c.attname)) {
            flags.push("note: 'FK -> users.id'");
          } else if (t === 'match_results' && c.attname === 'match_id') {
            flags.push(`ref: - ${fkTarget}`);
          } else {
            flags.push(`ref: > ${fkTarget}`);
          }
        }
        const suffix = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        out.push(`  ${c.attname} ${dbmlType(c.typ)}${suffix}`);
      }

      const tIdx = idxRes.rows.filter((i) => i.relname === t);
      if (tIdx.length > 0) {
        out.push('', '  indexes {');
        for (const ix of tIdx) {
          const usingIdx = ix.idef.indexOf(' USING ');
          const openParen = ix.idef.indexOf('(', usingIdx);
          let colsPart = ix.idef.slice(openParen + 1);
          if (colsPart.includes(' WHERE ')) {
            colsPart = colsPart.slice(0, colsPart.indexOf(' WHERE ')).replace(/\)\s*$/, '');
          } else {
            colsPart = colsPart.slice(0, colsPart.lastIndexOf(')'));
          }
          if (colsPart.includes(' INCLUDE ')) {
            colsPart = colsPart.slice(0, colsPart.indexOf(') INCLUDE '));
          }
          const parts = colsPart.split(',').map((s) => s.trim());
          const simpleCols = parts.every((p) => /^[a-z_][a-z0-9_]*$/i.test(p));
          const target = simpleCols
            ? parts.length === 1
              ? parts[0]
              : `(${parts.join(', ')})`
            : `\`${colsPart.replace(/`/g, '')}\``;

          const ixFlags: string[] = [];
          if (ix.indisunique) ixFlags.push('unique');
          if (ix.amname === 'btree' || ix.amname === 'hash') {
            ixFlags.push(`type: ${ix.amname}`);
          }
          ixFlags.push(`name: '${ix.iname}'`);
          const note =
            ix.amname.toUpperCase() +
            (ix.pred ? ` WHERE ${ix.pred.replace(/'/g, '')}` : '') +
            (ix.idef.includes('INCLUDE') ? ' INCLUDE' : '');
          ixFlags.push(`note: '${note}'`);
          out.push(`    ${target} [${ixFlags.join(', ')}]`);
        }
        out.push('  }');
      }

      if (TABLE_NOTES[t]) {
        out.push(`  Note: '${TABLE_NOTES[t].replace(/'/g, "\\'")}'`);
      }
      out.push('}', '');
    }

    const outPath = path.resolve('diagram', 'schema.dbml');
    fs.writeFileSync(outPath, out.join('\n'), 'utf8');
    console.log(
      `Згенеровано ${outPath} (таблиць: ${allTables.length}, FK: ${fkRes.rows.length}, індексів: ${idxRes.rows.length})`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
