import { getConfig } from "~/config.server";
import { api } from "~/lib/api.server";
import { ok, readJson } from "~/lib/http.server";
import { enqueue } from "~/lib/jobs.server";
import { contactSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";
import { sendMail } from "~/services/mail.server";
import type { Route } from "./+types/contact";

// POST /api/contact → 202. 메일은 뒤에서 보내므로 응답이 빠르다.
export const action = api(async ({ request }: Route.ActionArgs) => {
  const input = parseOrThrow(contactSchema, await readJson(request));
  // "이름 <주소>" 형식의 MAIL_FROM에서 주소만 꺼내 관리자 수신함으로 쓴다.
  const admin = getConfig().MAIL_FROM.match(/<(.+)>/)?.[1] ?? getConfig().MAIL_FROM;
  // 제목에는 사용자 입력을 넣지 않는다(헤더 주입 방지). 본문에만 넣는다.
  enqueue("contact-mail", () =>
    sendMail({ to: admin, subject: "새 문의가 도착했습니다", text: `${input.name} <${input.email}>\n\n${input.message}` }),
  );
  return ok({ received: true }, { status: 202 });
});
