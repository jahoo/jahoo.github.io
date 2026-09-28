---
title: Differential entropy, taken apart
subtitle: Entropy, once the outcomes stop being countable
date: 2026-09-28
author: Jacob Hoover Vigly
tags: [exploration]
unlisted: true
js:
  - src/differential-entropy
css:
  - assets/css/differential-entropy.css
bibliography: assets/differential-entropy/references.bib
reference-section-title: References
link-citations: true
mathjax-macros: assets/differential-entropy/macros.json
---

Shannon's entropy is the expected value of $-\log \pmf(X)$ under a probability mass function $\pmf$. Replace the sum with an integral and the mass function with a density, and you get a formula that looks the same but is not the same kind of object. It can be negative, it changes when you change units, and it is not the limit of any Shannon entropy. Below, the substitution is taken apart one picture at a time.^[{-} All logarithms here are base 2, so every quantity is in bits. Natural logs rescale every value by $\ln 2$ and change nothing else. Related notes: [the density of a transformed random variable](/posts/transform-pdf/), and [surprisal and KL](/posts/surprisal-and-KL/).]

```{=html}
<div class="de-fig">
<div class="de-ptitle">Uniform density on \([0, w]\) (drag the right edge)</div>
<svg id="de-uni-svg" role="img" aria-label="A uniform density whose width you can drag"></svg>
<div class="de-controls de-uni-row">
<div class="de-ctl">
<label for="de-uni-w">width \(w\) = <b id="de-uni-wv">0.50</b></label>
<input type="range" id="de-uni-w" min="0.2" max="4" step="0.01" value="0.5">
</div>
<div>
<div class="de-bigk">differential entropy</div>
<div class="de-big" id="de-uni-h">h = −1.00 bits</div>
</div>
</div>
</div>
```

Probability is area, so the box has height $1/w$. The formula gives $h = \log w$, which is below zero whenever the box is narrower than one unit. A discrete variable with $n$ equally likely outcomes never does this: its entropy is $\log n \ge 0$.

# Discrete entropy is an average of surprisals

For a discrete random variable $X$ with pmf $\pmf$, the *surprisal* of an outcome $x$ is $-\log \pmf(x)$: the number of bits an optimal code spends on it. Entropy is the average surprisal, weighted by how often each outcome happens:

$$ H(X) \defeq \E\big[-\log \pmf(X)\big] = -\sum_{x} \pmf(x)\log \pmf(x). $$

Two facts do most of the work in what follows.

**Every surprisal is non-negative.** A probability is at most 1, so $\log \pmf(x) \le 0$ and $-\log \pmf(x) \ge 0$. An average of non-negative numbers is non-negative, so $H(X) \ge 0$, with equality only when a single outcome has probability 1.

**Only the list of probabilities matters.** The outcomes' names or numeric values never enter the formula. Relabel them with any one-to-one map and $H$ does not move.

The right-hand panel below draws entropy as an area. Give each outcome a column whose width is its probability and whose height is its surprisal. The widths add to 1, so the total area equals the average height, which is $H$.

::: {.wide .extra-wide}
```{=html}
<div class="de-fig">
<div class="de-controls">
<div class="de-ctl">
<label for="de-a-beta">sharpness \(\beta\) = <b id="de-a-betav">1.00</b></label>
<input type="range" id="de-a-beta" min="0" max="5" step="0.05" value="1">
</div>
<button class="de-btn" id="de-a-shuffle" type="button">Shuffle labels</button>
</div>
<div class="de-panels">
<div>
<div class="de-ptitle">pmf over eight outcomes</div>
<svg id="de-a-pmf" role="img" aria-label="Bar chart of the pmf"></svg>
</div>
<div>
<div class="de-ptitle">Same pmf as area: width \(p(x)\), height \(-\log p(x)\)</div>
<svg id="de-a-area" role="img" aria-label="Columns with width equal to probability and height equal to surprisal"></svg>
</div>
</div>
<div class="de-readouts">
<span><span class="k">\(H(X)\) = </span><span class="v" id="de-a-H">–</span> bits</span>
<span><span class="k">range: </span><span class="v">\(0 \le H \le \log 8 = 3\)</span></span>
</div>
</div>
```
:::

::: {.de-caption}
The pmf is a softmax of fixed logits with inverse temperature $\beta$. At $\beta = 0$ it is uniform and every column has height 3 bits. Raising $\beta$ piles mass onto one outcome: its column gets wide and short, the others get narrow and tall, and the area shrinks toward 0 but never goes below the axis. **Shuffle labels** reorders the outcomes; the set of column shapes is unchanged, and so is $H$.
:::

