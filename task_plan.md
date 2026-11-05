# Editor control polish — 5 November 2026

Requested: remove floating mode buttons; provide toolbar switch/View menu actions; implement former “66” control; show current version in About. Preserve footer and fidelity.

- Source/history confirms “66” is a static Font Size placeholder (a67d9ce).
- Implemented shared editor ref mode transition, App-shared actual mode, toolbar switch and View choices; floating controls removed.
- Implemented display text-size selector (10–32px) sharing config with zoom/menu/keyboard and applying to both editors/preview. About uses native version with bundled-version fallback and native HTML modal semantics.
- Three new real-App tests, a rapid-transition regression and existing real-engine tests pass (41 total), lint/build pass. Browser checks confirm repeated source fidelity, font/zoom synchronization, modal Tab/Escape/focus and no console issues. Layout passes at supported desktop widths 800/1024/1440 with footer visible and no horizontal overflow.
- Committed/pushed ba99ae9. Current macOS bundle rebuilt; original clean document reopened; toolbar/menu modes, 18px selection/reset, About version and Escape verified natively. CI 42121100607 passed frontend and all three native jobs at ba99ae9; eight actual application cases each pass on Windows/Linux, including About version and the toolbar switch. Both result artifacts inspected. All requested behavior is implemented and verified; documentation closeout only. Preserve all pre-existing sample edits/evidence. No merge/release or new broad goal.
