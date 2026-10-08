---
title: Differential entropy
date: 2026-10-05
author: Jacob Hoover Vigly
tags: [exploration]
published: false
js:
  - src/differential-entropy
css:
  - assets/css/differential-entropy.css
  - assets/css/expectation.css
bibliography: assets/differential-entropy/references.bib
reference-section-title: References
link-citations: true
mathjax-macros: [assets/prob/macros.json, assets/differential-entropy/macros.json]
---

For a discrete random variable $X$ with pmf $p_X$, the entropy $H(X)$ is a measure of the uncertainty of the variable, defined as the expected value of the negative logarithm of $p_X$:^[That is, it is the expected *surprisal*.]

$$
H(X)
\defeq \E\big[-\log p_X(X)\big]
= -\sum_{x} p_X(x)\log p_X(x).
$$

If instead we say $X$ is a *continuous* random variable, and $p_X$ is its pdf, then we can define a similar quantity:

$$
h(X)
\defeq \E\big[-\log p_X(X)\big]
= -\int p_X(x)\log p_X(x)\dee{x}.
$$

This is the *differential entropy*, and its interpretation and properties differ.^[The recipe looks the same, but in the continuous case, $-\log p_X(x)$ is a negative log-density at a point, not the information content of an event. For starters, note it is negative whenever density is greater than 1.] Both are the expectation of one function, $g(x) = -\log p_X(x)$. As in [Visualizing expected value](/posts/expectation/), lay the probability out along $[0, 1]$ with $u = F_X(x)$, and the expectation is an area:

$$
\E\big[-\log p_X(X)\big] 
= \int_0^1 -\log p_X\big(F_X^{-1}(u)\big)\dee{u}.
$$

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">\(p_X\)</label><select id="ex-preset"></select></div>
<div class="ex-grp ex-disc"><label class="ex-lab" for="de-beta">\(\beta\) = <b id="de-betav">1</b></label><div class="de-beta-wrap"><input type="range" id="de-beta" min="0" max="1000" value="500"><div class="de-beta-ticks" aria-hidden="true"><span>0</span><span>1</span><span>∞</span></div></div></div>
<div class="ex-grp" id="ex-mix-grp" hidden><label class="ex-lab" for="ex-mix" title="The left bump's share of the mass; the right bump takes the rest">mix = <b id="ex-mixv">0.62</b></label><input type="range" id="ex-mix" min="0.02" max="0.98" step="0.01" value="0.62"></div>
<div class="ex-grp"><button type="button" id="ex-reset">↺ reset</button></div>
</div>
```

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-area" role="img" aria-label="Entropy as the area under minus log p_X of the inverse CDF over the unit interval, with minus log p_X to its left and the map from x to u above it"></svg></div></figure>
```
:::

::: {.de-caption}
Drag $p_X$ to reshape it. In the discrete case, I've put in a parameter^[{-} Temperature scaling with $\beta = 1/T$; see [temperature scaling and truncation](/posts/temperature-scaling/).] $\beta$ to temper the pmf as $p_X^{\beta}(x) \propto p_X(x)^{\beta}$, just so you can easily see how the entropy changes when the distribution slides from uniform on its support (at $\beta = 0$) through to a single outcome as $\beta \to \infty$.
:::


# Reading the integrand off the graph of $F_X^{-1}$

The integrand $-\log p_X(x)$ is the log of the slope of the inverse CDF at $u = F_X(x)$,^[Since $\frac{\dee F_X}{\dee x} = p_X(x)$, the inverse has $\frac{\dee F_X^{-1}}{\dee u} = \frac{1}{p_X(x)}$ at $u = F_X(x)$, wherever $p_X(x) > 0$. See also [through the quantile function](/posts/quantile-transform/).] which invites a look at the graph of $F_X^{-1}$. For a pmf the graph is a staircase, with a step for each outcome $x$ as wide as $p_X(x)$,^[$F_X^{-1}(u) = \inf\{x : F_X(x) \ge u\}$ takes the value $x$ for every $u$ in $\big(P(X < x),\, P(X \le x)\big]$, an interval of width $p_X(x)$.] so the integrand, there the surprisal of the outcome $x$, is the log of how many steps that wide would fill $[0, 1]$. Either way it is the log of how much the map spreads the probability near $u$.

The entropy is this log-spread, averaged over $u$:

$$
h(X) = \int_0^1 \log \frac{\dee x}{\dee u}\dee{u}.
$$

The map that spreads at this one rate everywhere is a straight line of slope $2^{h(X)}$, the quantile function of a uniform on an interval of length $2^{h(X)}$. That uniform has the same entropy as $X$, which is the sense in which $2^{h(X)}$ is an **effective width**. For a pmf the same line has slope $2^{H(X)}$, and the uniform with that many equally likely outcomes has the same entropy as $X$: $2^{H(X)}$ is an **effective number of outcomes**.^[The perplexity, in the discrete case. A uniform on $n$ outcomes has exactly $n$; a uniform on $[0, L]$ has exactly $L$.] A count is at least 1, so $H \ge 0$; a width can be less than 1, so $h$ can be negative. A count is at most $n$, so $H \le \log n$; a width is at most the support, so $h \le \log L$.^[With the variance fixed instead of the support, the Gaussian is widest: $h \le \tfrac12\log(2\pi e\sigma^2)$ [@cover.t:2006book2, ch. 8].]

