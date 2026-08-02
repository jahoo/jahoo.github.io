---
title: Forward KL minimization with regularization
subtitle: I know, that is not a catchy title.
date: 2026-07-31
author: Jacob Hoover Vigly
tags: [exploration]
js:
  - src/anchored-kl
css:
  - assets/css/anchored-kl.css
mathjax-macros: assets/anchored-kl/macros.json
---

*What distribution does forward-KL training actually aim at, if you include a reverse-KL-to-the-prior regularization term?*

Suppose we're interested in training a probability distribution $\proposal(\str)$ to be like a target distribution $\posterior(\str)$, in a posterior inference setting, where that target (posterior) is defined as *prior* $\prior$ shaped by a *potential* (likelihood) function $\potential \ge 0$. That is,
$$
\posterior(\str) \defeq \frac{\prior(\str)\,\potential(\str)}{\Z},
\qquad
\Z \defeq \sum_{\str} \prior(\str)\,\potential(\str).
$$
We'll suppose we have access to $\prior$ and $\potential$, but not to the normalized $\posterior$, and we're trying to learn $\proposal$ to minimize the forward KL divergence
$$
\KL{\posterior}{\proposal}.
$$

In an unconstrained setting, that's obviously minimized at $\proposal = \posterior$. But, if learning dynamics make this unstable to approach,^[TODO: flesh out why that might be the case. For now, just take it as a fact.] one thing that has worked in practice is to instead minimize the objective with a reverse-KL regularizer penalizing a proposal that strays from the prior:
$$
\mathcal{L}_\beta(\proposal) \defeq \KL{\posterior}{\proposal} + \beta\,\KL{\proposal}{\prior},
\qquad \beta > 0
$$
(usually with $\beta$ some small positive value). We can call this the **prior-regularized**, or **prior-anchored**, objective.^[The anchor direction is the *reverse* KL to the prior, the same penalty used in KL-regularized RLHF fine-tuning.] This regularization shifts the optimal solution somewhat away from being precisely the posterior, toward things that are closer to the prior, to some optimum proposal, denoted as
$$
\proposal^\star_\beta \defeq \operatorname{argmin}_{\proposal}\, \mathcal{L}_\beta(\proposal).
$$
The question that motivates this note is: **What distribution is this $\proposal^\star_\beta$?** Well, one thing that's immediately clear is, at $\beta = 0$ we return to the un-regularized setting, and $\proposal^\star_\beta = \posterior$.^[And of course, in the other extreme  $\proposal^\star_\beta\to\prior$ as $\beta\to\infty$.] What is the solution for general $\beta \in (0, \infty)$?

# With a binary potential

Assume for now that the potential $\potential$ is a **binary** function: It partitions the support of $\prior$ into two bins---the set $\valid \defeq \{\str : \potential(\str) = 1\}$ of *valid* elements, and its complement, $\validc$, the *invalid* ones, where $\potential = 0$.  Our posterior inference problem is then one of **conditioning on the event of validity**, with $\Z = \prior(\valid)$ being the total probability of the valid set under the prior.

Let's give names to the two distributions this structure singles out --- both proportional to the prior, each supported on one of the two disjoint bins:

- the **posterior** $\vposterior \defeq \prior(\cdot \mid \potential{=}1)$: proportional to $\prior$ on $\valid$, and zero elsewhere. This is exactly our target $\posterior$ --- within this section, let's write it in the color of the set that carries it;
- the "**antiposterior**" $\antiposterior \defeq \prior(\cdot \mid \potential{=}0)$: proportional to $\prior$ on $\validc$, and zero elsewhere --- the posterior for the *complemented* potential $1 - \potential$, i.e., what conditioning on being *invalid* would give.

The prior itself is a mixture of the two: $\prior = \Z\,\vposterior + (1 - \Z)\,\antiposterior$.

It turns out the minimizer of the anchored objective in this case has quite a simple form: it also lies on the segment between the posterior and the antiposterior,
$$
\proposal^\star_\beta \;=\; \alpha_\beta\,\vposterior \,+\, (1 - \alpha_\beta)\,\antiposterior,
$$
with some mixture weight $\alpha_\beta \defeq \proposal^\star_\beta(\valid)$.^[You might ask, wait, isn't this circular... describing the optimum via a weight that is itself defined in terms of the optimum? Yes, but harmlessly so: The substantive claim carried by the equation is that $\proposal^\star_\beta$ lies on this *segment*. Everything the segment doesn't determine is packed into the single unknown scalar $\alpha_\beta$, which we pin down next --- and which, it will turn out, depends on the prior and potential only through the total valid mass $\Z$; the within-bin shapes never enter.]

