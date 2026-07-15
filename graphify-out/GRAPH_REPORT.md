# Graph Report - BERZUDA  (2026-07-15)

## Corpus Check
- 63 files · ~188,064 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 421 nodes · 817 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4b0d8156`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CollectionScreen.tsx
- Repository
- ApiClient.tsx
- SupabaseRepository
- compilerOptions
- package.json
- RequestScreen.tsx
- expo
- postman.ts
- route.ts
- RequestLab
- proxy.ts
- Expo HAS CHANGED
- layout.tsx
- next.config.ts
- next-env.d.ts

## God Nodes (most connected - your core abstractions)
1. `Repository` - 36 edges
2. `SupabaseRepository` - 34 edges
3. `ApiRequest` - 22 edges
4. `LocalRepository` - 20 edges
5. `createClient()` - 17 edges
6. `newId()` - 17 edges
7. `Workspace` - 16 edges
8. `Collection` - 16 edges
9. `Folder` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `ChooseAppPage()` --calls--> `createClient()`  [EXTRACTED]
  app/choose-app/page.tsx → lib/supabase/server.ts
- `SettingsPage()` --calls--> `createClient()`  [EXTRACTED]
  app/settings/page.tsx → lib/supabase/server.ts
- `KeyValueEditor()` --calls--> `newId()`  [EXTRACTED]
  components/ApiClient.tsx → src/lib/id.ts
- `EnvironmentManager()` --calls--> `newId()`  [EXTRACTED]
  components/ApiClient.tsx → src/lib/id.ts
- `AdminPage()` --calls--> `createClient()`  [EXTRACTED]
  app/admin/page.tsx → lib/supabase/server.ts

## Import Cycles
- None detected.

## Communities (19 total, 4 thin omitted)

### Community 0 - "CollectionScreen.tsx"
Cohesion: 0.07
Nodes (49): App(), Stack, theme, usePortalShellOnWeb(), react, react, ActionSheetOption, Props (+41 more)

### Community 1 - "Repository"
Cohesion: 0.07
Nodes (8): KEYS, LocalRepository, writeAll(), Repository, ApiRequest, Collection, Folder, Workspace

### Community 2 - "ApiClient.tsx"
Cohesion: 0.05
Nodes (34): ChooseAppPage(), SettingsPage(), AdminUser, Complaint, ApiClient(), BodyEditor(), CollectionTreeNode(), createCurl() (+26 more)

### Community 3 - "SupabaseRepository"
Cohesion: 0.06
Nodes (19): CollectionRow, EnvironmentRow, FolderRow, RequestRow, SupabaseRepository, toCollection(), toEnvironment(), toFolder() (+11 more)

### Community 4 - "compilerOptions"
Cohesion: 0.06
Nodes (35): app/**/*.ts, app/**/*.tsx, components/**/*.tsx, dom, dom.iterable, esnext, lib/**/*.ts, .next/dev/types/**/*.ts (+27 more)

### Community 5 - "package.json"
Cohesion: 0.06
Nodes (31): lucide-react, next, dependencies, lucide-react, next, react-dom, @supabase/ssr, @supabase/supabase-js (+23 more)

### Community 6 - "RequestScreen.tsx"
Cohesion: 0.17
Nodes (16): buildUrl(), encodeBase64(), formatBytes(), prettyBody(), sendRequest(), AUTH_TYPES, BODY_MODES, METHODS (+8 more)

### Community 7 - "expo"
Cohesion: 0.10
Nodes (20): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, expo, android (+12 more)

### Community 8 - "postman.ts"
Cohesion: 0.15
Nodes (19): exportPostmanCollection(), ImportedCollection, importPostmanCollection(), parseAuth(), parseUrl(), PostmanAuth, PostmanCollectionFile, PostmanItem (+11 more)

### Community 9 - "route.ts"
Cohesion: 0.16
Nodes (19): AdminPage(), DELETE(), GET(), PATCH(), POST(), currentUser(), GET(), PATCH() (+11 more)

### Community 10 - "RequestLab"
Cohesion: 0.33
Nodes (5): Authentication and data isolation, Docker, Local setup, Production, RequestLab

### Community 11 - "proxy.ts"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

## Knowledge Gaps
- **128 isolated node(s):** `Stack`, `theme`, `name`, `slug`, `version` (+123 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `CollectionScreen.tsx` to `package.json`, `RequestScreen.tsx`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `dependencies` connect `package.json` to `CollectionScreen.tsx`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `Repository` connect `Repository` to `ApiClient.tsx`, `SupabaseRepository`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `Stack`, `theme`, `name` to the rest of the system?**
  _128 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CollectionScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06806526806526807 - nodes in this community are weakly interconnected._
- **Should `Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.07265306122448979 - nodes in this community are weakly interconnected._
- **Should `ApiClient.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05201266395296246 - nodes in this community are weakly interconnected._