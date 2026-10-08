---
title: Through the quantile function
subtitle: A uniform carried through the inverse CDF has the law of X
date: 2026-10-07
author: Jacob Hoover Vigly
tags: [exploration]
unlisted: true
js:
  - src/quantile-transform
css:
  - assets/css/expectation.css
mathjax-macros: assets/prob/macros.json
---

Let $U$ be uniform on $[0, 1]$. Then $F_X^{-1}(U)$ has the law of $X$, which is why sampling by the inverse CDF works. Evenly spaced values of $u$ land at $x = F_X^{-1}(u)$ with spacing $\dee u / p_X(x)$, so they bunch where $p_X$ is high: the density is the reciprocal of the quantile function's slope. This builds on an earlier note on the [density of a transformed random variable](/posts/transform-pdf/); here the transformation is the one that produces any law from a uniform.

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">\(p_X\)</label><select id="ex-preset"></select></div>
<div class="ex-grp"><button type="button" id="ex-reset">↺ reset</button></div>
</div>
```

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig">
<div class="ex-canvas"><svg class="ex-plot" id="qt-transform" role="img" aria-label="Evenly spaced values of a uniform U, carried through the quantile function to X"></svg></div>
</figure>
```
:::

Drag along the uniform or the graph to move $u$; drag in the right panel to move $x$; drag $p_X$ to reshape it.
