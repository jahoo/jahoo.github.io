---
layout: page
title: posts
---

<div class="home">
  <!-- <h2 class="post-list-heading">notes</h2> -->

  <ul class="post-list">
    {% for post in site.posts %}
    <li>
      <h3 id="no-pad">
        <a
          {% if post.tags contains "paper" %}
          class="post-link-highlighted"
          {% else %}
          class="post-link"
          {% endif %}
          href="{{ post.url | prepend: site.baseurl }}"
        >
          {{ post.title }}
        </a>
      </h3>
      <span class="post-meta">
        {{ post.date | date: "%-d %b %Y" }}
      </span>
      <span class="post-tags">
        {% for tag in post.tags %}
        - {{ tag }}
        {% endfor %}
      </span>
    </li>
    {% endfor %}
  </ul>

</div>