::: {.wide .extra-wide .ex-wrap}
```{=html}
<div class="de-row"><div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div></div>
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-width" role="img" aria-label="Evenly spaced u carried through the quantile function to x, with the slope or step width at the cursor, the straight line of the uniform with the same entropy, and the uniform with the same entropy drawn as a box over p_X"></svg></div></figure>
```
:::

::: {.de-caption}
Drag $u$ to read the slope of $F_X^{-1}$ there, or the width of its step, and $p_X$ to reshape it. The dashed line is the uniform with the same entropy as $X$: it climbs $2^h$ (or $2^H$ outcome slots) over the unit interval, and that rise is the dashed box in the $p_X$ panel, an interval $2^h$ long and $1/2^h$ high. The uniform presets make both coincide with $p_X$.
:::


# Where $h$ comes from: quantize, then subtract

Cut the line into bins of width $\bw$ and let $\Xq$ be the bin $X$ lands in. Its Shannon entropy counts the width in bins, $2^{H(\Xq)} \approx 2^{h(X)}/\bw$:^[For small $\bw$, bin $i$ has mass $p_i \approx p_X(x_i)\,\bw$, so $H(\Xq) = -\sum_i p_i\log p_i \approx -\sum_i p_X(x_i)\log p_X(x_i)\,\bw \;-\; \log\bw\sum_i p_X(x_i)\,\bw$. The first sum is a Riemann sum for $h(X)$; the second tends to 1. The limit holds for any Riemann-integrable density with finite $h$ [@cover.t:2006book2, ch. 8].]

$$
H(\Xq) \approx h(X) + \log\frac{1}{\bw},
\qquad 
h(X) = \lim_{\bw\to 0}\Big[H(\Xq) + \log\bw\Big].
$$

Pinning down a real number exactly takes infinitely many bits; $h$ is what is left once that cost, the unit, is subtracted. A pmf has nothing to subtract: once the bins are finer than the atoms' spacing, $H(\Xq) = H(X)$. An atom inside a density does the same at its point, which is why a distribution with atoms has no differential entropy.^[$h = -\infty$ for a point mass, and undefined for a mixed distribution, whose $H(\Xq)$ grows like $\log(1/\bw)$ times the mass of its continuous part.]

::: {.wide .extra-wide .ex-wrap}
```{=html}
<div class="de-row">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="de-q-delta">bin width \(\Delta\) = <b id="de-q-deltav">1/4</b></label><input type="range" id="de-q-delta" min="-3" max="12" step="0.25" value="2"></div>
</div>
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-quantize" role="img" aria-label="Entropy of the quantized variable against log of one over delta, beside p_X with the histogram at bin width delta"></svg></div></figure>
```
:::

::: {.de-caption}
The curve is $H(\Xq)$ against $\log(1/\bw)$; the bars are the bin masses at the current $\bw$. For a density it climbs the dashed line $h(X) + \log(1/\bw)$, one bit per halving of $\bw$. For a pmf it is flat at $H(X)$ once $\bw < 1$. Squeeze the density toward a point and the curve slides right, $h \to -\infty$; the curve itself never goes below zero.
:::

# Stretching the axis

