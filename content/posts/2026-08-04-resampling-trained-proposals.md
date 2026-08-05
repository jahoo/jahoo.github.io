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

*Resampling improves on plain importance sampling by killing unpromising particles and cloning promising ones. But once the proposal is trained, resampling under the standard intermediate targets does the opposite. It preferentially kills the prefixes the trained proposal steers toward. This post builds a small example of the effect, and of the fix.*^[{-} This relates to some other posts. See [resampling schemes in SMC](/posts/smc-resampling/) for the mechanics of resampling itself, and [forward-KL training with an anchor](/posts/anchored-forward-kl/) for the proposal-training setting this arises in.]

<!-- 

Resampling reads a particle's current incremental weight as a forecast: heavy means "this prefix will matter, make copies," and light means "this prefix is overvalued, kill it." But an incremental weight is just bookkeeping, the weight corrects for how the proposal differs from the intermediate target, in terms of how they score what has already happened. Whether that bookkeeping also works as a forecast (expected future value) depends on how much the intermediate target knows about the future.

Suppose we're using a good (eg successfully-*trained*) proposal that deliberately oversamples actually-promising prefixes. The standard intermediate target, which is prior $\times$ "no error so far," knows nothing about the future so, every promising prefix the proposal favored more than the standard intermediate target looks **oversampled** (small weight) and every risky prefix the proposal avoided looks **undersampled** (large weight). Among live particles, weight $\propto 1/\text{promise}$: the forecast is not noisy — it is *backwards*. Resampling then dutifully rebuilds the **prior's** population, undoing precisely the steering that training paid for. In the extreme where the proposal is perfect, every particle's final weight ends at exactly $\Z$; the mid-flight weight spread is pure bookkeeping guaranteed to cancel at the end — and resampling converts it into irreversible kill/clone decisions, becoming the *only* source of error.

The fix: make the intermediate targets as knowledgeable as the proposal, by putting the proposal *in* them — intermediate target $\propto \proposal(\text{prefix}) \times \shape(\text{prefix})$. The incremental weight collapses to the shaping ratio, so resampling fires only on genuine news (a particle actually erred), and the prior-vs-proposal account is settled in one lump at $\eos$, where it can still correct the estimate but can no longer misdirect the genealogy. Final weights are unchanged and $\hat\Z$ stays unbiased: the fix is free.^[Intermediate targets are ours to choose; only the final target is pinned. This is the standard freedom in SMC, just usually spent elsewhere.] -->

# Setup

We want samples from a posterior over strings, $\posterior(\str) = \prior(\str)\,\potential(\str)/\Z$: a language-model prior $\prior$, reshaped by a potential $\potential(\str) \ge 0$. The potential scores only *complete* strings. A proposal $\proposal$ generates candidates token by token, so a **shaping function** $\shape(\text{prefix}) \ge 0$ supplies the intermediate feedback that $\potential$ can't. On *complete* strings we set $\shape \defeq \potential$ --- a choice, but the natural one, and it lets a single update rule cover every step. In sequential importance sampling, extending a particle by token $x$ updates its weight by

$$
\impwt \;\gets\; \impwt \cdot \frac{\prior(x \mid \text{prefix})}{\proposal(x \mid \text{prefix})} \cdot \frac{\shape(\text{prefix}\,x)}{\shape(\text{prefix})},
$$

including at the final step: there $x = \eos$ completes the string, so the numerator is $\shape(\text{prefix}\,\eos) = \potential(\text{string})$, and the last update swaps the shaping estimate for the true potential. A live particle thus carries $\impwt = \prior\,\shape/\proposal$ (in prefix probabilities). A completed particle carries the full importance weight no matter what $\shape$ was --- shaping only decides *when* weight is realized. SMC adds resampling when the effective sample size drops. The ideal shaping function is the **twist** $\tshape(\text{prefix}) \defeq \mathbb{E}_{\prior}[\potential \mid \text{prefix}]$: the prior's expected future potential. A trained proposal approximates $\proposal \approx \prior \cdot \tshape / \Z$ in prefix probabilities.

## A toy setting

- **Vocabulary**: `<`, `>`, `¤` (end of string).
- **Prior**: uniform, $\prior(\mathtt{<}) = \prior(\mathtt{>}) = \prior(\eos) = \tfrac13$ in every context. The dumbest possible LM, with no free parameters.^[Memorylessness is convenience, not load-bearing. With a bigram prior everything below stays closed-form (the twist is still geometric in depth, with a last-token-dependent prefactor), and the pathology only gets stronger. The interactive panel below lets you set all three conditional distributions (after BOS, after `<`, after `>`), with a unigram/bigram toggle; unigram is the memoryless case.]
- **Potential**: $\potential(\str) = 1$ iff $\str$ is a balanced, nonempty bracket string.
- **Shaping**: $\shape(\text{prefix}) = 1$ iff the running depth never went negative, the naive "no error yet" check.

Variable length buys two failure modes. Emitting `>` at depth 0 dies *mid-string*, where shaping catches it (its genuine pruning role), while emitting `¤` at depth $> 0$ dies only *at the end*, invisible to shaping.^[The empty string is also invalid, so `¤` as the first token is an at-the-end death available from $t=0$.]

