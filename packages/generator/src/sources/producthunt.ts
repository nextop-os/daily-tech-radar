import type {
  DailyTrendFeed,
  DailyTrendFeedItem,
  ProductHuntLocalization,
  ProductHuntPost
} from "../types.js";
import { PRODUCT_HUNT_TIMEZONE, productHuntDayWindow } from "../date.js";

type GraphQlResponse = {
  data?: {
    posts?: {
      edges?: Array<{ node?: ProductHuntPost }>;
    };
  };
  errors?: Array<{ message: string }>;
};

const PRODUCT_HUNT_QUERY = `
query DailyPosts($first: Int!, $postedAfter: DateTime!, $postedBefore: DateTime!) {
  posts(first: $first, featured: true, postedAfter: $postedAfter, postedBefore: $postedBefore) {
    edges {
      node {
        id
        slug
        name
        tagline
        description
        url
        votesCount
        commentsCount
        createdAt
        featuredAt
        website
        thumbnail {
          url
          videoUrl
        }
        media {
          type
          url
        }
      }
    }
  }
}`;

export async function fetchProductHuntPosts(options: {
  token: string;
  date: string;
  limit: number;
  fetchImpl?: typeof fetch;
}): Promise<ProductHuntPost[]> {
  const { token, date, limit, fetchImpl = fetch } = options;
  const { postedAfter, postedBefore } = productHuntDayWindow(date);
  const response = await fetchImpl("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: PRODUCT_HUNT_QUERY,
      variables: {
        first: limit,
        postedAfter,
        postedBefore
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Product Hunt request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as GraphQlResponse;
  if (json.errors?.length) {
    throw new Error(`Product Hunt GraphQL error: ${json.errors.map((error) => error.message).join("; ")}`);
  }

  return (json.data?.posts?.edges ?? [])
    .flatMap((edge) => (edge.node ? [edge.node] : []))
    .sort(compareProductHuntPosts)
    .slice(0, limit);
}

export function compareProductHuntPosts(a: ProductHuntPost, b: ProductHuntPost): number {
  const voteDelta = (b.votesCount ?? 0) - (a.votesCount ?? 0);
  if (voteDelta !== 0) {
    return voteDelta;
  }
  return (b.commentsCount ?? 0) - (a.commentsCount ?? 0);
}

function iconFor(post: ProductHuntPost): string | null {
  return post.thumbnail?.url ?? post.media?.find((media) => Boolean(media.url))?.url ?? null;
}

function mediaFor(post: ProductHuntPost) {
  return (post.media ?? [])
    .filter((media) => Boolean(media.url))
    .map((media) => ({
      type: media.type ?? "image",
      url: media.url,
      videoUrl: media.videoUrl ?? null
    }));
}

function rawFor(post: ProductHuntPost): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    slug: post.slug ?? null,
    featuredAt: post.featuredAt ?? null,
    createdAt: post.createdAt ?? null
  };
  if (post.makers) {
    raw.makers = post.makers;
  }
  if (post.topics) {
    raw.topics = post.topics.edges?.map((edge) => edge.node).filter(Boolean) ?? [];
  }
  return raw;
}

export function buildProductHuntFeeds(options: {
  posts: ProductHuntPost[];
  localizations: ProductHuntLocalization[];
  date: string;
  generatedAt: string;
  limit: number;
}): { english: DailyTrendFeed; chinese: DailyTrendFeed } {
  const sorted = [...options.posts].sort(compareProductHuntPosts).slice(0, options.limit);
  const localizations = new Map(options.localizations.map((item) => [item.id, item]));

  const baseItems = sorted.map((post, index) => ({ post, rank: index + 1 }));
  const englishItems: DailyTrendFeedItem[] = baseItems.map(({ post, rank }) => {
    const localization = localizations.get(post.id);
    return {
      rank,
      id: post.id,
      name: post.name,
      tagline: post.tagline ?? "",
      description: post.description ?? post.tagline ?? "",
      keywords: localization?.keywordsEn ?? [],
      metrics: {
        votes: post.votesCount ?? 0,
        comments: post.commentsCount ?? 0
      },
      links: {
        homepage: post.website ?? null,
        source: post.url ?? `https://www.producthunt.com/posts/${post.slug ?? post.id}`
      },
      assets: {
        icon: iconFor(post),
        thumbnail: post.thumbnail?.url ?? iconFor(post),
        media: mediaFor(post)
      },
      raw: rawFor(post)
    };
  });

  const chineseItems: DailyTrendFeedItem[] = baseItems.map(({ post, rank }) => {
    const localization = localizations.get(post.id);
    return {
      rank,
      id: post.id,
      name: post.name,
      tagline: localization?.taglineZh ?? post.tagline ?? "",
      description: localization?.descriptionZh ?? post.description ?? post.tagline ?? "",
      keywords: localization?.keywordsZh ?? [],
      metrics: {
        votes: post.votesCount ?? 0,
        comments: post.commentsCount ?? 0
      },
      links: {
        homepage: post.website ?? null,
        source: post.url ?? `https://www.producthunt.com/posts/${post.slug ?? post.id}`
      },
      assets: {
        icon: iconFor(post),
        thumbnail: post.thumbnail?.url ?? iconFor(post),
        media: mediaFor(post)
      },
      raw: rawFor(post)
    };
  });

  return {
    english: {
      schemaVersion: "daily-tech-radar.v1",
      source: "producthunt",
      locale: "en-US",
      date: options.date,
      sourceTimezone: PRODUCT_HUNT_TIMEZONE,
      generatedAt: options.generatedAt,
      items: englishItems
    },
    chinese: {
      schemaVersion: "daily-tech-radar.v1",
      source: "producthunt",
      locale: "zh-CN",
      date: options.date,
      sourceTimezone: PRODUCT_HUNT_TIMEZONE,
      generatedAt: options.generatedAt,
      items: chineseItems
    }
  };
}