Relabel the outcomes of a pmf, by shuffling them or by spreading them out, and every probability is kept: $H$ and the count do not move. Stretch a density by $a$ and the same mass covers $a$ times the length, so the density drops and the width grows:^[For a smooth invertible $g$, $h(g(X)) = h(X) + \E\log\lvert g'(X)\rvert$: the Jacobian enters the density, and so the log. A shift has Jacobian 1, so $h(X + c) = h(X)$. Recording the same quantity in centimetres instead of metres adds $\log 100 \approx 6.64$ bits, and nothing about the uncertainty has changed. See also the [density of a transformed random variable](/posts/transform-pdf/).]

$$
p_{aX}(y) = \frac{1}{a}\,p_X\!\Big(\frac{y}{a}\Big)
\qquad\Longrightarrow\qquad
h(aX) = h(X) + \log a.
$$

::: {.wide .extra-wide .ex-wrap}
```{=html}
<div class="de-row">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="de-s-a">stretch \(a\) = <b id="de-s-av">1</b></label><input type="range" id="de-s-a" min="-3" max="3" step="0.05" value="0"></div>
<div class="ex-grp ex-disc"><button type="button" id="de-s-shuffle">shuffle the outcomes</button></div>
</div>
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-stretch" role="img" aria-label="The distribution of a X with the original behind it, and the uniform with the same entropy as a box"></svg></div></figure>
```
:::

::: {.de-caption}
Same stretch, two responses. Atoms move apart and keep their heights, and the box keeps its count. The density flattens to keep its area, and the box is $a$ times as long. Shuffle relabels the atoms: a different staircase, the same probabilities.
:::

# What survives: differences

Both anomalies are units. The divergent $\log(1/\bw)$ and the shift $\log a$ are the same for every entropy of the same variable, so they cancel in differences: a difference of log-widths is a log-ratio, and unit-free.^[This also says what $h$ is: $h(X) = -\KL{p_X}{1}$, a negative divergence from the flat reference "density" 1, Lebesgue measure with a chosen unit length. Jaynes' *limiting density of discrete points* replaces the 1 with an explicit reference density $m(x)$, $-\int p_X\log(p_X/m)\dee{x}$, which is coordinate-free since $p_X$ and $m$ transform alike [@jaynes.e:1968, sec. VI].] Mutual information is the main example,

$$
I(X;Y)
= h(X) - h(X\mid Y)
= \lim_{\bw\to0} I(\Xq; Y_{\bw})
\ge 0,
$$

unchanged by any invertible transformation of $X$ or $Y$ separately, as is KL divergence, $\KL{p_X}{g} = \int p_X\log(p_X/g)\dee{x}$, where the Jacobians cancel in the ratio.

::: {.wide .extra-wide}
```{=html}
<div class="de-fig">
<div class="de-controls">
<div class="de-ctl">
<label for="de-e-rho">correlation \(\rho\) = <b id="de-e-rhov">0.80</b></label>
<input type="range" id="de-e-rho" min="0" max="0.995" step="0.005" value="0.8">
</div>
<div class="de-ctl">
<label for="de-e-a">stretch \(X\) by \(a\) = <b id="de-e-av">1</b></label>
<input type="range" id="de-e-a" min="-2" max="2" step="0.05" value="0">
</div>
</div>
<div class="de-panels">
<div>
<div class="de-ptitle">500 samples of \((aX, Y)\), jointly Gaussian</div>
<svg id="de-e-sc" role="img" aria-label="Scatter plot of samples"></svg>
</div>
<div>
<div class="de-ptitle">Entropies of \(X\) (after stretching) and their difference</div>
<svg id="de-e-bars" role="img" aria-label="Bar chart of entropies and mutual information"></svg>
</div>
</div>
<div class="de-readouts">
<span><span class="k">\(h(aX)\) = </span><span class="v" id="de-e-hx">–</span></span>
<span><span class="k">\(h(aX \mid Y)\) = </span><span class="v" id="de-e-hxy">–</span></span>
<span><span class="k">\(I(aX; Y) = -\tfrac12 \log(1 - \rho^2)\) = </span><span class="v" id="de-e-I">–</span> bits</span>
</div>
</div>
```
:::

::: {.de-caption}
$X$ and $Y$ each have unit variance and correlation $\rho$. Stretching $X$ lifts or lowers both entropy bars by $\log a$ together, and either can go negative. Their difference, the mutual information (ochre), does not move. Raising $\rho$ shrinks the conditional spread of $X$ given $Y$; $h(X \mid Y) \to -\infty$ and $I$ grows without bound, which matches the discrete intuition that a noiseless real-valued channel carries infinitely many bits.
:::

# Side by side

Each row traces back to one fact: $2^H$ counts outcomes, and $2^h$ measures a length, which needs a unit.

::: {.wide .extra-wide}
| | Shannon entropy, pmf | Differential entropy, pdf | Why |
|--|-----|-----|-----|
| Definition | $-\sum p_X\log p_X$ | $-\int p_X\log p_X\dee{x}$ | The same expectation of $-\log p_X$, as a sum or an integral. |
| Effective size | $2^H$ outcomes, $\ge 1$ | $2^h$ long, any positive length | The uniform with the same entropy. |
| Inside the log | A probability, $\le 1$ | A density, unbounded | Density is probability per unit length; only its integral is fixed. |
| Sign | $H \ge 0$, zero iff deterministic | [Any real number]{.de-flag}; $\to -\infty$ as the distribution concentrates | A count is at least 1; a width can be less than 1. |
| Quantization | $H(\Xq) = H(X)$ once $\bw < 1$ | $H(\Xq) \approx h(X) + \log(1/\bw)$ | A count is a width in units of $\bw$; $h$ is the width with the unit left out. |
| Invertible transforms | Invariant under any relabeling | [Shifts by $\E\log\lvert g'(X)\rvert$]{.de-flag}; depends on units | The Jacobian rescales the density. |
| Translation | Invariant | Invariant | A shift has Jacobian 1. |
| Maximum | $\log n$, uniform on $n$ outcomes | $\log L$ on a support of length $L$ (uniform); $\tfrac12\log(2\pi e\sigma^2)$ with variance $\sigma^2$ (Gaussian) | A count is at most $n$; a width is at most the support. |
| Mutual information, KL | $\ge 0$, invariant | $\ge 0$, invariant; limits of the discrete versions | Units cancel in differences and ratios. |
:::

Shannon [-@shannon.c:1948a, Part III] introduces the integral form, noting there that it is measured relative to the coordinate system. The quantization argument above is the one in @cover.t:2006book2 [ch. 8].
