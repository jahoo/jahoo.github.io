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

-------

_Name update, September 2024:_ \
I will now be using my new surname, Vigly. My old surname is now a middle name (that is, I am "Vigly, Jacob Hoover"). \
Previously I published under the surname Hoover.

### Selected publications

<!-- {% bibliography_count -f pubs %} -->

{% bibliography --file pubs %}
