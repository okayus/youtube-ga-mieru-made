#!/usr/bin/env node
/* ============================================================
   meta.next.lead を作り直す (tools/sync-lead.mjs)

   各章の meta.next.lead（次の章の表紙リードの 1 文目。まとめの下に「次の章の導入」として出る）と
   index.html の lead を、今の表紙リードから作り直す（冪等）。表紙のリードの 1 文目を変えたら走らせる。
     node tools/sync-lead.mjs
   ============================================================ */
import fs from 'node:fs';
const chs = fs.readdirSync('chapters').filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f)).sort().map((f) => 'chapters/' + f);
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const standfirst = (p) => { const m = /<p class="standfirst">([\s\S]*?)<\/p>/.exec(fs.readFileSync(p, 'utf8')); return unesc(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); };
const first = (t) => t.split('。')[0] + '。';
const js = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const re = /(next:\s*\{\s*href:\s*'[^']+',\s*title:\s*'[^']*')(?:,\s*lead:\s*'(?:\\.|[^'\\])*')?(\s*\})/;
let changed = 0;
const leads = Object.fromEntries(chs.map((p) => [p, first(standfirst(p))]));
for (let i = 0; i < chs.length; i++) {
  const p = chs[i];
  const h = fs.readFileSync(p, 'utf8');
  const target = i + 1 < chs.length ? leads[chs[i + 1]] : null;
  if (!target) continue;
  const h2 = h.replace(re, (m, a, b) => a + ", lead: '" + js(target) + "'" + b);
  if (h2 !== h) { fs.writeFileSync(p, h2); changed++; console.log('更新:', p, '→', target); }
}
const idx = fs.readFileSync('index.html', 'utf8');
const idx2 = idx.replace(/(next:\s*\{\s*href:\s*'chapters\/01-denshi\.html',\s*title:\s*'[^']*')(?:,\s*lead:\s*'(?:\\.|[^'\\])*')?(\s*\})/, (m, a, b) => a + ", lead: '" + js(leads[chs[0]]) + "'" + b);
if (idx2 !== idx) { fs.writeFileSync('index.html', idx2); changed++; console.log('更新: index.html'); }
console.log('lead を更新した数:', changed);
