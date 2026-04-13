---
layout: exploration
title: Resampling in Sequential Monte Carlo
date: 2026-04-08
original-date: 2023-10-10
author: jacob hoover vigly
css:
  - /assets/smc-resampling/style.css
js:
  - /assets/smc-resampling/algorithms.js
  - /assets/smc-resampling/drawing.js
  - /assets/smc-resampling/main.js
  - /assets/smc-resampling/toolbar.js
mathjax_macros: >-
  {
    "state":   "\\xi",
    "rstate":  "\\widetilde{\\state}",
    "target":  "\\pi",
    "impwt":   "\\rho",
    "normwt":  "w",
    "np":      "N",
    "cnt":     "M",
    "gen":     "{\\mathcal{G}}",
    "E":       "{\\mathbb{E}}",
    "Var":     "\\operatorname{Var}",
    "cdf":     "F",
    "invcdf":  "{F^{-1}}",
    "probe":   "x",
    "resid":   "\\widetilde{\\normwt}",
    "idx":     "i"
  }
---

# Resampling in sequential Monte Carlo
{:.no_toc}

*Exploring some standard resampling schemes*

<div class="exploration-meta">Jacob Hoover&ensp;·&ensp;Originally October 2023&ensp;·&ensp;Last updated April 2026</div>

I've been thinking recently about the way in which you do resampling in sequential Monte Carlo (SMC).<label for="mn-intro" class="margin-toggle">&#8853;</label><input type="checkbox" id="mn-intro" class="margin-toggle"/><span class="marginnote">This post was written a few years ago with code for visualizations never finished. I've had Claude reimplement the interactive visualizations.</span>
Like many other things, while there are many asymptotically identical methods, in practice it matters which one you choose. In this post, I'm making some visualizations to explore some standard resampling schemes, and get intuitions about why they work, and why you might choose one over another.

## 1. Why care about different resampling methods?

SMC relies on importance sampling. So let's start quickly recapping that, and defining some notation. We approximate a target distribution $\pi(\cdot)$ with a weighted family of samples from some surrogate proposal distribution,
assign each sample an (unnormalized) importance weight
$\impwt^\idx$ (density ratio of target to proposal). Then the set of weighted particles 
$(\state^\idx,\impwt^\idx)_{\idx=1}^\np$
defines an empirical approximation to the current target $\target(\cdot)$:

$$\widehat{\target}(\cdot) \triangleq \sum_{\idx=1}^\np \normwt^\idx \delta_{\state^\idx}(\cdot)$$

where $\normwt^\idx = \impwt^\idx / \sum_j \impwt^j$ are the **normalized weights**.<label for="sn-normwt" class="margin-toggle sidenote-number"></label><input type="checkbox" id="sn-normwt" class="margin-toggle"/><span class="sidenote">Throughout the rest of this post, "weights" and `weights` in code refer to the normalized weights $\normwt^\idx$. </span>
For any test function $f$, taking a weighted average of the function applied over the particles
gives an estimator of its expectation under the target:
$\widehat{\E_{\target}[f]}\triangleq\E_{\widehat{\target}}[f]=\sum_\idx \normwt^\idx f(\state^\idx)$.

