-- mathjax-macros.lua — Read MathJax macros from JSON files and inject
-- them into template metadata.
--
-- Front matter: mathjax-macros: path/to/macros.json
--           or: mathjax-macros: [shared.json, this-post.json]
-- Each file is a JSON object of LaTeX macro definitions. The filter
-- joins the objects' members into one object literal, in order, and
-- stores it in mathjax-macros-json for the template to output verbatim.
-- A later file's key overrides an earlier one's: the template emits a
-- JS object literal, where the last duplicate key wins. A file that
-- cannot be read is reported and skipped; the others still apply.

local function paths_of(field)
  local paths = {}
  -- a YAML list arrives as a List (pandoc ≥ 2.17 marshals MetaList that way; it has no .t)
  if pandoc.utils.type(field) == "List" then
    for _, item in ipairs(field) do paths[#paths + 1] = pandoc.utils.stringify(item) end
  else
    paths[1] = pandoc.utils.stringify(field)
  end
  return paths
end

-- The members of a JSON object file, as one line, without the outer braces.
local function members_of(path)
  local f = io.open(path, "r")
  if not f then
    io.stderr:write("mathjax-macros.lua: cannot open " .. path .. "\n")
    return nil
  end
  local json = f:read("*a")
  f:close()
  json = json:gsub("%s+", " "):gsub("^ ", ""):gsub(" $", "")
  local inner = json:match("^{(.*)}$")
  if not inner then
    io.stderr:write("mathjax-macros.lua: " .. path .. " is not a JSON object\n")
    return nil
  end
  inner = inner:gsub("^ ", ""):gsub(" $", "")
  if inner == "" then return nil end
  return inner
end

function Meta(meta)
  local field = meta["mathjax-macros"]
  if not field then return end
  local parts = {}
  for _, path in ipairs(paths_of(field)) do
    if path ~= "" then
      local m = members_of(path)
      if m then parts[#parts + 1] = m end
    end
  end
  if #parts == 0 then return end
  meta["mathjax-macros-json"] = pandoc.MetaInlines{pandoc.RawInline("html", "{ " .. table.concat(parts, ", ") .. " }")}
  return meta
end
