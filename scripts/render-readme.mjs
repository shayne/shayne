import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const GRAPHQL_URL = "https://api.github.com/graphql";

export function humanize(value, now = new Date()) {
  const date = new Date(value);
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (diffMs <= dayMs) {
    return "today";
  }

  const days = Math.max(1, Math.floor(diffMs / dayMs));
  if (days < 14) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  if (days < 730) {
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }

  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

export function renderTemplate(template, data) {
  const now = data.now ?? new Date();
  let output = template;

  output = replaceRange(output, "recentContributions", data.contributions, (block, item) =>
    fill(block, {
      ".Repo.Name": item.repo.name,
      ".Repo.URL": item.repo.url,
      ".Repo.Description": item.repo.description,
      "humanize .OccurredAt": humanize(item.occurredAt, now),
    }),
  );

  output = replaceRange(output, "recentReleases", data.releases, (block, item) =>
    fill(block, {
      ".Name": item.name,
      ".URL": item.url,
      ".Description": item.description,
      ".LastRelease.TagName": item.lastRelease.tagName,
      ".LastRelease.URL": item.lastRelease.url,
      "humanize .LastRelease.PublishedAt": humanize(item.lastRelease.publishedAt, now),
    }),
  );

  output = replaceRange(output, "recentStars", data.stars, (block, item) =>
    fill(block, {
      ".Repo.Name": item.repo.name,
      ".Repo.URL": item.repo.url,
      ".Repo.Description": item.repo.description,
      ".Repo.Stargazers": String(item.repo.stargazers),
    }),
  );

  return `${output.trimEnd()}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const owner = options.owner ?? process.env.GITHUB_REPOSITORY_OWNER;
  const templatePath = options.template ?? "templates/README.md.tpl";
  const outputPath = options.out ?? "README.md";
  const token = process.env.GITHUB_TOKEN;

  if (!owner) {
    throw new Error("Missing owner. Pass --owner or set GITHUB_REPOSITORY_OWNER.");
  }
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN.");
  }

  const [template, contributions, releases, stars] = await Promise.all([
    readFile(templatePath, "utf8"),
    fetchRecentContributions(owner, token, 5),
    fetchRecentReleases(owner, token, 5),
    fetchRecentStars(owner, token, 5),
  ]);

  await writeFile(outputPath, renderTemplate(template, { contributions, releases, stars }));
}

function replaceRange(template, name, items, renderItem) {
  const pattern = new RegExp(String.raw`\{\{range ${name} 5\}\}([\s\S]*?)\{\{end\s*-?\}\}`, "g");
  return template.replace(pattern, (_match, block) => items.map((item) => renderItem(block, item)).join(""));
}

function fill(block, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ""),
    block,
  );
}

async function fetchRecentContributions(owner, token, count) {
  const data = await graphql(
    token,
    `query RecentContributions($owner: String!) {
      user(login: $owner) {
        contributionsCollection {
          commitContributionsByRepository(maxRepositories: 100) {
            contributions(first: 1) {
              nodes {
                occurredAt
              }
            }
            repository {
              nameWithOwner
              url
              description
              isPrivate
              stargazerCount
            }
          }
        }
      }
    }`,
    { owner },
  );

  return data.user.contributionsCollection.commitContributionsByRepository
    .filter((item) => item.contributions.nodes.length > 0)
    .filter((item) => !item.repository.isPrivate)
    .filter((item) => item.repository.nameWithOwner !== `${owner}/${owner}`)
    .map((item) => ({
      occurredAt: item.contributions.nodes[0].occurredAt,
      repo: repoFromNode(item.repository),
    }))
    .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
    .slice(0, count);
}

async function fetchRecentReleases(owner, token, count) {
  const repos = [];
  let after = null;

  do {
    const data = await graphql(
      token,
      `query RecentReleases($owner: String!, $after: String) {
        user(login: $owner) {
          repositoriesContributedTo(
            first: 100
            after: $after
            includeUserRepositories: true
            contributionTypes: COMMIT
            privacy: PUBLIC
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              nameWithOwner
              url
              description
              isPrivate
              stargazerCount
              releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
                nodes {
                  name
                  tagName
                  publishedAt
                  url
                  isPrerelease
                  isDraft
                }
              }
            }
          }
        }
      }`,
      { owner, after },
    );

    const connection = data.user.repositoriesContributedTo;
    for (const repo of connection.nodes) {
      const release = repo.releases.nodes.find((item) => !item.isPrerelease && !item.isDraft);
      if (!release?.publishedAt) {
        continue;
      }

      repos.push({
        ...repoFromNode(repo),
        lastRelease: {
          name: release.name,
          tagName: release.tagName,
          publishedAt: release.publishedAt,
          url: release.url,
        },
      });
    }

    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);

  return repos
    .sort((left, right) => {
      const dateDiff = new Date(right.lastRelease.publishedAt) - new Date(left.lastRelease.publishedAt);
      return dateDiff || right.stargazers - left.stargazers;
    })
    .slice(0, count)
    .map((repo) => ({
      name: repo.name,
      url: repo.url,
      description: repo.description,
      lastRelease: repo.lastRelease,
    }));
}

async function fetchRecentStars(owner, token, count) {
  const data = await graphql(
    token,
    `query RecentStars($owner: String!, $count: Int!) {
      user(login: $owner) {
        starredRepositories(first: $count, orderBy: {field: STARRED_AT, direction: DESC}) {
          edges {
            starredAt
            node {
              nameWithOwner
              url
              description
              isPrivate
              stargazerCount
            }
          }
        }
      }
    }`,
    { owner, count },
  );

  return data.user.starredRepositories.edges
    .filter((edge) => !edge.node.isPrivate)
    .slice(0, count)
    .map((edge) => ({
      starredAt: edge.starredAt,
      repo: repoFromNode(edge.node),
    }));
}

function repoFromNode(node) {
  return {
    name: node.nameWithOwner,
    url: node.url,
    description: node.description ?? "",
    stargazers: node.stargazerCount,
  };
}

async function graphql(token, query, variables) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "shayne-profile-readme",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      `GitHub GraphQL request failed: ${response.status} ${response.statusText} ${JSON.stringify(payload.errors ?? payload)}`,
    );
  }

  return payload.data;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--owner" || arg === "--template" || arg === "--out") {
      options[arg.slice(2)] = args[index + 1];
      index += 1;
    }
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
