---
layout: exploration
title: Resampling in Sequential Monte Carlo
date: 2026-04-08
css:
  - /assets/smc-resampling/style.css
js:
  - /assets/smc-resampling/algorithms.js
  - /assets/smc-resampling/drawing.js
  - /assets/smc-resampling/main.js
mathjax_macros: >-
  {
    "state":   "\\xi",
    "rstate":  "\\widetilde{\\state}",
    "wt":      "w",
    "np":      "n",
    "cnt":     "N",
    "gen":     "{\\mathcal{G}}",
    "E":       "{\\mathbb{E}}",
    "Var":     "\\operatorname{Var}",
    "cdf":     "F",
    "invcdf":  "{F^{-1}}",
    "resid":   "\\widetilde{\\wt}"
  }
---

# Resampling in Sequential Monte Carlo
{:.no_toc}

*An interactive exploration of four standard resampling schemes*

## 1. Why resample?

Sequential Monte Carlo (SMC) approximates a target distribution
using a family of $\np$ weighted samples---called *particles*.
Each particle has a state $\state^i$ (its position in the space
being sampled) and a normalized weight $\wt^i \geq 0$
(with $\sum_{i=1}^{\np} \wt^i = 1$). Samples are expensive: you
have a finite budget of $\np$ particles, and the goal is to
extract maximum accuracy from them.

In practice, these weights tend to become highly
unequal---**weight degeneracy**.<label for="sn-ess" class="margin-toggle sidenote-number"></label><input type="checkbox" id="sn-ess" class="margin-toggle"/><span class="sidenote">A common diagnostic is the *effective sample size* $\text{ESS} = 1/\sum_i (\wt^i)^2$, which ranges from 1 (all weight on one particle) to $\np$ (uniform weights). When ESS drops below a threshold (often $\np/2$), it is time to resample.</span> One or two particles end up
holding nearly all the weight, while the rest contribute almost
nothing to estimates. This is wasteful: your budget of $\np$
particles has effectively shrunk to one or two useful samples.

*[SMC propagation visualization --- coming soon]*
{:.placeholder-text}

Resampling fixes this by replacing the weighted particle family
with an equally-weighted set of $\np$ particles, duplicating
high-weight particles and eliminating low-weight ones. But this
cure has a side effect: **sample impoverishment**. After
resampling, many particles are copies of the same few ancestors,
and the cloud loses diversity. The more aggressively you
concentrate copies on the heaviest particles, the fewer distinct
values remain---which hurts the quality of exploration in
subsequent steps. This tension between *concentration*
(replicating the winners to reduce degeneracy) and
*diversification* (maintaining distinct particles to avoid
impoverishment) is what makes the choice of resampling method
important, and it is what we explore below.

### The unbiasedness condition

Let $\cnt^i$ denote the number of copies of particle $i$ in the
resampled set. The fundamental requirement is
**unbiasedness**: for each particle $i$, the expected number of
copies (given the current particles and weights) must equal
$\np$ times its weight, or equivalently, the expected proportion
of copies must match the weight:

$$\E[\cnt^i] = \np\, \wt^i \quad \Longleftrightarrow \quad \np^{-1}\E[\cnt^i] = \wt^i \quad \text{for all } i = 1, \ldots, \np$$

This guarantees that the resampled family preserves expectations.
For any test function $f$, if we write $\rstate^i$ for the
$i$-th resampled particle, then
$\np^{-1} \sum_{i=1}^{\np} f(\rstate^i)$ is an unbiased
estimator of the weighted average
$\sum_{i=1}^{\np} \wt^i f(\state^i)$.

All four methods we explore below satisfy this condition. But
resampling inevitably adds noise to the estimate---a consequence
of the impoverishment it introduces. The amount of noise differs
across methods, and the variance of the resampled estimator
measures it: a method that better navigates the
concentration--diversification tradeoff produces lower-variance
estimates from the same particle budget.


## 2. The shared mechanism: inverse CDF mapping

