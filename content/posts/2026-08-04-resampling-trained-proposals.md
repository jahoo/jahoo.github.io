---
title: Why resampling hurts, with naïve intermediate target
subtitle: Illustrating how a trained proposal can make resampling focus on precisely the wrong particles, unless the intermediate targets move with it
date: 2026-08-04
author: Mostly one-shotted by Claude Fable, steered a little by me
# tags: [exploration]
unlisted: true
standalone-page: true
js:
  - src/resampling-trained-proposals
css:
  - assets/css/resampling-trained-proposals.css
mathjax-macros: assets/resampling-trained-proposals/macros.json
---

*Resampling improves on standard importance sampling by allowing killing unpromising particles and cloning promising ones. But if you train a proposal to focus on promising prefixes, resampling under the standard intermediate targets starts doing the opposite: It preferentially kills exactly the prefixes the trained proposal steers toward! This post builds a small-scale example to illustrate this effect, and a fix.*^[{-} This relates to some other posts: [resampling schemes in SMC](/posts/smc-resampling/) for exploring mechanics of resampling itself, and [forward-KL training with an anchor](/posts/anchored-forward-kl/) for the proposal-training setting this arises in.]

<!-- 

Resampling reads a particle's current incremental weight as a forecast: heavy means "this prefix will matter, make copies," and light means "this prefix is overvalued, kill it." But an incremental weight is just bookkeeping, the weight corrects for how the proposal differs from the intermediate target, in terms of how they score what has already happened. Whether that bookkeeping also works as a forecast (expected future value) depends on how much the intermediate target knows about the future.

Suppose we're using a good (eg successfully-*trained*) proposal that deliberately oversamples actually-promising prefixes. The standard intermediate target, which is prior $\times$ "no error so far," knows nothing about the future so, every promising prefix the proposal favored more than the standard intermediate target looks **oversampled** (small weight) and every risky prefix the proposal avoided looks **undersampled** (large weight). Among live particles, weight $\propto 1/\text{promise}$: the forecast is not noisy — it is *backwards*. Resampling then dutifully rebuilds the **prior's** population, undoing precisely the steering that training paid for. In the extreme where the proposal is perfect, every particle's final weight ends at exactly $\Z$; the mid-flight weight spread is pure bookkeeping guaranteed to cancel at the end — and resampling converts it into irreversible kill/clone decisions, becoming the *only* source of error.

The fix: make the intermediate targets as knowledgeable as the proposal, by putting the proposal *in* them — intermediate target $\propto \proposal(\text{prefix}) \times \shape(\text{prefix})$. The incremental weight collapses to the shaping ratio, so resampling fires only on genuine news (a particle actually erred), and the prior-vs-proposal account is settled in one lump at $\eos$, where it can still correct the estimate but can no longer misdirect the genealogy. Final weights are unchanged and $\hat\Z$ stays unbiased: the fix is free.^[Intermediate targets are ours to choose; only the final target is pinned. This is the standard freedom in SMC, just usually spent elsewhere.] -->

# Setup

We want samples from a posterior over strings, $\posterior(\str) = \prior(\str)\,\potential(\str)/\Z$: a language-model prior $\prior$ reshaped by a potential $\potential(\str) \ge 0$ that scores complete strings. A proposal $\proposal$ generates candidates token by token; since $\potential$ only scores complete strings, a **shaping function** $\shape(\text{prefix}) \ge 0$ supplies intermediate feedback. In sequential importance sampling, extending a particle by token $x$ updates its weight by

$$
\impwt \;\gets\; \impwt \cdot \frac{\prior(x \mid \text{prefix})}{\proposal(x \mid \text{prefix})} \cdot \frac{\shape(\text{prefix}\,x)}{\shape(\text{prefix})},
$$

with $\potential/\shape$ replacing the shaping ratio at $\eos$ — so a live particle carries $\impwt = \prior\,\shape/\proposal$ (prefix probabilities), and a completed one carries the full importance weight regardless of $\shape$: shaping only decides *when* weight is realized. SMC adds resampling when the effective sample size drops. The ideal shaping function is the **twist** $\tshape(\text{prefix}) \defeq \mathbb{E}_{\prior}[\potential \mid \text{prefix}]$, the prior's expected future potential; a trained proposal approximates $\proposal \approx \prior \cdot \tshape / \Z$ in prefix probabilities.

