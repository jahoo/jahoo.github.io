-- scripts/build-index.lua
-- Blog listing generator: scans content posts and explorations,
-- emits _generated/posts.md with a formatted listing page.
-- Run via: pandoc lua scripts/build-index.lua

local system = pandoc.system

------------------------------------------------------------
-- Minimal YAML front matter parser
------------------------------------------------------------

-- Strip surrounding quotes from a string value
local function unquote(s)
  if not s then return s end
  s = s:match("^%s*(.-)%s*$") -- trim
  local q = s:sub(1,1)
  if (q == '"' or q == "'") and s:sub(-1) == q then
    return s:sub(2, -2)
  end
  return s
end

-- Parse a scalar value (string, boolean, number, inline list)
local function parse_value(raw)
  if not raw then return nil end
  raw = raw:match("^%s*(.-)%s*$") -- trim

  -- boolean
  if raw == "true" then return true end
  if raw == "false" then return false end

  -- inline list: [item1, item2]
  if raw:sub(1,1) == "[" and raw:sub(-1) == "]" then
    local items = {}
    for item in raw:sub(2,-2):gmatch("[^,]+") do
      items[#items+1] = unquote(item)
    end
    return items
  end

  -- number
  local num = tonumber(raw)
  if num then return num end

  -- string (possibly quoted)
  return unquote(raw)
end

-- Parse YAML front matter from file content string.
-- Returns a table of key-value pairs, or nil if no front matter found.
local function parse_front_matter(text)
  -- Must start with ---
  if not text:match("^%-%-%-\n") then return nil end

  -- Extract block between first --- and next ---
  local block = text:match("^%-%-%-\n(.-)%-%-%-")
  if not block then return nil end

  local meta = {}
  local current_key = nil  -- for multi-line list values

  for line in (block .. "\n"):gmatch("(.-)\n") do
    -- Indented list item (continuation of previous key)
    local indent_item = line:match("^%s+%-%s+(.*)")
    if indent_item and current_key then
      if type(meta[current_key]) ~= "table" then
        meta[current_key] = {}
      end
      meta[current_key][#meta[current_key]+1] = unquote(indent_item)
    else
      -- Key: value line
      local key, val = line:match("^([%w_%-]+):%s*(.*)")
      if key then
        current_key = key
        if val == "" then
          -- Value might follow as indented list
          meta[key] = {}
        else
          meta[key] = parse_value(val)
        end
      else
        current_key = nil
      end
    end
  end

  return meta
end

------------------------------------------------------------
-- Collect posts from a content directory
------------------------------------------------------------

-- Strip leading YYYY-MM-DD- date prefix from a slug
local function strip_date(slug)
  return slug:gsub("^%d%d%d%d%-%d%d%-%d%d%-", "")
end

-- Scan a directory for .md files and extract front matter.
local function collect_entries(dir)
  local entries = {}
  local ok, files = pcall(system.list_directory, dir)
  if not ok then return entries end

  for _, name in ipairs(files) do
    if name:match("%.md$") then
      local path = dir .. "/" .. name
      local text = system.read_file(path)
      if text then
        local meta = parse_front_matter(text)
        if meta and meta.published ~= false then
          local raw_slug = name:gsub("%.md$", "")
          local clean_slug = strip_date(raw_slug)
          local entry = {
            title = meta.title or clean_slug,
            date  = meta.date or "0000-00-00",
            tags  = meta.tags or {},
            highlighted = meta.highlighted or false,
            external = meta.external or nil,  -- source file path, not URL
            raw_slug = raw_slug,              -- with date prefix
            slug = clean_slug,                -- without date prefix
            url  = "/posts/" .. clean_slug .. "/",
          }
          entries[#entries+1] = entry
        end
      end
    end
  end
  return entries
end

------------------------------------------------------------
-- Main
------------------------------------------------------------

local entries = {}

-- Collect from content/posts/
local blog = collect_entries("content/posts")
for _, e in ipairs(blog) do entries[#entries+1] = e end

-- Sort by date descending
table.sort(entries, function(a, b) return a.date > b.date end)

-- Build output as raw HTML for richer formatting
local lines = {}
lines[#lines+1] = "---"
lines[#lines+1] = "title: posts"
lines[#lines+1] = "css: [/assets/css/posts-list.css]"
lines[#lines+1] = "---"
lines[#lines+1] = ""
lines[#lines+1] = "```{=html}"
lines[#lines+1] = '<ul class="post-list">'

for _, e in ipairs(entries) do
  local cls = e.highlighted and "post-link highlighted" or "post-link"
  lines[#lines+1] = "  <li>"
  lines[#lines+1] = string.format('    <h3><a class="%s" href="%s">%s</a></h3>', cls, e.url, e.title)
  -- Dates stay in the front-matter YYYY-MM-DD format so the listing
  -- matches the post-meta block on individual posts.
  local meta_parts = { e.date }
  if e.tags and #e.tags > 0 then
    meta_parts[#meta_parts+1] = '<span class="post-tags">' .. table.concat(e.tags, ", ") .. '</span>'
  end
  lines[#lines+1] = string.format('    <span class="post-meta">%s</span>', table.concat(meta_parts, " · "))
  lines[#lines+1] = "  </li>"
end

lines[#lines+1] = "</ul>"
lines[#lines+1] = "```"
lines[#lines+1] = ""

local output = table.concat(lines, "\n")

-- Ensure _generated/ directory exists
pcall(system.make_directory, "_generated", true)

-- Write output
local outpath = "_generated/posts.md"
system.write_file(outpath, output)

io.write("Generated: " .. outpath .. " (" .. #entries .. " entries)\n")
