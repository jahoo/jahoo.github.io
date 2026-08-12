--- callouts.lua — Convert fenced divs with callout classes to styled HTML.
---
--- Input:
---   ::: {.callout-note}
---   Some text.
---   :::
---
---   ::: {.note-callout collapse="true"}
---   Collapsed by default; click to open.
---   :::
---
--- Supported types: callout-note, callout-warning, callout-tip,
--- callout-important, plus the bare aliases note-callout, warning-callout, tip-callout, important-callout.
---
--- The bare aliases exist for .qmd-backed posts. Quarto rewrites any div whose
--- class it recognises (callout-note and friends) into a blockquote before we
--- ever see it, but it passes divs with unknown classes through verbatim — so
--- qmd sources use `.note-callout` where hand-written .md posts use `.callout-note`.
---
--- Attributes:
---   title="…"        overrides the default header text
---   collapse="true"  render as a <details> that starts closed
---   collapse="false" render as a <details> that starts open

local callout_types = {
  ["callout-note"]      = "Note",
  ["callout-warning"]   = "Warning",
  ["callout-tip"]       = "Tip",
  ["callout-important"] = "Important",
  ["note-callout"]      = "Note",
  ["warning-callout"]   = "Warning",
  ["tip-callout"]       = "Tip",
  ["important-callout"] = "Important",
}

-- Deterministic order so a div carrying several callout classes always
-- resolves the same way (pairs() over a Lua table has no defined order).
local lookup_order = {
  "callout-note", "callout-warning", "callout-tip", "callout-important",
  "note-callout", "warning-callout", "tip-callout", "important-callout",
}

local function escape_html(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

function Div(el)
  for _, cls in ipairs(lookup_order) do
    if el.classes:includes(cls) then
      local label = callout_types[cls]
      local title = el.attributes["title"] or label
      local collapse = el.attributes["collapse"]

      -- Strip attributes we consume so they don't leak into the output div.
      local attrs = {}
      for k, v in pairs(el.attributes) do
        if k ~= "title" and k ~= "collapse" then
          attrs[k] = v
        end
      end

      local body = pandoc.Div(el.content, pandoc.Attr("", {"callout-body"}))
      local outer_attr = pandoc.Attr(el.identifier, {"callout", cls}, attrs)

      if collapse ~= nil then
        local open = (collapse == "false") and " open" or ""
        return pandoc.Div({
          pandoc.RawBlock("html",
            '<details class="callout-details"' .. open .. '><summary>'
            .. escape_html(title) .. '</summary>'),
          body,
          pandoc.RawBlock("html", "</details>"),
        }, outer_attr)
      end

      local header = pandoc.Div(
        pandoc.Plain(pandoc.Str(title)),
        pandoc.Attr("", {"callout-header"})
      )
      return pandoc.Div({header, body}, outer_attr)
    end
  end
end
