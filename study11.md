# study11 — DB 확장

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · [미니 프로젝트 명단](https://app.notion.com/p/40bd7dec5e2e81dab88fda4b558aa498)(AI 미니 프로젝트가 PostgreSQL·MongoDB를 이미 썼음). 코드: [project/app/db/](project/app/db/), [project/compose.yaml](project/compose.yaml).

## ① 목표 한 줄

React Router 7 앱의 DB를 SQLite에서 **MariaDB·PostgreSQL·MongoDB**로 바꿔 연결하는 방법과 ORM 설정의 차이를 익히고, `DB_DRIVER` 환경변수 하나로 교체되는 구조를 직접 확인한다.

## ② 📖 이론

### 왜 DB를 바꾸는가

SQLite는 **파일 하나**라서 시작이 쉽지만 한계가 분명합니다.

| 한계 | 바꿀 이유 |
| --- | --- |
| 서버 **여러 대**가 같은 파일을 안전하게 쓸 수 없다 | 확장·무중단 배포 → 네트워크로 접속하는 DB 서버(PostgreSQL 등) |
| 서버리스·PaaS는 로컬 파일이 사라진다 | 외부 DB |
| 동시 쓰기가 많으면 쓰기가 순서를 기다린다 | 행 단위 잠금을 가진 서버 DB |
| 백업·복제·권한·모니터링 도구 | 서버 DB 생태계 |

### 세 가지 DB, 언제 무엇을

| | PostgreSQL | MariaDB(MySQL 계열) | MongoDB |
| --- | --- | --- | --- |
| 종류 | 관계형(SQL) | 관계형(SQL) | **문서**형(JSON 비슷) |
| 강점 | 표준 SQL, 풍부한 타입·확장(JSONB, 전문 검색), 복잡한 쿼리 | 널리 쓰이는 호스팅, 단순하고 빠른 읽기 | 스키마가 유연, 한 문서에 중첩 데이터 |
| 이 앱에서 | `DB_DRIVER=postgres` | `DB_DRIVER=mariadb` | `DB_DRIVER=mongo` |
| 추천 | **기본 선택**(특별한 이유가 없다면) | 기존 MySQL 자산·호스팅이 있을 때 | 데이터가 "문서" 모양이고 관계가 적을 때 |

### 핵심 개념: 교체 가능하게 만드는 두 겹

```text
service (DB를 모른다)  ──▶  Repo 인터페이스(db/types.ts)  ──▶  구현 4개
                                                           ├─ SqlRepo + SqlExecutor(sqlite | postgres | mariadb)   ← SQL 계열은 "방언 차이"만 다르다
                                                           └─ MongoRepo                                            ← 문서형은 별도 구현
```

- **Repo 인터페이스**: 서비스가 아는 유일한 약속. `posts.list()`, `users.findByEmail()` …
- **SqlExecutor**: SQL 계열 DB 세 종류의 차이(자리표시자, id 얻는 법, 오류 코드)를 한 겹 더 감싼 것. 그 위의 SQL 저장소 코드는 하나만 쓴다.
- **계약 테스트**: "어떤 DB든 이 약속을 지킨다"를 **같은 테스트 한 벌**로 모든 드라이버에 돌려 증명한다.

### ORM이란, 이 앱은 왜 안 썼나

**ORM**(Object-Relational Mapper)은 테이블을 코드의 객체로 다루게 해 주는 도구입니다(SQL을 직접 쓰지 않아도 됨).

| 도구 | 방식 | 설정의 핵심 | 비고 |
| --- | --- | --- | --- |
| **Drizzle** | 코드로 스키마 정의, SQL에 가까운 쿼리 빌더 | `drizzle.config.ts`의 `dialect`(`postgresql`·`mysql`·`sqlite`) + `schema` + 접속 URL | 가볍고 타입이 강함. **MariaDB는 `mysql` 방언**. MongoDB는 지원하지 않음 |
| **Prisma** | `schema.prisma` 한 파일이 원본, 클라이언트 자동 생성 | `datasource`의 `provider`(`postgresql`·`mysql`·`sqlite`·`mongodb`) | MongoDB까지 한 도구로 가능. 설정 위치가 **버전에 따라 다르다**(공식 문서 확인) |
| **TypeORM** | 클래스 + 데코레이터 | `DataSource` 옵션의 `type`(`postgres`·`mariadb`·`mysql`·`sqlite`·`mongodb`) | 방언을 `type`으로 고름 |
| **Mongoose** | MongoDB 전용 스키마·모델 | `mongoose.connect(url)` | 문서형의 사실상 표준 ODM |

이 앱은 학습 목적상 **SQL과 드라이버가 실제로 어떻게 다른지**를 보이려고 ORM 없이 `pg`·`mariadb`·`mongodb` 드라이버를 직접 썼습니다. ORM을 쓰더라도 위 **Repo 인터페이스 뒤에** 숨기면 서비스 코드는 똑같습니다. (아래 ORM 설정은 **참고용이며 이 앱에는 연결하지 않았습니다.**)

```ts
// 참고) Drizzle: 방언만 바꾸면 같은 코드 구조 — drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",          // MariaDB는 "mysql"
  schema: "./app/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### 비유

DB 교체는 **전화번호 이동**과 같습니다. 번호(DB)를 바꿔도 통화(서비스)는 그대로여야 하죠. Repo 인터페이스는 **전화기 규격(RJ11)**, 각 드라이버는 **통신사 어댑터**, 계약 테스트는 **"어떤 통신사로 바꿔도 통화가 되는지" 확인하는 점검 통화**입니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 서비스가 아는 약속: `SqlExecutor`

**`project/app/db/sql-repo.server.ts`** — 실제 파일 21–29줄 · [파일 열기](project/app/db/sql-repo.server.ts#L21-L29)

```ts
export interface SqlExecutor {
  readonly dialect: Dialect;
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; insertId?: number }>;
  /** 이 DB의 "중복 키" 오류인지 판별한다. */
  isUniqueViolation(error: unknown): boolean;
  ping(): Promise<void>;
  close(): Promise<void>;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export interface SqlExecutor {</code> | SQL 계열 DB 세 가지와 대화하는 **최소 창구**. 이것만 구현하면 새 SQL DB를 붙일 수 있다. |
| 2 | <code>readonly dialect: Dialect;</code> | `"sqlite" \| "postgres" \| "mariadb"`. 방언별로 달라지는 곳이 이 값을 본다. |
| 3 | <code>all(sql: string, params?: unknown[]): Promise&lt;…</code> | `SELECT`를 실행해 행 배열을 돌려준다. SQL은 **항상 `?`** 자리표시자로 쓴다. |
| 4–5 | <code>run(sql: string, params?: unknown[]): Promise&lt;…</code> | `INSERT`·`UPDATE`·`DELETE`. 바뀐 행 수와(가능하면) 새 id를 돌려준다. |
| 6 | <code>isUniqueViolation(error: unknown): boolean;</code> | "이미 있는 값" 오류인지 DB마다 다른 방식으로 판별한다. |
| 7 | <code>ping(): Promise&lt;void&gt;;</code> | 연결이 살아 있는지(`/ready`가 쓴다). |
| 8–9 | <code>close(): Promise&lt;void&gt;;</code> | 연결을 닫는다. |

### 2. 방언 차이를 한 곳에서 흡수하는 코드

**`project/app/db/sql-repo.server.ts`** — 실제 파일 114–118줄 · [파일 열기](project/app/db/sql-repo.server.ts#L114-L118)

```ts
// PostgreSQL은 INSERT 뒤 id를 RETURNING으로, 나머지는 드라이버가 알려 주는 insertId로 받는다.
const insert = async (sql: string, params: unknown[]): Promise<number> => {
  if (db.dialect === "postgres") return Number((await db.all(`${sql} RETURNING id`, params))[0].id);
  return Number((await db.run(sql, params)).insertId);
};
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// PostgreSQL은 INSERT 뒤 id를 RETURNING으로, 나머지는 …</code> | 주석: 새 행의 id를 얻는 방법이 DB마다 다르다. |
| 2 | <code>const insert = async (sql: string, params: unk…</code> | `INSERT`를 실행하고 새 id를 돌려주는 공통 도우미. |
| 3 | <code>if (db.dialect === "postgres") return Number((…</code> | PostgreSQL은 `INSERT … RETURNING id`로 **같은 문장에서** id를 받는다. |
| 4–5 | <code>return Number((await db.run(sql, params)).inse…</code> | SQLite·MariaDB는 드라이버가 알려 주는 `insertId`를 쓴다. |

**`project/app/db/sql-repo.server.ts`** — 실제 파일 136–147줄 · [파일 열기](project/app/db/sql-repo.server.ts#L136-L147)

```ts
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
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>async create({ email, nickname, passwordHash }…</code> | 사용자 생성. |
| 2 | <code>try {</code> | 저장을 시도하고 |
| 3–6 | <code>const id = await insert(</code> | 위의 공통 도우미로 id를 받는다. `created_at`은 DB 기본값이 아니라 **JS `Date`를 직접** 넘긴다(방언마다 기본값 문법이 달라서). |
| 7 | <code>return toUser((await one("SELECT * FROM users …</code> | 방금 만든 행을 다시 읽어 완성된 모양으로 돌려준다. |
| 8 | <code>} catch (error) {</code> | 실패하면 |
| 9 | <code>if (db.isUniqueViolation(error)) throw emailTa…</code> | DB마다 다른 "중복" 오류(PostgreSQL `23505`, MariaDB `1062`, SQLite 메시지)를 **같은 `EMAIL_TAKEN`(409)**으로 바꾼다. 서비스는 DB 종류를 모른다. |
| 10–12 | <code>throw error;</code> | 그 밖의 오류는 그대로. |

**`project/app/db/sql-repo.server.ts`** — 실제 파일 50–51줄 · [파일 열기](project/app/db/sql-repo.server.ts#L50-L51)

```ts
// pg는 TIMESTAMPTZ를 Date로, SQLite는 문자열로 돌려준다. 어느 쪽이든 ISO 문자열로 통일한다.
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// pg는 TIMESTAMPTZ를 Date로, SQLite는 문자열로 돌려준다. …</code> | 주석: 시각이 드라이버마다 다른 모양으로 온다. |
| 2 | <code>const iso = (value: unknown) =&gt; (value instanc…</code> | `Date`면 `toISOString()`, 문자열이면 그대로 → 응답의 시각은 항상 **ISO 8601 UTC 문자열**(스펙 v1). |

**`project/app/db/sql-repo.server.ts`** — 실제 파일 92–93줄 · [파일 열기](project/app/db/sql-repo.server.ts#L92-L93)

```ts
/** LIKE의 % 와 _ 를 일반 문자로 만든다. 이스케이프 문자는 모든 DB에서 같은 뜻인 ! 를 쓴다. */
const likePattern = (q: string) => `%${q.toLowerCase().replace(/[!%_]/g, "!$&")}%`;
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** LIKE의 % 와 _ 를 일반 문자로 만든다. 이스케이프 문자는 모든 DB에…</code> | 주석: 이스케이프 문자를 `!`로 고정한 이유. |
| 2 | <code>const likePattern = (q: string) =&gt; `%${q.toLow…</code> | 검색어의 `%`·`_`를 글자로 만든다(`!%`, `!_`). SQL 쪽에서 `ESCAPE '!'`를 함께 쓴다. **백슬래시는 MariaDB에서 문자열 이스케이프로 먼저 해석되어** 방언 간 이식성이 없다. |

### 3. 방언별 스키마(마이그레이션)

같은 `users` 테이블이 세 DB에서 이렇게 다릅니다.

**`project/app/db/migrations.ts`** — 실제 파일 8–15줄 · [파일 열기](project/app/db/migrations.ts#L8-L15)

```ts
sqlite: [
  [
    `CREATE TABLE users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL UNIQUE,
       nickname TEXT NOT NULL,
       password_hash TEXT NOT NULL,
       created_at TEXT NOT NULL)`,
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>sqlite: [</code> | SQLite용 마이그레이션 목록. |
| 3 | <code>`CREATE TABLE users (</code> | 사용자 테이블. |
| 4–7 | <code>id INTEGER PRIMARY KEY AUTOINCREMENT,</code> | 자동 증가 키: `AUTOINCREMENT`. |
| 8 | <code>created_at TEXT NOT NULL)`,</code> | 시각은 **TEXT**(ISO 문자열)로 저장. SQLite에는 시각 전용 타입이 없다. |

**`project/app/db/migrations.ts`** — 실제 파일 48–55줄 · [파일 열기](project/app/db/migrations.ts#L48-L55)

```ts
postgres: [
  [
    `CREATE TABLE users (
       id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
       email VARCHAR(255) NOT NULL UNIQUE,
       nickname VARCHAR(40) NOT NULL,
       password_hash TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL)`,
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>postgres: [</code> | PostgreSQL용. |
| 3 | <code>`CREATE TABLE users (</code> | 같은 테이블. |
| 4 | <code>id INTEGER GENERATED BY DEFAULT AS IDENTITY PR…</code> | 표준 SQL의 **IDENTITY** 열. (`BIGSERIAL`을 쓰면 id가 문자열로 와서 번거롭다.) |
| 5–7 | <code>email VARCHAR(255) NOT NULL UNIQUE,</code> | 길이가 있는 문자열 타입. |
| 8 | <code>created_at TIMESTAMPTZ NOT NULL)`,</code> | **시간대 포함** 시각 타입. |

**`project/app/db/migrations.ts`** — 실제 파일 88–96줄 · [파일 열기](project/app/db/migrations.ts#L88-L96)

```ts
mariadb: [
  [
    `CREATE TABLE users (
       id INT AUTO_INCREMENT PRIMARY KEY,
       email VARCHAR(255) NOT NULL UNIQUE,
       nickname VARCHAR(40) NOT NULL,
       password_hash TEXT NOT NULL,
       created_at DATETIME(3) NOT NULL
     ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>mariadb: [</code> | MariaDB용. |
| 3 | <code>`CREATE TABLE users (</code> | 같은 테이블. |
| 4 | <code>id INT AUTO_INCREMENT PRIMARY KEY,</code> | 자동 증가: `AUTO_INCREMENT`. |
| 5–7 | <code>email VARCHAR(255) NOT NULL UNIQUE,</code> | `UNIQUE` 열은 길이가 있는 타입이어야 한다. |
| 8 | <code>created_at DATETIME(3) NOT NULL</code> | 밀리초 정밀도의 날짜·시각. 시간대 정보는 없어 **드라이버 `timezone: "Z"`로 UTC를 약속**한다. |
| 9 | <code>) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicod…</code> | **한글·이모지**를 위해 `utf8mb4`. (`utf8`은 3바이트라 이모지가 깨진다.) |

### 4. PostgreSQL 연결

**`project/app/db/drivers/postgres.server.ts`** — 전체 · [파일 열기](project/app/db/drivers/postgres.server.ts#L1-L33)

```ts
import pg from "pg";
import { migrate, type SqlExecutor } from "../sql-repo.server";

/** ? 자리표시자를 PostgreSQL 방식($1, $2 …)으로 바꾼다. 문자열 리터럴 안의 ?는 쓰지 않는 규칙이다. */
const toDollar = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

export async function openPostgres(url: string): Promise<SqlExecutor> {
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  // 유휴 연결이 끊겨도 프로세스가 죽지 않게 한다.
  pool.on("error", (error) => console.error(JSON.stringify({ level: "error", msg: "pg pool", error: String(error) })));

  const executor: SqlExecutor = {
    dialect: "postgres",
    async all(sql, params = []) {
      return (await pool.query(toDollar(sql), params)).rows as Record<string, unknown>[];
    },
    async run(sql, params = []) {
      const result = await pool.query(toDollar(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
    // 23505 = unique_violation
    isUniqueViolation: (error) => (error as { code?: string })?.code === "23505",
    async ping() {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
  await migrate(executor);
  return executor;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>import pg from "pg";</code> | PostgreSQL 공식 Node 드라이버. |
| 4 | <code>/** ? 자리표시자를 PostgreSQL 방식($1, $2 …)으로 바꾼다. 문자…</code> | 주석: 방언 차이 ①. |
| 5 | <code>const toDollar = (sql: string) =&gt; {</code> | PostgreSQL은 `?`가 아니라 **`$1`, `$2`**를 쓴다. 우리 SQL의 `?`를 순서대로 바꾼다(문자열 리터럴 안에 `?`를 쓰지 않는 규칙). |
| 6 | <code>let n = 0;</code> | 몇 번째 자리표시자인지. |
| 7–8 | <code>return sql.replace(/\?/g, () =&gt; `$${++n}`);</code> | 모든 `?`를 `$1`, `$2` …로. |
| 10 | <code>export async function openPostgres(url: string…</code> | 접속 주소(`postgres://사용자:비밀번호@호스트:5432/DB`)로 연다. |
| 11 | <code>const pool = new pg.Pool({ connectionString: u…</code> | **커넥션 풀**: 연결을 미리 몇 개 만들어 두고 재사용한다(요청마다 연결을 새로 맺지 않는다). 최대 10개, 30초 놀면 정리. |
| 12 | <code>// 유휴 연결이 끊겨도 프로세스가 죽지 않게 한다.</code> | 주석. |
| 13 | <code>pool.on("error", (error) =&gt; console.error(JSON…</code> | 놀고 있는 연결이 DB 쪽에서 끊겨도 **프로세스가 죽지 않고** 기록만 한다(이 핸들러가 없으면 예외로 서버가 종료된다). |
| 15 | <code>const executor: SqlExecutor = {</code> | `SqlExecutor`를 구현한 객체. |
| 16 | <code>dialect: "postgres",</code> | 방언 표시. |
| 17 | <code>async all(sql, params = []) {</code> | `SELECT`. |
| 18–19 | <code>return (await pool.query(toDollar(sql), params…</code> | `?`를 `$n`으로 바꿔 실행하고 `rows`만 돌려준다. |
| 20 | <code>async run(sql, params = []) {</code> | 쓰기. |
| 21 | <code>const result = await pool.query(toDollar(sql),…</code> | 실행. |
| 22–23 | <code>return { changes: result.rowCount ?? 0 };</code> | PostgreSQL은 `insertId`가 없다 → 위의 `RETURNING id`를 쓴다. |
| 24 | <code>// 23505 = unique_violation</code> | 주석: 오류 코드. |
| 25 | <code>isUniqueViolation: (error) =&gt; (error as { code…</code> | PostgreSQL의 중복 키 코드 `23505`. |
| 26–28 | <code>async ping() {</code> | `SELECT 1`로 살아 있는지 확인. |
| 29–30 | <code>close: () =&gt; pool.end(),</code> | 풀 종료. |
| 31 | <code>await migrate(executor);</code> | 접속하자마자 스키마를 맞춘다. |
| 32–33 | <code>return executor;</code> | 완성. |

### 5. MariaDB 연결

**`project/app/db/drivers/mariadb.server.ts`** — 실제 파일 4–38줄 · [파일 열기](project/app/db/drivers/mariadb.server.ts#L4-L38)

```ts
export async function openMariadb(url: string): Promise<SqlExecutor> {
  const parsed = new URL(url);
  const pool = mariadb.createPool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "Z", // DATETIME을 UTC로 읽고 쓴다.
    // 기본값은 BigInt다. JS 숫자로 받아야 서비스 코드가 DB를 의식하지 않는다.
    insertIdAsNumber: true,
    bigIntAsNumber: true,
  });

  const executor: SqlExecutor = {
    dialect: "mariadb",
    async all(sql, params = []) {
      return (await pool.query(sql, params)) as Record<string, unknown>[];
    },
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return { changes: Number(result.affectedRows), insertId: Number(result.insertId) };
    },
    // 1062 = ER_DUP_ENTRY
    isUniqueViolation: (error) => (error as { errno?: number })?.errno === 1062,
    async ping() {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
  await migrate(executor);
  return executor;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function openMariadb(url: string)…</code> | 접속 주소(`mariadb://사용자:비밀번호@호스트:3306/DB`)로 연다. |
| 2 | <code>const parsed = new URL(url);</code> | 주소를 분해한다(`URL`은 `mariadb://` 같은 낯선 스킴도 읽는다). |
| 3 | <code>const pool = mariadb.createPool({</code> | 커넥션 풀. |
| 4 | <code>host: parsed.hostname,</code> | 호스트. |
| 5 | <code>port: parsed.port ? Number(parsed.port) : 3306…</code> | 포트가 없으면 3306. |
| 6–7 | <code>user: decodeURIComponent(parsed.username),</code> | 비밀번호에 `@`·`:` 같은 문자가 있으면 URL에서 `%40`처럼 인코딩되므로 되돌린다. |
| 8 | <code>database: parsed.pathname.slice(1),</code> | 경로의 앞 `/`를 떼면 DB 이름. |
| 9 | <code>connectionLimit: 10,</code> | 풀 크기. |
| 10 | <code>charset: "utf8mb4",</code> | 한글·이모지. |
| 11 | <code>timezone: "Z", // DATETIME을 UTC로 읽고 쓴다.</code> | `DATETIME`을 UTC로 읽고 쓴다. |
| 12 | <code>// 기본값은 BigInt다. JS 숫자로 받아야 서비스 코드가 DB를 의식하지 않…</code> | 주석: 방언 차이 ②. |
| 13 | <code>insertIdAsNumber: true,</code> | 새 id를 JS 숫자로(기본은 `BigInt`라 JSON 변환이 깨진다). |
| 14–15 | <code>bigIntAsNumber: true,</code> | `COUNT(*)` 같은 큰 정수도 숫자로. |
| 17 | <code>const executor: SqlExecutor = {</code> | `SqlExecutor` 구현. |
| 18 | <code>dialect: "mariadb",</code> | 방언 표시. |
| 19–21 | <code>async all(sql, params = []) {</code> | `SELECT`. 이 드라이버는 `?`를 그대로 쓴다. |
| 22–25 | <code>async run(sql, params = []) {</code> | 쓰기: `affectedRows`와 `insertId`. |
| 26 | <code>// 1062 = ER_DUP_ENTRY</code> | 주석. |
| 27 | <code>isUniqueViolation: (error) =&gt; (error as { errn…</code> | MariaDB의 중복 키 오류 번호 `1062`. |
| 28–30 | <code>async ping() {</code> | 연결 확인. |
| 31–32 | <code>close: () =&gt; pool.end(),</code> | 풀 종료. |
| 33 | <code>await migrate(executor);</code> | 스키마 적용. |
| 34–35 | <code>return executor;</code> | 완성. |

### 6. MongoDB: 같은 약속, 다른 방식

문서형은 JOIN이 없어 **작성자 정보와 댓글 수를 문서 안에 함께 저장**하고(비정규화), 외래키 CASCADE가 없어 글을 지울 때 댓글을 직접 지웁니다. 정수 id는 카운터 컬렉션으로 만듭니다.

**`project/app/db/mongo.server.ts`** — 실제 파일 101–103줄 · [파일 열기](project/app/db/mongo.server.ts#L101-L103)

```ts
// 숫자 id가 필요하다(API 스펙의 id는 정수). 컬렉션별 카운터를 원자적으로 올려 발급한다.
const nextId = async (name: string) =>
  (await counters.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }))!.seq;
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 숫자 id가 필요하다(API 스펙의 id는 정수). 컬렉션별 카운터를 원자적으…</code> | 주석: API 스펙의 id는 정수인데 MongoDB의 기본 `_id`는 `ObjectId` 문자열이다. |
| 2–3 | <code>const nextId = async (name: string) =&gt;</code> | 컬렉션 이름별 카운터를 **원자적으로** 올려 새 번호를 받는다(`$inc` + `upsert` + `returnDocument: "after"`). 동시에 두 요청이 와도 같은 번호가 나가지 않는다. |

**`project/app/db/mongo.server.ts`** — 실제 파일 128–137줄 · [파일 열기](project/app/db/mongo.server.ts#L128-L137)

```ts
async list({ q, page, limit, sort }) {
  const filter = q
    ? { $or: [{ title: { $regex: escapeRegex(q), $options: "i" } }, { body: { $regex: escapeRegex(q), $options: "i" } }] }
    : {};
  const [total, rows] = await Promise.all([
    posts.countDocuments(filter),
    posts.find(filter).sort(SORT[sort]).skip((page - 1) * limit).limit(limit).toArray(),
  ]);
  return { items: rows.map(toSummary), total };
},
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>async list({ q, page, limit, sort }) {</code> | 목록·검색·정렬·쪽. |
| 2 | <code>const filter = q</code> | 검색어가 있으면 제목·본문에 **정규식**(대소문자 무시)을 건다. |
| 3–4 | <code>? { $or: [{ title: { $regex: escapeRegex(q), $…</code> | 사용자 입력을 정규식 특수문자 이스케이프한다(안 하면 `.*` 입력이 전체 매칭되거나 비싼 정규식으로 서버가 느려진다 — **ReDoS**). |
| 5 | <code>const [total, rows] = await Promise.all([</code> | 개수 세기와 한 쪽 읽기를 **동시에** 실행한다. |
| 6 | <code>posts.countDocuments(filter),</code> | 전체 개수. |
| 7–8 | <code>posts.find(filter).sort(SORT[sort]).skip((page…</code> | 정렬은 허용 목록(`SORT`)에서 고른 것만 쓰고, `.skip((page - 1) * limit).limit(limit)`로 쪽을 나눈다. |
| 9–10 | <code>return { items: rows.map(toSummary), total };</code> | 문서를 모델로 바꿔 돌려준다. 이 모양은 SQL 저장소와 **완전히 같다.** |

**`project/app/db/mongo.server.ts`** — 실제 파일 181–193줄 · [파일 열기](project/app/db/mongo.server.ts#L181-L193)

```ts
async create({ postId, authorId, body }) {
  const author = (await users.findOne({ _id: authorId }))!;
  const doc: CommentDoc = {
    _id: await nextId("comments"),
    postId,
    author: { id: author._id, nickname: author.nickname },
    body,
    createdAt: new Date(),
  };
  await comments.insertOne(doc);
  await posts.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
  return toComment(doc);
},
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>async create({ postId, authorId, body }) {</code> | 댓글 작성. |
| 2 | <code>const author = (await users.findOne({ _id: aut…</code> | 작성자 닉네임을 **문서에 복사해 넣으려고** 읽는다. |
| 3 | <code>const doc: CommentDoc = {</code> | 댓글 문서: `author`가 `{id, nickname}`으로 내장된다(JOIN이 필요 없다). |
| 4–9 | <code>_id: await nextId("comments"),</code> | 정수 id. |
| 10 | <code>await comments.insertOne(doc);</code> | 저장. |
| 11 | <code>await posts.updateOne({ _id: postId }, { $inc:…</code> | 글 문서의 `commentCount`를 `$inc: +1`. **두 컬렉션을 따로 쓰므로** 트랜잭션이 없으면 둘이 어긋날 수 있다 — 운영에서 중요하면 트랜잭션(복제셋 필요)이나 재계산 작업을 둔다. |
| 12–13 | <code>return toComment(doc);</code> | 완성. |

### 7. `DB_DRIVER` 하나로 교체

**`project/app/db/index.server.ts`** — 실제 파일 10–22줄 · [파일 열기](project/app/db/index.server.ts#L10-L22)

```ts
async function connect(): Promise<Repo> {
  const config = getConfig();
  switch (config.DB_DRIVER) {
    case "sqlite":
      return createSqlRepo(await openSqlite(config.DATABASE_PATH));
    case "postgres":
      return createSqlRepo(await openPostgres(config.DATABASE_URL));
    case "mariadb":
      return createSqlRepo(await openMariadb(config.DATABASE_URL));
    case "mongo":
      return createMongoRepo(config.DATABASE_URL);
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>async function connect(): Promise&lt;Repo&gt; {</code> | 설정을 읽어 알맞은 저장소를 만든다. **DB가 바뀌는 곳은 여기뿐이다.** |
| 2 | <code>const config = getConfig();</code> | 검증된 설정. |
| 3 | <code>switch (config.DB_DRIVER) {</code> | `sqlite \| postgres \| mariadb \| mongo`. 철자가 틀리면 설정 검증이 이미 막았다. |
| 4–5 | <code>case "sqlite":</code> | 파일 경로(`DATABASE_PATH`)로 연다. |
| 6–7 | <code>case "postgres":</code> | `DATABASE_URL`로 연다 → `SqlExecutor` → `createSqlRepo`. |
| 8–9 | <code>case "mariadb":</code> | 같은 방식. |
| 10–13 | <code>case "mongo":</code> | MongoDB는 SQL이 아니므로 **별도 저장소**를 만든다. |

**`project/app/db/index.server.ts`** — 실제 파일 28–50줄 · [파일 열기](project/app/db/index.server.ts#L28-L50)

```ts
function lazyRepo(factory: () => Promise<Repo>, driver: string): Repo {
  let ready: Promise<Repo> | undefined;
  const connected = () => (ready ??= factory());
  const delegate = <T extends object>(pick: (repo: Repo) => T): T =>
    new Proxy({} as T, {
      get:
        (_target, method) =>
        (...args: unknown[]) =>
          connected().then((repo) => (pick(repo) as Record<string | symbol, (...a: unknown[]) => unknown>)[method](...args)),
    });
  return {
    driver,
    users: delegate((repo) => repo.users),
    posts: delegate((repo) => repo.posts),
    comments: delegate((repo) => repo.comments),
    documents: delegate((repo) => repo.documents),
    ping: () => connected().then((repo) => repo.ping()),
    close: async () => {
      if (ready) await (await ready).close();
      ready = undefined;
    },
  };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>function lazyRepo(factory: () =&gt; Promise&lt;Repo&gt;…</code> | 접속은 비동기(`await`)인데 서비스는 `getRepo()`를 **동기로** 부르고 싶다. 그래서 껍데기를 먼저 돌려준다. |
| 2 | <code>let ready: Promise&lt;Repo&gt; &#124; undefined;</code> | 접속이 끝났는지 담는 약속(Promise). |
| 3 | <code>const connected = () =&gt; (ready ??= factory());</code> | **처음 쓰일 때** 접속을 시작하고 이후는 같은 약속을 재사용한다. |
| 4–8 | <code>const delegate = &lt;T extends object&gt;(pick: (rep…</code> | `Proxy`로 만든 위임자: `repo.posts.list(…)`를 부르면 접속이 끝난 뒤 진짜 저장소의 같은 메서드를 호출한다. |
| 9–10 | <code>connected().then((repo) =&gt; (pick(repo) as Reco…</code> | 접속을 기다렸다가 위임. |
| 11–12 | <code>return {</code> | `Repo`의 모양을 갖춘 껍데기. |
| 13–16 | <code>users: delegate((repo) =&gt; repo.users),</code> | 각 영역을 위임자로 감싼다. |
| 17 | <code>ping: () =&gt; connected().then((repo) =&gt; repo.pi…</code> | 헬스·준비 확인도 접속을 기다린다. |
| 18–23 | <code>close: async () =&gt; {</code> | 종료: 접속했다면 진짜 저장소를 닫고 다시 쓸 수 있게 초기화한다. |

### 8. 같은 시험을 모든 DB에: 계약 테스트

**`project/tests/repo-contract.test.ts`** — 실제 파일 15–20줄 · [파일 열기](project/tests/repo-contract.test.ts#L15-L20)

```ts
const targets: { name: string; url: string | undefined; open: (url: string) => Promise<Repo> }[] = [
  { name: "sqlite", url: ":memory:", open: async (url) => createSqlRepo(await openSqlite(url)) },
  { name: "postgres", url: process.env.TEST_POSTGRES_URL, open: async (url) => createSqlRepo(await openPostgres(url)) },
  { name: "mariadb", url: process.env.TEST_MARIADB_URL, open: async (url) => createSqlRepo(await openMariadb(url)) },
  { name: "mongo", url: process.env.TEST_MONGO_URL, open: createMongoRepo },
];
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>const targets: { name: string; url: string &#124; u…</code> | 시험할 DB 목록. |
| 2 | <code>{ name: "sqlite", url: ":memory:", open: async…</code> | **항상 실행**: 메모리 DB(`:memory:`). |
| 3 | <code>{ name: "postgres", url: process.env.TEST_POST…</code> | `TEST_POSTGRES_URL`이 있을 때만(없으면 건너뛴다). |
| 4 | <code>{ name: "mariadb", url: process.env.TEST_MARIA…</code> | `TEST_MARIADB_URL`. |
| 5–6 | <code>{ name: "mongo", url: process.env.TEST_MONGO_U…</code> | `TEST_MONGO_URL`. SQL이 아니라 `createMongoRepo`를 바로 쓴다. |

### 9. DB 서버 띄우기

**`project/compose.yaml`** — 실제 파일 30–44줄 · [파일 열기](project/compose.yaml#L30-L44)

```yaml
postgres:
  image: postgres:17-alpine
  environment:
    POSTGRES_USER: rr7
    POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-rr7pass}"
    POSTGRES_DB: board
  ports:
    - "${POSTGRES_PORT:-15432}:5432"
  volumes:
    - pgdata:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U rr7 -d board"]
    interval: 5s
    timeout: 3s
    retries: 10
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>postgres:</code> | PostgreSQL 컨테이너. |
| 2–3 | <code>image: postgres:17-alpine</code> | **버전을 고정**한다(`latest`는 어느 날 갑자기 바뀐다). |
| 4 | <code>POSTGRES_USER: rr7</code> | 접속 사용자. |
| 5 | <code>POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-rr7pa…</code> | 비밀번호. `${…:-기본값}`은 환경변수가 없을 때만 쓰는 **로컬 학습용 기본값**이다. 운영은 반드시 바꾼다. |
| 6 | <code>POSTGRES_DB: board</code> | 처음 만들 DB 이름. |
| 7–8 | <code>ports:</code> | 호스트 `15432` → 컨테이너 `5432`. 호스트에 이미 PostgreSQL이 있어도 부딪히지 않게 포트를 바꿨다. |
| 9–10 | <code>volumes:</code> | **데이터 볼륨**. 컨테이너를 지워도 DB가 남는다. |
| 11–15 | <code>healthcheck:</code> | `pg_isready`로 "접속 가능" 상태를 확인한다. 앱은 `depends_on: condition: service_healthy`로 이것을 기다린다. |

**`project/compose.yaml`** — 실제 파일 46–60줄 · [파일 열기](project/compose.yaml#L46-L60)

```yaml
mariadb:
  profiles: ["databases"]
  image: mariadb:11
  environment:
    MARIADB_ROOT_PASSWORD: "${MARIADB_PASSWORD:-rr7pass}"
    MARIADB_DATABASE: board
  ports:
    - "${MARIADB_PORT:-13306}:3306"
  volumes:
    - mariadata:/var/lib/mysql
  healthcheck:
    test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
    interval: 5s
    timeout: 3s
    retries: 20
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>mariadb:</code> | MariaDB 컨테이너. `profiles: ["databases"]`라서 `--profile databases`를 줄 때만 뜬다. |
| 3–4 | <code>image: mariadb:11</code> | 버전 고정. |
| 5 | <code>MARIADB_ROOT_PASSWORD: "${MARIADB_PASSWORD:-rr…</code> | 루트 비밀번호. |
| 6 | <code>MARIADB_DATABASE: board</code> | 처음 만들 DB. |
| 7–8 | <code>ports:</code> | 호스트 `13306`. |
| 9–10 | <code>volumes:</code> | 데이터 보존. |
| 11–15 | <code>healthcheck:</code> | `healthcheck.sh`로 InnoDB가 준비됐는지 확인. |

```powershell
# 1) DB 서버 3종 띄우기 (처음엔 이미지를 받느라 몇 분)
$env:SESSION_SECRET = "x"; $env:JWT_SECRET = "y"       # compose 파일의 필수 변수를 채우기 위한 값(DB 컨테이너만 쓸 땐 내용 무관)
docker compose --profile databases up -d postgres mariadb mongo
docker compose --profile databases ps                 # 세 개 모두 (healthy)

# 2) 계약 테스트: 같은 시험을 4개 DB에
$env:TEST_POSTGRES_URL = "postgres://rr7:rr7pass@localhost:15432/board"
$env:TEST_MARIADB_URL  = "mariadb://root:rr7pass@localhost:13306/board"
$env:TEST_MONGO_URL    = "mongodb://localhost:27018/board_test"
npx vitest run tests/repo-contract.test.ts            # 20개 통과(5개 시험 × 4개 DB)

# 3) 요청 테스트 전체를 DB마다 새 데이터베이스로
npm run build
node tools/db-e2e.mjs                                 # postgres · mariadb · mongo 각각 86개 통과
```

> 이 저장소 검증 결과: 계약 테스트 **20/20**, 요청 테스트는 SQLite·PostgreSQL 17·MariaDB 11·MongoDB 8에서 **각각 전부 통과**했습니다(항목 수는 [docs/verification.md](docs/verification.md)).

## ④ 🔗 연동 포인트

### 앱을 다른 DB로 띄우기

```powershell
# PostgreSQL로 개발 서버
$env:DB_DRIVER = "postgres"
$env:DATABASE_URL = "postgres://rr7:rr7pass@localhost:15432/board"
npm run dev       # 가입·글쓰기는 같은 화면 그대로, 데이터는 PostgreSQL에 쌓인다
docker compose exec postgres psql -U rr7 -d board -c "select id, email, nickname from users"
```

| 바꿀 것 | SQLite | PostgreSQL | MariaDB | MongoDB |
| --- | --- | --- | --- | --- |
| `DB_DRIVER` | `sqlite` | `postgres` | `mariadb` | `mongo` |
| 접속 정보 | `DATABASE_PATH=./data/board.db` | `DATABASE_URL=postgres://u:p@host:5432/db` | `DATABASE_URL=mariadb://u:p@host:3306/db` | `DATABASE_URL=mongodb://host:27017/db` |
| 마이그레이션 | 앱 시작 시 자동(`schema_migrations`) | 〃 | 〃 | 인덱스 자동 생성 |
| 백업 | `VACUUM INTO`(study16) | `pg_dump` | `mariadb-dump` | `mongodump` |

### 방언 차이 한눈에

| 항목 | SQLite | PostgreSQL | MariaDB | MongoDB |
| --- | --- | --- | --- | --- |
| 자리표시자 | `?` | `$1, $2` | `?` | (쿼리 객체) |
| 새 id 얻기 | `lastInsertRowid` | `RETURNING id` | `insertId` | 카운터 컬렉션 |
| 시각 타입 | `TEXT`(ISO) | `TIMESTAMPTZ` | `DATETIME(3)` | `Date` |
| 문자 집합 | UTF-8 | UTF-8 | **`utf8mb4` 지정 필요** | UTF-8 |
| 중복 키 오류 | 메시지 `UNIQUE constraint failed` | 코드 `23505` | 번호 `1062` | 코드 `11000` |
| `COUNT(*)` 반환 | 숫자 | **문자열(int8)** | **BigInt** | 숫자 |
| 외래키 CASCADE | `PRAGMA foreign_keys=ON` 필요 | 기본 | InnoDB 기본 | 없음(직접 삭제) |
| DDL과 트랜잭션 | 트랜잭션 안에서 가능 | 가능 | **DDL은 암묵적 커밋** | — |

### 서비스는 어디가 바뀌었나

**하나도 안 바뀌었습니다.** 바뀐 것은 `db/` 폴더와 환경변수뿐입니다. 이것이 study6에서 서비스를 `repo` 인터페이스 위에 둔 보상입니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `password authentication failed for user "rr7"` | 비밀번호 불일치. **볼륨에 남은 옛 비밀번호**: DB 컨테이너는 *처음 만들 때만* 비밀번호를 설정한다 | 비밀번호를 바꿨다면 `docker compose down -v`로 볼륨을 지우고(데이터 삭제 주의) 다시 만든다 |
| `ECONNREFUSED 127.0.0.1:15432` | 컨테이너가 아직 안 떴거나 포트가 다름 | `docker compose ps`로 `healthy` 확인, 포트(15432) 확인 |
| 컨테이너 안의 앱이 `localhost`로 DB에 못 붙음 | 컨테이너 안의 `localhost`는 **자기 자신** | compose에서는 서비스 이름(`postgres`)을 호스트로 쓴다 |
| 글 개수가 `"3"`(문자열)로 나옴 | PostgreSQL `COUNT(*)`는 `bigint` → 문자열 | `Number(row.n)`로 변환(이 코드의 `toSummary`·`list`가 한다) |
| JSON 직렬화 오류 `Do not know how to serialize a BigInt` | MariaDB 드라이버가 정수를 `BigInt`로 돌려줌 | 풀 옵션 `insertIdAsNumber`·`bigIntAsNumber` |
| 한글이 `???`로 저장 | MariaDB 문자 집합이 `latin1`/`utf8` | 테이블·연결을 `utf8mb4`로(`CHARACTER SET utf8mb4`, `charset`) |
| 검색에서 `%`를 입력하면 전부 나옴 | `LIKE` 와일드카드 | `ESCAPE '!'` + `likePattern`(백슬래시 대신) |
| `E11000 duplicate key error` | MongoDB 유니크 인덱스 위반 | 코드 `11000`을 `EMAIL_TAKEN`으로 변환(이 코드가 한다) |
| `MongoServerSelectionError` | MongoDB에 접속 못 함(주소·방화벽·기동 전) | URL 확인, `serverSelectionTimeoutMS`로 빠르게 실패하게 한다 |
| 다른 DB로 바꿨더니 새 DB가 비어 있음 | 데이터는 **자동 이전되지 않는다** | 이전은 별도 작업(덤프·임포트 스크립트)이다. 이 과정은 "교체 구조"까지 다룬다 |
| 동시에 두 서버가 마이그레이션을 실행 | 인스턴스를 여럿 동시에 띄움 | 운영에서는 마이그레이션을 **배포 단계에서 한 번만** 실행(잠금·전용 작업) |

## ⑥ 직접 해보기

1. `docker compose --profile databases up -d postgres mariadb mongo`로 DB 3종을 띄우고 계약 테스트를 실행한다. 일부러 `TEST_POSTGRES_URL`의 비밀번호를 틀리게 해 실패 메시지를 읽어 본 뒤 고친다.
2. `DB_DRIVER=postgres`로 개발 서버를 띄워 가입·글쓰기를 해 보고, `psql`로 `select * from posts`를 확인한다. 같은 방법으로 MariaDB(`mysql` 대신 `docker compose exec mariadb mariadb -uroot -prr7pass board`)와 MongoDB(`mongosh`)에서 데이터를 눈으로 본다.
3. `migrations.ts`의 세 방언 **모두**에 `posts.pinned`(0/1) 열을 새 마이그레이션 항목으로 추가하고, `Repo` 타입과 세 저장소를 고쳐 계약 테스트에 "고정한 글이 목록 앞에 온다"를 추가한다. 어느 DB에서 가장 손이 많이 가는지 적는다.

## ⑦ ☐ 체크리스트

- [ ] SQLite의 한계와 PostgreSQL·MariaDB·MongoDB를 고르는 기준을 말할 수 있다.
- [ ] `Repo` 인터페이스와 `SqlExecutor`가 각각 무엇을 숨기는지 설명할 수 있다.
- [ ] 자리표시자, id 얻기, 시각 타입, 문자 집합, 중복 오류 코드의 방언 차이를 표 없이 세 가지 이상 말할 수 있다.
- [ ] `DB_DRIVER`·`DATABASE_URL`만 바꿔 세 DB로 앱을 띄우고 같은 화면이 동작함을 확인했다.
- [ ] 계약 테스트를 모든 DB에 실행했고, 서비스 코드가 하나도 바뀌지 않았음을 확인했다.
- [ ] ORM(Drizzle·Prisma·TypeORM·Mongoose)의 설정 차이를 표로 설명할 수 있고, 이 앱이 ORM을 쓰지 않은 이유를 안다.

## ⑧ 다음 단계 연결

저장소가 어떤 DB든 같은 모양이 됐으니 [study12.md](study12.md)에서 화면 쪽을 키웁니다: **UI 라이브러리·상태 관리·폼 라이브러리**를 React Router 7과 연동합니다.
