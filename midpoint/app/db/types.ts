export type Author = { id: number; nickname: string };

export type PublicUser = { id: number; email: string; nickname: string };

export type UserRecord = PublicUser & { passwordHash: string; createdAt: string };

export type PostSummary = {
  id: number;
  title: string;
  tags: string[];
  author: Author;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PostDetail = PostSummary & { body: string };

export type CommentView = {
  id: number;
  postId: number;
  body: string;
  author: Author;
  createdAt: string;
};

export type SortKey = "createdAt" | "-createdAt" | "-commentCount";

export type ListParams = { q: string; page: number; limit: number; sort: SortKey };

/**
 * 서비스 계층이 아는 저장소의 모양. 모든 메서드가 Promise를 돌려주므로
 * SQLite든 PostgreSQL이든 서비스 코드는 바뀌지 않는다.
 */
export interface Repo {
  readonly driver: string;
  users: {
    create(input: { email: string; nickname: string; passwordHash: string }): Promise<UserRecord>;
    findByEmail(email: string): Promise<UserRecord | null>;
    findById(id: number): Promise<UserRecord | null>;
  };
  posts: {
    list(params: ListParams): Promise<{ items: PostSummary[]; total: number }>;
    find(id: number): Promise<PostDetail | null>;
    create(input: { authorId: number; title: string; body: string; tags: string[] }): Promise<PostDetail>;
    update(
      id: number,
      patch: { title?: string; body?: string; tags?: string[] },
    ): Promise<PostDetail | null>;
    remove(id: number): Promise<boolean>;
  };
  comments: {
    listByPost(postId: number): Promise<CommentView[]>;
    find(id: number): Promise<CommentView | null>;
    create(input: { postId: number; authorId: number; body: string }): Promise<CommentView>;
    remove(id: number): Promise<boolean>;
  };
  close(): Promise<void>;
}
