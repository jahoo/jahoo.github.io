---
title: Differential entropy
subtitle: Entropy, once the outcomes stop being countable
date: 2026-10-05
author: Jacob Hoover Vigly
tags: [exploration]
unlisted: true
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

For a discrete random variable $X$ with pmf $p_X$, the entropy is the expected value of the *surprisal* $-\log p_X(X)$:^[The surprisal of an outcome $x$ is the number of bits an optimal code spends on it. The figures take $\log_2$ throughout, so entropies are in bits.]

$$ H(X) \defeq \E\big[-\log p_X(X)\big] = -\sum_{x} p_X(x)\log p_X(x). $$

It is natural to ask what happens for a continuous $X$, with $p_X$ now its pdf:

$$ h(X) \defeq \E\big[-\log p_X(X)\big] = -\int p_X(x)\log p_X(x)\,\dee x. $$

This is the *differential entropy*, and its properties differ.^[The recipe looks the same, but $p_X(x)\,\dee x$ is a probability and $p_X(x)$ alone is not: $-\log p_X(x)$ is a log-density, not the information content of an event. The sections after the figure take this apart.] Both are the expectation of one function, $g(x) = -\log p_X(x)$. As in [Visualizing expected value](/posts/expectation/), lay the probability out along $[0, 1]$ with $u = F_X(x)$, and the expectation is an area:

$$ \E\big[-\log p_X(X)\big] = \int_0^1 -\log p_X\big(F_X^{-1}(u)\big)\,\dee u. $$

