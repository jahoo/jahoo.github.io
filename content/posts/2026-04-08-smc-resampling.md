---
title: Resampling in Sequential Monte Carlo
date: 2026-04-08
author: Jacob Hoover Vigly
tags: [exploration]
js:
  - smc-resampling
css:
  - /assets/css/smc-resampling.css
bibliography: assets/smc-resampling/references.bib
reference-section-title: References
toc: true
toc-depth: 3
link-citations: true
mathjax-macros: assets/smc-resampling/macros.json
---

*Exploring some standard resampling schemes*.^[{-} I drafted this post back in October 2023, with visualizations unfinished. It's structured pedagogically as a standalone introduction aimed at my own understanding. Now (2026) I've had Claude reimplement and vastly improve the visualizations with interactivity, and thought the result was was worth sharing ...with a vibe-coding disclaimer: I have not checked the code for simulations, which is all new. But even with that caveat, the illustrations should serve their purpose better than what I had originally.]

I've been thinking recently about the way in which you do resampling in sequential Monte Carlo (SMC). Like many other things, while there are many asymptotically identical methods, in practice it matters which one you choose. In this post, I'm making some visualizations to explore some standard resampling schemes, and get intuitions about why they work, and why you might choose one over another.

## 1. Why and how to resample

SMC relies on importance sampling. So let's start quickly recapping that, and defining some notation. We approximate a target distribution $\target(\cdot)$ with a set of samples from some surrogate proposal distribution, by assigning each sample an importance weight
$\impwt^\idx$ (proportional to the density ratio of target to proposal). Then the set of weighted particles 
$(\state^\idx,\impwt^\idx)_{\idx=1}^\np$
defines an empirical approximation to the current target $\target(\cdot)$:

$$\widehat{\target}(\cdot) \triangleq \sum_{\idx=1}^\np \normwt^\idx \delta_{\state^\idx}(\cdot)$$

where $\normwt^\idx = \impwt^\idx / \sum_j \impwt^j$ are the **normalized weights**.^[Throughout the rest of this post, "weights" and `weights` in code refer to the normalized weights $\normwt^\idx$. ]
For any test function $f$, taking a weighted average of the function applied over the particles
gives an estimator of its expectation under the target:
$\widehat{\E_{\target}[f]}\triangleq\E_{\widehat{\target}}[f]=\sum_\idx \normwt^\idx f(\state^\idx)$.

In sequential importance sampling (SIS), we apply importance sampling sequentially, to approximate a _sequence_ of target distributions by maintaining an evolving population of particles, iteratively propagating and reweighting. One main issue with SIS is that it can suffer from **weight degeneracy**: When the weights become concentrated and the budget of $\np$ particles effectively behaves as if it were just one sample, defeating the purpose of having multiple particles.

<canvas id="cv-degeneracy" style="width:100%; height:200px; border:1px solid #ddd; border-radius:3px;"></canvas><span class="degen-toggle"><span class="degen-toggle-label" id="degen-label-sis">SIS</span><label class="degen-switch"><input type="checkbox" id="chk-degen-resample"><span class="degen-slider"></span></label><span class="degen-toggle-label" id="degen-label-smc">SMC</span></span> <button id="btn-degen-rerun" style="font-size:0.8em;">Re-run</button> <span id="degen-info" style="font-size:0.8em; margin-left:4px;"></span><br>**Particle weight evolution.**<br>Bars show normalized weights $\normwt_t^\idx$ at each step $t$ in a bootstrap particle filter.^[Illustrated for a Gaussian random walk model: $\state_t \sim \mathcal{N}(\state_{t-1}, 1)$; $y_t \sim \mathcal{N}(\state_t, 0.25)$; $y_t{=}2$.] Click a particle to trace its lineage, or click a timestep label to see all ancestors. *<span id="degen-caption"></span>*

