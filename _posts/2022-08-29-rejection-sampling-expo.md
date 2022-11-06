---
layout: post
comments: true
tags: 
    - note
author:
- Jacob Louis Hoover
bibliography:
- /Users/j/all.bib
date: 29 August, 2022
subtitle: The rejection sampling algorithm, and how guess-and-check is a
  special case.
title: Rejection sampling
toc-title: Table of contents
website:
  navbar:
    collapse-below: sm
  reader-mode: true
  search:
    copy-button: true
    location: navbar
  title: notebook
---

<!-- Note to self, remove the html file and the whole /site_libs/ dir from this website if you ever get around to making this post actually generate from markdown instead of this hacky version -->

_Rejection sampling_ refers to a particular algorithm involving drawing samples from one distribution in order to estimate some other distribution, by rejecting or accepting the samples obtained in a smart way. In this note I'm exploring this algorithm a little with some simulations, and also showing how a different, similar, algorithm can be seen as a special case of the general version (because it wasn't at all obvious to me at first how they were related).


<div>
<iframe src="/assets/rejection-sampling-expo.html" width="100%" height="5900" frameborder=none>
</iframe>
</div>
