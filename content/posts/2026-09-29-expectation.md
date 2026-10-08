---
title: Visualizing expected value
subtitle: A visual interpretation of the expectation of a function of a random variable (discrete or continuous) as the area over the unit interval
date: 2026-09-30
author: Jacob Hoover Vigly
tags: [exploration]
js:
  - src/expectation
css:
  - assets/css/expectation.css
mathjax-macros: assets/expectation/macros.json
---

Let $X$ be a random variable taking values in (some subset of) $\mathbb{R}$, write its law as $P_X$, and its cumulative distribution function as $F_X(x) = P_X\big((-\infty, x]\big) = P(X \le x)$.^[If we want to be really formal to define all the notation, $X : \Omega \to \mathbb{R}$ is a measurable map on a probability space $(\Omega, \mathcal{F}, P)$, and its law is the pushforward $P_X \defeq X_* P$, so that $P_X(A) = P(X \in A)$ for every Borel set $A$.]
The expected value of a function $g(X)$ is given by

$$
\mathbb{E}[g(X)] 
\defeq \int_{\mathbb{R}} g \dee{P_X}
$$

Writing $p_X$ for the probability density function (or probability mass function), this general definition simplifies to a sum or integral of $g$ weighted by $p_X$:^[In what follows, we'll consider both discrete and continuous cases, and write $p_X$ for either pdf or pmf. This same notation reflects the fact that either can be defined formally as $p_X = \dee{P_X} / \dee{\mu}$, the density of the random variable's law, $P_X$, with respect to some reference measure $\mu$ on $\mathbb{R}$, which is the counting measure for the discrete case, or the Lebesgue measure for the continuous case, so either the integral or the sum is the same:
$\mathbb{E}[g(X)] = \int_{\mathbb{R}} g \, p_X \dee{\mu}$.
]
$$
\mathbb{E}[g(X)]
=
\begin{cases}
\displaystyle\int_{-\infty}^{\infty} g(x)\,p_X(x) \dee{x} & \text{if } X \text{ is continuous,}\\[1.2ex]
\displaystyle\sum_{x \in \supp{X}} g(x)\,p_X(x) & \text{if } X \text{ is discrete.} 
\end{cases}
$$

We can equivalently write the expectation as an integral over the unit interval, using a substitution by $F_X^{-1}(u) = \inf\{x : F_X(x) \ge u\}$, the inverse CDF (aka quantile function).^[If $X$ is discrete, $F_X$ is a staircase that jumps by $p_X(x)$ at each outcome $x$. The infimum simply picks the first $x$ at which the staircase reaches $u$, so $F_X^{-1}(u) = x$ for every $u$ in the interval $\big(P(X < x),\, P(X \le x)\big]$. These intervals partition $[0, 1]$ into blocks, one per outcome, each as wide as its probability, in order of $x$; $F_X^{-1}$ is the staircase that takes the value $x$ on the block for $x$.]

$$
\mathbb{E}[g(X)] = \int_0^1 g\big(F_X^{-1}(u)\big) \dee{u}
$$


::: {.callout-note title="More on that substitution..." collapse="true"}
This is the substitution $x = F_X^{-1}(u)$: where $X$ has a density, $\dee{u} = p_X(x) \dee{x}$, so the weight $p_X(x) \dee{x}$ becomes the width $\dee{u}$. In general, for $U \sim \mathrm{Uniform}[0, 1]$,

$$
F_X^{-1}(u) \le x \iff u \le F_X(x) \\\Longrightarrow\quad P\big(F_X^{-1}(U) \le x\big) = P\big(U \le F_X(x)\big) = F_X(x),
$$

so $F_X^{-1}(U)$ has the law of $X$ (this is the identity behind "inverse-transform sampling"), and $\mathbb{E}[g(X)] = \mathbb{E}\big[g\big(F_X^{-1}(U)\big)\big]$.

I wrote up a note about this kind of density transformation [in a previous post](/posts/transform-pdf/) (see examples 3, 4, and 5).
:::

