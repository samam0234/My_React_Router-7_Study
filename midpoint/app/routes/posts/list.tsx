import { useEffect } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Pagination } from "~/components/pagination";
import { formatDate } from "~/lib/format";
import { useLocalStorage } from "~/lib/use-local-storage";
import { listPosts, parseListQuery } from "~/services/posts.server";
import type { Route } from "./+types/list";

export function meta() {
  return [{ title: "글 목록 · RR7 게시판" }];
}

// URL의 쿼리(?q=&page=&sort=)가 검색 상태의 원본이다. loader가 그것을 읽어 서버에서 조회한다.
export async function loader({ url }: Route.LoaderArgs) {
  const params = parseListQuery(url.searchParams);
  const { data, meta } = await listPosts(params);
  return { posts: data, meta, params };
}

export default function PostList({ loaderData }: Route.ComponentProps) {
  const { posts, meta, params } = loaderData;
  const navigation = useNavigation();
  // 다음 화면의 데이터를 불러오는 중이면 목록을 흐리게 해서 "일하는 중"임을 보여 준다.
  const loading = navigation.state === "loading";

  // 브라우저 localStorage에 최근 검색어 5개를 기억한다(서버는 모르는, 이 브라우저만의 상태).
  const [recent, setRecent, recentReady] = useLocalStorage<string[]>("recent-searches", []);
  useEffect(() => {
    if (!params.q) return;
    setRecent((previous) => [params.q, ...previous.filter((item) => item !== params.q)].slice(0, 5));
  }, [params.q, setRecent]);

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.sort !== "-createdAt") next.set("sort", params.sort);
    if (page > 1) next.set("page", String(page));
    const query = next.toString();
    return query ? `/posts?${query}` : "/posts";
  };

  return (
    <>
      <Form method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder="제목·본문 검색"
          aria-label="검색어"
          className="flex-1 rounded border px-3 py-2 dark:bg-gray-900"
        />
        <select name="sort" defaultValue={params.sort} aria-label="정렬" className="rounded border px-2 dark:bg-gray-900">
          <option value="-createdAt">최신순</option>
          <option value="createdAt">오래된순</option>
          <option value="-commentCount">댓글 많은순</option>
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 text-white">검색</button>
      </Form>

      {recentReady && recent.length > 0 ? (
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm" aria-label="최근 검색어">
          <span className="text-gray-500">최근 검색어</span>
          {recent.map((word) => (
            <Link key={word} to={`/posts?q=${encodeURIComponent(word)}`} className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
              {word}
            </Link>
          ))}
          <button type="button" onClick={() => setRecent([])} className="text-gray-400 underline">지우기</button>
        </p>
      ) : null}

      <p className="mb-2 text-sm text-gray-500">
        {params.q ? `"${params.q}" 검색 결과 ` : "전체 "}
        {meta.total}건
      </p>

      <ul className={`divide-y ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
        {posts.length === 0 ? (
          <li className="py-6 text-center text-gray-500">표시할 글이 없습니다.</li>
        ) : (
          posts.map((post) => (
            <li key={post.id} className="py-3">
              <Link to={`/posts/${post.id}`} className="font-medium text-blue-600 hover:underline">
                {post.title}
              </Link>
              <div className="mt-1 text-sm text-gray-500">
                {post.author.nickname} · {formatDate(post.createdAt)} · 댓글 {post.commentCount}
                {post.tags.map((tag) => (
                  <span key={tag} className="ml-2 rounded bg-gray-100 px-1.5 text-xs dark:bg-gray-800">#{tag}</span>
                ))}
              </div>
            </li>
          ))
        )}
      </ul>

      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
    </>
  );
}
