#!/usr/bin/env node
/* ============================================================
   本文の字数の目安を超える所を出す (tools/lencheck.mjs)

   段階の本文 160 字・リード 110 字・補足 1 段落 140 字（docs/authoring.md §2）を超える所を章ごとに出す。
     node tools/lencheck.mjs chapters/NN-*.html
   注意: 本文がテンプレート文字列で式（${…}）を含むと、式をそのまま数えるので実際より多く出る。
   その章は式を短い定数に出すか、描画後の本文で数える。
   ============================================================ */
import fs from 'node:fs';
const strip = (h) => h.replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const plain = (s) => s.replace(/\*\*|`|\{[ehprdx]\|([^}]*)\}/g, '$1').replace(/\[\[\d+(?::\d+)?\|([^\]]+)\]\]/g, '$1').replace(/\[\[\d\d-[a-z0-9-]+\.html(?:#s\d+(?:\.\d+)?)?\|([^\]]+)\]\]/g, '$1');
const len = (s) => Array.from(plain(s)).length;
const key = (line, k) => { const m = new RegExp(k + String.raw`:\s*(['"\x60])((?:\\.|(?!\1).)*)\1`).exec(line); return m ? m[2].replace(/\\'/g, "'") : null; };
for (const f of process.argv.slice(2)) {
  const html = fs.readFileSync(f, 'utf8');
  const out = [];
  const secs = [...html.matchAll(/<section class="scene ([^"]*)" id="(s\d+)"[^>]*>([\s\S]*?)<\/section>/g)];
  for (const s of secs) {
    const [, , id, body] = s;
    const lead = body.match(/<p class="prose a-lead">([\s\S]*?)<\/p>/);
    if (lead && len(strip(lead[1])) > 110) out.push(`${id} リード ${len(strip(lead[1]))} 字（目安 110）`);
    const after = body.match(/<div class="prose a-after">([\s\S]*?)<\/div>/);
    if (after) for (const p of after[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) if (len(strip(p[1])) > 140) out.push(`${id} 補足 ${len(strip(p[1]))} 字（目安 140）`);
  }
  const blocks = [...html.matchAll(/const\s+(s\d+)\s*=\s*\{[\s\S]*?steps:\s*\[([\s\S]*?)\n\s*\],?/g)];
  for (const b of blocks) {
    let k = 0;
    for (const ln of b[2].split('\n')) {
      if (!/\btitle:\s*['"\x60]/.test(ln) || !/^\s*\{/.test(ln)) continue;
      k++;
      const t = key(ln, 'text');
      if (t && len(t) > 160) out.push(`${b[1]} 段階${k}「${key(ln, 'title')}」 ${len(t)} 字（目安 160）`);
    }
  }
  console.log(`${f}: ${out.length ? '' : '超過なし'}`);
  for (const o of out) console.log('  ' + o);
}
