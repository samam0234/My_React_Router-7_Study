import { data } from "react-router";

// 어떤 경로와도 맞지 않으면 여기로 온다. 404를 던지면 가장 가까운 ErrorBoundary(root)가 그린다.
export function loader() {
  throw data("요청한 페이지가 없습니다.", { status: 404 });
}

// default export가 있어야 "화면 라우트"로 취급된다. 실제로는 렌더링되지 않는다.
export default function NotFound() {
  return null;
}
