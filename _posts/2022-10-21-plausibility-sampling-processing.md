---
layout: post
title: Sampling for processing
published: true 
tags:
    - note
    - paper
---

I just posted a preprint titled [_The Plausibility of Sampling as an Algorithmic Theory of Sentence Processing_](https://osf.io/qjnpv). 

This work is a collaboration with Morgan Sonderegger, Steve Piantadosi, and Tim O'Donnell. It is based on the well-documented observation that for humans, the difficulty to process a given item of linguistic input depends on how predictable it is in context---more surprising words take longer to process. However, most existing theories of processing cannot simply and directly predict this behavior. What algorithm might be capable of explaining this phenomenon? 

In this work, we focus on a class of algorithms whose runtime does naturally scale in surprisal—those that involve repeatedly sampling from the prior. Our first contribution is to show that **simple examples of such algorithms predict runtime to increase superlinearly with surprisal, and also predict variance in runtime to increase.** These two predictions stand in contrast with literature on surprisal theory ([Hale, 2001](https://www.aclweb.org/anthology/N01-1021); [Levy, 2008](https://doi.org/10.1016/j.cognition.2007.05.006)) which argues that the expected processing cost should increase linearly with surprisal, and makes no prediction about variance. 

In the second part of this paper, we conduct an empirical study of the relationship between surprisal and reading time, using a collection of modern language models to estimate surprisal, and fitting Generalized Additive Models of the relationship. We find that with better language models, reading time increases superlinearly in surprisal, and also that variance increases. These results are consistent with the predictions of sampling-based algorithms.

-----
</br>

_2023-06 update_
: [Here](https://doi.org/10.1162/opmi_a_00086) is a link to the published version in the journal _Open Mind_ (2023) 7: 350--391.
