---
layout: page
title: posts
---

<div class="home">
  <h2 class="post-list-heading">notes</h2>

  <ul class="post-list">
    {% for post in site.posts %}
    {% if post.tags contains "note" %}
      <li>
        <h3 id="no-pad">
          <a class="post-link" href="{{ post.url | prepend: site.baseurl }}">
            {{ post.title }}
          </a>
        </h3>
        <span class="post-meta">
          {{ post.date | date: "%-d %b %Y"  }}
        </span>
        <span class="post-tags">
          {% for tag in post.tags %}
            - {{ tag }}
          {% endfor %}
        </span>
      </li>
    {% endif %}
    {% endfor %}
  </ul>

  <h2 class="post-list-heading">presentations</h2>

  <ul class="post-list">
    {% for post in site.posts %}
    {% if post.tags contains "presentation" %}
      <li>
        <h3 id="no-pad">
          <a class="post-link" href="{{ post.url | prepend: site.baseurl }}">
            {{ post.title }}
          </a>
        </h3>
        <span class="post-meta">
          {{ post.date | date: "%-d %b %Y"  }}
        </span>
        <span class="post-tags">
          {% for tag in post.tags %}
            - {{ tag }}
          {% endfor %}
        </span>
      </li>
    {% endif %}
    {% endfor %}
  </ul>
</div>