# The same recipe with a density

Let $X$ have a density $\pdf$. The tempting move is to keep the expected negative log and swap each discrete ingredient for its continuous counterpart:

$$ -\sum_x \pmf(x)\log \pmf(x) \quad\longrightarrow\quad h(X) \defeq -\int \pdf(x)\log \pdf(x)\dee x = \E\big[-\log \pdf(X)\big]. $$

This is the *differential entropy*. The area picture still works: lay the probability mass out along $[0,1]$ using the cumulative distribution $u = F(x)$, and above each slice of mass draw the height $-\log \pdf(x)$. The net area is $h(X)$.

What breaks is the first fact. A density is not a probability; it is probability *per unit length*, $P(x \le X \le x+\dee x) \approx \pdf(x)\dee x$. Only its integral is constrained to equal 1, so $\pdf$ can be as tall as it likes as long as it is correspondingly narrow. Wherever $\pdf(x) > 1$, the height $-\log \pdf(x)$ is negative. If enough mass sits in such places, the net area is negative.

::: {.wide .extra-wide}
```{=html}
<div class="de-fig">
<div class="de-controls">
<div class="de-seg" role="radiogroup" aria-label="Distribution family" id="de-b-fam">
<button type="button" role="radio" aria-checked="true" data-v="gauss">Gaussian</button>
<button type="button" role="radio" aria-checked="false" data-v="unif">Uniform</button>
<button type="button" role="radio" aria-checked="false" data-v="bimodal">Bimodal</button>
</div>
<div class="de-ctl">
<label for="de-b-sd">standard deviation \(\sigma\) = <b id="de-b-sdv">1</b></label>
<input type="range" id="de-b-sd" min="-4" max="1.5" step="0.05" value="-2.3">
</div>
</div>
<div class="de-panels">
<div>
<div class="de-ptitle">Density \(f(x)\); mass where \(f &gt; 1\) in magenta</div>
<svg id="de-b-pdf" role="img" aria-label="Density plot"></svg>
</div>
<div>
<div class="de-ptitle">As area: width = probability, height \(-\log f(x)\)</div>
<svg id="de-b-area" role="img" aria-label="Log-density drawn against cumulative probability"></svg>
</div>
</div>
<div class="de-readouts">
<span><span class="k">\(h(X)\) = </span><span class="v" id="de-b-h">–</span> bits</span>
<span><span class="k">peak density: </span><span class="v" id="de-b-peak">–</span></span>
<span><span class="k">\(P(f(X) &gt; 1)\) = </span><span class="v" id="de-b-pneg">–</span></span>
<span><span class="k">effective width \(2^{h}\) = </span><span class="v" id="de-b-eff">–</span></span>
</div>
</div>
```
:::

::: {.de-caption}
The magenta slice of mass on the left is exactly the magenta stretch of the horizontal axis on the right: the part of the distribution whose log-density term is negative. Shrink $\sigma$ and more of the mass moves above the $\pdf = 1$ line. The dashed box on the left is the uniform density with the same $h$; its width, $2^h$, is one reading of what $h$ measures. At a fixed $\sigma$, switch families: the Gaussian always has the largest $h$, $\tfrac12\log(2\pi e\sigma^2)$.
:::

::: {.callout-note title="On the word surprisal"}
In the discrete case, $-\log \pmf(x)$ is the information content of an actual event. In the continuous case, $\{X = x\}$ has probability 0, and $-\log \pdf(x)$ is not the information content of anything. It is a log-density, and its sign depends on the unit $x$ is measured in. The next section shows what it is instead.
:::

# Where $h$ comes from: quantize, then subtract

The question with a Shannon answer is what the entropy of a continuous $X$ is *at some resolution*. Cut the real line into bins of width $\bw$ and let $\Xq$ be the bin that $X$ lands in. $\Xq$ is discrete, so $H(\Xq)$ is a Shannon entropy and cannot be negative.

For small $\bw$, bin $i$ with midpoint $x_i$ has probability $\pmf_i \approx \pdf(x_i)\,\bw$, and