Three of the four methods (multinomial, stratified, systematic)
share the same mapping from **probe points** on $[0,1]$ to
particle indices.<label for="mn-cdf" class="margin-toggle">&#8853;</label><input type="checkbox" id="mn-cdf" class="margin-toggle"/><span class="marginnote">The fourth method, residual resampling, uses a different construction entirely---see §6.</span> The cumulative distribution function
$\cdf(i) = \sum_{j=1}^{i} \wt^j$ partitions $[0,1]$ into
segments of width $\wt^i$. A probe at position $u$ selects
whichever particle $i$ satisfies
$\cdf(i{-}1) \leq u < \cdf(i)$---the **inverse CDF** (quantile
function) $\invcdf(u)$.

**Drag the bars** on the left to adjust particle weights (they
auto-renormalize). **Click the plot** to place probes and see
which particle each selects. Hover to preview.

<canvas id="cv-sec2" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<span style="font-size:0.85em; color:#666;">Presets:</span>
<button id="btn-uniform">Uniform</button>
<button id="btn-skewed">Skewed</button>
<button id="btn-degenerate">Degenerate</button>
<span style="flex:1;"></span>
<button id="btn-clear-probes">Clear probes</button>
</div>
</div>

The methods we examine below differ in **how they place the
$\np$ probe points**:

- **Multinomial**{:.c-multinomial} --- $\np$ independent uniform draws on $[0,1]$.
- **Stratified**{:.c-stratified} --- one independent draw per stratum, $\np$ equal strata.
- **Systematic**{:.c-systematic} --- a single random offset generates $\np$ equally-spaced probes.
- **Residual**{:.c-residual} --- a deterministic-stochastic hybrid.
{:.method-preview}


## 3. Multinomial resampling

The simplest approach: draw $\np$ independent uniform random
numbers $u_1, \ldots, u_\np \overset{\text{iid}}{\sim} \mathrm{Uniform}(0,1]$
and map each through the inverse CDF. The resulting duplication
counts $(\cnt^1, \ldots, \cnt^\np)$ follow a multinomial
distribution.

```python
# Step 1: build the inverse CDF (shared by all three CDF-based methods)
cumulative_sum = np.cumsum(weights)
# Step 2: choose N independent uniform probes
positions = random(N)
# Step 3: map probes through the inverse CDF → ancestor indices
indices = np.searchsorted(cumulative_sum, positions)
```

Equivalent to `np.random.choice(N, size=N, replace=True, p=weights)`---the
explicit form shows the inverse-CDF mechanism shared with the other methods.
{:.small-note}

<details style="font-size:0.85em; color:#555; margin:0.3em 0 0.8em;">
<summary style="cursor:pointer; color:#444;">What does <code>searchsorted</code> do?</summary>
<p style="margin:0.4em 0;">
For each probe value $u$, <code>searchsorted</code> finds the smallest index $j$
such that <code>cumulative_sum[j]</code>&nbsp;$\geq u$. This is the inverse CDF lookup:
$u$ falls in particle $j$'s segment of $[0,1]$, so particle $j$ gets selected.
Internally it uses binary search, but for sorted probes (as in stratified and
systematic) a single linear pass is equivalent and faster:
</p>
<pre class="code-callout">i, j = 0, 0
while i &lt; N:
    if positions[i] &lt; cumulative_sum[j]:
        indices[i] = j     # probe i lands in particle j's segment
        i += 1             # move to next probe
    else:
        j += 1             # move to next CDF step</pre>
<p style="margin:0.4em 0;">
Both pointers only advance forward, so this is $O(\np)$. This is what filterpy
actually uses for stratified and systematic resampling.
</p>
</details>

Because the draws are independent, probes can cluster and leave
gaps. Click **Resample once** several times and notice how the
counts fluctuate (hollow outlines over the weight bars); then
**Run $K$ trials** to see the mean counts settle toward the weights.

<canvas id="cv-sec3" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<button id="btn-resample-multi">Resample once</button>
<button id="btn-clear-multi" style="font-size:0.9em;">Clear</button>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-multi" min="100" max="10000" value="1000" step="100" style="width:90px; vertical-align:middle;">
<span id="val-K-multi">1000</span></label>
<button id="btn-run-multi">Run $K$ trials</button>
</div>
</div>

<div class="var-display" id="var-multi"></div>

