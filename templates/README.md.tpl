oh hey! 👋

I'm Shayne. Founding engineer at Instagram, React Native alum at Meta, and former VP Product at Tailscale.

I'm currently working on ChatGPT at OpenAI. Previously, I founded an AI startup and spent time building and exploring early AI-native product ideas.

Off the clock I fly small planes and once ran a craft coffee shop.

### Recent releases

{{range recentReleases 5}}- [{{.Name}}]({{.URL}}) ([{{.LastRelease.TagName}}]({{.LastRelease.URL}}), {{humanize .LastRelease.PublishedAt}})
  - {{.Description}}
{{end}}
### Recent starred projects

{{range recentStars 5}}- [{{.Repo.Name}}]({{.Repo.URL}}) ({{.Repo.Stargazers}})
  - {{.Repo.Description}}
{{end -}}
