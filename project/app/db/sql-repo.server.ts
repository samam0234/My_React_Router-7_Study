import { emailTaken } from "~/lib/errors";
import { MIGRATIONS, type Dialect } from "./migrations";
import type {
  CommentView,
  DocumentRecord,
  DocumentSummary,
  PostDetail,
  PostSummary,
  Repo,
  SortKey,
  SummaryStatus,
  UserRecord,
} from "./types";

type Row = Record<string, unknown>;

/**
 * SQL 계열 DB 한 종류와 대화하는 최소 창구. 드라이버(node:sqlite, pg, mariadb)마다
 * 하나씩 구현하고, 저장소 로직은 이 인터페이스만 본다. SQL은 항상 ? 로 쓴다.
 */
export interface SqlExecutor {
  readonly dialect: Dialect;
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; insertId?: number }>;
  /** 이 DB의 "중복 키" 오류인지 판별한다. */
  isUniqueViolation(error: unknown): boolean;
  ping(): Promise<void>;
  close(): Promise<void>;
}

// 정렬 키 → SQL 허용 목록. 사용자 입력을 SQL에 이어 붙이지 않는다.
const ORDER_BY: Record<SortKey, string> = {
  createdAt: "p.created_at ASC, p.id ASC",
  "-createdAt": "p.created_at DESC, p.id DESC",
  "-commentCount": "comment_count DESC, p.id DESC",
};

