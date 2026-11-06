# 2.5.0-alpha1 findings

- Live fetched origin/main and HEAD both 4e1bbed. 23 user files inventoried before edits.
- External AI-Cache mounted/writable ~691GiB; internal ~31GiB.
- Worker controls expose requested terra/max; root model/tier cannot be changed via current tool.

- Built-in browser confirms same #46 loss as real-editor unit regression: code a  b→a b, tab→space, all-space span absent. Existing code/math fence still ordinary highlighting before integration.
- First detached cargo launch ended with shell; restarted as owned PTY session2969, external target verified. Vite session7642.

- Independent review caught table inline code backslash+pipe loss. Two regressions reproduced red; narrowly mark internal table-cell codec context and add required GFM pipe escape inside code. All37 codec tests now green.
- Math renders all4 representative blocks in actual built-in browser; root math codec/maps/export tests3 and typecheck pass. Font license metadata requires OFL supplement beyond KaTeX MIT.