To start, consider the sequential importance sampling (SIS) algorithm, which does not include resampling.
SIS approximates a sequence of target distributions by evolving
a population particles. One main issue with SIS is that it can suffer 
from **weight degeneracy**: When the weights become concentrated and the budget of $\np$ 
particles effectively behaves as if it were just one sample, defeating the purpose of 
having multiple particles.<label for="mn-degen" class="margin-toggle">&#8853;</label><input type="checkbox" id="mn-degen" class="margin-toggle"/><span class="marginnote"><canvas id="cv-degeneracy" style="width:100%; height:200px; border:1px solid #ddd; border-radius:3px;"></canvas><br><span class="degen-toggle"><span class="degen-toggle-label" id="degen-label-sis">SIS</span><label class="degen-switch"><input type="checkbox" id="chk-degen-resample"><span class="degen-slider"></span></label><span class="degen-toggle-label" id="degen-label-smc">SMC</span></span> <button id="btn-degen-rerun" style="font-size:0.8em;">Re-run</button> <span id="degen-info" style="font-size:0.8em; margin-left:4px;"></span><br>Particle weight evolution illustration. Bars show normalized weights $\normwt_t^\idx$ at each step when running a bootstrap particle filter on a Gaussian random walk model 
($\state_t \sim \mathcal{N}(\state_{t-1}, 1)$; $y_t \sim \mathcal{N}(\state_t, 0.25)$; $y_t{=}2$). 
Click a particle to trace its lineage, or click a timestep label to see all ancestors. <span id="degen-caption"></span></span> This weight degeneracy issue is one key motivation for SMC, which generalizes from SIS by the addition of 
**resampling** steps. Resampling replaces a current set of particles (potentially with degenerate 
weights) with a new set of samples with weights all set to be equal, duplicating high-weight particles
and dropping low-weight ones. This addresses weight degeneracy, but introduces a different problem:
**path degeneracy**.<label for="sn-pathdegen" class="margin-toggle sidenote-number"></label><input type="checkbox" id="sn-pathdegen" class="margin-toggle"/><span class="sidenote">I'm getting this terminology for the two kinds of degeneracy from the excellent Naesseth et al. (2019, Chapter 2). They note that *adaptive resampling* can be a partial mitigation for path degeneracy. Only resample when the effective sample size $\text{ESS} = 1/\sum_\idx (\normwt^\idx)^2$ (which ranges from 1 when one particle has all the weight to $\np$ when weights are uniform) drops below a threshold (e.g., $\np/2$), rather than at every step. In this post I want to focus just on what happens when we _do_ resample, rather than on when to resample, but the ESS values in the illustration can give a sense of when resampling would be triggered in an adaptive resampling method.</span> 
After enough steps, all current particles may trace back to a single ancestor at earlier timesteps [click on a timestep label in the illustration].

Low-variance resampling methods (like stratified, systematic, or residual) produce more diverse resampled sets than multinomial resampling, which slows ancestry collapse, but doesn't prevent it entirely. This, along with the variance of the filtering estimate, makes the choice of resampling method matter.

### Staying unbiased

Let $\cnt^\idx\sim r$ be the number of copies of particle $\idx$ after
resampling (writing $r$ for the resampling method, some distribution over nonnegative integers, conditioned on the current set of weighted particles). For resampling to be unbiased, the expected number
of copies must be proportional to the weight:

$$\E_{r}[\cnt^\idx] = \np \normwt^\idx \quad \text{for all } \idx$$

This ensures that the equally-weighted resampled estimate
$\sum_{\idx=1}^{\np} \frac{1}{\np} f(\rstate^\idx)$ is unbiased for
$\sum_\idx \normwt^\idx f(\state^\idx)$. The different methods we'll look at in this post all satisfy this
condition, but they differ in how much variance the resampling
step adds.


## 2. Inverse transform sampling

Three of the first four methods share the same core idea, mapping random samples on the unit inverval through the inverse CDF of the weight distribution. The
CDF $\cdf(\idx) = \sum_{j=1}^{\idx} \normwt^j$ partitions $[0,1]$ into
segments of width $\normwt^\idx$, so it will map a sampled **probe** at position $\probe$ to a selected (resampled) particle $\invcdf(\probe)$.<label for="mn-cdf" class="margin-toggle">&#8853;</label><input type="checkbox" id="mn-cdf" class="margin-toggle"/><span class="marginnote">The fourth method, residual resampling, uses slightly different two-stage construction (see below).</span>

The question is **how to place $\np$ probes** so that particle
$i$ gets selected $\np\normwt^\idx$ times on average. Try clicking
on the CDF plot at right to place probes, and consider what strategy would you use for placing $\np$ probes, in order to have the distribution of resampled particles recreate the weight histogram on average.

<canvas id="cv-sec2" class="panel"></canvas>

<div id="smc-toolbar" class="smc-toolbar">
<div class="smc-toolbar-item" id="smc-toolbar-weights">
<span class="smc-toolbar-label">Weights:</span>
<div class="smc-toolbar-dropdown" id="smc-toolbar-dropdown">
<button class="smc-toolbar-dropdown-btn" id="smc-toolbar-dropdown-btn" type="button">
<canvas id="smc-toolbar-sparkline" width="72" height="48"></canvas>
<span id="smc-toolbar-dropdown-text">Choose preset</span>
<span class="smc-toolbar-dropdown-arrow">▾</span>
</button>
<div class="smc-toolbar-dropdown-menu" id="smc-toolbar-dropdown-menu"></div>
</div>
</div>
<div class="smc-toolbar-item" id="smc-toolbar-testfn" style="display:none;">
<span class="smc-toolbar-label">$f$:</span>
<select class="testfn-select" id="smc-toolbar-testfn-select"></select>
</div>
<div class="smc-toolbar-item" id="smc-toolbar-phase2" style="display:none;">
<span class="smc-toolbar-label">Residual–</span>
<select id="smc-toolbar-phase2-select">
<option value="multinomial">Multinomial</option>
<option value="stratified">Stratified</option>
<option value="systematic">Systematic</option>
</select>
</div>
</div>

