---
layout: post
title: dependency structures
published: false
---
Dependency structures and dependency languages

Word-to-word dependency structures have a history in descriptive linstuistics, based on the assumption that the structure of a sentence can be captures by the relationships between the words.

It is a simple idea: the structure of a sentence is captured by inferior-superior relation between individual pairs of words.  This is easy to formalize as a directed graph.
￼
![r](/assets/Image.jpg)

Make a bridge between the formal system of dependency structures and other traditions such as phrase structure, or categorial grammar approaches to syntax.

Hays-Gaifman grammar is such a link. Weakly equivalent to CFG.  Hays-Gaifman grammars are projective (requires each dependency subtree to cover a contiguous region of the sentence). Approx: no discontinuous constituents.  

-> Important: Extending HG equivalence to allow mildly context sensitivity.

——— Lexicalized Grammars Induce Dependency Trees

Make a lexicalised version of a CFG (each production rule contains exactly one ‘anchor’ terminal in its RHS)
￼
This gives a third interpretation of CFGs:
1. generators of parse trees:
2. generators of strings (a homomorphism from the tree)
3. generators of dependency trees (a homomorphism from a tree, if CFG is lexicalized)

Ex: A derivation tree.
￼
So Fig 1.1 is the dependency structure induced by this derivation.

But, not all linguistically relevant dependency structures can be induced from CFG derivations.  The first (German, ‘nested’) is projective and can be captured by a CFG, the second (Dutch, ‘cross-serial’) is not, and cannot.
￼
But, this cross-serial dependency structure can be induced by a TAG derivation tree.

MAIN POINT: relation between structural properties of dependency structures (projectivity) and language-theoretic properties of the grammar formalisms that induce them (context free-ness)

Structural constraints:
- 1. projective: each subtree is an uninterupted interval in the string (= lexicalized CFGs)
- and two constraints giving classes of mildly non-projective structures
    - 2. block-restricted / bounded degree: subtrees can be over multiple intervals, but a bounded number (= LCFRS)
    - 3. well-nested: pairs of disjoint subtrees may be nested, but may not interweave. (related to Dyck languages)
        - well-nested & block-degree ≤2 = lexicalized TAGs
￼