This weight degeneracy issue is one key motivation for SMC, which generalizes from SIS by the addition of **resampling** steps. Resampling replaces a current set of particles (potentially with degenerate weights) with a new set of samples with weights all set to be equal, duplicating high-weight particles and dropping low-weight ones. This addresses weight degeneracy, but introduces a different problem: **path degeneracy**.^[I'm getting this terminology for the two kinds of degeneracy from the excellent @naesseth.c:2019 [Chapter 2]. They note that *adaptive resampling* can be a partial mitigation for path degeneracy. Only resample when the effective sample size $\text{ESS} = 1/\sum_\idx (\normwt^\idx)^2$ (which ranges from 1 when one particle has all the weight to $\np$ when weights are uniform) drops below a threshold (e.g., $\np/2$), rather than at every step. In this post I want to focus just on what happens when we _do_ resample, rather than on when to resample, but the ESS values in the illustration can give a sense of when resampling would be triggered in an adaptive resampling method.]
After enough steps, all current particles may trace back to a single ancestor at earlier timesteps [*click on a timestep label in the illustration to see ancestry*].

Adding resampling can keep our particle approximation useful (fixing SIS's weight degeneracy problem), but the method we use to resample can affect both the variance of our estimates and how quickly path diversity is lost. The rest of this post explores several resampling methods, visualizes their differences, to help build intuition for why some would perform better than others.

### The first-moment (unbiasedness) condition

For any resampling method to be unbiased, the expected number of copies made of each particle must be proportional to its weight. That is, $\cnt^\idx\sim r$ be the number of copies of particle $\idx$ after
resampling (writing $r$ for the resampling method, some distribution over nonnegative integers, conditioned on the current set of weighted particles)

$$\E_{r}[\cnt^\idx] = \np \normwt^\idx \quad \text{for all } \idx$$

This ensures that the equally-weighted resampled particles
$\sum_{\idx=1}^{\np} \frac{1}{\np} f(\rstate^\idx)$ form an unbiased estimator of the original weighted sum
$\sum_\idx \normwt^\idx f(\state^\idx)$.

We'll focus on visualizing and understanding four canonical methods: **multinomial**, **stratified**, **systematic**, and **residual** resampling.^[These methods all satisfy this 'first-moment condition.' However, higher moments can differ greatly between schemes (as we'll see, looking at variance).]


## 2. Inverse transform sampling

The first methods we'll look at share the same core idea of [inverse transform sampling](https://en.wikipedia.org/wiki/Inverse_transform_sampling). We can think of partitioning the unit interval into
segments of width $\normwt^\idx$, and mapping from 'probe' locations on the unit interval to determine the resampled particles.
More precisely, the cumulative distribution function (CDF) of the discrete distribution defined by the weights, $\cdf(\idx) = \sum_{j=1}^{\idx} \normwt^j$, defines this partition, and its inverse (the quantile function) it will map a value $\probe\in(0,1]$ to a selected (resampled) particle $\invcdf(\probe)$.

If you haven't heard of inverse transform sampling before, this is actually a nice way to build the intuition. Think about **how to randomly place $\np$ probes** so that any particle
$i$ gets selected $\np\normwt^\idx$ times on average. Try clicking
on the CDF plot at right to place probes, and consider what strategy would you use for placing $\np$ probes, in order to have the distribution of resampled particles recreate the weight histogram on average.

**Drag bars** on left to change weights, or choose preset from dropdown. **Click on plot** to place 'probes.'

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

You may have found that the most natural idea is to use $\np$ independent draws from the uniform distribution.^[That is, inverse transform sampling. A little while ago, I made another [post exploring density transformations](/posts/transform-pdf/) in the continuous case. Here we are doing this in a discrete setting: Each uniform-distributed independent probe $\probe_k$ is transformed through the discrete quantile function $\invcdf$ to produce a sample from the particle-weight distribution, just as passing a uniform draw through a continuous inverse CDF yields a draw from the corresponding distribution.]
This works, and leads to the first standard algorithm, **multinomial resampling**.
We will then look at two other common strategies that reduce variance by spreading probes more evenly for lower variance.

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

::: {.fullwidth}
(Equivalent to `np.random.choice(N, size=N, replace=True, p=weights)`)
:::


<!-- 
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

</details> -->

Click **Resample once** to see the counts fluctuate; **Run
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

<div class="callout proof">
<span class="proof-label">Unbiasedness.</span>
Each probe $\probe_k$ is independently $\mathrm{Uniform}(0,1)$, so it
lands in particle $\idx$'s CDF segment (of width $\normwt^\idx$) with
probability $\normwt^\idx$. With $\np$ independent probes,
$\cnt^\idx \sim \mathrm{Binomial}(\np, \normwt^\idx)$ and
$\E[\cnt^\idx] = \np\,\normwt^\idx$. ∎
</div>


### Stratified resampling

You may have noticed that because the probes are all independently sampled in multinomial resampling, they can cluster and leave gaps. This leads to undesirable extra variance. 
*Stratified resampling* introduces a technique to spread them more evenly: Partition $[0,1]$ into $\np$ equal
**strata** $\bigl(\frac{k-1}{\np},\, \frac{k}{\np}\bigr)_{k=1}^{\np}$
and draw one independent uniform within each, resulting in lower variance.^[See @douc.r:2005 for proof that $\Var_{\text{strat}} \leq \Var_{\text{mult}}$.]

```python
# Steps 1 & 3 as above; only step 2 changes:
# one uniform draw per stratum instead of N independent
positions = (random(N) + range(N)) / N
```