<div class="testfn-row">
<span>Estimator distribution for $f(\state^i) =$</span>
<select class="testfn-select"></select>
</div>

<canvas id="cv-est-multi" class="panel panel-short"></canvas>


## 4. Stratified resampling

Partition $[0,1]$ into $\np$ equal **strata**
$\bigl(\frac{k-1}{\np},\, \frac{k}{\np}\bigr]$ and draw one
independent uniform within each. The alternating blue and white
bands below show the strata.

```python
# Steps 1 & 3 as above; only step 2 changes:
# one uniform draw per stratum instead of N independent
positions = (random(N) + range(N)) / N
```

<div class="insight">
Each stratum gets exactly one probe, so
$\lfloor \np\wt^i \rfloor \leq \cnt^i \leq \lceil \np\wt^i \rceil$.
Douc et al. (2005) prove $\Var_{\text{strat}} \leq \Var_{\text{mult}}$ always.
</div>

<canvas id="cv-sec4" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<button id="btn-resample-strat">Resample once</button>
<button id="btn-clear-strat" style="font-size:0.9em;">Clear</button>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-strat" min="100" max="10000" value="1000" step="100" style="width:90px; vertical-align:middle;">
<span id="val-K-strat">1000</span></label>
<button id="btn-run-strat">Run $K$ trials</button>
</div>
</div>

<div class="var-display" id="var-strat"></div>

<div class="testfn-row">
<span>Estimator distribution for $f(\state^i) =$</span>
<select class="testfn-select"></select>
</div>

<canvas id="cv-est-strat" class="panel panel-short"></canvas>


## 5. Systematic resampling

Use a **single** random offset
$U \sim \mathrm{Uniform}(0, 1/\np)$ and place all probes
deterministically: $u_k = U + (k{-}1)/\np$. The probes form an
equally-spaced **comb**. **Drag the green handle** to slide it.

```python
# Steps 1 & 3 as above; only step 2 changes:
# a single random offset → N equally-spaced probes
positions = (random() + np.arange(N)) / N
```

<canvas id="cv-sec5" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<button id="btn-resample-sys">Random offset</button>
<button id="btn-clear-sys" style="font-size:0.9em;">Clear</button>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-sys" min="100" max="10000" value="1000" step="100" style="width:90px; vertical-align:middle;">
<span id="val-K-sys">1000</span></label>
<button id="btn-run-sys">Run $K$ trials</button>
</div>
</div>

<div class="var-display" id="var-sys"></div>

<div class="testfn-row">
<span>Estimator distribution for $f(\state^i) =$</span>
<select class="testfn-select"></select>
</div>

<canvas id="cv-est-sys" class="panel panel-short"></canvas>

### The counterexample (Douc et al., 2005, §3.4)

Systematic has the same marginals as stratified, but the probes
are **perfectly correlated**---one random number determines all
of them. For most weight patterns and test functions, this
correlation is benign or even helpful. But it becomes
pathological when the test function $f$ is **aligned** with a
periodic weight structure that matches the comb spacing.

Douc et al. (2005) construct an alternating weight pattern (high, low,
high, low, ...) and a test function
$f(\state^i) = \mathbf{1}\{i \text{ even}\}$ that separates the
two classes. Define the total weight on even-indexed particles as
$\wt_{\mathrm{even}} = \sum_{i\,\text{even}} \wt^i$. The comb
teeth collectively land either all on the high-weight (even)
particles or split evenly across both classes---producing a
**bimodal** estimator distribution. The systematic estimator
variance for this $f$ is
$(\wt_{\mathrm{even}}-\tfrac{1}{2})(1-\wt_{\mathrm{even}})$,
which is **constant in $\np$**---it does not improve as you add
more particles. Meanwhile, multinomial's variance decreases as
$\wt_{\mathrm{even}}(1 - \wt_{\mathrm{even}})/\np$.

At $\np = 8$ with $\wt_{\mathrm{even}} = 0.8$: systematic
std $\approx$ 0.245 vs. multinomial std $\approx$ 0.141---systematic
is **1.7× worse**. Try switching to other test functions
(e.g., mean position) using the selector to see that the effect
vanishes when $f$ is not aligned with the weight periodicity.

