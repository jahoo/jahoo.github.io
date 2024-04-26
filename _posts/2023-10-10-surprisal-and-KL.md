---
layout: post
comments: false
title: surprisal and KL
published: true 
tags:
    - note
---

$$
\global\def\colorKL{\color{4fa283}}
\global\def\colorR{\color{ec8c62}}
\global\def\R{\colorR\mathrm{R}}
$$

Consider any setting where a distribution over some latent variable $$Z$$ changes when conditioning on some outcome $$\breve u$$ of an observable random variable.  The change can be quantified as _KL divergence_, $$\operatorname{\colorKL KL}(p_{Z\mid \breve u}\|p_{Z})$$. This divergence can be decomposed into _surprisal_ of $$\breve u$$ minus another term, which I'll call $$\R$$:

$$
\begin{aligned}
  \operatorname{\colorKL KL}(p_{Z\mid \breve u}\|p_{Z})
  && = && -\log p(\breve u) 
  && - && \mathop{\mathbb{E}}_{p_{Z\mid \breve u}}[-\log p(\breve u\mid z)]\\
  \operatorname{\colorKL KL}(\operatorname{posterior}\|\operatorname{prior}) 
  && = && \operatorname{surprisal} 
  && - &&
  \underbrace{\mathop{\mathbb{E}}_{\operatorname{posterior}}[-\log \operatorname{lik}]}_{\operatorname{\colorR R}}
\end{aligned}
$$

Since KL is nonnegative, R can take on values between 0 and the surprisal. Put another way, this implies that surprisal upper-bounds the amount by which the distribution changes. Note that if surprisal is large and R is also large, KL is small---that is, despite the observation containing a large amount of information, it does not result in a large change in the distribution.

### Interactive illustration

Manipulate prior and likelihood sliders below to see posterior and resulting surprisal partition:

<iframe width="100%" height="1509" frameborder="0"
  src="https://observablehq.com/embed/@postylem/kl-and-surprisal?cells=viewof+showOtherKL%2Cplot1_1%2Cplot1_2%2Cviewof+dim%2Cviewof+useLogInput%2Cviewof+allowZeroes%2Cinput1%2Cviewof+scale_prior%2Cviewof+scale_likelihood%2Cviewof+applyScaleLikelihood1%2Cmodification_plots%2Cviewof+whetherPlotLogSpace%2Cviewof+maxUnits%2Cviewof+base"></iframe>

