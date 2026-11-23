import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { emailTaken } from "~/lib/errors";
import type { CommentView, ListParams, PostDetail, PostSummary, Repo, SortKey, UserRecord } from "./types";

// 번호가 곧 스키마 버전이다. 항목을 추가만 하고 고치지 않는다.
const MIGRATIONS = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email TEXT NOT NULL UNIQUE,
     nickname TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE TABLE posts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     tags TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX idx_posts_created ON posts(created_at);
   CREATE TABLE comments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
     author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     body TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX idx_comments_post ON comments(post_id);`,
];

// 정렬 키를 SQL로 바꾸는 허용 목록. 사용자 입력을 SQL에 이어 붙이지 않는다.
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

type Row = Record<string, string | number | bigint | null | Uint8Array>;

export function openSqlite(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = user_version; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

const toUser = (row: Row): UserRecord => ({
  id: Number(row.id),
  email: String(row.email),
  nickname: String(row.nickname),
  passwordHash: String(row.password_hash),
  createdAt: String(row.created_at),
});

const toSummary = (row: Row): PostSummary => ({
  id: Number(row.id),
  title: String(row.title),
  tags: JSON.parse(String(row.tags)) as string[],
  author: { id: Number(row.author_id), nickname: String(row.author_nickname) },
  commentCount: Number(row.comment_count),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const toDetail = (row: Row): PostDetail => ({ ...toSummary(row), body: String(row.body) });

const toComment = (row: Row): CommentView => ({
  id: Number(row.id),
  postId: Number(row.post_id),
  body: String(row.body),
  author: { id: Number(row.author_id), nickname: String(row.author_nickname) },
  createdAt: String(row.created_at),
});

/**
 * LIKE의 % 와 _ 를 일반 문자로 취급하게 이스케이프한다.
 * 이스케이프 문자로 백슬래시 대신 !를 쓴다. 백슬래시는 DB마다 해석이 달라(MariaDB 등) 이식성이 떨어진다.
 */
const likePattern = (q: string) => `%${q.toLowerCase().replace(/[!%_]/g, "!$&")}%`;

export function createSqliteRepo(db: DatabaseSync): Repo {
  const get = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as Row | undefined;
  const all = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as Row[];
  const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

  const findPost = (id: number) => {
    const row = get(`${POST_SELECT} WHERE p.id = ?`, id);
    return row ? toDetail(row) : null;
  };
  const findComment = (id: number) => {
    const row = get(
      `SELECT c.id, c.post_id, c.body, c.created_at, u.id AS author_id, u.nickname AS author_nickname
       FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
      id,
    );
    return row ? toComment(row) : null;
  };

  return {
    driver: "sqlite",
    users: {
      async create({ email, nickname, passwordHash }) {
        try {
          const result = run(
            "INSERT INTO users (email, nickname, password_hash) VALUES (?, ?, ?)",
            email,
            nickname,
            passwordHash,
          );
          return toUser(get("SELECT * FROM users WHERE id = ?", Number(result.lastInsertRowid))!);
        } catch (error) {
          // 동시에 같은 이메일로 가입하면 UNIQUE 제약이 마지막 방어선이 된다.
          if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
            throw emailTaken();
          }
          throw error;
        }
      },
      async findByEmail(email) {
        const row = get("SELECT * FROM users WHERE email = ?", email);
        return row ? toUser(row) : null;
      },
      async findById(id) {
        const row = get("SELECT * FROM users WHERE id = ?", id);
        return row ? toUser(row) : null;
      },
    },
    posts: {
      async list({ q, page, limit, sort }: ListParams) {
        const where = q ? "WHERE lower(p.title) LIKE ? ESCAPE '!' OR lower(p.body) LIKE ? ESCAPE '!'" : "";
        const filter: SQLInputValue[] = q ? [likePattern(q), likePattern(q)] : [];
        const total = Number(
          get(`SELECT COUNT(*) AS n FROM posts p ${where}`, ...filter)!.n,
        );
        const rows = all(
          `${POST_SELECT} ${where} ORDER BY ${ORDER_BY[sort]} LIMIT ? OFFSET ?`,
          ...filter,
          limit,
          (page - 1) * limit,
        );
        return { items: rows.map(toSummary), total };
      },
      async find(id) {
        return findPost(id);
      },
      async create({ authorId, title, body, tags }) {
        const result = run(
          "INSERT INTO posts (author_id, title, body, tags) VALUES (?, ?, ?, ?)",
          authorId,
          title,
          body,
          JSON.stringify(tags),
        );
        return findPost(Number(result.lastInsertRowid))!;
      },
      async update(id, patch) {
        const current = findPost(id);
        if (!current) return null;
        run(
          `UPDATE posts SET title = ?, body = ?, tags = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
          patch.title ?? current.title,
          patch.body ?? current.body,
          JSON.stringify(patch.tags ?? current.tags),
          id,
        );
        return findPost(id);
      },
      async remove(id) {
        return run("DELETE FROM posts WHERE id = ?", id).changes > 0;
      },
    },
    comments: {
      async listByPost(postId) {
        return all(
          `SELECT c.id, c.post_id, c.body, c.created_at, u.id AS author_id, u.nickname AS author_nickname
           FROM comments c JOIN users u ON u.id = c.author_id
           WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`,
          postId,
        ).map(toComment);
      },
      async find(id) {
        return findComment(id);
      },
      async create({ postId, authorId, body }) {
        const result = run(
          "INSERT INTO comments (post_id, author_id, body) VALUES (?, ?, ?)",
          postId,
          authorId,
          body,
        );
        return findComment(Number(result.lastInsertRowid))!;
      },
      async remove(id) {
        return run("DELETE FROM comments WHERE id = ?", id).changes > 0;
      },
    },
    async close() {
      db.close();
    },
  };
}