<div class="control-box">
<div class="control-row">
<button id="btn-load-counter">Load counterexample</button>
<button id="btn-reset-weights">Reset weights</button>
<span style="flex:1;"></span>
<label><input type="checkbox" id="chk-permute"> Permute first</label>
<button id="btn-run-counter">Run comparison</button>
</div>
</div>

<canvas id="cv-counter" class="panel panel-short"></canvas>

<div class="var-display" id="var-counter"></div>


## 6. Residual resampling

A deterministic-stochastic hybrid. Each particle $i$ receives
$\lfloor \np\wt^i \rfloor$ guaranteed copies---no randomness
needed. The remaining
$R = \np - \sum_i \lfloor \np\wt^i \rfloor$ slots are filled by
resampling on the **residual weights**
$\resid^i = (\np\wt^i - \lfloor \np\wt^i \rfloor)/R$. Any of
the three CDF-based methods can be used for this phase---select
below. The right plot shows the residual CDF (solid) overlaid on
the original (dotted)---note how much flatter the residual
distribution is.

<pre class="code-callout" id="resid-code"><span class="comment"># Phase 1 (deterministic): guaranteed copies from the integer part</span>
num_copies = (np.floor(N * weights)).astype(int)    <span class="comment"># ⌊nωⁱ⌋</span>
<span class="comment"># Phase 2 (stochastic): <span id="resid-phase2-comment">multinomial</span> on the fractional remainders</span>
residual = weights * N - num_copies
residual /= sum(residual)                           <span class="comment"># normalize residuals</span>
<span id="resid-phase2-code">positions = random(R)                               <span class="comment"># multinomial: R independent probes</span></span>
indexes[k:N] = np.searchsorted(cumsum(residual), positions)</pre>

<canvas id="cv-sec6" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<button id="btn-resample-resid">Resample once</button>
<button id="btn-clear-resid" style="font-size:0.9em;">Clear</button>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">Phase 2:
<select id="select-resid-phase2" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:1em;">
<option value="multinomial">Multinomial</option>
<option value="stratified">Stratified</option>
<option value="systematic">Systematic</option>
</select></label>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-resid" min="100" max="10000" value="1000" step="100" style="width:90px; vertical-align:middle;">
<span id="val-K-resid">1000</span></label>
<button id="btn-run-resid">Run $K$ trials</button>
</div>
</div>

<div class="var-display" id="var-resid"></div>

<div class="testfn-row">
<span>Estimator distribution for $f(\state^i) =$</span>
<select class="testfn-select"></select>
</div>

<canvas id="cv-est-resid" class="panel panel-short"></canvas>

Douc et al. (2005) prove $\Var_{\text{resid}} \leq \Var_{\text{mult}}$
always---the deterministic phase removes variance entirely for
the integer parts. The phase-2 choice affects only the residual
variance; using stratified or systematic for phase 2 can reduce
it further.


## 7. Head-to-head comparison

All four methods on the same weights, overlaid on a single plot.
Gray bars show the target weights; colored error bars show each
method's mean count ± 1 std over $K$ trials (vertically offset
within each particle row for readability). Below, the estimator
distribution for the selected test function $f$ shows how tightly
each method concentrates around the true value.

<div class="control-box">
<div class="control-row">
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-all" min="100" max="10000" value="1000" step="100" style="width:120px; vertical-align:middle;">
<span id="val-K-all">1000</span></label>
<button id="btn-run-all" style="font-weight:600;">Run all four</button>
</div>
</div>

<canvas id="cv-comparison" class="panel"></canvas>

<div class="testfn-row" style="margin-top:0.8em;">
<strong>Estimator distribution</strong> --- all four overlaid, for $f(\state^i) =$
<select class="testfn-select"></select>
<span style="color:#999;">(dashed = true value)</span>
</div>

<canvas id="cv-est-all" class="panel panel-short"></canvas>

<div style="display:flex; justify-content:center; gap:12px; font-size:0.82em; margin:0.3em 0;">
<strong>Estimator std:</strong>
<span class="c-multinomial" id="comp-std-multi"></span>
<span class="c-stratified" id="comp-std-strat"></span>
<span class="c-systematic" id="comp-std-sys"></span>
<span class="c-residual" id="comp-std-resid"></span>
</div>

