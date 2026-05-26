import assert from "node:assert/strict";
import test from "node:test";

import { humanize, renderTemplate } from "./render-readme.mjs";

test("renderTemplate fills generated profile sections", () => {
  const template = `Intro

### Recent project contributions

{{range recentContributions 5}}- [{{.Repo.Name}}]({{.Repo.URL}}) ({{humanize .OccurredAt}})
  - {{.Repo.Description}}
{{end}}
### Recent releases

{{range recentReleases 5}}- [{{.Name}}]({{.URL}}) ([{{.LastRelease.TagName}}]({{.LastRelease.URL}}), {{humanize .LastRelease.PublishedAt}})
  - {{.Description}}
{{end}}
### Recent starred projects

{{range recentStars 5}}- [{{.Repo.Name}}]({{.Repo.URL}}) ({{.Repo.Stargazers}})
  - {{.Repo.Description}}
{{end -}}
`;

  const output = renderTemplate(template, {
    contributions: [
      {
        occurredAt: "2026-05-26T01:00:00Z",
        repo: {
          name: "shayne/example",
          url: "https://github.com/shayne/example",
          description: "Example contribution repo",
        },
      },
    ],
    now: new Date("2026-05-26T12:00:00Z"),
    releases: [
      {
        name: "shayne/tool",
        url: "https://github.com/shayne/tool",
        description: "Example release repo",
        lastRelease: {
          tagName: "v1.0.0",
          url: "https://github.com/shayne/tool/releases/tag/v1.0.0",
          publishedAt: "2026-05-24T12:00:00Z",
        },
      },
    ],
    stars: [
      {
        repo: {
          name: "someone/project",
          url: "https://github.com/someone/project",
          description: "Example starred repo",
          stargazers: 42,
        },
      },
    ],
  });

  assert.match(output, /- \[shayne\/example\].*\(today\)/);
  assert.match(output, /- \[shayne\/tool\].*\(\[v1\.0\.0\].*, 2 days ago\)/);
  assert.match(output, /- \[someone\/project\].*\(42\)/);
  assert.equal(output.includes("{{"), false);
  assert.equal(output.endsWith("\n"), true);
  assert.equal(output.endsWith("\n\n"), false);
});

test("humanize renders stable relative dates", () => {
  const now = new Date("2026-05-26T12:00:00Z");

  assert.equal(humanize("2026-05-26T01:00:00Z", now), "today");
  assert.equal(humanize("2026-05-24T12:00:00Z", now), "2 days ago");
  assert.equal(humanize("2026-05-12T12:00:00Z", now), "2 weeks ago");
});
