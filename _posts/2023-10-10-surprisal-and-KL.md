---
layout: post
comments: false
title: surprisal and KL
published: true 
tags:
    - note
---

Divergence in belief about latent $$Z$$ due to observed outcome $$\breve u$$:

$$
\begin{aligned}
  \operatorname{KL}(p_{Z\mid \breve u}\|p_{Z})
  && = && -\log p(\breve u) 
  && - && \mathop{\mathbb{E}}_{p_{Z\mid \breve u}}[-\log p(\breve u\mid z)]\\
  \operatorname{KL}(\operatorname{posterior}\|\operatorname{prior}) 
  && = && \operatorname{surprisal} 
  && - &&
  \underbrace{\mathop{\mathbb{E}}_{\operatorname{posterior}}[-\log \operatorname{lik}]}_{\operatorname{R}}
\end{aligned}
$$

Manipulate prior and likelihood to see posterior and resulting infometrics:
<iframe width="100%" height="2204" frameborder="0"
  src="https://observablehq.com/embed/@postylem/kl-and-surprisal?cells=viewof+dim%2Cviewof+useLogInput%2Cviewof+allowZeroes%2Cinput1%2Cviewof+scale_likelihood%2Cviewof+applyScaleLikelihood%2Cplot1_1%2Cplot1_2%2Cplot1_3%2Cmodification_plots%2Cviewof+whetherPlotLogSpace%2Cviewof+maxUnits%2Cviewof+base%2Cexx_intro%2Cviewof+ex_selected%2Cviewof+ex_use_selected%2Cex_plot_1%2Cex_plot_2%2Cex_plot_3"></iframe>