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

Set prior and likelihood to see posterior and resulting infometrics:
<iframe width="100%" height="3319" frameborder="0"
  src="https://observablehq.com/embed/@postylem/kl-and-surprisal@3477?cells=viewof+dim%2Cviewof+useLogInput%2Cviewof+allowZeroes%2Cinput1%2Cviewof+scale_likelihood%2Cplot1_1%2Cplot1_2%2Cviewof+maxNats%2Cplot1_3%2Cmodification_plots%2Cviewof+whetherPlotLogSpace%2Cexx_intro%2Cex_1_1%2Cex_1_2%2Cex_1_3%2Cex_2_1%2Cex_2_2%2Cex_2_3%2Cex_3_1%2Cex_3_2%2Cex_3_3%2Cex_4_1%2Cex_4_2%2Cex_4_3"></iframe>