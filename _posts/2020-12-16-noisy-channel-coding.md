---
layout: post
title: Shannon’s noisy channel-coding theorem
published: true 
tags:
    - presentation
---
[Here](/assets/pdfs/2020.12.16-noisy_channel_coding-handout.pdf) are slides I put together going through the proof of the noisy-channel coding theorem (following the proofs given in [Cover and Thomas (2006) Ch7](https://archive.org/details/ElementsOfInformationTheory2ndEd/page/n225) and [MacKay 2003, Ch10](http://www.inference.org.uk/mackay/itprnn/ps/161.173.pdf)), a central result in information theory, which is a statement about _noisy channels_ (a set up where a message passed from sender to receiver is disturbed by some random process during transmission).

The theorem says that it’s possible to communicate across such a channel with arbitrarily low probability of error, at any rate of transmission bounded by the mutual information between encoded sequences and received sequences, as long as the length of the code is allowed to be as long as necessary.  
