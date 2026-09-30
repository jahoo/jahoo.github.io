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

Let $X$ be a real random variable, specified by its cumulative distribution function $F_X(x) = P(X \le x)$.^[Formally, $X : \Omega \to \mathbb{R}$ is a measurable map on a probability space $(\Omega, \mathcal{F}, P)$, and its law is the pushforward $P_X \defeq X_* P$, so that $P_X(A) = P(X \in A)$ for every Borel set $A$. The law is determined by $F_X(x) = P_X\big((-\infty, x]\big)$.] The expectation of a function $g$ of $X$ is the sum or integral of $g$ weighted by the probability mass function $\pmf{X}$ or the probability density function $\pdf{X}$:

$$ \mathbb{E}[g(X)] \;\defeq\; \begin{cases} \displaystyle\sum_x g(x)\,\pmf{X}(x) & \text{if } X \text{ is discrete,} \\[1.2ex] \displaystyle\int g(x)\,\pdf{X}(x) \dee{x} & \text{if } X \text{ is continuous.} \end{cases} $$

In what follows, we write $p_X$ for either pdf or pmf.^[This isn't sloppy. Both are densities of the law, $p_X = \dee{P_X} / \dee{\mu}$, with respect to a reference measure $\mu$ on $\mathbb{R}$. We simply swap out which reference measure we are using: in the discrete case, it isthe counting measure, in the continuous case it is the Lebesgue measure. Both cases of the definition are then one: 
$$
\begin{aligned}
\mathbb{E}[g(X)] 
&\defeq \int_\Omega g \circ X \dee{P} \\
&= \int_{\mathbb{R}} g \dee{P_X} \\
&= \int_{\mathbb{R}} g \, p_X \dee{\mu}
\end{aligned}
$$
]

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

In this illustration, $X$ is <span class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></span>.

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-case-slot"><div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">p<sub>X</sub></label><select id="ex-preset"></select></div>
<div class="ex-grp"><label class="ex-lab" for="ex-gsel">g(x) =</label>
<select id="ex-gsel">
<option value="neglog" selected>−log₂ p_X(x) (entropy)</option>
<option value="x">x (mean)</option>
<option value="x2">x² (second moment)</option>
<option value="var">(x − 𝔼X)² (variance)</option>
<option value="skew">((x − 𝔼X)/σ)³ (skewness)</option>
<option value="custom">custom</option>
</select>
</div>
<div class="ex-grp"><button type="button" id="ex-playx">▶ sweep x</button><button type="button" id="ex-playu">▶ sweep u</button></div>
<div class="ex-grp ex-disc"><button type="button" id="ex-back" aria-label="Previous atom">◀︎ atom</button><button type="button" id="ex-fwd" aria-label="Next atom">atom ▶︎</button></div>
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