::: {.callout .insight}
Each stratum gets exactly one probe, so we can bound the counts
$\lfloor \np\normwt^\idx \rfloor \leq \cnt^\idx \leq \lceil \np\normwt^\idx \rceil$.
:::

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

<div class="callout proof">
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

Notice that stratified resampling still uses $\np$ random draws to place the probe in each stratum. Another standard technique called *systematic resampling* uses just **one** random value, and places all the probes based on that single offset: Draw $U \sim \mathrm{Uniform}(0, 1/\np)$ and set
$\probe_k = U + (k{-}1)/\np$. 

The probes form an equally-spaced comb. **Drag the green handle** to slide it, or click **Random offset** to sample.

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

<div class="callout proof">
<span class="proof-label">Unbiasedness.</span>
The offset $U$ is $\mathrm{Uniform}(0, 1/\np)$, so each probe
$\probe_k = U + (k{-}1)/\np$ is marginally
$\mathrm{Uniform}\bigl(\frac{k-1}{\np},\, \frac{k}{\np}\bigr)$, the
same distribution as the stratified probe in stratum $k$. The
same tiling argument gives $\E[\cnt^\idx] = \np\,\normwt^\idx$.∎
</div>

Note that the probes are no longer independent. A single $U$
determines all of them. The marginal distributions are identical
to stratified, so unbiasedness holds, but the joint distribution
differs (and so also the variance).

### ⚠︎ Systematic can be higher variance than multinomial

@douc.r:2005 [Section 3.4] give the following counterexample to the 
"frequently encountered conjecture that systematic resampling 
dominates multinomial resampling in terms of conditional variance."
It's an example showing that the correlation becomes pathological when 
$f$ aligns with a periodic weight pattern matching the comb spacing.


With alternating weights (high, low, high, low, ...) and
$f(\state^\idx) = \mathbf{1}[\idx \text{ even}]$, the comb teeth
land either all on even or split evenly---producing a
**bimodal** estimator. The systematic variance is
$(\normwt_{\mathrm{even}}-\tfrac{1}{2})(1-\normwt_{\mathrm{even}})$,
**constant in $\np$**, while multinomial's decreases as
$\normwt_{\mathrm{even}}(1 - \normwt_{\mathrm{even}})/\np$.

To see this in action, set $f$ to $\mathbf{1}[\idx \text{ even}]$ and weights to "Alternating" in the head-to-head comparison (Section 5), and observe that the systematic estimator variance is larger than multinomial's. Try switching to other test functions (e.g., mean position) to see the effect vanish when $f$ is not aligned with the weight periodicity.

**Note.** This counterexample depends on the particle ordering.^[@douc.r:2005 [Section 3.4] observe that both stratified and systematic resampling are sensitive to particle ordering: permuting the indices before resampling changes the distribution of the resampled set. After random permutation, systematic resampling becomes empirically similar to residual/stratified. They conclude that the counterexample is likely a "rare" situation, but that it shows systematic resampling is not as robust a variance-reduction method as stratified or residual, and that its theoretical analysis is considerably harder.]

## 4. Residual resampling

We could also consider a deterministic-stochastic hybrid, 
where some particles are deterministically set, and others are allocated randomly. 
In *residual resampling*, we give particle $\idx$ exactly
$\lfloor \np\normwt^\idx \rfloor$ copies, then fill the remaining
$R = \np - \sum_\idx \lfloor \np\normwt^\idx \rfloor$ slots by resampling
on the **residual weights**
$\resid^\idx = (\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor)/R$. This nondeterministic part of the algorithm could be done using any of the three CDF methods (select below).^[{-} $\Var_{\text{resid}} \leq \Var_{\text{mult}}$ when phase 2 uses multinomial or stratified resampling [@douc.r:2005]. The deterministic phase removes variance for the integer parts; the phase-2 choice affects only the residual variance. Note that residual-systematic does not have this guarantee, since systematic resampling can hit the same counterexample on the residual weights.] The right plot shows the residual CDF (solid) overlaid on the original weights CDF (dotted). For highly skewed weights, you can see that first allocating the deterministic weights makes the residual CDF much more even than the original was.


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

<div class="callout proof">
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
mean count $\pm$ 1 std over $K$ trials.

<div class="control-box">
<div class="control-row">
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-K-all" min="100" max="10000" value="1000" step="100" style="width:120px; vertical-align:middle;">
<span id="val-K-all">1000</span></label>
<button id="btn-run-all" style="font-weight:600;">Run all four</button>
<span style="flex:1;"></span>
<button id="btn-set-counterexample" style="font-size:0.85em;">Douc et al. counterexample</button>
<button id="btn-reset-counterexample" style="font-size:0.85em; display:none;">Reset</button>
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
| $\Var \leq \Var_{\text{mult}}$? | baseline | always | not guaranteed | mult/strat phase 2; not syst |
| $\|\cnt^\idx - \np\normwt^\idx\|$ bound | up to $\np$ | $\leq 1$ | $\leq 1$ | phase-2 dependent |
| Random draws | $\np$ | $\np$ | 1 | $R \leq \np$ |


