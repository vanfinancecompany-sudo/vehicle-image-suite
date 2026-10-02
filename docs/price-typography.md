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
| WAS | Noto Sans 900 | 48px | 30 | 665 | 86% |
| NOW | Noto Sans 900 | 72px | 215 | 646.55 | 88% |
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

## Rendering polish

SAVE alone has a crisp black shadow at 38% opacity, offset 1px right / 1.5px down,
with zero blur. Both value and shadow are clipped to the existing SAVE safe area.
Font, size, fitting and manual calibration are unchanged.

NOW keeps its chosen bundled font and master size/width. Per-character advances retain
pair kerning, then apply -1.08px tracking at the default 72px size. A 0.9px same-colour
stroke adds a little weight. Both scale proportionally with font size. The complete
ink bounds include the stroke, preserving the visible left anchor and user offsets.
WAS rendering and strike-through are unchanged.

The shared preview/export compositor masks the photograph to the PNG's largest connected
transparent opening, including semi-transparent edges, excluding separate exterior margins
and decorative holes. The mask is cached for each decoded template and canvas size.
Normal footer templates retain their edge-connected photo opening. Existing full-canvas
photo transforms are preserved; the mask affects only visibility, not drag/zoom positioning.

tests/browser/polish.spec.js checks SAVE £350 / NOW £10,245, real ink density and anchor,
shadow-only pixels, strict frame containment after drag/zoom, transform persistence and
byte-identical editor/export PNGs. Deterministic screenshots use saleFrame.js as test
scaffolding; the customer's approved overlay is not replaced.

## Resized template price alignment

Only the dynamic WAS/NOW default Y coordinates change: WAS 643 → 665 and NOW
628 → 646.55. At the existing bundled Noto Sans sizes, their alphabetic baselines
are both 700px, including NOW's existing half-stroke allowance. X, font size,
font weight, width, colours, tracking, stroke, SAVE and WAS strike-through styling
are unchanged. The baked-in labels stay at their existing levels.

A complete exact untouched previous Noto master moves to these Y defaults once.
Any manual/partial master calibration is preserved. Photo transforms, prices,
per-vehicle offsets, photos and completion status are never reset.
Previously explicit League Spartan choices at revision 2 stay protected.

price-alignment.spec.js checks several dynamic values with real bundled fonts,
shared baselines, clearance below the fixed label levels, bottom-panel containment,
independent vehicle offsets and saved master migration/manual-edit persistence.
Its 960 × 720 resized-panel backdrop follows the supplied screenshot; it is
test scaffolding and does not replace or edit the user's browser-local master PNG.
