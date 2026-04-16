--- callouts.lua — Convert fenced divs with .callout-* classes to styled HTML.
---
--- Input:
---   ::: {.callout-note}
---   Some text.
---   :::
---
---   ::: {.callout-warning title="Careful"}
---   Custom title.
---   :::
---
--- Supported types: callout-note, callout-warning, callout-tip, callout-important.
--- The `title` attribute overrides the default header text.

local callout_types = {
  ["callout-note"]      = "Note",
  ["callout-warning"]   = "Warning",
  ["callout-tip"]       = "Tip",
  ["callout-important"] = "Important",
}

function Div(el)
  for cls, label in pairs(callout_types) do
    if el.classes:includes(cls) then
      local title = el.attributes["title"] or label
      local header = pandoc.Div(
        pandoc.Plain(pandoc.Str(title)),
        pandoc.Attr("", {"callout-header"})
      )
      local body = pandoc.Div(el.content, pandoc.Attr("", {"callout-body"}))

      -- Remove the title attribute so it doesn't leak into outer div
      local attrs = {}
      for k, v in pairs(el.attributes) do
        if k ~= "title" then
          attrs[k] = v
        end
      end

      return pandoc.Div(
        {header, body},
        pandoc.Attr(el.identifier, {"callout", cls}, attrs)
      )
    end
  end
end
