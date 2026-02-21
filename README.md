## Workflow

Because jekyll-scholar isn't in the list of GitHub-sanctioned plugins, we use a GitHub Actions workflow that builds the site and deploys it to the `master` branch.

#### Local development
- Edit the site on the `source` branch locally.
- Run `bundle exec jekyll serve` to serve locally during editing.
  - Requires **Ruby 3.1.7** (e.g. `chruby 3.1.7` or `rvm use 3.1.7`).

#### Deploy
Push to `source`. A GitHub Actions workflow will automatically build the site (`bundle exec jekyll build`) and deploy the result to the `master` branch, where GitHub Pages serves it at [jahoo.github.io](https://jahoo.github.io).

#### Branch structure
- `source` — Jekyll source files (edit this branch)
- `master` — built HTML output (deployed automatically, do not edit directly!)

GitHub may show these branches as "ahead/behind" each other — this is normal. They have independent commit histories: `source` has source-code commits that aren't on `master`, and `master` has deploy commits (built HTML) that aren't on `source`.
