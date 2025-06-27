---
layout: page
title: research
published: true
---

<ul class="social-media-list">
  {% if site.github_username %}
  <li>
    {% include icon-github.html username=site.github_username %}
  </li>
  {% endif %}

  {% if site.twitter_username %}
  <li>
    {% include icon-twitter.html username=site.twitter_username %}
  </li>
  {% endif %}

  {% if site.google_scholar_id %}
  <li>
    {% include icon-google_scholar.html userid=site.google_scholar_id %}
  </li>
  {% endif %}
</ul>

### Preprints

{% bibliography --file preprints %}

### Selected publications

<!-- {% bibliography_count -f pubs %} -->

{% bibliography --file pubs %}

-------

<span class="post-meta">
_Note on my name:_  
My surname is Vigly. Prior to September 2024, my surname was Hoover, which is now a middle name.
</span>
