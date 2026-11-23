import { createContext } from "react-router";
import type { PublicUser } from "~/db/types";

/** 미들웨어가 채우고 loader·action이 읽는 요청별 저장소의 열쇠들. */
export type AuthSource = "cookie" | "bearer" | "none";

export const userContext = createContext<PublicUser | null>(null);
export const authSourceContext = createContext<AuthSource>("none");
export const requestIdContext = createContext<string>("");
/** 커스텀 서버(server.ts)가 채운다. 그 밖의 실행 방식에서는 "unknown". */
export const clientIpContext = createContext<string>("unknown");