The fact that we've expressed the expectation as an integral over the unit interval of the function $g$, suggests a nice visual interpretation of the expectation as an area. We use the map $x \mapsto u = F_X(x)$ to rescale the real line into $[0, 1]$ so that each outcome takes up as much room as its probability.  Then evaluate $g$ over the rescaled axis, and the area under $g \circ F_X^{-1}$ is $\mathbb{E}[g(X)]$. 

- If $X$ is discrete, $g \circ F_X^{-1}$ is a step function: one block of height $g(x)$ and width $p_X(x)$ for each outcome $x$, side by side in order of $x$, so the area is the sum.
- If $X$ is continuous, the block widths shrink to infinitesimal $p_X(x) \dee{x}$, and the area is the integral.

Below, play around with visualizing the expectation as an area under a curve. Set the density or mass function $p_X$, and the function $g$ to integrate, and scrub the $x$ or $u$ axis to see the area build up.

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">\(p_X\)</label><select id="ex-preset"></select></div>
<div class="ex-grp"><span class="ex-lab" id="ex-g-lab">\(g(x) =\)</span>
<div class="ex-menu" id="ex-gsel">
<button type="button" class="ex-menu-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="ex-g-lab"><span class="ex-menu-cur">\(-\log_2 p_X(x)\) <span class="ex-menu-note">(entropy)</span></span><span class="ex-menu-caret" aria-hidden="true">▾</span></button>
<ul class="ex-menu-list" role="listbox" aria-labelledby="ex-g-lab" hidden>
<li role="option" data-v="neglog" aria-selected="true">\(-\log_2 p_X(x)\) <span class="ex-menu-note">(entropy)</span></li>
<li role="option" data-v="x">\(x\) <span class="ex-menu-note">(mean)</span></li>
<li role="option" data-v="x2">\(x^2\) <span class="ex-menu-note">(second moment)</span></li>
<li role="option" data-v="var">\((x - \mathbb{E}[X])^2\) <span class="ex-menu-note">(variance)</span></li>
<li role="option" data-v="skew">\(\big((x - \mathbb{E}[X])/\sigma_X\big)^3\) <span class="ex-menu-note">(skewness)</span></li>
<li role="option" data-v="custom"><span class="ex-menu-note">custom</span></li>
</ul>
</div>
</div>
<div class="ex-grp"><button type="button" id="ex-playx"><span class="ex-go">▶ sweep \(x\)</span><span class="ex-stop">❚❚ pause</span></button><button type="button" id="ex-playu"><span class="ex-go">▶ sweep \(u\)</span><span class="ex-stop">❚❚ pause</span></button></div>
<div class="ex-grp"><button type="button" id="ex-whole">whole area (\(u = 1\))</button><button type="button" id="ex-reset">↺ reset</button></div>
</div>
```

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="ex-area" role="img" aria-label="The area under g of the inverse CDF over the unit interval, with the plot of g to its left, the map from x to u above it, and the running integral below it"></svg></div></figure>
```
:::


## Why not just visualize the expectation as area over the whole line? {.unnumbered}

Directly from the definition of expectation, it's also visualizable as an area over the whole support of $X$, of the function $g(x)\,p_X(x)$. Its part up to $x$, shaded below, is the area up to $u = F_X(x)$ above. 

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="ex-product" role="img" aria-label="The product of g and the density or mass function of X over x, shaded up to the current x, with its sum or integral so far"></svg></div></figure>
```
:::

But, compared with the unit interval visualization above, I think this simple visualization isn't as useful for some of the following reasons:

- $g$ and $p_X$ are merged into one curve, so neither is visible on its own, and the product is hard to read.
- In the discrete case there is no area to see: $g\,p_X$ is a sum of point masses and the expectation is the sum of their heights, which isn't very interesting or instructive.
- The discrete and continuous cases are pretty different pictures; over the unit interval they are unified.
- The domain is in general the whole real line; the unit interval has length 1, so the area there is also the average height over a bounded area you can fully plot.