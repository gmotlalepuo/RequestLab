# RequestLab UI/UX Audit

Audit date: 2026-07-20  
Scope: landing page, authentication, authenticated workbench, collection tree, environments, response/request editors, settings, and admin portal.  
Method: Impeccable and UI/UX Pro Max heuristics, Graphify component mapping, source/CSS review, production build, and Playwright checks at a 390×844 mobile viewport. Authenticated screens were reviewed statically because this read-only audit did not create or use a test login session.

## Overall assessment

> Remediation update (2026-07-20): the highest-priority dialog, touch-target, modal-focus, live-feedback, CTA consistency, password workflow, and hero-asset recommendations have been implemented. The large workbench/CSS decomposition and full semantic admin-table conversion remain deliberate follow-up refactors because combining them with the security-critical release would create unnecessary regression risk.

RequestLab already has a coherent visual identity and a credible Postman-inspired workbench. The public mobile experience is particularly strong: the compact logo works, the hierarchy is clear, buttons are easy to find, there is no horizontal overflow at 390px, and the tested landing/login flows produced no browser console warnings. Dark/light theme infrastructure, focus-visible states, reduced-motion rules, labeled resizers, and status messaging are meaningful strengths.

The next quality step is not a visual redesign. It is interaction-system consolidation: replace native browser dialogs, harden keyboard/focus behavior, increase touch targets, make admin data structures semantically accessible, and split the very large workbench/style layers into maintainable primitives.

No UI changes were implemented during this audit.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Visual hierarchy | 4/4 | Strong landing narrative, clear workbench zones, visible primary actions, restrained dividers. |
| Visual design | 4/4 | Distinct brand, cohesive blue/cyan palette, convincing constellation visual, good light-mode polish. |
| Consistency | 3/4 | Core tokens are present, but native dialogs and many later CSS overrides create interaction/style exceptions. |
| Usability | 3/4 | Main flows are understandable and responsive; touch target size, modal focus, and dense admin/tool controls need work. |
| Craft | 3/4 | Good motion and responsive details; large monoliths, stale CTA routing, and oversized/unused assets reduce finish. |
| **Total** | **17/20** | Strong product foundation with targeted hardening needed. |

## Anti-pattern verdict

**Mostly intentional, with mild template-like repetition.** The product avoids generic glass-card overload and gradient-heavy decoration. Repeated section kickers, numbered feature cards, and generic capability language on the landing page are the main “AI landing page” signals, but they do not dominate the experience.

## P0 — Blocking

No P0 UI defects were confirmed in the audited public flows.

## P1 — High priority

### UI-001 — Replace native `prompt()` and `confirm()` with one accessible dialog system

**Evidence:** 13 native-dialog calls, including `components/ApiClient.tsx:586`, `components/ApiClient.tsx:609`, `components/ApiClient.tsx:636`, `components/ApiClient.tsx:714`, `components/ApiClient.tsx:745`, `components/ApiClient.tsx:773`, `components/AdminPortal.tsx:44`, and `components/WorkspacePeople.tsx:38`.  
**Why it matters:** Native prompts break visual continuity, provide weak validation, behave inconsistently on mobile, and make destructive actions/password workflows harder to explain and recover from.

**Recommendation:** Standardize on the existing app-style prompt/action-sheet primitives. Every dialog should have initial focus, a focus trap, Escape/backdrop behavior, focus restoration, clear destructive labeling, inline validation, loading state, and mobile bottom-sheet presentation where appropriate. Never collect a password through `window.prompt()`.

### UI-002 — Raise interactive targets to a 44×44 CSS-pixel baseline

**Evidence:** `app/globals.css` defines many 29–42px buttons/controls, including tree actions, menu controls, portal navigation, theme toggles, and admin row actions (for example `app/globals.css:4731`, `app/globals.css:4749`, `app/globals.css:4796`, `app/globals.css:4914-4935`).  
**Why it matters:** The authenticated mobile workbench is dense. Small targets increase accidental taps, especially for star, overflow, copy, close, and resize controls.

**Recommendation:** Preserve compact visual glyphs but enlarge their hit boxes to at least 44px on coarse pointers. Keep 8px separation between adjacent destructive/overflow controls and ensure safe-area padding around fixed mobile navigation.

### UI-003 — Complete modal and popover keyboard behavior

**Evidence:** Dialog roles exist in `components/WorkspacePeople.tsx:41` and `components/ApiClient.tsx:1861`, `components/ApiClient.tsx:1917`, `components/ApiClient.tsx:2043`, but the reviewed implementations do not show a shared focus-trap/restoration mechanism. Hover/focus variable popovers are controlled primarily through CSS at `app/globals.css:484`.  
**Why it matters:** Screen-reader and keyboard users can lose context behind overlays or have difficulty dismissing them consistently.

**Recommendation:** Use one accessible dialog/popover foundation with semantic title/description wiring, focus containment, Escape dismissal, outside-click rules, restoration to the trigger, and deterministic mobile behavior. Test with keyboard only and VoiceOver/TalkBack.

## P2 — Medium priority

### UI-004 — Break up the workbench and stylesheet into stable feature modules

**Evidence:** `components/ApiClient.tsx` is approximately 2,815 lines/91 KB; `app/globals.css` is approximately 5,000 lines/108 KB with repeated breakpoint and focus blocks. `components/AdminPortal.tsx` compresses substantial behavior into roughly 45 very long lines.  
**Why it matters:** Global overrides make regressions likely, slow design iteration, and hide responsibility for responsive behavior. The large component also causes unrelated state changes to share a render boundary.

