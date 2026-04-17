---
title: A practical comparison of tensor train models
date: 2020-12-22
author: Jacob Louis Hoover
tags: [presentation]
---

I worked on a project with Jonathan Palucci exploring the trainability of a certain simple kind of [tensor network](https://tensornetwork.org/), called the Tensor Trains, or Matrix Product States.


::: {.center}
![](/assets/2020-12-22-training-tensor-trains-fig2.png){width=400}
:::


There is a general correspondence between tensor networks and graphical models, and in particular, when restricted to non-negative valued parameters, [Matrix Product States](https://tensornetwork.org/mps/) are equivalent to Hidden Markov Models (HMMs)). [Glasser _et al_. 2019](https://arxiv.org/abs/1907.03741) discussed this correspondence, and proved theoretical results about these non-negative models, as well as similar real-- and complex--valued tensor trains.  They supplemented their theoretical results with evidence from numerical experiments.  In this project, we re-implemented models from their paper, and also implemented time-homogeneous versions of their models.
We replicated some of their results for non-homogeneous models, adding a comparison with homogeneous models on the same data.  We found evidence that homogeneity decreases ability of the models to fit non-sequential data, but preliminarily observed that on sequential data (for which the assumption of homogeneity is justified), homogeneous models achieved an equally good fit with far fewer parameters. Surprisingly, we also found that the more powerful non time-homogeneous positive MPS performs identically to a time homogeneous HMM.

- Poster [here (PDF)](/assets/pdfs/2020.12.15.tensor-trains-poster.pdf).  
- Writeup [here (PDF)](/assets/pdfs/2020.12.22.tensor-trains-writeup.pdf) _A practical comparison of tensor train models: The effect of homogeneity_.  
- Code [on GitHub](https://github.com/postylem/comparison-of-tensor-train-models).
