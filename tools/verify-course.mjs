#!/usr/bin/env node
// 문서 21개의 형식·링크·노션 원문 반영 여부를 검사한다. 사용: node tools/verify-course.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const ok = [];
const fail = (msg) => problems.push(msg);

const ORDER = [...Array.from({ length: 11 }, (_, i) => `study${i}`), "studyMidpoint", ...Array.from({ length: 8 }, (_, i) => `study${i + 11}`), "studyFinal"];

// 노션 "React Router 7" 페이지의 학습 목표 체크 항목(원문 그대로)과, 그것이 들어가야 하는 번호
const NOTION_ITEMS = [
  { text: "React Router 7 프로젝트 생성 (framework mode)", in: ["study0"] },
  { text: "파일 또는 설정 기반 라우팅, 중첩 레이아웃", in: ["study2", "study4"] },
  { text: "`loader`로 데이터 불러오기 (Next의 서버 컴포넌트 fetch, SvelteKit load와 같은 자리)", in: ["study3", "study6"] },
  { text: "`action` + `Form` 컴포넌트로 글쓰기 (Next Server Action, SvelteKit form action과 비교)", in: ["study5"] },
  { text: "쿠키 세션 로그인과 보호된 라우트", in: ["study7"] },
  { text: "SSR과 로딩·에러 경계", in: ["study4", "study15"] },
];

const SECTIONS = ["① 목표 한 줄", "② 📖 이론", "③ 🛠️ 실기", "④ 🔗 연동 포인트", "⑤ 오류 노트", "⑥ 직접 해보기", "⑦ ☐ 체크리스트", "⑧ 다음 단계 연결"];

// 1. 파일 이름 규칙: 루트의 md는 README.md를 빼고 모두 study로 시작한다.
const rootMd = readdirSync(root).filter((f) => f.endsWith(".md"));
for (const f of rootMd) if (f !== "README.md" && !f.startsWith("study")) fail(`루트 md 이름 규칙 위반: ${f} (study 접두사 필요)`);
if (!rootMd.includes("README.md")) fail("README.md가 없습니다");
for (const name of ORDER) if (!rootMd.includes(`${name}.md`)) fail(`${name}.md가 없습니다`);
if (!rootMd.includes("studyCoverage.md")) fail("studyCoverage.md가 없습니다");
ok.push(`루트 md ${rootMd.length}개(README 1 + study 계열 ${rootMd.length - 1})`);

const docs = {};
for (const name of ORDER) {
  const file = join(root, `${name}.md`);
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  docs[name] = text;

  if (/@@code|@@end/.test(text)) fail(`${name}: 빌드되지 않은 지시문(@@)이 남아 있습니다`);
  if (!new RegExp(`^# ${name} — `, "m").test(text)) fail(`${name}: 제목이 "# ${name} — …" 형식이 아닙니다`);

  // 2. 8개 구성이 순서대로
  let at = -1;
  for (const section of SECTIONS) {
    const idx = text.indexOf(`\n## ${section}`);
    if (idx < 0) fail(`${name}: "## ${section}" 가 없습니다`);
    else if (idx < at) fail(`${name}: "${section}" 순서가 어긋났습니다`);
    else at = idx;
  }
  const part = (from, to) => {
    const a = text.indexOf(`\n## ${from}`);
    const b = to ? text.indexOf(`\n## ${to}`) : text.length;
    return a >= 0 && b > a ? text.slice(a, b) : "";
  };

  const exercises = (part("⑥ 직접 해보기", "⑦ ☐ 체크리스트").match(/^\d+\. /gm) ?? []).length;
  if (exercises < 2 || exercises > 3) fail(`${name}: 직접 해보기가 ${exercises}개입니다(2~3개)`);

  const boxes = (part("⑦ ☐ 체크리스트", "⑧ 다음 단계 연결").match(/^- \[ \] /gm) ?? []).length;
  if (boxes < 4) fail(`${name}: ☐ 체크리스트 항목이 ${boxes}개입니다(4개 이상)`);
  if (/^- \[x\]/im.test(text)) fail(`${name}: 학습자 체크리스트는 ☐로 남겨야 합니다([x] 발견)`);

  const next = part("⑧ 다음 단계 연결");
  const idx = ORDER.indexOf(name);
  const expectedNext = ORDER[idx + 1] ?? null;
  if (expectedNext && !next.includes(`(${expectedNext}.md)`)) fail(`${name}: ⑧에 ${expectedNext}.md 로 가는 링크가 없습니다`);
  if (!expectedNext && !/README\.md|studyCoverage\.md/.test(next)) fail(`${name}: ⑧에 README/studyCoverage 링크가 없습니다`);

  // 3. 지시 사항: 이론에 비유, 실기에 코드
  if (!part("② 📖 이론", "③ 🛠️ 실기").includes("비유")) fail(`${name}: ②에 "비유"가 없습니다`);
  if (!(part("③ 🛠️ 실기", "④ 🔗 연동 포인트").match(/^```/gm)?.length >= 2)) fail(`${name}: ③ 실기에 코드 블록이 없습니다`);
  if (!part("⑤ 오류 노트", "⑥ 직접 해보기").includes("| 증상 | 원인 | 해결 |")) fail(`${name}: ⑤에 증상·원인·해결 표가 없습니다`);

  // 4. 상대 링크가 가리키는 파일이 있는지
  // 코드 블록과 인라인 코드 안의 `](…)`는 링크가 아니라 코드다(예: `[method](...args)`).
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]);
    if (path && !existsSync(join(root, path))) fail(`${name}: 깨진 링크 → ${target}`);
  }
}

// 5. 노션 원문 체크 항목이 지정한 번호에 그대로 들어 있는지
for (const item of NOTION_ITEMS) {
  for (const name of item.in) {
    if (!docs[name]?.includes(`- [ ] ${item.text}`)) fail(`${name}: 노션 원문 체크 항목이 없습니다 → ${item.text}`);
  }
}
ok.push(`노션 원문 체크 항목 ${NOTION_ITEMS.length}개 → ${NOTION_ITEMS.reduce((n, i) => n + i.in.length, 0)}곳 반영 확인`);

// 6. 문서가 소스(tools/docs-src)와 일치하는지(= 코드 인용이 실제 파일과 같은지)
const built = spawnSync(process.execPath, [join(root, "tools", "build-docs.mjs"), "--check"], { encoding: "utf8" });
if (built.status !== 0) fail(`문서가 소스와 다릅니다:\n${built.stdout}${built.stderr}`);
else ok.push("문서 코드 인용이 실제 파일과 일치(build-docs --check)");

if (problems.length) {
  console.error(`✘ ${problems.length}건 문제:`);
  for (const p of problems) console.error(" - " + p);
  process.exit(1);
}
for (const line of ok) console.log("✔ " + line);
console.log(`✔ ${ORDER.length}개 문서: 8개 구성·직접 해보기 2~3개·☐ 체크리스트·다음 단계 링크·상대 링크 모두 통과`);