<div style="display:flex; justify-content:center; gap:16px; font-size:0.82em; margin:0.3em 0;">
<span><span style="display:inline-block;width:12px;height:3px;background:#e67e22;vertical-align:middle;margin-right:3px;"></span>Multinomial <span class="comp-var" id="comp-var-multi"></span></span>
<span><span style="display:inline-block;width:12px;height:3px;background:#2980b9;vertical-align:middle;margin-right:3px;"></span>Stratified <span class="comp-var" id="comp-var-strat"></span></span>
<span><span style="display:inline-block;width:12px;height:3px;background:#27ae60;vertical-align:middle;margin-right:3px;"></span>Systematic <span class="comp-var" id="comp-var-sys"></span></span>
<span><span style="display:inline-block;width:12px;height:3px;background:#8e44ad;vertical-align:middle;margin-right:3px;"></span>Residual <span class="comp-var" id="comp-var-resid"></span></span>
</div>

| | Multinomial | Stratified | Systematic | Residual |
|---|---|---|---|---|
| $\Var \leq \Var_{\text{mult}}$? | baseline | ✓ always | ✗ not guaranteed | ✓ always |
| $\|\cnt^i - \np\wt^i\|$ bound | up to $\np$ | $\leq 1$ | $\leq 1$ | phase-2 dependent |
| Random draws | $\np$ | $\np$ | 1 | $R \leq \np$ |
| Est. std | <span id="td-var-multi">---</span> | <span id="td-var-strat">---</span> | <span id="td-var-sys">---</span> | <span id="td-var-resid">---</span> |
{:.summary-table}


## 8. Branch-kill resampling

All four methods above produce exactly $\np$ resampled particles.
Branch-kill resampling relaxes this: each particle $i$ receives
$\lfloor \np\wt^i \rfloor$ deterministic copies (as in
residual), then independently draws one additional copy with
probability $\np\wt^i - \lfloor \np\wt^i \rfloor$. No second
phase or residual CDF is needed---each particle is processed in
isolation.

```python
# For each particle independently:
num_copies = np.floor(N * weights).astype(int)
bonus = (np.random.rand(N) < (N * weights - num_copies)).astype(int)
num_copies += bonus                                     # total may differ from N
```

This satisfies the unbiasedness condition---$\E[\cnt^i] =
\lfloor \np\wt^i \rfloor + (\np\wt^i - \lfloor \np\wt^i
\rfloor) = \np\wt^i$---but the total number of resampled
particles $\sum_i \cnt^i$ fluctuates around $\np$ rather than
equalling it exactly. The per-particle independence makes
branch-kill naturally suited to parallel hardware, where each
processing element can handle its own particle without
communication.

*[Interactive visualization --- coming soon. Ref: Li et al. (2015), Code 5; `resampleBranching.m`.]*
{:.placeholder-text}


## Beyond these four

The schemes above are the most widely used, but they are not the
only options. A few notable extensions:

- **Rounding-copy resampling.** Like branch-kill, but fully
  deterministic: each particle gets $\mathrm{round}(\np\wt^i)$
  copies. This uses zero random draws, but sacrifices the strict
  unbiasedness condition (the bias per particle is at most
  $0.5/\np$, vanishing as $\np$ grows). See Li et al. (2015).

- **Optimal transport resampling.** Rather than mapping through a
  CDF, one can frame resampling as a discrete optimal transport
  problem, minimizing the expected distance between the original
  and resampled particle positions. This preserves spatial
  structure better than CDF-based methods but is more expensive.


## References

Douc, R., Cappé, O., & Moulines, E. (2005). Comparison of resampling
schemes for particle filtering. *ISPA 2005. Proceedings of the 4th
International Symposium on Image and Signal Processing and Analysis*,
64--69. <https://doi.org/10.1109/ISPA.2005.195385>

Li, T., Bolic, M., & Djuric, P. M. (2015). Resampling methods for
particle filtering: Classification, implementation, and strategies.
*IEEE Signal Processing Magazine*, *32*(3), 70--86.
<https://doi.org/10.1109/MSP.2014.2330626>
