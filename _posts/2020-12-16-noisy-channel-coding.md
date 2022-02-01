---
layout: post
title: Shannon’s noisy channel-coding theorem
published: true 
tags: presentation
---
I put together [a presentation](/assets/pdfs/2020.12.16-noisy_channel_coding-handout.pdf) going through the proof of the noisy-channel coding theorem (based on the proofs given in [Cover and Thomas 2006, Ch.7](https://archive.org/details/ElementsOfInformationTheory2ndEd/page/n225) and [MacKay 2003, Ch.10](http://www.inference.org.uk/mackay/itprnn/ps/161.173.pdf)), a central result in information theory, which is a statement about _noisy channels_ (a set up where a message passed from sender to receiver is disturbed by some random process during transmission).


<div style="text-align: center;"><img width="600" src="/assets/2020-12-16-noisy-channel.png"></div><br/>


The theorem says that it’s possible to communicate across such a channel with _arbitrarily low probability of error_, at any rate of transmission bounded by the mutual information between encoded sequences and received sequences, as long as the length of the code is allowed to be as long as necessary.  
<div style="text-align: center;"><img width="600" src="/assets/2020-12-16-noisy-channel-coding-theorem.png"></div><br/>

Slides [here](/assets/pdfs/2020.12.16-noisy_channel_coding-handout.pdf).