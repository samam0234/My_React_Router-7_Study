#!/usr/bin/env node
// 문서 빌더: tools/docs-src/*.md  →  저장소 루트의 study*.md
//
// 소스 문서에서 아래 지시문을 만나면 "실제 파일"을 읽어 코드 블록과 줄별 설명 표를 만든다.
// 코드를 문서에 복사해 붙이지 않으므로 코드가 바뀌어도 문서의 코드는 항상 실제 파일과 같다.
//
//   @@code midpoint/app/lib/errors.ts from=/^export class AppError/ to=/^\}/
//   `class AppError` | 이 줄이 하는 일 설명
//   `constructor`    | 다음 줄들이 하는 일 설명
//   @@end
//
//  - from/to: /정규식/ 또는 "부분 문자열". to를 생략하면 from 한 줄, from까지 생략하면 파일 전체.
//  - 설명 줄의 왼쪽(`…`)은 "이 설명이 시작되는 줄"을 찾는 부분 문자열이다. 다음 설명 줄이 나올 때까지가 그 설명의 범위다.
//  - 빈 줄이 아닌 모든 줄이 어떤 설명의 범위 안에 있어야 한다(= 줄별 설명). 아니면 빌드가 실패한다.
//
// 사용: node tools/build-docs.mjs          (생성)
//       node tools/build-docs.mjs --check  (생성 결과가 저장소의 파일과 같은지만 검사)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "tools", "docs-src");
const checkOnly = process.argv.includes("--check");
const MAX_EXCERPT = 90;

const LANG = { ".ts": "ts", ".tsx": "tsx", ".mjs": "js", ".js": "js", ".json": "json", ".css": "css", ".yaml": "yaml", ".yml": "yaml", ".md": "md", ".sql": "sql" };
const langOf = (file) => {
  const name = basename(file);
  if (name === "Dockerfile") return "dockerfile";
  if (name.startsWith(".env")) return "dotenv";
  if (name === ".gitignore" || name === "Caddyfile") return "text";
  return LANG[extname(file)] ?? "text";
};

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

/** from=/re/ 또는 from="text" 형태의 속성을 읽는다. */
function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(/(\w+)=(\/(?:\\.|[^/])*\/|"[^"]*")/g)) {
    const [, key, raw] = m;
    attrs[key] = raw.startsWith("/") ? { re: new RegExp(raw.slice(1, -1)) } : { text: raw.slice(1, -1) };
  }
  return attrs;
}
const matches = (matcher, line) => (matcher.re ? matcher.re.test(line) : line.includes(matcher.text));

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;");
const cell = (s) => s.replace(/\|/g, "\\|");

