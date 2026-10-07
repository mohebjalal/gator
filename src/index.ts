import { readConfig, setUser } from "./config";
import { fetchFeed } from "./rss";

import {
  createUser,
  getUserByName,
  deleteAllUsers,
  getUsers,
} from "./lib/db/queries/users";

import {
  createFeed,
  getFeeds,
  getFeedByUrl,
  getNextFeedToFetch,
  markFeedFetched,
} from "./lib/db/queries/feeds";

import {
  createFeedFollow,
  getFeedFollowsForUser,
  deleteFeedFollow,
} from "./lib/db/queries/feed_follows";

import {
  createPost,
  getPostsForUser,
} from "./lib/db/queries/posts";

import type { Feed, User } from "./lib/db/schema";

function printFeed(feed: Feed, user: User): void {
  console.log(`Feed: ${feed.name}`);
  console.log(`URL: ${feed.url}`);
  console.log(`User: ${user.name}`);
}

async function handlerFeeds(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const feeds = await getFeeds();

  for (const feed of feeds) {
    console.log(
      `* ${feed.name} - ${feed.url} - ${feed.user.name}`,
    );
  }
}

async function handlerAddFeed(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 2) {
    throw new Error("name and url are required");
  }

  const name = args[0];
  const url = args[1];

  const feed = await createFeed(name, url, user.id);

  const follow = await createFeedFollow(user.id, feed.id);

  console.log(`Feed: ${follow.feedName}`);
  console.log(`User: ${follow.userName}`);
}

function parseDuration(durationStr: string): number {
  const regex = /^(\d+)(ms|s|m|h)$/;
  const match = durationStr.match(regex);

  if (!match) {
    throw new Error(
      `invalid duration: ${durationStr}. Use formats like 1s, 1m, 1h, or 100ms`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    default:
      throw new Error(`invalid duration unit: ${unit}`);
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  const totalSeconds = Math.floor(milliseconds / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes}m${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }

  return `${seconds}s`;
}

async function scrapeFeeds(): Promise<void> {
  const feed = await getNextFeedToFetch();

  if (!feed) {
    console.log("No feeds to fetch");
    return;
  }

  console.log(`Fetching feed: ${feed.name}`);

  const rssFeed = await fetchFeed(feed.url);

  await markFeedFetched(feed.id);

  for (const item of rssFeed.channel.item) {
    let publishedAt: Date | null = null;

    if (item.pubDate) {
      const parsedDate = new Date(item.pubDate);

      if (!Number.isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate;
      }
    }

    await createPost(
      item.title,
      item.link,
      item.description,
      publishedAt,
      feed.id,
    );
  }
}

async function handlerAgg(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length < 1) {
    throw new Error("time_between_reqs is required");
  }

  const timeBetweenRequests = parseDuration(args[0]);

  console.log(
    `Collecting feeds every ${formatDuration(timeBetweenRequests)}`,
  );

  const handleError = (err: unknown): void => {
    console.error(err);
  };

  await scrapeFeeds().catch(handleError);

  const interval = setInterval(() => {
    scrapeFeeds().catch(handleError);
  }, timeBetweenRequests);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      console.log("Shutting down feed aggregator...");
      clearInterval(interval);
      resolve();
    });
  });
}

async function handlerUsers(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const users = await getUsers();
  const config = readConfig();

  for (const user of users) {
    if (user.name === config.currentUserName) {
      console.log(`* ${user.name} (current)`);
    } else {
      console.log(`* ${user.name}`);
    }
  }
}

async function handlerFollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 1) {
    throw new Error("url is required");
  }

  const url = args[0];

  const feed = await getFeedByUrl(url);

  if (!feed) {
    throw new Error(`feed with url ${url} does not exist`);
  }

  const follow = await createFeedFollow(user.id, feed.id);

  console.log(`Feed: ${follow.feedName}`);
  console.log(`User: ${follow.userName}`);
}

