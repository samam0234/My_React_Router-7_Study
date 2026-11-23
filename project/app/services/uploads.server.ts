import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "~/config.server";
import { badRequest, notFound, payloadTooLarge, validationError } from "~/lib/errors";

// 클라이언트가 보낸 Content-Type은 믿지 않는다. 파일 첫 바이트(매직 넘버)로 종류를 직접 판별한다.
const SIGNATURES: { type: string; ext: string; match: (b: Buffer) => boolean }[] = [
  { type: "image/png", ext: "png", match: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { type: "image/jpeg", ext: "jpg", match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/webp",
    ext: "webp",
    match: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { type: "application/pdf", ext: "pdf", match: (b) => b.subarray(0, 4).toString("ascii") === "%PDF" },
];

const NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|pdf)$/;

export type StoredUpload = { name: string; url: string; size: number; contentType: string };

/** multipart 폼의 file 필드를 검사하고 저장한다. */
export async function saveUpload(request: Request): Promise<StoredUpload> {
  const config = getConfig();
  // 본문을 읽기 전에 헤더로 먼저 거른다. 거짓말하는 헤더는 아래에서 실제 크기로 다시 막는다.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > config.MAX_UPLOAD_BYTES + 4096) throw payloadTooLarge(`파일은 ${config.MAX_UPLOAD_BYTES}바이트 이하여야 합니다.`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("multipart/form-data 형식이어야 합니다.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw validationError({ file: ["file 필드에 파일을 넣어 주세요."] });
  if (file.size === 0) throw validationError({ file: ["빈 파일입니다."] });
  if (file.size > config.MAX_UPLOAD_BYTES) throw payloadTooLarge(`파일은 ${config.MAX_UPLOAD_BYTES}바이트 이하여야 합니다.`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = SIGNATURES.find((s) => s.match(bytes));
  if (!kind) throw validationError({ file: ["PNG, JPEG, WEBP, PDF만 올릴 수 있습니다."] });

  // 저장 이름은 서버가 정한다. 원래 파일 이름(경로 조작 문자 포함 가능)을 쓰지 않는다.
  const name = `${randomUUID()}.${kind.ext}`;
  await mkdir(config.UPLOAD_DIR, { recursive: true });
  await writeFile(join(config.UPLOAD_DIR, name), bytes);
  return { name, url: `/uploads/${name}`, size: bytes.length, contentType: kind.type };
}

export async function readUpload(name: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (!NAME_PATTERN.test(name)) throw notFound("파일을 찾을 수 없습니다."); // ../ 같은 경로 조작을 이름 검사로 차단
  const ext = name.split(".").pop()!;
  const kind = SIGNATURES.find((s) => s.ext === ext)!;
  const path = join(getConfig().UPLOAD_DIR, name);
  try {
    await stat(path);
  } catch {
    throw notFound("파일을 찾을 수 없습니다.");
  }
  return { bytes: await readFile(path), contentType: kind.type };
}
