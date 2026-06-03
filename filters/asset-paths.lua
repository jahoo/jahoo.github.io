--- asset-paths.lua — Resolve repo-relative `js:` and `css:` front-matter
--- entries to the URLs the built site serves them from:
---
---   js:
---     - src/temperature              →  /assets/js/temperature.bundle.js
---   css:
---     - assets/css/temperature.css   →  /assets/css/temperature.css
---
--- Authors reference real repo paths (the directory a bundle is built
--- from, the actual stylesheet file), so the YAML is readable without
--- knowing the build: js bundles exist only under _site/, while assets/
--- is synced verbatim. Anything else (absolute URLs, external scripts)
--- passes through unchanged.

local function resolveJs(s)
  local name = s:match("^src/([%w%-_]+)/?$") or s:match("^src/([%w%-_]+)/index%.js$")
  return name and ("/assets/js/" .. name .. ".bundle.js") or s
end

local function resolveCss(s)
  return s:match("^assets/") and ("/" .. s) or s
end

local function resolveList(v, resolve)
  if v == nil then return nil end
  local list = pandoc.utils.type(v) == 'List' and v or pandoc.MetaList { v }
  local out = {}
  for i, entry in ipairs(list) do
    out[i] = pandoc.MetaString(resolve(pandoc.utils.stringify(entry)))
  end
  return pandoc.MetaList(out)
end

function Meta(meta)
  meta.js = resolveList(meta.js, resolveJs)
  meta.css = resolveList(meta.css, resolveCss)
  return meta
end
