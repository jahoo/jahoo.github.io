---
title: Temperature scaling and truncation
subtitle: A simple exploration of what modifying temperature and applying truncation does to a distribution.
date: 2026-06-02
author: Jacob Hoover Vigly
tags: [exploration, note]
js:
  - src/temperature
css:
  - assets/css/temperature.css
---

Let $p$ be a discrete probability distribution over a finite set of elements, writing $p_i$ for the probability of element $i$. If we raise each element's probability to some power, and then normalize, we get what is called the **temperature-scaled** distribution $p^{\beta}$, defined by the following, where the the exponent $\beta \triangleq 1/T$ represents the inverse of 'temperature' $T\in\mathbb{R}_{\geq 0}$.

$$
p^{\beta}_i \;\triangleq\; \frac{p_i^{\beta}}{Z(p^{\beta})},
\qquad\text{where}\ Z(p^{\beta}) = \sum_j p_j^{\beta}
$$

Equivalently, in log space, the temperature-scaled distribution is proportional to a pointwise linear scaling of the log-probabilities: $\log p^{\beta}_i = \beta \log p_i - \log Z(p^{\beta})$.

At $T = \beta = 1$, $p^{\beta} = p$. 
As $T \to 0$ ($\beta \to \infty$), mass concentrates on the argmax (a 'frozen', annealed state); 
as $T \to \infty$ ($\beta \to 0$), $p^{\beta}$ flattens toward uniform over the support of $p$ (a maximal entropy state).

Below is an interactive visualization of the temperature-scaled distribution, with controls for the temperature, and the base distribution, and also a slider to truncate the distribution to its nucleus (the smallest set of highest-probability elements whose mass reaches a threshold) 'top-$p$' and renormalized.

::: {.viz #cv-temp canvas="true" height="430px" width="100%"}
:::

<div class="temp-controls">
<div class="temp-readouts">
<div><span class="temp-controls-label">$T$ =&nbsp;</span><span id="temp-readout">1</span></div>
<div><span class="temp-controls-label">$\beta$ =&nbsp;</span><span id="temp-readout-beta">1</span></div>
</div>
<span class="temp-controls-label temp-slider-label">$\beta$:</span>
<div class="temp-slider-wrap">
<div class="temp-slider-dirs"></div>
<input type="range" id="temp-slider" min="0" max="1000" value="500">
<div class="temp-slider-ticks"><span>0</span><span>1</span><span>∞</span></div>
</div>
<div class="temp-preset-wrap">
<label class="temp-controls-label" for="temp-preset">base $p$:</label>
<select id="temp-preset">
<option value="unimodal" selected>unimodal</option>
<option value="uniform">uniform</option>
<option value="peaked">peaked</option>
<option value="bimodal">bimodal</option>
<option value="zipf">zipf</option>
<option value="custom" hidden>custom</option>
</select>
</div>
<div class="temp-rho-wrap">
<div class="temp-rho-label"><span class="temp-controls-label">top-$p$ =&nbsp;</span><span id="temp-rho-readout">1</span></div>
<input type="range" id="temp-rho" min="10" max="1000" value="1000">
</div>
</div>

<div class="temp-neg-note">
Mathematically, nothing stops us from taking $T<0$, it just reverses things...
<label class="temp-neg-toggle"><input type="checkbox" id="temp-negative"> allow $T<0$</label>
</div>

**Top row:** the base distribution $p$ (drag bars to edit) and the tempered $p^{\beta}$. **Bottom row:** the same two distributions in log space, where temperature scaling is linear: bars are scaled by $\beta$, then shifted by the common offset $-\log Z(p^{\beta})$ (in the right panel, ticks mark the pre-normalization values $\beta \log p_i$; the dotted segments are the shift). Dashed line: the uniform distribution, i.e.\ the $\beta\to 0$ limit. The top-$p$ slider truncates the tempered distribution to its nucleus (the smallest set of highest-probability elements whose mass reaches the threshold, with ties broken by index) and renormalizes.
