/**
 * CSV 한 칸. 쉼표·따옴표·줄바꿈이 있으면 큰따옴표로 감싸고 안의 "를 ""로 바꾼다.
 * 엑셀은 =, +, -, @ 로 시작하는 칸을 수식으로 실행하므로(CSV 인젝션) 앞에 ' 를 붙여 글자로 만든다.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsvRow = (cells: unknown[]) => cells.map(csvCell).join(",") + "\r\n";
