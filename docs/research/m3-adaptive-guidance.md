# Material 3 adaptive guidance, distilled for container queries

Research for [#195](https://github.com/jrga03/household-hub/issues/195) (map [#193](https://github.com/jrga03/household-hub/issues/193)). Researched 2026-10-20.

**Sources.** Every claim below comes from m3.material.io. The site is a client-rendered app, so the text was read from the JSON it loads (`/_dsm/content/m3/2026-10-13_06-10-19/<page>.json`, the content version the live bundle requested on 2026-10-20). Page "updated" stamps: Breakpoints, Canonical examples, Scaffold 2026-07-17; Layout overview 2026-08-18; Navigation drawer 2026-07-30. Quotes are verbatim. Each tab URL below returned HTTP 200 (a made-up sibling path returned 404).

| Short name      | URL                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Breakpoints     | https://m3.material.io/foundations/layout/breakpoints/overview (tabs `/compact`, `/medium`, `/expanded`, `/large-extra-large`) |
| List-detail     | https://m3.material.io/foundations/layout/canonical-examples/list-detail                                                       |
| Supporting pane | https://m3.material.io/foundations/layout/canonical-examples/supporting-pane                                                   |
| Feed            | https://m3.material.io/foundations/layout/canonical-examples/feed                                                              |
| Panes           | https://m3.material.io/foundations/layout/scaffold/panes                                                                       |
| Rails           | https://m3.material.io/foundations/layout/scaffold/rails                                                                       |
| Layout overview | https://m3.material.io/foundations/layout/layout-overview                                                                      |
| Nav bar         | https://m3.material.io/components/navigation-bar/guidelines                                                                    |
| Nav rail        | https://m3.material.io/components/navigation-rail/guidelines                                                                   |
| Nav drawer      | https://m3.material.io/components/navigation-drawer/guidelines                                                                 |

## 1. Breakpoints (previously "window size classes")

M3 has renamed window size classes to **breakpoints**: "A breakpoint (previously window size class) is the window size at which a layout needs to change to match available space, device conventions, and ergonomics. These apply to Android and web." (Breakpoints). The layout overview adds: "Material layout guidance is implemented on Android and applies to web."

| Breakpoint  | Width (dp) | Common devices                                               | Panes (recommended)    | Navigation                                                            | Margin / spacer         |
| ----------- | ---------- | ------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------- | ----------------------- |
| Compact     | under 600  | Phone in portrait                                            | 1                      | Navigation bar, or modal expanded navigation rail                     | 16dp margins            |
| Medium      | 600–839    | Tablet / unfolded foldable in portrait                       | 1 (recommended) or 2   | Navigation bar, or modal expanded navigation rail                     | 24dp margins and spacer |
| Expanded    | 840–1199   | Phone or tablet in landscape, foldable in landscape, desktop | 1 or 2 (2 recommended) | Modal or standard expanded navigation rail (collapsed rail also fine) | 24dp                    |
| Large       | 1200–1599  | Desktop                                                      | 1 or 2 (2 recommended) | Modal or standard expanded navigation rail                            | 24dp                    |
| Extra-large | 1600+      | Desktop, ultra-wide                                          | 1 to 3                 | Modal or standard expanded navigation rail                            | 24dp                    |

Sources: Breakpoints, overview tab tables and per-breakpoint tabs; pane totals match Panes ("Compact 1 / Medium 1, other 2 / Expanded 2, other 1 / Large 2, other 1 / Extra-large 2, other 1, 3").

Other points from the same pages:

- "Design for breakpoints instead of specific devices because: The amount of available window space is dynamic and changes based on user behavior..." (Breakpoints)
- Large and extra-large "are most useful for creating web experiences tailored to laptop and desktop devices. Some products may not need large and extra-large breakpoints." (Breakpoints, Large & extra-large tab)
- Medium two-pane: "Limit use of two panes for content with lower information density, such as a settings screen." and "Don't use two panes in medium layouts with high information density, as it can reduce usability." (Breakpoints)
- Line length: "Across all breakpoints, adjust margins and type styles to keep text between 40–60 characters per line." (Breakpoints)
- Height breakpoints exist on Android only, and "it's rare that layouts need to adjust to available height." (Breakpoints)
- Density: "Density shouldn't automatically change across window-size classes or device orientation without users changing it." (Layout overview)
- Units: dp is defined for screen density ("A dp is equal to one physical pixel on a screen with a density of 160"). For touch targets the overview uses "48x48 CSS pixels" and "48x48dp" interchangeably. M3 does not state a dp-to-CSS-px rule for breakpoints. (Layout overview)

### What to change when crossing a breakpoint

Breakpoints lists five questions: what to **reveal**, how to **divide**, what to **resize**, what to **reposition**, what to **swap**. Swap examples: "a bottom navigation bar in a compact layout can be swapped with a navigation rail in a medium layout" and "a navigation rail can swap from collapsed to expanded at larger breakpoints." Caution: swapped components must be "functionally equivalent". "Don't swap a button for a chip."

Common swaps table (Breakpoints):

| Type                   | Compact                     | Medium                    | Expanded                  |
| ---------------------- | --------------------------- | ------------------------- | ------------------------- |
| Navigation             | Navigation bar              | Collapsed navigation rail | Collapsed navigation rail |
| Navigation             | Modal expanded rail         | Modal expanded rail       | Standard expanded rail    |
| Communication          | Basic or full-screen dialog | Basic dialog              | Basic dialog              |
| Supplemental selection | Bottom sheet                | Menu                      | Menu                      |

## 2. Pane rules (scaffold)

From Panes:

- "All layouts are made up of 1–3 visible panes." "All layouts need at least one flexible pane." Panes are fixed or flexible, and permanent or temporary.
- **Split-pane** (two flexible panes) "keeps the spacer visually centered." "When a navigation rail or drawer is present, it only reduces the size of one pane. The other pane remains at 50% of the window width." Medium two-pane: "Each pane... should take up 50% of the window width. Avoid setting custom widths." (Breakpoints, Medium)
- **Fixed-and-flexible**: "common for expanded, large, and extra-large." Fixed pane default is **360dp at expanded** and **412dp at large / extra-large** (Breakpoints). "The fixed pane is often temporary, and used for side sheets or lists with light information density." (Panes)
- **Three panes** only at extra-large, where the third is a standard side sheet (default maximum 400dp). "When the side sheet is present, the expanded navigation rail can remain visible, change into a collapsed navigation rail, or hide completely. Don't use more than three panes."
- **Resizing**: drag handles can resize or fully collapse panes. Snap widths are 360dp, 412dp, and centered split. "Persistent pane resizing... remembers a person's pane width preference. Use this for most resizable layouts." "The width persists even after a breakpoint change. This means that if a two-pane layout is collapsed to one pane at any size, it'll remain collapsed even when changing breakpoints." Supporting-pane layouts use **temporary** resizing that resets on reopen.
- **Presentation modes**: co-planar (side by side), floating (above, like a dialog), docked (pinned to an edge, like a bottom sheet). "Temporary tasks should remain floating regardless of breakpoint."
- **Adaptive strategies** (how panes respond to resizing): _show and hide_, _levitate_ ("A co-planar pane can float when switching breakpoint or orientation"; "At medium and expanded breakpoints, docked panes can adapt into floating panes" or into co-planar; "On large screens, consider changing docked panes into co-planar panes"), and _reflow_ ("When there's not enough horizontal space for panes, they can stack vertically instead.").
- Accessibility: co-planar focus order matches visual order. A modal floating pane moves focus in on open and back to its trigger on close.

## 3. Canonical layouts

Canonical examples lists three: feed, list-detail, supporting pane. "Each example has configurations for compact, medium, and expanded breakpoints."

### List-detail

For parent-child pairs ("Email inbox + selected email", "Settings + category detail"). Visible panes: compact 1; medium "1 (recommended) or 2"; expanded, large, extra-large 2. At medium, "To maximize horizontal space for two-pane layouts, use a bottom navigation bar or modal navigation rail."

Behavior (List-detail):

- "Back button: Appears in detail view only for single-pane layouts"
- "Selected state: Appears only in list view for two-pane layouts"

**Resizing between one and two panes**, under "Transitioning between layouts":

- _No selected item:_ "A single-pane layout shows a list view, while a two-pane layout shows placeholder content in the detail pane." "In some cases, such as multi-select, the most recently used pane should stay visible when switching to single-pane layout."
- _Selected item, one to two panes:_ "both panes should be shown and the selected item's details are visible."
- _Selected item, two to one pane_ ("the view depends on the product"):
  - "The detail pane should typically show in a single-pane layout, and an app bar appears"
  - "If the product supports selection without deep navigation, like multi-select, the list view can show with the item selected"
  - "Consistency is key: If a layout showed the list view previously, it should return to that view when returning to a single pane"
  - Caption: "When a foldable closes with an item selected, the single pane shows the detail view"
- _Persistent states:_ "In most cases, a state should be saved when navigating between detail views. This includes read and unread content." "Detail views should retain their scroll position when navigating to other items."

### Supporting pane

"Use the supporting pane layout when the secondary content is only meaningful in relation to the primary content. For content with a parent-child relationship, use a list-detail layout instead." The primary area is "typically about two-thirds" (Canonical examples overview). Placement (Supporting pane):

| Placement            | Width         | Breakpoint        |
| -------------------- | ------------- | ----------------- |
| Below the focus pane | Flexible      | Compact or medium |
| Leading or trailing  | Fixed (360dp) | Expanded          |

"A bottom sheet can be useful for keeping focus on the primary pane while providing access to supporting information" (compact).

### Feed

A grid of cards or list items. Compact: "stack vertically, like a list of cards with individual items filling the width of the pane." Medium: may split into columns. Expanded and up: "The number of columns should usually increase." Items "should reflow when the amount of available space changes." (Feed)

## 4. Navigation per breakpoint

**M3 Expressive changes.** "The navigation drawer is no longer recommended in the Material 3 Expressive update... use an expanded navigation rail, which has mostly the same functionality of the navigation drawer and adapts better across breakpoints." (Nav drawer). The rail now comes in **collapsed** ("replaces baseline nav rail") and **expanded** ("replaces navigation drawer"). The expanded rail is either standard (beside content) or modal (over content) (Nav rail). The baseline nav bar was replaced by the shorter "flexible navigation bar" (Nav bar).

- **Navigation bar** (Nav bar): "Only use navigation bars for compact and medium breakpoints." 3–5 destinations. "Don't use a navigation bar for fewer than three destinations. Instead, use tabs." Vertical items in compact, horizontal items in medium. Spans 100% of window width at the bottom. "Don't use navigation bars for desktop layouts."
- **Collapsed rail** (Nav rail): 3–7 items on the leading edge; "It should not be hidden." For medium to extra-large. "In medium windows with few destinations, consider using a navigation bar instead. Compact windows should always use a navigation bar."
- **Expanded rail** (Nav rail): "should always open from a menu icon". It can show secondary destinations. Standard is "best for larger windows with lots of available space". Modal is for "Information dense layouts where space is limited" and "Products with many navigation items". "In immersive experiences, the expanded navigation rail can be hidden entirely." Breakpoints, large/extra-large: "An expanded navigation rail is best suited for extra-large windows... Consider collapsing the navigation rail when space is needed, or when on pages deeper in the page hierarchy."
- **Resizing** (Nav rail): "When moving from a large screen to a small screen, a navigation rail can transform into a navigation bar... Never use the navigation rail and navigation bar simultaneously." "When the navigation rail transitions from collapsed to expanded, the contents of the page should automatically adjust to fit." The rail sits "outside any panes, always along the leading edge of the window."
- **Secondary navigation** (Breakpoints, expanded and up): "For sorting, filtering, or secondary navigation, use tabs or other components directly in the pane." At medium and expanded, "The navigation rail can be hidden in secondary destinations as long as the primary destination can still be accessed using a back button."
- **Legacy drawer guidance** (still published, marked superseded): standard drawer at expanded and up, modal drawer at compact and medium. "Avoid using a navigation drawer with other primary navigation components, such as a navigation bar." (Nav drawer)

## 5. Mapping to CSS container queries (what M3 does and does not say)

- M3 keys every rule to **window** width. "A breakpoint... is the window size". Margins are "the spaces between the edge of a window area and the elements within". M3 never mentions CSS container queries.
- M3 does describe navigation eating into pane space. "When a navigation rail or drawer is present, it only reduces the size of one pane" (Panes). In split-pane at large and extra-large, "navigation components shrink the leading pane, so the spacer remains centered" (Breakpoints). "When the navigation rail transitions from collapsed to expanded, the contents of the page should automatically adjust to fit" (Nav rail). So the **navigation choice** follows window width, while **pane content** responds to what space is left after navigation. That split is what a container query on the content area measures.
- M3 gives no web unit conversion for breakpoints. Reading 1dp as 1 CSS px is a common web convention, but M3 does not state it.

## Implications for this app (interpretation, not M3 text)

The points below are my reading of the guidance against `PageShell` (`src/components/layout/PageShell.tsx`) and the shadcn sidebar (`SIDEBAR_WIDTH` 16rem = 256px, icon mode 3rem = 48px). They are not M3 statements.

1. **Two kinds of query.** Global navigation (phone tab bar versus sidebar) follows window width, so viewport media queries fit, as M3 intends. Page panes should use container queries on the content area, because the sidebar's collapsed or expanded state changes the space left. This matches what PageShell already does.
2. **Thresholds.** If 1dp is read as 1px, M3's window breakpoints are 600 / 840 / 1200 / 1600. On a laptop with the sidebar expanded (256px), an 1280px window leaves about 1024px of content, which is M3 "expanded" territory and therefore two panes. PageShell's current `@[1100px]` two-column switch is close to that. `@[1500px]` for three columns follows the spirit of the rule that three panes are extra-large only (1600 window). Candidate container thresholds: about 600 (stop being a phone stack), about 840 (two panes allowed), about 1200 or more (a third pane or wider fixed pane).
3. **Fixed pane widths.** M3's fixed pane is 360 at expanded and 412 at large and up, with side sheets up to 400. PageShell's 320/380 rail and 280/300 filter columns are narrower than M3's defaults. That is not wrong (M3 says "by default"), but it is a reference point. M3's split-pane is 50/50, versus `split`'s 55/45 at 1500.
4. **Phone (the everyday device) is compact.** One pane, bottom navigation bar with 3–5 destinations, supporting content below or in a bottom sheet, full-screen or basic dialogs. List-detail shows one view at a time, with a back button only in the detail view.
5. **List-detail collapse rule for `split` / `triple`.** If an item is selected when the layout drops from two panes to one, show the detail view with an app bar and back button. If the user was on the list, return them to the list. With nothing selected, show the list, and show an empty placeholder in the detail pane when it is visible. Keep the selected id in the URL or another shared state so it survives the width change, and keep the detail scroll position.
6. **Sidebar as M3 rail.** The collapsible desktop sidebar maps to the standard expanded rail (expanded) and the collapsed rail (icon mode). M3 says the collapsed rail "should not be hidden" and the page "should automatically adjust" when it toggles, which container queries already give. M3 also suggests collapsing it "when space is needed, or when on pages deeper in the page hierarchy." Never show the bottom bar and the rail at the same time.
7. **Laptop at 1–2 times a week** sits mostly in expanded or large. M3 says large and extra-large layouts are optional ("Some products may not need large and extra-large breakpoints"), so beyond ~1200px of content, capping width (40–60 characters per line) is acceptable instead of adding panes.

## Not verified

- The rendered pages were not viewed in a browser. Images, figure-only content, and anything not in the page JSON (such as diagrams with numbers drawn in) were not reviewed.
- The tab sub-URLs were checked for HTTP 200, not for rendered content per tab.
- No dp-to-CSS-px statement for breakpoints was found on m3.material.io. That mapping is convention, not source.
- Jetpack Compose and Android developer docs (developer.android.com), which carry the implementation side of window size classes, were deliberately excluded under the ticket's "m3.material.io only" constraint.
