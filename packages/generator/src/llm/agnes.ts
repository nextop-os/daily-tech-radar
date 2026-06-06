import type { GitHubRepoLocalization, GitHubTrendRepo, ProductHuntLocalization, ProductHuntPost } from "../types.js";

type AgnesChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw);
}

function fallbackKeywords(post: ProductHuntPost): string[] {
  const topicNames = post.topics?.edges?.flatMap((edge) => (edge.node?.name ? [edge.node.name] : [])) ?? [];
  if (topicNames.length > 0) {
    return topicNames.slice(0, 4);
  }
  return post.tagline?.split(/\s+/).filter(Boolean).slice(0, 4) ?? [];
}

export function fallbackLocalizations(posts: ProductHuntPost[]): ProductHuntLocalization[] {
  return posts.map((post) => ({
    id: post.id,
    taglineZh: post.tagline ?? "",
    descriptionZh: post.description ?? post.tagline ?? "",
    keywordsEn: fallbackKeywords(post),
    keywordsZh: fallbackKeywords(post)
  }));
}

export async function localizeProductHuntPosts(options: {
  posts: ProductHuntPost[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProductHuntLocalization[]> {
  const { posts, apiKey, fetchImpl = fetch } = options;
  if (!apiKey) {
    return fallbackLocalizations(posts);
  }

  const payload = posts.map((post) => ({
    id: post.id,
    name: post.name,
    tagline: post.tagline,
    description: post.description,
    topics: post.topics?.edges?.map((edge) => edge.node?.name).filter(Boolean) ?? []
  }));

  const response = await fetchImpl("https://apihub.agnes-ai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "agnes-2.0-flash",
      messages: [
        {
          role: "system",
          content:
            "Return strict JSON only. Localize Product Hunt posts for Chinese readers. Preserve product names."
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "For each item return id, taglineZh, descriptionZh, keywordsEn, keywordsZh. keywords arrays should each contain 3-6 concise strings.",
            posts: payload
          })
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`Agnes localization failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as AgnesChatResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Agnes localization response did not include message content");
  }

  const parsed = parseJsonObject(content);
  const items = Array.isArray(parsed)
    ? parsed
    : ((parsed as { items?: unknown[]; posts?: unknown[] }).items ??
      (parsed as { items?: unknown[]; posts?: unknown[] }).posts);
  if (!Array.isArray(items)) {
    throw new Error("Agnes localization JSON must be an array or an object with items");
  }

  const fallback = new Map(fallbackLocalizations(posts).map((item) => [item.id, item]));
  return items.map((item) => {
    const raw = item as Partial<ProductHuntLocalization>;
    const base = raw.id ? fallback.get(raw.id) : undefined;
    if (!raw.id || !base) {
      throw new Error("Agnes localization item is missing a known id");
    }
    return {
      id: raw.id,
      taglineZh: raw.taglineZh ?? base.taglineZh,
      descriptionZh: raw.descriptionZh ?? base.descriptionZh,
      keywordsEn: Array.isArray(raw.keywordsEn) ? raw.keywordsEn : base.keywordsEn,
      keywordsZh: Array.isArray(raw.keywordsZh) ? raw.keywordsZh : base.keywordsZh
    };
  });
}

export function fallbackGitHubRepoLocalizations(repos: GitHubTrendRepo[]): GitHubRepoLocalization[] {
  return repos.map((repo) => ({
    id: repo.id,
    descriptionZh: repo.metadata.description,
    summaryZh: repo.readmeSignals.summary ?? repo.metadata.description,
    keywordsZh: repo.readmeSignals.keywords
  }));
}

export async function localizeGitHubRepos(options: {
  repos: GitHubTrendRepo[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<GitHubRepoLocalization[]> {
  const { repos, apiKey, fetchImpl = fetch } = options;
  if (!apiKey) {
    return fallbackGitHubRepoLocalizations(repos);
  }

  const payload = repos.map((repo) => ({
    id: repo.id,
    fullName: `${repo.owner}/${repo.name}`,
    description: repo.metadata.description,
    summary: repo.readmeSignals.summary ?? repo.metadata.description,
    keywords: repo.readmeSignals.keywords,
    language: repo.metadata.language,
    category: repo.classification.primaryCategoryId
  }));

  const response = await fetchImpl("https://apihub.agnes-ai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "agnes-2.0-flash",
      messages: [
        {
          role: "system",
          content:
            "Return strict JSON only. Localize GitHub trend repository text for Chinese readers. Preserve repository names, programming languages, package names, commands, URLs, and code identifiers."
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "For each repo return id, descriptionZh, summaryZh, keywordsZh. Translate prose naturally into Simplified Chinese. keywordsZh should contain 3-8 concise product/category keywords; keep stable English technical tokens when translating them would be less useful.",
            repos: payload
          })
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`Agnes GitHub localization failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as AgnesChatResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Agnes GitHub localization response did not include message content");
  }

  const parsed = parseJsonObject(content);
  const items = Array.isArray(parsed)
    ? parsed
    : ((parsed as { items?: unknown[]; repos?: unknown[] }).items ??
      (parsed as { items?: unknown[]; repos?: unknown[] }).repos);
  if (!Array.isArray(items)) {
    throw new Error("Agnes GitHub localization JSON must be an array or an object with items");
  }

  const fallback = new Map(fallbackGitHubRepoLocalizations(repos).map((item) => [item.id, item]));
  return items.map((item) => {
    const raw = item as Partial<GitHubRepoLocalization>;
    const base = raw.id ? fallback.get(raw.id) : undefined;
    if (!raw.id || !base) {
      throw new Error("Agnes GitHub localization item is missing a known id");
    }
    return {
      id: raw.id,
      descriptionZh: raw.descriptionZh ?? base.descriptionZh,
      summaryZh: raw.summaryZh ?? base.summaryZh,
      keywordsZh: Array.isArray(raw.keywordsZh) ? raw.keywordsZh : base.keywordsZh
    };
  });
}
