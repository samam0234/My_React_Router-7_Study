import { AppError } from "~/lib/errors";
import { errorResponse } from "~/lib/http.server";
import { readUpload } from "~/services/uploads.server";
import type { Route } from "./+types/uploads-file";

// GET /uploads/:name — 올린 파일을 내려준다. 이름은 서버가 만든 UUID 형식만 통과한다(경로 조작 차단).
export async function loader({ params }: Route.LoaderArgs) {
  try {
    const { bytes, contentType } = await readUpload(params.name);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff", // 브라우저가 내용을 보고 종류를 멋대로 바꿔 해석하지 못하게
        "Content-Security-Policy": "default-src 'none'; sandbox", // 혹시 HTML이 섞여 있어도 스크립트가 실행되지 않게
        "Cache-Control": "public, max-age=31536000, immutable", // 이름이 내용마다 유일하므로 영구 캐시 가능
      },
    });
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error, "");
    throw error;
  }
}
