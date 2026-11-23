import { api } from "~/lib/api.server";
import { AppError } from "~/lib/errors";
import type { Route } from "./+types/not-found";

// /api 아래에서 어떤 라우트와도 맞지 않는 주소. HTML 404 페이지가 아니라 JSON 404를 준다.
function missing(url: URL): never {
  throw new AppError(404, "NOT_FOUND", `${url.pathname} 경로가 없습니다.`);
}

export const loader = api(({ url }: Route.LoaderArgs) => missing(url));
export const action = api(({ url }: Route.ActionArgs) => missing(url));
