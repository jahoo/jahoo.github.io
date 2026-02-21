---
layout: page
title: research
published: true
---

<ul class="social-media-list">
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
