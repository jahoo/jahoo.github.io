--- block-marginnotes.lua — Handle ::: {.marginnote} fenced divs
---
--- For complex marginnotes containing block elements (canvas, buttons)
--- that can't live inside a ^[...] inline footnote.
--- Emits a <div class="marginnote"> with the toggle pattern for responsive.
---
--- Runs alongside pandoc-sidenote.lua (which handles ^[...] footnotes).

local marginnote_count = 100  -- start high to avoid ID collision with sidenotes.lua

function Div(el)
  if not el.classes:includes("marginnote") then return end

  marginnote_count = marginnote_count + 1
  local id = el.identifier ~= "" and el.identifier or ("mn-block-" .. marginnote_count)

  local writer_opts = pandoc.WriterOptions({
    wrap_text = "none",
    html_math_method = "mathjax",
  })
  local doc = pandoc.Pandoc(el.content)
  local inner_html = pandoc.write(doc, "html", writer_opts):gsub("%s+$", "")

  return pandoc.RawBlock("html",
    '<label for="' .. id .. '" class="margin-toggle">&#8853;</label>' ..
    '<input type="checkbox" id="' .. id .. '" class="margin-toggle"/>' ..
    '<div class="marginnote">' .. inner_html .. '</div>'
  )
end