## 3. Multinomial, stratified, and systematic resampling

You may have found that the most natural idea is to use $\np$ independent draws from the uniform distribution.<label for="sn-pit" class="margin-toggle sidenote-number"></label><input type="checkbox" id="sn-pit" class="margin-toggle"/><span class="sidenote">This is [inverse transform sampling](https://en.wikipedia.org/wiki/Inverse_transform_sampling). A little while ago, I made another [post exploring density transformations](/2022/09/02/transform-pdf.html) in the continuous case. Here we are doing this in a discrete setting: Each uniform-distributed independent probe $\probe_k$ is transformed through the discrete quantile function $\invcdf$ to produce a sample from the particle-weight distribution, just as passing a uniform draw through a continuous inverse CDF yields a draw from the corresponding distribution.</span>
This works, and leads to our first algorithm, multinomial resampling.
We then see two other strategies that reduce variance by removing independence and spreading probes more evenly, resulting in lower variance.

### Multinomial resampling

Draw $\np$ independent uniforms
$\probe_1, \ldots, \probe_\np \overset{\text{iid}}{\sim} \mathrm{Uniform}(0,1)$
and map each through the inverse CDF. The counts $(\cnt^1, \ldots, \cnt^\np)$ follow a multinomial distribution.

```python
# Step 1: build the inverse CDF (shared by all three CDF-based methods)
cumulative_sum = np.cumsum(weights)
# Step 2: choose N independent uniform probes
positions = random(N)
# Step 3: map probes through the inverse CDF → ancestor indices
indices = np.searchsorted(cumulative_sum, positions)
```
{:.code-sidenote}

Equivalent to `np.random.choice(N, size=N, replace=True, p=weights)`.
{:.small-note}

<details markdown="1" style="font-size:0.85em; color:#555; margin:0.3em 0 0.8em;">
<summary style="cursor:pointer; color:#444;"><code>searchsorted</code> does inverse-CDF lookup</summary>

For each probe value $\probe$, `searchsorted` finds the smallest index $j$
such that `cumulative_sum[j]` $\geq \probe$. This is the inverse CDF lookup:
$\probe$ falls in particle $j$'s segment of $[0,1]$, so particle $j$ gets selected.
Internally it uses binary search, but for sorted probes (as in stratified and
systematic) a single linear pass is equivalent and faster:

```python
i, j = 0, 0
while i < N:
  if positions[i] < cumulative_sum[j]:
    indices[i] = j # probe i lands in particle j's segment
    i += 1    # move to next probe
  else:
    j += 1    # move to next CDF step
```

Both pointers only advance forward, so this is $O(\np)$.

</details>

Because the draws are independent, probes can cluster and leave
gaps. Click **Resample once** to see the counts fluctuate; **Run
$K$ trials** to see means settle toward the weights.

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

<div class="est-section" id="est-multi">
<div class="testfn-row">
<span>Estimator distribution for $f(\state^\idx)=$</span>
<select class="testfn-select"></select>
</div>
<canvas id="cv-est-multi" class="panel panel-short"></canvas>
</div>

<div class="proof">
<span class="proof-label">Unbiasedness.</span>
Each probe $\probe_k$ is independently $\mathrm{Uniform}(0,1)$, so it
lands in particle $\idx$'s CDF segment (of width $\normwt^\idx$) with
probability $\normwt^\idx$. With $\np$ independent probes,
$\cnt^\idx \sim \mathrm{Binomial}(\np, \normwt^\idx)$ and
$\E[\cnt^\idx] = \np\,\normwt^\idx$. ∎
</div>


### Stratified resampling

Multinomial probes can cluster and leave gaps. Stratified
resampling spreads them: partition $[0,1]$ into $\np$ equal
**strata** $\bigl(\frac{k-1}{\np},\, \frac{k}{\np}\bigr)_{k=1}^{\np}$
and draw one independent uniform within each.

```python
# Steps 1 & 3 as above; only step 2 changes:
# one uniform draw per stratum instead of N independent
positions = (random(N) + range(N)) / N
```

<div class="insight">
Each stratum gets exactly one probe, so
$\lfloor \np\normwt^\idx \rfloor \leq \cnt^\idx \leq \lceil \np\normwt^\idx \rceil$.
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

<div class="est-section" id="est-strat">
<div class="testfn-row">
<span>Estimator distribution for $f(\state^\idx) =$</span>
<select class="testfn-select"></select>
</div>
<canvas id="cv-est-strat" class="panel panel-short"></canvas>
</div>

<div class="proof">
<span class="proof-label">Unbiasedness.</span>
Write $\mathbf{1}_k^\idx$ for the indicator that stratum $k$'s
probe lands in particle $\idx$'s segment. Within stratum $k$, the
probe is $\mathrm{Uniform}\bigl(\frac{k-1}{\np},\,
\frac{k}{\np}\bigr)$, so $\E[\mathbf{1}_k^\idx]$ equals the
overlap between stratum $k$ and particle $\idx$'s CDF interval,
scaled by $\np$. Summing over all strata:
$\E[\cnt^\idx] = \sum_{k=1}^{\np} \E[\mathbf{1}_k^\idx]
= \np\,\normwt^\idx$, since the strata tile $[0,1]$ and particle $\idx$'s
segment has total length $\normwt^\idx$. ∎
</div>


### Systematic resampling

Stratified still uses $\np$ random draws. Systematic uses just
**one**: draw $U \sim \mathrm{Uniform}(0, 1/\np)$ and set
$\probe_k = U + (k{-}1)/\np$. The probes form an equally-spaced
**comb**. **Drag the green handle** to slide it.

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

<div class="est-section" id="est-sys">
<div class="testfn-row">
<span>Estimator distribution for $f(\state^\idx) =$</span>
<select class="testfn-select"></select>
</div>
<canvas id="cv-est-sys" class="panel panel-short"></canvas>
</div>

<div class="proof">
<span class="proof-label">Unbiasedness.</span>
The offset $U$ is $\mathrm{Uniform}(0, 1/\np)$, so each probe
$\probe_k = U + (k{-}1)/\np$ is marginally
$\mathrm{Uniform}\bigl(\frac{k-1}{\np},\, \frac{k}{\np}\bigr)$---the
same distribution as the stratified probe in stratum $k$. The
same tiling argument gives $\E[\cnt^\idx] = \np\,\normwt^\idx$. (But note
that the probes are no longer independent: a single $U$
determines all of them. The marginal distributions are identical
to stratified, so unbiasedness holds, but the joint distribution
differs---and with it the variance.) ∎
</div>

### Systematic can be worse than multinomial (Douc et al., 2005, §3.4)

Systematic has the same marginals as stratified, but the probes
are **perfectly correlated**. This is usually benign, but becomes
pathological when $f$ aligns with a periodic weight pattern
matching the comb spacing.

With alternating weights (high, low, high, low, ...) and
$f(\state^\idx) = \mathbf{1}[\idx \text{ even}]$, the comb teeth
land either all on even or split evenly---producing a
**bimodal** estimator. The systematic variance is
$(\normwt_{\mathrm{even}}-\tfrac{1}{2})(1-\normwt_{\mathrm{even}})$,
**constant in $\np$**, while multinomial's decreases as
$\normwt_{\mathrm{even}}(1 - \normwt_{\mathrm{even}})/\np$.

<div class="control-box">
<div class="control-row">
<label style="font-size:0.85em; color:#555;">Weights:
<select id="select-counter-weights" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:1em;">
<option value="alternating">Alternating</option>
<option value="skewed">Skewed</option>
<option value="uniform">Uniform</option>
<option value="degenerate">Nearly degenerate</option>
</select></label>
<label><input type="checkbox" id="chk-permute"> Permute first</label>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-counter" min="500" max="10000" value="2000" step="500" style="width:90px; vertical-align:middle;">
<span id="val-K-counter">2000</span></label>
<button id="btn-run-counter">Run comparison</button>
<button id="btn-clear-counter" style="font-size:0.9em;">Clear</button>
<button id="btn-reset-counter-weights" style="font-size:0.9em;">Reset weights</button>
</div>
</div>

<div class="est-section" id="est-counter">
<canvas id="cv-counter" class="panel panel-short"></canvas>
<div class="var-display" id="var-counter"></div>
</div>

Try other test functions (e.g., mean position) to see the effect
vanish when $f$ isn't aligned with the weight periodicity.

**Note.** This counterexample depends on the particle ordering. Randomly permuting the particles before resampling eliminates the pathology (try the "Permute first" checkbox above).<label for="sn-permute" class="margin-toggle sidenote-number"></label><input type="checkbox" id="sn-permute" class="margin-toggle"/><span class="sidenote">Douc et al. (2005, §3.4) observe that both stratified and systematic resampling are sensitive to particle ordering: permuting the indices before resampling changes the distribution of the resampled set. After random permutation, systematic resampling becomes empirically similar to residual/stratified. They conclude that the counterexample is likely a "rare" situation, but that it shows systematic resampling is not as robust a variance-reduction method as stratified or residual, and that its theoretical analysis is considerably harder.</span>

## 4. Residual resampling

We could also consider a deterministic-stochastic hybrid, 
where some particles are deterministically set, and others are allocated randomly. 
In *residual resampling*, we give particle $\idx$ exactly
$\lfloor \np\normwt^\idx \rfloor$ copies, then fill the remaining
$R = \np - \sum_\idx \lfloor \np\normwt^\idx \rfloor$ slots by resampling
on the **residual weights**
$\resid^\idx = (\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor)/R$. This nondeterministic part of the algorithm could be done usinany of the three CDF methods (select below).<label for="mn-resid-var" class="margin-toggle">&#8853;</label><input type="checkbox" id="mn-resid-var" class="margin-toggle"/><span class="marginnote">Note $\Var_{\text{resid}} \leq \Var_{\text{mult}}$ always. The deterministic phase removes variance entirely for the integer parts, and the phase-2 choice affects only the residual variance.</span> The right ploshows the residual CDF (solid) overlaid on the original weights CDF (dotted). For highly skewed weights, you can see that first allocating the deterministic weights makes the residual CDF much more even than the original was.


<div class="highlighter-rouge code-sidenote" id="resid-code"><div class="highlight"><pre class="highlight"><code><span class="c1"># Phase 1 (deterministic): guaranteed copies from the integer part</span>
num_copies = np.floor(N * weights) <span class="c1"># ⌊Nwⁱ⌋</span>
R = N - sum(num_copies)  <span class="c1"># remaining slots</span>
<span class="c1"># Phase 2 (stochastic): <span id="resid-phase2-comment">multinomial</span> on the fractional remainders</span>
residual = weights * N - num_copies
residual /= sum(residual)<span class="c1"># normalize residuals</span>
<span id="resid-phase2-code">positions = random(R)    <span class="c1"># multinomial: R independent probes</span></span>
indexes[k:N] = np.searchsorted(cumsum(residual), positions)</code></pre></div></div>

<label style="font-size:0.85em; color:#555;">Phase 2 method:
<select id="select-resid-phase2" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:1em;">
<option value="multinomial">Multinomial</option>
<option value="stratified">Stratified</option>
<option value="systematic">Systematic</option>
</select></label>

<canvas id="cv-sec6" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<button id="btn-resample-resid">Resample once</button>
<button id="btn-clear-resid" style="font-size:0.9em;">Clear</button>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-resid" min="100" max="10000" value="1000" step="100" style="width:90px; vertical-align:middle;">
<span id="val-K-resid">1000</span></label>
<button id="btn-run-resid">Run $K$ trials</button>
</div>
</div>

<div class="var-display" id="var-resid"></div>

<div class="est-section" id="est-resid">
<div class="testfn-row">
<span>Estimator distribution for $f(\state^\idx) =$</span>
<select class="testfn-select"></select>
</div>
<canvas id="cv-est-resid" class="panel panel-short"></canvas>
</div>

<div class="proof">
<span class="proof-label">Unbiasedness.</span>
Phase 1 gives particle $\idx$ exactly $\lfloor \np\normwt^\idx \rfloor$
copies. Phase 2 resamples $R = \np - \sum_j \lfloor \np\normwt^j
\rfloor$ particles using normalized residual weights $\resid^\idx =
(\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor)/R$. By the unbiasedness
of whichever CDF method is used for phase 2, the expected
number of phase-2 copies of particle $\idx$ is $R \cdot \resid^\idx =
\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor$. Adding the two phases:
$\E[\cnt^\idx] = \lfloor \np\normwt^\idx \rfloor + (\np\normwt^\idx - \lfloor
\np\normwt^\idx \rfloor) = \np\,\normwt^\idx$. ∎
</div>



## 5. Comparison

Comparing all four methods on the same weights: Colored error bars show
mean count ± 1 std over $K$ trials.

<div class="control-box">
<div class="control-row">
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-all" min="100" max="10000" value="1000" step="100" style="width:120px; vertical-align:middle;">
<span id="val-K-all">1000</span></label>
<button id="btn-run-all" style="font-weight:600;">Run all four</button>
</div>
</div>

<div class="est-section" id="est-comparison">
<canvas id="cv-comparison" class="panel"></canvas>

<div class="testfn-row" style="margin-top:0.8em;">
<strong>Estimator distributions</strong> for $f(\state^\idx) =$
<select class="testfn-select"></select>
<span style="color:#999;">(dashed = true value)</span>
</div>

<canvas id="cv-est-all" class="panel panel-short"></canvas>

<div style="display:flex; justify-content:center; gap:12px; font-size:0.82em; margin:0.3em 0;">
<strong>Estimator std:</strong>
Multinomial <span class="c-multinomial" id="comp-std-multi"></span>
Stratified <span class="c-stratified" id="comp-std-strat"></span>
Systematic <span class="c-systematic" id="comp-std-sys"></span>
Residual <span class="c-residual" id="comp-std-resid"></span>
</div>
</div>

| | Multinomial | Stratified | Systematic | Residual |
|---|---|---|---|---|
| $\Var \leq \Var_{\text{mult}}$? | baseline | ✓ always | ✗ not guaranteed | ✓ always |
| $\|\cnt^\idx - \np\normwt^\idx\|$ bound | up to $\np$ | $\leq 1$ | $\leq 1$ | phase-2 dependent |
| Random draws | $\np$ | $\np$ | 1 | $R \leq \np$ |
{:.summary-table}


## 6. Other resampling schemes

The four methods above are the most widely used, but they are
not the only options.

### Branch-kill resampling

The methods above all produce exactly $\np$ resampled particles.
Branch-kill relaxes this: each particle $\idx$ independently gets
$\lfloor \np\normwt^\idx \rfloor$ deterministic copies plus one bonus
copy with probability $\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor$.
No shared CDF or residual phase needed.

```python
# For each particle independently:
num_copies = np.floor(N * weights)
p_bonus = N * weights - num_copies # fractional part
u = np.random.rand(N)    # one uniform draw per particle
bonus = (u >= 1 - p_bonus)    # inverse CDF: right of step → bonus
num_copies += bonus # total may differ from N
```

The total $\sum_\idx \cnt^\idx$ fluctuates around $\np$ rather than
equalling it exactly. The per-particle independence makes
branch-kill naturally suited to parallel hardware.

<div class="proof">
<span class="proof-label">Unbiasedness.</span>
Particle $i$ receives $\lfloor \np\normwt^\idx \rfloor$ deterministic
copies plus one bonus copy with probability $\np\normwt^\idx - \lfloor
\np\normwt^\idx \rfloor$. So $\E[\cnt^\idx] = \lfloor \np\normwt^\idx \rfloor +
(\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor) = \np\,\normwt^\idx$. ∎
</div>

<canvas id="cv-bk" class="panel"></canvas>

<div class="control-box">
<div class="control-row">
<button id="btn-resample-bk">Resample once</button>
<button id="btn-clear-bk" style="font-size:0.9em;">Clear</button>
<span style="flex:1;"></span>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-bk" min="100" max="10000" value="1000" step="100" style="width:90px; vertical-align:middle;">
<span id="val-K-bk">1000</span></label>
<button id="btn-run-bk">Run $K$ trials</button>
</div>
</div>

<div class="var-display" id="var-bk"></div>

<div class="est-section" id="est-bk">
<div class="testfn-row">
<span>Estimator distribution for $f(\state^\idx) =$</span>
<select class="testfn-select"></select>
</div>
<canvas id="cv-est-bk" class="panel panel-short"></canvas>
</div>

### Other extensions

- **Rounding-copy resampling.** Like branch-kill, but fully
  deterministic: each particle gets $\mathrm{round}(\np\normwt^\idx)$
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

Naesseth, C. A., Lindsten, F., & Schön, T. B. (2019). Elements of
sequential Monte Carlo. *Foundations and Trends in Machine Learning*,
*12*(3), 307--392. <https://doi.org/10.1561/2200000074>
