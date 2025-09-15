## Workflow

Because jekyll-scholar isn't in the list of GitHub-sanctioned plugins, we need a workaround. Here it is.

#### 1. Editing locally
- edit the site on the `source` branch locally.
- run `bundle exec jekyll serve` to serve locally during editing.
  - Note: requires **ruby version 3**, so may need to change the current ruby
    version (e.g. `chruby 3.1.7` or `rvm use 3.1.7` --- note, tested with `v3.4.5` and it didn't work. use `3.1.7`).

#### 2. Push to remote
When ready, `git push` to put the edits on the GitHub.

- First time may need to set source: `git push --set-upstream origin source` 

#### 3. Deploy site

```bash
./bin/deploy --user
```

Answer `y`. 

- This will build the site from `source` branch (`bundle exec jekyll build` ) and put the resulting site on the `master` branch, where github pages will find it and serve it at [jahoo.github.io](http://jahoo.github.io)
