---
layout: post
title: Interactive diagrams with Klipse+Vega
published: true
---

The code for rendering the visualizations in this post is in [`clojure-preamble.html`](https://github.com/jahoo/jahoo.github.io/blob/master/_includes/clojure-preamble.html).

## Klipse code block renderer

Here is an html code block that will run as interactive clojure with [Klipse](https://github.com/viebel/klipse) (note, the return of the last function call will be printed, if you want more to print you can always use `print` or `println`):

```html
<pre><code class="language-eval-clojure">
  (+ 1 1)
</code></pre>
```

In markdown, specify the language in a [fenced code block](https://www.markdownguide.org/extended-syntax/#:~:text=syntax%20highlighting%20for%20fenced%20code%20blocks) as `eval-clojure` after the opening fence, like this:

~~~
```eval-clojure
(clojure code)
```
~~~

and the interpreter will make this into the same HTML as the above. Here's an example:

```eval-clojure
(defn flip
  ([]
   (if (< (rand 1) 0.5)
     true
     false))
  ([p]
   (if (< (rand 1) p)
     true
     false)))

(repeatedly 10 flip)
```

The code will be auto-evaluated with every change. Note that you also can use <kbd>⌘</kbd>+<kbd>return</kbd> / <kbd>CTRL</kbd>+<kbd>⏎</kbd> to re-run. 

It's useful to put some definitions in a hidden preamble, so I use a class `<pre class="hidden">...</pre>` around the code block to make a Klipse clojure box that will be invisible, but will still run. Any definitions or side-effects made in in a hidden box will be available in later boxes.

For visualizations, rather than `eval-clojure`, specify the language `reagent` for a given code box if you want to do some output that involves rendering html elements. This is what we have to use to render vega graphics:

```reagent
[:div [:button
 {:on-click
  (fn [e]
    (js/alert "Now you have to close this pop-up!"))}
 "Don't press this button."]]
```


# Visualizations:

There's some code in the preamble, which I have set to load, hidden, when this page is rendered (see the [`clojure-preamble.html`](https://github.com/jahoo/jahoo.github.io/blob/master/_includes/clojure-preamble.html) file used to render this page) that gets Vega to work with Klipse. It is copied from Oz (thanks for the help on that, Alex!), and defines the useful function `vega`, which will take in a vega spec vector, and output a diagram.  

<!-- ## Vega for plotting

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

 -->
## Vega for drawing trees

You can define some tree data in clojure's record data format like format:

```eval-clojure
(def example-tree-data
  [{:id 0 :name "a"}
   {:id 1 :name "b" :parent 0}
   {:id 2 :name "c" :parent 0}
   {:id 3 :name "d" :parent 2}])
```

`(maketree w h tree-data)` (defined in the preamble) will take that data and make the spec for a Vega tree diagram of size `w`px-by-`h`px out of that. Then, in a reagent box you can call `vega` on the result to visualize:

```reagent
[:div
  [:h4 "Here's a tree"]
  [vega (maketree 200 100 example-tree-data)]]
```

Then here's a function `list-to-tree-spec` which will walk through a list (using the [clojure.zip](https://clojuredocs.org/clojure.zip) library) and output that format required:

```eval-clojure
(list-to-tree-spec '(a (b c)))
```

To be easier to use, there's the function `tree`, which should be called in a `reagent` codebox, to plot a tree that will autosize a bit.

```clojure
(defn tree
  "plot tree using vega"
  [list]
  (let [spec (list-to-tree-spec list)
        h (* 30 (tree-depth list))]
    (vega (maketree 700 h spec)))))
```

Pass it a nested list `list`, and you'll get a visualization.

For example: a clojure function computation tree

```eval-clojure
(def fib3-tree
  '("(fib 3)"
    ("(+ (fib 1) (fib 2))"
     ("(fib 1)"
      ("1"))
     ("(fib 2)"
      ("(+ (fib 0) (fib 1))"
       ("(fib 0)"
        ("0"))
       ("(fib 1)"
        ("1"))))))
  )
```

```reagent
(tree fib3-tree)
```

Or a natural language syntax/derivation tree:

```eval-clojure
(def j-tree
  '(CP 
    (TP 
     (NP_i (N (Aoi-ga "\"Aoi-NOM\"")))
     (T' (VP 
          (PP (NP (daidokoro "\"kitchen\"")) (P (de "\"in\""))) 
          (VP "(t_i)" (V' 
                       (NP (N (hon-o "\"book-ACC\"")))
                       (V (yon- "\"read\"")))))
         (T (da "\"PST\"")))) 
    (C (to "\"COMP\"")))
  )
```

```reagent
(tree j-tree)
```