Everything is closed form, and for the uniform prior the constants come out golden. The twist depends only on depth, $\tshape(d) = \lambda^{d+1}$, with $\lambda = \tfrac{3-\sqrt5}{2} \approx 0.382$ (the reciprocal of the squared golden ratio) and $\Z = \lambda - \tfrac13 \approx 0.049$.^[$\lambda$ solves $\lambda^2 - 3\lambda + 1 = 0$. The table's nonzero entries are exactly $\lambda/3$ and $\tfrac{1}{3\lambda}$; each row sums to one because $\lambda^2 + 1 = 3\lambda$.] The optimal proposal $\proposal^*(x \mid \text{state}) \propto \prior(x)\,\tshape(\text{state after } x)$ is a three-row table:

| state | `<` | `>` | `¤` |
|---|---|---|---|
| start | $1$ | $0$ | $0$ |
| depth $0$, started | $\approx 0.13$ | $0$ | $\approx 0.87$ |
| depth $d \ge 1$ | $\approx 0.13$ | $\approx 0.87$ | $0$ |

In words, open with probability ${\approx}0.13$; otherwise close, or stop when balanced. The punchline identity is that under the standard intermediate targets a live particle at depth $d$ carries

$$
\impwt \;=\; \frac{\Z}{\tshape(d)} \;\propto\; \lambda^{-d},
\qquad\text{while its promise is}\qquad
\tshape(d) \;\propto\; \lambda^{d}.
$$

**The resampler prices a particle at exactly the reciprocal of its prospects.** A depth-3 particle looks ${\approx}18\times$ more valuable than one about to close out a success, and is ${\approx}18\times$ less likely to deliver.

# Three algorithms

| | intermediate target | live increment | resampling fires |
|---|---|---|---|
| **SIS** | none (never resamples) | $\tfrac{\prior}{\proposal}\cdot\tfrac{\shape'}{\shape}$ | never |
| **SMC, prior targets** | $\prior \times \shape$ | $\tfrac{\prior}{\proposal}\cdot\tfrac{\shape'}{\shape}$ | on deaths *and* on the $\lambda^{-d}$ weight spread |
| **SMC, proposal targets** | $\proposal \times \shape$ | $\tfrac{\shape'}{\shape} \in \{0,1\}$ | only on deaths |

All three realize the same final weights (the deferred $\prior/\proposal$ lump lands at $\eos$ in the third), and all three give unbiased $\hat\Z$.

# When is it worst?

The live weight at the trained proposal is $\Z/\tshape(\text{state})$ whatever the model, since $\proposal^* = \prior\,\tshape/\Z$ on prefixes. Between two live particles the resampler therefore *prefers the less promising one*, in exact proportion to how much less promising it is. What it can destroy is set by how much $\tshape$ varies across concurrently live particles, not by how hard the problem is. Mirrored priors with identical $\Z$ range from harmless to an order of magnitude worse than SIS.^[With $\prior(\eos) = 0.2$ fixed, $\prior(\mathtt{<}), \prior(\mathtt{>}) = (0.25, 0.55)$ and $(0.55, 0.25)$ both give $\Z = 0.039$, but the trained-proposal rel. std under prior targets is $0.001$ for the first and $0.34$ for the second ($M = 16$; SIS and proposal targets sit at exactly $0$).] **The standard targets hurt most when the work remaining to satisfy the potential is exactly the work the prior considers improbable**; the mispricing per unit of remaining work is the reciprocal of the prior's probability of doing that unit. The panel's "weight growth per depth" readout is this quantity. Drag $\prior(\mathtt{<})$ above $\prior(\mathtt{>})$ and watch the crossover gap blow up.

# What the visualization shows

::: {.viz #viz-annotated height="470px"}
:::

**The pathology in one (hand-picked) run.** Each lane is a particle; color is depth (darker = deeper); band thickness is share of resampling weight; `¤` marks completion. Top panel (prior-based targets): at the dashed cut, resampling clones the deepest particle --- least promising, but heaviest --- **six** times, and kills three shallow particles that were about to finish (×). Bottom panel (proposal-based targets, identical randomness): no weight-triggered resampling fires, the three killed particles all complete validly, and the one event just recycles dead slots.

**Explore it yourself.** The panel starts from the run above; re-run draws fresh randomness. Hover for any particle's exact state. At high $s$ prior-target events are rare, though reliably perverse when they fire. Lower $s$ or re-run for more action.

::: {.viz #viz-trajectories height="380px"}
:::

::: {.viz #viz-crossover height="320px"}
:::

**The crossover.** Training progress $s$ against the relative error of $\hat\Z$ ($M = 8$, $20{,}000$ runs; resampling events per run in parentheses):

| $s$ | SIS | SMC, prior targets | SMC, proposal targets |
|---|---|---|---|
| $0.0$ (untrained) | $1.56$ | $\mathbf{1.36}$ (0.81) | $\mathbf{1.39}$ (0.81) |
| $0.5$ | $0.49$ | $0.49$ (0.58) | $0.49$ (0.51) |
| $0.8$ | $0.23$ | $0.26$ (0.38) | $0.23$ (0.17) |
| $0.95$ | $0.10$ | $\mathbf{0.22}$ (0.70), ${\approx}5\times$ the variance | $0.10$ (0.02) |
| $1.0$ (optimal) | $0$ (exact) | $\mathbf{0.24}$ (1.28), resampling is the *only* error | $0$ (exact) |

Resampling helps an untrained proposal (most prior rollouts die, and their slots get recycled), is a wash mid-training, and actively hurts a trained one, while proposal-based targets track the better regime at both ends. At $s = 0.95$ the correlation between a live particle's weight and its true success probability, measured at prior-target resampling events, is $-0.91$.

The toy makes the litmus test visible. **Resampling helps exactly when the intermediate targets know at least as much about the future as the proposal does.** With an untrained proposal the shaping check knows more, so resample. With a trained proposal the proposal knows more, and resampling on the prior's targets is vandalism. Moving the targets with the proposal keeps the comparison from going stale.