## 6. Other resampling schemes

The four methods above are the most widely used, but they are
not the only options.

### Branch-kill resampling

The methods above all produce exactly $\np$ resampled particles.
Branch-kill relaxes this: Each particle $\idx$ independently gets
$\lfloor \np\normwt^\idx \rfloor$ deterministic copies plus one bonus
copy with probability $\np\normwt^\idx - \lfloor \np\normwt^\idx \rfloor$.
No shared CDF or residual phase needed.
The total $\sum_\idx \cnt^\idx$ fluctuates around $\np$ rather than
equalling it exactly.

```python
# For each particle independently:
num_copies = np.floor(N * weights)
p_bonus = N * weights - num_copies # fractional part
u = np.random.rand(N)    # one uniform draw per particle
bonus = (u >= 1 - p_bonus)    # inverse CDF: right of step → bonus
num_copies += bonus # total may differ from N
```



<div class="callout proof">
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
  $0.5/\np$, vanishing as $\np$ grows). See @li.t:2015.

- **Optimal transport resampling.** Rather than mapping through a
  CDF, one can frame resampling as a discrete optimal transport
  problem, minimizing the expected distance between the original
  and resampled particle positions. This preserves spatial
  structure better than CDF-based methods but is more expensive.


## 7. Resampling methods in action

To see how the choice of resampling method affects particle diversity in practice, here is the same random walk model from the introduction, now with a method selector.

<details style="font-size:0.85em; color:#555; margin:0.3em 0 0.8em;">
<summary style="cursor:pointer; color:#444;">Model details</summary>
<p style="margin:0.4em 0;">
<strong>State-space model</strong> (Gaussian random walk):
Transition $\state_t \mid \state_{t-1} \sim \mathcal{N}(\state_{t-1},\, 1)$.
Observation $y_t \mid \state_t \sim \mathcal{N}(\state_t,\, 0.25)$.
All observations fixed at $y_t = 2$.
</p>
<p style="margin:0.4em 0;">
<strong>Bootstrap particle filter</strong>:
Proposal $= $ transition (prior).
Weight update $\normwt_t^\idx \propto p(y_t \mid \state_t^\idx)$ (after resampling resets weights to $1/\np$).
</p>
</details>

<div class="control-box">
<div class="control-row">
<label style="font-size:0.85em; color:#555;">Resampling method:
<select id="select-pf-method" style="padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:1em;">
<option value="multinomial">Multinomial</option>
<option value="stratified">Stratified</option>
<option value="systematic">Systematic</option>
<option value="residual">Residual-multinomial</option>
</select></label>
<label style="font-size:0.85em; color:#555; margin-left:8px;"><input type="checkbox" id="chk-pf-seed"> Fix seed:
<input type="number" id="input-pf-seed" value="42" min="1" max="9999" style="width:50px; display:none; font-size:0.9em;">
</label>
<button id="btn-pf-rerun">Re-run</button>
</div>
</div>

<canvas id="cv-pf-compare" class="panel"></canvas>

<canvas id="cv-pf-diagnostics" style="width:100%; height:80px; border:1px solid #eee; border-radius:3px;"></canvas>

### Comparing methods over many runs

To see the typical behavior rather than a single random run, we can see what happens over many runs of the same method. The plot below shows path degeneracy (unique ancestors at t=1) over $K$ runs for all four methods. You can also the number of particles $\np$ (which we've fixed at $8$ for everything above).

We should see multinomial show worse path degeneracy than the lower-variance alternatives.

<div class="control-box">
<div class="control-row">
<label style="font-size:0.85em; color:#555;">$\np$:
<input type="range" id="slider-pf-N" min="4" max="256" value="50" step="2" style="width:80px; vertical-align:middle;">
<span id="val-pf-N">50</span></label>
<label style="font-size:0.85em; color:#555;">$K$:
<input type="range" id="slider-pf-K" min="10" max="1000" value="50" step="10" style="width:80px; vertical-align:middle;">
<span id="val-pf-K">50</span></label>
<button id="btn-pf-ktrials" style="font-weight:600;">Run K trials (all methods)</button>
</div>
</div>

<canvas id="cv-pf-ktrials" style="width:100%; height:250px; border:1px solid #ddd; border-radius:4px;"></canvas>
