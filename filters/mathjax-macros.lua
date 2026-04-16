-- mathjax-macros.lua — Read MathJax macros from a JSON file and inject
-- into template metadata.
--
-- Front matter: mathjax-macros: path/to/macros.json
-- The file contains a JSON object with LaTeX macro definitions.
-- The filter reads it and stores the raw JSON string in
-- mathjax-macros-json for the template to output verbatim.

function Meta(meta)
  local macros_field = meta["mathjax-macros"]
  if not macros_field then return end

  local path = pandoc.utils.stringify(macros_field)
  if path == "" then return end

  -- Read the JSON file
  local f = io.open(path, "r")
  if not f then
    io.stderr:write("mathjax-macros.lua: cannot open " .. path .. "\n")
    return
  end
  local json = f:read("*a")
  f:close()

  -- Compact to single line (strip newlines, collapse whitespace)
  json = json:gsub("%s+", " "):gsub("^ ", ""):gsub(" $", "")

  meta["mathjax-macros-json"] = pandoc.MetaInlines{pandoc.RawInline("html", json)}
  return meta
end