## A toy setting

- **Vocabulary**: `<`, `>`, `¤` (end of string).
- **Prior**: uniform — $\prior(\mathtt{<}) = \prior(\mathtt{>}) = \prior(\eos) = \tfrac13$ in every context: the dumbest possible LM, with no free parameters.^[Memorylessness is convenience, not load-bearing: with a bigram prior everything below stays closed-form (the twist is still geometric in depth, with a last-token-dependent prefactor), and the pathology only gets stronger. The interactive panel below lets you set all three conditional distributions (after BOS, after `<`, after `>`), with a unigram/bigram toggle; unigram is the memoryless case.]
- **Potential**: $\potential(\str) = 1$ iff $\str$ is a balanced, nonempty bracket string.
- **Shaping**: $\shape(\text{prefix}) = 1$ iff the running depth never went negative — the naive "no error yet" check.

Two failure modes, which is what variable length buys: emitting `>` at depth 0 dies *mid-string* (shaping catches it — its genuine pruning role), while emitting `¤` at depth $> 0$ dies only *at the end* (invisible to shaping).^[The empty string is also invalid, so `¤` as the first token is an at-the-end death available from $t=0$.]

Everything is closed form — and for the uniform prior the constants come out golden. The twist depends only on depth, $\tshape(d) = \lambda^{d+1}$, where $\lambda$ solves $\lambda^2 - 3\lambda + 1 = 0$: that is, $\lambda = \tfrac{3-\sqrt5}{2} = 1/\varphi^2 \approx 0.382$, with $\varphi$ the golden ratio; and $\Z = \lambda - \tfrac13 \approx 0.049$. The optimal proposal $\proposal^*(x \mid \text{state}) \propto \prior(x)\,\tshape(\text{state after } x)$ is a three-row table whose nonzero entries are exactly $\lambda/3$ and $\tfrac{1}{3\lambda}$ (each row sums to one because $\lambda^2 + 1 = 3\lambda$):

| state | `<` | `>` | `¤` |
|---|---|---|---|
| start | $1$ | $0$ | $0$ |
| depth $0$, started | $\approx 0.13$ | $0$ | $\approx 0.87$ |
| depth $d \ge 1$ | $\approx 0.13$ | $\approx 0.87$ | $0$ |

— "open with probability ${\approx}0.13$; otherwise close, or stop when balanced." And the punchline identity: under the standard intermediate targets, a live particle at depth $d$ carries

$$
\impwt \;=\; \frac{\Z}{\tshape(d)} \;\propto\; \varphi^{2d},
\qquad\text{while its promise is}\qquad
\tshape(d) \;\propto\; \varphi^{-2d}.
$$

**The resampler prices a particle at exactly the reciprocal of its prospects.** Every unit of depth multiplies the apparent value by $\varphi^2 \approx 2.62$ and divides the true promise by the same factor: a depth-3 particle looks ${\approx}18\times$ more valuable than one about to close out a success, and is ${\approx}18\times$ less likely to deliver.

# Three algorithms

