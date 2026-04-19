--- heading-anchors.lua
--- Prepend a clickable "§" self-link to each h1-h4 that has an id.
--- Styled via `.section-mark` in assets/css/overrides.css
--- (absolute-positioned into the left margin; only visible on hover).

function Header(h)
  if h.level > 4 then return nil end
  if h.classes:includes("title") then return nil end
  if not h.identifier or h.identifier == "" then return nil end

  local anchor = pandoc.RawInline("html",
    '<a class="section-mark" href="#' .. h.identifier .. '" aria-hidden="true">§</a>'
  )
  h.content:insert(1, anchor)
  return h
end
