import { db } from "../index";
import { users } from "../schema";

export async function createUser(name: string) {
  const [result] = await db
    .insert(users)
    .values({ name: name })
    .returning();

  return result;
}

export async function getUserByName(name: string) {
  const result = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.name, name),
  });

  return result;
}

export async function deleteAllUsers() {
  await db.delete(users);
}

export async function getUsers() {
  return await db.query.users.findMany();
}