const POST_SELECT = `
  SELECT p.id, p.title, p.body, p.tags, p.created_at, p.updated_at,
         u.id AS author_id, u.nickname AS author_nickname,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
  FROM posts p JOIN users u ON u.id = p.author_id`;

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.body, c.created_at, u.id AS author_id, u.nickname AS author_nickname
  FROM comments c JOIN users u ON u.id = c.author_id`;

const DOC_COLUMNS = "id, owner_id, title, summary, summary_status, byte_size, created_at, updated_at";

// pg는 TIMESTAMPTZ를 Date로, SQLite는 문자열로 돌려준다. 어느 쪽이든 ISO 문자열로 통일한다.
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));

const toUser = (row: Row): UserRecord => ({
  id: Number(row.id),
  email: String(row.email),
  nickname: String(row.nickname),
  passwordHash: String(row.password_hash),
  createdAt: iso(row.created_at),
});

const toSummary = (row: Row): PostSummary => ({
  id: Number(row.id),
  title: String(row.title),
  tags: JSON.parse(String(row.tags)) as string[],
  author: { id: Number(row.author_id), nickname: String(row.author_nickname) },
  commentCount: Number(row.comment_count),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const toDetail = (row: Row): PostDetail => ({ ...toSummary(row), body: String(row.body) });

const toComment = (row: Row): CommentView => ({
  id: Number(row.id),
  postId: Number(row.post_id),
  body: String(row.body),
  author: { id: Number(row.author_id), nickname: String(row.author_nickname) },
  createdAt: iso(row.created_at),
});

const toDocSummary = (row: Row): DocumentSummary => ({
  id: Number(row.id),
  ownerId: Number(row.owner_id),
  title: String(row.title),
  summary: row.summary == null ? null : String(row.summary),
  summaryStatus: String(row.summary_status) as SummaryStatus,
  byteSize: Number(row.byte_size),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

/** LIKE의 % 와 _ 를 일반 문자로 만든다. 이스케이프 문자는 모든 DB에서 같은 뜻인 ! 를 쓴다. */
const likePattern = (q: string) => `%${q.toLowerCase().replace(/[!%_]/g, "!$&")}%`;

export async function migrate(db: SqlExecutor) {
  await db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)",
  );
  const applied = new Set((await db.all("SELECT version FROM schema_migrations")).map((r) => Number(r.version)));
  for (const [index, statements] of MIGRATIONS[db.dialect].entries()) {
    const version = index + 1;
    if (applied.has(version)) continue;
    for (const statement of statements) await db.run(statement);
    await db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
      version,
      new Date().toISOString(),
    ]);
  }
}

export function createSqlRepo(db: SqlExecutor): Repo {
  const one = async (sql: string, params: unknown[] = []) => (await db.all(sql, params))[0];

  // PostgreSQL은 INSERT 뒤 id를 RETURNING으로, 나머지는 드라이버가 알려 주는 insertId로 받는다.
  const insert = async (sql: string, params: unknown[]): Promise<number> => {
    if (db.dialect === "postgres") return Number((await db.all(`${sql} RETURNING id`, params))[0].id);
    return Number((await db.run(sql, params)).insertId);
  };

  const findPost = async (id: number) => {
    const row = await one(`${POST_SELECT} WHERE p.id = ?`, [id]);
    return row ? toDetail(row) : null;
  };
  const findComment = async (id: number) => {
    const row = await one(`${COMMENT_SELECT} WHERE c.id = ?`, [id]);
    return row ? toComment(row) : null;
  };
  const findDocument = async (id: number): Promise<DocumentRecord | null> => {
    const row = await one(`SELECT ${DOC_COLUMNS}, content FROM documents WHERE id = ?`, [id]);
    return row ? { ...toDocSummary(row), content: String(row.content) } : null;
  };

  return {
    driver: db.dialect,
    users: {
      async create({ email, nickname, passwordHash }) {
        try {
          const id = await insert(
            "INSERT INTO users (email, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)",
            [email, nickname, passwordHash, new Date()],
          );
          return toUser((await one("SELECT * FROM users WHERE id = ?", [id]))!);
        } catch (error) {
          if (db.isUniqueViolation(error)) throw emailTaken();
          throw error;
        }
      },
      async findByEmail(email) {
        const row = await one("SELECT * FROM users WHERE email = ?", [email]);
        return row ? toUser(row) : null;
      },
      async findById(id) {
        const row = await one("SELECT * FROM users WHERE id = ?", [id]);
        return row ? toUser(row) : null;
      },
    },
    posts: {
      async list({ q, page, limit, sort }) {
        const where = q ? "WHERE lower(p.title) LIKE ? ESCAPE '!' OR lower(p.body) LIKE ? ESCAPE '!'" : "";
        const filter = q ? [likePattern(q), likePattern(q)] : [];
        const total = Number((await one(`SELECT COUNT(*) AS n FROM posts p ${where}`, filter))!.n);
        const rows = await db.all(
          `${POST_SELECT} ${where} ORDER BY ${ORDER_BY[sort]} LIMIT ? OFFSET ?`,
          [...filter, limit, (page - 1) * limit],
        );
        return { items: rows.map(toSummary), total };
      },
      find: findPost,
      async create({ authorId, title, body, tags }) {
        const now = new Date();
        const id = await insert(
          "INSERT INTO posts (author_id, title, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [authorId, title, body, JSON.stringify(tags), now, now],
        );
        return (await findPost(id))!;
      },
      async update(id, patch) {
        const current = await findPost(id);
        if (!current) return null;
        await db.run("UPDATE posts SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?", [
          patch.title ?? current.title,
          patch.body ?? current.body,
          JSON.stringify(patch.tags ?? current.tags),
          new Date(),
          id,
        ]);
        return findPost(id);
      },
      async remove(id) {
        return (await db.run("DELETE FROM posts WHERE id = ?", [id])).changes > 0;
      },
    },
    comments: {
      async listByPost(postId) {
        const rows = await db.all(`${COMMENT_SELECT} WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`, [postId]);
        return rows.map(toComment);
      },
      find: findComment,
      async create({ postId, authorId, body }) {
        const id = await insert("INSERT INTO comments (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?)", [
          postId,
          authorId,
          body,
          new Date(),
        ]);
        return (await findComment(id))!;
      },
      async remove(id) {
        return (await db.run("DELETE FROM comments WHERE id = ?", [id])).changes > 0;
      },
    },
    documents: {
      async listByOwner(ownerId) {
        const rows = await db.all(
          `SELECT ${DOC_COLUMNS} FROM documents WHERE owner_id = ? ORDER BY created_at DESC, id DESC`,
          [ownerId],
        );
        return rows.map(toDocSummary);
      },
      find: findDocument,
      async create({ ownerId, title, content }) {
        const now = new Date();
        const id = await insert(
          `INSERT INTO documents (owner_id, title, content, summary_status, byte_size, created_at, updated_at)
           VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
          [ownerId, title, content, Buffer.byteLength(content), now, now],
        );
        return (await findDocument(id))!;
      },
      async setSummary(id, { summary, status }) {
        await db.run("UPDATE documents SET summary = ?, summary_status = ?, updated_at = ? WHERE id = ?", [
          summary,
          status,
          new Date(),
          id,
        ]);
      },
      async remove(id) {
        return (await db.run("DELETE FROM documents WHERE id = ?", [id])).changes > 0;
      },
    },
    ping: () => db.ping(),
    close: () => db.close(),
  };
}