function renderCode(where, header, rows) {
  // 경로 뒤의 나머지는 공백을 그대로 둔 채 속성으로 읽는다(정규식 안의 공백이 줄어들면 안 된다).
  const space = header.search(/\s/);
  const path = space < 0 ? header : header.slice(0, space);
  const attrs = parseAttrs(space < 0 ? "" : header.slice(space));
  const abs = join(root, path);
  if (!existsSync(abs)) return fail(where, `파일이 없습니다: ${path}`), "";
  const all = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").split("\n");
  if (all.at(-1) === "") all.pop();

  let start = 0;
  let end = all.length - 1;
  if (attrs.from) {
    start = all.findIndex((l) => matches(attrs.from, l));
    if (start < 0) return fail(where, `${path}: from에 맞는 줄이 없습니다`), "";
    if (attrs.to) {
      end = all.findIndex((l, i) => i > start && matches(attrs.to, l));
      if (end < 0) return fail(where, `${path}: to에 맞는 줄이 없습니다 (from 줄 ${start + 1} 이후)`), "";
    } else end = start;
  }
  while (start < end && all[start].trim() === "") start++;
  while (end > start && all[end].trim() === "") end--;
  const lines = all.slice(start, end + 1);
  if (lines.length > MAX_EXCERPT) fail(where, `${path}: 발췌가 ${lines.length}줄입니다(최대 ${MAX_EXCERPT}). 나눠서 보여 주세요.`);

  // 공통 들여쓰기를 걷어 내서 함수 안쪽만 인용해도 보기 좋게 한다.
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  const shown = lines.map((l) => l.slice(indent));

  // 설명 줄 → 시작 줄 번호 찾기
  const anchors = [];
  let cursor = 0;
  for (const row of rows) {
    const m = row.match(/^`(.+?)`\s*\|\s*(.+)$/);
    if (!m) { fail(where, `${path}: 설명 줄 형식 오류 → ${row}`); continue; }
    const at = shown.findIndex((l, i) => i >= cursor && l.includes(m[1]));
    if (at < 0) { fail(where, `${path}: 앵커 \`${m[1]}\` 를 줄 ${cursor + 1} 이후에서 찾지 못했습니다`); continue; }
    anchors.push({ at, text: m[2] });
    cursor = at + 1;
  }
  if (anchors.length === 0) return fail(where, `${path}: 설명이 없습니다`), "";
  const firstCode = shown.findIndex((l) => l.trim());
  // 첫 설명 앞에는 { [ 같은 여는 괄호 줄만 남을 수 있다. 그 줄들은 첫 설명에 포함한다.
  const before = shown.slice(firstCode, anchors[0].at);
  if (before.some((l) => !/^[\[\]{}()]*,?$/.test(l.trim()))) fail(where, `${path}: ${firstCode + 1}~${anchors[0].at}번째 줄이 설명 없이 남습니다(첫 설명 앞)`);
  anchors[0].at = Math.min(anchors[0].at, firstCode);

  const table = anchors.map((a, i) => {
    const last = (anchors[i + 1]?.at ?? shown.length) - 1;
    let to = last;
    while (to > a.at && !shown[to].trim()) to--;
    const range = to > a.at ? `${a.at + 1}–${to + 1}` : `${a.at + 1}`;
    const preview = shown[a.at].trim();
    const code = preview.length > 46 ? `${preview.slice(0, 46)}…` : preview;
    return `| ${range} | <code>${escapeHtml(code)}</code> | ${cell(a.text)} |`;
  });

  const real = `${path}#L${start + 1}-L${end + 1}`;
  const scope = attrs.from ? `실제 파일 ${start + 1}–${end + 1}줄` : "전체";
  return [
    `**\`${path}\`** — ${scope} · [파일 열기](${real})`,
    "",
    "```" + langOf(path),
    ...shown,
    "```",
    "",
    "줄 번호는 위 코드의 첫 줄을 1로 셉니다.",
    "",
    "| 줄 | 코드 | 설명 |",
    "| --- | --- | --- |",
    ...table,
    "",
  ].join("\n");
}

function build(name) {
  const where = name;
  const src = readFileSync(join(srcDir, name), "utf8").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inFence = false;
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith("@@code ")) {
      const rows = [];
      let j = i + 1;
      for (; j < src.length && src[j] !== "@@end"; j++) if (src[j].trim()) rows.push(src[j]);
      if (j >= src.length) { fail(where, `줄 ${i + 1}: @@end가 없습니다`); break; }
      out.push(renderCode(`${where}:${i + 1}`, line.slice(7).trim(), rows));
      i = j;
    } else {
      out.push(line);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

let changed = 0;
for (const name of readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort()) {
  const text = build(name);
  const target = join(root, name);
  const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    changed++;
    if (!checkOnly) writeFileSync(target, text);
    else console.log(`다름: ${name}`);
  }
}

if (errors.length) {
  console.error(`\n문서 빌드 오류 ${errors.length}건:`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log(checkOnly ? (changed ? `✘ ${changed}개 문서가 소스와 다릅니다. node tools/build-docs.mjs 를 실행하세요.` : "✔ 모든 문서가 소스와 같습니다.") : `✔ 문서 ${readdirSync(srcDir).filter((f) => f.endsWith(".md")).length}개 생성(${changed}개 변경)`);
process.exit(checkOnly && changed ? 1 : 0);