| | intermediate target | live increment | resampling fires |
|---|---|---|---|
| **SIS** | — (never resamples) | $\tfrac{\prior}{\proposal}\cdot\tfrac{\shape'}{\shape}$ | never |
| **SMC, prior targets** | $\prior \times \shape$ | $\tfrac{\prior}{\proposal}\cdot\tfrac{\shape'}{\shape}$ | on deaths *and* on the $\varphi^{2d}$ weight spread |
| **SMC, proposal targets** | $\proposal \times \shape$ | $\tfrac{\shape'}{\shape} \in \{0,1\}$ | only on deaths |

All three realize the same final weights (the deferred $\prior/\proposal$ lump lands at $\eos$ in the third), and all three give unbiased $\hat\Z$.

# When is it worst?

At the trained proposal, the live-particle weight under prior targets is exactly $\Z/\tshape(\text{state})$ — this is model-independent, since $\proposal^*(\text{prefix}) = \prior(\text{prefix})\,\tshape(\text{prefix})/\Z$. So the damage a resampling event can do is set by how **unequal the promise can be across concurrently live particles**: the dynamic range of the twist along trajectories the trained proposal actually visits. In the bracket model promise falls by the factor $\lambda$ — the probability that the *prior*, left to itself, ever cleanly retires one excess bracket — for every unit of depth, so two live particles a depth gap $\Delta$ apart are mispriced by $(1/\lambda)^{\Delta}$.

That knob is independent of the problem's difficulty. Fix $\prior(\eos) = 0.2$ and mirror the bracket probabilities: $\prior(\mathtt{<}), \prior(\mathtt{>}) = (0.25, 0.55)$ and $(0.55, 0.25)$ give the *same* $\Z = 0.039$ and nearly the same SIS error — but $1/\lambda = 1.5$ versus $3.3$. With the close-heavy prior, prior-target resampling at the trained proposal is essentially harmless (rel. std $0.001$ at $s = 1$, $M = 16$); with the open-heavy mirror it reaches $0.34$, against exactly $0$ for SIS and proposal targets, and at $s = 0.9$ it carries $12\times$ the variance of SIS. The general statement: **the standard targets hurt most when the work remaining to satisfy the potential is exactly the work the prior considers improbable** — the mispricing per unit of remaining work is the reciprocal of the prior's probability of doing that unit. (The interactive panel's "weight growth per depth" readout is this quantity; drag $\prior(\mathtt{<})$ above $\prior(\mathtt{>})$ and watch the crossover panel's gap blow up.)

# What the visualization shows

::: {.viz #viz-annotated height="470px"}
:::

**The pathology in one (hand-picked) run.** One lane per particle; color is depth (darker = deeper), band thickness is the particle's share of the resampling weight, `¤` marks completion. Top, prior-based targets: at the dashed cut, the deepest particle — the *least* promising, but the *heaviest* — is cloned **six** times, while three shallow particles on the verge of finishing are killed (×). Bottom, proposal-based targets under **identical randomness**: no weight-triggered resampling occurs, the three particles the other sampler killed all complete validly, and the one resampling event fires only to recycle slots whose particles had already died.

**Explore it yourself.** The interactive panel starts from the same run as the figure above; re-run draws fresh randomness. Hover any lane for a particle's exact state (depth, weight, share of pool). Not every run has a resampling event — at high $s$, prior-target events themselves become rare, though when they fire they are reliably perverse; lower $s$ or re-run to see more action.

::: {.viz #viz-trajectories height="380px"}
:::

::: {.viz #viz-crossover height="320px"}
:::

**Panel 2 — the crossover.** Training progress $s$ (proposal interpolating from prior to optimal) against the relative error of $\hat\Z$, three arms. Verified numbers behind it ($M = 8$ particles, $20{,}000$ runs; rel. std of $\hat\Z$, resampling events per run in parentheses):

| $s$ | SIS | SMC, prior targets | SMC, proposal targets |
|---|---|---|---|
| $0.0$ (untrained) | $1.56$ | $\mathbf{1.36}$ (0.81) | $\mathbf{1.39}$ (0.81) |
| $0.5$ | $0.49$ | $0.49$ (0.58) | $0.49$ (0.51) |
| $0.8$ | $0.23$ | $0.26$ (0.38) | $0.23$ (0.17) |
| $0.95$ | $0.10$ | $\mathbf{0.22}$ (0.70) — hurts, ${\approx}5\times$ the variance | $0.10$ (0.02) |
| $1.0$ (optimal) | $0$ (exact) | $\mathbf{0.24}$ (1.28) — resampling is the *only* error | $0$ (exact) |

Resampling helps an untrained proposal (it recycles the $95\%$ of prior rollouts that die), is a wash mid-training, and actively hurts a trained one — while proposal-based targets track the better regime at both ends, firing only on genuine deaths in between. At $s = 0.95$, the correlation between a live particle's weight and its true success probability at prior-target resampling events is $-0.91$; slots cloned from high-weight parents go on to succeed $95\%$ of the time, versus $97\%$ for low-weight parents.

The litmus test the toy makes visible: **resampling helps exactly when the intermediate targets know at least as much about the future as the proposal does.** Untrained proposal: the shaping check knows more — resample. Trained proposal: the proposal knows more — resampling on the prior's targets is vandalism. Moving the targets with the proposal makes the comparison never go stale.