```{=html}
<div class="ex-bar wide extra-wide" id="ex-bar">
<div class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></div>
<div class="ex-grp"><label class="ex-lab" for="ex-preset">\(p_X\)</label><select id="ex-preset"></select></div>
<div class="ex-grp ex-disc"><label class="ex-lab" for="de-beta">\(\beta\) = <b id="de-betav">1.00</b></label><input type="range" id="de-beta" min="0" max="5" step="0.05" value="1"></div>
<div class="ex-grp"><button type="button" id="ex-reset">↺ reset</button></div>
</div>
```

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig"><div class="ex-canvas"><svg class="ex-plot" id="de-area" role="img" aria-label="Entropy as the area under minus log p_X of the inverse CDF over the unit interval, with minus log p_X to its left and the map from x to u above it"></svg></div></figure>
```
:::

::: {.de-caption}
Drag $p_X$ to reshape it. In the discrete case, $\beta$ tempers the pmf: the figure shows $p_X^{\beta}(x) \propto p_X(x)^{\beta}$, uniform on its support at $\beta = 0$ and a single outcome as $\beta \to \infty$.^[{-} Temperature scaling with $\beta = 1/T$; see [temperature scaling and truncation](/posts/temperature-scaling/).]
:::


# Where $h$ comes from: quantize, then subtract

The question with a Shannon answer is what the entropy of a continuous $X$ is *at some resolution*. Cut the real line into bins of width $\bw$ and let $\Xq$ be the bin that $X$ lands in. $\Xq$ is discrete, so $H(\Xq)$ is a Shannon entropy and cannot be negative.

For small $\bw$, bin $i$ with midpoint $x_i$ has probability $p_i \approx p_X(x_i)\,\bw$, and

$$
\begin{aligned}
H(\Xq) &= -\sum_i p_i \log p_i
\approx -\sum_i p_X(x_i)\bw\,\log\!\big(p_X(x_i)\bw\big) \\[2pt]
&= \underbrace{-\sum_i p_X(x_i)\log p_X(x_i)\,\bw}_{\to\; h(X)}
\;\underbrace{-\;\log\bw\,\sum_i p_X(x_i)\bw}_{\to\; -\log \bw}.
\end{aligned}
$$

The first sum is a Riemann sum for the differential entropy. The second is $\log(1/\bw)$ times a sum that tends to 1. So

$$ H(\Xq) \approx h(X) + \log\frac{1}{\bw}, \qquad h(X) = \lim_{\bw\to 0}\Big[H(\Xq) + \log\bw\Big]. $$

The discrete entropy goes to infinity: pinning down a real number exactly takes infinitely many bits. Differential entropy is what remains after subtracting that divergent term. It is not itself an entropy; it is an *offset*.^[The limit holds for any Riemann-integrable density with finite $h$ [@cover.t:2006book2, ch. 8].]

::: {.wide .extra-wide}
```{=html}
<div class="de-fig">
<div class="de-controls">
<div class="de-seg" role="radiogroup" aria-label="Distribution family" id="de-c-fam">
<button type="button" role="radio" aria-checked="true" data-v="gauss">Gaussian</button>
<button type="button" role="radio" aria-checked="false" data-v="unif">Uniform</button>
<button type="button" role="radio" aria-checked="false" data-v="bimodal">Bimodal</button>
</div>
<div class="de-ctl">
<label for="de-c-sd">standard deviation \(\sigma\) = <b id="de-c-sdv">1/8</b></label>
<input type="range" id="de-c-sd" min="-4" max="1.5" step="0.05" value="-3">
</div>
<div class="de-ctl">
<label for="de-c-d">bin width \(\Delta\) = <b id="de-c-dv">1/4</b></label>
<input type="range" id="de-c-d" min="-3" max="12" step="0.25" value="2">
</div>
</div>
<div class="de-panels de-wide-left">
<div>
<div class="de-ptitle">Discrete entropy of the quantized variable, against resolution</div>
<svg id="de-c-curve" role="img" aria-label="H of the quantized variable against log of one over delta"></svg>
</div>
<div>
<div class="de-ptitle">Density and histogram at bin width \(\Delta\) (drag the handles)</div>
<svg id="de-c-pdf" role="img" aria-label="Density with histogram bars"></svg>
</div>
</div>
<div class="de-readouts">
<span><span class="k">\(H(X_\Delta)\) = </span><span class="v" id="de-c-H">–</span> bits</span>
<span><span class="k">\(\log(1/\Delta)\) = </span><span class="v" id="de-c-L">–</span></span>
<span><span class="k">\(H(X_\Delta) - \log(1/\Delta)\) = </span><span class="v" id="de-c-diff">–</span></span>
<span><span class="k">\(h(X)\) = </span><span class="v" id="de-c-h">–</span> bits</span>
</div>
</div>
```
:::

::: {.de-caption}
The **ochre curve** is the true discrete entropy $H(\Xq)$. It never enters the shaded region below zero. Once the bins are small compared with the density's features, it rises one bit per halving of $\bw$ and runs along the **dashed teal line** $h(X) + \log(1/\bw)$. The histogram bars have height $p_i/\bw$, which puts them on the density's scale. The teal dot is where that line crosses $\bw = 1$: that height is $h(X)$. With the defaults (a Gaussian with $\sigma = 1/8$), the whole distribution fits inside one unit-width bin, so the true entropy at $\bw = 1$ is almost 0, while the extrapolated line is at $-0.95$. **That gap is the negativity of $h$**: it comes from extending a small-$\bw$ approximation to a resolution where it no longer holds. Widen $\sigma$ past about 0.24 and the intercept rises above zero. The density is editable as in the previous figure. Put a narrow bump beside a wide one and the curve rises more slowly than one bit per halving until the bins resolve both: its slope is the fraction of the mass whose shape the bins resolve.
:::

This picture also explains the limit of a distribution concentrating to a point. For a discrete variable, piling all the mass on one outcome drives $H$ down to 0. For a Gaussian with $\sigma \to 0$, the whole ochre curve slides right, and $h = \tfrac12\log(2\pi e\sigma^2) \to -\infty$. At any fixed resolution $\bw$, though, $H(\Xq)$ still bottoms out at 0 as soon as the mass fits in one bin. Nothing about Shannon entropy went wrong; the intercept moved.

Reading the line off at $\bw = 1$ is where the next problem hides: "one unit" depends on the unit.

# Stretching the axis

In the discrete case, a one-to-one relabeling moves the outcomes but leaves every probability, and therefore $H$, where it was. The continuous analogue is a change of variable. Take $Y = aX$. The same probability now spreads over a stretch $|a|$ times as long, so the density drops by the same factor to keep its area:^[{-} For the general change-of-variables formula for densities, see [this earlier note](/posts/transform-pdf/).]

$$ p_Y(y) = \frac{1}{|a|}\,p_X\!\Big(\frac{y}{a}\Big) \qquad\Longrightarrow\qquad h(aX) = h(X) + \log|a|. $$

More generally, for a smooth invertible $g$, $h(g(X)) = h(X) + \E\big[\log|g'(X)|\big]$. The Jacobian of the transformation enters the density, and so enters the log. In the quantization picture, a bin of width $\bw$ on the $Y$-axis corresponds to a bin of width $\bw/|a|$ on the $X$-axis. Measuring $Y$ at unit resolution is measuring $X$ at a finer resolution, which costs $\log|a|$ more bits.

Translation is harmless, $h(X + c) = h(X)$, because shifting has Jacobian 1. Scaling is not. Recording the same quantity in centimetres instead of metres adds $\log 100 \approx 6.64$ bits to $h$, and nothing about the uncertainty has changed.

::: {.wide .extra-wide}
```{=html}
<div class="de-fig">
<div class="de-controls">
<div class="de-ctl">
<label for="de-d-a">stretch factor \(a\) = <b id="de-d-av">1</b></label>
<input type="range" id="de-d-a" min="-3" max="3" step="0.05" value="0">
</div>
</div>
<div class="de-panels">
<div>
<div class="de-ptitle">Discrete: atoms at \(a x_i\), heights are probabilities</div>
<svg id="de-d-disc" role="img" aria-label="Stretched discrete distribution"></svg>
</div>
<div>
<div class="de-ptitle">Continuous: density of \(aX\), heights are probability per unit length</div>
<svg id="de-d-cont" role="img" aria-label="Stretched density"></svg>
</div>
</div>
<div class="de-readouts">
<span><span class="k">\(H(aX) = H(X)\) = </span><span class="v" id="de-d-H">–</span> bits</span>
<span><span class="k">\(h(aX) = h(X) + \log a\) = </span><span id="de-d-hx">–</span> <span id="de-d-la">–</span> = <span class="v" id="de-d-h">–</span> bits</span>
</div>
</div>
```
:::

::: {.de-caption}
Same stretch, two responses. On the left the atoms move apart but keep their heights: a pmf's heights are probabilities, and the stretch moves no probability between outcomes. On the right the density flattens as it widens: the ochre band holds the middle 50% of the mass, and its area stays at 0.5 while its shape changes. The dashed box, the uniform with the same $h$, has width $2^h$, and it scales by exactly $a$. The dashed curves show $a = 1$.
:::

# What survives: differences

Both anomalies are additive constants. The divergent $\log(1/\bw)$ and the unit shift $\log|a|$ are the same for every entropy of the same variable, so they cancel in differences, and differences of differential entropies behave like Shannon quantities.

Mutual information is the main example:

$$ I(X;Y) = h(X) - h(X\mid Y) = \lim_{\bw\to0} I(\Xq; Y_{\bw}). $$

It needs no renormalization, it is always $\ge 0$, and it is unchanged by any invertible transformation of $X$ or $Y$ separately. The same goes for KL divergence, $\KL{p_X}{g} = \int p_X\log(p_X/g)\dee x \ge 0$: in the ratio $p_X/g$ the Jacobians cancel, so it does not depend on coordinates.

This also says what $h$ is. Writing $h(X) = -\int p_X(x)\log\frac{p_X(x)}{1}\dee x$ shows it as a negative divergence of $p_X$ from the flat reference "density" 1, which is Lebesgue measure with a chosen unit length. The reference is where the dependence on units lives. Jaynes' *limiting density of discrete points* replaces that 1 with an explicit reference density $m(x)$ and gets a coordinate-free quantity $-\int p_X\log(p_X/m)\dee x$ [@jaynes.e:1968, sec. VI].^[{-} There, $m(x)$ is proportional to the density of the discrete points in the limit, and since $p_X$ and $m$ transform the same way under a change of variables, the ratio $p_X/m$ and so the whole quantity are invariant. Jaynes credits the derivation to his 1963 Brandeis lectures.]

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

Each row traces back to one of two facts: a density is probability per unit length rather than probability, and $h$ is the finite offset left after subtracting $\log(1/\bw)$.

::: {.wide .extra-wide}
| | Shannon entropy, pmf | Differential entropy, pdf | Why |
|--|-----|-----|-----|
| Definition | $-\sum p_X\log p_X$ | $-\int p_X\log p_X\dee x$ | Same expected negative log, with a sum or an integral as the expectation. |
| Inside the log | A probability, $\le 1$ | A density, unbounded | Density is probability per unit length; only its integral is fixed. |
| Sign | $H \ge 0$, zero iff deterministic | [Any real number]{.de-flag}; $\to -\infty$ as the distribution concentrates | $-\log p_X < 0$ wherever $p_X > 1$. |
| Relation to discretization | It is the discrete quantity | $H(\Xq) \approx h(X) + \log(1/\bw)$ | $h$ is the offset of a divergent entropy, not an entropy. |
| Invertible transforms | Invariant under any relabeling | [Shifts by $\E\log\lvert g'(X)\rvert$]{.de-flag}; depends on units | The Jacobian rescales the density. |
| Translation | Invariant | Invariant | Shift has Jacobian 1. |
| Maximum | $\log n$, uniform on $n$ outcomes | No global max. On support of length $L$: $\log L$ (uniform). With variance $\sigma^2$: $\tfrac12\log(2\pi e\sigma^2)$ (Gaussian) | Constraints play the role of "number of outcomes". |
| Mutual information, KL | $\ge 0$, invariant | $\ge 0$, invariant; limits of the discrete versions | The $\log(1/\bw)$ and Jacobian terms cancel in differences and ratios. |
:::

Shannon [-@shannon.c:1948a, Part III] introduces the integral form, noting there that it is measured relative to the coordinate system. The quantization argument above is the one in @cover.t:2006book2 [ch. 8].

<!-- DRAFT for phase 2 (moved here from the expectation post, 2026-09-30): the transform figure,
     to be reworked around the slope of the quantile function, h(X) = ∫₀¹ log (F_X⁻¹)′(u) du, with
     (F_X⁻¹)′(u) = 1/p_X(F_X⁻¹(u)). It runs on the expectation post's bundle (src/expectation,
     fig-transform.js) and styles. Not for publishing as is. -->

# Draft: the quantile function

$X$ is <span class="ex-seg ex-case" role="group" aria-label="Case"><button type="button" data-v="disc" aria-pressed="true">discrete</button><button type="button" data-v="cont" aria-pressed="false">continuous</button></span>.

::: {.wide .extra-wide .ex-wrap}
```{=html}
<figure class="ex-fig">
<div class="ex-canvas"><svg class="ex-plot" id="ex-transform" role="img" aria-label="Evenly spaced values of a uniform U, carried through the quantile function to X"></svg></div>
</figure>
```
:::
