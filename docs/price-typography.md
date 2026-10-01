# Reproducible sale price comparison

Scope: typography/positioning only. The approved overlay, importer, DealerKit integration
and campaign workflow are unchanged.

Audition: Arial Black availability check; real Arimo 700 (its published maximum),
Noto Sans 900 and Roboto 900; League Spartan 900 is the previous-result baseline.
All open-source candidates load from bundled @fontsource files.

The equal-size fixture uses 68px/100% to compare glyph shapes independently of layout.
Noto Sans 900 was selected by comparing £, 1/3/4/5/9, comma and counter density with the
white pickup PNG. It is the closest reproducible choice in this short list, not a claim
that the original flattened artwork used this exact font.

Final default coordinates refer to visible ink:
| Field | Font | Size | X | Y | Width |
| --- | --- | ---: | ---: | ---: | ---: |
| WAS | Noto Sans 900 | 48px | 30 | 643 | 86% |
| NOW | Noto Sans 900 | 72px | 215 | 628 | 88% |
| SAVE | Noto Sans 900 | 52px | 695 | 40 | 130% |

SAVE uses an internal rectangle (688,39)-(925,86). Normal values keep size/stretch.
Overflow fits width first, keeping the left anchor and height; £10,000 is checked explicitly.
Height fitting is reserved for an oversized manual font. Metadata remains unchanged by fitting.

The WAS line spans the measured amount with a small reference-like overhang and upward
slope. It shares the amount's translation and horizontal scaling. Renderer font readiness
and measured glyph bearings keep each visible left edge stable.

Only complete old untouched League Spartan defaults migrate. Any master override preserves
the entire master; per-vehicle offsets/other campaign data always remain intact. Explicit
new calibrations are revision-marked.

Fixture sources: tests/browser/price-typography.spec.js and
tests/browser/fixtures/priceCanvas.js. Generated screenshots appear in validation artifacts.
The fixture labels/backdrop are test scaffolding; the existing customer PNG is unchanged.
