#!/usr/bin/env node
/* ============================================================
   用語索引のデータを作る (tools/build-glossary.mjs)

   全章のまとめの用語表（table.gloss の行）を集めて assets/glossary-data.js に書く。
   glossary.html がこれを読んで、部ごとの一覧・検索・同じ語の別の意味を出す。
   章の用語表を直したら走らせ直す:  node tools/build-glossary.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(ROOT, 'chapters')).filter((f) => /^\d\d-[a-z0-9-]+\.html$/.test(f)).sort();

const unescapeHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (h) => unescapeHtml(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
/* 定義の中に残してよいタグだけ残す。章の中の場面へのリンクは章のファイルへの絶対リンクにする */
function keepHtml(h, file) {
  h = h.replace(/<a class="xref" href="#(s\d+)"[^>]*>([\s\S]*?)<\/a>/g, (_, id, t) => `<a href="chapters/${file}#${id}">${t}</a>`);
  h = h.replace(/<a ([^>]*)href="(\d\d-[a-z0-9-]+\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, pre, href, t) => `<a href="chapters/${href}">${t}</a>`);
  h = h.replace(/<(?!\/?(sub|sup|code|b|i|a)\b)[^>]+>/g, '');
  return h.replace(/\s+/g, ' ').trim();
}

const chapters = [];
for (const file of files) {
  const html = fs.readFileSync(path.join(ROOT, 'chapters', file), 'utf8');
  const title = text((html.match(/<title>([^<]*)/) || [, ''])[1]).replace(/\s*—.*$/, '');
  const eyebrow = (html.match(/eyebrow:\s*'([^']*)'/) || [, ''])[1];
  const pm = /第([IVX]+)部\s*([^／]+?)\s*／\s*第(\d+)章/.exec(eyebrow) || [];
  const n = Number(pm[3] || file.slice(0, 2));
  const terms = [];
  for (const tbl of html.matchAll(/<table class="gloss[^"]*"[^>]*>([\s\S]*?)<\/table>/g)) {
    for (const tr of tbl[1].matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
      const sw = /<i class="sw ([a-z])"><\/i>/.exec(tr[1]);
      const t = keepHtml(tr[1].replace(/<i class="sw [a-z]"><\/i>/, ''), file);
      terms.push({ t, k: text(tr[1]), d: keepHtml(tr[2], file), c: sw ? sw[1] : '' });
    }
  }
  chapters.push({ n, file, title, part: pm[1] || '', partTitle: (pm[2] || '').trim(), terms });
  console.log(`${file}: ${title} — 用語 ${terms.length}`);
}
const total = chapters.reduce((a, c) => a + c.terms.length, 0);
const out = `/* 用語索引のデータ。tools/build-glossary.mjs が全章の用語表から作る（手で直さない）。作成 ${new Date().toISOString().slice(0, 10)}、用語 ${total} 件 */\nwindow.YT_GLOSSARY = ${JSON.stringify({ built: new Date().toISOString().slice(0, 10), total, chapters }, null, 1)};\n`;
fs.writeFileSync(path.join(ROOT, 'assets', 'glossary-data.js'), out);
console.log(`→ assets/glossary-data.js（${total} 件）`);