$$
\begin{aligned}
H(\Xq) &= -\sum_i \pmf_i \log \pmf_i
\approx -\sum_i \pdf(x_i)\bw\,\log\!\big(\pdf(x_i)\bw\big) \\[2pt]
&= \underbrace{-\sum_i \pdf(x_i)\log \pdf(x_i)\,\bw}_{\to\; h(X)}
\;\underbrace{-\;\log\bw\,\sum_i \pdf(x_i)\bw}_{\to\; -\log \bw}.
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
<div class="de-ptitle">Density and its histogram at bin width \(\Delta\) (bar height \(p_i/\Delta\))</div>
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
The **ochre curve** is the true discrete entropy $H(\Xq)$. It never enters the shaded region below zero. Once the bins are small compared with the density's features, it rises one bit per halving of $\bw$ and runs along the **dashed teal line** $h(X) + \log(1/\bw)$. The teal dot is where that line crosses $\bw = 1$: that height is $h(X)$. With the defaults (a Gaussian with $\sigma = 1/8$), the whole distribution fits inside one unit-width bin, so the true entropy at $\bw = 1$ is almost 0, while the extrapolated line is at $-0.95$. **That gap is the negativity of $h$**: it comes from extending a small-$\bw$ approximation to a resolution where it no longer holds. Widen $\sigma$ past about 0.24 and the intercept rises above zero.
:::

This picture also explains the limit of a distribution concentrating to a point. For a discrete variable, piling all the mass on one outcome drives $H$ down to 0. For a Gaussian with $\sigma \to 0$, the whole ochre curve slides right, and $h = \tfrac12\log(2\pi e\sigma^2) \to -\infty$. At any fixed resolution $\bw$, though, $H(\Xq)$ still bottoms out at 0 as soon as the mass fits in one bin. Nothing about Shannon entropy went wrong; the intercept moved.

Reading the line off at $\bw = 1$ is where the next problem hides: "one unit" depends on the unit.

# Stretching the axis

In the discrete case, a one-to-one relabeling moves the outcomes but leaves every probability, and therefore $H$, where it was. The continuous analogue is a change of variable. Take $Y = aX$. The same probability now spreads over a stretch $|a|$ times as long, so the density drops by the same factor to keep its area:^[{-} For the general change-of-variables formula for densities, see [this earlier note](/posts/transform-pdf/).]

$$ \pdf_Y(y) = \frac{1}{|a|}\,\pdf_X\!\Big(\frac{y}{a}\Big) \qquad\Longrightarrow\qquad h(aX) = h(X) + \log|a|. $$

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

It needs no renormalization, it is always $\ge 0$, and it is unchanged by any invertible transformation of $X$ or $Y$ separately. The same goes for KL divergence, $\KL{\pdf}{g} = \int \pdf\log(\pdf/g)\dee x \ge 0$: in the ratio $\pdf/g$ the Jacobians cancel, so it does not depend on coordinates.

This also says what $h$ is. Writing $h(X) = -\int \pdf(x)\log\frac{\pdf(x)}{1}\dee x$ shows it as a negative divergence of $\pdf$ from the flat reference "density" 1, which is Lebesgue measure with a chosen unit length. The reference is where the dependence on units lives. Jaynes' *limiting density of discrete points* replaces that 1 with an explicit reference density $m(x)$ and gets a coordinate-free quantity $-\int \pdf\log(\pdf/m)\dee x$.

<!-- TODO: cite Jaynes on the limiting density of discrete points (1963 Brandeis lectures / 1968 "Prior probabilities"); neither is in source.bib yet. -->

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
| Definition | $-\sum \pmf\log \pmf$ | $-\int \pdf\log \pdf\dee x$ | Same expected negative log, with a sum or an integral as the expectation. |
| Inside the log | A probability, $\le 1$ | A density, unbounded | Density is probability per unit length; only its integral is fixed. |
| Sign | $H \ge 0$, zero iff deterministic | [Any real number]{.de-flag}; $\to -\infty$ as the distribution concentrates | $-\log \pdf < 0$ wherever $\pdf > 1$. |
| Relation to discretization | It is the discrete quantity | $H(\Xq) \approx h(X) + \log(1/\bw)$ | $h$ is the offset of a divergent entropy, not an entropy. |
| Invertible transforms | Invariant under any relabeling | [Shifts by $\E\log\lvert g'(X)\rvert$]{.de-flag}; depends on units | The Jacobian rescales the density. |
| Translation | Invariant | Invariant | Shift has Jacobian 1. |
| Maximum | $\log n$, uniform on $n$ outcomes | No global max. On support of length $L$: $\log L$ (uniform). With variance $\sigma^2$: $\tfrac12\log(2\pi e\sigma^2)$ (Gaussian) | Constraints play the role of "number of outcomes". |
| Mutual information, KL | $\ge 0$, invariant | $\ge 0$, invariant; limits of the discrete versions | The $\log(1/\bw)$ and Jacobian terms cancel in differences and ratios. |
:::

Shannon [-@shannon.c:1948a, Part III] introduces the integral form, noting there that it is measured relative to the coordinate system. The quantization argument above is the one in @cover.t:2006book2 [ch. 8].
