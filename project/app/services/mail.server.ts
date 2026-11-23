import { getConfig } from "~/config.server";
import { AppError } from "~/lib/errors";

export type Mail = { to: string; subject: string; text: string };

/**
 * 메일 발송. MAIL_DRIVER=log 이면 보내지 않고 로그만 남긴다(개발·테스트용).
 * MAIL_DRIVER=resend 이면 Resend HTTP API를 호출한다. 실패하면 던지므로, 호출하는 쪽(작업 큐)이 재시도한다.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const config = getConfig();
  if (config.MAIL_DRIVER === "log") {
    // 수신자 주소 전체를 로그에 남기지 않는다(개인정보).
    const [local, domain] = mail.to.split("@");
    console.log(JSON.stringify({ level: "info", msg: "mail (log driver)", to: `${local.slice(0, 2)}***@${domain}`, subject: mail.subject }));
    return;
  }
  if (!config.RESEND_API_KEY) throw new AppError(500, "MAIL_NOT_CONFIGURED", "RESEND_API_KEY가 필요합니다.");

  const response = await fetch(`${config.RESEND_BASE_URL}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000), // 외부 서비스가 멈춰도 우리 작업이 영원히 매달리지 않게 한다.
  });
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}

export const welcomeMail = (user: { email: string; nickname: string }): Mail => ({
  to: user.email,
  subject: "가입을 환영합니다",
  text: `${user.nickname}님, RR7 게시판에 가입해 주셔서 감사합니다.`,
});
