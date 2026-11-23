import { MongoClient, type Collection, type Db } from "mongodb";
import { emailTaken } from "~/lib/errors";
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

// MongoDB는 JOIN 대신 문서에 작성자 정보와 댓글 수를 함께 넣는다(비정규화).
type UserDoc = { _id: number; email: string; nickname: string; passwordHash: string; createdAt: Date };
type PostDoc = {
  _id: number;
  author: { id: number; nickname: string };
  title: string;
  body: string;
  tags: string[];
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
};
type CommentDoc = { _id: number; postId: number; author: { id: number; nickname: string }; body: string; createdAt: Date };
type DocumentDoc = {
  _id: number;
  ownerId: number;
  title: string;
  content: string;
  summary: string | null;
  summaryStatus: SummaryStatus;
  byteSize: number;
  createdAt: Date;
  updatedAt: Date;
};
type CounterDoc = { _id: string; seq: number };

const SORT: Record<SortKey, Record<string, 1 | -1>> = {
  createdAt: { createdAt: 1, _id: 1 },
  "-createdAt": { createdAt: -1, _id: -1 },
  "-commentCount": { commentCount: -1, _id: -1 },
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toUser = (d: UserDoc): UserRecord => ({
  id: d._id,
  email: d.email,
  nickname: d.nickname,
  passwordHash: d.passwordHash,
  createdAt: d.createdAt.toISOString(),
});
const toSummary = (d: PostDoc): PostSummary => ({
  id: d._id,
  title: d.title,
  tags: d.tags,
  author: d.author,
  commentCount: d.commentCount,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
});
const toDetail = (d: PostDoc): PostDetail => ({ ...toSummary(d), body: d.body });
const toComment = (d: CommentDoc): CommentView => ({
  id: d._id,
  postId: d.postId,
  body: d.body,
  author: d.author,
  createdAt: d.createdAt.toISOString(),
});
const toDocSummary = (d: DocumentDoc): DocumentSummary => ({
  id: d._id,
  ownerId: d.ownerId,
  title: d.title,
  summary: d.summary,
  summaryStatus: d.summaryStatus,
  byteSize: d.byteSize,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
});

export async function createMongoRepo(url: string): Promise<Repo> {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  // URL 끝의 /board 가 데이터베이스 이름이다. 없으면 "board".
  const db: Db = client.db(new URL(url).pathname.slice(1) || "board");

  const users: Collection<UserDoc> = db.collection("users");
  const posts: Collection<PostDoc> = db.collection("posts");
  const comments: Collection<CommentDoc> = db.collection("comments");
  const documents: Collection<DocumentDoc> = db.collection("documents");
  const counters: Collection<CounterDoc> = db.collection("counters");

  await users.createIndex({ email: 1 }, { unique: true });
  await posts.createIndex({ createdAt: -1 });
  await comments.createIndex({ postId: 1, createdAt: 1 });
  await documents.createIndex({ ownerId: 1, createdAt: -1 });

  // 숫자 id가 필요하다(API 스펙의 id는 정수). 컬렉션별 카운터를 원자적으로 올려 발급한다.
  const nextId = async (name: string) =>
    (await counters.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }))!.seq;

  return {
    driver: "mongo",
    users: {
      async create({ email, nickname, passwordHash }) {
        const doc: UserDoc = { _id: await nextId("users"), email, nickname, passwordHash, createdAt: new Date() };
        try {
          await users.insertOne(doc);
        } catch (error) {
          if ((error as { code?: number }).code === 11000) throw emailTaken(); // E11000 duplicate key
          throw error;
        }
        return toUser(doc);
      },
      async findByEmail(email) {
        const doc = await users.findOne({ email });
        return doc ? toUser(doc) : null;
      },
      async findById(id) {
        const doc = await users.findOne({ _id: id });
        return doc ? toUser(doc) : null;
      },
    },
    posts: {
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
      async find(id) {
        const doc = await posts.findOne({ _id: id });
        return doc ? toDetail(doc) : null;
      },
      async create({ authorId, title, body, tags }) {
        const author = (await users.findOne({ _id: authorId }))!;
        const now = new Date();
        const doc: PostDoc = {
          _id: await nextId("posts"),
          author: { id: author._id, nickname: author.nickname },
          title,
          body,
          tags,
          commentCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        await posts.insertOne(doc);
        return toDetail(doc);
      },
      async update(id, patch) {
        const set: Partial<PostDoc> = { updatedAt: new Date() };
        if (patch.title !== undefined) set.title = patch.title;
        if (patch.body !== undefined) set.body = patch.body;
        if (patch.tags !== undefined) set.tags = patch.tags;
        const doc = await posts.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" });
        return doc ? toDetail(doc) : null;
      },
      async remove(id) {
        const result = await posts.deleteOne({ _id: id });
        // 외래키 CASCADE가 없으므로 댓글을 직접 지운다.
        if (result.deletedCount) await comments.deleteMany({ postId: id });
        return result.deletedCount > 0;
      },
    },
    comments: {
      async listByPost(postId) {
        return (await comments.find({ postId }).sort({ createdAt: 1, _id: 1 }).toArray()).map(toComment);
      },
      async find(id) {
        const doc = await comments.findOne({ _id: id });
        return doc ? toComment(doc) : null;
      },
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
      async remove(id) {
        const doc = await comments.findOneAndDelete({ _id: id });
        if (!doc) return false;
        await posts.updateOne({ _id: doc.postId }, { $inc: { commentCount: -1 } });
        return true;
      },
    },
    documents: {
      async listByOwner(ownerId) {
        const rows = await documents
          .find({ ownerId }, { projection: { content: 0 } })
          .sort({ createdAt: -1, _id: -1 })
          .toArray();
        return rows.map((row) => toDocSummary(row as DocumentDoc));
      },
      async find(id) {
        const doc = await documents.findOne({ _id: id });
        return doc ? { ...toDocSummary(doc), content: doc.content } : null;
      },
      async create({ ownerId, title, content }) {
        const now = new Date();
        const doc: DocumentDoc = {
          _id: await nextId("documents"),
          ownerId,
          title,
          content,
          summary: null,
          summaryStatus: "pending",
          byteSize: Buffer.byteLength(content),
          createdAt: now,
          updatedAt: now,
        };
        await documents.insertOne(doc);
        return { ...toDocSummary(doc), content } satisfies DocumentRecord;
      },
      async setSummary(id, { summary, status }) {
        await documents.updateOne({ _id: id }, { $set: { summary, summaryStatus: status, updatedAt: new Date() } });
      },
      async remove(id) {
        return (await documents.deleteOne({ _id: id })).deletedCount > 0;
      },
    },
    async ping() {
      await db.command({ ping: 1 });
    },
    close: () => client.close(),
  };
}
