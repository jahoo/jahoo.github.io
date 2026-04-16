--- viz-mount.lua — Convert fenced divs with .viz class to DOM mount points.
---
--- Input:
---   ::: {.viz #cv-degeneracy canvas="true" height="200px" width="100%"}
---   :::
---
---   ::: {.viz #my-div height="300px"}
---   :::
---
--- Output:
---   <canvas id="cv-degeneracy" class="viz-mount" style="height:200px;width:100%"></canvas>
---   <div id="my-div" class="viz-mount" style="height:300px"></div>

function Div(el)
  if not el.classes:includes("viz") then
    return nil
  end

  local use_canvas = el.attributes["canvas"] == "true"
  local tag = use_canvas and "canvas" or "div"

  -- Build style string from height/width attributes
  local style_parts = {}
  if el.attributes["height"] then
    table.insert(style_parts, "height:" .. el.attributes["height"])
  end
  if el.attributes["width"] then
    table.insert(style_parts, "width:" .. el.attributes["width"])
  end

  local style_str = table.concat(style_parts, ";")

  -- Build the HTML
  local id_attr = ""
  if el.identifier ~= "" then
    id_attr = ' id="' .. el.identifier .. '"'
  end

  local style_attr = ""
  if style_str ~= "" then
    style_attr = ' style="' .. style_str .. '"'
  end

  local html = "<" .. tag .. id_attr .. ' class="viz-mount"' .. style_attr ..
               "></" .. tag .. ">"

  return pandoc.RawBlock("html", html)
end
