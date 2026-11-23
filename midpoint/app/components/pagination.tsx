import { Link } from "react-router";

type Props = {
  page: number;
  totalPages: number;
  /** 현재 검색 조건을 유지한 채 page만 바꾼 주소를 만든다. */
  hrefFor: (page: number) => string;
};

export function Pagination({ page, totalPages, hrefFor }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link to={hrefFor(page - 1)} rel="prev">이전</Link> : <span className="text-gray-400">이전</span>}
      <span aria-current="page">
        {page} / {totalPages}
      </span>
      {page < totalPages ? <Link to={hrefFor(page + 1)} rel="next">다음</Link> : <span className="text-gray-400">다음</span>}
    </nav>
  );
}
