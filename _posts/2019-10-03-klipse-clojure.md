---
layout: post
title: Using Clojure in interactive code-boxes
published: true
---

The code for rendering the interactive Clojure boxes in this post is in [klipse-clojure-material.html](/assets/klipse-clojure-material.html) (download to see header).

## Klipse code block renderer

Here is an html code block

```html
<pre><code class="language-eval-clojure">
  (+ 1 1)
</code></pre>
```

To make this code be hidden, make the class be `hidden` (defined in css). It will still run, and any definitions or side-effects made in in a hidden box will be available in later boxes.

```html
<pre class="hidden"><code class="language-eval-clojure">
  (+ 1 1)
</code></pre>
```

that will run as interactive clojure with [Klipse](https://github.com/viebel/klipse) (note, the return of the last function call will be printed, if you want more to print you can always use `print` or `println`):

<pre><code class="language-eval-clojure">
(defn flip
  ([]
   (if (< (rand 1) 0.5)
     true
     false))
  ([p]
   (if (< (rand 1) p)
     true
     false)))

(println (flip))
(println (flip 0.1))
(flip 0.9)
</code></pre>

The code will be auto-evaluated with every change. Note that you also can use <kbd>⌘</kbd>+<kbd>return</kbd> / <kbd>CTRL</kbd>+<kbd>⏎</kbd> to re-run.

In markdown, specify the language in a [fenced code block](https://www.markdownguide.org/extended-syntax/#:~:text=syntax%20highlighting%20for%20fenced%20code%20blocks) as `eval-clojure` after the opening fence, like this:

~~~
```eval-clojure
(clojure code)
```
~~~

and the interpreter will make this into the same HTML as the above. Here's an example (function `flip` is imported from `metaprob.distributions` in the site's preamble code (in `_layouts/default.html`)

```eval-clojure
(repeatedly 10 flip)
```

Or, rather than `eval-clojure`, specify the language `reagent` for a given code box if you want to do some output that involves rendering html elements. This is what we'll have to use to render vega graphics:

```reagent
[:div [:button
 {:on-click
  (fn [e]
    (js/alert "Now you have to close this pop-up!"))}
 "Don't press this button."]]
```

Note, a regular code block (just triple backticks) or will not be evaluated, or syntax-highlighted:

```
(repeatedly 10 flip)
```
(_TODO: figure out how to make this regular code block be Klipsified as `language-eval-clojure` by default.
That would be nice.  But, it would require working around the fact that GitHub  kramdown specifically doesn't want to support this, it seems._)


# Visualizations:

There's some code in the preamble, which I have set to load, hidden, when this page is rendered (in the body [here](/assets/klipse-clojure-material.html), or in context, see the [`_layouts/default.html`](https://github.com/jahoo/jahoo.github.io/blob/master/_layouts/default.html) file used to render this page) that gets Vega to work with Klipse. It is copied from Oz (thanks for the help on that, Alex!). It defines the useful function `vega`, which will take in a vega spec vector, and output a diagram.  

## Vega for plotting

Here's an example of a histogram. To start, here's how to make a simple bar graph: in a clojure box, create a function to make a reagent element:

```eval-clojure
(defn three-bar-graph [A B C]
  {:data {
          :values [
                   {:value "A", :count A},
                   {:value "B", :count B},
                   {:value "C", :count C}
                   ]
          },
   :mark "bar",
   :encoding {
              :x {:field "value", :type "ordinal"},
              :y {:field "count", :type "quantitative"}
              }})
```

Then, in a reagent box you can call `vega` on that to print the visualization (and whatever html you want).  Use square brackets rather than parentheses outside the function.
```reagent
[:div
  [:h4 "Example:"]
  [:p "Here's a " [:code "three-bar-graph"]]
  [vega (three-bar-graph 10 12 10)]]
```

Note the **visualizations need to be in a `reagent` code box** to be rendered. In an `eval-clojure` box they don't render.

```eval-clojure
(vega (three-bar-graph 10 12 10))
```

### Histograms:

The following code (which is executed in the preamble for this page) 
defines a function `hist` which will render a histogram
of a given list of observations:


```clojure
(defn list-to-data [l]
  """ takes a list and returns a record
  in the right format for vega data,
  with each list element the label to a field named 'x'"""
  (defrecord rec [x])
  {:values (into [] (map ->rec l))})

(defn makehist [data]
  {
   :$schema "https://vega.github.io/schema/vega-lite/v4.json",
   :data data,
   :mark "bar",
   :encoding {
              :x {:field "x",
                  :type "ordinal"},
              :y {:aggregate "count",
                  :type "quantitative"}
              }
   })

(defn hist [l]
  (vega (makehist (list-to-data l))))
```


Here is `hist` called on a list of numbers (**must be in a `reagent` code box**).
```reagent
(hist [0 5 2 1 2 3 4 3 3 3 4 5 19 20 20 21 20 20 19 18])
```
or truth values
```reagent
(hist (repeatedly 100 flip))
```

or lists...
```reagent
(defn sample-kleene-ab []
  (if (flip) '() (cons (if (flip) 'a 'b) (sample-kleene-ab))))

(hist (repeatedly 200 sample-kleene-ab))
```

`hist` is defined in the preamble, so it is available on any page.


## Vega for drawing trees

You can define some tree data in clojure's record data format like format:

```eval-clojure
(def example-tree-data
[ {:id 0 :name "a"}
  {:id 1 :name "b" :parent 0}
  {:id 2 :name "c" :parent 0}
  {:id 3 :name "d" :parent 2}   ])
```

Yes, it's clunky, but that's how you do it. Then the function `(maketree w h tree-data)` (defined in the preamble) will take that data and make the spec for a Vega tree diagram of size `w`px-by-`h`px out of that. Then, in a reagent box you can call `vega` on the result to visualize:

```reagent
[:div
  [:h4 "Here's a tree"]
  [vega (maketree 200 100 example-tree-data)]]
```

Then here's a function `list-to-tree-spec` which will walk through a list (using the [clojure.zip](https://clojuredocs.org/clojure.zip) library) and output that format required:

```eval-clojure
(list-to-tree-spec '(a (b c)))
```

and finally, there's the function `tree`.

```clojure
(defn tree [w h list]
  (vega (maketree w h (list-to-tree-spec list))))
```

 Pass it three arguments, `w` width, `h` height and `list` a nested list, which will make a vega tree diagram of `w`px-by-`h`px out of that list.

```reagent
(tree 700 500 '
  ("(sum '(1 2))"
    ("(empty? '(1 2))"
      ("(+ (first '(1 2)) (sum (rest '(1 2))))"
        ("(first '(1 2))"
          ("1"))
        ("(sum (rest '(1 2)))"
          ("(+ (first '(2)) (sum (rest '(2))))"
            ("(first '(2))"
              ("2"))
            ("(sum (rest '(2)))"
              ("(empty? '())"
                ("0"))))))))
)
```