Why must the optimum lie on this segment? To see, think of describing the distribution by answering two questions: (1) How much mass $\alpha \defeq \proposal(\valid)$ does it gives to the event of validity (versus the remaining $1-\alpha$ that is given to its complement $\validc$), and (2) how does it spread mass *within* each of these two bins. The within-bin part turns out to be easy: 

- on $\valid$, the forward KL pulls $\proposal(\cdot \mid \valid)$ toward the posterior while the anchor pulls it toward $\prior(\cdot \mid \valid)$ ...but those are the *same distribution*! Both are $\vposterior$.
- on $\validc$, only the anchor has a preference, namely it pulls toward $\antiposterior$. 

So the optimum solution matches both bin shapes exactly --- which is just to say it lies on the segment. All that's left to decide is the single number $\alpha$: how much weight to put on the valid set. And *here* the two terms of the objective genuinely disagree: the forward KL wants $\alpha$ pushed all the way up to $1$ (the posterior's value), while the anchor wants it held down at $\Z$ (the prior's). Balancing them is a one-variable calculus problem (worked out in the folded derivation below), and its solution --- the optimal weight --- is the value $\alpha_\beta$ satisfying
\begin{equation}\label{eq:alpha-fixed-point}
\alpha_\beta = \frac{\Z}{\Z + e^{-1/(\alpha_\beta \beta)}\,(1 - \Z)}.
\end{equation}
The weight appears on both sides of this equation, but consistently so: the right-hand side is continuous and strictly decreasing in $\alpha_\beta$, so exactly one value satisfies it.^[This is also how the visualization below computes $\alpha_\beta$: bisection on the difference between the two sides of this equation, which changes sign exactly once on $(\Z, 1)$.]

<details style="font-size:0.9em; margin:0.3em 0 1.2em;">
<summary style="cursor:pointer; color:#444;">Derivation of the optimum $\proposal^\star_\beta$</summary>

**Goal.** Minimize $\mathcal{L}_\beta(\proposal) = \KL{\vposterior}{\proposal} + \beta\,\KL{\proposal}{\prior}$ over all distributions $\proposal$ on the support of the prior, and show that the minimizer is the mixture $\alpha_\beta\,\vposterior + (1 - \alpha_\beta)\,\antiposterior$, with the weight $\alpha_\beta$ given by $\eqref{eq:alpha-fixed-point}$ of the main text.

**Step 1: reduce to the segment.** Write $\alpha \defeq \proposal(\valid)$. Both KL terms decompose over the partition $\{\valid, \validc\}$ (the chain rule for KL: the divergence between the bin masses, plus the mass-weighted divergences within bins):

For the forward KL, the sum runs over $\valid$ only, and there the proposal factors into bin mass times within-bin shape:

$$
\begin{aligned}
\KL{\vposterior}{\proposal}
&= \sum_{\str \in \valid} \vposterior(\str)\, \log\frac{\vposterior(\str)}{\proposal(\str)}
&& \explain{$\vposterior$ puts mass $1$ on $\valid$}
\\[6pt]
&= \sum_{\str \in \valid} \vposterior(\str)\, \log\frac{\vposterior(\str)}{\alpha\,\proposal(\str \mid \valid)}
&& \explain{$\proposal(\str) = \alpha\,\proposal(\str \mid \valid)$ on $\valid$}
\\[6pt]
&= \log\frac{1}{\alpha}
+ \KL{\vposterior}{\proposal(\cdot \mid \valid)}
&& \explain{split the log; $\vposterior(\valid) = 1$}
\end{aligned}
$$

For the anchor, both bins contribute; factor each side into bin mass times within-bin shape ($\prior = \Z\,\vposterior$ on $\valid$ and $(1{-}\Z)\,\antiposterior$ on $\validc$):

$$
\begin{aligned}
\KL{\proposal}{\prior}
&= \sum_{\str \in \valid} \alpha\,\proposal(\str \mid \valid)\, \log\frac{\alpha\,\proposal(\str \mid \valid)}{\Z\,\vposterior(\str)}
\;+ \sum_{\str \in \validc} (1{-}\alpha)\,\proposal(\str \mid \validc)\, \log\frac{(1{-}\alpha)\,\proposal(\str \mid \validc)}{(1{-}\Z)\,\antiposterior(\str)}
\\[6pt]
&= \alpha \log\frac{\alpha}{\Z}
+ (1{-}\alpha) \log\frac{1{-}\alpha}{1{-}\Z}
+ \alpha\,\KL{\proposal(\cdot \mid \valid)}{\vposterior}
+ (1{-}\alpha)\,\KL{\proposal(\cdot \mid \validc)}{\antiposterior}
&& \explain{split the logs; each conditional sums to $1$}
\\[6pt]
&= d(\alpha \,\|\, \Z)
+ \alpha\,\KL{\proposal(\cdot \mid \valid)}{\vposterior}
+ (1{-}\alpha)\,\KL{\proposal(\cdot \mid \validc)}{\antiposterior}
&& \explain{the leading terms are a Bernoulli KL}
\end{aligned}
$$

with $d(\alpha \,\|\, \Z) \defeq \alpha \log\frac{\alpha}{\Z} + (1-\alpha)\log\frac{1-\alpha}{1-\Z}$, the KL between the Bernoulli distributions $(\alpha, 1{-}\alpha)$ and $(\Z, 1{-}\Z)$. Collecting the objective:

$$
\begin{aligned}
\mathcal{L}_\beta(\proposal)
&= \KL{\vposterior}{\proposal} + \beta\,\KL{\proposal}{\prior}
&& \explain{the anchored objective}
\\[6pt]
&= \log\frac{1}{\alpha} + \beta\, d(\alpha \,\|\, \Z)
\\
&\qquad + \KL{\vposterior}{\proposal(\cdot \mid \valid)}
+ \beta\,\alpha\, \KL{\proposal(\cdot \mid \valid)}{\vposterior}
+ \beta\,(1{-}\alpha)\, \KL{\proposal(\cdot \mid \validc)}{\antiposterior}
&& \explain{substitute the two decompositions}
\\[6pt]
&= f(\alpha)
+ \underbrace{\KL{\vposterior}{\proposal(\cdot \mid \valid)} + \beta\,\alpha\, \KL{\proposal(\cdot \mid \valid)}{\vposterior}}_{\ge\, 0}
+ \underbrace{\beta\,(1{-}\alpha)\, \KL{\proposal(\cdot \mid \validc)}{\antiposterior}}_{\ge\, 0}
&& \explain{define $f(\alpha) \defeq \log\frac{1}{\alpha} + \beta\, d(\alpha \| \Z)$}
\end{aligned}
$$

The trailing terms vanish exactly when $\proposal(\cdot \mid \valid) = \vposterior$ and $\proposal(\cdot \mid \validc) = \antiposterior$ --- choices that don't touch $f(\alpha)$. So, for each fixed weight $\alpha$, the best proposal is the segment point $\alpha\,\vposterior + (1 - \alpha)\,\antiposterior$, and its objective value is $f(\alpha)$: the forward KL charges the log-loss of the valid event, and the anchor charges the KL between the two ways of splitting mass across the bins.

**Step 2: minimize over the weight.** What's left is a one-variable problem: minimize $f$ over $\alpha \in (0, 1]$.

$$
\begin{aligned}
f'(\alpha)
&= -\frac{1}{\alpha} + \beta\,\log\frac{\alpha\,(1 - \Z)}{\Z\,(1 - \alpha)}
&& \explain{$\tfrac{d}{d\alpha}\, d(\alpha \| \Z) = \log\frac{\alpha(1-\Z)}{\Z(1-\alpha)}$}
\\[6pt]
f''(\alpha)
&= \frac{1}{\alpha^{2}} + \beta\,\Bigl(\frac{1}{\alpha} + \frac{1}{1 - \alpha}\Bigr) \;>\; 0
&& \explain{$f$ strictly convex}
\end{aligned}
$$

Since $f'(\alpha) \to -\infty$ as $\alpha \to 0^{+}$ and $f'(\alpha) \to +\infty$ as $\alpha \to 1^{-}$, there is a unique interior minimizer $\alpha_\beta$, the root of $f'$. Both facts are visible live below for any *finite* $\beta$: $f$ falls and then rises (top panel), so the strictly increasing $f'$ climbs through zero exactly once (bottom panel) --- at the marked point, $\alpha_\beta$, strictly between $\Z$ and $1$. Move $\beta$ and watch the balance shift: small $\beta$ leaves the minimizer pinned near the posterior's $\alpha = 1$; large $\beta$ drags it toward the prior's $\alpha = \Z$. (It is the same $\beta$ --- and the same valid mass $\Z$ --- as in the visualization further below; the marker is draggable. At the $\beta = 0$ endpoint $f$ collapses to $\log\frac{1}{\alpha}$, falling all the way to the boundary minimizer $\alpha = 1$ ($f'$ never reaches zero); at the $\beta = \infty$ endpoint the panels show the normalized limit $f/\beta = d(\alpha \,\|\, \Z)$, whose minimum sits at $\alpha = \Z$.)

::: {.viz #cv-akl-f canvas="true" height="280px" width="100%"}
:::

<div class="akl-controls akl-sticky">
<span class="akl-controls-label">$\beta$:</span>
<div class="akl-slider-wrap">
<input type="range" id="akl-beta-f" min="0" max="1000" value="425">
<div class="akl-slider-ticks"><span>0</span><span>1</span><span>∞</span></div>
</div>
<div class="akl-readouts">
<div><span class="akl-controls-label">$\beta$ =&nbsp;</span><span id="akl-readout-beta-f">0.5</span></div>
</div>
</div>

Setting $f'(\alpha_\beta) = 0$ and rearranging describes that marked point as a fixed point:

$$
\begin{aligned}
\frac{1}{\alpha_\beta\, \beta}
&= \log\frac{\alpha_\beta\,(1 - \Z)}{\Z\,(1 - \alpha_\beta)}
&& \explain{$f'(\alpha_\beta) = 0$, divided by $\beta$}
\\[6pt]
\alpha_\beta
&= \frac{\Z}{\Z + e^{-1/(\alpha_\beta \beta)}\,(1 - \Z)}
&& \explain{exponentiate; solve for $\alpha_\beta$}
\end{aligned}
$$

Two sanity checks: $f'(\Z) = -1/\Z < 0$, so $\alpha_\beta > \Z$ for every finite $\beta$ --- the anchored optimum always conditions strictly harder than the prior; and as $\beta \to 0$, $f \to \log\frac{1}{\alpha}$, minimized at $\alpha = 1$ --- the posterior.

**Conclusion.** The minimizer of $\mathcal{L}_\beta$ is exactly
$$
\proposal^\star_\beta \;=\; \alpha_\beta\,\vposterior \,+\, (1 - \alpha_\beta)\,\antiposterior,
\qquad
\alpha_\beta = \frac{\Z}{\Z + e^{-1/(\alpha_\beta \beta)}\,(1 - \Z)} \;\in\; (\Z, 1)
$$
describing the segment point at the fixed-point weight, as claimed.

</details>

<details style="font-size:0.9em; margin:0.3em 0 1.2em;">
<summary style="cursor:pointer; color:#444;">Aside: Solving the fixed point in closed form (with the Lambert $W$)</summary>

Equation $\eqref{eq:alpha-fixed-point}$ is transcendental---no 'elementary' closed form solution for $\alpha_\beta$ exists, but it does untangle into the [**Lambert $W$ function**](https://en.wikipedia.org/wiki/Lambert_W_function), the inverse of $w \mapsto w\,e^{w}$:

$$
\begin{aligned}
\Bigl(\frac{1}{\alpha_\beta} - 1\Bigr)\, e^{1/(\alpha_\beta \beta)}
&= \frac{1-\Z}{\Z}
&& \explain{rearrange $\eqref{eq:alpha-fixed-point}$}
\\[6pt]
\bigl(\frac{1}{\alpha_\beta} - 1\bigr)\frac{1}{\beta}\; e^{(\frac{1}{\alpha_\beta} - 1)\frac{1}{\beta}}
&= \frac{1-\Z}{\Z\,\beta}\; e^{-1/\beta}
&& \explain{divide both sides by $\beta\, e^{1/\beta}$}
\\[6pt]
s\, e^{s}
&= \frac{1-\Z}{\Z\,\beta}\; e^{-1/\beta}
&& \explain{let $s \defeq \bigl(\frac{1}{\alpha_\beta} - 1\bigr)\frac{1}{\beta}$}
\\[6pt]
s
&= W_0\!\Bigl(\frac{1-\Z}{\Z\,\beta}\, e^{-1/\beta}\Bigr)
&& \explain{invert $s \mapsto s\,e^{s}$}
\\[6pt]
\alpha_\beta
&= \frac{1}{1 + \beta\, W_0\!\Bigl(\dfrac{1-\Z}{\Z\,\beta}\, e^{-1/\beta}\Bigr)}
&& \explain{solve for $\alpha_\beta$}
\end{aligned}
$$

The argument of $W$ is positive, so this lands on the principal branch $W_0$, where the solution is unique (the same uniqueness that strict convexity of $f$ gave above).

</details>

<details style="font-size:0.9em; margin:0.3em 0 1.2em;">
<summary style="cursor:pointer; color:#444;">Aside: How the weight $\alpha_\beta$ moves with $\beta$</summary>

It slides monotonically from $1$ at $\beta = 0$ (recovering $\vposterior$) down to $\Z$ as $\beta \to \infty$ (recovering $\prior$, which sits on the same segment at weight $\Z$) --- but very asymmetrically. Equation $\eqref{eq:alpha-fixed-point}$ says the *odds* of invalidity under the optimum are the prior odds, discounted:
$$
\frac{1 - \alpha_\beta}{\alpha_\beta} \;=\; e^{-1/(\alpha_\beta \beta)}\; \frac{1-\Z}{\Z}.
$$
For small $\beta$ (where $\alpha_\beta \approx 1$) the discount factor is $\approx e^{-1/\beta}$, exponentially small --- at $\beta = \tfrac{1}{2}$ the invalid set keeps at most $e^{-2} \approx 0.14$ of its prior odds; at $\beta = 0.1$, only $e^{-10} \approx 5 \times 10^{-5}$ --- giving the leading-order approximation
$$
1 - \alpha_\beta \;\approx\; \frac{1 - \Z}{\Z}\, e^{-1/\beta}
\qquad (\beta \to 0).
$$
At the other end, the approach to the prior is slow: $\alpha_\beta - \Z \approx (1 - \Z)\frac{1}{\beta}$ as $\beta \to \infty$.

Both regimes also fall out of the closed form of the previous aside in a single stroke: the argument of $W_0$ tends to $0$ at *both* ends of the $\beta$ axis, so the one expansion $W_0(u) \approx u$ covers them --- as $\beta \to 0$, $1 - \alpha_\beta \approx \beta\,W_0(\cdot) \approx \frac{1-\Z}{\Z}\, e^{-1/\beta}$, recovering the approximation above; and as $\beta \to \infty$, $\beta\,W_0(\cdot) \to \frac{1-\Z}{\Z}$, so $\alpha_\beta \to \Z$, with $\alpha_\beta - \Z \approx (1 - \Z)\frac{1}{\beta}$ at the next order.

</details>

**TL;DR**: 
Sliding $\beta$ from zero toward infinity, scales $\alpha_\beta$ from $1$ down toward $\Z$.
As $\beta$ increases, essentially softens the condition on validity in the optimum solution. For small $\beta$, the mass on the invalid set is *exponentially* small (so the optimum remains practially identical to the posterior), while at the other extreme, for very large $\beta$ the optimum approaches the prior only slowly.^[More precisely at the small-$\beta$ end $$1 - \alpha_\beta \approx \frac{1-\Z}{\Z}\, e^{-1/\beta}$$ and at the other end, $$\alpha_\beta - \Z \approx (1 - \Z)\frac{1}{\beta}$$$ (both of these approximations are worked out in the asides above; and the small-$\beta$ approximation is the dotted curve in the margin plot below).]

## Interactive visualization

<div class="akl-toolbar" id="akl-toolbar">
<details class="akl-k-dropdown">
<summary>$K$ = <span class="akl-toolbar-value" id="akl-readout-k">10</span></summary>
<div class="akl-k-panel">
<span class="akl-controls-label">support size $K$:</span>
<input type="range" id="akl-k" min="2" max="40" value="10">
</div>
</details>
<div class="akl-toolbar-group akl-toolbar-group-beta">
<span class="akl-controls-label">$\beta$:</span>
<div class="akl-slider-wrap">
<input type="range" id="akl-beta" min="0" max="1000" value="425">
<div class="akl-slider-ticks"><span>0</span><span>1</span><span>∞</span></div>
</div>
</div>
<div class="akl-readouts">
<div><span class="akl-controls-label">$\beta$ =&nbsp;</span><span id="akl-readout-beta">0.5</span></div>
<div><span class="akl-controls-label">$\alpha_\beta$ =&nbsp;</span><span id="akl-readout-alpha">–</span></div>
<div><span class="akl-controls-label">$\Z$ =&nbsp;</span><span id="akl-readout-z">–</span></div>
</div>
</div>

::: {.viz #cv-akl-main canvas="true" height="340px" width="100%"}
:::

As you slide $\beta$ between $0$ and $\infty$, mixture weight $\alpha_\beta$ interpolates between $1$ and $Z$.^[{-} `<canvas id="cv-akl-alpha" class="akl-alpha-canvas"></canvas>`{=html} *Live: $\alpha_\beta$ as a function of $\beta$ (log scale), for the $\Z$ currently configured in the visualization. The dot marks the selected $\beta$ (drag it --- it's the same $\beta$ as the slider); the dotted curve is the small-$\beta$ approximation $1 - \frac{1-\Z}{\Z}\,e^{-1/\beta}$; the dashed line is $\Z$, the $\beta \to \infty$ limit.*]
In the geometry of the mixture, the optimum $\proposal^\star_\beta$ lives on the segment between the posterior and the antiposterior. [Recall $\proposal^\star_\beta =\alpha_\beta\,\vposterior + (1 - \alpha_\beta)\,\antiposterior$.] Raising $\beta$ slides the optimum from the posterior toward the prior (as $\beta\to\infty$ weight $\alpha_\beta\to\Z$, and $\proposal^\star_\beta \to \prior = \Z\,\vposterior + (1 - \Z)\,\antiposterior$).

::: {.viz #cv-akl-segment canvas="true" height="90px" width="100%"}
:::


# A continuous potential

[Under construction...]

Next, let's explore how this works with a continuous $\potential$ rather than a binary one. It's really the same setting as above, but where above we assumed validity was a deterministic function of $\str$, here we let validity be a binary random variable $V$, with likelihood function $\str\mapsto\Pr(V=\mathtt{true} \mid \str)$ that takes values anywhere in $[0, 1]$, rather than only in $\{0, 1\}$.^[Requiring $\potential \le 1$ costs nothing relative to the intro's general $\potential \ge 0$: scaling the potential by a positive constant changes neither the posterior nor the anchored optimum (the objective depends on $\potential$ only through $\posterior$), so any bounded potential can be rescaled into $[0, 1]$.]

In this more general setting the two-bin structure is gone: Validity no longer sharply partitions the support into valid and invalid regions. Any given $\str$ may be valid with some probability, so there is no valid set to restrict to, and no posterior--antiposterior segment. We'll need a *per-element* description of the optimum instead. 

Here is the binary-case optimum from above, rewritten element by element:
$$
\proposal^\star_\beta(\str) \;\propto\; \prior(\str)\,\max\{\potential(\str),\, \varepsilon_\beta\},
\qquad
\varepsilon_\beta \defeq e^{-1/(\alpha_\beta \beta)},
$$
with $\alpha_\beta$ the mixture weight from before (and $\varepsilon_\beta \approx e^{-1/\beta}$, since $\alpha_\beta$ is close to $1$ for small $\beta$). Read this way, the anchored optimum is itself the *exact* posterior of a modified inference problem: Take the same prior, use a *softened* potential, defined by flooring it at $\varepsilon_\beta$. Where hard conditioning multiplies invalid elements' prior mass by $0$, anchoring multiplies it by $\varepsilon_\beta$.^[In log space, a multiplicative factor is an additive penalty: multiplying an element's mass by $\varepsilon_\beta$ shifts its log-probability down by $\log(1/\varepsilon_\beta) = 1/(\alpha_\beta\beta)$ nats, relative to the prior (before renormalization). So being invalid is no longer *forbidden* (an infinite log-penalty, mass multiplied by $0$) but comes at a cost of $1/(\alpha_\beta\beta)$ nats: This price blows up as $\beta \to 0$ (recovering hard conditioning) and vanishes as $\beta \to \infty$ (leaving the prior untouched).]

<details style="font-size:0.9em; margin:0.3em 0 1.2em;">
<summary style="cursor:pointer; color:#444;">Derivation: minimizing $\mathcal{L}_\beta$ pointwise, via the Lagrangian</summary>

We minimize over all distributions on the support of $\prior$, so introduce a Lagrange multiplier for normalization (nonnegativity turns out to be slack --- see the end):

$$
\begin{aligned}
\mathcal{J}(\proposal, \lambda)
&\defeq \sum_{\str} \posterior(\str)\,\log\frac{\posterior(\str)}{\proposal(\str)}
+ \beta \sum_{\str} \proposal(\str)\,\log\frac{\proposal(\str)}{\prior(\str)}
+ \lambda\,\Bigl(\sum_{\str} \proposal(\str) - 1\Bigr)
&& \explain{Lagrangian of $\mathcal{L}_\beta$}
\\[6pt]
0 = \frac{\partial \mathcal{J}}{\partial\, \proposal(\str)}
&= -\frac{\posterior(\str)}{\proposal(\str)}
+ \beta\,\Bigl(\log\frac{\proposal(\str)}{\prior(\str)} + 1\Bigr)
+ \lambda
&& \explain{stationarity, term by term}
\\[6pt]
\frac{\posterior(\str)}{\proposal(\str)}
&= \beta\,\log\frac{\proposal(\str)}{\prior(\str)} + c
&& \explain{rearrange; $c \defeq \beta + \lambda$}
\end{aligned}
$$

Note this pointwise condition makes no use of the binary assumption --- it holds for any potential. For the binary case it splits into two branches. Off the valid set it pins the ratio to the prior:

$$
\begin{aligned}
0 &= \beta\,\log\frac{\proposal(\str)}{\prior(\str)} + c
&& \explain{$\posterior(\str) = 0$ for $\str \in \validc$}
\\[3pt]
\proposal(\str) &= e^{-c/\beta}\,\prior(\str)
&& \explain{a constant ratio to the prior on $\validc$}
\end{aligned}
$$

On the valid set, write $\rho(\str) \defeq \proposal(\str)/\posterior(\str)$; since $\posterior = \prior/\Z$ there, $\proposal/\prior = \rho/\Z$, and the condition becomes

$$
\begin{aligned}
\frac{1}{\rho(\str)} &= \beta\,\log\frac{\rho(\str)}{\Z} + c
&& \explain{substitute $\posterior = \prior/\Z$ on $\valid$}
\end{aligned}
$$

The left side is strictly decreasing in $\rho(\str)$ and the right side strictly increasing, so this equation has exactly one solution --- the *same* one for every $\str \in \valid$: the ratio $\rho$ is constant on $\valid$. Summing $\proposal = \rho\,\posterior$ over $\valid$ identifies the constant:

$$
\begin{aligned}
\proposal(\str) &= \alpha_\beta\,\posterior(\str) \quad \text{for } \str \in \valid,
\qquad \alpha_\beta \defeq \proposal(\valid)
&& \explain{since $\posterior(\valid) = 1$}
\end{aligned}
$$

It remains to combine the two branches and eliminate $c$:

$$
\begin{aligned}
1 - \alpha_\beta &= e^{-c/\beta}\,(1 - \Z)
&& \explain{normalization: sum the $\validc$ branch}
\\[6pt]
c &= \frac{1}{\alpha_\beta} - \beta\,\log\frac{\alpha_\beta}{\Z}
&& \explain{the $\valid$ branch, at $\rho = \alpha_\beta$}
\\[6pt]
\varepsilon_\beta
\defeq
\frac{e^{-c/\beta}}{\alpha_\beta/\Z}
&= e^{-1/(\alpha_\beta \beta)}
&& \explain{ratio of the two $\proposal/\prior$ levels; substitute $c$}
\end{aligned}
$$

So the stationary $\proposal$ is proportional to the prior at one level on $\valid$ ($\proposal/\prior = \alpha_\beta/\Z$) and at the relative level $\varepsilon_\beta$ below it on $\validc$ --- exactly $\proposal^\star_\beta \propto \prior \cdot \max\{\potential, \varepsilon_\beta\}$ --- and normalizing this form gives back $\alpha_\beta = \Z/(\Z + \varepsilon_\beta (1 - \Z))$: with $\varepsilon_\beta = e^{-1/(\alpha_\beta \beta)}$ just derived, exactly the fixed point found in the binary section.

Finally, this stationary point is the global minimum: $\mathcal{L}_\beta$ is strictly convex in $\proposal$ (the forward KL is convex in its second argument, and the reverse KL strictly convex in its first), the feasible set is convex, and the optimum is interior --- as any $\proposal(\str) \to 0$ the derivative tends to $-\infty$ on both branches, so no mass is pushed to the boundary.

</details>

<details style="font-size:0.9em; margin:0.3em 0 1.2em;">
<summary style="cursor:pointer; color:#444;">Recovering the mixture form from the per-element form</summary>

Assume the binary potential. On $\valid$ we have $\max\{\potential, \varepsilon_\beta\} = 1$, so $\proposal^\star_\beta \propto \prior$ there, with unnormalized block mass $\Z$; on $\validc$ we have $\max\{\potential, \varepsilon_\beta\} = \varepsilon_\beta$, giving unnormalized block mass $\varepsilon_\beta\,(1 - \Z)$. Normalizing,
$$
\proposal^\star_\beta(\valid) = \frac{\Z}{\Z + \varepsilon_\beta\,(1 - \Z)} = \alpha_\beta,
$$
(the fixed point once more), while *within* each block the conditional shape is untouched --- it is the prior's: $\proposal^\star_\beta(\cdot \mid \valid) = \prior(\cdot \mid \valid) = \vposterior$ and $\proposal^\star_\beta(\cdot \mid \validc) = \antiposterior$. Hence
$$
\proposal^\star_\beta = \alpha_\beta\,\vposterior + (1 - \alpha_\beta)\,\antiposterior.
$$

</details>


## Interactive visualization

<div class="akl-controls akl-sticky">
<details class="akl-k-dropdown">
<summary>$K$ = <span class="akl-toolbar-value" id="akl-c-readout-k">10</span></summary>
<div class="akl-k-panel">
<span class="akl-controls-label">support size $K$:</span>
<input type="range" id="akl-c-k" min="2" max="40" value="10">
</div>
</details>
<span class="akl-controls-label">$\beta$:</span>
<div class="akl-slider-wrap">
<input type="range" id="akl-c-beta" min="0" max="1000" value="425">
<div class="akl-slider-ticks"><span>0</span><span>1</span><span>∞</span></div>
</div>
<div class="akl-readouts">
<div><span class="akl-controls-label">$\beta$ =&nbsp;</span><span id="akl-c-readout-beta">0.5</span></div>
<div><span class="akl-controls-label">$\varepsilon_\beta$ =&nbsp;</span><span id="akl-c-readout-eps">–</span></div>
<div><span class="akl-controls-label">$\Z$ =&nbsp;</span><span id="akl-c-readout-z">–</span></div>
</div>
</div>

::: {.viz #cv-akl-c-main canvas="true" height="340px" width="100%"}
:::

Everything the anchor does here is carried by a single monotone curve.

::: {.viz #cv-akl-c-reshape canvas="true" height="260px" width="100%"}
:::

> The pointwise optimality condition determines the optimum as $\proposal^\star_\beta = \prior \cdot \rho(\potential)$ for one *increasing* function $\rho$. Elements enter only through their potential values. Normalizing $\rho$ by its value at $\potential = 1$ gives the **softened potential** $\tilde{\potential}$: The anchored optimum is the exact posterior for the potential $\tilde{\potential}(\potential)$. At $\beta = 0$ the curve is the identity (exact conditioning); as $\beta \to \infty$ it flattens toward the constant $1$ (the prior); in between it *floors* low potentials at $\tilde{\potential}(0) = \varepsilon_\beta$ and *compresses* high ones --- the continuous generalization of $\max\{\potential, \varepsilon_\beta\}$. Watch it above as you move $\beta$: the dotted diagonal is the identity $\tilde{\potential} = \potential$ (the $\beta = 0$ limit), the dashed line is the floor $\varepsilon_\beta$, and the dots mark the potential values configured above --- drag them along the curve to change the potential.