**Recommendation:** Extract collection tree, request builder, environment editor, response viewer, cURL panel, navigation shell, and modal primitives. Introduce scoped styles or clearly layered CSS files and a single token source. Add focused interaction tests around each extraction; avoid a visual rewrite during decomposition.

### UI-005 — Use semantic tables and complete ARIA tab behavior in admin

**Evidence:** Admin data grids are nested `div`s (`components/AdminPortal.tsx:51-52`), while tabs have `role="tab"` but no associated `tabpanel`, `aria-controls`, roving tabindex, or arrow-key behavior (`components/AdminPortal.tsx:48`).  
**Why it matters:** Visual sorting/filtering works, but table relationships and tab navigation are less understandable to assistive technologies.

**Recommendation:** Use `<table>` with caption, headers, row/column semantics, and `aria-sort`, or implement the full ARIA grid pattern only if necessary. Add linked tab/tabpanel IDs and keyboard navigation. Preserve the current mobile overflow container.

### UI-006 — Improve live feedback and error recovery in settings/admin

**Evidence:** Settings alerts at `components/SettingsPortal.tsx:65` have visual classes but no `role="alert"`, `role="status"`, or live region. Complaint loading failures are silently ignored at `components/SettingsPortal.tsx:21-25`.  
**Why it matters:** Users may not hear success/failure changes, and support history can appear empty when the request actually failed.

**Recommendation:** Use assertive live regions for blocking errors and polite status regions for success. Distinguish empty, loading, and failed states; provide retry; focus the first invalid field; and retain user-entered complaint text after a failed submission.

### UI-007 — Normalize landing-page CTA intent and restricted-access messaging

**Evidence:** `components/LandingExperience.tsx:237` links “Sign in to your workspace” to `?mode=signup`, even though accounts are administrator-created. The footer still exposes a separate “Sign in” link at `components/LandingExperience.tsx:247`, while the primary navigation uses “Get started.”  
**Why it matters:** The destination works because the auth page normalizes behavior, but the URL and labels encode conflicting acquisition models.

**Recommendation:** Define one restricted-access CTA model: “Get started” can route to login/contact-admin guidance, while returning users get a secondary login affordance only where product intent calls for it. Remove the stale signup query and keep wording consistent across hero, final CTA, footer, and auth page.

### UI-008 — Optimize and clean up image assets

**Evidence:** `public/requestlab-api-constellation.png` is about 1.34 MB and is used at `components/LandingExperience.tsx:163`; unused `requestlab-tech-lab.png` and `requestlab-logo.png` total about 2.58 MB.  
**Why it matters:** Next Image mitigates delivery cost for the used image, but large source assets still increase repository/deployment weight and cold optimization work. Unused visuals create brand ambiguity.

**Recommendation:** Export the constellation at its actual maximum display dimensions in WebP/AVIF with transparency, verify dark/light edges, and remove confirmed-unused raster assets after checking external references.

## P3 — Polish

### UI-009 — Reduce repetitive landing-page motifs and generic copy

**Evidence:** Repeated section kickers and numbered cards in `components/LandingExperience.tsx:185-240`.  
**Recommendation:** Keep the strongest numbered workflow, but vary the feature section with a concrete product screenshot, real request/response content, or a collaboration proof point. Replace generic claims with measurable or product-specific language.

### UI-010 — Consolidate breakpoints and hard-coded color exceptions

**Evidence:** `app/globals.css` contains more than 25 media-query blocks and many literal color values alongside theme variables.  
**Recommendation:** Establish a small breakpoint scale, semantic surface/text/border/status tokens, and documented elevation/z-index levels. Migrate opportunistically while touching components rather than in a risky all-at-once rewrite.

## Positive findings

- Mobile landing and login at 390×844 had no horizontal overflow and no browser console warnings.
- The compact mobile logo is clear and no longer competes with header actions.
- Landing-page primary/secondary actions are obvious, full-width, and visually differentiated on mobile.
- Focus-visible styling is defined globally (`app/globals.css:41-45`).
- Reduced-motion accommodations exist in multiple interaction layers (`app/globals.css:1573`, `app/globals.css:4050`, `app/globals.css:4668`).
- Resizers expose separator roles, orientation, and current values (`components/ApiClient.tsx:1401-1404`, `components/ApiClient.tsx:1657-1663`, `components/ApiClient.tsx:2734-2740`).
- Folder starring exposes `aria-pressed` (`components/ApiClient.tsx:2391-2392`).
- Authentication fields use appropriate autocomplete and include a show/hide password control (`components/AuthForm.tsx:44`).
- The public landing page has a strong, distinctive constellation visual and cohesive light-mode treatment.
- TypeScript and production builds pass.

## Recommended improvement sequence

1. Unify dialogs/popovers and enlarge coarse-pointer hit targets.
2. Complete modal, table, tab, and live-region accessibility.
3. Decompose the workbench/styles without changing the established visual identity.
4. Normalize CTA wording and optimize/remove image assets.
5. Run an authenticated cross-device test matrix after the security-critical proxy work is addressed.

## Suggested validation matrix for the future implementation phase

- Viewports: 360×800, 390×844, 768×1024, 1280×800, 1440×900.
- Themes: light, dark, system preference, and forced-colors/high-contrast where supported.
- Inputs: mouse, keyboard only, touch/coarse pointer, and screen reader.
- Workflows: collection/folder CRUD, drag-and-drop plus keyboard alternative, variable editing, request send/cancel/timeout/large response, cURL copy, admin filtering/pagination, complaint failure/retry, and every modal dismissal path.
