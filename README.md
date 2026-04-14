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

#### Explorations
Interactive essays live in `_explorations/` and use a custom formatting stack: the `exploration` layout (`_layouts/exploration.html`) loads `assets/explorations-base.css` (Tufte-inspired sidenote layout, collapsible sections via `assets/explorations-collapse.js`) and MathJax with per-page macro definitions via `mathjax_macros` front matter. Each exploration has its own JS/CSS in `assets/<slug>/`. This setup is tied to Jekyll + kramdown and would need reworking if the blog migrates to another renderer.
