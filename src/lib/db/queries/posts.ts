import { db } from "../index";
import { posts, feedFollows } from "../schema";
import { eq, desc } from "drizzle-orm";

export async function createPost(
  title: string,
  url: string,
  description: string | null,
  publishedAt: Date | null,
  feedId: string,
) {
  const [result] = await db
    .insert(posts)
    .values({
      title,
      url,
      description,
      publishedAt,
      feedId,
    })
    .onConflictDoNothing()
    .returning();

  return result;
}

export async function getPostsForUser(
  userId: string,
  limit: number,
) {
  return await db
    .select()
    .from(posts)
    .innerJoin(
      feedFollows,
      eq(posts.feedId, feedFollows.feedId),
    )
    .where(eq(feedFollows.userId, userId))
    .orderBy(desc(posts.publishedAt))
    .limit(limit);
}
