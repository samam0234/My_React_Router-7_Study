import { Link } from "react-router";
import { listPosts } from "~/services/posts.server";
import type { Route } from "./+types/home";

export function meta() {
  return [{ title: "RR7 게시판" }, { name: "description", content: "React Router 7 프레임워크 모드로 만든 게시판" }];
}

// loader는 서버에서 실행된다. 반환값이 곧 컴포넌트의 loaderData다.
export async function loader() {
  const { data } = await listPosts({ q: "", page: 1, limit: 5, sort: "-createdAt" });
  return { latest: data };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <section>
      <h1 className="text-3xl font-bold">React Router 7 게시판</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        loader로 읽고 action으로 쓰는 풀스택 게시판입니다.
      </p>
      <h2 className="mt-8 text-xl font-semibold">최근 글</h2>
      {loaderData.latest.length === 0 ? (
        <p className="mt-2 text-gray-500">아직 글이 없습니다. 첫 글을 써 보세요.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {loaderData.latest.map((post) => (
            <li key={post.id} className="py-2">
              <Link to={`/posts/${post.id}`} className="text-blue-600 hover:underline">
                {post.title}
              </Link>
              <span className="ml-2 text-sm text-gray-500">
                {post.author.nickname} · 댓글 {post.commentCount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
