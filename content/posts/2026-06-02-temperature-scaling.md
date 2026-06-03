---
title: Temperature scaling
date: 2026-06-02
author: Jacob Hoover Vigly
tags: [exploration]
js:
  - /assets/js/temperature.bundle.js
css:
  - /assets/css/temperature.css
---

*What modifying temperature does to a distribution.*

Given a distribution $p$ over a finite set of elements, writing $p_i$ for the probability of element $i$, for some temperature $T\in\mathbb{R}$, define the **temperature-scaled** distribution $p^{(T)}$ as

$$
p^{(T)}_i \;\triangleq\; \frac{p_i^{1/T}}{Z_T},
\qquad Z_T = \sum_j p_j^{1/T}.
$$

Equivalently, $p^{(T)}$ is proportional to a linear scaling of the log-probabilities,

$$
p^{(T)} = \operatorname{softmax}\!\big(\tfrac{1}{T} \log p\big),
\qquad \text{where}\quad
\operatorname{softmax}(x)_i \;\triangleq\; \frac{e^{x_i}}{\sum_j e^{x_j}}.
$$

It's convenient to parametrize with the inverse temperature parameter $\beta \triangleq 1/T$.

At $T = \beta = 1$, $p^{(T)} = p$. 
As $T \to 0$ ($\beta \to \infty$), mass concentrates on the argmax; 
as $T \to \infty$ ($\beta \to 0$), $p^{(T)}$ flattens toward uniform over the support of $p$.

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
</div>

<div class="temp-neg-note">
Mathematically, nothing stops us from taking $T<0$, it just reverses things...
<label class="temp-neg-toggle"><input type="checkbox" id="temp-negative"> allow $T<0$</label>
</div>

**Top row:** the base distribution $p$ (drag bars to edit) and the tempered $p^{(T)}$. **Bottom row:** the same two distributions in log space, where temperature scaling is linear: bars are scaled by $\beta$, then shifted by the common offset $-\log Z_T$ (in the right panel, ticks mark the pre-normalization values $\beta \log p_i$; the dotted segments are the shift). Dashed line: the uniform distribution, i.e.\ the $\beta\to 0$ limit.
