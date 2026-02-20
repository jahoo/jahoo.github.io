---
layout: post
title: Linguistic Dependencies and Statistical Dependence
published: true
tags:
    - presentation
    - paper
---

At [EMNLP](https://2021.emnlp.org/) (virtually) I presented work (with [Wenyu Du](https://aclanthology.org/people/w/wenyu-du/), [Alessandro Sordoni](https://scholar.google.it/citations?user=DJon7w4AAAAJ&hl), and [Timothy J. O'Donnell](https://scholar.google.com/citations?user=iYjXhYwAAAAJ&hl)) titled _Linguistic Dependencies and Statistical Dependence_.

<div style="text-align: center;"><img width="400" src="/assets/2021-11-07-EMNLP-dependency-dependence-fig.png"></div>

In this work, we compared _linguistic dependency_ trees to dependency trees representing _statistical dependence_ between words, which we extracted from mutual information estimates using pretrained language models. Computing accuracy scores we found that the accuracy of the extracted trees was only as high as a simple linear baseline that connects adjacent words, even with strong controls.  We also found considerable differences between pretrained LMs.

- Paper is [here](http://dx.doi.org/10.18653/v1/2021.emnlp-main.234).  

- Poster is [here](/assets/pdfs/2021.10.11.EMNLP.poster.pdf).
- Talk slides are [here](/assets/pdfs/2021.10.11.EMNLP.talk-slides.pdf).
- Code is available [here](https://github.com/mcqll/cpmi-dependencies).  