async function handlerFollowing(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  const follows = await getFeedFollowsForUser(user.id);

  for (const follow of follows) {
    console.log(follow.feedName);
  }
}

async function handlerUnfollow(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length < 1) {
    throw new Error("url is required");
  }

  const url = args[0];

  const feed = await getFeedByUrl(url);

  if (!feed) {
    throw new Error(`feed with url ${url} does not exist`);
  }

  await deleteFeedFollow(user.id, feed.id);
}

async function handlerBrowse(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  let limit = 2;

  if (args.length >= 1) {
    limit = Number(args[0]);

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("limit must be a positive integer");
    }
  }

  const posts = await getPostsForUser(user.id, limit);

  for (const post of posts) {
    console.log(`Title: ${post.posts.title}`);
    console.log(`URL: ${post.posts.url}`);
    console.log(`Description: ${post.posts.description}`);
    console.log(`Published: ${post.posts.publishedAt}`);
    console.log("---");
  }
}

type CommandHandler = (
  cmdName: string,
  ...args: string[]
) => Promise<void>;

type UserCommandHandler = (
  cmdName: string,
  user: User,
  ...args: string[]
) => Promise<void>;

type CommandsRegistry = {
  [key: string]: CommandHandler;
};

function middlewareLoggedIn(
  handler: UserCommandHandler,
): CommandHandler {
  return async (
    cmdName: string,
    ...args: string[]
  ): Promise<void> => {
    const config = readConfig();

    if (!config.currentUserName) {
      throw new Error("no user is currently logged in");
    }

    const user = await getUserByName(config.currentUserName);

    if (!user) {
      throw new Error(
        `user ${config.currentUserName} does not exist`,
      );
    }

    await handler(cmdName, user, ...args);
  };
}

async function handlerLogin(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("username is required");
  }

  const username = args[0];

  const user = await getUserByName(username);

  if (!user) {
    throw new Error(`user ${username} does not exist`);
  }

  setUser(username);

  console.log(`user has been set to ${username}`);
}

async function handlerRegister(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("username is required");
  }

  const username = args[0];

  const existingUser = await getUserByName(username);

  if (existingUser) {
    throw new Error(`user ${username} already exists`);
  }

  const user = await createUser(username);

  setUser(username);

  console.log(`user ${username} was created`);
  console.log(user);
}

async function handlerReset(
  cmdName: string,
  ...args: string[]
): Promise<void> {
  await deleteAllUsers();

  console.log("database reset successfully");
}

function registerCommand(
  registry: CommandsRegistry,
  cmdName: string,
  handler: CommandHandler,
): void {
  registry[cmdName] = handler;
}

async function runCommand(
  registry: CommandsRegistry,
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const handler = registry[cmdName];

  if (!handler) {
    throw new Error(`unknown command: ${cmdName}`);
  }

  await handler(cmdName, ...args);
}

async function main(): Promise<void> {
  const registry: CommandsRegistry = {};

  registerCommand(registry, "login", handlerLogin);
  registerCommand(registry, "register", handlerRegister);
  registerCommand(registry, "reset", handlerReset);
  registerCommand(registry, "users", handlerUsers);
  registerCommand(registry, "agg", handlerAgg);

  registerCommand(
    registry,
    "addfeed",
    middlewareLoggedIn(handlerAddFeed),
  );

  registerCommand(
    registry,
    "follow",
    middlewareLoggedIn(handlerFollow),
  );

  registerCommand(
    registry,
    "following",
    middlewareLoggedIn(handlerFollowing),
  );

  registerCommand(
    registry,
    "unfollow",
    middlewareLoggedIn(handlerUnfollow),
  );

  registerCommand(
    registry,
    "browse",
    middlewareLoggedIn(handlerBrowse),
  );

  registerCommand(registry, "feeds", handlerFeeds);

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("not enough arguments");
    process.exit(1);
  }

  const cmdName = args[0];
  const cmdArgs = args.slice(1);

  try {
    await runCommand(registry, cmdName, ...cmdArgs);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  process.exit(0);
}

main();
