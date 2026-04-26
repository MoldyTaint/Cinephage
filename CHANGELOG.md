## 0.3.0 (2026-04-21)

### Features

- Add milkie.cc private tracker ([6e88ab2](https://github.com/MoldyTaint/Cinephage/commit/6e88ab2c4903f74aa9ff4457996c1412d991c865)) — by Tamás Nagy (T-bond)
- Add content rating filter to discover page ([e1836ef](https://github.com/MoldyTaint/Cinephage/commit/e1836efe7c661c9a5c9977a264db8460ba17e751)) — by MoldyTaint
- Support custom process IDs for sidecars ([1b0abf4](https://github.com/MoldyTaint/Cinephage/commit/1b0abf453ed031caf9c6b9fa85f39c1f231df77b)) — by Tamás Nagy (T-bond)
- Add auto-release workflow ([d0d0a86](https://github.com/MoldyTaint/Cinephage/commit/d0d0a86e7973107a340ac0e7a042ccb97191708e)) — by MoldyTaint
- Merge release pipeline into auto-release workflow ([eb2bba8](https://github.com/MoldyTaint/Cinephage/commit/eb2bba8bbe9dcf59011d6f7aa376e65d3223b5e3)) — by MoldyTaint

### Bug Fixes

- Normalize Milkie category IDs to tracker-native mapping ([30b258e](https://github.com/MoldyTaint/Cinephage/commit/30b258ee8d270a77ca9347cebc087f5418516d89)) — by Kenneth Iwuchukwu
- Update version bump cycle to sync package-lock.json, and add contributor credit to release notes. (#293) ([d74c7c2](https://github.com/MoldyTaint/Cinephage/commit/d74c7c266d6e0e9e49c6602b19a5a77abfa6768d)) — by Kenneth Iwuchukwu
- Fix correct remote user ([7ad97ae](https://github.com/MoldyTaint/Cinephage/commit/7ad97aef4a1f391953a1598bcc5e96256cca6b8d)) — by Tamás Nagy
- Repair workspace ownership for node user and clarify sidecar UID/GID docs ([6451535](https://github.com/MoldyTaint/Cinephage/commit/645153523bf2e2a6d2139eea288f0e909acc6dc1)) — by Keonramses
- Format CHANGELOG.md after generation ([f98a0f0](https://github.com/MoldyTaint/Cinephage/commit/f98a0f05e1bdffa4d83f782ef7f8353c8659b9c5)) — by MoldyTaint
- Add bump-version to job dependencies for output access ([9ec3e40](https://github.com/MoldyTaint/Cinephage/commit/9ec3e40f4447e2bf2f4f86e1d5a9884ce7603010)) — by MoldyTaint
- Use latest-only release notes to avoid body too long error ([6ada5cc](https://github.com/MoldyTaint/Cinephage/commit/6ada5cceffe564d4ea654a61edeac48d265fd18a)) — by MoldyTaint
- Generate and upload release notes artifact from bump-version job ([aef948d](https://github.com/MoldyTaint/Cinephage/commit/aef948d4234be18f9f5eda26a3368465953df9ea)) — by MoldyTaint

### Refactoring

- Remove unreachable TV certification notes in discover filter ([0c53d4e](https://github.com/MoldyTaint/Cinephage/commit/0c53d4e1549a8ef7e028a714c33fa574299aa147)) — by MoldyTaint

### Documentation

- Update AGENTS.md with comprehensive development guidelines ([6fcbaf5](https://github.com/MoldyTaint/Cinephage/commit/6fcbaf53eeefa93267a9791ef0108af6364f52d3)) — by MoldyTaint

### Miscellaneous

- Add devcontainer support ([558bfa5](https://github.com/MoldyTaint/Cinephage/commit/558bfa5cd83176f7b59d1930bbb29521fc03b240)) — by Tamás Nagy (T-bond)
- Align runtime, stabilize workspace mount and document optional qBittorrent/SABnzbd sidecars ([11190cc](https://github.com/MoldyTaint/Cinephage/commit/11190ccd49d2e5b225d007c101264c57a2826fb8)) — by Keonramses
- Install required dependencies, auto-install Camoufox binaries and fix executable permissions ([b83748a](https://github.com/MoldyTaint/Cinephage/commit/b83748a998f0ce9e480b6561af49dcf6b7755b7c)) — by Keonramses
- Restore deleted documentation and npm command ([0aa4f16](https://github.com/MoldyTaint/Cinephage/commit/0aa4f16baabd60bc0953ce2cce7f9e629ec96fe8)) — by Tamás Nagy (T-bond)
- Bump actions/checkout from 4.2.2 to 6.0.2 ([38324fb](https://github.com/MoldyTaint/Cinephage/commit/38324fb72eabb50e0b7e7d89570867619f0ce563)) — by dependabot[bot]
- Bump actions/upload-artifact from 4 to 7 ([6142d57](https://github.com/MoldyTaint/Cinephage/commit/6142d57bd475e706f4525bf3fc2f02c33a298ae4)) — by dependabot[bot]
- Bump pino from 9.14.0 to 10.3.1 ([7552811](https://github.com/MoldyTaint/Cinephage/commit/7552811b9ccbe4ea0d2797f69015e1325b816c5c)) — by dependabot[bot]
- Bump the minor-and-patch group with 6 updates ([dab5934](https://github.com/MoldyTaint/Cinephage/commit/dab5934a97e0b4134fdeaa26562eba9a237f42f2)) — by dependabot[bot]
- Bump typescript from 5.9.3 to 6.0.3 ([a05396a](https://github.com/MoldyTaint/Cinephage/commit/a05396a683c70f3b581a565e9a96a02196c05140)) — by dependabot[bot]

## [0.7.3](https://github.com/MoldyTaint/Cinephage/compare/v0.7.2...v0.7.3) (2026-04-26)


### Bug Fixes

* correct publish-release API key header name ([48eb9e4](https://github.com/MoldyTaint/Cinephage/commit/48eb9e4029dc28fcb08417eec4e8487b02bea777))

## [0.7.2](https://github.com/MoldyTaint/Cinephage/compare/v0.7.1...v0.7.2) (2026-04-26)


### Bug Fixes

* dispatch downstream workflows from release-please, add workflow_dispatch triggers ([b2996bc](https://github.com/MoldyTaint/Cinephage/commit/b2996bcfc526bd919c24f6c389fd64f2a3a70e48))
* use dev ref for workflow_dispatch calls ([e5a323d](https://github.com/MoldyTaint/Cinephage/commit/e5a323dc6b01792efdef72a9b48c6be7203d0faa))

## [0.7.1](https://github.com/MoldyTaint/Cinephage/compare/v0.7.0...v0.7.1) (2026-04-26)


### Bug Fixes

* switch publish and discord workflows from release event to tag push ([52f2f1c](https://github.com/MoldyTaint/Cinephage/commit/52f2f1cfdcdf8a1ec653fbb6d8d9d27c8d427386))

## [0.7.0](https://github.com/MoldyTaint/Cinephage/compare/v0.6.1...v0.7.0) (2026-04-26)


### ⚠ BREAKING CHANGES

* **subtitles:** The /api/subtitles/providers/analytics endpoint response shape has changed. The analytics object (successRate, responseTimes) is removed. Provider fields are now at top level. Throttle state now includes consecutiveFailures, lastError, and lastErrorAt.
* **auth:** BETTER_AUTH_SECRET must now be explicitly set as an environment variable. The auto-generated .auth-secret file fallback is removed. Existing deployments must copy their secret from data/.auth-secret into the BETTER_AUTH_SECRET env var before upgrading, or all sessions and encrypted API keys will be lost.

### Features

* **activity:** add activity stats endpoint and enhance activity retrieval with scope filtering ([ef1df74](https://github.com/MoldyTaint/Cinephage/commit/ef1df749f4052f9d01e6d7120fbbb7e4797c7273))
* **activity:** add search_error status, activity source tracking, and fix import failure detection ([36b4474](https://github.com/MoldyTaint/Cinephage/commit/36b4474b735b0f053ee4571bba98f16e46572860))
* **activity:** add selectable history and active queue IDs for bulk actions ([63df41e](https://github.com/MoldyTaint/Cinephage/commit/63df41e84e0c21196930845b979670ddbb1f470c))
* **activity:** implement activity history management and SSE events ([dbdd7a2](https://github.com/MoldyTaint/Cinephage/commit/dbdd7a2515334baf0d95ab1f44a6a15dcdb6e4f7))
* **activity:** implement download queue tombstones for local removal suppression ([9d4a86a](https://github.com/MoldyTaint/Cinephage/commit/9d4a86a5773de3b6bc429e9bd9a9adbbfa4c2dc5))
* add auto-fill version/commit from GitHub releases to streaming indexer ([4cb831b](https://github.com/MoldyTaint/Cinephage/commit/4cb831b4834cde37c4fb7a036f54c821fdec0213))
* add automated release pipeline triggered by semver tags ([3143acc](https://github.com/MoldyTaint/Cinephage/commit/3143acc4710081c61a8ccaac4a0bedb24ecc715c))
* add configuration backup and restore with encrypted secrets ([ca0e328](https://github.com/MoldyTaint/Cinephage/commit/ca0e32816d31e8354b14b6365e3ca188b7b15c6c))
* add content rating filter to discover page ([e1836ef](https://github.com/MoldyTaint/Cinephage/commit/e1836efe7c661c9a5c9977a264db8460ba17e751))
* add downloads to allowlist, path-guard tests for symlink handling and realpath resolution ([66b4c48](https://github.com/MoldyTaint/Cinephage/commit/66b4c481dffcb9669021d96fcf19daf9cb46a5fb))
* add graceful shutdown handler for background services ([1af8c14](https://github.com/MoldyTaint/Cinephage/commit/1af8c1468540d2813add3a564b5f762b6fbb388e))
* add i18n infrastructure with Paraglide JS v2 ([ff14bb7](https://github.com/MoldyTaint/Cinephage/commit/ff14bb72d6437aadf75971e5977ba2448e78cc04))
* add isPlayed and playedPercentage to media explorer query ([32fd707](https://github.com/MoldyTaint/Cinephage/commit/32fd707f298775ab9793ba9297187b3421bc1849))
* add Kinozal indexer support ([2760f66](https://github.com/MoldyTaint/Cinephage/commit/2760f6697c308c371a3282db3e479c3e555cfb8f))
* add language filter to discover page ([df915f4](https://github.com/MoldyTaint/Cinephage/commit/df915f427d116ae34d7cf6318834a82de663ff7b))
* add Live TV channel name cleanup workflow and HLS playlist fixes ([893c83b](https://github.com/MoldyTaint/Cinephage/commit/893c83bb00644622624ca3d01d7b06970e992b7f))
* add media move functionality and enhance root folder management ([580894b](https://github.com/MoldyTaint/Cinephage/commit/580894b65249b694b6346bbd9b7fa356c5b6462b))
* add media subtype support for root folders and enforce anime root folder settings ([25648c4](https://github.com/MoldyTaint/Cinephage/commit/25648c48ecd87a75e752260aad9d9922f34513f1))
* Add milkie.cc private tracker ([6e88ab2](https://github.com/MoldyTaint/Cinephage/commit/6e88ab2c4903f74aa9ff4457996c1412d991c865))
* add missing messages and project.inlang files to Docker build ([0d89fb7](https://github.com/MoldyTaint/Cinephage/commit/0d89fb7576586cd2f50e38179ab94a5558f24cd7))
* add missing settings API endpoints ([c1b7a96](https://github.com/MoldyTaint/Cinephage/commit/c1b7a96d9fad3e4ab815234d871f2091f7e007c0))
* add native subtitle sync engine with cleanup ([f7a8dc9](https://github.com/MoldyTaint/Cinephage/commit/f7a8dc90d4446c986a8297f3ba7fd2eafb192237))
* add playback sessions and persisted support logs ([70368e9](https://github.com/MoldyTaint/Cinephage/commit/70368e91e43fd0df5bb2d3a5af1a5b2d313a6fd4))
* add plex media server integration ([bbc8f89](https://github.com/MoldyTaint/Cinephage/commit/bbc8f894cf702d472489546fe1ce8d18151331d9))
* add role column to users table ([5f602c9](https://github.com/MoldyTaint/Cinephage/commit/5f602c9a562e9437844dc1d8c182a9f3196f8321))
* add rTorrent (XML-RPC) and Transmission (RPC API) download client implementations ([59299ae](https://github.com/MoldyTaint/Cinephage/commit/59299ae0a3618c761fefc1ff4203e96cd2b1ffa6))
* add rTorrent (XML-RPC) and Transmission (RPC API) download client implementations ([#159](https://github.com/MoldyTaint/Cinephage/issues/159)) ([34661d2](https://github.com/MoldyTaint/Cinephage/commit/34661d2dba039ef0aafe9ebf87475d97450e657e))
* add source-only and resolution-only scoring formats ([3dbb858](https://github.com/MoldyTaint/Cinephage/commit/3dbb8589559aea1dfa32e86fc290a399bd6391d5))
* add unified status page data loader ([ba9de25](https://github.com/MoldyTaint/Cinephage/commit/ba9de254ecce49d6497ad3d60481884863110e05))
* add unified summary cards and combined scan/sync status to status page ([e6dfcc6](https://github.com/MoldyTaint/Cinephage/commit/e6dfcc66835901e0726c7e1493018d7e559c2a94))
* add user language preference API and database schema ([aeff37f](https://github.com/MoldyTaint/Cinephage/commit/aeff37fe1aaafa08c000241fe568ce85ef280945))
* **api:** enhance JSON response formatting in health and system status endpoints ([af91a14](https://github.com/MoldyTaint/Cinephage/commit/af91a14f6f59eeda59b569b69c7e8434d15cdefc))
* **auth:** Add database path configuration via environment variables ([c446896](https://github.com/MoldyTaint/Cinephage/commit/c446896f8f574ab377ccf77f138c6a62c4af7099))
* **auth:** require BETTER_AUTH_SECRET env var and remove auto-generation ([7ed0db7](https://github.com/MoldyTaint/Cinephage/commit/7ed0db733d7c22888e639dab044e0c00a0c573a5))
* auto-detect latest CI candidate for releases and remove manual release notes input ([bcce4a7](https://github.com/MoldyTaint/Cinephage/commit/bcce4a71a89290e3f866dcb634bdf12465fb6dfa))
* canonicalize release parsing and scoring attributes ([2d62d9f](https://github.com/MoldyTaint/Cinephage/commit/2d62d9f054ab56ede2082efef080426e62993a17))
* **ci:** add auto-release workflow ([d0d0a86](https://github.com/MoldyTaint/Cinephage/commit/d0d0a86e7973107a340ac0e7a042ccb97191708e))
* **ci:** add Discord announcement to auto-release workflow ([2fc3d54](https://github.com/MoldyTaint/Cinephage/commit/2fc3d545900a30fae344f383048542b119cf9274))
* **ci:** merge release pipeline into auto-release workflow ([eb2bba8](https://github.com/MoldyTaint/Cinephage/commit/eb2bba8bbe9dcf59011d6f7aa376e65d3223b5e3))
* **ci:** replace broken auto-release with release-please ([35e5205](https://github.com/MoldyTaint/Cinephage/commit/35e520532d29bdc885852d1ba875dc1640a28ff4))
* create unified status page composing storage and media server sections ([1b9966b](https://github.com/MoldyTaint/Cinephage/commit/1b9966b593e896a596a19a1b42aa31d129cbaba0))
* **docker:** update base image to node:24-trixie-slim and enhance Dockerfile for production ([#157](https://github.com/MoldyTaint/Cinephage/issues/157)) ([4118437](https://github.com/MoldyTaint/Cinephage/commit/411843776833465d05cefba4b7f8cc63eae68c26))
* enforce admin authorization on API endpoints ([5a58783](https://github.com/MoldyTaint/Cinephage/commit/5a587838878a46a4645ac3850f5f4ea1cefb5d43))
* Enhance error handling and indexer availability checks in search functionality ([ecda835](https://github.com/MoldyTaint/Cinephage/commit/ecda8356ff87cfbe590aefdb47f74f777a523079))
* Enhance library and root folder management ([d4c19b8](https://github.com/MoldyTaint/Cinephage/commit/d4c19b89dc9ff7439276dccc9ba5a792f5a6bb0c))
* Enhance library navigation and anime root folder enforcement ([95f131f](https://github.com/MoldyTaint/Cinephage/commit/95f131f5f4d03cdf3ed3943a9add61d6b5512592))
* enhance library pages with better data handling ([328e113](https://github.com/MoldyTaint/Cinephage/commit/328e113a251628ef689bebcd771b2f363d75533e))
* enhance manual import service with anime classification and match consensus ([a98ed1e](https://github.com/MoldyTaint/Cinephage/commit/a98ed1e7f8b52a26e855c3b464a9be5fbbc9926d))
* enhance root folder validation with overlap checks and error handling ([5efa0d1](https://github.com/MoldyTaint/Cinephage/commit/5efa0d108ca40a5c57e0f9e8e1fb44c0efc24092))
* Enhance RuTracker search functionality and episode handling ([ce7ea35](https://github.com/MoldyTaint/Cinephage/commit/ce7ea355e6f1ce37f495b52b419dd9b126474688))
* extract MediaServerStatsSection component for unified status page ([cfedb36](https://github.com/MoldyTaint/Cinephage/commit/cfedb36107b8121a13b4e6464b7d125142594071))
* **i18n:** align spanish tranlation paraglide keys ([be7a955](https://github.com/MoldyTaint/Cinephage/commit/be7a955bad93ee07a173ae711400fc35a775cc7b))
* implement admin password reset functionality and update documentation ([fd230db](https://github.com/MoldyTaint/Cinephage/commit/fd230db26636be9e9d230a985724d1f029eb3415))
* implement new health and readiness endpoints, enhance docker ownership handling, improve startup configuration and update documentation ([2cefd80](https://github.com/MoldyTaint/Cinephage/commit/2cefd80e1e515fda56b5d8f878cbad1b15fecae9))
* implement RBAC authentication system ([8c57c3f](https://github.com/MoldyTaint/Cinephage/commit/8c57c3fbd4110b67007773a35556e378e08b8b51))
* improve ActivityService and TMDB error handling ([cc6498e](https://github.com/MoldyTaint/Cinephage/commit/cc6498e2c132fd36c05a1afbb2cfe348d2a875c7))
* improve streaming prefetch and usenet playback resilience ([5cec266](https://github.com/MoldyTaint/Cinephage/commit/5cec266b94b710b1ac1fac0f52a479f15d01636c))
* **indexers:** improve modal layout and add automatic language detection ([fa0d8a2](https://github.com/MoldyTaint/Cinephage/commit/fa0d8a2d05ad2ea3a862d808d949330747cffab8))
* integrate i18n into application shell ([e59c6d1](https://github.com/MoldyTaint/Cinephage/commit/e59c6d1ad36478b810a8e8ac5ce08f1a039237f0))
* introduce import wizard with API and error handling refactor ([545a67e](https://github.com/MoldyTaint/Cinephage/commit/545a67eeb9794db75361bf03e623496383976c54))
* **library:** introduce custom library support and backfill existing media ([3847ecd](https://github.com/MoldyTaint/Cinephage/commit/3847ecd7d8b39f299b1aae3c14d47c951b876c73))
* **livetv,auth,streaming:** integrate logo picker and improve streaming auth ([137db96](https://github.com/MoldyTaint/Cinephage/commit/137db96769508c5b9f0d398c386f328d46c464f4))
* **livetv:** add EPG sync state tracking and robust M3U EPG parsing ([2637bf5](https://github.com/MoldyTaint/Cinephage/commit/2637bf57ecb33c8e189b49c6ef4b04790f8e987d))
* **livetv:** add xstream URL normalization and player API URL builder ([5f3bbf2](https://github.com/MoldyTaint/Cinephage/commit/5f3bbf2dadd63db1538e24d1f6ed96aa82c6b486))
* **livetv:** improve EPG source resolution and provider sync cleanup ([ae77bcb](https://github.com/MoldyTaint/Cinephage/commit/ae77bcb17317d160748d6af0f5029d85f715d787))
* localize and enhance library storage management ([07b9ba0](https://github.com/MoldyTaint/Cinephage/commit/07b9ba02fffe9bc02db555f42232d36c41f7ff89))
* **logging:** refactor environment variable retrieval for better compatibility ([e77291d](https://github.com/MoldyTaint/Cinephage/commit/e77291d27044d87d30e15dc550dcf8388ba78a28))
* major development branch with auth, SSE, search, and system improvements ([1a1ba30](https://github.com/MoldyTaint/Cinephage/commit/1a1ba309dcfa6e6745ff1fcade268e2b781791f4))
* migrate all route pages to i18n ([6d95f2f](https://github.com/MoldyTaint/Cinephage/commit/6d95f2f9c9457514b60a6e4c8e0ed734d194013f))
* migrate all Svelte components to i18n ([04691c5](https://github.com/MoldyTaint/Cinephage/commit/04691c59a8dab7567aa3db325f273eef7ac6c8df))
* **monitoring:** add history cleanup task, streaming key pre-check, and provider availability guards ([04bae6c](https://github.com/MoldyTaint/Cinephage/commit/04bae6c481c3437f1f131d9f0b0917bc0973106d))
* **naming:** expand release metadata for rename previews ([5dc957b](https://github.com/MoldyTaint/Cinephage/commit/5dc957bd74ea4c94d883a4ffd819c5f57a831956))
* overhaul TV show subtitle management UX ([30cfd9c](https://github.com/MoldyTaint/Cinephage/commit/30cfd9c61a39af14b98ba82d526aa0d2c59e0230))
* **rate-limit:** Add private IP exemption for rate limiting ([7bbf26a](https://github.com/MoldyTaint/Cinephage/commit/7bbf26a79afed6e6dbd8d6c54bb611710724551f))
* redesign media explorer filter bar with tiered chip layout ([9180108](https://github.com/MoldyTaint/Cinephage/commit/9180108efdaa772a91d8da497e1693997dd6b804))
* redesign playback column with isPlayed and playedPercentage indicators ([92bcd03](https://github.com/MoldyTaint/Cinephage/commit/92bcd033184ced48ab38a9dfd7c8761d9bcd5d37))
* refine quality scoring UI and search result details ([8938b25](https://github.com/MoldyTaint/Cinephage/commit/8938b25fd6b4f979333e14fcc696d140fef6e388))
* **release:** enhance version bump logic for dev branch and add parsing for stable tags ([63ddd5c](https://github.com/MoldyTaint/Cinephage/commit/63ddd5c468f11ab4c4a5db0976fd52fb1d1a4c7b))
* **search:** implement auto search strategy for RuTracker and enhance episode handling ([31489f9](https://github.com/MoldyTaint/Cinephage/commit/31489f9c8bfa09313b0355e149712eddd7b1d4b2))
* **search:** improve multi-pack detection and multi-pack search UX for tracker-style TV releases ([969b7e3](https://github.com/MoldyTaint/Cinephage/commit/969b7e308e652cb999f6a1715ad54aafa64937fd))
* skip stream probing for instant playback startup ([390ec20](https://github.com/MoldyTaint/Cinephage/commit/390ec2034bf2f970993b6dfbffa6918325df5483))
* standardize settings pages with shared components and route consolidation ([2f4e543](https://github.com/MoldyTaint/Cinephage/commit/2f4e543731a4aacc0493abb3d3ef6b95fa85b525))
* **streaming:** route resolution through Cinephage backend ([bd25039](https://github.com/MoldyTaint/Cinephage/commit/bd25039d199394aedffeb9d3507980d11ed62e20))
* streamline activity page loading ([683476e](https://github.com/MoldyTaint/Cinephage/commit/683476e5e020da0f0eb886acb96407509347da6f))
* **subtitles:** add adaptive subtitle searching with backoff after 21 days ([b7416a5](https://github.com/MoldyTaint/Cinephage/commit/b7416a5ff3cdbdbcc0da8f7e3e824da82c55ca3b))
* **subtitles:** support .strm subtitle sync with friendly errors and streamer-profile guard ([2f74f9f](https://github.com/MoldyTaint/Cinephage/commit/2f74f9f4e4a528a1358c9ea6dd8621dc9a6c7323))
* support built-in profile overrides and runtime custom formats ([4192fc6](https://github.com/MoldyTaint/Cinephage/commit/4192fc6be558d1d9d09a6b69ad4ac571ffd6b444))
* Support custom process IDs for sidecars ([1b0abf4](https://github.com/MoldyTaint/Cinephage/commit/1b0abf453ed031caf9c6b9fa85f39c1f231df77b))
* translate Spanish (es) localization file ([ff0904f](https://github.com/MoldyTaint/Cinephage/commit/ff0904f753479feb63108e54d8a4b9f2aaa66731))
* **ui:** enhance UI for mobile devices ([#158](https://github.com/MoldyTaint/Cinephage/issues/158)) ([7ef4639](https://github.com/MoldyTaint/Cinephage/commit/7ef463947a307a2ce0b13e8740201d2f1c2a7d4e))
* unify app version resolution and make streaming API key rate limits configurable via env ([7d4847d](https://github.com/MoldyTaint/Cinephage/commit/7d4847d0f55fbc74ea16cefbdd7f38fee770d3ea))
* use git-cliff for release changelog generation ([3f51526](https://github.com/MoldyTaint/Cinephage/commit/3f515266862513ac9fb141c96b6f3474bb27059b))
* **workflows:** add GHCR retag latest workflow and enhance release tagging logic ([db29bba](https://github.com/MoldyTaint/Cinephage/commit/db29bbaaea54401e865917576bd3b47889502039))
* **workflows:** add GHCR retag latest workflow and enhance release tagging logicic ([#184](https://github.com/MoldyTaint/Cinephage/issues/184)) ([03750c6](https://github.com/MoldyTaint/Cinephage/commit/03750c6630f7d72a60f3edc4ba3a197b2a39a861))


### Bug Fixes

* **activity:** add function to remove stale queue-linked activity rows ([9b46eac](https://github.com/MoldyTaint/Cinephage/commit/9b46eacdf86d796c353d45f2ea5266ef7b465f1f))
* add master playlist support for IPTV-Org streams and Jellyfin format detection ([342b989](https://github.com/MoldyTaint/Cinephage/commit/342b989693132f72996f132f06ce80a0e8e89815))
* add missing logs route and harden error handling ([a928c30](https://github.com/MoldyTaint/Cinephage/commit/a928c307937a2f88fc12fd3a19a17c6994304db6))
* add seeding limit checks for Transmission and Deluge ([168e509](https://github.com/MoldyTaint/Cinephage/commit/168e509c5cc92a8804fbdc1ffc4d79af3ab2a9f2))
* add stalled and paused download states to dashboard load ([ada9557](https://github.com/MoldyTaint/Cinephage/commit/ada95579fe1e4288600e24940b83839377d20c5f))
* add target-branch dev to release-please config ([4d75e7b](https://github.com/MoldyTaint/Cinephage/commit/4d75e7b6d3034ab928e5b25e8ca2a7767509bebb))
* address date parser edge cases — bare Z handling, test fixes, coverage ([f81dc59](https://github.com/MoldyTaint/Cinephage/commit/f81dc593ee208d46edd542d129b5cc1c962f530d))
* address date parser edge cases — bare Z handling, test fixes, coverage ([7393e02](https://github.com/MoldyTaint/Cinephage/commit/7393e02e2a554e17a0abde2be8b536c8b15e4c55))
* align Cinephage streaming auth and server address settings ([9d06186](https://github.com/MoldyTaint/Cinephage/commit/9d06186f6f9da59b11cfc2dcdc659d27f0237bc5))
* align log export validation and test setup ([cb2879f](https://github.com/MoldyTaint/Cinephage/commit/cb2879f9c8e0f847487e081b54906c15225c4a9a))
* align release notes labels with actual repo label names ([f5d7231](https://github.com/MoldyTaint/Cinephage/commit/f5d7231c40e86a3e8c710176bcd3d62f78fd0fa6))
* **auth:** add rateLimit.id column and update schema for Better Auth ([ea41ed0](https://github.com/MoldyTaint/Cinephage/commit/ea41ed0014f2861cc7d8e62d6912ef0950f264e5))
* **backend:** import SvelteURL ([b311fec](https://github.com/MoldyTaint/Cinephage/commit/b311fec4ab4666954cde1f6258312b5a2c217133))
* batch security dependency updates to resolve 30 Dependabot alerts ([ce39a96](https://github.com/MoldyTaint/Cinephage/commit/ce39a967ff8ace6438a3f5422c75407096722ea7))
* **build:** move better-sqlite3 to dependencies for proper adapter-node externalization ([625b16e](https://github.com/MoldyTaint/Cinephage/commit/625b16ee0558c8b6d848e48f8eb44f8eefbcdb46))
* bump postcss and uuid to resolve security vulnerabilities ([835fe6f](https://github.com/MoldyTaint/Cinephage/commit/835fe6fe29f68ac2ee53616b8379e10a47d87925))
* **captcha:** register captcha solver in service manager for anti-bot bypass ([3baad32](https://github.com/MoldyTaint/Cinephage/commit/3baad324cf789ad2498424ecb908c89cf4589a66))
* **ci,auth:** require BETTER_AUTH_SECRET at runtime and set it in docker healthcheck test ([2f8eee8](https://github.com/MoldyTaint/Cinephage/commit/2f8eee8f392cb22a6cf22fc0787d5e8ad12b499c))
* **ci:** add actions:write permission for workflow dispatch ([020ae42](https://github.com/MoldyTaint/Cinephage/commit/020ae42f2584b74ce0365945863f5e25739278de))
* **ci:** add bump-version to job dependencies for output access ([9ec3e40](https://github.com/MoldyTaint/Cinephage/commit/9ec3e40f4447e2bf2f4f86e1d5a9884ce7603010))
* **ci:** add gate job matching branch protection required check ([2f8ea4d](https://github.com/MoldyTaint/Cinephage/commit/2f8ea4df3501f22a2e32b12959e273e48c5e046b))
* **ci:** add workflow_dispatch inputs for Docker build triggers ([ed9f0f3](https://github.com/MoldyTaint/Cinephage/commit/ed9f0f3cadf1e48c3db475ccc29014f9fd122852))
* **CI:** authenticate release attestation and configure git tag identity ([cbb5cfc](https://github.com/MoldyTaint/Cinephage/commit/cbb5cfcef5bc600a8c6953d204659fab23721cfc))
* **ci:** fix commit detection in auto-release workflow ([1862b8c](https://github.com/MoldyTaint/Cinephage/commit/1862b8cc243b6d5c88ee291a61bc96087116c5cf))
* **ci:** format CHANGELOG.md after generation ([f98a0f0](https://github.com/MoldyTaint/Cinephage/commit/f98a0f05e1bdffa4d83f782ef7f8353c8659b9c5))
* **ci:** generate and upload release notes artifact from bump-version job ([aef948d](https://github.com/MoldyTaint/Cinephage/commit/aef948d4234be18f9f5eda26a3368465953df9ea))
* **ci:** move dotenv to dependencies and remove broken docs-deploy workflow ([8fe119f](https://github.com/MoldyTaint/Cinephage/commit/8fe119f565316859e96db452009668815ada54d8))
* **ci:** pin action SHAs, add concurrency group, normalize action versions ([beb45d4](https://github.com/MoldyTaint/Cinephage/commit/beb45d4bb10151ffe956fa27d18aa34d8d4e766f))
* **ci:** remove paths filter blocking tag-triggered Docker builds ([cc81ab3](https://github.com/MoldyTaint/Cinephage/commit/cc81ab3d7e8f6a75b88dcea00c8465980a7e012e))
* **ci:** remove redundant workflow dispatch triggers ([cdbf07c](https://github.com/MoldyTaint/Cinephage/commit/cdbf07c44f47e236fbb0b37a685e82d971138926))
* **ci:** resolve release workflow issues and backfill changelog ([3162f5e](https://github.com/MoldyTaint/Cinephage/commit/3162f5e437e862f9afbea7abba733e1f512798a8))
* **ci:** skip ci/docs/test/style scoped commits from release triggers ([d3a35c0](https://github.com/MoldyTaint/Cinephage/commit/d3a35c07b088bbae462ad0156ed33f8b1ede5387))
* **ci:** use correct actions/github-script version tag ([43ed9a8](https://github.com/MoldyTaint/Cinephage/commit/43ed9a8c684eac51a9eec5ce8935dc8d07ebc1fc))
* **ci:** use latest-only release notes to avoid body too long error ([6ada5cc](https://github.com/MoldyTaint/Cinephage/commit/6ada5cceffe564d4ea654a61edeac48d265fd18a))
* **ci:** use v4 tag for release-please action ([29df429](https://github.com/MoldyTaint/Cinephage/commit/29df429ee92d349e44fd15c6ec3e070786651586))
* clamp playedPercentage to 100 to prevent progress bar overflow ([79f2b82](https://github.com/MoldyTaint/Cinephage/commit/79f2b824278a9432cf547467e3b3d63ad5dc47e0))
* correct git-cliff template variable (timestamp not date) ([d7b06a4](https://github.com/MoldyTaint/Cinephage/commit/d7b06a401f2fe7c4ab9c0ca8683c14b2f1c70d06))
* correct syntax error in IptvOrgSelector.svelte ([88111b3](https://github.com/MoldyTaint/Cinephage/commit/88111b365fbe13dc174163dc264c5b622cd18d75))
* **dashboard:** count stalled and paused downloads in active downloads stat ([b72820d](https://github.com/MoldyTaint/Cinephage/commit/b72820dc82577d039c5e781de5e1cce2bb791fad))
* **deps:** move dotenv to core depencies, to resolve docker build failure ([71ff2b0](https://github.com/MoldyTaint/Cinephage/commit/71ff2b0536d5e889a9fb10b36d0830d50bbfc009))
* **deps:** regenerate package-lock.json ([660c56e](https://github.com/MoldyTaint/Cinephage/commit/660c56e0b73b30f2219ec99cf173ce8f1db663d8))
* **deps:** regenerate package-lock.json ([5d7727a](https://github.com/MoldyTaint/Cinephage/commit/5d7727a4484f4e79516c1475d6d197b4a912b7b3))
* **deps:** regenerate package-lock.json ([82d9f2e](https://github.com/MoldyTaint/Cinephage/commit/82d9f2e30e78a19a344da802667cc94f69f75c31))
* **deps:** resolve build-breaking dependency issues ([52b101e](https://github.com/MoldyTaint/Cinephage/commit/52b101e3ae4d01354eb2d12f562c5ba0fa376c92))
* **deps:** resolve build-breaking dependency issues ([f287278](https://github.com/MoldyTaint/Cinephage/commit/f287278d85e01f998d1f433bc89fc655114c23b5))
* **deps:** update integrity hash and add dependencies for guessit-js ([d606e86](https://github.com/MoldyTaint/Cinephage/commit/d606e8688f45c4e53f91b16a7b78cd05050c88a3))
* **devcontainer:** repair workspace ownership for node user and clarify sidecar UID/GID docs ([6451535](https://github.com/MoldyTaint/Cinephage/commit/645153523bf2e2a6d2139eea288f0e909acc6dc1))
* discover page minor adjustments ([b533983](https://github.com/MoldyTaint/Cinephage/commit/b533983ab0b1aa253c64b1f23e00c19640f552dd))
* **docker:** keep optional runtime deps for impit native bindings ([e4714dc](https://github.com/MoldyTaint/Cinephage/commit/e4714dce21c197c1c99928be62f1df7536515d73))
* **docs:** correct formatting in API documentation examples ([e8019cf](https://github.com/MoldyTaint/Cinephage/commit/e8019cf0312c1077dc16a8af366ace7bf15fa43b))
* enhance download client update schema with detailed validation and optional fields ([3a92b23](https://github.com/MoldyTaint/Cinephage/commit/3a92b23c208e244ac3d5f41e8956f4d6f56e46b0))
* exclude unaired/TBD episodes from episode counts ([189520c](https://github.com/MoldyTaint/Cinephage/commit/189520cd75cf0b6a6b30744b1a152bb6748d7a7b))
* expand dashboard history preview ([6b8a7cc](https://github.com/MoldyTaint/Cinephage/commit/6b8a7cc284b54a9dc88acd4a36c687248f211f31))
* Fix correct remote user ([7ad97ae](https://github.com/MoldyTaint/Cinephage/commit/7ad97aef4a1f391953a1598bcc5e96256cca6b8d))
* Fix Transmission seed ration and time settings not set correctly ([#290](https://github.com/MoldyTaint/Cinephage/issues/290)) ([b74d35a](https://github.com/MoldyTaint/Cinephage/commit/b74d35a5f717c9c80004d3059b4a5f05a8470fe9))
* force paraglide regeneration and fix type assertions ([d979cc6](https://github.com/MoldyTaint/Cinephage/commit/d979cc636247bd4333558723502739392cfe79b8))
* gate cloudflare streaming live test behind LIVE_TESTS env var ([cb41d4b](https://github.com/MoldyTaint/Cinephage/commit/cb41d4ba52955381bbc2557060dcb03b3c6fd5a9))
* **grab:** implement episode-only search strategy for missing episodes ([434827b](https://github.com/MoldyTaint/Cinephage/commit/434827b9c744b1ad2bf239ade6c4e70ee64df746))
* **i18n:** add missing paraglide keys for custom library UI ([bb5781b](https://github.com/MoldyTaint/Cinephage/commit/bb5781b5c598aaae635793645f8a2e255c7d946b))
* **i18n:** localize anime root-folder enforcement and warning copy ([23a2761](https://github.com/MoldyTaint/Cinephage/commit/23a27613f4312d87ff3cc613a1185bc89852e148))
* **i18n:** update German and English translations for consistency and clarity ([f4828ca](https://github.com/MoldyTaint/Cinephage/commit/f4828cafc14210d50d61fc3938edb3b79d92c70f))
* **import:** fall back to queue/folder release context for obfuscated filenames ([e693c2c](https://github.com/MoldyTaint/Cinephage/commit/e693c2cd3e94b515a0e5982b4d6b05463b5b149b))
* improve API key regeneration UX with confirmation, toasts, and data refresh ([55bdd8a](https://github.com/MoldyTaint/Cinephage/commit/55bdd8af22a5ccdb5a8e75bfa2c702334b830cc0))
* improve auth and library add error reporting ([2a2063e](https://github.com/MoldyTaint/Cinephage/commit/2a2063e6afeba5310d18d0c249bd37f618cee7b1))
* improve clipboard copy functionality and enhance user feedback in settings page ([8257e2e](https://github.com/MoldyTaint/Cinephage/commit/8257e2e501ca7ba4aeadd9ddeee271b3dbb603bd))
* improve codebase quality and type safety ([170c152](https://github.com/MoldyTaint/Cinephage/commit/170c1528f44b09feb6103a08b7258ab0a5faa2c7))
* improve homepage responsive grid layout for mobile ([4b60e6e](https://github.com/MoldyTaint/Cinephage/commit/4b60e6e72a197f1dc660d6bece604d92591cb591))
* improve russian tracker search and pointer download metadata ([e403675](https://github.com/MoldyTaint/Cinephage/commit/e40367532917b1726507056bf4b671026e4c4249))
* improve service initialization logic and enhance Dockerfile for production dependencies ([bd93c05](https://github.com/MoldyTaint/Cinephage/commit/bd93c059de3fc518d6c43c542d99e5e536af261f))
* increase timeout for scrypt-based password hashing tests on CI ([e9d5b27](https://github.com/MoldyTaint/Cinephage/commit/e9d5b2720129484786fc50bec70eb3548e1e470f))
* **indexer:** enhance search orchestrator with title variant handling and episode pointer support for RuTracker indexer ([0f24e02](https://github.com/MoldyTaint/Cinephage/commit/0f24e023dcecf6232ccb92452a437ac5e716440e))
* **indexers:** normalize Milkie category IDs to tracker-native mapping ([30b258e](https://github.com/MoldyTaint/Cinephage/commit/30b258ee8d270a77ca9347cebc087f5418516d89))
* **indexers:** preserve localized titles in interactive matching ([dbc04fe](https://github.com/MoldyTaint/Cinephage/commit/dbc04fe604d06b53d902cdc4e5f00032e0390be4))
* **indexers:** preserve Russian titles in RuTracker and Kinozal ([ecb9faa](https://github.com/MoldyTaint/Cinephage/commit/ecb9faa5a82b92936f9145c8d5d016dbffe4e71e))
* **indexers:** update Kinozal and RuTracker configurations for improved Cyrillic handling and search strategies ([0517df2](https://github.com/MoldyTaint/Cinephage/commit/0517df26dc1fae7ffbe70bb36e55ec65030a53eb))
* keep queue state consistent after import and removal ([0768c5c](https://github.com/MoldyTaint/Cinephage/commit/0768c5c30ee935753e79df8ad9e39b8a705cbd7e))
* **lint:** remove double indents ([b8da813](https://github.com/MoldyTaint/Cinephage/commit/b8da81307c6a32b71f7466a785495deffcabb876))
* **lint:** remove unused prop and replace mutable URL instance ([78f3989](https://github.com/MoldyTaint/Cinephage/commit/78f398971fba08ae49296f2e97a9a72617b6d3f7))
* **livetv:** Add logging and error handling to SSE streams ([f90573d](https://github.com/MoldyTaint/Cinephage/commit/f90573db103bf511516205d4e3693bc32fd3a838))
* **livetv:** resolve stream replay loops on stalker portals via HLS-to-TS conversion ([127e8cd](https://github.com/MoldyTaint/Cinephage/commit/127e8cdd63d249be0d0a5b76473ea5d4bc7356c2))
* make rate-limit cleanup test-safe ([9a7db72](https://github.com/MoldyTaint/Cinephage/commit/9a7db7255a2d9efd98a46e1799b3066e42be80b7))
* **missing-search:** scope RuTracker episode-only flow and prevent partial-season re-downloads in manual auto-grab ([01477fa](https://github.com/MoldyTaint/Cinephage/commit/01477fa61dc26571461b3f3b68547932aaad5f05))
* move dotenv to runtime deps and improve auth secret handling for SSR and testing environments ([bc0b4a9](https://github.com/MoldyTaint/Cinephage/commit/bc0b4a945ccb7d8503abaeeefaa1e2a6160a2337))
* nCore IMDB parsing and add debug logging for indexer search issues ([e284865](https://github.com/MoldyTaint/Cinephage/commit/e284865d250f6b8e852276f365b2777c36a1552f))
* normalize dolby vision naming output ([d5d077e](https://github.com/MoldyTaint/Cinephage/commit/d5d077e4a046e4fdfdc3603c7108eb2309f67fbc))
* normalize path handling for client paths and add tests for Windows separator support ([7c4fe7d](https://github.com/MoldyTaint/Cinephage/commit/7c4fe7d476b629b20b3e59c21b740ad1792a46ee))
* pass target-branch dev to release-please action ([ccfceba](https://github.com/MoldyTaint/Cinephage/commit/ccfcebaaf9fe639ec7791ba3a53b3bd34c832abc))
* preserve native titles in tracker search requests ([6a9738c](https://github.com/MoldyTaint/Cinephage/commit/6a9738c30191f974ce8fd3802f0453e69b4a0c8f))
* prevent legacy library backfill from reassigning root folders ([bae5442](https://github.com/MoldyTaint/Cinephage/commit/bae5442ff0c9a36c3ebfcd90e388b056352086d7))
* quote labels with colons in release notes config ([cff1b42](https://github.com/MoldyTaint/Cinephage/commit/cff1b4219a423c888fbe14d05b9f46f778c9884c))
* refresh plex libraries by folder path ([94a9a29](https://github.com/MoldyTaint/Cinephage/commit/94a9a2902393ff39eed648dda212060b0cb1642d))
* regenerate package-lock.json ([6e789cf](https://github.com/MoldyTaint/Cinephage/commit/6e789cffdb59d8bd3a5e2d4f6ff4b240e754fee1))
* **release:** update version bump cycle to sync package-lock.json, and add contributor credit to release notes. ([#293](https://github.com/MoldyTaint/Cinephage/issues/293)) ([d74c7c2](https://github.com/MoldyTaint/Cinephage/commit/d74c7c266d6e0e9e49c6602b19a5a77abfa6768d))
* remove invalid 'items' parameter from bulk operation translations ([e44fa07](https://github.com/MoldyTaint/Cinephage/commit/e44fa07e449e85a4f78d1cbcfc8e5c7c74928c3f))
* remove unused mediaTitle variable in MatchFolderModal ([dc0a611](https://github.com/MoldyTaint/Cinephage/commit/dc0a6111148dd16c10e313e768d5c808c45aeeea))
* Replace GO style date parser with a working one ([aad1501](https://github.com/MoldyTaint/Cinephage/commit/aad15014c35a02be797c2e2e5bb2ed06d945bf38))
* Replace GO style date parser with a working one ([6a7c923](https://github.com/MoldyTaint/Cinephage/commit/6a7c923b9f5886f26fc59097b71c0ce9939a4364))
* resolve 15 npm security vulnerabilities ([6be827f](https://github.com/MoldyTaint/Cinephage/commit/6be827f228d33d24f5634a258f9e2401ea3847ea))
* resolve Better Auth v1.5 API key breaking changes ([8f7719f](https://github.com/MoldyTaint/Cinephage/commit/8f7719f43b8e87676e4837a46468ec5e665748bf))
* resolve CI and Docker build failures ([dd97ff9](https://github.com/MoldyTaint/Cinephage/commit/dd97ff94df0e4f35b3537f54dc3daf1551561780))
* resolve CI failures and improve code quality ([a9ccb93](https://github.com/MoldyTaint/Cinephage/commit/a9ccb935250a31ec091fbceafb33ea6d5145be4b))
* resolve final 6 translation type errors ([7f9e843](https://github.com/MoldyTaint/Cinephage/commit/7f9e84333c1de58ce04bc5c38b3c7eeb4b90f6b6))
* resolve German translation duplicates causing type mismatches ([bbc4075](https://github.com/MoldyTaint/Cinephage/commit/bbc4075095a160cce4493a21d58394d3c6405004))
* resolve i18n translation type errors ([4d7288e](https://github.com/MoldyTaint/Cinephage/commit/4d7288e71abe75b21b8d1deb414402607fe1a932))
* resolve lint errors (each keys, unused var, unused props) ([a87daa9](https://github.com/MoldyTaint/Cinephage/commit/a87daa9076db71c649a7fd5c4bc2a7a0af271a20))
* resolve remaining i18n translation type errors ([b5f00e9](https://github.com/MoldyTaint/Cinephage/commit/b5f00e9a3cd335cb223fb14fce97c9b495ec099c))
* resolve Rutracker double-slash URL issue causing grab failures ([c9f6963](https://github.com/MoldyTaint/Cinephage/commit/c9f6963022772225607781ea167e0b5f05da98d1))
* resolve type check errors and set Better Auth to respect DATA_DIR to resolve docker build failures. ([5f6d92a](https://github.com/MoldyTaint/Cinephage/commit/5f6d92a78a06e9d6b5e71c10956ce7146a90dd27))
* resolve typecheck errors in refactored test files ([14673ef](https://github.com/MoldyTaint/Cinephage/commit/14673efa231caf9320ced6ebff882bec1681e39c))
* respect monitorSpecials setting for Season 0 episodes ([8d09083](https://github.com/MoldyTaint/Cinephage/commit/8d09083c823bb3882de5178cf3b7d7b1a64264ee))
* restore canBeRemoved for non-seeding torrents after PR 291 ([e44138c](https://github.com/MoldyTaint/Cinephage/commit/e44138cf8f5ecdbfe8520de0df48b8bde54af9a7))
* restore original test file for MonitoringSearchService ([e1abd50](https://github.com/MoldyTaint/Cinephage/commit/e1abd5056c0ed5a7a0ad64d4cadf9c9d938b4865))
* sanitize streaming indexer settings and tighten dashboard typing ([e262955](https://github.com/MoldyTaint/Cinephage/commit/e2629556aabee8b4b110fc5fb3b071cb25ca864f))
* **scan:** restore disk scan helpers and remove broken library auto-routing ([bb5781b](https://github.com/MoldyTaint/Cinephage/commit/bb5781b5c598aaae635793645f8a2e255c7d946b))
* **schema:** update CURRENT_SCHEMA_VERSION to 66 and adjust apikey schema migration ([10658be](https://github.com/MoldyTaint/Cinephage/commit/10658be056cf12fc3f53be90eeacad40773670b9))
* **search:** add filter to exclude non-video artifacts from movie/TV searches ([ef82e53](https://github.com/MoldyTaint/Cinephage/commit/ef82e53c90c9808113e0a7a67ae978184c6f822d))
* **search:** add streamer profile filtering for internal Cinephage Library indexer ([69a7552](https://github.com/MoldyTaint/Cinephage/commit/69a75526d089e0822d9065c7774a7c67ed24cdd7))
* **search:** enhance auto-search error handling and reporting ([159f782](https://github.com/MoldyTaint/Cinephage/commit/159f782691d6b66b9d88f6308b4b4a0df3b16d1d))
* **search:** enhance filtering for RuTracker season packs in TV searches ([0bfd858](https://github.com/MoldyTaint/Cinephage/commit/0bfd858e75e8df68da46c64563e36d1adbcfc9a1))
* **security:** redact credentials in API responses and settings UI ([bec28b6](https://github.com/MoldyTaint/Cinephage/commit/bec28b6db21a3bf6636e32e0d4d627a4381b8392))
* **security:** restrict filesystem browse, path traversal, TMDB proxy, and query columns ([177c395](https://github.com/MoldyTaint/Cinephage/commit/177c395a6603a402e4545297bc6f083e2109b46c))
* seed scoring profiles before library add inserts ([d5b6dbc](https://github.com/MoldyTaint/Cinephage/commit/d5b6dbcdc1cbb59fb8adceb076b3b8e958a66e6b))
* serialize Error instances in log capture store to prevent 500 on /settings/logs ([0b72e67](https://github.com/MoldyTaint/Cinephage/commit/0b72e67218ee30830ecfbaf51fdfcd414bbbdd74))
* set ORIGIN for better-auth base url fallback ([fdd87ee](https://github.com/MoldyTaint/Cinephage/commit/fdd87ee7beeb3f1a3cc29de9aa4e834b8f4a46ab))
* **sse:** Add circuit breaker logic to recordConnectionError ([b02e290](https://github.com/MoldyTaint/Cinephage/commit/b02e29066b113154a00a9c96be1e68a07a284dee))
* stop library scans excluding legitimate titles and preserve streaming file paths ([36de085](https://github.com/MoldyTaint/Cinephage/commit/36de08575532b0fb6d862f3dab1e52ab7e0cf1aa))
* **streaming:** add Cloudflare bypass and disable Vidlink provider ([adcbf3c](https://github.com/MoldyTaint/Cinephage/commit/adcbf3ccc61e4d43703d2c573810f110c5ce49b7))
* **subtitles:** authenticate before each OpenSubtitles API request ([1831e1b](https://github.com/MoldyTaint/Cinephage/commit/1831e1b0e712f3ad3c3907d8fd760541f3ad6d8f)), closes [#180](https://github.com/MoldyTaint/Cinephage/issues/180)
* **test:** fallback to built-in scoring formats when custom_formats table is unavailable ([0558005](https://github.com/MoldyTaint/Cinephage/commit/0558005e96231cb7f72c4768d0ba33d435445586))
* **tests:** use rest params in mockImplementation to satisfy TypeScript ([795df91](https://github.com/MoldyTaint/Cinephage/commit/795df91fe478c08824ba9b86846ade10e329069a))
* tighten tracker search title matching and localized fallback ([63c0e90](https://github.com/MoldyTaint/Cinephage/commit/63c0e90371d27ac6230298f9edf264c130fa9917))
* title normalization, naming cache invalidation, and log sanitization ([e3ce8a4](https://github.com/MoldyTaint/Cinephage/commit/e3ce8a4248a521e0ad691ac4f56940e2920d027a))
* Transmission download client ignores seed targets ([1a37922](https://github.com/MoldyTaint/Cinephage/commit/1a379224602f9491955d125d594e9714ac68d113))
* **tv:** exclude specials from missing-episode auto-grab and UI missing counts ([a1242f8](https://github.com/MoldyTaint/Cinephage/commit/a1242f83d1688f014b550ad238ab38c58f3e97b5))
* **ui:** move mobile SSE status badge into header and align with nav spacing ([ba81f60](https://github.com/MoldyTaint/Cinephage/commit/ba81f60dec5bc68bc5d8504395a3b965bd64f642))
* **ui:** move scan banner to visible location, minor ui/backend tweaks ([4f88ace](https://github.com/MoldyTaint/Cinephage/commit/4f88ace9fdb063e3e5394b37788e9d2408fa2212))
* unify scoring profiles into single DB source, fix profile-not-found on add-to-library ([1c1aa87](https://github.com/MoldyTaint/Cinephage/commit/1c1aa8787606fb6f4bcdbcb1f4f5e55b68a92392))
* update .gitignore to include secrets and remove sensitive .auth-secret file ([fd888e3](https://github.com/MoldyTaint/Cinephage/commit/fd888e3517e8b1f04c9f788de9f643e69c57ef53))
* update activity deletion logic to include move task history and adjust total deleted count ([182cc7c](https://github.com/MoldyTaint/Cinephage/commit/182cc7c4f839617421393233e001da7839c5878d))
* update Dockerfile to use absolute path for entrypoint script ([272567f](https://github.com/MoldyTaint/Cinephage/commit/272567f928fbf35815c3ac91795b3280a542f897))
* update media server description and enhance auth secret retrieval ([f8c75b8](https://github.com/MoldyTaint/Cinephage/commit/f8c75b875718060be796ab7ac6f7750123d26508))
* update relative imports in relocated providers.live.test.ts ([17f7f1a](https://github.com/MoldyTaint/Cinephage/commit/17f7f1afac26c601a5caae6e6505cb9f4a54e71c))
* update TMDB configuration link and enhance modal opening logic ([fb3903f](https://github.com/MoldyTaint/Cinephage/commit/fb3903fca3570e0599a22d605290e0a8ad1a79de))
* use correct episode file as upgrade baseline ([#213](https://github.com/MoldyTaint/Cinephage/issues/213)) ([458935b](https://github.com/MoldyTaint/Cinephage/commit/458935b4027345dc7412200f784a5ec5c7a5f3b8))
* use docker buildx imagetools to auto-detect CI candidate tag ([de33a07](https://github.com/MoldyTaint/Cinephage/commit/de33a073d5736a65aae13de8215d313e0f98bed5))
* use gh cli instead of curl for GHCR package auto-detection ([1928f92](https://github.com/MoldyTaint/Cinephage/commit/1928f92b4a2aba946a78b4e0dda7f5aa1490c5ef))
* verify release-please triggers on dev branch ([cb7e7e2](https://github.com/MoldyTaint/Cinephage/commit/cb7e7e2fd6e10c22f49ddd390bc78ebba666eee0))
* **version:** move version resolution logic to a dedicated module ([d0743d7](https://github.com/MoldyTaint/Cinephage/commit/d0743d7c3e7cb3e013947af734fd2350e23eace0))
* **version:** remove PUBLIC_APP_VERSION environment variable and update app version resolution logic ([e87853f](https://github.com/MoldyTaint/Cinephage/commit/e87853f02b912155e1697665607fa357cbd02729))
* **workflow:** enhance version bump logic for dev branch and add parsing for stable tags ([#183](https://github.com/MoldyTaint/Cinephage/issues/183)) ([3612257](https://github.com/MoldyTaint/Cinephage/commit/3612257d29f51f5754428aa89a123e2e7680d9c3))
* **workflows:** enhance validation for stable source tags in GHCR retag workflow ([5254a06](https://github.com/MoldyTaint/Cinephage/commit/5254a06024636aa1c54345e91dd9efb439882f08))
* **workflows:** enhance validation for stable source tags in GHCR retag workflow ([#188](https://github.com/MoldyTaint/Cinephage/issues/188)) ([71e64bf](https://github.com/MoldyTaint/Cinephage/commit/71e64bf69449f8c254a25118b8e6e477c9b0fed1))
* **workflows:** normalize semver input for source tag in GHCR retag workflow ([1f4776a](https://github.com/MoldyTaint/Cinephage/commit/1f4776a9633961a9ba12a590114e3603dd965481))


### Refactoring

* align dashboard activity with history feed ([9d7026c](https://github.com/MoldyTaint/Cinephage/commit/9d7026cd3adf1b37508636b576649544a542f3d7))
* **api:** migrate 33 API routes to use parseBody() helpers ([8a75987](https://github.com/MoldyTaint/Cinephage/commit/8a7598750a213c210f2576d57f3babfee93c3c2e))
* consolidate duplicate formatting utilities into format.ts ([bae137e](https://github.com/MoldyTaint/Cinephage/commit/bae137efee46f1f02c680a80cf6da0cac14fda01))
* **downloadClients:** consolidate NZB-Mount functionality into SABnzbd client and update related components ([2a36e04](https://github.com/MoldyTaint/Cinephage/commit/2a36e0442b0fd393ae36b2a1b4a9b0e6448bca66))
* **downloadClients:** remove NZB-Mount references and consolidate to SABnzbd functionality ([c34f055](https://github.com/MoldyTaint/Cinephage/commit/c34f05511e6e02c9c964a8862c1ebe6f3dc7fa15))
* extract dashboard queries and add progressive rendering ([b26ab99](https://github.com/MoldyTaint/Cinephage/commit/b26ab9978b605f9b188289e71e05c364432e70b3))
* extract LiveTV stream handler to shared service module ([ba838bf](https://github.com/MoldyTaint/Cinephage/commit/ba838bfa9bec59437f7cb2b957c96fc2cdad8767))
* **monitoring:** Remove dead streaming code from MonitoringSearchService ([b4b35a3](https://github.com/MoldyTaint/Cinephage/commit/b4b35a3a0bb9b51ba482c27213b409e2fed4d161))
* optimize MonitoringSearchService file lookups with eager loading ([2b7ae64](https://github.com/MoldyTaint/Cinephage/commit/2b7ae6413f1efcaad4454fac6f32899f35c7f0ba))
* per-suite DB isolation to enable test file parallelism ([89ce9e0](https://github.com/MoldyTaint/Cinephage/commit/89ce9e020f6e23c6618f527700a09ca70cc0d66a))
* reduce mock fragility in MonitoringSearchService tests ([fb371fb](https://github.com/MoldyTaint/Cinephage/commit/fb371fbd74d8caa367ee212881289d20bd27dedc))
* reduce mock fragility in searchOnAdd tests ([200ddc6](https://github.com/MoldyTaint/Cinephage/commit/200ddc6c5a4ccd361dc1da8320da2c34cd9d361e))
* **release:** simplify stable and preview channels ([152ba86](https://github.com/MoldyTaint/Cinephage/commit/152ba86a6f9c7eb9fb8bd0b48bf12795b9e1c122))
* remove 'as any' from LanguageProfileService tests ([c15051d](https://github.com/MoldyTaint/Cinephage/commit/c15051d863aed15f92bd5c8d3f41dd54c9933772))
* remove 'as any' from M3uProvider tests ([af1bc47](https://github.com/MoldyTaint/Cinephage/commit/af1bc47c8c1f709f5d12ab8493d010e14c725d2f))
* remove 'as any' from manual-import-service tests ([3346eba](https://github.com/MoldyTaint/Cinephage/commit/3346eba7c28624526a6ffa4a28dd376efe51966a))
* remove 'as any' from MonitoringScheduler tests ([f6944fa](https://github.com/MoldyTaint/Cinephage/commit/f6944fa3eeae0959ecd474beeb613c006cae9efe))
* remove 'as any' from OpenSubtitlesProvider tests ([e212a57](https://github.com/MoldyTaint/Cinephage/commit/e212a5704eb02ef50c5c3f13a77b8ff1af47dbcf))
* remove 'as any' from parsers tests ([7819479](https://github.com/MoldyTaint/Cinephage/commit/7819479bec87bf819f879d03eb95a5080c9f03e1))
* remove 'as any' from rating-buffer tests ([acc7ebb](https://github.com/MoldyTaint/Cinephage/commit/acc7ebbd4e49b3feaa128d86af28a246ad8670ad))
* remove 'as any' from RenamePreviewService tests ([4760100](https://github.com/MoldyTaint/Cinephage/commit/4760100bae2f8ab63c9476a1a46daf515f792c2d))
* remove 'as any' from RequestBuilder tests ([fe50f58](https://github.com/MoldyTaint/Cinephage/commit/fe50f584c007255db90ca4202d4ddaaaf94cb993))
* remove 'as any' from sse tests ([9cf22cc](https://github.com/MoldyTaint/Cinephage/commit/9cf22cc3fb5b091d8bfe21ff3a1ec0508ff53829))
* remove 'as any' from TorrentProtocolHandler tests ([3b1b5b1](https://github.com/MoldyTaint/Cinephage/commit/3b1b5b1e74a7d7fcb5a57504e3458ce1f090d1b3))
* remove old maintenance and server-stats pages in favor of unified status page ([8ac7878](https://github.com/MoldyTaint/Cinephage/commit/8ac78788db0f333fd09e42b3294cec9bdf9b7882))
* remove redundant overview cards and charts from unified status page ([e619c26](https://github.com/MoldyTaint/Cinephage/commit/e619c26ff0fb229b99fb0a0da0c804946c7a3ac4))
* remove unreachable TV certification notes in discover filter ([0c53d4e](https://github.com/MoldyTaint/Cinephage/commit/0c53d4e1549a8ef7e028a714c33fa574299aa147))
* remove unused import from Live TV portals API ([9b93335](https://github.com/MoldyTaint/Cinephage/commit/9b93335cb6e0e06d8849bafff354c2c6854f6e8a))
* replace 'as any' with typed fixtures in CutoffUnmetSpecification tests ([ad9c8fa](https://github.com/MoldyTaint/Cinephage/commit/ad9c8faaf72095d2ac88a7f52f3cbe5aca407b39))
* replace 'as any' with typed fixtures in searchorchestrator tests ([c01867b](https://github.com/MoldyTaint/Cinephage/commit/c01867ba3610c0dce67f418c9f4b535b2816f1c5))
* replace 'as any' with typed fixtures in UpgradeableSpecification tests ([8b01dd6](https://github.com/MoldyTaint/Cinephage/commit/8b01dd62e3f1ae18504b7a1f6f326c27d0a892fa))
* **streaming:** align Cinephage integration and release sync ([7588d5f](https://github.com/MoldyTaint/Cinephage/commit/7588d5f2f94f49dfc70ae70cbce741dcf22bb4e3))
* strip overview sections from storage and media server components ([6faea29](https://github.com/MoldyTaint/Cinephage/commit/6faea291c1e29f9728530119d0c751965549f052))
* **subtitles:** replace ThrottleManager with DB-backed provider throttling ([a3949b1](https://github.com/MoldyTaint/Cinephage/commit/a3949b1f8419cc9e6f5a1b7e3fb6432d1c900aa1))
* **ui:** split settings (library & storage and system) pages into horizontal nav layouts with child routes ([5513c35](https://github.com/MoldyTaint/Cinephage/commit/5513c35c73e60644486d0f17d0a5b1f4e4572cd8))
* unify logging system with structured log capture ([882d8aa](https://github.com/MoldyTaint/Cinephage/commit/882d8aa56e4498ad0c0133ba6c74b5b8c4c44877))
* unify SSE streams and remove legacy plumbing ([d5dead7](https://github.com/MoldyTaint/Cinephage/commit/d5dead7266282d0d2746af4bf900e73b93381b2a))
* update general settings nav tabs to use unified Status page ([9bb6ff4](https://github.com/MoldyTaint/Cinephage/commit/9bb6ff460e47784aac860aab89d9b45f50ff7af1))


### Performance

* optimize logs page load time by 30-50x ([91463f1](https://github.com/MoldyTaint/Cinephage/commit/91463f16cfdceb36f6994b691a662d6d59d3aa9e))


### Styling

* add CHANGELOG.md to .prettierignore and format ([df9eca6](https://github.com/MoldyTaint/Cinephage/commit/df9eca61b53fb9738536e9cc41b1f15c5a3a83cd))
* fix formatting in release-please workflow ([8f0bfd3](https://github.com/MoldyTaint/Cinephage/commit/8f0bfd343c7080f269d91de2130d411b930e967f))
* format CHANGELOG.md with Prettier ([50e7311](https://github.com/MoldyTaint/Cinephage/commit/50e73115940786a9f8e57a7ac69b07831ce84f59))
* format media explorer changes ([5ce0188](https://github.com/MoldyTaint/Cinephage/commit/5ce0188ea52f908924c0e269a0cc476b107f8545))
* format merged plex integration files ([28f4311](https://github.com/MoldyTaint/Cinephage/commit/28f43114168dfc6a14a24be60be6a9b9d0eb8a4d))
* **lint:** use SvelteURLSearchParams instead of URLSearchParams ([9ce9714](https://github.com/MoldyTaint/Cinephage/commit/9ce9714be472a8ca860825c8217ec010ad19430e))
* **tests:** fix Prettier formatting in OpenSubtitlesProvider test ([3834fc1](https://github.com/MoldyTaint/Cinephage/commit/3834fc1736bcd6e338592cc0bf75e7bc46bc236f))


### Documentation

* clarify error id messaging ([240cd52](https://github.com/MoldyTaint/Cinephage/commit/240cd52a70b0dfe00e59f06a6d28f702976d61f8))
* **db:** document schema version 70 in migration header ([ba665d2](https://github.com/MoldyTaint/Cinephage/commit/ba665d2dadd68df253638eb27209cc26081b29b8))
* improve README clarity and structure ([b7f66a4](https://github.com/MoldyTaint/Cinephage/commit/b7f66a4e6b8659da4d78903404fc7777ec0f4efd))
* migrate to Docusaurus with comprehensive documentation ([7cbc8e5](https://github.com/MoldyTaint/Cinephage/commit/7cbc8e59af748d2c00ee0408b781b44d3a86a08f))
* rework README with bare metal install, systemd, and updated screenshots ([b6434b7](https://github.com/MoldyTaint/Cinephage/commit/b6434b7bc20ca32d7ac35ed25a89eb573aa0ce6e))
* update AGENTS.md with comprehensive development guidelines ([6fcbaf5](https://github.com/MoldyTaint/Cinephage/commit/6fcbaf53eeefa93267a9791ef0108af6364f52d3))
* update AGENTS.md with improved test patterns and conventions ([00f9dcf](https://github.com/MoldyTaint/Cinephage/commit/00f9dcf2f989f8a062739eddee6ba39506e7255a))
* update BETTER_AUTH_SECRET generation instructions and add to environment variable references ([893e57c](https://github.com/MoldyTaint/Cinephage/commit/893e57ce63c829f1c00b64f2c3f0ebad88612cb3))


### Testing

* align upgradeable spec fixtures with real format ids ([6d1fe85](https://github.com/MoldyTaint/Cinephage/commit/6d1fe85ad0f0446efd227922ea7e909e008285cf))
* isolate monitoring decision scoring from runtime db ([e54db9e](https://github.com/MoldyTaint/Cinephage/commit/e54db9e62256e29b4781f400a0e244f9bdbe5209))
* isolate pure scoring tests from runtime db ([cfabd4c](https://github.com/MoldyTaint/Cinephage/commit/cfabd4ccc265f78d642defd2d49c27ff8e8a9099))
* update rate-limit test for language field ([c83f801](https://github.com/MoldyTaint/Cinephage/commit/c83f801c10ec1d0f1a4c4ec6ccc8a537a4e2480a))


### Miscellaneous

* add devcontainer support ([558bfa5](https://github.com/MoldyTaint/Cinephage/commit/558bfa5cd83176f7b59d1930bbb29521fc03b240))
* bump version to 0.1.3 ([010e45c](https://github.com/MoldyTaint/Cinephage/commit/010e45c2e1c066e3f1ce877af15ca3a124cfd210))
* bump version to 0.2.0 ([96f36ad](https://github.com/MoldyTaint/Cinephage/commit/96f36ad462b9a65614cdfbebfd152301fceb97f4))
* bump version to 0.2.1 ([2386f3d](https://github.com/MoldyTaint/Cinephage/commit/2386f3d06fd35d339c523e27b92d6709e7e45650))
* bump version to 0.2.2 ([#294](https://github.com/MoldyTaint/Cinephage/issues/294)) ([6f61b56](https://github.com/MoldyTaint/Cinephage/commit/6f61b56e4b651c9eee21864a6b580fc62bb0a9b6))
* **ci:** bump actions/attest-build-provenance ([#173](https://github.com/MoldyTaint/Cinephage/issues/173)) ([ca4914c](https://github.com/MoldyTaint/Cinephage/commit/ca4914cb46b35511c20343887736890413449352))
* **ci:** bump actions/attest-build-provenance from v3 to v4.1.0 ([6135e2c](https://github.com/MoldyTaint/Cinephage/commit/6135e2c332589903fbed773f0124b6a0bfd18715))
* **ci:** bump actions/checkout from 4.2.2 to 6.0.2 ([38324fb](https://github.com/MoldyTaint/Cinephage/commit/38324fb72eabb50e0b7e7d89570867619f0ce563))
* **ci:** bump actions/setup-node from 6.2.0 to 6.3.0 ([8d8e52e](https://github.com/MoldyTaint/Cinephage/commit/8d8e52efd63b6ac9a939bb680d219dcffd5d737f))
* **ci:** bump actions/upload-artifact from 4 to 7 ([6142d57](https://github.com/MoldyTaint/Cinephage/commit/6142d57bd475e706f4525bf3fc2f02c33a298ae4))
* **ci:** bump docker/build-push-action from 6.19.2 to 7.1.0 ([4359200](https://github.com/MoldyTaint/Cinephage/commit/4359200c92a8b1a8aa2dabeadf8ba94e78ca1614))
* **ci:** bump docker/build-push-action from 6.9.0 to 6.19.2 ([#175](https://github.com/MoldyTaint/Cinephage/issues/175)) ([b4897f8](https://github.com/MoldyTaint/Cinephage/commit/b4897f802eb08751452b7b7e145d7eb9cb7721d9))
* **ci:** bump docker/build-push-action from v6 to v7 ([2b2b041](https://github.com/MoldyTaint/Cinephage/commit/2b2b0414ec7d30fca015bb72130568dd2b0363c1))
* **ci:** bump docker/login-action from 3.3.0 to 3.7.0 ([#174](https://github.com/MoldyTaint/Cinephage/issues/174)) ([4da4de3](https://github.com/MoldyTaint/Cinephage/commit/4da4de3d676842d1eaf4ba5d7d818f3d744652b4))
* **ci:** bump docker/login-action from 3.7.0 to 4.1.0 ([aae24bb](https://github.com/MoldyTaint/Cinephage/commit/aae24bbbb74a8973a6d3bdc82793758aaf156c57))
* **ci:** bump docker/login-action from v3 to v4 ([f0db9a2](https://github.com/MoldyTaint/Cinephage/commit/f0db9a2f5c16e762930a8c1b12ec68e1a731c44d))
* **ci:** bump docker/metadata-action from 5.5.1 to 5.10.0 ([#171](https://github.com/MoldyTaint/Cinephage/issues/171)) ([bf7374f](https://github.com/MoldyTaint/Cinephage/commit/bf7374f5fc7e9eed0874d6e6ade42ebdc8530abf))
* **ci:** bump docker/metadata-action from v5 to v6 ([add62ec](https://github.com/MoldyTaint/Cinephage/commit/add62ec5672e3985da55885de19d990ad91dcca6))
* **ci:** bump docker/setup-buildx-action from 3.12.0 to 4.0.0 ([75091ae](https://github.com/MoldyTaint/Cinephage/commit/75091ae7810fbcc10a5f523ebfbc3ab5c84d2c21))
* **ci:** bump docker/setup-buildx-action from 3.7.1 to 3.12.0 ([#172](https://github.com/MoldyTaint/Cinephage/issues/172)) ([bfeb2cc](https://github.com/MoldyTaint/Cinephage/commit/bfeb2cca454b27efbaae00c8a64046636bfd58ab))
* **ci:** pin GitHub Actions to commit SHAs ([0e9636a](https://github.com/MoldyTaint/Cinephage/commit/0e9636a53d312008be598493ca7c294c7894517a))
* **deps:** bump brace-expansion from 5.0.3 to 5.0.5 ([f24bc6d](https://github.com/MoldyTaint/Cinephage/commit/f24bc6d05fadc60474f28fb0b0204a6801c959de))
* **deps:** bump devalue from 5.6.3 to 5.6.4 ([c5d8411](https://github.com/MoldyTaint/Cinephage/commit/c5d8411ac69f1b82558960b673a29f5a3cd3366b))
* **deps:** bump drizzle-orm from 0.45.1 to 0.45.2 in the drizzle group ([030f6f3](https://github.com/MoldyTaint/Cinephage/commit/030f6f3ea1c3b835d67ec2440e2abc027059e115))
* **deps:** bump fast-xml-parser from 5.3.7 to 5.3.8 ([79bf886](https://github.com/MoldyTaint/Cinephage/commit/79bf8864549441bfd51f56050a4102631e3f08a7))
* **deps:** bump fast-xml-parser from 5.4.1 to 5.5.7 ([3f7cb4b](https://github.com/MoldyTaint/Cinephage/commit/3f7cb4bdfdb24df6bd6dc78cabbc69c4006ef12b))
* **deps:** bump flatted from 3.3.3 to 3.4.2 ([85a2d37](https://github.com/MoldyTaint/Cinephage/commit/85a2d37a0138a8716c6bbb55ee9c83f3a95fae90))
* **deps:** bump lucide-svelte from 0.575.0 to 1.0.1 ([70b2e53](https://github.com/MoldyTaint/Cinephage/commit/70b2e537b259b8ee68ef9a85b44754787c885c17))
* **deps:** bump minimatch from 9.0.6 to 9.0.9 ([87d5490](https://github.com/MoldyTaint/Cinephage/commit/87d5490bf7047c5e80e0bc5bb0b61ea6c4d59eba))
* **deps:** bump minor-and-patch group (better-sqlite3, camoufox-js, eslint, lucide-svelte, and 7 more) ([4cbf72e](https://github.com/MoldyTaint/Cinephage/commit/4cbf72e4163b63fdde9cdbd2951f3c4867011354))
* **deps:** bump picomatch from 4.0.3 to 4.0.4 ([a965a10](https://github.com/MoldyTaint/Cinephage/commit/a965a1030a7011bd31d6e67bb1706e28ee50740a))
* **deps:** bump pino from 9.14.0 to 10.3.1 ([7552811](https://github.com/MoldyTaint/Cinephage/commit/7552811b9ccbe4ea0d2797f69015e1325b816c5c))
* **deps:** bump rollup from 4.53.5 to 4.59.0 ([bcb7c77](https://github.com/MoldyTaint/Cinephage/commit/bcb7c77bfc08fcb9f14e3e2dab6b51ed369e9561))
* **deps:** bump svelte from 5.53.2 to 5.53.5 ([f15235b](https://github.com/MoldyTaint/Cinephage/commit/f15235b0c6b1da96fd51814c6287edba65cafc1c))
* **deps:** bump svelte group (@sveltejs/kit 2.55.0, svelte 5.53.12, svelte-check 4.4.5) ([ce8accc](https://github.com/MoldyTaint/Cinephage/commit/ce8accc929ed4a107bf836455da2e4f7471a803a))
* **deps:** bump tailwind group (@tailwindcss/vite 4.2.2, tailwindcss 4.2.2) ([209adc5](https://github.com/MoldyTaint/Cinephage/commit/209adc5eb67103991e4970a3cf162362867a7848))
* **deps:** bump the minor-and-patch group across 1 directory with 3 updates ([cbc946c](https://github.com/MoldyTaint/Cinephage/commit/cbc946cd4f86ed893dfcd8e22705d198c0ca2efd))
* **deps:** bump the minor-and-patch group with 16 updates ([6caaacc](https://github.com/MoldyTaint/Cinephage/commit/6caaacc8ffd3210c00eca886d6b779472fcb2a4e))
* **deps:** bump the minor-and-patch group with 6 updates ([dab5934](https://github.com/MoldyTaint/Cinephage/commit/dab5934a97e0b4134fdeaa26562eba9a237f42f2))
* **deps:** bump the minor-and-patch group with 6 updates ([#176](https://github.com/MoldyTaint/Cinephage/issues/176)) ([84dbee4](https://github.com/MoldyTaint/Cinephage/commit/84dbee46279ceb5171c7deaff87ebb4c4d2cb6c8))
* **deps:** bump the svelte group with 4 updates ([0f58c11](https://github.com/MoldyTaint/Cinephage/commit/0f58c1193a10c714a9c2a914b6d1b6fa3fefa5da))
* **deps:** bump the svelte group with 4 updates ([#177](https://github.com/MoldyTaint/Cinephage/issues/177)) ([023f181](https://github.com/MoldyTaint/Cinephage/commit/023f18199a47bab2c75b92e0732da73165ff328f))
* **deps:** bump the tailwind group with 2 updates ([9069b55](https://github.com/MoldyTaint/Cinephage/commit/9069b55125f4ffedb4b0a0697ed8135cc612f834))
* **deps:** bump the tailwind group with 2 updates ([#178](https://github.com/MoldyTaint/Cinephage/issues/178)) ([be84981](https://github.com/MoldyTaint/Cinephage/commit/be84981651553a60afc52d5fd670543b6af01673))
* **deps:** bump typescript from 5.9.3 to 6.0.2 ([b983706](https://github.com/MoldyTaint/Cinephage/commit/b983706c2e3cddefb5f1a8b792acfd2113f2c634))
* **deps:** bump typescript from 5.9.3 to 6.0.3 ([a05396a](https://github.com/MoldyTaint/Cinephage/commit/a05396a683c70f3b581a565e9a96a02196c05140))
* **deps:** bump undici from 7.19.1 to 7.24.6 ([fa78ab9](https://github.com/MoldyTaint/Cinephage/commit/fa78ab9400388d6bb7d3e810ac8d7db748196b01))
* **deps:** bump vite from 7.3.1 to 8.0.3 ([9d10c90](https://github.com/MoldyTaint/Cinephage/commit/9d10c90bbaaf16e769980d96558aff8b9cd5f611))
* **deps:** update package.json versions to match merged PRs ([c77d488](https://github.com/MoldyTaint/Cinephage/commit/c77d48848f0577bf73b9dbbf2800b5b8a3e6b98f))
* **devcontainer:** align runtime, stabilize workspace mount and document optional qBittorrent/SABnzbd sidecars ([11190cc](https://github.com/MoldyTaint/Cinephage/commit/11190ccd49d2e5b225d007c101264c57a2826fb8))
* **devcontainer:** install required dependencies, auto-install Camoufox binaries and fix executable permissions ([b83748a](https://github.com/MoldyTaint/Cinephage/commit/b83748a998f0ce9e480b6561af49dcf6b7755b7c))
* formatting, uppercase codec labels, add rootFolderIds, export MediaExplorerTable ([f572536](https://github.com/MoldyTaint/Cinephage/commit/f572536a9aface091912c08be311fb29a815acc4))
* improve GitHub release note categorization ([86a67a7](https://github.com/MoldyTaint/Cinephage/commit/86a67a770105430cc5cd650359195e7f2850a41d))
* isolate live network tests behind LIVE_TESTS env flag ([38add03](https://github.com/MoldyTaint/Cinephage/commit/38add03bec1f44b4bdc87c2c13c19b667737a249))
* **main:** release 0.5.0 ([9d2d174](https://github.com/MoldyTaint/Cinephage/commit/9d2d1747fd8dbcbdc0999e6f7d1f9d9fe8a0cfda))
* **main:** release 0.6.0 ([d28553b](https://github.com/MoldyTaint/Cinephage/commit/d28553b6d6af20baff6d580c12caa2504b26b294))
* release v0.1.0 ([943f494](https://github.com/MoldyTaint/Cinephage/commit/943f4946c6e5d574dbf77d64be7ca9439d222c55))
* remove .vscode directory and add to .gitignore ([775e00b](https://github.com/MoldyTaint/Cinephage/commit/775e00b5754d0ad636b9ba39a09892a941468a90))
* remove dead code and documentation ([90d095a](https://github.com/MoldyTaint/Cinephage/commit/90d095abc3a3a09510a74e65b842d3e84bdf28ea))
* remove dead test files (demo.spec.ts, page.svelte.spec.ts) ([e09c82b](https://github.com/MoldyTaint/Cinephage/commit/e09c82b5160a3bd1d4e4df43dc0d4a64139cae37))
* remove deprecated Cloudflare streaming fix and results documentation ([6587a3a](https://github.com/MoldyTaint/Cinephage/commit/6587a3a9b70548a5e22bfb5f3c10f731b4c46c73))
* remove documentation (moved to separate repo) ([f5b3c18](https://github.com/MoldyTaint/Cinephage/commit/f5b3c1837c3b781353102b6d73d25e71b6b038b6))
* remove obsolete troubleshooting scripts ([b2c939d](https://github.com/MoldyTaint/Cinephage/commit/b2c939dca3d2f66597c75f127c89c61f3a8b1898))
* remove release workflow ([c16331a](https://github.com/MoldyTaint/Cinephage/commit/c16331a0d7c57815c2c8a17d9486dbbead941834))
* rename main container channel from edge to main and decouple release provenance ([9e0a025](https://github.com/MoldyTaint/Cinephage/commit/9e0a025f7a8af1945118c8699571342b3d09426d))
* restore deleted documentation and npm command ([0aa4f16](https://github.com/MoldyTaint/Cinephage/commit/0aa4f16baabd60bc0953ce2cce7f9e629ec96fe8))
* **tests:** trigger CI ([50cc375](https://github.com/MoldyTaint/Cinephage/commit/50cc3758f2d601957044d6ab7a058df83a6f329d))
* update ignore files for i18n and test utilities ([341ebf7](https://github.com/MoldyTaint/Cinephage/commit/341ebf7cba5120d479a6359c5c8d915b54ea74aa))
* update package-lock.json after dependabot merges ([4afb235](https://github.com/MoldyTaint/Cinephage/commit/4afb23552436287465b5b86ed66c1d81e91083b1))

## [0.6.0](https://github.com/MoldyTaint/Cinephage/compare/v0.5.0...v0.6.0) (2026-04-25)


### Features

* skip stream probing for instant playback startup ([390ec20](https://github.com/MoldyTaint/Cinephage/commit/390ec2034bf2f970993b6dfbffa6918325df5483))


### Bug Fixes

* add seeding limit checks for Transmission and Deluge ([168e509](https://github.com/MoldyTaint/Cinephage/commit/168e509c5cc92a8804fbdc1ffc4d79af3ab2a9f2))
* address date parser edge cases — bare Z handling, test fixes, coverage ([f81dc59](https://github.com/MoldyTaint/Cinephage/commit/f81dc593ee208d46edd542d129b5cc1c962f530d))
* address date parser edge cases — bare Z handling, test fixes, coverage ([7393e02](https://github.com/MoldyTaint/Cinephage/commit/7393e02e2a554e17a0abde2be8b536c8b15e4c55))
* **ci:** add gate job matching branch protection required check ([2f8ea4d](https://github.com/MoldyTaint/Cinephage/commit/2f8ea4df3501f22a2e32b12959e273e48c5e046b))
* Replace GO style date parser with a working one ([aad1501](https://github.com/MoldyTaint/Cinephage/commit/aad15014c35a02be797c2e2e5bb2ed06d945bf38))
* Replace GO style date parser with a working one ([6a7c923](https://github.com/MoldyTaint/Cinephage/commit/6a7c923b9f5886f26fc59097b71c0ce9939a4364))
* restore canBeRemoved for non-seeding torrents after PR 291 ([e44138c](https://github.com/MoldyTaint/Cinephage/commit/e44138cf8f5ecdbfe8520de0df48b8bde54af9a7))


### Performance

* optimize logs page load time by 30-50x ([91463f1](https://github.com/MoldyTaint/Cinephage/commit/91463f16cfdceb36f6994b691a662d6d59d3aa9e))


### Styling

* add CHANGELOG.md to .prettierignore and format ([df9eca6](https://github.com/MoldyTaint/Cinephage/commit/df9eca61b53fb9738536e9cc41b1f15c5a3a83cd))
* format CHANGELOG.md with Prettier ([50e7311](https://github.com/MoldyTaint/Cinephage/commit/50e73115940786a9f8e57a7ac69b07831ce84f59))


### Documentation

* improve README clarity and structure ([b7f66a4](https://github.com/MoldyTaint/Cinephage/commit/b7f66a4e6b8659da4d78903404fc7777ec0f4efd))


### Miscellaneous

* remove .vscode directory and add to .gitignore ([775e00b](https://github.com/MoldyTaint/Cinephage/commit/775e00b5754d0ad636b9ba39a09892a941468a90))

## [0.5.0](https://github.com/MoldyTaint/Cinephage/compare/v0.4.0...v0.5.0) (2026-04-21)

### ⚠ BREAKING CHANGES

- **subtitles:** The /api/subtitles/providers/analytics endpoint response shape has changed. The analytics object (successRate, responseTimes) is removed. Provider fields are now at top level. Throttle state now includes consecutiveFailures, lastError, and lastErrorAt.
- **auth:** BETTER_AUTH_SECRET must now be explicitly set as an environment variable. The auto-generated .auth-secret file fallback is removed. Existing deployments must copy their secret from data/.auth-secret into the BETTER_AUTH_SECRET env var before upgrading, or all sessions and encrypted API keys will be lost.
- **indexers:** Removes preferMagnetUrl setting from all indexers

### Features

- **activity:** add activity stats endpoint and enhance activity retrieval with scope filtering ([ef1df74](https://github.com/MoldyTaint/Cinephage/commit/ef1df749f4052f9d01e6d7120fbbb7e4797c7273))
- **activity:** add search_error status, activity source tracking, and fix import failure detection ([36b4474](https://github.com/MoldyTaint/Cinephage/commit/36b4474b735b0f053ee4571bba98f16e46572860))
- **activity:** add selectable history and active queue IDs for bulk actions ([63df41e](https://github.com/MoldyTaint/Cinephage/commit/63df41e84e0c21196930845b979670ddbb1f470c))
- **activity:** implement activity history management and SSE events ([dbdd7a2](https://github.com/MoldyTaint/Cinephage/commit/dbdd7a2515334baf0d95ab1f44a6a15dcdb6e4f7))
- **activity:** implement download queue tombstones for local removal suppression ([9d4a86a](https://github.com/MoldyTaint/Cinephage/commit/9d4a86a5773de3b6bc429e9bd9a9adbbfa4c2dc5))
- add auto-fill version/commit from GitHub releases to streaming indexer ([4cb831b](https://github.com/MoldyTaint/Cinephage/commit/4cb831b4834cde37c4fb7a036f54c821fdec0213))
- add automated release pipeline triggered by semver tags ([3143acc](https://github.com/MoldyTaint/Cinephage/commit/3143acc4710081c61a8ccaac4a0bedb24ecc715c))
- add configuration backup and restore with encrypted secrets ([ca0e328](https://github.com/MoldyTaint/Cinephage/commit/ca0e32816d31e8354b14b6365e3ca188b7b15c6c))
- add content rating filter to discover page ([e1836ef](https://github.com/MoldyTaint/Cinephage/commit/e1836efe7c661c9a5c9977a264db8460ba17e751))
- add downloads to allowlist, path-guard tests for symlink handling and realpath resolution ([66b4c48](https://github.com/MoldyTaint/Cinephage/commit/66b4c481dffcb9669021d96fcf19daf9cb46a5fb))
- add graceful shutdown handler for background services ([1af8c14](https://github.com/MoldyTaint/Cinephage/commit/1af8c1468540d2813add3a564b5f762b6fbb388e))
- add i18n infrastructure with Paraglide JS v2 ([ff14bb7](https://github.com/MoldyTaint/Cinephage/commit/ff14bb72d6437aadf75971e5977ba2448e78cc04))
- add isPlayed and playedPercentage to media explorer query ([32fd707](https://github.com/MoldyTaint/Cinephage/commit/32fd707f298775ab9793ba9297187b3421bc1849))
- add Kinozal indexer support ([2760f66](https://github.com/MoldyTaint/Cinephage/commit/2760f6697c308c371a3282db3e479c3e555cfb8f))
- add language filter to discover page ([df915f4](https://github.com/MoldyTaint/Cinephage/commit/df915f427d116ae34d7cf6318834a82de663ff7b))
- add list view with auto/manual grab for movies and tv shows ([9e2916e](https://github.com/MoldyTaint/Cinephage/commit/9e2916e0d3e086e33c64b006a1bfb7208a7661d6))
- add Live TV channel name cleanup workflow and HLS playlist fixes ([893c83b](https://github.com/MoldyTaint/Cinephage/commit/893c83bb00644622624ca3d01d7b06970e992b7f))
- add media move functionality and enhance root folder management ([580894b](https://github.com/MoldyTaint/Cinephage/commit/580894b65249b694b6346bbd9b7fa356c5b6462b))
- add media subtype support for root folders and enforce anime root folder settings ([25648c4](https://github.com/MoldyTaint/Cinephage/commit/25648c48ecd87a75e752260aad9d9922f34513f1))
- Add milkie.cc private tracker ([6e88ab2](https://github.com/MoldyTaint/Cinephage/commit/6e88ab2c4903f74aa9ff4457996c1412d991c865))
- add missing messages and project.inlang files to Docker build ([0d89fb7](https://github.com/MoldyTaint/Cinephage/commit/0d89fb7576586cd2f50e38179ab94a5558f24cd7))
- add missing settings API endpoints ([c1b7a96](https://github.com/MoldyTaint/Cinephage/commit/c1b7a96d9fad3e4ab815234d871f2091f7e007c0))
- add native subtitle sync engine with cleanup ([f7a8dc9](https://github.com/MoldyTaint/Cinephage/commit/f7a8dc90d4446c986a8297f3ba7fd2eafb192237))
- add parent folder renaming to media file rename system ([a972e11](https://github.com/MoldyTaint/Cinephage/commit/a972e11a8c88145a8b97aa55145fdee724369e80))
- add playback sessions and persisted support logs ([70368e9](https://github.com/MoldyTaint/Cinephage/commit/70368e91e43fd0df5bb2d3a5af1a5b2d313a6fd4))
- add plex media server integration ([bbc8f89](https://github.com/MoldyTaint/Cinephage/commit/bbc8f894cf702d472489546fe1ce8d18151331d9))
- add role column to users table ([5f602c9](https://github.com/MoldyTaint/Cinephage/commit/5f602c9a562e9437844dc1d8c182a9f3196f8321))
- add rTorrent (XML-RPC) and Transmission (RPC API) download client implementations ([59299ae](https://github.com/MoldyTaint/Cinephage/commit/59299ae0a3618c761fefc1ff4203e96cd2b1ffa6))
- add rTorrent (XML-RPC) and Transmission (RPC API) download client implementations ([#159](https://github.com/MoldyTaint/Cinephage/issues/159)) ([34661d2](https://github.com/MoldyTaint/Cinephage/commit/34661d2dba039ef0aafe9ebf87475d97450e657e))
- add source-only and resolution-only scoring formats ([3dbb858](https://github.com/MoldyTaint/Cinephage/commit/3dbb8589559aea1dfa32e86fc290a399bd6391d5))
- add unified status page data loader ([ba9de25](https://github.com/MoldyTaint/Cinephage/commit/ba9de254ecce49d6497ad3d60481884863110e05))
- add unified summary cards and combined scan/sync status to status page ([e6dfcc6](https://github.com/MoldyTaint/Cinephage/commit/e6dfcc66835901e0726c7e1493018d7e559c2a94))
- add user language preference API and database schema ([aeff37f](https://github.com/MoldyTaint/Cinephage/commit/aeff37fe1aaafa08c000241fe568ce85ef280945))
- **api:** enhance JSON response formatting in health and system status endpoints ([af91a14](https://github.com/MoldyTaint/Cinephage/commit/af91a14f6f59eeda59b569b69c7e8434d15cdefc))
- **auth:** Add database path configuration via environment variables ([c446896](https://github.com/MoldyTaint/Cinephage/commit/c446896f8f574ab377ccf77f138c6a62c4af7099))
- **auth:** require BETTER_AUTH_SECRET env var and remove auto-generation ([7ed0db7](https://github.com/MoldyTaint/Cinephage/commit/7ed0db733d7c22888e639dab044e0c00a0c573a5))
- auto-detect latest CI candidate for releases and remove manual release notes input ([bcce4a7](https://github.com/MoldyTaint/Cinephage/commit/bcce4a71a89290e3f866dcb634bdf12465fb6dfa))
- canonicalize release parsing and scoring attributes ([2d62d9f](https://github.com/MoldyTaint/Cinephage/commit/2d62d9f054ab56ede2082efef080426e62993a17))
- **ci:** add auto-release workflow ([d0d0a86](https://github.com/MoldyTaint/Cinephage/commit/d0d0a86e7973107a340ac0e7a042ccb97191708e))
- **ci:** add Discord announcement to auto-release workflow ([2fc3d54](https://github.com/MoldyTaint/Cinephage/commit/2fc3d545900a30fae344f383048542b119cf9274))
- **ci:** merge release pipeline into auto-release workflow ([eb2bba8](https://github.com/MoldyTaint/Cinephage/commit/eb2bba8bbe9dcf59011d6f7aa376e65d3223b5e3))
- **ci:** replace broken auto-release with release-please ([35e5205](https://github.com/MoldyTaint/Cinephage/commit/35e520532d29bdc885852d1ba875dc1640a28ff4))
- create unified status page composing storage and media server sections ([1b9966b](https://github.com/MoldyTaint/Cinephage/commit/1b9966b593e896a596a19a1b42aa31d129cbaba0))
- **docker:** update base image to node:24-trixie-slim and enhance Dockerfile for production ([#157](https://github.com/MoldyTaint/Cinephage/issues/157)) ([4118437](https://github.com/MoldyTaint/Cinephage/commit/411843776833465d05cefba4b7f8cc63eae68c26))
- enforce admin authorization on API endpoints ([5a58783](https://github.com/MoldyTaint/Cinephage/commit/5a587838878a46a4645ac3850f5f4ea1cefb5d43))
- Enhance EPG fetching and account management ([4ded8de](https://github.com/MoldyTaint/Cinephage/commit/4ded8ded7dcfb1a6132ca98ac2726e6d094419d0))
- Enhance EPG fetching and IPTV account management ([#133](https://github.com/MoldyTaint/Cinephage/issues/133)) ([13f46da](https://github.com/MoldyTaint/Cinephage/commit/13f46da0d8f6409321b4fba8daac20bf7dd8160b))
- Enhance error handling and indexer availability checks in search functionality ([ecda835](https://github.com/MoldyTaint/Cinephage/commit/ecda8356ff87cfbe590aefdb47f74f777a523079))
- Enhance library and root folder management ([d4c19b8](https://github.com/MoldyTaint/Cinephage/commit/d4c19b89dc9ff7439276dccc9ba5a792f5a6bb0c))
- Enhance library navigation and anime root folder enforcement ([95f131f](https://github.com/MoldyTaint/Cinephage/commit/95f131f5f4d03cdf3ed3943a9add61d6b5512592))
- enhance library pages with better data handling ([328e113](https://github.com/MoldyTaint/Cinephage/commit/328e113a251628ef689bebcd771b2f363d75533e))
- enhance manual import service with anime classification and match consensus ([a98ed1e](https://github.com/MoldyTaint/Cinephage/commit/a98ed1e7f8b52a26e855c3b464a9be5fbbc9926d))
- enhance root folder validation with overlap checks and error handling ([5efa0d1](https://github.com/MoldyTaint/Cinephage/commit/5efa0d108ca40a5c57e0f9e8e1fb44c0efc24092))
- Enhance RuTracker search functionality and episode handling ([ce7ea35](https://github.com/MoldyTaint/Cinephage/commit/ce7ea355e6f1ce37f495b52b419dd9b126474688))
- extract MediaServerStatsSection component for unified status page ([cfedb36](https://github.com/MoldyTaint/Cinephage/commit/cfedb36107b8121a13b4e6464b7d125142594071))
- **i18n:** align spanish tranlation paraglide keys ([be7a955](https://github.com/MoldyTaint/Cinephage/commit/be7a955bad93ee07a173ae711400fc35a775cc7b))
- implement admin password reset functionality and update documentation ([fd230db](https://github.com/MoldyTaint/Cinephage/commit/fd230db26636be9e9d230a985724d1f029eb3415))
- implement new health and readiness endpoints, enhance docker ownership handling, improve startup configuration and update documentation ([2cefd80](https://github.com/MoldyTaint/Cinephage/commit/2cefd80e1e515fda56b5d8f878cbad1b15fecae9))
- implement RBAC authentication system ([8c57c3f](https://github.com/MoldyTaint/Cinephage/commit/8c57c3fbd4110b67007773a35556e378e08b8b51))
- improve ActivityService and TMDB error handling ([cc6498e](https://github.com/MoldyTaint/Cinephage/commit/cc6498e2c132fd36c05a1afbb2cfe348d2a875c7))
- Improve integration health tracking, error handling, and add bulk operations across multiple integration pages ([1d3e097](https://github.com/MoldyTaint/Cinephage/commit/1d3e09716cc2083caec986e8ce837156ed429745))
- Improve integration health tracking, error handling, and add bulk operations across multiple integration pages ([#134](https://github.com/MoldyTaint/Cinephage/issues/134)) ([9460690](https://github.com/MoldyTaint/Cinephage/commit/94606907ccba84ce3e2ca573d2d371fe3df57109))
- improve streaming prefetch and usenet playback resilience ([5cec266](https://github.com/MoldyTaint/Cinephage/commit/5cec266b94b710b1ac1fac0f52a479f15d01636c))
- include symlinked video files in import candidates and update documentation for Rclone mounts ([456ab34](https://github.com/MoldyTaint/Cinephage/commit/456ab34c0cb3c120dac76b011fbf5a3115196ead))
- **indexers:** add support for Torznab protocol and enhance capabilities validation ([#153](https://github.com/MoldyTaint/Cinephage/issues/153)) ([9c576a9](https://github.com/MoldyTaint/Cinephage/commit/9c576a922f85c5c4c379f0905ceb68319ccbcf3d))
- **indexers:** improve modal layout and add automatic language detection ([fa0d8a2](https://github.com/MoldyTaint/Cinephage/commit/fa0d8a2d05ad2ea3a862d808d949330747cffab8))
- integrate i18n into application shell ([e59c6d1](https://github.com/MoldyTaint/Cinephage/commit/e59c6d1ad36478b810a8e8ac5ce08f1a039237f0))
- introduce import wizard with API and error handling refactor ([545a67e](https://github.com/MoldyTaint/Cinephage/commit/545a67eeb9794db75361bf03e623496383976c54))
- **library:** introduce custom library support and backfill existing media ([3847ecd](https://github.com/MoldyTaint/Cinephage/commit/3847ecd7d8b39f299b1aae3c14d47c951b876c73))
- **livetv,auth,streaming:** integrate logo picker and improve streaming auth ([137db96](https://github.com/MoldyTaint/Cinephage/commit/137db96769508c5b9f0d398c386f328d46c464f4))
- **livetv:** add EPG sync state tracking and robust M3U EPG parsing ([2637bf5](https://github.com/MoldyTaint/Cinephage/commit/2637bf57ecb33c8e189b49c6ef4b04790f8e987d))
- **livetv:** add xstream URL normalization and player API URL builder ([5f3bbf2](https://github.com/MoldyTaint/Cinephage/commit/5f3bbf2dadd63db1538e24d1f6ed96aa82c6b486))
- **livetv:** improve EPG source resolution and provider sync cleanup ([ae77bcb](https://github.com/MoldyTaint/Cinephage/commit/ae77bcb17317d160748d6af0f5029d85f715d787))
- localize and enhance library storage management ([07b9ba0](https://github.com/MoldyTaint/Cinephage/commit/07b9ba02fffe9bc02db555f42232d36c41f7ff89))
- **logging:** refactor environment variable retrieval for better compatibility ([e77291d](https://github.com/MoldyTaint/Cinephage/commit/e77291d27044d87d30e15dc550dcf8388ba78a28))
- major development branch with auth, SSE, search, and system improvements ([1a1ba30](https://github.com/MoldyTaint/Cinephage/commit/1a1ba309dcfa6e6745ff1fcade268e2b781791f4))
- migrate all route pages to i18n ([6d95f2f](https://github.com/MoldyTaint/Cinephage/commit/6d95f2f9c9457514b60a6e4c8e0ed734d194013f))
- migrate all Svelte components to i18n ([04691c5](https://github.com/MoldyTaint/Cinephage/commit/04691c59a8dab7567aa3db325f273eef7ac6c8df))
- **monitoring:** add history cleanup task, streaming key pre-check, and provider availability guards ([04bae6c](https://github.com/MoldyTaint/Cinephage/commit/04bae6c481c3437f1f131d9f0b0917bc0973106d))
- **naming:** expand release metadata for rename previews ([5dc957b](https://github.com/MoldyTaint/Cinephage/commit/5dc957bd74ea4c94d883a4ffd819c5f57a831956))
- overhaul TV show subtitle management UX ([30cfd9c](https://github.com/MoldyTaint/Cinephage/commit/30cfd9c61a39af14b98ba82d526aa0d2c59e0230))
- **rate-limit:** Add private IP exemption for rate limiting ([7bbf26a](https://github.com/MoldyTaint/Cinephage/commit/7bbf26a79afed6e6dbd8d6c54bb611710724551f))
- redesign media explorer filter bar with tiered chip layout ([9180108](https://github.com/MoldyTaint/Cinephage/commit/9180108efdaa772a91d8da497e1693997dd6b804))
- redesign playback column with isPlayed and playedPercentage indicators ([92bcd03](https://github.com/MoldyTaint/Cinephage/commit/92bcd033184ced48ab38a9dfd7c8761d9bcd5d37))
- refine quality scoring UI and search result details ([8938b25](https://github.com/MoldyTaint/Cinephage/commit/8938b25fd6b4f979333e14fcc696d140fef6e388))
- **release:** enhance version bump logic for dev branch and add parsing for stable tags ([63ddd5c](https://github.com/MoldyTaint/Cinephage/commit/63ddd5c468f11ab4c4a5db0976fd52fb1d1a4c7b))
- replace unreliable blocked/status flags with actual stream verification in account tests ([923676e](https://github.com/MoldyTaint/Cinephage/commit/923676e3d0d36833836415a976aa09cef6ade37e))
- **search:** implement auto search strategy for RuTracker and enhance episode handling ([31489f9](https://github.com/MoldyTaint/Cinephage/commit/31489f9c8bfa09313b0355e149712eddd7b1d4b2))
- **search:** improve multi-pack detection and multi-pack search UX for tracker-style TV releases ([969b7e3](https://github.com/MoldyTaint/Cinephage/commit/969b7e308e652cb999f6a1715ad54aafa64937fd))
- standardize settings pages with shared components and route consolidation ([2f4e543](https://github.com/MoldyTaint/Cinephage/commit/2f4e543731a4aacc0493abb3d3ef6b95fa85b525))
- **streaming:** route resolution through Cinephage backend ([bd25039](https://github.com/MoldyTaint/Cinephage/commit/bd25039d199394aedffeb9d3507980d11ed62e20))
- streamline activity page loading ([683476e](https://github.com/MoldyTaint/Cinephage/commit/683476e5e020da0f0eb886acb96407509347da6f))
- **subtitles:** add adaptive subtitle searching with backoff after 21 days ([b7416a5](https://github.com/MoldyTaint/Cinephage/commit/b7416a5ff3cdbdbcc0da8f7e3e824da82c55ca3b))
- **subtitles:** support .strm subtitle sync with friendly errors and streamer-profile guard ([2f74f9f](https://github.com/MoldyTaint/Cinephage/commit/2f74f9f4e4a528a1358c9ea6dd8621dc9a6c7323))
- support built-in profile overrides and runtime custom formats ([4192fc6](https://github.com/MoldyTaint/Cinephage/commit/4192fc6be558d1d9d09a6b69ad4ac571ffd6b444))
- Support custom process IDs for sidecars ([1b0abf4](https://github.com/MoldyTaint/Cinephage/commit/1b0abf453ed031caf9c6b9fa85f39c1f231df77b))
- translate Spanish (es) localization file ([ff0904f](https://github.com/MoldyTaint/Cinephage/commit/ff0904f753479feb63108e54d8a4b9f2aaa66731))
- **ui:** enhance UI for mobile devices ([#158](https://github.com/MoldyTaint/Cinephage/issues/158)) ([7ef4639](https://github.com/MoldyTaint/Cinephage/commit/7ef463947a307a2ce0b13e8740201d2f1c2a7d4e))
- unify app version resolution and make streaming API key rate limits configurable via env ([7d4847d](https://github.com/MoldyTaint/Cinephage/commit/7d4847d0f55fbc74ea16cefbdd7f38fee770d3ea))
- unify MediaType types, enhance bulk/delete flows, and polish library UI across Movies and TV ([#145](https://github.com/MoldyTaint/Cinephage/issues/145)) ([2332bdb](https://github.com/MoldyTaint/Cinephage/commit/2332bdbf664a169a1140f93fc0a32b96c5667ab2))
- use git-cliff for release changelog generation ([3f51526](https://github.com/MoldyTaint/Cinephage/commit/3f515266862513ac9fb141c96b6f3474bb27059b))
- **workflows:** add GHCR retag latest workflow and enhance release tagging logic ([db29bba](https://github.com/MoldyTaint/Cinephage/commit/db29bbaaea54401e865917576bd3b47889502039))
- **workflows:** add GHCR retag latest workflow and enhance release tagging logicic ([#184](https://github.com/MoldyTaint/Cinephage/issues/184)) ([03750c6](https://github.com/MoldyTaint/Cinephage/commit/03750c6630f7d72a60f3edc4ba3a197b2a39a861))

### Bug Fixes

- **activity:** add function to remove stale queue-linked activity rows ([9b46eac](https://github.com/MoldyTaint/Cinephage/commit/9b46eacdf86d796c353d45f2ea5266ef7b465f1f))
- add master playlist support for IPTV-Org streams and Jellyfin format detection ([342b989](https://github.com/MoldyTaint/Cinephage/commit/342b989693132f72996f132f06ce80a0e8e89815))
- add missing logs route and harden error handling ([a928c30](https://github.com/MoldyTaint/Cinephage/commit/a928c307937a2f88fc12fd3a19a17c6994304db6))
- add stalled and paused download states to dashboard load ([ada9557](https://github.com/MoldyTaint/Cinephage/commit/ada95579fe1e4288600e24940b83839377d20c5f))
- align Cinephage streaming auth and server address settings ([9d06186](https://github.com/MoldyTaint/Cinephage/commit/9d06186f6f9da59b11cfc2dcdc659d27f0237bc5))
- align log export validation and test setup ([cb2879f](https://github.com/MoldyTaint/Cinephage/commit/cb2879f9c8e0f847487e081b54906c15225c4a9a))
- align release notes labels with actual repo label names ([f5d7231](https://github.com/MoldyTaint/Cinephage/commit/f5d7231c40e86a3e8c710176bcd3d62f78fd0fa6))
- **auth:** add rateLimit.id column and update schema for Better Auth ([ea41ed0](https://github.com/MoldyTaint/Cinephage/commit/ea41ed0014f2861cc7d8e62d6912ef0950f264e5))
- **backend:** import SvelteURL ([b311fec](https://github.com/MoldyTaint/Cinephage/commit/b311fec4ab4666954cde1f6258312b5a2c217133))
- batch security dependency updates to resolve 30 Dependabot alerts ([ce39a96](https://github.com/MoldyTaint/Cinephage/commit/ce39a967ff8ace6438a3f5422c75407096722ea7))
- **build:** move better-sqlite3 to dependencies for proper adapter-node externalization ([625b16e](https://github.com/MoldyTaint/Cinephage/commit/625b16ee0558c8b6d848e48f8eb44f8eefbcdb46))
- **captcha:** register captcha solver in service manager for anti-bot bypass ([3baad32](https://github.com/MoldyTaint/Cinephage/commit/3baad324cf789ad2498424ecb908c89cf4589a66))
- **ci,auth:** require BETTER_AUTH_SECRET at runtime and set it in docker healthcheck test ([2f8eee8](https://github.com/MoldyTaint/Cinephage/commit/2f8eee8f392cb22a6cf22fc0787d5e8ad12b499c))
- **ci:** add actions:write permission for workflow dispatch ([020ae42](https://github.com/MoldyTaint/Cinephage/commit/020ae42f2584b74ce0365945863f5e25739278de))
- **ci:** add bump-version to job dependencies for output access ([9ec3e40](https://github.com/MoldyTaint/Cinephage/commit/9ec3e40f4447e2bf2f4f86e1d5a9884ce7603010))
- **ci:** add workflow_dispatch inputs for Docker build triggers ([ed9f0f3](https://github.com/MoldyTaint/Cinephage/commit/ed9f0f3cadf1e48c3db475ccc29014f9fd122852))
- **CI:** authenticate release attestation and configure git tag identity ([cbb5cfc](https://github.com/MoldyTaint/Cinephage/commit/cbb5cfcef5bc600a8c6953d204659fab23721cfc))
- **ci:** fix commit detection in auto-release workflow ([1862b8c](https://github.com/MoldyTaint/Cinephage/commit/1862b8cc243b6d5c88ee291a61bc96087116c5cf))
- **ci:** format CHANGELOG.md after generation ([f98a0f0](https://github.com/MoldyTaint/Cinephage/commit/f98a0f05e1bdffa4d83f782ef7f8353c8659b9c5))
- **ci:** generate and upload release notes artifact from bump-version job ([aef948d](https://github.com/MoldyTaint/Cinephage/commit/aef948d4234be18f9f5eda26a3368465953df9ea))
- **ci:** move dotenv to dependencies and remove broken docs-deploy workflow ([8fe119f](https://github.com/MoldyTaint/Cinephage/commit/8fe119f565316859e96db452009668815ada54d8))
- **ci:** pin action SHAs, add concurrency group, normalize action versions ([beb45d4](https://github.com/MoldyTaint/Cinephage/commit/beb45d4bb10151ffe956fa27d18aa34d8d4e766f))
- **ci:** remove paths filter blocking tag-triggered Docker builds ([cc81ab3](https://github.com/MoldyTaint/Cinephage/commit/cc81ab3d7e8f6a75b88dcea00c8465980a7e012e))
- **ci:** remove redundant workflow dispatch triggers ([cdbf07c](https://github.com/MoldyTaint/Cinephage/commit/cdbf07c44f47e236fbb0b37a685e82d971138926))
- **ci:** resolve release workflow issues and backfill changelog ([3162f5e](https://github.com/MoldyTaint/Cinephage/commit/3162f5e437e862f9afbea7abba733e1f512798a8))
- **ci:** skip ci/docs/test/style scoped commits from release triggers ([d3a35c0](https://github.com/MoldyTaint/Cinephage/commit/d3a35c07b088bbae462ad0156ed33f8b1ede5387))
- **ci:** use correct actions/github-script version tag ([43ed9a8](https://github.com/MoldyTaint/Cinephage/commit/43ed9a8c684eac51a9eec5ce8935dc8d07ebc1fc))
- **ci:** use latest-only release notes to avoid body too long error ([6ada5cc](https://github.com/MoldyTaint/Cinephage/commit/6ada5cceffe564d4ea654a61edeac48d265fd18a))
- **ci:** use v4 tag for release-please action ([29df429](https://github.com/MoldyTaint/Cinephage/commit/29df429ee92d349e44fd15c6ec3e070786651586))
- clamp playedPercentage to 100 to prevent progress bar overflow ([79f2b82](https://github.com/MoldyTaint/Cinephage/commit/79f2b824278a9432cf547467e3b3d63ad5dc47e0))
- correct git-cliff template variable (timestamp not date) ([d7b06a4](https://github.com/MoldyTaint/Cinephage/commit/d7b06a401f2fe7c4ab9c0ca8683c14b2f1c70d06))
- correct syntax error in IptvOrgSelector.svelte ([88111b3](https://github.com/MoldyTaint/Cinephage/commit/88111b365fbe13dc174163dc264c5b622cd18d75))
- **dashboard:** count stalled and paused downloads in active downloads stat ([b72820d](https://github.com/MoldyTaint/Cinephage/commit/b72820dc82577d039c5e781de5e1cce2bb791fad))
- **deps:** move dotenv to core depencies, to resolve docker build failure ([71ff2b0](https://github.com/MoldyTaint/Cinephage/commit/71ff2b0536d5e889a9fb10b36d0830d50bbfc009))
- **deps:** regenerate package-lock.json ([660c56e](https://github.com/MoldyTaint/Cinephage/commit/660c56e0b73b30f2219ec99cf173ce8f1db663d8))
- **deps:** regenerate package-lock.json ([5d7727a](https://github.com/MoldyTaint/Cinephage/commit/5d7727a4484f4e79516c1475d6d197b4a912b7b3))
- **deps:** regenerate package-lock.json ([82d9f2e](https://github.com/MoldyTaint/Cinephage/commit/82d9f2e30e78a19a344da802667cc94f69f75c31))
- **deps:** resolve build-breaking dependency issues ([52b101e](https://github.com/MoldyTaint/Cinephage/commit/52b101e3ae4d01354eb2d12f562c5ba0fa376c92))
- **deps:** resolve build-breaking dependency issues ([f287278](https://github.com/MoldyTaint/Cinephage/commit/f287278d85e01f998d1f433bc89fc655114c23b5))
- **deps:** update integrity hash and add dependencies for guessit-js ([d606e86](https://github.com/MoldyTaint/Cinephage/commit/d606e8688f45c4e53f91b16a7b78cd05050c88a3))
- **devcontainer:** repair workspace ownership for node user and clarify sidecar UID/GID docs ([6451535](https://github.com/MoldyTaint/Cinephage/commit/645153523bf2e2a6d2139eea288f0e909acc6dc1))
- discover page minor adjustments ([b533983](https://github.com/MoldyTaint/Cinephage/commit/b533983ab0b1aa253c64b1f23e00c19640f552dd))
- **docker:** keep optional runtime deps for impit native bindings ([e4714dc](https://github.com/MoldyTaint/Cinephage/commit/e4714dce21c197c1c99928be62f1df7536515d73))
- **docs:** correct formatting in API documentation examples ([e8019cf](https://github.com/MoldyTaint/Cinephage/commit/e8019cf0312c1077dc16a8af366ace7bf15fa43b))
- enhance download client update schema with detailed validation and optional fields ([3a92b23](https://github.com/MoldyTaint/Cinephage/commit/3a92b23c208e244ac3d5f41e8956f4d6f56e46b0))
- exclude unaired/TBD episodes from episode counts ([189520c](https://github.com/MoldyTaint/Cinephage/commit/189520cd75cf0b6a6b30744b1a152bb6748d7a7b))
- expand dashboard history preview ([6b8a7cc](https://github.com/MoldyTaint/Cinephage/commit/6b8a7cc284b54a9dc88acd4a36c687248f211f31))
- Fix correct remote user ([7ad97ae](https://github.com/MoldyTaint/Cinephage/commit/7ad97aef4a1f391953a1598bcc5e96256cca6b8d))
- Fix Transmission seed ration and time settings not set correctly ([#290](https://github.com/MoldyTaint/Cinephage/issues/290)) ([b74d35a](https://github.com/MoldyTaint/Cinephage/commit/b74d35a5f717c9c80004d3059b4a5f05a8470fe9))
- force paraglide regeneration and fix type assertions ([d979cc6](https://github.com/MoldyTaint/Cinephage/commit/d979cc636247bd4333558723502739392cfe79b8))
- gate cloudflare streaming live test behind LIVE_TESTS env var ([cb41d4b](https://github.com/MoldyTaint/Cinephage/commit/cb41d4ba52955381bbc2557060dcb03b3c6fd5a9))
- **grab:** implement episode-only search strategy for missing episodes ([434827b](https://github.com/MoldyTaint/Cinephage/commit/434827b9c744b1ad2bf239ade6c4e70ee64df746))
- **i18n:** add missing paraglide keys for custom library UI ([bb5781b](https://github.com/MoldyTaint/Cinephage/commit/bb5781b5c598aaae635793645f8a2e255c7d946b))
- **i18n:** localize anime root-folder enforcement and warning copy ([23a2761](https://github.com/MoldyTaint/Cinephage/commit/23a27613f4312d87ff3cc613a1185bc89852e148))
- **i18n:** update German and English translations for consistency and clarity ([f4828ca](https://github.com/MoldyTaint/Cinephage/commit/f4828cafc14210d50d61fc3938edb3b79d92c70f))
- **import:** fall back to queue/folder release context for obfuscated filenames ([e693c2c](https://github.com/MoldyTaint/Cinephage/commit/e693c2cd3e94b515a0e5982b4d6b05463b5b149b))
- improve API key regeneration UX with confirmation, toasts, and data refresh ([55bdd8a](https://github.com/MoldyTaint/Cinephage/commit/55bdd8af22a5ccdb5a8e75bfa2c702334b830cc0))
- improve auth and library add error reporting ([2a2063e](https://github.com/MoldyTaint/Cinephage/commit/2a2063e6afeba5310d18d0c249bd37f618cee7b1))
- improve clipboard copy functionality and enhance user feedback in settings page ([8257e2e](https://github.com/MoldyTaint/Cinephage/commit/8257e2e501ca7ba4aeadd9ddeee271b3dbb603bd))
- improve codebase quality and type safety ([170c152](https://github.com/MoldyTaint/Cinephage/commit/170c1528f44b09feb6103a08b7258ab0a5faa2c7))
- improve homepage responsive grid layout for mobile ([4b60e6e](https://github.com/MoldyTaint/Cinephage/commit/4b60e6e72a197f1dc660d6bece604d92591cb591))
- improve russian tracker search and pointer download metadata ([e403675](https://github.com/MoldyTaint/Cinephage/commit/e40367532917b1726507056bf4b671026e4c4249))
- improve search reliability with tvdbId support and title relevance filtering ([f28ee62](https://github.com/MoldyTaint/Cinephage/commit/f28ee628a26aa0787dddd8ba02676fff01022533))
- improve service initialization logic and enhance Dockerfile for production dependencies ([bd93c05](https://github.com/MoldyTaint/Cinephage/commit/bd93c059de3fc518d6c43c542d99e5e536af261f))
- increase timeout for scrypt-based password hashing tests on CI ([e9d5b27](https://github.com/MoldyTaint/Cinephage/commit/e9d5b2720129484786fc50bec70eb3548e1e470f))
- **indexer:** add ID validation and year matching to prevent wrong movie results ([ee152cb](https://github.com/MoldyTaint/Cinephage/commit/ee152cbfa0c70fc4e270fd41ea014534ca01e240))
- **indexer:** enhance search orchestrator with title variant handling and episode pointer support for RuTracker indexer ([0f24e02](https://github.com/MoldyTaint/Cinephage/commit/0f24e023dcecf6232ccb92452a437ac5e716440e))
- **indexers:** always prefer torrent files over magnet links for private tracker compatibility ([c6588bd](https://github.com/MoldyTaint/Cinephage/commit/c6588bd0169118ca648149739201e17bdf1169ac))
- **indexers:** normalize Milkie category IDs to tracker-native mapping ([30b258e](https://github.com/MoldyTaint/Cinephage/commit/30b258ee8d270a77ca9347cebc087f5418516d89))
- **indexers:** preserve localized titles in interactive matching ([dbc04fe](https://github.com/MoldyTaint/Cinephage/commit/dbc04fe604d06b53d902cdc4e5f00032e0390be4))
- **indexers:** preserve Russian titles in RuTracker and Kinozal ([ecb9faa](https://github.com/MoldyTaint/Cinephage/commit/ecb9faa5a82b92936f9145c8d5d016dbffe4e71e))
- **indexers:** update Kinozal and RuTracker configurations for improved Cyrillic handling and search strategies ([0517df2](https://github.com/MoldyTaint/Cinephage/commit/0517df26dc1fae7ffbe70bb36e55ec65030a53eb))
- keep queue state consistent after import and removal ([0768c5c](https://github.com/MoldyTaint/Cinephage/commit/0768c5c30ee935753e79df8ad9e39b8a705cbd7e))
- keep symlinked NZB-Mount media visible after reload and library scans ([3a36072](https://github.com/MoldyTaint/Cinephage/commit/3a36072b520add2454f9708a54cdcae0f89993b1))
- **lint:** remove double indents ([b8da813](https://github.com/MoldyTaint/Cinephage/commit/b8da81307c6a32b71f7466a785495deffcabb876))
- **lint:** remove unused prop and replace mutable URL instance ([78f3989](https://github.com/MoldyTaint/Cinephage/commit/78f398971fba08ae49296f2e97a9a72617b6d3f7))
- **livetv:** Add logging and error handling to SSE streams ([f90573d](https://github.com/MoldyTaint/Cinephage/commit/f90573db103bf511516205d4e3693bc32fd3a838))
- **livetv:** resolve stream replay loops on stalker portals via HLS-to-TS conversion ([127e8cd](https://github.com/MoldyTaint/Cinephage/commit/127e8cdd63d249be0d0a5b76473ea5d4bc7356c2))
- make rate-limit cleanup test-safe ([9a7db72](https://github.com/MoldyTaint/Cinephage/commit/9a7db7255a2d9efd98a46e1799b3066e42be80b7))
- **missing-search:** scope RuTracker episode-only flow and prevent partial-season re-downloads in manual auto-grab ([01477fa](https://github.com/MoldyTaint/Cinephage/commit/01477fa61dc26571461b3f3b68547932aaad5f05))
- **monitoring,indexers,dashboard:** reconcile missing-state searchability and harden release/cooldown logic ([#139](https://github.com/MoldyTaint/Cinephage/issues/139)) ([23d5e00](https://github.com/MoldyTaint/Cinephage/commit/23d5e002e9e839da234459ca6e9ba537a9118ff2))
- move dotenv to runtime deps and improve auth secret handling for SSR and testing environments ([bc0b4a9](https://github.com/MoldyTaint/Cinephage/commit/bc0b4a945ccb7d8503abaeeefaa1e2a6160a2337))
- nCore IMDB parsing and add debug logging for indexer search issues ([e284865](https://github.com/MoldyTaint/Cinephage/commit/e284865d250f6b8e852276f365b2777c36a1552f))
- normalize dolby vision naming output ([d5d077e](https://github.com/MoldyTaint/Cinephage/commit/d5d077e4a046e4fdfdc3603c7108eb2309f67fbc))
- normalize path handling for client paths and add tests for Windows separator support ([7c4fe7d](https://github.com/MoldyTaint/Cinephage/commit/7c4fe7d476b629b20b3e59c21b740ad1792a46ee))
- preserve native titles in tracker search requests ([6a9738c](https://github.com/MoldyTaint/Cinephage/commit/6a9738c30191f974ce8fd3802f0453e69b4a0c8f))
- prevent legacy library backfill from reassigning root folders ([bae5442](https://github.com/MoldyTaint/Cinephage/commit/bae5442ff0c9a36c3ebfcd90e388b056352086d7))
- quote labels with colons in release notes config ([cff1b42](https://github.com/MoldyTaint/Cinephage/commit/cff1b4219a423c888fbe14d05b9f46f778c9884c))
- refresh plex libraries by folder path ([94a9a29](https://github.com/MoldyTaint/Cinephage/commit/94a9a2902393ff39eed648dda212060b0cb1642d))
- regenerate package-lock.json ([6e789cf](https://github.com/MoldyTaint/Cinephage/commit/6e789cffdb59d8bd3a5e2d4f6ff4b240e754fee1))
- **release:** update version bump cycle to sync package-lock.json, and add contributor credit to release notes. ([#293](https://github.com/MoldyTaint/Cinephage/issues/293)) ([d74c7c2](https://github.com/MoldyTaint/Cinephage/commit/d74c7c266d6e0e9e49c6602b19a5a77abfa6768d))
- remove invalid 'items' parameter from bulk operation translations ([e44fa07](https://github.com/MoldyTaint/Cinephage/commit/e44fa07e449e85a4f78d1cbcfc8e5c7c74928c3f))
- remove unused mediaTitle variable in MatchFolderModal ([dc0a611](https://github.com/MoldyTaint/Cinephage/commit/dc0a6111148dd16c10e313e768d5c808c45aeeea))
- resolve 15 npm security vulnerabilities ([6be827f](https://github.com/MoldyTaint/Cinephage/commit/6be827f228d33d24f5634a258f9e2401ea3847ea))
- resolve Better Auth v1.5 API key breaking changes ([8f7719f](https://github.com/MoldyTaint/Cinephage/commit/8f7719f43b8e87676e4837a46468ec5e665748bf))
- resolve CI and Docker build failures ([dd97ff9](https://github.com/MoldyTaint/Cinephage/commit/dd97ff94df0e4f35b3537f54dc3daf1551561780))
- resolve CI failures and improve code quality ([a9ccb93](https://github.com/MoldyTaint/Cinephage/commit/a9ccb935250a31ec091fbceafb33ea6d5145be4b))
- resolve duplicate key crash in interactive search modal ([d1d3eaf](https://github.com/MoldyTaint/Cinephage/commit/d1d3eaf5119231fdc264665f7498a4c3506601d0))
- resolve final 6 translation type errors ([7f9e843](https://github.com/MoldyTaint/Cinephage/commit/7f9e84333c1de58ce04bc5c38b3c7eeb4b90f6b6))
- resolve German translation duplicates causing type mismatches ([bbc4075](https://github.com/MoldyTaint/Cinephage/commit/bbc4075095a160cce4493a21d58394d3c6405004))
- resolve i18n translation type errors ([4d7288e](https://github.com/MoldyTaint/Cinephage/commit/4d7288e71abe75b21b8d1deb414402607fe1a932))
- resolve lint errors (each keys, unused var, unused props) ([a87daa9](https://github.com/MoldyTaint/Cinephage/commit/a87daa9076db71c649a7fd5c4bc2a7a0af271a20))
- resolve remaining i18n translation type errors ([b5f00e9](https://github.com/MoldyTaint/Cinephage/commit/b5f00e9a3cd335cb223fb14fce97c9b495ec099c))
- resolve Rutracker double-slash URL issue causing grab failures ([c9f6963](https://github.com/MoldyTaint/Cinephage/commit/c9f6963022772225607781ea167e0b5f05da98d1))
- resolve type check errors and set Better Auth to respect DATA_DIR to resolve docker build failures. ([5f6d92a](https://github.com/MoldyTaint/Cinephage/commit/5f6d92a78a06e9d6b5e71c10956ce7146a90dd27))
- resolve typecheck errors in refactored test files ([14673ef](https://github.com/MoldyTaint/Cinephage/commit/14673efa231caf9320ced6ebff882bec1681e39c))
- respect monitorSpecials setting for Season 0 episodes ([8d09083](https://github.com/MoldyTaint/Cinephage/commit/8d09083c823bb3882de5178cf3b7d7b1a64264ee))
- restore original test file for MonitoringSearchService ([e1abd50](https://github.com/MoldyTaint/Cinephage/commit/e1abd5056c0ed5a7a0ad64d4cadf9c9d938b4865))
- sanitize streaming indexer settings and tighten dashboard typing ([e262955](https://github.com/MoldyTaint/Cinephage/commit/e2629556aabee8b4b110fc5fb3b071cb25ca864f))
- **scan:** restore disk scan helpers and remove broken library auto-routing ([bb5781b](https://github.com/MoldyTaint/Cinephage/commit/bb5781b5c598aaae635793645f8a2e255c7d946b))
- **schema:** update CURRENT_SCHEMA_VERSION to 66 and adjust apikey schema migration ([10658be](https://github.com/MoldyTaint/Cinephage/commit/10658be056cf12fc3f53be90eeacad40773670b9))
- **search:** add filter to exclude non-video artifacts from movie/TV searches ([ef82e53](https://github.com/MoldyTaint/Cinephage/commit/ef82e53c90c9808113e0a7a67ae978184c6f822d))
- **search:** add streamer profile filtering for internal Cinephage Library indexer ([69a7552](https://github.com/MoldyTaint/Cinephage/commit/69a75526d089e0822d9065c7774a7c67ed24cdd7))
- **search:** enhance auto-search error handling and reporting ([159f782](https://github.com/MoldyTaint/Cinephage/commit/159f782691d6b66b9d88f6308b4b4a0df3b16d1d))
- **search:** enhance filtering for RuTracker season packs in TV searches ([0bfd858](https://github.com/MoldyTaint/Cinephage/commit/0bfd858e75e8df68da46c64563e36d1adbcfc9a1))
- **search:** improve movie ID search reliability on Newznab indexers ([#151](https://github.com/MoldyTaint/Cinephage/issues/151)) ([93f5c91](https://github.com/MoldyTaint/Cinephage/commit/93f5c910def79ec5939e4c048cfeb302ec51b4a9))
- **security:** apply base security headers to all routes and validate correlation IDs ([b41be26](https://github.com/MoldyTaint/Cinephage/commit/b41be260ab3d8f3c9d9f56e3d5dc75eda8e79efe))
- **security:** enforce CSRF origin validation for private networks ([4e4d298](https://github.com/MoldyTaint/Cinephage/commit/4e4d2988de7190ebb05881757a3013bf6e02d8b6))
- **security:** harden SSRF protection and proxy security for all outbound requests ([8943c75](https://github.com/MoldyTaint/Cinephage/commit/8943c751dad151f46d6be71bf2b7512c4e63b58d))
- **security:** prevent command injection in subtitle sync service ([fa11658](https://github.com/MoldyTaint/Cinephage/commit/fa11658ad8d59533d42ca48840706f7ec6bfab31))
- **security:** redact credentials in API responses and settings UI ([bec28b6](https://github.com/MoldyTaint/Cinephage/commit/bec28b6db21a3bf6636e32e0d4d627a4381b8392))
- **security:** restrict filesystem browse, path traversal, TMDB proxy, and query columns ([177c395](https://github.com/MoldyTaint/Cinephage/commit/177c395a6603a402e4545297bc6f083e2109b46c))
- seed scoring profiles before library add inserts ([d5b6dbc](https://github.com/MoldyTaint/Cinephage/commit/d5b6dbcdc1cbb59fb8adceb076b3b8e958a66e6b))
- send correct identifier to download clients for remove/pause/resume requests ([fe26daf](https://github.com/MoldyTaint/Cinephage/commit/fe26dafec4c492e434f739ebb62acaee82f54f2b))
- send correct identifier to download clients for remove/pause/resume requests ([#136](https://github.com/MoldyTaint/Cinephage/issues/136)) ([7cc0be6](https://github.com/MoldyTaint/Cinephage/commit/7cc0be64ab88eebfcf3785c9b3f637ffee95a32a))
- serialize Error instances in log capture store to prevent 500 on /settings/logs ([0b72e67](https://github.com/MoldyTaint/Cinephage/commit/0b72e67218ee30830ecfbaf51fdfcd414bbbdd74))
- set ORIGIN for better-auth base url fallback ([fdd87ee](https://github.com/MoldyTaint/Cinephage/commit/fdd87ee7beeb3f1a3cc29de9aa4e834b8f4a46ab))
- **smartlists:** harden external source handling and overhaul smart list UX ([#146](https://github.com/MoldyTaint/Cinephage/issues/146)) ([39ff4cc](https://github.com/MoldyTaint/Cinephage/commit/39ff4cccc3039e5a7394e22afefa385450731ea9))
- **sse:** Add circuit breaker logic to recordConnectionError ([b02e290](https://github.com/MoldyTaint/Cinephage/commit/b02e29066b113154a00a9c96be1e68a07a284dee))
- stop library scans excluding legitimate titles and preserve streaming file paths ([36de085](https://github.com/MoldyTaint/Cinephage/commit/36de08575532b0fb6d862f3dab1e52ab7e0cf1aa))
- **streaming:** add Cloudflare bypass and disable Vidlink provider ([adcbf3c](https://github.com/MoldyTaint/Cinephage/commit/adcbf3ccc61e4d43703d2c573810f110c5ce49b7))
- **subtitles:** authenticate before each OpenSubtitles API request ([1831e1b](https://github.com/MoldyTaint/Cinephage/commit/1831e1b0e712f3ad3c3907d8fd760541f3ad6d8f)), closes [#180](https://github.com/MoldyTaint/Cinephage/issues/180)
- **test:** fallback to built-in scoring formats when custom_formats table is unavailable ([0558005](https://github.com/MoldyTaint/Cinephage/commit/0558005e96231cb7f72c4768d0ba33d435445586))
- **tests:** use rest params in mockImplementation to satisfy TypeScript ([795df91](https://github.com/MoldyTaint/Cinephage/commit/795df91fe478c08824ba9b86846ade10e329069a))
- tighten tracker search title matching and localized fallback ([63c0e90](https://github.com/MoldyTaint/Cinephage/commit/63c0e90371d27ac6230298f9edf264c130fa9917))
- title normalization, naming cache invalidation, and log sanitization ([e3ce8a4](https://github.com/MoldyTaint/Cinephage/commit/e3ce8a4248a521e0ad691ac4f56940e2920d027a))
- **tv:** exclude specials from missing-episode auto-grab and UI missing counts ([a1242f8](https://github.com/MoldyTaint/Cinephage/commit/a1242f83d1688f014b550ad238ab38c58f3e97b5))
- **ui:** move mobile SSE status badge into header and align with nav spacing ([ba81f60](https://github.com/MoldyTaint/Cinephage/commit/ba81f60dec5bc68bc5d8504395a3b965bd64f642))
- **ui:** move scan banner to visible location, minor ui/backend tweaks ([4f88ace](https://github.com/MoldyTaint/Cinephage/commit/4f88ace9fdb063e3e5394b37788e9d2408fa2212))
- unify scoring profiles into single DB source, fix profile-not-found on add-to-library ([1c1aa87](https://github.com/MoldyTaint/Cinephage/commit/1c1aa8787606fb6f4bcdbcb1f4f5e55b68a92392))
- update .gitignore to include secrets and remove sensitive .auth-secret file ([fd888e3](https://github.com/MoldyTaint/Cinephage/commit/fd888e3517e8b1f04c9f788de9f643e69c57ef53))
- update activity deletion logic to include move task history and adjust total deleted count ([182cc7c](https://github.com/MoldyTaint/Cinephage/commit/182cc7c4f839617421393233e001da7839c5878d))
- update Dockerfile to use absolute path for entrypoint script ([272567f](https://github.com/MoldyTaint/Cinephage/commit/272567f928fbf35815c3ac91795b3280a542f897))
- update media server description and enhance auth secret retrieval ([f8c75b8](https://github.com/MoldyTaint/Cinephage/commit/f8c75b875718060be796ab7ac6f7750123d26508))
- update relative imports in relocated providers.live.test.ts ([17f7f1a](https://github.com/MoldyTaint/Cinephage/commit/17f7f1afac26c601a5caae6e6505cb9f4a54e71c))
- update TMDB configuration link and enhance modal opening logic ([fb3903f](https://github.com/MoldyTaint/Cinephage/commit/fb3903fca3570e0599a22d605290e0a8ad1a79de))
- use correct episode file as upgrade baseline ([#213](https://github.com/MoldyTaint/Cinephage/issues/213)) ([458935b](https://github.com/MoldyTaint/Cinephage/commit/458935b4027345dc7412200f784a5ec5c7a5f3b8))
- use docker buildx imagetools to auto-detect CI candidate tag ([de33a07](https://github.com/MoldyTaint/Cinephage/commit/de33a073d5736a65aae13de8215d313e0f98bed5))
- use gh cli instead of curl for GHCR package auto-detection ([1928f92](https://github.com/MoldyTaint/Cinephage/commit/1928f92b4a2aba946a78b4e0dda7f5aa1490c5ef))
- **version:** move version resolution logic to a dedicated module ([d0743d7](https://github.com/MoldyTaint/Cinephage/commit/d0743d7c3e7cb3e013947af734fd2350e23eace0))
- **version:** remove PUBLIC_APP_VERSION environment variable and update app version resolution logic ([e87853f](https://github.com/MoldyTaint/Cinephage/commit/e87853f02b912155e1697665607fa357cbd02729))
- **workflow:** enhance version bump logic for dev branch and add parsing for stable tags ([#183](https://github.com/MoldyTaint/Cinephage/issues/183)) ([3612257](https://github.com/MoldyTaint/Cinephage/commit/3612257d29f51f5754428aa89a123e2e7680d9c3))
- **workflows:** enhance validation for stable source tags in GHCR retag workflow ([5254a06](https://github.com/MoldyTaint/Cinephage/commit/5254a06024636aa1c54345e91dd9efb439882f08))
- **workflows:** enhance validation for stable source tags in GHCR retag workflow ([#188](https://github.com/MoldyTaint/Cinephage/issues/188)) ([71e64bf](https://github.com/MoldyTaint/Cinephage/commit/71e64bf69449f8c254a25118b8e6e477c9b0fed1))
- **workflows:** normalize semver input for source tag in GHCR retag workflow ([1f4776a](https://github.com/MoldyTaint/Cinephage/commit/1f4776a9633961a9ba12a590114e3603dd965481))

### Refactoring

- align dashboard activity with history feed ([9d7026c](https://github.com/MoldyTaint/Cinephage/commit/9d7026cd3adf1b37508636b576649544a542f3d7))
- **api:** migrate 33 API routes to use parseBody() helpers ([8a75987](https://github.com/MoldyTaint/Cinephage/commit/8a7598750a213c210f2576d57f3babfee93c3c2e))
- consolidate duplicate formatting utilities into format.ts ([bae137e](https://github.com/MoldyTaint/Cinephage/commit/bae137efee46f1f02c680a80cf6da0cac14fda01))
- **downloadClients:** consolidate NZB-Mount functionality into SABnzbd client and update related components ([2a36e04](https://github.com/MoldyTaint/Cinephage/commit/2a36e0442b0fd393ae36b2a1b4a9b0e6448bca66))
- **downloadClients:** remove NZB-Mount references and consolidate to SABnzbd functionality ([c34f055](https://github.com/MoldyTaint/Cinephage/commit/c34f05511e6e02c9c964a8862c1ebe6f3dc7fa15))
- extract dashboard queries and add progressive rendering ([b26ab99](https://github.com/MoldyTaint/Cinephage/commit/b26ab9978b605f9b188289e71e05c364432e70b3))
- extract LiveTV stream handler to shared service module ([ba838bf](https://github.com/MoldyTaint/Cinephage/commit/ba838bfa9bec59437f7cb2b957c96fc2cdad8767))
- **monitoring:** Remove dead streaming code from MonitoringSearchService ([b4b35a3](https://github.com/MoldyTaint/Cinephage/commit/b4b35a3a0bb9b51ba482c27213b409e2fed4d161))
- optimize MonitoringSearchService file lookups with eager loading ([2b7ae64](https://github.com/MoldyTaint/Cinephage/commit/2b7ae6413f1efcaad4454fac6f32899f35c7f0ba))
- per-suite DB isolation to enable test file parallelism ([89ce9e0](https://github.com/MoldyTaint/Cinephage/commit/89ce9e020f6e23c6618f527700a09ca70cc0d66a))
- reduce mock fragility in MonitoringSearchService tests ([fb371fb](https://github.com/MoldyTaint/Cinephage/commit/fb371fbd74d8caa367ee212881289d20bd27dedc))
- reduce mock fragility in searchOnAdd tests ([200ddc6](https://github.com/MoldyTaint/Cinephage/commit/200ddc6c5a4ccd361dc1da8320da2c34cd9d361e))
- **release:** simplify stable and preview channels ([152ba86](https://github.com/MoldyTaint/Cinephage/commit/152ba86a6f9c7eb9fb8bd0b48bf12795b9e1c122))
- remove 'as any' from LanguageProfileService tests ([c15051d](https://github.com/MoldyTaint/Cinephage/commit/c15051d863aed15f92bd5c8d3f41dd54c9933772))
- remove 'as any' from M3uProvider tests ([af1bc47](https://github.com/MoldyTaint/Cinephage/commit/af1bc47c8c1f709f5d12ab8493d010e14c725d2f))
- remove 'as any' from manual-import-service tests ([3346eba](https://github.com/MoldyTaint/Cinephage/commit/3346eba7c28624526a6ffa4a28dd376efe51966a))
- remove 'as any' from MonitoringScheduler tests ([f6944fa](https://github.com/MoldyTaint/Cinephage/commit/f6944fa3eeae0959ecd474beeb613c006cae9efe))
- remove 'as any' from OpenSubtitlesProvider tests ([e212a57](https://github.com/MoldyTaint/Cinephage/commit/e212a5704eb02ef50c5c3f13a77b8ff1af47dbcf))
- remove 'as any' from parsers tests ([7819479](https://github.com/MoldyTaint/Cinephage/commit/7819479bec87bf819f879d03eb95a5080c9f03e1))
- remove 'as any' from rating-buffer tests ([acc7ebb](https://github.com/MoldyTaint/Cinephage/commit/acc7ebbd4e49b3feaa128d86af28a246ad8670ad))
- remove 'as any' from RenamePreviewService tests ([4760100](https://github.com/MoldyTaint/Cinephage/commit/4760100bae2f8ab63c9476a1a46daf515f792c2d))
- remove 'as any' from RequestBuilder tests ([fe50f58](https://github.com/MoldyTaint/Cinephage/commit/fe50f584c007255db90ca4202d4ddaaaf94cb993))
- remove 'as any' from sse tests ([9cf22cc](https://github.com/MoldyTaint/Cinephage/commit/9cf22cc3fb5b091d8bfe21ff3a1ec0508ff53829))
- remove 'as any' from TorrentProtocolHandler tests ([3b1b5b1](https://github.com/MoldyTaint/Cinephage/commit/3b1b5b1e74a7d7fcb5a57504e3458ce1f090d1b3))
- remove old maintenance and server-stats pages in favor of unified status page ([8ac7878](https://github.com/MoldyTaint/Cinephage/commit/8ac78788db0f333fd09e42b3294cec9bdf9b7882))
- remove redundant overview cards and charts from unified status page ([e619c26](https://github.com/MoldyTaint/Cinephage/commit/e619c26ff0fb229b99fb0a0da0c804946c7a3ac4))
- remove unreachable TV certification notes in discover filter ([0c53d4e](https://github.com/MoldyTaint/Cinephage/commit/0c53d4e1549a8ef7e028a714c33fa574299aa147))
- remove unused import from Live TV portals API ([9b93335](https://github.com/MoldyTaint/Cinephage/commit/9b93335cb6e0e06d8849bafff354c2c6854f6e8a))
- replace 'as any' with typed fixtures in CutoffUnmetSpecification tests ([ad9c8fa](https://github.com/MoldyTaint/Cinephage/commit/ad9c8faaf72095d2ac88a7f52f3cbe5aca407b39))
- replace 'as any' with typed fixtures in searchorchestrator tests ([c01867b](https://github.com/MoldyTaint/Cinephage/commit/c01867ba3610c0dce67f418c9f4b535b2816f1c5))
- replace 'as any' with typed fixtures in UpgradeableSpecification tests ([8b01dd6](https://github.com/MoldyTaint/Cinephage/commit/8b01dd62e3f1ae18504b7a1f6f326c27d0a892fa))
- **streaming:** align Cinephage integration and release sync ([7588d5f](https://github.com/MoldyTaint/Cinephage/commit/7588d5f2f94f49dfc70ae70cbce741dcf22bb4e3))
- strip overview sections from storage and media server components ([6faea29](https://github.com/MoldyTaint/Cinephage/commit/6faea291c1e29f9728530119d0c751965549f052))
- **subtitles:** replace ThrottleManager with DB-backed provider throttling ([a3949b1](https://github.com/MoldyTaint/Cinephage/commit/a3949b1f8419cc9e6f5a1b7e3fb6432d1c900aa1))
- **ui:** split settings (library & storage and system) pages into horizontal nav layouts with child routes ([5513c35](https://github.com/MoldyTaint/Cinephage/commit/5513c35c73e60644486d0f17d0a5b1f4e4572cd8))
- unify logging system with structured log capture ([882d8aa](https://github.com/MoldyTaint/Cinephage/commit/882d8aa56e4498ad0c0133ba6c74b5b8c4c44877))
- unify SSE streams and remove legacy plumbing ([d5dead7](https://github.com/MoldyTaint/Cinephage/commit/d5dead7266282d0d2746af4bf900e73b93381b2a))
- update general settings nav tabs to use unified Status page ([9bb6ff4](https://github.com/MoldyTaint/Cinephage/commit/9bb6ff460e47784aac860aab89d9b45f50ff7af1))

### Styling

- fix formatting in release-please workflow ([8f0bfd3](https://github.com/MoldyTaint/Cinephage/commit/8f0bfd343c7080f269d91de2130d411b930e967f))
- fix unused vars in StalkerPortalClient to pass lint ([df48e78](https://github.com/MoldyTaint/Cinephage/commit/df48e78fb0077e8f4f24114236a2e968201f452e))
- format media explorer changes ([5ce0188](https://github.com/MoldyTaint/Cinephage/commit/5ce0188ea52f908924c0e269a0cc476b107f8545))
- format merged plex integration files ([28f4311](https://github.com/MoldyTaint/Cinephage/commit/28f43114168dfc6a14a24be60be6a9b9d0eb8a4d))
- **lint:** use SvelteURLSearchParams instead of URLSearchParams ([9ce9714](https://github.com/MoldyTaint/Cinephage/commit/9ce9714be472a8ca860825c8217ec010ad19430e))
- **tests:** fix Prettier formatting in OpenSubtitlesProvider test ([3834fc1](https://github.com/MoldyTaint/Cinephage/commit/3834fc1736bcd6e338592cc0bf75e7bc46bc236f))

### Documentation

- clarify error id messaging ([240cd52](https://github.com/MoldyTaint/Cinephage/commit/240cd52a70b0dfe00e59f06a6d28f702976d61f8))
- **db:** document schema version 70 in migration header ([ba665d2](https://github.com/MoldyTaint/Cinephage/commit/ba665d2dadd68df253638eb27209cc26081b29b8))
- migrate to Docusaurus with comprehensive documentation ([7cbc8e5](https://github.com/MoldyTaint/Cinephage/commit/7cbc8e59af748d2c00ee0408b781b44d3a86a08f))
- rework README with bare metal install, systemd, and updated screenshots ([b6434b7](https://github.com/MoldyTaint/Cinephage/commit/b6434b7bc20ca32d7ac35ed25a89eb573aa0ce6e))
- update AGENTS.md with comprehensive development guidelines ([6fcbaf5](https://github.com/MoldyTaint/Cinephage/commit/6fcbaf53eeefa93267a9791ef0108af6364f52d3))
- update AGENTS.md with improved test patterns and conventions ([00f9dcf](https://github.com/MoldyTaint/Cinephage/commit/00f9dcf2f989f8a062739eddee6ba39506e7255a))
- update BETTER_AUTH_SECRET generation instructions and add to environment variable references ([893e57c](https://github.com/MoldyTaint/Cinephage/commit/893e57ce63c829f1c00b64f2c3f0ebad88612cb3))

### Testing

- align upgradeable spec fixtures with real format ids ([6d1fe85](https://github.com/MoldyTaint/Cinephage/commit/6d1fe85ad0f0446efd227922ea7e909e008285cf))
- isolate monitoring decision scoring from runtime db ([e54db9e](https://github.com/MoldyTaint/Cinephage/commit/e54db9e62256e29b4781f400a0e244f9bdbe5209))
- isolate pure scoring tests from runtime db ([cfabd4c](https://github.com/MoldyTaint/Cinephage/commit/cfabd4ccc265f78d642defd2d49c27ff8e8a9099))
- update rate-limit test for language field ([c83f801](https://github.com/MoldyTaint/Cinephage/commit/c83f801c10ec1d0f1a4c4ec6ccc8a537a4e2480a))

### Miscellaneous

- add devcontainer support ([558bfa5](https://github.com/MoldyTaint/Cinephage/commit/558bfa5cd83176f7b59d1930bbb29521fc03b240))
- bump version to 0.1.3 ([010e45c](https://github.com/MoldyTaint/Cinephage/commit/010e45c2e1c066e3f1ce877af15ca3a124cfd210))
- bump version to 0.2.0 ([96f36ad](https://github.com/MoldyTaint/Cinephage/commit/96f36ad462b9a65614cdfbebfd152301fceb97f4))
- bump version to 0.2.1 ([2386f3d](https://github.com/MoldyTaint/Cinephage/commit/2386f3d06fd35d339c523e27b92d6709e7e45650))
- bump version to 0.2.2 ([#294](https://github.com/MoldyTaint/Cinephage/issues/294)) ([6f61b56](https://github.com/MoldyTaint/Cinephage/commit/6f61b56e4b651c9eee21864a6b580fc62bb0a9b6))
- **ci:** bump actions/attest-build-provenance ([#173](https://github.com/MoldyTaint/Cinephage/issues/173)) ([ca4914c](https://github.com/MoldyTaint/Cinephage/commit/ca4914cb46b35511c20343887736890413449352))
- **ci:** bump actions/attest-build-provenance from v3 to v4.1.0 ([6135e2c](https://github.com/MoldyTaint/Cinephage/commit/6135e2c332589903fbed773f0124b6a0bfd18715))
- **ci:** bump actions/checkout from 4.2.2 to 6.0.2 ([38324fb](https://github.com/MoldyTaint/Cinephage/commit/38324fb72eabb50e0b7e7d89570867619f0ce563))
- **ci:** bump actions/setup-node from 6.2.0 to 6.3.0 ([8d8e52e](https://github.com/MoldyTaint/Cinephage/commit/8d8e52efd63b6ac9a939bb680d219dcffd5d737f))
- **ci:** bump actions/upload-artifact from 4 to 7 ([6142d57](https://github.com/MoldyTaint/Cinephage/commit/6142d57bd475e706f4525bf3fc2f02c33a298ae4))
- **ci:** bump docker/build-push-action from 6.19.2 to 7.1.0 ([4359200](https://github.com/MoldyTaint/Cinephage/commit/4359200c92a8b1a8aa2dabeadf8ba94e78ca1614))
- **ci:** bump docker/build-push-action from 6.9.0 to 6.19.2 ([#175](https://github.com/MoldyTaint/Cinephage/issues/175)) ([b4897f8](https://github.com/MoldyTaint/Cinephage/commit/b4897f802eb08751452b7b7e145d7eb9cb7721d9))
- **ci:** bump docker/build-push-action from v6 to v7 ([2b2b041](https://github.com/MoldyTaint/Cinephage/commit/2b2b0414ec7d30fca015bb72130568dd2b0363c1))
- **ci:** bump docker/login-action from 3.3.0 to 3.7.0 ([#174](https://github.com/MoldyTaint/Cinephage/issues/174)) ([4da4de3](https://github.com/MoldyTaint/Cinephage/commit/4da4de3d676842d1eaf4ba5d7d818f3d744652b4))
- **ci:** bump docker/login-action from 3.7.0 to 4.1.0 ([aae24bb](https://github.com/MoldyTaint/Cinephage/commit/aae24bbbb74a8973a6d3bdc82793758aaf156c57))
- **ci:** bump docker/login-action from v3 to v4 ([f0db9a2](https://github.com/MoldyTaint/Cinephage/commit/f0db9a2f5c16e762930a8c1b12ec68e1a731c44d))
- **ci:** bump docker/metadata-action from 5.5.1 to 5.10.0 ([#171](https://github.com/MoldyTaint/Cinephage/issues/171)) ([bf7374f](https://github.com/MoldyTaint/Cinephage/commit/bf7374f5fc7e9eed0874d6e6ade42ebdc8530abf))
- **ci:** bump docker/metadata-action from v5 to v6 ([add62ec](https://github.com/MoldyTaint/Cinephage/commit/add62ec5672e3985da55885de19d990ad91dcca6))
- **ci:** bump docker/setup-buildx-action from 3.12.0 to 4.0.0 ([75091ae](https://github.com/MoldyTaint/Cinephage/commit/75091ae7810fbcc10a5f523ebfbc3ab5c84d2c21))
- **ci:** bump docker/setup-buildx-action from 3.7.1 to 3.12.0 ([#172](https://github.com/MoldyTaint/Cinephage/issues/172)) ([bfeb2cc](https://github.com/MoldyTaint/Cinephage/commit/bfeb2cca454b27efbaae00c8a64046636bfd58ab))
- **ci:** pin GitHub Actions to commit SHAs ([0e9636a](https://github.com/MoldyTaint/Cinephage/commit/0e9636a53d312008be598493ca7c294c7894517a))
- **deps:** bump brace-expansion from 5.0.3 to 5.0.5 ([f24bc6d](https://github.com/MoldyTaint/Cinephage/commit/f24bc6d05fadc60474f28fb0b0204a6801c959de))
- **deps:** bump devalue from 5.6.2 to 5.6.3 ([#143](https://github.com/MoldyTaint/Cinephage/issues/143)) ([5916f5c](https://github.com/MoldyTaint/Cinephage/commit/5916f5cc1e78a6451b54bc363a801b42e3fe2617))
- **deps:** bump devalue from 5.6.3 to 5.6.4 ([c5d8411](https://github.com/MoldyTaint/Cinephage/commit/c5d8411ac69f1b82558960b673a29f5a3cd3366b))
- **deps:** bump drizzle-orm from 0.45.1 to 0.45.2 in the drizzle group ([030f6f3](https://github.com/MoldyTaint/Cinephage/commit/030f6f3ea1c3b835d67ec2440e2abc027059e115))
- **deps:** bump eslint from 9.39.2 to 10.0.1 ([#150](https://github.com/MoldyTaint/Cinephage/issues/150)) ([4c9a5d9](https://github.com/MoldyTaint/Cinephage/commit/4c9a5d9c19ae85617ebcd4046b69a5bb2d32e40b))
- **deps:** bump fast-xml-parser from 5.3.7 to 5.3.8 ([79bf886](https://github.com/MoldyTaint/Cinephage/commit/79bf8864549441bfd51f56050a4102631e3f08a7))
- **deps:** bump fast-xml-parser from 5.4.1 to 5.5.7 ([3f7cb4b](https://github.com/MoldyTaint/Cinephage/commit/3f7cb4bdfdb24df6bd6dc78cabbc69c4006ef12b))
- **deps:** bump flatted from 3.3.3 to 3.4.2 ([85a2d37](https://github.com/MoldyTaint/Cinephage/commit/85a2d37a0138a8716c6bbb55ee9c83f3a95fae90))
- **deps:** bump lucide-svelte from 0.575.0 to 1.0.1 ([70b2e53](https://github.com/MoldyTaint/Cinephage/commit/70b2e537b259b8ee68ef9a85b44754787c885c17))
- **deps:** bump minimatch from 9.0.6 to 9.0.9 ([87d5490](https://github.com/MoldyTaint/Cinephage/commit/87d5490bf7047c5e80e0bc5bb0b61ea6c4d59eba))
- **deps:** bump minor-and-patch group (better-sqlite3, camoufox-js, eslint, lucide-svelte, and 7 more) ([4cbf72e](https://github.com/MoldyTaint/Cinephage/commit/4cbf72e4163b63fdde9cdbd2951f3c4867011354))
- **deps:** bump picomatch from 4.0.3 to 4.0.4 ([a965a10](https://github.com/MoldyTaint/Cinephage/commit/a965a1030a7011bd31d6e67bb1706e28ee50740a))
- **deps:** bump pino from 9.14.0 to 10.3.1 ([7552811](https://github.com/MoldyTaint/Cinephage/commit/7552811b9ccbe4ea0d2797f69015e1325b816c5c))
- **deps:** bump rollup from 4.53.5 to 4.59.0 ([bcb7c77](https://github.com/MoldyTaint/Cinephage/commit/bcb7c77bfc08fcb9f14e3e2dab6b51ed369e9561))
- **deps:** bump svelte from 5.53.2 to 5.53.5 ([f15235b](https://github.com/MoldyTaint/Cinephage/commit/f15235b0c6b1da96fd51814c6287edba65cafc1c))
- **deps:** bump svelte group (@sveltejs/kit 2.55.0, svelte 5.53.12, svelte-check 4.4.5) ([ce8accc](https://github.com/MoldyTaint/Cinephage/commit/ce8accc929ed4a107bf836455da2e4f7471a803a))
- **deps:** bump tailwind group (@tailwindcss/vite 4.2.2, tailwindcss 4.2.2) ([209adc5](https://github.com/MoldyTaint/Cinephage/commit/209adc5eb67103991e4970a3cf162362867a7848))
- **deps:** bump the minor-and-patch group across 1 directory with 3 updates ([cbc946c](https://github.com/MoldyTaint/Cinephage/commit/cbc946cd4f86ed893dfcd8e22705d198c0ca2efd))
- **deps:** bump the minor-and-patch group with 16 updates ([6caaacc](https://github.com/MoldyTaint/Cinephage/commit/6caaacc8ffd3210c00eca886d6b779472fcb2a4e))
- **deps:** bump the minor-and-patch group with 6 updates ([dab5934](https://github.com/MoldyTaint/Cinephage/commit/dab5934a97e0b4134fdeaa26562eba9a237f42f2))
- **deps:** bump the minor-and-patch group with 6 updates ([#131](https://github.com/MoldyTaint/Cinephage/issues/131)) ([e49605f](https://github.com/MoldyTaint/Cinephage/commit/e49605febb0697c086f83c975507e5d98bdc034e))
- **deps:** bump the minor-and-patch group with 6 updates ([#176](https://github.com/MoldyTaint/Cinephage/issues/176)) ([84dbee4](https://github.com/MoldyTaint/Cinephage/commit/84dbee46279ceb5171c7deaff87ebb4c4d2cb6c8))
- **deps:** bump the minor-and-patch group with 8 updates ([#147](https://github.com/MoldyTaint/Cinephage/issues/147)) ([c434569](https://github.com/MoldyTaint/Cinephage/commit/c43456925e5d9bff3606318eed9c25f1d0196de2))
- **deps:** bump the svelte group with 3 updates ([#148](https://github.com/MoldyTaint/Cinephage/issues/148)) ([b60f327](https://github.com/MoldyTaint/Cinephage/commit/b60f32779bccb56bf10819ac111c10a9d5f78859))
- **deps:** bump the svelte group with 4 updates ([0f58c11](https://github.com/MoldyTaint/Cinephage/commit/0f58c1193a10c714a9c2a914b6d1b6fa3fefa5da))
- **deps:** bump the svelte group with 4 updates ([#177](https://github.com/MoldyTaint/Cinephage/issues/177)) ([023f181](https://github.com/MoldyTaint/Cinephage/commit/023f18199a47bab2c75b92e0732da73165ff328f))
- **deps:** bump the svelte group with 5 updates ([#132](https://github.com/MoldyTaint/Cinephage/issues/132)) ([0d08e81](https://github.com/MoldyTaint/Cinephage/commit/0d08e81ad523ada2d3c38a64577df919f2ca24f3))
- **deps:** bump the tailwind group with 2 updates ([9069b55](https://github.com/MoldyTaint/Cinephage/commit/9069b55125f4ffedb4b0a0697ed8135cc612f834))
- **deps:** bump the tailwind group with 2 updates ([#178](https://github.com/MoldyTaint/Cinephage/issues/178)) ([be84981](https://github.com/MoldyTaint/Cinephage/commit/be84981651553a60afc52d5fd670543b6af01673))
- **deps:** bump the tailwind group with 3 updates ([#149](https://github.com/MoldyTaint/Cinephage/issues/149)) ([0704209](https://github.com/MoldyTaint/Cinephage/commit/07042092ab661b894a518169b796ded1d07d0dcd))
- **deps:** bump typescript from 5.9.3 to 6.0.2 ([b983706](https://github.com/MoldyTaint/Cinephage/commit/b983706c2e3cddefb5f1a8b792acfd2113f2c634))
- **deps:** bump typescript from 5.9.3 to 6.0.3 ([a05396a](https://github.com/MoldyTaint/Cinephage/commit/a05396a683c70f3b581a565e9a96a02196c05140))
- **deps:** bump undici from 7.19.1 to 7.24.6 ([fa78ab9](https://github.com/MoldyTaint/Cinephage/commit/fa78ab9400388d6bb7d3e810ac8d7db748196b01))
- **deps:** bump vite from 7.3.1 to 8.0.3 ([9d10c90](https://github.com/MoldyTaint/Cinephage/commit/9d10c90bbaaf16e769980d96558aff8b9cd5f611))
- **deps:** update package.json versions to match merged PRs ([c77d488](https://github.com/MoldyTaint/Cinephage/commit/c77d48848f0577bf73b9dbbf2800b5b8a3e6b98f))
- **devcontainer:** align runtime, stabilize workspace mount and document optional qBittorrent/SABnzbd sidecars ([11190cc](https://github.com/MoldyTaint/Cinephage/commit/11190ccd49d2e5b225d007c101264c57a2826fb8))
- **devcontainer:** install required dependencies, auto-install Camoufox binaries and fix executable permissions ([b83748a](https://github.com/MoldyTaint/Cinephage/commit/b83748a998f0ce9e480b6561af49dcf6b7755b7c))
- formatting, uppercase codec labels, add rootFolderIds, export MediaExplorerTable ([f572536](https://github.com/MoldyTaint/Cinephage/commit/f572536a9aface091912c08be311fb29a815acc4))
- improve GitHub release note categorization ([86a67a7](https://github.com/MoldyTaint/Cinephage/commit/86a67a770105430cc5cd650359195e7f2850a41d))
- isolate live network tests behind LIVE_TESTS env flag ([38add03](https://github.com/MoldyTaint/Cinephage/commit/38add03bec1f44b4bdc87c2c13c19b667737a249))
- release v0.1.0 ([943f494](https://github.com/MoldyTaint/Cinephage/commit/943f4946c6e5d574dbf77d64be7ca9439d222c55))
- remove dead code and documentation ([90d095a](https://github.com/MoldyTaint/Cinephage/commit/90d095abc3a3a09510a74e65b842d3e84bdf28ea))
- remove dead test files (demo.spec.ts, page.svelte.spec.ts) ([e09c82b](https://github.com/MoldyTaint/Cinephage/commit/e09c82b5160a3bd1d4e4df43dc0d4a64139cae37))
- remove deprecated Cloudflare streaming fix and results documentation ([6587a3a](https://github.com/MoldyTaint/Cinephage/commit/6587a3a9b70548a5e22bfb5f3c10f731b4c46c73))
- remove documentation (moved to separate repo) ([f5b3c18](https://github.com/MoldyTaint/Cinephage/commit/f5b3c1837c3b781353102b6d73d25e71b6b038b6))
- remove obsolete troubleshooting scripts ([b2c939d](https://github.com/MoldyTaint/Cinephage/commit/b2c939dca3d2f66597c75f127c89c61f3a8b1898))
- remove release workflow ([c16331a](https://github.com/MoldyTaint/Cinephage/commit/c16331a0d7c57815c2c8a17d9486dbbead941834))
- rename main container channel from edge to main and decouple release provenance ([9e0a025](https://github.com/MoldyTaint/Cinephage/commit/9e0a025f7a8af1945118c8699571342b3d09426d))
- restore deleted documentation and npm command ([0aa4f16](https://github.com/MoldyTaint/Cinephage/commit/0aa4f16baabd60bc0953ce2cce7f9e629ec96fe8))
- **tests:** trigger CI ([50cc375](https://github.com/MoldyTaint/Cinephage/commit/50cc3758f2d601957044d6ab7a058df83a6f329d))
- update ignore files for i18n and test utilities ([341ebf7](https://github.com/MoldyTaint/Cinephage/commit/341ebf7cba5120d479a6359c5c8d915b54ea74aa))
- update package-lock.json after dependabot merges ([4afb235](https://github.com/MoldyTaint/Cinephage/commit/4afb23552436287465b5b86ed66c1d81e91083b1))

## 0.2.1 (2026-04-19)

### Features

- Use git-cliff for release changelog generation ([3f51526](https://github.com/MoldyTaint/Cinephage/commit/3f515266862513ac9fb141c96b6f3474bb27059b)) — by MoldyTaint

### Bug Fixes

- Fix Transmission seed ration and time settings not set correctly (#290) ([b74d35a](https://github.com/MoldyTaint/Cinephage/commit/b74d35a5f717c9c80004d3059b4a5f05a8470fe9)) — by Tamás Nagy
- Correct git-cliff template variable (timestamp not date) ([d7b06a4](https://github.com/MoldyTaint/Cinephage/commit/d7b06a401f2fe7c4ab9c0ca8683c14b2f1c70d06)) — by MoldyTaint

## 0.2.0 (2026-04-17)

### Features

- Extract MediaServerStatsSection component for unified status page ([cfedb36](https://github.com/MoldyTaint/Cinephage/commit/cfedb36107b8121a13b4e6464b7d125142594071)) — by MoldyTaint
- Add unified status page data loader ([ba9de25](https://github.com/MoldyTaint/Cinephage/commit/ba9de254ecce49d6497ad3d60481884863110e05)) — by MoldyTaint
- Create unified status page composing storage and media server sections ([1b9966b](https://github.com/MoldyTaint/Cinephage/commit/1b9966b593e896a596a19a1b42aa31d129cbaba0)) — by MoldyTaint
- Add unified summary cards and combined scan/sync status to status page ([e6dfcc6](https://github.com/MoldyTaint/Cinephage/commit/e6dfcc66835901e0726c7e1493018d7e559c2a94)) — by MoldyTaint
- Add isPlayed and playedPercentage to media explorer query ([32fd707](https://github.com/MoldyTaint/Cinephage/commit/32fd707f298775ab9793ba9297187b3421bc1849)) — by MoldyTaint
- Redesign playback column with isPlayed and playedPercentage indicators ([92bcd03](https://github.com/MoldyTaint/Cinephage/commit/92bcd033184ced48ab38a9dfd7c8761d9bcd5d37)) — by MoldyTaint
- Redesign media explorer filter bar with tiered chip layout ([9180108](https://github.com/MoldyTaint/Cinephage/commit/9180108efdaa772a91d8da497e1693997dd6b804)) — by MoldyTaint

### Bug Fixes

- Clamp playedPercentage to 100 to prevent progress bar overflow ([79f2b82](https://github.com/MoldyTaint/Cinephage/commit/79f2b824278a9432cf547467e3b3d63ad5dc47e0)) — by MoldyTaint
- Resolve lint errors (each keys, unused var, unused props) ([a87daa9](https://github.com/MoldyTaint/Cinephage/commit/a87daa9076db71c649a7fd5c4bc2a7a0af271a20)) — by MoldyTaint

### Refactoring

- Update general settings nav tabs to use unified Status page ([9bb6ff4](https://github.com/MoldyTaint/Cinephage/commit/9bb6ff460e47784aac860aab89d9b45f50ff7af1)) — by MoldyTaint
- Remove old maintenance and server-stats pages in favor of unified status page ([8ac7878](https://github.com/MoldyTaint/Cinephage/commit/8ac78788db0f333fd09e42b3294cec9bdf9b7882)) — by MoldyTaint
- Strip overview sections from storage and media server components ([6faea29](https://github.com/MoldyTaint/Cinephage/commit/6faea291c1e29f9728530119d0c751965549f052)) — by MoldyTaint
- Remove redundant overview cards and charts from unified status page ([e619c26](https://github.com/MoldyTaint/Cinephage/commit/e619c26ff0fb229b99fb0a0da0c804946c7a3ac4)) — by MoldyTaint

### Styling

- Format media explorer changes ([5ce0188](https://github.com/MoldyTaint/Cinephage/commit/5ce0188ea52f908924c0e269a0cc476b107f8545)) — by MoldyTaint

### Miscellaneous

- Formatting, uppercase codec labels, add rootFolderIds, export MediaExplorerTable ([f572536](https://github.com/MoldyTaint/Cinephage/commit/f572536a9aface091912c08be311fb29a815acc4)) — by MoldyTaint

## 0.1.2 (2026-04-16)

### Bug Fixes

- Unify scoring profiles into single DB source, fix profile-not-found on add-to-library ([1c1aa87](https://github.com/MoldyTaint/Cinephage/commit/1c1aa8787606fb6f4bcdbcb1f4f5e55b68a92392)) — by MoldyTaint
- Gate cloudflare streaming live test behind LIVE_TESTS env var ([cb41d4b](https://github.com/MoldyTaint/Cinephage/commit/cb41d4ba52955381bbc2557060dcb03b3c6fd5a9)) — by MoldyTaint

## 0.1.1 (2026-04-15)

### Features

- Add auto-fill version/commit from GitHub releases to streaming indexer ([4cb831b](https://github.com/MoldyTaint/Cinephage/commit/4cb831b4834cde37c4fb7a036f54c821fdec0213)) — by MoldyTaint

## 0.1.0 (2026-04-15)

### Features

- Add dynamic capability discovery for Newznab/Torznab ([ae4671c](https://github.com/MoldyTaint/Cinephage/commit/ae4671c2309e843d7911de4e7dc7a0ba4b137b58)) — by root
- Add multi-source tracking for deduplicated releases ([480f0d1](https://github.com/MoldyTaint/Cinephage/commit/480f0d19095000cb33ff3d4cd7d385b1076ff75a)) — by root
- Add external ID extraction for improved media matching ([bf9ac3b](https://github.com/MoldyTaint/Cinephage/commit/bf9ac3b311a466533647fdac61a8c8faa5e6bea7)) — by root
- Add BitSearch public torrent indexer ([ebbd2a6](https://github.com/MoldyTaint/Cinephage/commit/ebbd2a6f8bdcdbd93334c81bcd7834f48009203b)) — by root
- Add OldToons.World private tracker support ([02d1473](https://github.com/MoldyTaint/Cinephage/commit/02d14733c0e87629601111f15bc183d0bac76ef3)) — by root
- Add SceneTime private tracker with BrowserSolver ([46a3637](https://github.com/MoldyTaint/Cinephage/commit/46a36374fc8e09b465f238b01b5f614a605395bf)) — by root
- Add embedded subtitle support and monitoring tasks ([a60fba2](https://github.com/MoldyTaint/Cinephage/commit/a60fba2ee576d4747da1a2319528f02ce1d7eedb)) — by root
- Add person detail pages with filmography ([4269cba](https://github.com/MoldyTaint/Cinephage/commit/4269cbab1825aed6b253e7199eeef638681088df)) — by root
- Unified task management with activity tracking ([9524387](https://github.com/MoldyTaint/Cinephage/commit/95243872091bfee7b72fc231eac11385fefdc59c)) — by root
- Add naming system, enhanced settings, and import improvements ([67b324e](https://github.com/MoldyTaint/Cinephage/commit/67b324e69257f08e12e91c10459065631a308223)) — by root
- Add Cinephage logo to app and README ([6cde8ba](https://github.com/MoldyTaint/Cinephage/commit/6cde8bae29bc2ada2fa75c27785ec3b6a2d8885b)) — by root
- Comprehensive Docker configuration overhaul ([3a6a1e9](https://github.com/MoldyTaint/Cinephage/commit/3a6a1e91af453d08c9f00f09e2234550e2451c0f)) — by root
- Implement PUID/PGID for proper permission handling ([f1d03ea](https://github.com/MoldyTaint/Cinephage/commit/f1d03ea973ab9bd60acaa354100e030aa4739f2f)) — by root
- Add movie collection bulk-add support ([2464398](https://github.com/MoldyTaint/Cinephage/commit/2464398703783861fbad5ea454a927bfabc07090)) — by root
- Add smart lists with TMDB discover integration ([9e13f0e](https://github.com/MoldyTaint/Cinephage/commit/9e13f0e4b7801b882df4242a69ee3490da33b50c)) — by root
- Enhance smart lists and fix discover TV filter ([fbc53e1](https://github.com/MoldyTaint/Cinephage/commit/fbc53e1ab6ec0eee7f4a6dc6dd67fd0b3078025a)) — by root
- Add media naming system with embedded schema sync ([083f44c](https://github.com/MoldyTaint/Cinephage/commit/083f44ce27abb6bc4a76a78b320d0e3c0d0b0c74)) — by root
- Add read-only root folder support for NZBDav integration ([f5d2edf](https://github.com/MoldyTaint/Cinephage/commit/f5d2edfd579f7a9da0bd204f11f1859cfa7a18ac)) — by root
- Add task cancellation system with TaskExecutionContext ([c4670b4](https://github.com/MoldyTaint/Cinephage/commit/c4670b4eb2ffa280cb4f018835abcddf7d174614)) — by root
- Add language-aware stream source fallback ([4069e5c](https://github.com/MoldyTaint/Cinephage/commit/4069e5c092b68ff36bb97b01c8c45e0b27c02d45)) — by root
- Add GitHub Actions workflows ([8fee398](https://github.com/MoldyTaint/Cinephage/commit/8fee398e0567be7edc8d68ddce61c9c581006e53)) — by root
- Implement rootless Docker and add CI verification ([14cf8d5](https://github.com/MoldyTaint/Cinephage/commit/14cf8d5dbdb96f53a6bcc1fd771399cf69311dfc)) — by root
- Add read-only folder support for virtual mounts ([60855a3](https://github.com/MoldyTaint/Cinephage/commit/60855a32e9f10906eeece92c114e315e9bd0562f)) — by root
- Add subtitle support with SRT-to-VTT conversion ([b02df9d](https://github.com/MoldyTaint/Cinephage/commit/b02df9d70aadba45efacbd99e0fdeca34124f666)) — by root
- Add unified resolve service with persistent cache and prefetch ([043b7b6](https://github.com/MoldyTaint/Cinephage/commit/043b7b6dcc370eb6ae1ed0207d154c6631b4d85f)) — by root
- Improve folder scanning and streaming URL configuration ([bfec5e6](https://github.com/MoldyTaint/Cinephage/commit/bfec5e614440b22edda2045317f932924f5dcab4)) — by root
- Add bulk editing for movies and TV shows ([34fd391](https://github.com/MoldyTaint/Cinephage/commit/34fd391dc0d6f15dff1308a481faa50aa661b9af)) — by root
- Add native NZB/NNTP streaming support ([9c900e0](https://github.com/MoldyTaint/Cinephage/commit/9c900e09f800c0f8f9722f5017cbb793198c9013)) — by root
- Add NZB streaming with extraction support ([eb3f80e](https://github.com/MoldyTaint/Cinephage/commit/eb3f80efe14a46bc7e49d04aceac358029647092)) — by root
- Add bulk operations and streaming to library pages ([ebf95f2](https://github.com/MoldyTaint/Cinephage/commit/ebf95f2507e4f30cde5e6d403a3a5cbd21981201)) — by root
- Add Live TV navigation and streaming settings ([c788f50](https://github.com/MoldyTaint/Cinephage/commit/c788f5090ffab637b729f41757b26df40cd8fc51)) — by root
- Add initial Live TV implementation [WIP] ([4fcedc2](https://github.com/MoldyTaint/Cinephage/commit/4fcedc20e486ac825eacbd15ed6d906a08c5f4e9)) — by root
- Sabnzbd rewrite, live tv streaming, and queue improvements ([1dfdad8](https://github.com/MoldyTaint/Cinephage/commit/1dfdad88e44bb8044cb77c4242faf1c921f48a1d)) — by root
- Complete architecture refactor with streaming and media browser support ([61b5660](https://github.com/MoldyTaint/Cinephage/commit/61b5660b7dbd5023741f564d8a32dba828c84688)) — by root
- Add portal scanner for discovering Stalker accounts ([2b6f78a](https://github.com/MoldyTaint/Cinephage/commit/2b6f78ad124090ec6cf73c63e247ddbc213064bd)) — by root
- Add EPG status tracking and UI improvements ([f9d97a6](https://github.com/MoldyTaint/Cinephage/commit/f9d97a686d805fb1dfe1693ee4e050e4105d9191)) — by root
- Add EPG management page with status, coverage, and guide views ([3679759](https://github.com/MoldyTaint/Cinephage/commit/36797593e75fed7db820acbdea826abcb4cc67b6)) — by root
- Add optional URL base support for client endpoints (#55) ([dad0a8b](https://github.com/MoldyTaint/Cinephage/commit/dad0a8bb4f7a9ab84cb1a272dfe28031f77b2054)) — by Kenneth Iwuchukwu
- Add URL base support for download clients and update related components. ([04fe974](https://github.com/MoldyTaint/Cinephage/commit/04fe974d90864f5b3e19945c31b77ff020b56d92)) — by Keonramses
- Add NZB-Mount client with STRM/Symlink import support. ([a3ad50c](https://github.com/MoldyTaint/Cinephage/commit/a3ad50cdb8e367b6c2a0ce22746a3a5b8c4a41e3)) — by Keonramses
- Enhance ImportService tests with detailed type definitions for findImportableFiles ([3ca7d7c](https://github.com/MoldyTaint/Cinephage/commit/3ca7d7cc567766aa0add4ce183426afee81a48bb)) — by Keonramses
- Add file scoring system and fix queue system bugs ([a2234b6](https://github.com/MoldyTaint/Cinephage/commit/a2234b602bff96bad3ff7f77ec44cf0d49f6531e)) — by root
- Add stream URL type detection for proper resolution method ([1fa849f](https://github.com/MoldyTaint/Cinephage/commit/1fa849f3af1e912f5792bc317969865c9032414b)) — by root
- Add multi-title search with TMDB alternate titles ([4d7004c](https://github.com/MoldyTaint/Cinephage/commit/4d7004c87e182560d72c73b3f65ca0e22c537792)) — by root
- Add dead torrent rejection and usenet post-processing status ([4e456d1](https://github.com/MoldyTaint/Cinephage/commit/4e456d16ae0da81c22f3f654f46920b5745de018)) — by root
- Add unified activity system and usenet pre-flight checks ([46a5f02](https://github.com/MoldyTaint/Cinephage/commit/46a5f02d616b7f5b1e9cc6ad99c445ade04b580c)) — by root
- Add Camoufox-based captcha solver for Cloudflare bypass ([0343509](https://github.com/MoldyTaint/Cinephage/commit/034350942d12885a63bfd2fd50c860c17c784362)) — by MoldyTaint
- Add captcha bypass endpoint and toggle ([e33cc75](https://github.com/MoldyTaint/Cinephage/commit/e33cc7508e9668427262687c87a10c8335fcc213)) — by MoldyTaint
- Add import transfer modes with seeding-imported status ([ac9ac5d](https://github.com/MoldyTaint/Cinephage/commit/ac9ac5ded6296f0d80984fbcefdfa37d628673ae)) — by MoldyTaint
- Add HDR normalization and enhanced audio parsing ([1660eda](https://github.com/MoldyTaint/Cinephage/commit/1660eda761aa84205e9c1a86d43b9ee6f991f43b)) — by MoldyTaint
- Add banned BR-DISK and raw disc custom formats ([0eb600f](https://github.com/MoldyTaint/Cinephage/commit/0eb600f8f6ee4c5bdc986b9d9e5e21d30dab567e)) — by MoldyTaint
- Add fetch statistics to captcha solver UI ([b1dec3b](https://github.com/MoldyTaint/Cinephage/commit/b1dec3b418ec2bf360dea42ef52840793f29d471)) — by MoldyTaint
- Add fetch statistics tracking to captcha solver ([882f48c](https://github.com/MoldyTaint/Cinephage/commit/882f48c76885385a8bdaee187d4c0aa306412167)) — by MoldyTaint
- Add canMoveFiles and canBeRemoved to download clients ([cf735ab](https://github.com/MoldyTaint/Cinephage/commit/cf735abfd63c27b0b130fe42e0fae5b6273e6079)) — by MoldyTaint
- Add dangerous file extensions and seeding-imported badge ([e79cb30](https://github.com/MoldyTaint/Cinephage/commit/e79cb3017c49be9f79609798f2f58604f1e45dd8)) — by MoldyTaint
- Implement Radarr-style deduplication and debug tools ([6eecbea](https://github.com/MoldyTaint/Cinephage/commit/6eecbea34d0178054b5b276cee5b853b653a18d2)) — by MoldyTaint
- Bazarr-style architecture with dynamic provider system ([36f271b](https://github.com/MoldyTaint/Cinephage/commit/36f271b7488cec864e1454a8959a873806e690a8)) — by MoldyTaint
- Add 'Remove from Library' option to fully delete movies/series ([e00a08a](https://github.com/MoldyTaint/Cinephage/commit/e00a08a4704ab78979757c20ed9593984b518a5f)) — by MoldyTaint
- Add dev branch support, optimize Docker builds, and enhance mobile UI (#80) ([b7dc0af](https://github.com/MoldyTaint/Cinephage/commit/b7dc0af64e9895242530e0ae60044a79af4d42ef)) — by Kenneth Iwuchukwu
- Add release workflow and enhance Docker build configuration ([4c8df7d](https://github.com/MoldyTaint/Cinephage/commit/4c8df7d547bcb90bb0f26f723800fda7680b8c0b)) — by Keonramses
- Add script to fix TV subtitle paths and enhance subtitle download service ([1610770](https://github.com/MoldyTaint/Cinephage/commit/1610770275e1bd9f33f4fa681e6e1a87b4a4a852)) — by Keonramses
- Add script to fix TV subtitle paths and update npm command ([452d00c](https://github.com/MoldyTaint/Cinephage/commit/452d00c253434383443eaaae8f7d3974a1294a6f)) — by Keonramses
- Standardize library/discover paths and add legacy redirects and fix activity links ([46cb750](https://github.com/MoldyTaint/Cinephage/commit/46cb750c5af2f5422b8d72d4771d9921ffc9665e)) — by Keonramses
- Enhance subtitle handling, monitoring features and library reactivity ([40f2ec2](https://github.com/MoldyTaint/Cinephage/commit/40f2ec2f0f77b9872f625493603489ea7be5b2f5)) — by Keonramses
- Initialize subtitle provider registry during service startup ([ea9cdaa](https://github.com/MoldyTaint/Cinephage/commit/ea9cdaa6ae0ad3a3407e2685efd0e786478240ee)) — by Keonramses
- Sortable queue/history table headers and queue bulk remove ([8f11309](https://github.com/MoldyTaint/Cinephage/commit/8f11309f411c54c8a2836ff4a792dccda59d3fdd)) — by MoldyTaint
- Add clear failed downloads functionality and update UI components (#88) ([f524ca5](https://github.com/MoldyTaint/Cinephage/commit/f524ca5265f9f1f2717e0ae323249059f107d8dc)) — by Kenneth Iwuchukwu
- Add NixOS flake support ([35fadac](https://github.com/MoldyTaint/Cinephage/commit/35fadacad26cb02ce4f1bcd0611e106edfbb3967)) — by MoldyTaint
- Add external list import support with StevenLu presets ([2bc8ede](https://github.com/MoldyTaint/Cinephage/commit/2bc8ede55d9bd456c6fef989b04ec39e14862744)) — by MoldyTaint
- Add IMDb and TMDB list providers with concurrent resolution ([4572b5c](https://github.com/MoldyTaint/Cinephage/commit/4572b5c824848923ced1e58c136162f0ea3051bb)) — by MoldyTaint
- Move app state under /config with auto-migration ([8bef7aa](https://github.com/MoldyTaint/Cinephage/commit/8bef7aada1914140a13f55ee18628e7a17813095)) — by Keonramses
- Complete indexer backend overhaul and fixes ([d0d6e52](https://github.com/MoldyTaint/Cinephage/commit/d0d6e52996fd9cab0169e7ededcbcabdd27186e2)) — by MoldyTaint
- Add LimeTorrents public indexer ([6ee6983](https://github.com/MoldyTaint/Cinephage/commit/6ee69832b080790dfe1a5d56ac49ab8b39b888f1)) — by MoldyTaint
- Add Prowlarr indexer definitions and improve compatibility ([5d9ad83](https://github.com/MoldyTaint/Cinephage/commit/5d9ad83e54ea5969aa785512da11cf4ab2dc4435)) — by MoldyTaint
- Add info_hash tracking for duplicate torrent detection ([70eb28c](https://github.com/MoldyTaint/Cinephage/commit/70eb28ce139d063984ee24d25c6d80f973f709aa)) — by MoldyTaint
- Improve indexer config handling and download resolution ([3a3b171](https://github.com/MoldyTaint/Cinephage/commit/3a3b171a905511ed9c21512c9c96048bf5017fa8)) — by MoldyTaint
- Improve quality scoring and remove hard cutoffs ([d8101c4](https://github.com/MoldyTaint/Cinephage/commit/d8101c4817a2023b5624c1923efcf354bf445bac)) — by MoldyTaint
- Add encoding support for non-UTF-8 indexers and RuTracker integration ([3e22c77](https://github.com/MoldyTaint/Cinephage/commit/3e22c7711312cbec4fb52a12cac590343600a9cb)) — by MoldyTaint
- Overhaul Activity page with unified feed and enhanced filters ([93d4a7a](https://github.com/MoldyTaint/Cinephage/commit/93d4a7a459565431c028c1deb65a23211f8c24f7)) — by MoldyTaint
- Add filter to show/hide 'No Results' activities ([6778052](https://github.com/MoldyTaint/Cinephage/commit/67780522a19103b8afec50d6ca34ca7f280d1b9e)) — by MoldyTaint
- Enhance movie and series API with root folder media type ([98b2395](https://github.com/MoldyTaint/Cinephage/commit/98b2395323d49a7e79c37b2b5ebc04eb23155a2c)) — by Keonramses
- Improve streamer profile UI and add accessibility enhancements (#111) ([740bf37](https://github.com/MoldyTaint/Cinephage/commit/740bf378b036020022e26bbb078a4359d73652ac)) — by Kenneth Iwuchukwu
- Enhance profile and episode size limit handling, improve UI responsiveness. ([563b883](https://github.com/MoldyTaint/Cinephage/commit/563b88363b5a21167e48fb6d90747281db59006f)) — by Keonramses
- Enhance profile size limits with validation and improve mobile responsiveness (#113) ([b01b59a](https://github.com/MoldyTaint/Cinephage/commit/b01b59af7868cf2a3fb36813dc58ac4634d558b1)) — by Kenneth Iwuchukwu
- Overhaul tasks page with table UI and customizable intervals ([b09389d](https://github.com/MoldyTaint/Cinephage/commit/b09389d23e00f33d17669fe594d5af312505a301)) — by MoldyTaint
- Add SSE streaming endpoint for real-time task updates ([ac36817](https://github.com/MoldyTaint/Cinephage/commit/ac36817af84ed373f153fcfb4ac9f9ba36e4943b)) — by MoldyTaint
- Emit SSE events from task API endpoints ([ee326c1](https://github.com/MoldyTaint/Cinephage/commit/ee326c155dd3add5b54f5c4e8b9b1379616d115a)) — by MoldyTaint
- Overhaul tasks page with table UI and customizable intervals ([91a0e1e](https://github.com/MoldyTaint/Cinephage/commit/91a0e1e7cf778880f2bab774cbad8acca2f6e6cf)) — by MoldyTaint
- Implement modular SSE system and refactor Activity page ([453be8e](https://github.com/MoldyTaint/Cinephage/commit/453be8e429d15ab5152ae13849f426548f05dfaf)) — by MoldyTaint
- Add SSE stream to home page dashboard ([2076759](https://github.com/MoldyTaint/Cinephage/commit/2076759434e71efecc75f19d57ab7527657eaf7b)) — by MoldyTaint
- Add real-time SSE streaming to library detail pages ([3431ae1](https://github.com/MoldyTaint/Cinephage/commit/3431ae162b83b19045f20f855a56f3411bfcb437)) — by MoldyTaint
- Implement upsert functionality for episode files to avoid duplicates ([b4572ef](https://github.com/MoldyTaint/Cinephage/commit/b4572ef42d6daf3576069b12f792a9bef8343df4)) — by Keonramses
- Add 'hide items already in library' filter to discover page ([9e97596](https://github.com/MoldyTaint/Cinephage/commit/9e975966403b7e6c7d8d73db0ba5e9eaea663a10)) — by MoldyTaint
- Refactor state management in movie and TV series pages to use derived states and dynamic SSE ([9fe1611](https://github.com/MoldyTaint/Cinephage/commit/9fe16119dd26c702c80b2d623d9d7ee6316b29b6)) — by Keonramses
- Restore library root-folder assignment UI after unmatched refactor ([b4de540](https://github.com/MoldyTaint/Cinephage/commit/b4de540fe3265549a112a97a5c76cba7de84bed9)) — by Keonramses
- Restore root-folder assignment UI for library items (#127) ([1b70daa](https://github.com/MoldyTaint/Cinephage/commit/1b70daa021d7443d137b78869a80da517915ea10)) — by Kenneth Iwuchukwu
- Enhance movie availability tracking and UI updates ([f2b0cce](https://github.com/MoldyTaint/Cinephage/commit/f2b0cceeb6bea15e2db7ed62471308e22944cbc2)) — by Keonramses
- Enhance movie availability tracking and UI updates (#129) ([15d2e7f](https://github.com/MoldyTaint/Cinephage/commit/15d2e7fc12badf838d48e9a6bb347cfc56c62512)) — by Kenneth Iwuchukwu
- Add paused status to activity and download queue ([1b9473e](https://github.com/MoldyTaint/Cinephage/commit/1b9473ef5f4cbba812767af6c9d56a87f9ca8229)) — by Keonramses
- Add paused status to activity and download queue (#130) ([038a18c](https://github.com/MoldyTaint/Cinephage/commit/038a18cc5949e19b23b038769a5fc43ddb974c2c)) — by Kenneth Iwuchukwu
- Add nCore.pro indexer support ([f51e220](https://github.com/MoldyTaint/Cinephage/commit/f51e22020887ed47f672c1611d07252ff02903a7)) — by MoldyTaint
- Add optional 2FA support for ncore.pro ([9ad1224](https://github.com/MoldyTaint/Cinephage/commit/9ad12248150073b38ad1df8cfe0772b1190a284f)) — by MoldyTaint
- Improve indexer download system with downloadVariables support and torrent caching ([1fb8d1d](https://github.com/MoldyTaint/Cinephage/commit/1fb8d1d10ae505c7785ec344e966c03afa9ec45a)) — by MoldyTaint
- Persist indexer session cookies to database for ncore.pro 2FA support ([9591ec6](https://github.com/MoldyTaint/Cinephage/commit/9591ec6c45a3a32eb4d24a47f12cd497a665132c)) — by MoldyTaint
- Include symlinked video files in import candidates and update documentation for Rclone mounts ([456ab34](https://github.com/MoldyTaint/Cinephage/commit/456ab34c0cb3c120dac76b011fbf5a3115196ead)) — by Keonramses
- Enhance EPG fetching and account management ([4ded8de](https://github.com/MoldyTaint/Cinephage/commit/4ded8ded7dcfb1a6132ca98ac2726e6d094419d0)) — by Keonramses
- Improve integration health tracking, error handling, and add bulk operations across multiple integration pages ([1d3e097](https://github.com/MoldyTaint/Cinephage/commit/1d3e09716cc2083caec986e8ce837156ed429745)) — by Keonramses
- Enhance EPG fetching and IPTV account management (#133) ([13f46da](https://github.com/MoldyTaint/Cinephage/commit/13f46da0d8f6409321b4fba8daac20bf7dd8160b)) — by Kenneth Iwuchukwu
- Improve integration health tracking, error handling, and add bulk operations across multiple integration pages (#134) ([9460690](https://github.com/MoldyTaint/Cinephage/commit/94606907ccba84ce3e2ca573d2d371fe3df57109)) — by Kenneth Iwuchukwu
- Add parent folder renaming to media file rename system ([a972e11](https://github.com/MoldyTaint/Cinephage/commit/a972e11a8c88145a8b97aa55145fdee724369e80)) — by MoldyTaint
- Add list view with auto/manual grab for movies and tv shows ([9e2916e](https://github.com/MoldyTaint/Cinephage/commit/9e2916e0d3e086e33c64b006a1bfb7208a7661d6)) — by MoldyTaint
- Unify MediaType types, enhance bulk/delete flows, and polish library UI across Movies and TV (#145) ([2332bdb](https://github.com/MoldyTaint/Cinephage/commit/2332bdbf664a169a1140f93fc0a32b96c5667ab2)) — by Kenneth Iwuchukwu
- Replace unreliable blocked/status flags with actual stream verification in account tests ([923676e](https://github.com/MoldyTaint/Cinephage/commit/923676e3d0d36833836415a976aa09cef6ade37e)) — by MoldyTaint
- Add support for Torznab protocol and enhance capabilities validation (#153) ([9c576a9](https://github.com/MoldyTaint/Cinephage/commit/9c576a922f85c5c4c379f0905ceb68319ccbcf3d)) — by Kenneth Iwuchukwu
- Update base image to node:24-trixie-slim and enhance Dockerfile for production (#157) ([4118437](https://github.com/MoldyTaint/Cinephage/commit/411843776833465d05cefba4b7f8cc63eae68c26)) — by Kenneth Iwuchukwu
- Enhance UI for mobile devices (#158) ([7ef4639](https://github.com/MoldyTaint/Cinephage/commit/7ef463947a307a2ce0b13e8740201d2f1c2a7d4e)) — by Kenneth Iwuchukwu
- Add rTorrent (XML-RPC) and Transmission (RPC API) download client implementations (#159) ([34661d2](https://github.com/MoldyTaint/Cinephage/commit/34661d2dba039ef0aafe9ebf87475d97450e657e)) — by Kenneth Iwuchukwu
- Add rTorrent (XML-RPC) and Transmission (RPC API) download client implementations ([59299ae](https://github.com/MoldyTaint/Cinephage/commit/59299ae0a3618c761fefc1ff4203e96cd2b1ffa6)) — by Keonramses
- Introduce import wizard with API and error handling refactor ([545a67e](https://github.com/MoldyTaint/Cinephage/commit/545a67eeb9794db75361bf03e623496383976c54)) — by Keonramses
- Enhance root folder validation with overlap checks and error handling ([5efa0d1](https://github.com/MoldyTaint/Cinephage/commit/5efa0d108ca40a5c57e0f9e8e1fb44c0efc24092)) — by Keonramses
- Add downloads to allowlist, path-guard tests for symlink handling and realpath resolution ([66b4c48](https://github.com/MoldyTaint/Cinephage/commit/66b4c481dffcb9669021d96fcf19daf9cb46a5fb)) — by Keonramses
- Add GHCR retag latest workflow and enhance release tagging logicic (#184) ([03750c6](https://github.com/MoldyTaint/Cinephage/commit/03750c6630f7d72a60f3edc4ba3a197b2a39a861)) — by Kenneth Iwuchukwu
- Major development branch with auth, SSE, search, and system improvements ([1a1ba30](https://github.com/MoldyTaint/Cinephage/commit/1a1ba309dcfa6e6745ff1fcade268e2b781791f4)) — by MoldyTaint
- Add database path configuration via environment variables ([c446896](https://github.com/MoldyTaint/Cinephage/commit/c446896f8f574ab377ccf77f138c6a62c4af7099)) — by MoldyTaint
- Add private IP exemption for rate limiting ([7bbf26a](https://github.com/MoldyTaint/Cinephage/commit/7bbf26a79afed6e6dbd8d6c54bb611710724551f)) — by MoldyTaint
- Add graceful shutdown handler for background services ([1af8c14](https://github.com/MoldyTaint/Cinephage/commit/1af8c1468540d2813add3a564b5f762b6fbb388e)) — by MoldyTaint
- Implement RBAC authentication system ([8c57c3f](https://github.com/MoldyTaint/Cinephage/commit/8c57c3fbd4110b67007773a35556e378e08b8b51)) — by MoldyTaint
- Add role column to users table ([5f602c9](https://github.com/MoldyTaint/Cinephage/commit/5f602c9a562e9437844dc1d8c182a9f3196f8321)) — by MoldyTaint
- Enforce admin authorization on API endpoints ([5a58783](https://github.com/MoldyTaint/Cinephage/commit/5a587838878a46a4645ac3850f5f4ea1cefb5d43)) — by MoldyTaint
- Implement admin password reset functionality and update documentation ([fd230db](https://github.com/MoldyTaint/Cinephage/commit/fd230db26636be9e9d230a985724d1f029eb3415)) — by Keonramses
- Improve ActivityService and TMDB error handling ([cc6498e](https://github.com/MoldyTaint/Cinephage/commit/cc6498e2c132fd36c05a1afbb2cfe348d2a875c7)) — by MoldyTaint
- Enhance library pages with better data handling ([328e113](https://github.com/MoldyTaint/Cinephage/commit/328e113a251628ef689bebcd771b2f363d75533e)) — by MoldyTaint
- Add missing settings API endpoints ([c1b7a96](https://github.com/MoldyTaint/Cinephage/commit/c1b7a96d9fad3e4ab815234d871f2091f7e007c0)) — by MoldyTaint
- Route resolution through Cinephage backend ([bd25039](https://github.com/MoldyTaint/Cinephage/commit/bd25039d199394aedffeb9d3507980d11ed62e20)) — by MoldyTaint
- Enhance version bump logic for dev branch and add parsing for stable tags ([63ddd5c](https://github.com/MoldyTaint/Cinephage/commit/63ddd5c468f11ab4c4a5db0976fd52fb1d1a4c7b)) — by Keonramses
- Add GHCR retag latest workflow and enhance release tagging logic ([db29bba](https://github.com/MoldyTaint/Cinephage/commit/db29bbaaea54401e865917576bd3b47889502039)) — by Keonramses
- Implement activity history management and SSE events ([dbdd7a2](https://github.com/MoldyTaint/Cinephage/commit/dbdd7a2515334baf0d95ab1f44a6a15dcdb6e4f7)) — by Keonramses
- Integrate logo picker and improve streaming auth ([137db96](https://github.com/MoldyTaint/Cinephage/commit/137db96769508c5b9f0d398c386f328d46c464f4)) — by MoldyTaint
- Enhance error handling and indexer availability checks in search functionality ([ecda835](https://github.com/MoldyTaint/Cinephage/commit/ecda8356ff87cfbe590aefdb47f74f777a523079)) — by Keonramses
- Add Live TV channel name cleanup workflow and HLS playlist fixes ([893c83b](https://github.com/MoldyTaint/Cinephage/commit/893c83bb00644622624ca3d01d7b06970e992b7f)) — by MoldyTaint
- Improve EPG source resolution and provider sync cleanup ([ae77bcb](https://github.com/MoldyTaint/Cinephage/commit/ae77bcb17317d160748d6af0f5029d85f715d787)) — by MoldyTaint
- Expand release metadata for rename previews ([5dc957b](https://github.com/MoldyTaint/Cinephage/commit/5dc957bd74ea4c94d883a4ffd819c5f57a831956)) — by MoldyTaint
- Add activity stats endpoint and enhance activity retrieval with scope filtering ([ef1df74](https://github.com/MoldyTaint/Cinephage/commit/ef1df749f4052f9d01e6d7120fbbb7e4797c7273)) — by Keonramses
- Enhance JSON response formatting in health and system status endpoints ([af91a14](https://github.com/MoldyTaint/Cinephage/commit/af91a14f6f59eeda59b569b69c7e8434d15cdefc)) — by Keonramses
- Unify app version resolution and make streaming API key rate limits configurable via env ([7d4847d](https://github.com/MoldyTaint/Cinephage/commit/7d4847d0f55fbc74ea16cefbdd7f38fee770d3ea)) — by Keonramses
- Streamline activity page loading ([683476e](https://github.com/MoldyTaint/Cinephage/commit/683476e5e020da0f0eb886acb96407509347da6f)) — by MoldyTaint
- Implement new health and readiness endpoints, enhance docker ownership handling, improve startup configuration and update documentation ([2cefd80](https://github.com/MoldyTaint/Cinephage/commit/2cefd80e1e515fda56b5d8f878cbad1b15fecae9)) — by Keonramses
- Refactor environment variable retrieval for better compatibility ([e77291d](https://github.com/MoldyTaint/Cinephage/commit/e77291d27044d87d30e15dc550dcf8388ba78a28)) — by Keonramses
- Add EPG sync state tracking and robust M3U EPG parsing ([2637bf5](https://github.com/MoldyTaint/Cinephage/commit/2637bf57ecb33c8e189b49c6ef4b04790f8e987d)) — by Keonramses
- Add native subtitle sync engine with cleanup ([f7a8dc9](https://github.com/MoldyTaint/Cinephage/commit/f7a8dc90d4446c986a8297f3ba7fd2eafb192237)) — by MoldyTaint
- Overhaul TV show subtitle management UX ([30cfd9c](https://github.com/MoldyTaint/Cinephage/commit/30cfd9c61a39af14b98ba82d526aa0d2c59e0230)) — by MoldyTaint
- Add xstream URL normalization and player API URL builder ([5f3bbf2](https://github.com/MoldyTaint/Cinephage/commit/5f3bbf2dadd63db1538e24d1f6ed96aa82c6b486)) — by Keonramses
- Add selectable history and active queue IDs for bulk actions ([63df41e](https://github.com/MoldyTaint/Cinephage/commit/63df41e84e0c21196930845b979670ddbb1f470c)) — by Keonramses
- Implement download queue tombstones for local removal suppression ([9d4a86a](https://github.com/MoldyTaint/Cinephage/commit/9d4a86a5773de3b6bc429e9bd9a9adbbfa4c2dc5)) — by Keonramses
- Support .strm subtitle sync with friendly errors and streamer-profile guard ([2f74f9f](https://github.com/MoldyTaint/Cinephage/commit/2f74f9f4e4a528a1358c9ea6dd8621dc9a6c7323)) — by Keonramses
- Add search_error status, activity source tracking, and fix import failure detection ([36b4474](https://github.com/MoldyTaint/Cinephage/commit/36b4474b735b0f053ee4571bba98f16e46572860)) — by MoldyTaint
- Require BETTER_AUTH_SECRET env var and remove auto-generation ([7ed0db7](https://github.com/MoldyTaint/Cinephage/commit/7ed0db733d7c22888e639dab044e0c00a0c573a5)) — by MoldyTaint
- Add adaptive subtitle searching with backoff after 21 days ([b7416a5](https://github.com/MoldyTaint/Cinephage/commit/b7416a5ff3cdbdbcc0da8f7e3e824da82c55ca3b)) — by MoldyTaint
- Add history cleanup task, streaming key pre-check, and provider availability guards ([04bae6c](https://github.com/MoldyTaint/Cinephage/commit/04bae6c481c3437f1f131d9f0b0917bc0973106d)) — by MoldyTaint
- Add plex media server integration ([bbc8f89](https://github.com/MoldyTaint/Cinephage/commit/bbc8f894cf702d472489546fe1ce8d18151331d9)) — by Lautaro Busto
- Improve multi-pack detection and multi-pack search UX for tracker-style TV releases ([969b7e3](https://github.com/MoldyTaint/Cinephage/commit/969b7e308e652cb999f6a1715ad54aafa64937fd)) — by Keonramses
- Enhance RuTracker search functionality and episode handling ([ce7ea35](https://github.com/MoldyTaint/Cinephage/commit/ce7ea355e6f1ce37f495b52b419dd9b126474688)) — by Keonramses
- Implement auto search strategy for RuTracker and enhance episode handling ([31489f9](https://github.com/MoldyTaint/Cinephage/commit/31489f9c8bfa09313b0355e149712eddd7b1d4b2)) — by Keonramses
- Add Kinozal indexer support ([2760f66](https://github.com/MoldyTaint/Cinephage/commit/2760f6697c308c371a3282db3e479c3e555cfb8f)) — by MoldyTaint
- Improve modal layout and add automatic language detection ([fa0d8a2](https://github.com/MoldyTaint/Cinephage/commit/fa0d8a2d05ad2ea3a862d808d949330747cffab8)) — by MoldyTaint
- Add i18n infrastructure with Paraglide JS v2 ([ff14bb7](https://github.com/MoldyTaint/Cinephage/commit/ff14bb72d6437aadf75971e5977ba2448e78cc04)) — by MoldyTaint
- Add user language preference API and database schema ([aeff37f](https://github.com/MoldyTaint/Cinephage/commit/aeff37fe1aaafa08c000241fe568ce85ef280945)) — by MoldyTaint
- Integrate i18n into application shell ([e59c6d1](https://github.com/MoldyTaint/Cinephage/commit/e59c6d1ad36478b810a8e8ac5ce08f1a039237f0)) — by MoldyTaint
- Migrate all route pages to i18n ([6d95f2f](https://github.com/MoldyTaint/Cinephage/commit/6d95f2f9c9457514b60a6e4c8e0ed734d194013f)) — by MoldyTaint
- Migrate all Svelte components to i18n ([04691c5](https://github.com/MoldyTaint/Cinephage/commit/04691c59a8dab7567aa3db325f273eef7ac6c8df)) — by MoldyTaint
- Add language filter to discover page ([df915f4](https://github.com/MoldyTaint/Cinephage/commit/df915f427d116ae34d7cf6318834a82de663ff7b)) — by MoldyTaint
- Standardize settings pages with shared components and route consolidation ([2f4e543](https://github.com/MoldyTaint/Cinephage/commit/2f4e543731a4aacc0493abb3d3ef6b95fa85b525)) — by MoldyTaint
- Add media subtype support for root folders and enforce anime root folder settings ([25648c4](https://github.com/MoldyTaint/Cinephage/commit/25648c48ecd87a75e752260aad9d9922f34513f1)) — by Keonramses
- Add media move functionality and enhance root folder management ([580894b](https://github.com/MoldyTaint/Cinephage/commit/580894b65249b694b6346bbd9b7fa356c5b6462b)) — by Keonramses
- Enhance manual import service with anime classification and match consensus ([a98ed1e](https://github.com/MoldyTaint/Cinephage/commit/a98ed1e7f8b52a26e855c3b464a9be5fbbc9926d)) — by Keonramses
- Enhance library navigation and anime root folder enforcement ([95f131f](https://github.com/MoldyTaint/Cinephage/commit/95f131f5f4d03cdf3ed3943a9add61d6b5512592)) — by Keonramses
- Translate Spanish (es) localization file ([ff0904f](https://github.com/MoldyTaint/Cinephage/commit/ff0904f753479feb63108e54d8a4b9f2aaa66731)) — by MoldyTaint
- Introduce custom library support and backfill existing media ([3847ecd](https://github.com/MoldyTaint/Cinephage/commit/3847ecd7d8b39f299b1aae3c14d47c951b876c73)) — by Keonramses
- Enhance library and root folder management ([d4c19b8](https://github.com/MoldyTaint/Cinephage/commit/d4c19b89dc9ff7439276dccc9ba5a792f5a6bb0c)) — by Keonramses
- Localize and enhance library storage management ([07b9ba0](https://github.com/MoldyTaint/Cinephage/commit/07b9ba02fffe9bc02db555f42232d36c41f7ff89)) — by Keonramses
- Align spanish tranlation paraglide keys ([be7a955](https://github.com/MoldyTaint/Cinephage/commit/be7a955bad93ee07a173ae711400fc35a775cc7b)) — by Keonramses
- Add missing messages and project.inlang files to Docker build ([0d89fb7](https://github.com/MoldyTaint/Cinephage/commit/0d89fb7576586cd2f50e38179ab94a5558f24cd7)) — by Keonramses
- Add source-only and resolution-only scoring formats ([3dbb858](https://github.com/MoldyTaint/Cinephage/commit/3dbb8589559aea1dfa32e86fc290a399bd6391d5)) — by MoldyTaint
- Add playback sessions and persisted support logs ([70368e9](https://github.com/MoldyTaint/Cinephage/commit/70368e91e43fd0df5bb2d3a5af1a5b2d313a6fd4)) — by MoldyTaint
- Canonicalize release parsing and scoring attributes ([2d62d9f](https://github.com/MoldyTaint/Cinephage/commit/2d62d9f054ab56ede2082efef080426e62993a17)) — by MoldyTaint
- Support built-in profile overrides and runtime custom formats ([4192fc6](https://github.com/MoldyTaint/Cinephage/commit/4192fc6be558d1d9d09a6b69ad4ac571ffd6b444)) — by MoldyTaint
- Refine quality scoring UI and search result details ([8938b25](https://github.com/MoldyTaint/Cinephage/commit/8938b25fd6b4f979333e14fcc696d140fef6e388)) — by MoldyTaint
- Improve streaming prefetch and usenet playback resilience ([5cec266](https://github.com/MoldyTaint/Cinephage/commit/5cec266b94b710b1ac1fac0f52a479f15d01636c)) — by MoldyTaint
- Add configuration backup and restore with encrypted secrets ([ca0e328](https://github.com/MoldyTaint/Cinephage/commit/ca0e32816d31e8354b14b6365e3ca188b7b15c6c)) — by Keonramses
- Auto-detect latest CI candidate for releases and remove manual release notes input ([bcce4a7](https://github.com/MoldyTaint/Cinephage/commit/bcce4a71a89290e3f866dcb634bdf12465fb6dfa)) — by MoldyTaint
- Add automated release pipeline triggered by semver tags ([3143acc](https://github.com/MoldyTaint/Cinephage/commit/3143acc4710081c61a8ccaac4a0bedb24ecc715c)) — by MoldyTaint

### Bug Fixes

- Remove non-functional providers, fix Subf2m selectors ([956fb4b](https://github.com/MoldyTaint/Cinephage/commit/956fb4b80b5a7ea0293a8187329c48e5a53828d5)) — by root
- Graceful shutdown now stops all background services ([78af871](https://github.com/MoldyTaint/Cinephage/commit/78af871e08c32cfd82bc500c7d0b08dc1834761c)) — by root
- Update CSRF config to use trustedOrigins ([b037761](https://github.com/MoldyTaint/Cinephage/commit/b037761b2765fe2690105b49782753a0668f6764)) — by root
- Gracefully handle missing TMDB API key during fresh install ([4c8ab5a](https://github.com/MoldyTaint/Cinephage/commit/4c8ab5a0c87ffd7334ee6c49f0e715d818cad6f9)) — by root
- Include data/indexers in build context ([1b55211](https://github.com/MoldyTaint/Cinephage/commit/1b552114ab4fbb49e57f6746ecea39f293a264e7)) — by root
- Simplify .dockerignore to properly include indexers ([dd28f54](https://github.com/MoldyTaint/Cinephage/commit/dd28f54afe11c9ff943edf38c0cdfaa25c9ec5f0)) — by root
- Add .gitattributes to prevent CRLF line endings in shell scripts ([ab94639](https://github.com/MoldyTaint/Cinephage/commit/ab9463951fd8b1035a3f7e98748bd219482af433)) — by root
- Remove duplicate nzbname parameter to address list type error ([ccc556d](https://github.com/MoldyTaint/Cinephage/commit/ccc556dc048b02665d6eeec102b51fa773975c00)) — by root
- Prevent race condition in streaming file cleanup and optimize batch operations ([69e9939](https://github.com/MoldyTaint/Cinephage/commit/69e993934dcadb867a64ced469f4ae8443e5d8c9)) — by root
- Remove obsolete db:push from docker entrypoint ([61eef22](https://github.com/MoldyTaint/Cinephage/commit/61eef221571fb2c007cdee7d0d5b99e80b943322)) — by root
- Add protocol-based client selection for usenet downloads ([c29282f](https://github.com/MoldyTaint/Cinephage/commit/c29282fbbc3590fcb4c1ffb48af2a791a0613d2e)) — by root
- Remove duplicate docker-compose.yml causing user confusion ([9ee52bb](https://github.com/MoldyTaint/Cinephage/commit/9ee52bb2572621fb1dfa9251185a9a12b5f003e4)) — by root
- Improve auto-labeling and remove redundant template option ([d0302b0](https://github.com/MoldyTaint/Cinephage/commit/d0302b01c33a7a89b87a7db4e40faa5c225dd6b0)) — by root
- Resolve lint errors and improve Svelte 5 reactivity ([c2969ba](https://github.com/MoldyTaint/Cinephage/commit/c2969baa78d9b9d38e00e9956e68f3b9d51c4dc9)) — by root
- Resolve dependabot security vulnerabilities ([1c3ac6c](https://github.com/MoldyTaint/Cinephage/commit/1c3ac6ca6e117cd9d5baf1602904b9c33a477426)) — by root
- Use protocol-aware client selection for downloads ([ab6e843](https://github.com/MoldyTaint/Cinephage/commit/ab6e843fa24b65625d118c6acd78c4e4d09571c1)) — by root
- Resolve grab failures due to missing quality profile ([e2dd291](https://github.com/MoldyTaint/Cinephage/commit/e2dd291c3c1366db54ca5daad19a274d1330d079)) — by root
- Prevent 502 errors on series refresh through reverse proxies ([754ec5e](https://github.com/MoldyTaint/Cinephage/commit/754ec5efb36ed1e7b5e89a71b4de62a69734cc6f)) — by root
- Improve streaming API reliability with source fallback ([822b045](https://github.com/MoldyTaint/Cinephage/commit/822b045633badfee746de9f1be1dccf265896f33)) — by root
- Resolve test failures in CI ([c9bc9f3](https://github.com/MoldyTaint/Cinephage/commit/c9bc9f3a2ecd96ad45b9112ae1a60bb795bb7bcf)) — by root
- Resolve lint errors in test files ([fe35e0d](https://github.com/MoldyTaint/Cinephage/commit/fe35e0df8cb2c8f4cc35f436eed227f3a9ae16a4)) — by root
- Resolve TypeScript errors in test files ([b8b0881](https://github.com/MoldyTaint/Cinephage/commit/b8b0881cb4ed6e67520587235fd3ad9e795a84cb)) — by root
- Use existing node user instead of creating cinephage user ([69603ec](https://github.com/MoldyTaint/Cinephage/commit/69603ec7d9d9c629b972b0f6233bfceb27cdd54e)) — by root
- Prevent API key exposure in URLs and add ReDoS protection ([2651cd7](https://github.com/MoldyTaint/Cinephage/commit/2651cd7d26735608eafffd3dcb72b717fd7d9bac)) — by root
- Set keepAliveTimeout for reverse proxy compatibility ([5ae1435](https://github.com/MoldyTaint/Cinephage/commit/5ae1435a55be06bf69a6b0d848f24c5d7af90c2e)) — by root
- Disable JS modulepreload Link headers for nginx compatibility ([70677d6](https://github.com/MoldyTaint/Cinephage/commit/70677d6b09f3350cda123d2824caa3586030f8c3)) — by root
- Improve External URL configuration UX ([45e1408](https://github.com/MoldyTaint/Cinephage/commit/45e14089ddcec62480b48ca2e41783fb529b6afb)) — by root
- Use IPv4 loopback for healthcheck ([fa953d6](https://github.com/MoldyTaint/Cinephage/commit/fa953d677ea2f55eb30525445b0128cb3a257b96)) — by root
- Add option to delete files from disk when removing content ([196ffe3](https://github.com/MoldyTaint/Cinephage/commit/196ffe3ff486be8086c154e659d534610e8bf70e)) — by root
- Resolve svelte-check warnings and improve code quality ([c1f2712](https://github.com/MoldyTaint/Cinephage/commit/c1f2712584dddf1550dbd84a601aaf17d7b6bbf2)) — by root
- Use native arm64 runners for Docker builds ([3005a58](https://github.com/MoldyTaint/Cinephage/commit/3005a589a17614f77604133dfca3a8de899f2d1f)) — by root
- Lowercase image name for Docker tags ([b58d61a](https://github.com/MoldyTaint/Cinephage/commit/b58d61a6e396f7344d004f4e9de237aa9951441b)) — by root
- Use json format for manifest digest extraction ([e758152](https://github.com/MoldyTaint/Cinephage/commit/e7581521e3eee787659217115485e37dd5a69522)) — by root
- Correct episode subtitle download path calculation ([38f9abf](https://github.com/MoldyTaint/Cinephage/commit/38f9abfb418e61483caa2a359078cd9e212a77e2)) — by root
- Update health tracker tests and fix linting issues ([3f63ad9](https://github.com/MoldyTaint/Cinephage/commit/3f63ad941b8791a0d1a51e14cde3e25f7ec75cc8)) — by root
- Resolve type and formatting issues in download client components ([b82c47b](https://github.com/MoldyTaint/Cinephage/commit/b82c47b2cef22ddd5d27c5836f5599279fb3ec4d)) — by root
- Remove unused 'and' import from DataRepairService ([d7b23fe](https://github.com/MoldyTaint/Cinephage/commit/d7b23fe5542255a1d3763ac3e757131650a27276)) — by root
- Resolve ESLint and Prettier issues in Live TV module ([c41d53d](https://github.com/MoldyTaint/Cinephage/commit/c41d53d088466bd17856ca30685318c76368adcd)) — by root
- Prevent premature import during post-processing ([edeb859](https://github.com/MoldyTaint/Cinephage/commit/edeb8594363c7a96859616c44108ed5befa17233)) — by root
- Add eslint-disable for reserved loading state variable ([595fbfb](https://github.com/MoldyTaint/Cinephage/commit/595fbfb3957bd342919ca3774e3bcc18d1737829)) — by root
- Properly fix Live TV lint issues (remove dead code) ([5c0b1a9](https://github.com/MoldyTaint/Cinephage/commit/5c0b1a924c3ea6145f1e6aa7d1924ef19bf05845)) — by root
- Make individual provider tests non-blocking ([d3258a5](https://github.com/MoldyTaint/Cinephage/commit/d3258a57b8e337a68ebacb12eef8c556783551d7)) — by root
- Comprehensive rewrite with storage validation and retry logic ([06e84cc](https://github.com/MoldyTaint/Cinephage/commit/06e84cc9e940fb9e77a6a6467756029e0266c58b)) — by root
- Make live validation tests non-blocking on provider failures ([a24449f](https://github.com/MoldyTaint/Cinephage/commit/a24449f84c971f84c0744a78eaa88bd5b59f379f)) — by root
- Improve SABnzbd robustness, search filtering, and CI stability ([5c1acca](https://github.com/MoldyTaint/Cinephage/commit/5c1acca1ae7f7a9ed4934c82a4e4475f2ab5c6d3)) — by root
- Resolve lint and test failures ([54a0f0d](https://github.com/MoldyTaint/Cinephage/commit/54a0f0dd7cfad50b5375b71e76594748a58c821a)) — by root
- Resolve ESLint errors in livetv components ([e5c69a9](https://github.com/MoldyTaint/Cinephage/commit/e5c69a9f8167ddbdcadd6e1e909e59be544fe538)) — by root
- Reload NNTP manager on server changes and auto-cleanup streams ([4b39000](https://github.com/MoldyTaint/Cinephage/commit/4b39000528c0dbdd8f21d692883f7666edb075c7)) — by root
- Filter releases by category to prevent wrong content types ([af1d5ee](https://github.com/MoldyTaint/Cinephage/commit/af1d5ee097e2f2242b4c51ff373cb0fe2c893d23)) — by root
- Prevent duplicate movie file records during import ([c129ca1](https://github.com/MoldyTaint/Cinephage/commit/c129ca146a0c071b6fa9ec5a7ed70e34ddf05a74)) — by root
- Update contrib.rocks URL to show all contributors ([a7e83a5](https://github.com/MoldyTaint/Cinephage/commit/a7e83a54ea780e648c35501c36434a6d40a8fcf8)) — by root
- Resolve lint errors after PR merge ([bc3aeb3](https://github.com/MoldyTaint/Cinephage/commit/bc3aeb30bf73dd2a07902847599261d8127b0912)) — by root
- Block music/soundtrack releases from being grabbed ([cc3d7cf](https://github.com/MoldyTaint/Cinephage/commit/cc3d7cf92c9cb8a9a0a4e89a91f2221aa431830a)) — by root
- Implement robust per-migration tracking with schema drift detection ([fdf53aa](https://github.com/MoldyTaint/Cinephage/commit/fdf53aad9985b53c99e8e204b29de20d6bb2926f)) — by root
- Add stream validation to enable automatic backup failover ([0b336e5](https://github.com/MoldyTaint/Cinephage/commit/0b336e5da64fc050816691de71eba7d480938ae4)) — by root
- Correct env file reference in README quick start ([05e8f14](https://github.com/MoldyTaint/Cinephage/commit/05e8f141dd56916dd1b5d5b085e76fad4402a0d4)) — by root
- Enhance search input handling and NZB-Mount client behavior ([4ae429a](https://github.com/MoldyTaint/Cinephage/commit/4ae429a539ea0cb2a0cf4d6641eef6403d9ae278)) — by Keonramses
- Release group extraction and display in queue/history ([722751e](https://github.com/MoldyTaint/Cinephage/commit/722751ec8d6250eb6266460ced355abdea2731fd)) — by root
- Add size property to GrabRequest type ([44e80cf](https://github.com/MoldyTaint/Cinephage/commit/44e80cf50dc8fcdfce37771a53141e96944b5df6)) — by root
- Resolve build warnings ([c56a94c](https://github.com/MoldyTaint/Cinephage/commit/c56a94c23fc2903b4aa86c18e6f16511d857be40)) — by root
- Address lint errors ([b3a9e15](https://github.com/MoldyTaint/Cinephage/commit/b3a9e1514e9235f268673734ebaa93b92ee3d2a2)) — by MoldyTaint
- Resolve typecheck issues ([12a3530](https://github.com/MoldyTaint/Cinephage/commit/12a3530b6f07a34cf7bef25a3cb0da54ab75a0c1)) — by MoldyTaint
- Resolve lint errors and remove unused code ([900fe0a](https://github.com/MoldyTaint/Cinephage/commit/900fe0a8b66b07d4ae9ea49060ae664b9116d92e)) — by MoldyTaint
- Use cloudflareFetch for download handler requests ([f2df07f](https://github.com/MoldyTaint/Cinephage/commit/f2df07f4ae370007aaad616706a2d3e3f642bbd7)) — by MoldyTaint
- Eliminate duplicate episode tokens in search queries (#72) ([19d172b](https://github.com/MoldyTaint/Cinephage/commit/19d172bec55152418bebae443fb0f45fbab1d439)) — by MoldyTaint
- Prefetch camoufox binaries during build and update package-lock with peer dependencies. ([2515e93](https://github.com/MoldyTaint/Cinephage/commit/2515e93658ccbabc81ce1da0fbfdd90ecb6ccda2)) — by Keonramses
- Fetch camoufox at runtime to keep image slim ([aeff04e](https://github.com/MoldyTaint/Cinephage/commit/aeff04eacffc387209f6897d11b467e5c59f04d0)) — by Keonramses
- Update Camoufox installation path and cache handling ([ef6894a](https://github.com/MoldyTaint/Cinephage/commit/ef6894a5b127cec37e295cf536dfc10f5df5edfa)) — by Keonramses
- Resolve queue/import issues and scheduler status reporting ([3df57b0](https://github.com/MoldyTaint/Cinephage/commit/3df57b0f0bcc411bd061594df41efd95907d0abf)) — by MoldyTaint
- Resolve test failures and improve test reliability ([e36e9fe](https://github.com/MoldyTaint/Cinephage/commit/e36e9fe0ffff68bc89d3bb8ce4bccfbb89d2dba4)) — by MoldyTaint
- Resolve Prettier formatting issues in 6 test files ([24959fc](https://github.com/MoldyTaint/Cinephage/commit/24959fc9f92a7b761787262a54421eecbb475f13)) — by MoldyTaint
- Install Playwright browsers before running tests ([e3ff59a](https://github.com/MoldyTaint/Cinephage/commit/e3ff59a6d74d7843c010fa6ebf2fb8bad9250a80)) — by MoldyTaint
- Add assertions before early returns in live validation tests ([93c953b](https://github.com/MoldyTaint/Cinephage/commit/93c953b6c8dea572b781c9d6bd19538464ca4d99)) — by MoldyTaint
- Download Camoufox at build time to fix Docker permission issues ([0453cd6](https://github.com/MoldyTaint/Cinephage/commit/0453cd6b06105350573625e736e6582974d5de9d)) — by MoldyTaint
- Standardize Docker env vars to CINEPHAGE\_\* prefix ([608903d](https://github.com/MoldyTaint/Cinephage/commit/608903ddcb43718bff03429354535213874a5783)) — by MoldyTaint
- Improve Docker permission error handling and documentation ([dea78f7](https://github.com/MoldyTaint/Cinephage/commit/dea78f7ea0ff5d717d6eb50282d27baa23bde407)) — by MoldyTaint
- Correct media title URLs in queue pages ([9f06fcd](https://github.com/MoldyTaint/Cinephage/commit/9f06fcd6cce5a901259d667ad55e0be8481871d4)) — by MoldyTaint
- Add complete Firefox browser dependencies for Camoufox in Docker ([3b271e4](https://github.com/MoldyTaint/Cinephage/commit/3b271e45769ba6e245c151232e0d6a59b212e609)) — by MoldyTaint
- Robust browser lifecycle management in CamoufoxManager ([1c2c34e](https://github.com/MoldyTaint/Cinephage/commit/1c2c34ef37554b6203ac907f719b23f0b25432f8)) — by MoldyTaint
- Mobile responsiveness and live tv browsing improvements for better user experience. ([574e29d](https://github.com/MoldyTaint/Cinephage/commit/574e29d254c8f95caa838c904ed24eec22e8678e)) — by Keonramses
- Enhance UID/GID handling and Camoufox caching ([4d3e392](https://github.com/MoldyTaint/Cinephage/commit/4d3e39212f4fc81b1153570d859c898cda25f6e9)) — by Keonramses
- Update Docker build trigger to include dev branch ([5ec5260](https://github.com/MoldyTaint/Cinephage/commit/5ec5260e354d59ae2ca5845b1a44c08d053d23b4)) — by Keonramses
- Update Camoufox installation path and cache handling ([60385a3](https://github.com/MoldyTaint/Cinephage/commit/60385a34c1d723be4b7a96739ad0e29ae9f770c5)) — by Keonramses
- Improve spinner output handling in docker-entrypoint.sh ([15e433a](https://github.com/MoldyTaint/Cinephage/commit/15e433aaa759cc528f2537c799ac13088545abd0)) — by Keonramses
- Prefetch camoufox binaries during build ([7232bf4](https://github.com/MoldyTaint/Cinephage/commit/7232bf421d82781c95b1bc6bd13f49a30e52b820)) — by Kenneth Iwuchukwu
- Update camoufox entrypoint. ([d34127f](https://github.com/MoldyTaint/Cinephage/commit/d34127f1ab5790f4f62f7a95f7d08ac36d71ba09)) — by Kenneth Iwuchukwu
- Add xvfb and GLX/Mesa libraries to Dockerfile ([5d07244](https://github.com/MoldyTaint/Cinephage/commit/5d07244a98f8e1cb1e68d6d06d66947fde39925f)) — by Kenneth Iwuchukwu
- Resolve camoufox cache path for custom UIDs (Synology) ([a684f39](https://github.com/MoldyTaint/Cinephage/commit/a684f390d6f582ffd663fb6efbd48a3b96352351)) — by MoldyTaint
- Add cat parameter to Newznab API requests ([14bde9f](https://github.com/MoldyTaint/Cinephage/commit/14bde9f114f8ecefdb5355a228360d55966a9473)) — by MoldyTaint
- Lock season/episode monitoring when series is unmonitored; enhance npm configuration and Docker setup to prevent memory leaks ([ee51cd1](https://github.com/MoldyTaint/Cinephage/commit/ee51cd18ef19365bbc72dce4b93c98dd8281ba17)) — by Keonramses
- Enhance Docker build and release workflows ([941ec45](https://github.com/MoldyTaint/Cinephage/commit/941ec45b534df3ae35f85d4aa9e467668305f815)) — by Keonramses
- Remove unnecessary blank line before initialization comment in hooks.server.ts ([7d96ea3](https://github.com/MoldyTaint/Cinephage/commit/7d96ea3cd3aae24c0623ecbc8b7fad0b3a59d642)) — by Keonramses
- Add profile page to resolve 404 error ([6757248](https://github.com/MoldyTaint/Cinephage/commit/6757248ef89482ef7ab2dbbe2b680529ec22e932)) — by MoldyTaint
- Correct external list provider mapping and preset settings merge ([7898819](https://github.com/MoldyTaint/Cinephage/commit/78988191681cb3b873beae62acd8a9dd95157ac9)) — by MoldyTaint
- Move all caches to /app to fix PUID/PGID permission issues ([cebf4c9](https://github.com/MoldyTaint/Cinephage/commit/cebf4c95811d1a1323bc1f3b802c97bce702a636)) — by MoldyTaint
- Add missing dependencies for Camoufox browser ([c89d5df](https://github.com/MoldyTaint/Cinephage/commit/c89d5dff98982eaabda153c166fbe8b69a28fdf6)) — by MoldyTaint
- Fixed the syntax error in docker-entrypoint.sh by removing the empty then block and using a negated check. ([5799e9a](https://github.com/MoldyTaint/Cinephage/commit/5799e9a354466f531404d3af51b4f0e6258c34f0)) — by Keonramses
- Remove USER directive for non-root execution in Dockerfile ([f2fa070](https://github.com/MoldyTaint/Cinephage/commit/f2fa070909148669d6c16109fbd96c9415df2ce5)) — by Keonramses
- Use database naming config and improve quality data handling ([0298c07](https://github.com/MoldyTaint/Cinephage/commit/0298c07e982f86a656c0f2e82b816fa3ccdb4835)) — by MoldyTaint
- Bundled data sync, subtitle monitoring, and UI polish ([0914f6a](https://github.com/MoldyTaint/Cinephage/commit/0914f6a8a7ff455dd6c9f61948a467741c0dcf0a)) — by Keonramses
- Bundled data sync, subtitle monitoring, and UI polish (#104) ([018a775](https://github.com/MoldyTaint/Cinephage/commit/018a7758b68247130009e30fbf3f716e37ec15b6)) — by Kenneth Iwuchukwu
- Resolve all ESLint errors and improve error handling ([d03ca54](https://github.com/MoldyTaint/Cinephage/commit/d03ca547f81b8f3e0a391bbdc080abc934567eaf)) — by MoldyTaint
- Use console.error instead of logger in browser component ([7d15bb7](https://github.com/MoldyTaint/Cinephage/commit/7d15bb7e779a734d79bc250dc969c5f262624b92)) — by MoldyTaint
- Resolve high severity vulnerability in @isaacs/brace-expansion ([b8853c8](https://github.com/MoldyTaint/Cinephage/commit/b8853c8b742cad4039f201e5c5d693e42eb31fac)) — by MoldyTaint
- Align vitest dependencies to resolve npm ci failure ([15a8828](https://github.com/MoldyTaint/Cinephage/commit/15a8828c24e97cf78bc7caa95b6524d0644c17d8)) — by MoldyTaint
- Update /queue references to /activity to fix type check errors ([1d34f85](https://github.com/MoldyTaint/Cinephage/commit/1d34f858c0e32b5e3c3a8212cc02dc8ddc934af8)) — by MoldyTaint
- Resolve lint error - rename unused getYear to \_getYear ([740ccb9](https://github.com/MoldyTaint/Cinephage/commit/740ccb94a5923165bf2efdf747e11fe0bcfd0a0f)) — by MoldyTaint
- Remove dead code - unused \_getYear function ([a05476c](https://github.com/MoldyTaint/Cinephage/commit/a05476cce33002084818778bbeda25f8b4e3ef55)) — by MoldyTaint
- Add rollup platform-specific deps as optional dependencies ([164f908](https://github.com/MoldyTaint/Cinephage/commit/164f908e13abbea035f9f8238dc3f9769b100ffc)) — by MoldyTaint
- Package-lock.json lightnening CSS build issues ([0ad053a](https://github.com/MoldyTaint/Cinephage/commit/0ad053a899f57d2363b2e45b8af5cbaacd731c08)) — by Keonramses
- Correct search routing and allow manual episode auto-grab override. ([edd69f0](https://github.com/MoldyTaint/Cinephage/commit/edd69f0b7f6b8a17da5d8ccc66cb89ce455ea8e8)) — by Keonramses
- Correct search routing and allow manual episode auto-grab override. (#115) ([be22fba](https://github.com/MoldyTaint/Cinephage/commit/be22fba14869c4d91126bf2094592dac86add24c)) — by Kenneth Iwuchukwu
- Make SSE system SSR-safe ([2ba6d13](https://github.com/MoldyTaint/Cinephage/commit/2ba6d131a6b6d1f690163a7680516f6220d2f4db)) — by MoldyTaint
- Deduplicate episode files and optimize STRM reprobe (#117) ([4ebbe5b](https://github.com/MoldyTaint/Cinephage/commit/4ebbe5b4075be1f04138c531236c97998162acd2)) — by Kenneth Iwuchukwu
- Complete library/activity SSE parity and mobile UX consistency ([b706dc9](https://github.com/MoldyTaint/Cinephage/commit/b706dc9cd294d931f1186e71c78307e2cb395fe8)) — by Keonramses
- Separate aired-missing and unaired episode counts ([0220540](https://github.com/MoldyTaint/Cinephage/commit/022054034da4b300bd5f38491b83770a1112cb1a)) — by Keonramses
- Library detail SSE parity, activity sync, and mobile UX improvements (#125) ([166ef12](https://github.com/MoldyTaint/Cinephage/commit/166ef12468d78e17e84057db52b370e56e94b1bc)) — by Kenneth Iwuchukwu
- Live TV type safety improvements ([157e89e](https://github.com/MoldyTaint/Cinephage/commit/157e89e25b58ecb58977411bef82f487c6adfcc5)) — by MoldyTaint
- Resolve ESLint errors in livetv module ([d949d12](https://github.com/MoldyTaint/Cinephage/commit/d949d120ea79eccfb0ac7e2c692609e3d44f9356)) — by MoldyTaint
- Apply exclude_in_library filter to search and dashboard ([6210803](https://github.com/MoldyTaint/Cinephage/commit/62108033ccf23ec6691ed9bc58c1606b759ed5c0)) — by MoldyTaint
- Preserve exclude_in_library filter in View All links ([1a6ea31](https://github.com/MoldyTaint/Cinephage/commit/1a6ea31c0f95e199d53dccf3ddeb2e9bb7caf5df)) — by MoldyTaint
- Fix top rated filtering consistency ([279436d](https://github.com/MoldyTaint/Cinephage/commit/279436d3b089743d82cf113699473251ca831b4b)) — by MoldyTaint
- Remove FK constraints from legacy Live TV tables ([5017d63](https://github.com/MoldyTaint/Cinephage/commit/5017d631cb698d5b9b0d04630e9afe070536ae52)) — by MoldyTaint
- Correct indentation in schema sync and page server files ([a23e17c](https://github.com/MoldyTaint/Cinephage/commit/a23e17c16c0f6a3d51288048ad4039c496a046ac)) — by Keonramses
- Exclude specials from TV missing counters and ignore monitor state. ([7bdbd62](https://github.com/MoldyTaint/Cinephage/commit/7bdbd627c0070e3df22dae73c42e61b57f17ebee)) — by Keonramses
- Improve episode counting logic for missing content (#126) ([00c3280](https://github.com/MoldyTaint/Cinephage/commit/00c3280cde16189ad45a700d9c9760c7508e29be)) — by Kenneth Iwuchukwu
- Prevent worker slot exhaustion and, enhance `Update .strm URLs` & `Reprobe .strm Media Info` tasks ([f2619ad](https://github.com/MoldyTaint/Cinephage/commit/f2619ade34443ad57bf6185b92f3fa97d6b28fa8)) — by Keonramses
- Resolve worker slot leaks and, enhance "Update .strm URLs" & "Reprobe .strm Media Info" tasks (#128) ([0a24d5a](https://github.com/MoldyTaint/Cinephage/commit/0a24d5af7a34cd6b429927a1999bd96840d77829)) — by Kenneth Iwuchukwu
- Always prefer torrent files over magnet links for private tracker compatibility ([c6588bd](https://github.com/MoldyTaint/Cinephage/commit/c6588bd0169118ca648149739201e17bdf1169ac)) — by MoldyTaint
- Keep symlinked NZB-Mount media visible after reload and library scans ([3a36072](https://github.com/MoldyTaint/Cinephage/commit/3a36072b520add2454f9708a54cdcae0f89993b1)) — by Keonramses
- Send correct identifier to download clients for remove/pause/resume requests ([fe26daf](https://github.com/MoldyTaint/Cinephage/commit/fe26dafec4c492e434f739ebb62acaee82f54f2b)) — by Keonramses
- Send correct identifier to download clients for remove/pause/resume requests (#136) ([7cc0be6](https://github.com/MoldyTaint/Cinephage/commit/7cc0be64ab88eebfcf3785c9b3f637ffee95a32a)) — by Kenneth Iwuchukwu
- Resolve duplicate key crash in interactive search modal ([d1d3eaf](https://github.com/MoldyTaint/Cinephage/commit/d1d3eaf5119231fdc264665f7498a4c3506601d0)) — by MoldyTaint
- Improve search reliability with tvdbId support and title relevance filtering ([f28ee62](https://github.com/MoldyTaint/Cinephage/commit/f28ee628a26aa0787dddd8ba02676fff01022533)) — by MoldyTaint
- Reconcile missing-state searchability and harden release/cooldown logic (#139) ([23d5e00](https://github.com/MoldyTaint/Cinephage/commit/23d5e002e9e839da234459ca6e9ba537a9118ff2)) — by Kenneth Iwuchukwu
- Harden external source handling and overhaul smart list UX (#146) ([39ff4cc](https://github.com/MoldyTaint/Cinephage/commit/39ff4cccc3039e5a7394e22afefa385450731ea9)) — by Kenneth Iwuchukwu
- Add ID validation and year matching to prevent wrong movie results ([ee152cb](https://github.com/MoldyTaint/Cinephage/commit/ee152cbfa0c70fc4e270fd41ea014534ca01e240)) — by MoldyTaint
- Improve movie ID search reliability on Newznab indexers (#151) ([93f5c91](https://github.com/MoldyTaint/Cinephage/commit/93f5c910def79ec5939e4c048cfeb302ec51b4a9)) — by Kenneth Iwuchukwu
- Prevent command injection in subtitle sync service ([fa11658](https://github.com/MoldyTaint/Cinephage/commit/fa11658ad8d59533d42ca48840706f7ec6bfab31)) — by MoldyTaint
- Enforce CSRF origin validation for private networks ([4e4d298](https://github.com/MoldyTaint/Cinephage/commit/4e4d2988de7190ebb05881757a3013bf6e02d8b6)) — by MoldyTaint
- Harden SSRF protection and proxy security for all outbound requests ([8943c75](https://github.com/MoldyTaint/Cinephage/commit/8943c751dad151f46d6be71bf2b7512c4e63b58d)) — by MoldyTaint
- Apply base security headers to all routes and validate correlation IDs ([b41be26](https://github.com/MoldyTaint/Cinephage/commit/b41be260ab3d8f3c9d9f56e3d5dc75eda8e79efe)) — by MoldyTaint
- Redact credentials in API responses and settings UI ([bec28b6](https://github.com/MoldyTaint/Cinephage/commit/bec28b6db21a3bf6636e32e0d4d627a4381b8392)) — by MoldyTaint
- Restrict filesystem browse, path traversal, TMDB proxy, and query columns ([177c395](https://github.com/MoldyTaint/Cinephage/commit/177c395a6603a402e4545297bc6f083e2109b46c)) — by MoldyTaint
- Resolve stream replay loops on stalker portals via HLS-to-TS conversion ([127e8cd](https://github.com/MoldyTaint/Cinephage/commit/127e8cdd63d249be0d0a5b76473ea5d4bc7356c2)) — by MoldyTaint
- Add master playlist support for IPTV-Org streams and Jellyfin format detection ([342b989](https://github.com/MoldyTaint/Cinephage/commit/342b989693132f72996f132f06ce80a0e8e89815)) — by MoldyTaint
- Stop library scans excluding legitimate titles and preserve streaming file paths ([36de085](https://github.com/MoldyTaint/Cinephage/commit/36de08575532b0fb6d862f3dab1e52ab7e0cf1aa)) — by Keonramses
- Enhance version bump logic for dev branch and add parsing for stable tags (#183) ([3612257](https://github.com/MoldyTaint/Cinephage/commit/3612257d29f51f5754428aa89a123e2e7680d9c3)) — by Kenneth Iwuchukwu
- Enhance validation for stable source tags in GHCR retag workflow (#188) ([71e64bf](https://github.com/MoldyTaint/Cinephage/commit/71e64bf69449f8c254a25118b8e6e477c9b0fed1)) — by Kenneth Iwuchukwu
- Add circuit breaker logic to recordConnectionError ([b02e290](https://github.com/MoldyTaint/Cinephage/commit/b02e29066b113154a00a9c96be1e68a07a284dee)) — by MoldyTaint
- Add logging and error handling to SSE streams ([f90573d](https://github.com/MoldyTaint/Cinephage/commit/f90573db103bf511516205d4e3693bc32fd3a838)) — by MoldyTaint
- Respect monitorSpecials setting for Season 0 episodes ([8d09083](https://github.com/MoldyTaint/Cinephage/commit/8d09083c823bb3882de5178cf3b7d7b1a64264ee)) — by MoldyTaint
- Resolve type check errors and set Better Auth to respect DATA_DIR to resolve docker build failures. ([5f6d92a](https://github.com/MoldyTaint/Cinephage/commit/5f6d92a78a06e9d6b5e71c10956ce7146a90dd27)) — by Keonramses
- Discover page minor adjustments ([b533983](https://github.com/MoldyTaint/Cinephage/commit/b533983ab0b1aa253c64b1f23e00c19640f552dd)) — by MoldyTaint
- Improve clipboard copy functionality and enhance user feedback in settings page ([8257e2e](https://github.com/MoldyTaint/Cinephage/commit/8257e2e501ca7ba4aeadd9ddeee271b3dbb603bd)) — by Keonramses
- Resolve Better Auth v1.5 API key breaking changes ([8f7719f](https://github.com/MoldyTaint/Cinephage/commit/8f7719f43b8e87676e4837a46468ec5e665748bf)) — by MoldyTaint
- Add Cloudflare bypass and disable Vidlink provider ([adcbf3c](https://github.com/MoldyTaint/Cinephage/commit/adcbf3ccc61e4d43703d2c573810f110c5ce49b7)) — by MoldyTaint
- Update CURRENT_SCHEMA_VERSION to 66 and adjust apikey schema migration ([10658be](https://github.com/MoldyTaint/Cinephage/commit/10658be056cf12fc3f53be90eeacad40773670b9)) — by Keonramses
- Normalize semver input for source tag in GHCR retag workflow ([1f4776a](https://github.com/MoldyTaint/Cinephage/commit/1f4776a9633961a9ba12a590114e3603dd965481)) — by Keonramses
- Enhance validation for stable source tags in GHCR retag workflow ([5254a06](https://github.com/MoldyTaint/Cinephage/commit/5254a06024636aa1c54345e91dd9efb439882f08)) — by Keonramses
- Correct formatting in API documentation examples ([e8019cf](https://github.com/MoldyTaint/Cinephage/commit/e8019cf0312c1077dc16a8af366ace7bf15fa43b)) — by Keonramses
- Add rateLimit.id column and update schema for Better Auth ([ea41ed0](https://github.com/MoldyTaint/Cinephage/commit/ea41ed0014f2861cc7d8e62d6912ef0950f264e5)) — by Keonramses
- Register captcha solver in service manager for anti-bot bypass ([3baad32](https://github.com/MoldyTaint/Cinephage/commit/3baad324cf789ad2498424ecb908c89cf4589a66)) — by Keonramses
- Add streamer profile filtering for internal Cinephage Library indexer ([69a7552](https://github.com/MoldyTaint/Cinephage/commit/69a75526d089e0822d9065c7774a7c67ed24cdd7)) — by Keonramses
- Implement episode-only search strategy for missing episodes ([434827b](https://github.com/MoldyTaint/Cinephage/commit/434827b9c744b1ad2bf239ade6c4e70ee64df746)) — by Keonramses
- Add function to remove stale queue-linked activity rows ([9b46eac](https://github.com/MoldyTaint/Cinephage/commit/9b46eacdf86d796c353d45f2ea5266ef7b465f1f)) — by Keonramses
- Fall back to queue/folder release context for obfuscated filenames ([e693c2c](https://github.com/MoldyTaint/Cinephage/commit/e693c2cd3e94b515a0e5982b4d6b05463b5b149b)) — by Keonramses
- Move version resolution logic to a dedicated module ([d0743d7](https://github.com/MoldyTaint/Cinephage/commit/d0743d7c3e7cb3e013947af734fd2350e23eace0)) — by Keonramses
- Remove PUBLIC_APP_VERSION environment variable and update app version resolution logic ([e87853f](https://github.com/MoldyTaint/Cinephage/commit/e87853f02b912155e1697665607fa357cbd02729)) — by Keonramses
- Keep queue state consistent after import and removal ([0768c5c](https://github.com/MoldyTaint/Cinephage/commit/0768c5c30ee935753e79df8ad9e39b8a705cbd7e)) — by MoldyTaint
- Update Dockerfile to use absolute path for entrypoint script ([272567f](https://github.com/MoldyTaint/Cinephage/commit/272567f928fbf35815c3ac91795b3280a542f897)) — by Keonramses
- Improve service initialization logic and enhance Dockerfile for production dependencies ([bd93c05](https://github.com/MoldyTaint/Cinephage/commit/bd93c059de3fc518d6c43c542d99e5e536af261f)) — by Keonramses
- Keep optional runtime deps for impit native bindings ([e4714dc](https://github.com/MoldyTaint/Cinephage/commit/e4714dce21c197c1c99928be62f1df7536515d73)) — by Keonramses
- Expand dashboard history preview ([6b8a7cc](https://github.com/MoldyTaint/Cinephage/commit/6b8a7cc284b54a9dc88acd4a36c687248f211f31)) — by MoldyTaint
- Add missing logs route and harden error handling ([a928c30](https://github.com/MoldyTaint/Cinephage/commit/a928c307937a2f88fc12fd3a19a17c6994304db6)) — by MoldyTaint
- Update .gitignore to include secrets and remove sensitive .auth-secret file ([fd888e3](https://github.com/MoldyTaint/Cinephage/commit/fd888e3517e8b1f04c9f788de9f643e69c57ef53)) — by Keonramses
- Serialize Error instances in log capture store to prevent 500 on /settings/logs ([0b72e67](https://github.com/MoldyTaint/Cinephage/commit/0b72e67218ee30830ecfbaf51fdfcd414bbbdd74)) — by MoldyTaint
- Use correct episode file as upgrade baseline (#213) ([458935b](https://github.com/MoldyTaint/Cinephage/commit/458935b4027345dc7412200f784a5ec5c7a5f3b8)) — by MoldyTaint
- Title normalization, naming cache invalidation, and log sanitization ([e3ce8a4](https://github.com/MoldyTaint/Cinephage/commit/e3ce8a4248a521e0ad691ac4f56940e2920d027a)) — by MoldyTaint
- Improve API key regeneration UX with confirmation, toasts, and data refresh ([55bdd8a](https://github.com/MoldyTaint/Cinephage/commit/55bdd8af22a5ccdb5a8e75bfa2c702334b830cc0)) — by MoldyTaint
- Move dotenv to runtime deps and improve auth secret handling for SSR and testing environments ([bc0b4a9](https://github.com/MoldyTaint/Cinephage/commit/bc0b4a945ccb7d8503abaeeefaa1e2a6160a2337)) — by Keonramses
- Require BETTER_AUTH_SECRET at runtime and set it in docker healthcheck test ([2f8eee8](https://github.com/MoldyTaint/Cinephage/commit/2f8eee8f392cb22a6cf22fc0787d5e8ad12b499c)) — by Keonramses
- Normalize path handling for client paths and add tests for Windows separator support ([7c4fe7d](https://github.com/MoldyTaint/Cinephage/commit/7c4fe7d476b629b20b3e59c21b740ad1792a46ee)) — by Keonramses
- Refresh plex libraries by folder path ([94a9a29](https://github.com/MoldyTaint/Cinephage/commit/94a9a2902393ff39eed648dda212060b0cb1642d)) — by Lautaro Busto
- Update media server description and enhance auth secret retrieval ([f8c75b8](https://github.com/MoldyTaint/Cinephage/commit/f8c75b875718060be796ab7ac6f7750123d26508)) — by Keonramses
- Enhance search orchestrator with title variant handling and episode pointer support for RuTracker indexer ([0f24e02](https://github.com/MoldyTaint/Cinephage/commit/0f24e023dcecf6232ccb92452a437ac5e716440e)) — by Keonramses
- Exclude specials from missing-episode auto-grab and UI missing counts ([a1242f8](https://github.com/MoldyTaint/Cinephage/commit/a1242f83d1688f014b550ad238ab38c58f3e97b5)) — by Keonramses
- Preserve localized titles in interactive matching ([dbc04fe](https://github.com/MoldyTaint/Cinephage/commit/dbc04fe604d06b53d902cdc4e5f00032e0390be4)) — by Keonramses
- Add filter to exclude non-video artifacts from movie/TV searches ([ef82e53](https://github.com/MoldyTaint/Cinephage/commit/ef82e53c90c9808113e0a7a67ae978184c6f822d)) — by Keonramses
- Enhance filtering for RuTracker season packs in TV searches ([0bfd858](https://github.com/MoldyTaint/Cinephage/commit/0bfd858e75e8df68da46c64563e36d1adbcfc9a1)) — by Keonramses
- Scope RuTracker episode-only flow and prevent partial-season re-downloads in manual auto-grab ([01477fa](https://github.com/MoldyTaint/Cinephage/commit/01477fa61dc26571461b3f3b68547932aaad5f05)) — by Keonramses
- Move mobile SSE status badge into header and align with nav spacing ([ba81f60](https://github.com/MoldyTaint/Cinephage/commit/ba81f60dec5bc68bc5d8504395a3b965bd64f642)) — by Keonramses
- Enhance auto-search error handling and reporting ([159f782](https://github.com/MoldyTaint/Cinephage/commit/159f782691d6b66b9d88f6308b4b4a0df3b16d1d)) — by Keonramses
- Update Kinozal and RuTracker configurations for improved Cyrillic handling and search strategies ([0517df2](https://github.com/MoldyTaint/Cinephage/commit/0517df26dc1fae7ffbe70bb36e55ec65030a53eb)) — by Keonramses
- Preserve Russian titles in RuTracker and Kinozal ([ecb9faa](https://github.com/MoldyTaint/Cinephage/commit/ecb9faa5a82b92936f9145c8d5d016dbffe4e71e)) — by MoldyTaint
- Resolve 15 npm security vulnerabilities ([6be827f](https://github.com/MoldyTaint/Cinephage/commit/6be827f228d33d24f5634a258f9e2401ea3847ea)) — by MoldyTaint
- Resolve CI failures and improve code quality ([a9ccb93](https://github.com/MoldyTaint/Cinephage/commit/a9ccb935250a31ec091fbceafb33ea6d5145be4b)) — by MoldyTaint
- Resolve CI and Docker build failures ([dd97ff9](https://github.com/MoldyTaint/Cinephage/commit/dd97ff94df0e4f35b3537f54dc3daf1551561780)) — by MoldyTaint
- Resolve i18n translation type errors ([4d7288e](https://github.com/MoldyTaint/Cinephage/commit/4d7288e71abe75b21b8d1deb414402607fe1a932)) — by MoldyTaint
- Correct syntax error in IptvOrgSelector.svelte ([88111b3](https://github.com/MoldyTaint/Cinephage/commit/88111b365fbe13dc174163dc264c5b622cd18d75)) — by MoldyTaint
- Resolve remaining i18n translation type errors ([b5f00e9](https://github.com/MoldyTaint/Cinephage/commit/b5f00e9a3cd335cb223fb14fce97c9b495ec099c)) — by MoldyTaint
- Force paraglide regeneration and fix type assertions ([d979cc6](https://github.com/MoldyTaint/Cinephage/commit/d979cc636247bd4333558723502739392cfe79b8)) — by MoldyTaint
- Resolve German translation duplicates causing type mismatches ([bbc4075](https://github.com/MoldyTaint/Cinephage/commit/bbc4075095a160cce4493a21d58394d3c6405004)) — by MoldyTaint
- Remove invalid 'items' parameter from bulk operation translations ([e44fa07](https://github.com/MoldyTaint/Cinephage/commit/e44fa07e449e85a4f78d1cbcfc8e5c7c74928c3f)) — by MoldyTaint
- Resolve final 6 translation type errors ([7f9e843](https://github.com/MoldyTaint/Cinephage/commit/7f9e84333c1de58ce04bc5c38b3c7eeb4b90f6b6)) — by MoldyTaint
- Remove unused mediaTitle variable in MatchFolderModal ([dc0a611](https://github.com/MoldyTaint/Cinephage/commit/dc0a6111148dd16c10e313e768d5c808c45aeeea)) — by MoldyTaint
- Localize anime root-folder enforcement and warning copy ([23a2761](https://github.com/MoldyTaint/Cinephage/commit/23a27613f4312d87ff3cc613a1185bc89852e148)) — by Keonramses
- Regenerate package-lock.json ([6e789cf](https://github.com/MoldyTaint/Cinephage/commit/6e789cffdb59d8bd3a5e2d4f6ff4b240e754fee1)) — by Keonramses
- Update German and English translations for consistency and clarity ([f4828ca](https://github.com/MoldyTaint/Cinephage/commit/f4828cafc14210d50d61fc3938edb3b79d92c70f)) — by Keonramses
- Enhance download client update schema with detailed validation and optional fields ([3a92b23](https://github.com/MoldyTaint/Cinephage/commit/3a92b23c208e244ac3d5f41e8956f4d6f56e46b0)) — by Keonramses
- Update activity deletion logic to include move task history and adjust total deleted count ([182cc7c](https://github.com/MoldyTaint/Cinephage/commit/182cc7c4f839617421393233e001da7839c5878d)) — by Keonramses
- Update TMDB configuration link and enhance modal opening logic ([fb3903f](https://github.com/MoldyTaint/Cinephage/commit/fb3903fca3570e0599a22d605290e0a8ad1a79de)) — by Keonramses
- NCore IMDB parsing and add debug logging for indexer search issues ([e284865](https://github.com/MoldyTaint/Cinephage/commit/e284865d250f6b8e852276f365b2777c36a1552f)) — by MoldyTaint
- Authenticate before each OpenSubtitles API request ([1831e1b](https://github.com/MoldyTaint/Cinephage/commit/1831e1b0e712f3ad3c3907d8fd760541f3ad6d8f)) — by Lautaro Busto
- Use rest params in mockImplementation to satisfy TypeScript ([795df91](https://github.com/MoldyTaint/Cinephage/commit/795df91fe478c08824ba9b86846ade10e329069a)) — by Lautaro Busto
- Resolve build-breaking dependency issues ([f287278](https://github.com/MoldyTaint/Cinephage/commit/f287278d85e01f998d1f433bc89fc655114c23b5)) — by MoldyTaint
- Count stalled and paused downloads in active downloads stat ([b72820d](https://github.com/MoldyTaint/Cinephage/commit/b72820dc82577d039c5e781de5e1cce2bb791fad)) — by MoldyTaint
- Add missing paraglide keys for custom library UI ([bb5781b](https://github.com/MoldyTaint/Cinephage/commit/bb5781b5c598aaae635793645f8a2e255c7d946b)) — by Keonramses
- Resolve build-breaking dependency issues ([52b101e](https://github.com/MoldyTaint/Cinephage/commit/52b101e3ae4d01354eb2d12f562c5ba0fa376c92)) — by Keonramses
- Update integrity hash and add dependencies for guessit-js ([d606e86](https://github.com/MoldyTaint/Cinephage/commit/d606e8688f45c4e53f91b16a7b78cd05050c88a3)) — by Keonramses
- Regenerate package-lock.json ([82d9f2e](https://github.com/MoldyTaint/Cinephage/commit/82d9f2e30e78a19a344da802667cc94f69f75c31)) — by Keonramses
- Regenerate package-lock.json ([5d7727a](https://github.com/MoldyTaint/Cinephage/commit/5d7727a4484f4e79516c1475d6d197b4a912b7b3)) — by Keonramses
- Add stalled and paused download states to dashboard load ([ada9557](https://github.com/MoldyTaint/Cinephage/commit/ada95579fe1e4288600e24940b83839377d20c5f)) — by Keonramses
- Move dotenv to core depencies, to resolve docker build failure ([71ff2b0](https://github.com/MoldyTaint/Cinephage/commit/71ff2b0536d5e889a9fb10b36d0830d50bbfc009)) — by Keonramses
- Regenerate package-lock.json ([660c56e](https://github.com/MoldyTaint/Cinephage/commit/660c56e0b73b30f2219ec99cf173ce8f1db663d8)) — by Keonramses
- Move scan banner to visible location, minor ui/backend tweaks ([4f88ace](https://github.com/MoldyTaint/Cinephage/commit/4f88ace9fdb063e3e5394b37788e9d2408fa2212)) — by Keonramses
- Remove unused prop and replace mutable URL instance ([78f3989](https://github.com/MoldyTaint/Cinephage/commit/78f398971fba08ae49296f2e97a9a72617b6d3f7)) — by Keonramses
- Import SvelteURL ([b311fec](https://github.com/MoldyTaint/Cinephage/commit/b311fec4ab4666954cde1f6258312b5a2c217133)) — by Keonramses
- Set ORIGIN for better-auth base url fallback ([fdd87ee](https://github.com/MoldyTaint/Cinephage/commit/fdd87ee7beeb3f1a3cc29de9aa4e834b8f4a46ab)) — by Keonramses
- Improve auth and library add error reporting ([2a2063e](https://github.com/MoldyTaint/Cinephage/commit/2a2063e6afeba5310d18d0c249bd37f618cee7b1)) — by Keonramses
- Seed scoring profiles before library add inserts ([d5b6dbc](https://github.com/MoldyTaint/Cinephage/commit/d5b6dbcdc1cbb59fb8adceb076b3b8e958a66e6b)) — by Keonramses
- Remove double indents ([b8da813](https://github.com/MoldyTaint/Cinephage/commit/b8da81307c6a32b71f7466a785495deffcabb876)) — by Keonramses
- Prevent legacy library backfill from reassigning root folders ([bae5442](https://github.com/MoldyTaint/Cinephage/commit/bae5442ff0c9a36c3ebfcd90e388b056352086d7)) — by Keonramses
- Exclude unaired/TBD episodes from episode counts ([189520c](https://github.com/MoldyTaint/Cinephage/commit/189520cd75cf0b6a6b30744b1a152bb6748d7a7b)) — by MoldyTaint
- Improve homepage responsive grid layout for mobile ([4b60e6e](https://github.com/MoldyTaint/Cinephage/commit/4b60e6e72a197f1dc660d6bece604d92591cb591)) — by MoldyTaint
- Resolve Rutracker double-slash URL issue causing grab failures ([c9f6963](https://github.com/MoldyTaint/Cinephage/commit/c9f6963022772225607781ea167e0b5f05da98d1)) — by MoldyTaint
- Improve russian tracker search and pointer download metadata ([e403675](https://github.com/MoldyTaint/Cinephage/commit/e40367532917b1726507056bf4b671026e4c4249)) — by Keonramses
- Improve codebase quality and type safety ([170c152](https://github.com/MoldyTaint/Cinephage/commit/170c1528f44b09feb6103a08b7258ab0a5faa2c7)) — by MoldyTaint
- Restore original test file for MonitoringSearchService ([e1abd50](https://github.com/MoldyTaint/Cinephage/commit/e1abd5056c0ed5a7a0ad64d4cadf9c9d938b4865)) — by MoldyTaint
- Align Cinephage streaming auth and server address settings ([9d06186](https://github.com/MoldyTaint/Cinephage/commit/9d06186f6f9da59b11cfc2dcdc659d27f0237bc5)) — by MoldyTaint
- Tighten tracker search title matching and localized fallback ([63c0e90](https://github.com/MoldyTaint/Cinephage/commit/63c0e90371d27ac6230298f9edf264c130fa9917)) — by MoldyTaint
- Normalize dolby vision naming output ([d5d077e](https://github.com/MoldyTaint/Cinephage/commit/d5d077e4a046e4fdfdc3603c7108eb2309f67fbc)) — by MoldyTaint
- Make rate-limit cleanup test-safe ([9a7db72](https://github.com/MoldyTaint/Cinephage/commit/9a7db7255a2d9efd98a46e1799b3066e42be80b7)) — by MoldyTaint
- Sanitize streaming indexer settings and tighten dashboard typing ([e262955](https://github.com/MoldyTaint/Cinephage/commit/e2629556aabee8b4b110fc5fb3b071cb25ca864f)) — by MoldyTaint
- Preserve native titles in tracker search requests ([6a9738c](https://github.com/MoldyTaint/Cinephage/commit/6a9738c30191f974ce8fd3802f0453e69b4a0c8f)) — by Keonramses
- Authenticate release attestation and configure git tag identity ([cbb5cfc](https://github.com/MoldyTaint/Cinephage/commit/cbb5cfcef5bc600a8c6953d204659fab23721cfc)) — by Keonramses
- Align log export validation and test setup ([cb2879f](https://github.com/MoldyTaint/Cinephage/commit/cb2879f9c8e0f847487e081b54906c15225c4a9a)) — by MoldyTaint
- Update relative imports in relocated providers.live.test.ts ([17f7f1a](https://github.com/MoldyTaint/Cinephage/commit/17f7f1afac26c601a5caae6e6505cb9f4a54e71c)) — by MoldyTaint
- Fallback to built-in scoring formats when custom_formats table is unavailable ([0558005](https://github.com/MoldyTaint/Cinephage/commit/0558005e96231cb7f72c4768d0ba33d435445586)) — by Keonramses
- Resolve typecheck errors in refactored test files ([14673ef](https://github.com/MoldyTaint/Cinephage/commit/14673efa231caf9320ced6ebff882bec1681e39c)) — by MoldyTaint
- Increase timeout for scrypt-based password hashing tests on CI ([e9d5b27](https://github.com/MoldyTaint/Cinephage/commit/e9d5b2720129484786fc50bec70eb3548e1e470f)) — by MoldyTaint
- Pin action SHAs, add concurrency group, normalize action versions ([beb45d4](https://github.com/MoldyTaint/Cinephage/commit/beb45d4bb10151ffe956fa27d18aa34d8d4e766f)) — by MoldyTaint
- Batch security dependency updates to resolve 30 Dependabot alerts ([ce39a96](https://github.com/MoldyTaint/Cinephage/commit/ce39a967ff8ace6438a3f5422c75407096722ea7)) — by MoldyTaint
- Move dotenv to dependencies and remove broken docs-deploy workflow ([8fe119f](https://github.com/MoldyTaint/Cinephage/commit/8fe119f565316859e96db452009668815ada54d8)) — by MoldyTaint
- Move better-sqlite3 to dependencies for proper adapter-node externalization ([625b16e](https://github.com/MoldyTaint/Cinephage/commit/625b16ee0558c8b6d848e48f8eb44f8eefbcdb46)) — by MoldyTaint
- Use gh cli instead of curl for GHCR package auto-detection ([1928f92](https://github.com/MoldyTaint/Cinephage/commit/1928f92b4a2aba946a78b4e0dda7f5aa1490c5ef)) — by MoldyTaint
- Use docker buildx imagetools to auto-detect CI candidate tag ([de33a07](https://github.com/MoldyTaint/Cinephage/commit/de33a073d5736a65aae13de8215d313e0f98bed5)) — by MoldyTaint
- Align release notes labels with actual repo label names ([f5d7231](https://github.com/MoldyTaint/Cinephage/commit/f5d7231c40e86a3e8c710176bcd3d62f78fd0fa6)) — by MoldyTaint
- Quote labels with colons in release notes config ([cff1b42](https://github.com/MoldyTaint/Cinephage/commit/cff1b4219a423c888fbe14d05b9f46f778c9884c)) — by MoldyTaint

### Refactoring

- Complete indexer system overhaul with unified YAML architecture ([2d5b16d](https://github.com/MoldyTaint/Cinephage/commit/2d5b16d6219e2bbbd8845152dbc2e7c50afd58f6)) — by root
- Consolidate subtitle scheduling into MonitoringScheduler ([bcaf612](https://github.com/MoldyTaint/Cinephage/commit/bcaf612054431f42e705ad1e06da566e154b1eab)) — by root
- Standardize services and extract shared logic ([7268281](https://github.com/MoldyTaint/Cinephage/commit/72682815d6b01f6b129683783d8b04df7aca18f9)) — by root
- Decompose large components and add reusable utilities ([1578fea](https://github.com/MoldyTaint/Cinephage/commit/1578fea814bd7a3c1f9373364c9061d53ffb4044)) — by root
- Standardize modal patterns across codebase ([1d7b261](https://github.com/MoldyTaint/Cinephage/commit/1d7b26143e85b3184b52bad829377146fe58a1e4)) — by root
- Overhaul scoring system with format-based architecture ([ee1c1fb](https://github.com/MoldyTaint/Cinephage/commit/ee1c1fb320ad92cf7a15e20350121dfec79bc900)) — by root
- Overhaul GitHub labels with unified prefix system ([7a5a968](https://github.com/MoldyTaint/Cinephage/commit/7a5a968f72769a818fbec4c4ec8d2816d0284dd9)) — by root
- Delegate MonitoringSearchService grab to ReleaseGrabService ([3ecd8d4](https://github.com/MoldyTaint/Cinephage/commit/3ecd8d429863ff1dbd87ad3fe5bb0cb8afb71a08)) — by root
- Improve streaming providers and merge all successful streams ([0c45503](https://github.com/MoldyTaint/Cinephage/commit/0c45503102ae6f49228eb203b27b6d83308f0d7a)) — by root
- Clean up streaming providers and test infrastructure ([3c794ad](https://github.com/MoldyTaint/Cinephage/commit/3c794ad0b9a22e55fcb1b8d5721c8886fc4573ab)) — by root
- Improve Cloudflare error handling and cleanup status tracking ([d7e7384](https://github.com/MoldyTaint/Cinephage/commit/d7e738494258bfad0c5aed047c4bdf86192db699)) — by root
- Consolidate UnifiedClientItem into shared type ([0623f71](https://github.com/MoldyTaint/Cinephage/commit/0623f716b4865e57fbb161302af07c53e6d2cd0a)) — by root
- Update indexers, quality system, and services ([29d74c4](https://github.com/MoldyTaint/Cinephage/commit/29d74c4f0f5856275ae34766ec20b07dee79410a)) — by root
- Modularize download client and library modals ([06fd48c](https://github.com/MoldyTaint/Cinephage/commit/06fd48c966522ec70b354b0d1433258e20503adf)) — by root
- Simplify Stalker streaming architecture ([141c9e7](https://github.com/MoldyTaint/Cinephage/commit/141c9e792e50ae5e869c0b28eb72adb630a369aa)) — by root
- Remove Prowlarr/Jackett (Torznab) integration ([d4fec53](https://github.com/MoldyTaint/Cinephage/commit/d4fec53b03c00fab0f7c7df88efc26991d7294b6)) — by root
- Rewrite streaming infrastructure and add EPG source override ([44c1d0e](https://github.com/MoldyTaint/Cinephage/commit/44c1d0e2cd97b7d2073090a20c49eeed3f718a79)) — by root
- Clean up channel edit modal layout ([0e40c0c](https://github.com/MoldyTaint/Cinephage/commit/0e40c0c94ac1123de08657ecfe1c82dd7df69d1c)) — by root
- Simplify Docker setup and consolidate environment config ([feb611c](https://github.com/MoldyTaint/Cinephage/commit/feb611c859820f2ffe4ea8fd10604e8a21ac18b1)) — by root
- Centralize protocol-specific release filtering through handlers ([247156a](https://github.com/MoldyTaint/Cinephage/commit/247156a49bb3743b8ff2805afa742708cc0f2da0)) — by root
- Unify modals and responsive layouts ([7b32bfa](https://github.com/MoldyTaint/Cinephage/commit/7b32bfaa371b1844a7660528672c08d5e2dc2020)) — by root
- Standardize responsive grids ([63ff7e1](https://github.com/MoldyTaint/Cinephage/commit/63ff7e16120594f275a2e6884383dfdc8f760020)) — by root
- Remove deprecated RAR extraction feature ([42bd7fb](https://github.com/MoldyTaint/Cinephage/commit/42bd7fb5a21b1ab73143b8d7cd1678051f9465e6)) — by MoldyTaint
- Remove unused POST handler and add 70s timeout ([1b8461b](https://github.com/MoldyTaint/Cinephage/commit/1b8461b76cdbb23455458a0c53a0d40bef1890e4)) — by MoldyTaint
- Streamline Camoufox installation process in docker-entrypoint.sh ([e1b4d01](https://github.com/MoldyTaint/Cinephage/commit/e1b4d019883783b0bc89ade3f1cdc46bd03904ac)) — by Keonramses
- Clean up code formatting in subtitle path scripts ([0cce963](https://github.com/MoldyTaint/Cinephage/commit/0cce9633d5cd152baa579ec56934f70797a0d900)) — by Keonramses
- Remove unused type definitions and clean up console logging ([0718a8e](https://github.com/MoldyTaint/Cinephage/commit/0718a8eb2b9904303573fbf98a1d6f093cb326c6)) — by Keonramses
- Consolidate Live TV components and add channel sync worker ([1e05753](https://github.com/MoldyTaint/Cinephage/commit/1e057538b6c1139d6cd0328f7f1848903bfd10b2)) — by MoldyTaint
- Simplify IptvOrgSelector with native multi-select ([0f0aa72](https://github.com/MoldyTaint/Cinephage/commit/0f0aa72b5bca1a68973ae6853f296c3a49dc0a89)) — by MoldyTaint
- Major refactoring of unmatched files system ([276dc9c](https://github.com/MoldyTaint/Cinephage/commit/276dc9cf8836adb7c6da3d04807f8778b2684c90)) — by MoldyTaint
- Extract LiveTV stream handler to shared service module ([ba838bf](https://github.com/MoldyTaint/Cinephage/commit/ba838bfa9bec59437f7cb2b957c96fc2cdad8767)) — by MoldyTaint
- Remove dead streaming code from MonitoringSearchService ([b4b35a3](https://github.com/MoldyTaint/Cinephage/commit/b4b35a3a0bb9b51ba482c27213b409e2fed4d161)) — by MoldyTaint
- Extract dashboard queries and add progressive rendering ([b26ab99](https://github.com/MoldyTaint/Cinephage/commit/b26ab9978b605f9b188289e71e05c364432e70b3)) — by MoldyTaint
- Simplify stable and preview channels ([152ba86](https://github.com/MoldyTaint/Cinephage/commit/152ba86a6f9c7eb9fb8bd0b48bf12795b9e1c122)) — by MoldyTaint
- Align Cinephage integration and release sync ([7588d5f](https://github.com/MoldyTaint/Cinephage/commit/7588d5f2f94f49dfc70ae70cbce741dcf22bb4e3)) — by MoldyTaint
- Align dashboard activity with history feed ([9d7026c](https://github.com/MoldyTaint/Cinephage/commit/9d7026cd3adf1b37508636b576649544a542f3d7)) — by MoldyTaint
- Unify SSE streams and remove legacy plumbing ([d5dead7](https://github.com/MoldyTaint/Cinephage/commit/d5dead7266282d0d2746af4bf900e73b93381b2a)) — by MoldyTaint
- Unify logging system with structured log capture ([882d8aa](https://github.com/MoldyTaint/Cinephage/commit/882d8aa56e4498ad0c0133ba6c74b5b8c4c44877)) — by MoldyTaint
- Replace ThrottleManager with DB-backed provider throttling ([a3949b1](https://github.com/MoldyTaint/Cinephage/commit/a3949b1f8419cc9e6f5a1b7e3fb6432d1c900aa1)) — by MoldyTaint
- Consolidate NZB-Mount functionality into SABnzbd client and update related components ([2a36e04](https://github.com/MoldyTaint/Cinephage/commit/2a36e0442b0fd393ae36b2a1b4a9b0e6448bca66)) — by Keonramses
- Remove NZB-Mount references and consolidate to SABnzbd functionality ([c34f055](https://github.com/MoldyTaint/Cinephage/commit/c34f05511e6e02c9c964a8862c1ebe6f3dc7fa15)) — by Keonramses
- Migrate 33 API routes to use parseBody() helpers ([8a75987](https://github.com/MoldyTaint/Cinephage/commit/8a7598750a213c210f2576d57f3babfee93c3c2e)) — by MoldyTaint
- Remove unused import from Live TV portals API ([9b93335](https://github.com/MoldyTaint/Cinephage/commit/9b93335cb6e0e06d8849bafff354c2c6854f6e8a)) — by Keonramses
- Consolidate duplicate formatting utilities into format.ts ([bae137e](https://github.com/MoldyTaint/Cinephage/commit/bae137efee46f1f02c680a80cf6da0cac14fda01)) — by MoldyTaint
- Optimize MonitoringSearchService file lookups with eager loading ([2b7ae64](https://github.com/MoldyTaint/Cinephage/commit/2b7ae6413f1efcaad4454fac6f32899f35c7f0ba)) — by MoldyTaint
- Replace 'as any' with typed fixtures in searchorchestrator tests ([c01867b](https://github.com/MoldyTaint/Cinephage/commit/c01867ba3610c0dce67f418c9f4b535b2816f1c5)) — by MoldyTaint
- Per-suite DB isolation to enable test file parallelism ([89ce9e0](https://github.com/MoldyTaint/Cinephage/commit/89ce9e020f6e23c6618f527700a09ca70cc0d66a)) — by MoldyTaint
- Reduce mock fragility in MonitoringSearchService tests ([fb371fb](https://github.com/MoldyTaint/Cinephage/commit/fb371fbd74d8caa367ee212881289d20bd27dedc)) — by MoldyTaint
- Split settings (library & storage and system) pages into horizontal nav layouts with child routes ([5513c35](https://github.com/MoldyTaint/Cinephage/commit/5513c35c73e60644486d0f17d0a5b1f4e4572cd8)) — by Keonramses
- Reduce mock fragility in searchOnAdd tests ([200ddc6](https://github.com/MoldyTaint/Cinephage/commit/200ddc6c5a4ccd361dc1da8320da2c34cd9d361e)) — by MoldyTaint
- Replace 'as any' with typed fixtures in UpgradeableSpecification tests ([8b01dd6](https://github.com/MoldyTaint/Cinephage/commit/8b01dd62e3f1ae18504b7a1f6f326c27d0a892fa)) — by MoldyTaint
- Replace 'as any' with typed fixtures in CutoffUnmetSpecification tests ([ad9c8fa](https://github.com/MoldyTaint/Cinephage/commit/ad9c8faaf72095d2ac88a7f52f3cbe5aca407b39)) — by MoldyTaint
- Remove 'as any' from rating-buffer tests ([acc7ebb](https://github.com/MoldyTaint/Cinephage/commit/acc7ebbd4e49b3feaa128d86af28a246ad8670ad)) — by MoldyTaint
- Remove 'as any' from OpenSubtitlesProvider tests ([e212a57](https://github.com/MoldyTaint/Cinephage/commit/e212a5704eb02ef50c5c3f13a77b8ff1af47dbcf)) — by MoldyTaint
- Remove 'as any' from LanguageProfileService tests ([c15051d](https://github.com/MoldyTaint/Cinephage/commit/c15051d863aed15f92bd5c8d3f41dd54c9933772)) — by MoldyTaint
- Remove 'as any' from parsers tests ([7819479](https://github.com/MoldyTaint/Cinephage/commit/7819479bec87bf819f879d03eb95a5080c9f03e1)) — by MoldyTaint
- Remove 'as any' from RenamePreviewService tests ([4760100](https://github.com/MoldyTaint/Cinephage/commit/4760100bae2f8ab63c9476a1a46daf515f792c2d)) — by MoldyTaint
- Remove 'as any' from TorrentProtocolHandler tests ([3b1b5b1](https://github.com/MoldyTaint/Cinephage/commit/3b1b5b1e74a7d7fcb5a57504e3458ce1f090d1b3)) — by MoldyTaint
- Remove 'as any' from M3uProvider tests ([af1bc47](https://github.com/MoldyTaint/Cinephage/commit/af1bc47c8c1f709f5d12ab8493d010e14c725d2f)) — by MoldyTaint
- Remove 'as any' from manual-import-service tests ([3346eba](https://github.com/MoldyTaint/Cinephage/commit/3346eba7c28624526a6ffa4a28dd376efe51966a)) — by MoldyTaint
- Remove 'as any' from sse tests ([9cf22cc](https://github.com/MoldyTaint/Cinephage/commit/9cf22cc3fb5b091d8bfe21ff3a1ec0508ff53829)) — by MoldyTaint
- Remove 'as any' from RequestBuilder tests ([fe50f58](https://github.com/MoldyTaint/Cinephage/commit/fe50f584c007255db90ca4202d4ddaaaf94cb993)) — by MoldyTaint
- Remove 'as any' from MonitoringScheduler tests ([f6944fa](https://github.com/MoldyTaint/Cinephage/commit/f6944fa3eeae0959ecd474beeb613c006cae9efe)) — by MoldyTaint

### Performance

- Streamline live tests and limit Videasy fallback ([6fbd1be](https://github.com/MoldyTaint/Cinephage/commit/6fbd1becd2b4a2316dcb269e6b1e4fd369a714c6)) — by root

### Styling

- Format NZBGet client and docker files ([d55f2e5](https://github.com/MoldyTaint/Cinephage/commit/d55f2e59701ac3150febb1488848958b928f56b8)) — by root
- Format docs and components ([e3148f4](https://github.com/MoldyTaint/Cinephage/commit/e3148f4d975db76d3f1877322a7ce58f12d0b3a1)) — by root
- Format test files ([e0dadfa](https://github.com/MoldyTaint/Cinephage/commit/e0dadfad6e4c57a87f8fa100ed05bef8e043d3e3)) — by root
- Format docker-compose and production docs ([0e0b9f7](https://github.com/MoldyTaint/Cinephage/commit/0e0b9f7233b2d45894b94ff25381955ce0366171)) — by root
- Fix formatting and remove unused import ([fef3f2d](https://github.com/MoldyTaint/Cinephage/commit/fef3f2d48c3c273806481c24b5aa10b4b7438565)) — by root
- Fix formatting in extractExternalIds tests ([7e755e4](https://github.com/MoldyTaint/Cinephage/commit/7e755e48754e8cf54c54d4a9f27ed1397bae6f0e)) — by root
- Run prettier formatting ([860dc37](https://github.com/MoldyTaint/Cinephage/commit/860dc376732d5d5c3c9c2e6764b4433d31c3fbb6)) — by MoldyTaint
- Fix lint errors ([8c44784](https://github.com/MoldyTaint/Cinephage/commit/8c44784601630a632e35e85035ee51f6bc6e65b3)) — by MoldyTaint
- Improve smart list preview panel UI ([d62c72a](https://github.com/MoldyTaint/Cinephage/commit/d62c72ac3c83e31216ef9df622bed4b18f1d5969)) — by MoldyTaint
- Fix all lint errors ([b4d1958](https://github.com/MoldyTaint/Cinephage/commit/b4d1958d18ea6e6f70cc5bc62116d1b1e5e0af3b)) — by MoldyTaint
- Fix unused vars in StalkerPortalClient to pass lint ([df48e78](https://github.com/MoldyTaint/Cinephage/commit/df48e78fb0077e8f4f24114236a2e968201f452e)) — by MoldyTaint
- Use SvelteURLSearchParams instead of URLSearchParams ([9ce9714](https://github.com/MoldyTaint/Cinephage/commit/9ce9714be472a8ca860825c8217ec010ad19430e)) — by MoldyTaint
- Format merged plex integration files ([28f4311](https://github.com/MoldyTaint/Cinephage/commit/28f43114168dfc6a14a24be60be6a9b9d0eb8a4d)) — by Keonramses
- Fix Prettier formatting in OpenSubtitlesProvider test ([3834fc1](https://github.com/MoldyTaint/Cinephage/commit/3834fc1736bcd6e338592cc0bf75e7bc46bc236f)) — by Lautaro Busto

### Documentation

- Update documentation for indexer system overhaul ([6da5e8e](https://github.com/MoldyTaint/Cinephage/commit/6da5e8ee7d6aaf1f583a2d8bf817df8b6d6b7899)) — by root
- Update documentation for indexer and streaming improvements ([6520efc](https://github.com/MoldyTaint/Cinephage/commit/6520efc86dd8f2a3c10f4f311ec1386cab46d6e5)) — by root
- Document external ID matching in folder names ([f0eda27](https://github.com/MoldyTaint/Cinephage/commit/f0eda2758551cbdf3f283bb6bba614d872a31a68)) — by root
- Update indexer count to reflect 4 supported public indexers ([a940471](https://github.com/MoldyTaint/Cinephage/commit/a9404712675e55ac4a0a2c1aa2921b2c289e5095)) — by root
- Add prominent active development warnings to README ([6d3b43d](https://github.com/MoldyTaint/Cinephage/commit/6d3b43d7a50f5d830fccc091423ea87a56e36d4b)) — by root
- Remove last commit badge from README ([f1cbd76](https://github.com/MoldyTaint/Cinephage/commit/f1cbd76417f25a2361cd8658c313faa3653c000c)) — by root
- Add contributors section to README ([1845708](https://github.com/MoldyTaint/Cinephage/commit/1845708b8cf2dd06728705210e71a1641947c346)) — by root
- Add Discord server link and badge ([c40dc1b](https://github.com/MoldyTaint/Cinephage/commit/c40dc1b9f14e59b78d8a37eaa83b527eba117c51)) — by root
- Fix Discord badge server ID ([50251bb](https://github.com/MoldyTaint/Cinephage/commit/50251bb458c59c131a5edd3d6aa01a8beb7adf0e)) — by root
- Comprehensive documentation overhaul and reorganization ([453abc2](https://github.com/MoldyTaint/Cinephage/commit/453abc253a743bd6fb0b4d0b7d4db7436d5434cb)) — by root
- Overhaul README and add docker-compose.yml ([ae45544](https://github.com/MoldyTaint/Cinephage/commit/ae45544e413b551fad54d89ec37084824aaecaa3)) — by root
- Update Docker documentation for pre-built images ([9f2a663](https://github.com/MoldyTaint/Cinephage/commit/9f2a663108de0f53e71bf02d10e60db68888b70b)) — by root
- Update README to reflect current features ([ece448b](https://github.com/MoldyTaint/Cinephage/commit/ece448bbc6d8d10213e7b6b178035d71f1cc7ee7)) — by root
- Add legal notice and clarify IPTV support limitations ([00589b2](https://github.com/MoldyTaint/Cinephage/commit/00589b260ea760848193a65d58b3d2f69febb9f8)) — by root
- Clarify IPTV wording - can discover portals, still don't host ([71a60df](https://github.com/MoldyTaint/Cinephage/commit/71a60df6e13041b10ac745936151d951927ec0a4)) — by root
- Replace contrib.rocks with GitHub live contributors image ([87c8db8](https://github.com/MoldyTaint/Cinephage/commit/87c8db82f39e7c4a901bd6fa92c7bc92c266ce83)) — by MoldyTaint
- Restore contrib.rocks for contributors with avatars ([2cd78ce](https://github.com/MoldyTaint/Cinephage/commit/2cd78ce50d92ac14c8f8b66dae007b0de24f4511)) — by MoldyTaint
- Comprehensive documentation overhaul ([bbc04e0](https://github.com/MoldyTaint/Cinephage/commit/bbc04e0fbb7efaea7459ba35ffc6ea977af0d584)) — by MoldyTaint
- Enhance documentation and migration processes for Cinephage ([e5f7b1c](https://github.com/MoldyTaint/Cinephage/commit/e5f7b1c80f93b90458baa0577dbeddd48464e1ab)) — by Keonramses
- Update troubleshooting steps for Docker migration ([8f30abe](https://github.com/MoldyTaint/Cinephage/commit/8f30abe262a47873614b307c75c5684bf5ca0a13)) — by Kenneth Iwuchukwu
- Update docs/advanced/environment-variables.md ([75f0abe](https://github.com/MoldyTaint/Cinephage/commit/75f0abeae614762c797d277c110bc1faeb2955b9)) — by Kenneth Iwuchukwu
- Update media and downloads volume paths in CHANGELOG.md ([8595ff1](https://github.com/MoldyTaint/Cinephage/commit/8595ff1861975a4aef645aba86b9370c141c61fa)) — by Kenneth Iwuchukwu
- Update FAQ question for port configuration ([7ba9cad](https://github.com/MoldyTaint/Cinephage/commit/7ba9cad683733187c9a25006974265ebcc63347a)) — by Kenneth Iwuchukwu
- Enhance documentation and migration processes for Cinephage (#100) ([2b18553](https://github.com/MoldyTaint/Cinephage/commit/2b18553c5093f5bfefe3f1045c970f9b45f3c14a)) — by Kenneth Iwuchukwu
- Document schema version 70 in migration header ([ba665d2](https://github.com/MoldyTaint/Cinephage/commit/ba665d2dadd68df253638eb27209cc26081b29b8)) — by Keonramses
- Migrate to Docusaurus with comprehensive documentation ([7cbc8e5](https://github.com/MoldyTaint/Cinephage/commit/7cbc8e59af748d2c00ee0408b781b44d3a86a08f)) — by MoldyTaint
- Update BETTER_AUTH_SECRET generation instructions and add to environment variable references ([893e57c](https://github.com/MoldyTaint/Cinephage/commit/893e57ce63c829f1c00b64f2c3f0ebad88612cb3)) — by Keonramses
- Rework README with bare metal install, systemd, and updated screenshots ([b6434b7](https://github.com/MoldyTaint/Cinephage/commit/b6434b7bc20ca32d7ac35ed25a89eb573aa0ce6e)) — by MoldyTaint
- Clarify error id messaging ([240cd52](https://github.com/MoldyTaint/Cinephage/commit/240cd52a70b0dfe00e59f06a6d28f702976d61f8)) — by MoldyTaint
- Update AGENTS.md with improved test patterns and conventions ([00f9dcf](https://github.com/MoldyTaint/Cinephage/commit/00f9dcf2f989f8a062739eddee6ba39506e7255a)) — by MoldyTaint

### Testing

- Add comprehensive tests for extractExternalIds ([07ca80e](https://github.com/MoldyTaint/Cinephage/commit/07ca80e7b1111b9b080772d9304b339dbbea71db)) — by root
- Make unstable subtitle providers opt-in ([d688314](https://github.com/MoldyTaint/Cinephage/commit/d688314d1707f0f5edcef4229137e8cafd98c24f)) — by MoldyTaint
- Add verbose output and additional cutoff tests ([f95c05d](https://github.com/MoldyTaint/Cinephage/commit/f95c05dd8fa66f26783500430d9d37d39ce778e3)) — by MoldyTaint
- Update rate-limit test for language field ([c83f801](https://github.com/MoldyTaint/Cinephage/commit/c83f801c10ec1d0f1a4c4ec6ccc8a537a4e2480a)) — by MoldyTaint
- Align upgradeable spec fixtures with real format ids ([6d1fe85](https://github.com/MoldyTaint/Cinephage/commit/6d1fe85ad0f0446efd227922ea7e909e008285cf)) — by MoldyTaint
- Isolate monitoring decision scoring from runtime db ([e54db9e](https://github.com/MoldyTaint/Cinephage/commit/e54db9e62256e29b4781f400a0e244f9bdbe5209)) — by MoldyTaint
- Isolate pure scoring tests from runtime db ([cfabd4c](https://github.com/MoldyTaint/Cinephage/commit/cfabd4ccc265f78d642defd2d49c27ff8e8a9099)) — by MoldyTaint

### Miscellaneous

- Format code with prettier ([fa790c8](https://github.com/MoldyTaint/Cinephage/commit/fa790c8e26956e4dfc6ad118dfb1561ae7fa2cb5)) — by root
- Overhaul issue templates, PR template, and add community config ([12c992f](https://github.com/MoldyTaint/Cinephage/commit/12c992f4e86a3a13ee956d325b39856d6de6b14e)) — by root
- Bump the minor-and-patch group with 7 updates (#10) ([fbd3800](https://github.com/MoldyTaint/Cinephage/commit/fbd3800632df3dc9d359b85f905d69379215cba1)) — by dependabot[bot]
- Bump svelte from 5.45.5 to 5.46.0 in the svelte group (#11) ([ea0b914](https://github.com/MoldyTaint/Cinephage/commit/ea0b914128b41c5c42750d2e6d15358884060d70)) — by dependabot[bot]
- Bump the tailwind group with 3 updates (#12) ([c083ffc](https://github.com/MoldyTaint/Cinephage/commit/c083ffca32cd6c13dc782bfbb1758faa5b6c715e)) — by dependabot[bot]
- Bump drizzle-orm from 0.44.7 to 0.45.1 in the drizzle group (#13) ([07b013b](https://github.com/MoldyTaint/Cinephage/commit/07b013ba9e3a4b08e10e348534f2afad2548a0a0)) — by dependabot[bot]
- Bump @types/node from 24.10.1 to 25.0.2 (#14) ([084130d](https://github.com/MoldyTaint/Cinephage/commit/084130ddd637625910a12a09c1c4ba8f7aba3227)) — by dependabot[bot]
- Bump @eslint/compat from 1.4.1 to 2.0.0 (#15) ([a79a862](https://github.com/MoldyTaint/Cinephage/commit/a79a862b5b9d9260ccb513a7f55ed286d5df29d1)) — by dependabot[bot]
- Bump the minor-and-patch group with 3 updates (#16) ([79ee181](https://github.com/MoldyTaint/Cinephage/commit/79ee181f79e1fbe0d9885479cbad7fa3dd48733c)) — by dependabot[bot]
- Bump actions/github-script from 7 to 8 ([dcee131](https://github.com/MoldyTaint/Cinephage/commit/dcee131340c29f3a1814e3b5f51f55777b17cc86)) — by dependabot[bot]
- Bump the minor-and-patch group with 4 updates ([99745d5](https://github.com/MoldyTaint/Cinephage/commit/99745d5cc76a9f16ac65f5641a50c882f62432ff)) — by dependabot[bot]
- Consolidate test scripts and improve bug report template ([a2ee8f2](https://github.com/MoldyTaint/Cinephage/commit/a2ee8f2bec92880ef565d17ec2bdec823ab88335)) — by root
- Code quality and formatting improvements ([c96e5c6](https://github.com/MoldyTaint/Cinephage/commit/c96e5c67cfc932eea54f87b3281c5bf138b3f853)) — by root
- Bump actions/checkout from 4 to 6 ([c24cfa7](https://github.com/MoldyTaint/Cinephage/commit/c24cfa7686884cc513f7b2ddc544f1576a9775a6)) — by dependabot[bot]
- Bump actions/setup-node from 4 to 6 ([323611f](https://github.com/MoldyTaint/Cinephage/commit/323611ff85e90a6b8f6b50a084d45493a13821bc)) — by dependabot[bot]
- Bump actions/attest-build-provenance from 2 to 3 ([64a3699](https://github.com/MoldyTaint/Cinephage/commit/64a3699a64ffd5c2742bfc66b2ee6220bda10f78)) — by dependabot[bot]
- Bump lucide-svelte in the minor-and-patch group ([b3edc72](https://github.com/MoldyTaint/Cinephage/commit/b3edc7210c385b85b5afc2081abc508063e035bb)) — by dependabot[bot]
- Bump svelte-check from 4.3.4 to 4.3.5 in the svelte group ([1047ad8](https://github.com/MoldyTaint/Cinephage/commit/1047ad8e69f6927226de887e2756a9d9a26ae164)) — by dependabot[bot]
- Bump actions/checkout from 4 to 6 ([f509c66](https://github.com/MoldyTaint/Cinephage/commit/f509c662e9219ca6c3612e27e361e7ff872d9f9f)) — by dependabot[bot]
- Bump actions/attest-build-provenance from 2 to 3 ([f5465aa](https://github.com/MoldyTaint/Cinephage/commit/f5465aaf2f86526efa0794fba860a82781d98bb3)) — by dependabot[bot]
- Bump typescript-eslint in the minor-and-patch group ([1cf2b88](https://github.com/MoldyTaint/Cinephage/commit/1cf2b8820b1b672df61bd056050d08fa6127f742)) — by dependabot[bot]
- Bump svelte from 5.46.0 to 5.46.1 in the svelte group ([a153278](https://github.com/MoldyTaint/Cinephage/commit/a153278ac611be3d682cbc59e53525787c1b6586)) — by dependabot[bot]
- Add infrastructure for streaming and extraction ([db33505](https://github.com/MoldyTaint/Cinephage/commit/db33505b31e921421627ca091176359b3ca512a7)) — by root
- Bump the minor-and-patch group across 1 directory with 3 updates ([fc31c0a](https://github.com/MoldyTaint/Cinephage/commit/fc31c0aae29a14f90ec4a987e1abd49869f2ccf0)) — by dependabot[bot]
- Bump globals from 16.5.0 to 17.0.0 ([bae8778](https://github.com/MoldyTaint/Cinephage/commit/bae8778f76cf22ce52e84eb5fe9f703fbaefe363)) — by dependabot[bot]
- Bump SethCohen/github-releases-to-discord ([4dbf2c0](https://github.com/MoldyTaint/Cinephage/commit/4dbf2c0944d9a80b9cb0ae5d7705b433a424ed4b)) — by dependabot[bot]
- Bump the minor-and-patch group with 5 updates ([8eeff2a](https://github.com/MoldyTaint/Cinephage/commit/8eeff2aeac5bb4997aa9e78713d423b1e393b4a8)) — by dependabot[bot]
- Bump the svelte group with 2 updates ([f3a0ca4](https://github.com/MoldyTaint/Cinephage/commit/f3a0ca417bc254934455152d5c23f73efbca3173)) — by dependabot[bot]
- Revert package-lock.json change ([cb8b855](https://github.com/MoldyTaint/Cinephage/commit/cb8b855574d25160398dc8e487434867da6c3ac7)) — by Keonramses
- Run Prettier on download client components ([433bf9f](https://github.com/MoldyTaint/Cinephage/commit/433bf9f3c6da3fe76c204d5abb687af280e9e736)) — by Keonramses
- Sync ReleaseParser test with main ([dd2b064](https://github.com/MoldyTaint/Cinephage/commit/dd2b0641952582ff9d669129033ba6894520df28)) — by Keonramses
- Bump undici from 7.16.0 to 7.18.2 ([0906019](https://github.com/MoldyTaint/Cinephage/commit/0906019b94e22651b20185aa39badf30b6c9b629)) — by dependabot[bot]
- Remove .opencode directory ([2dc31fb](https://github.com/MoldyTaint/Cinephage/commit/2dc31fb356fd1de97225f7b25a287914fafe6bb1)) — by MoldyTaint
- Remove obsolete 1337x indexer references ([f8aec67](https://github.com/MoldyTaint/Cinephage/commit/f8aec671686b6c094ea32466d7335b44405a1a81)) — by MoldyTaint
- Remove 1337x test scripts and update indexer tests ([a46c886](https://github.com/MoldyTaint/Cinephage/commit/a46c886dd85016e9e9a83423b3b78d221c5c3987)) — by MoldyTaint
- Fix security vulnerabilities in devalue ([5283210](https://github.com/MoldyTaint/Cinephage/commit/528321016dd86263c8499b3ffcd9e534f10dec62)) — by MoldyTaint
- Remove test-issue-72-integration.ts script ([62781b6](https://github.com/MoldyTaint/Cinephage/commit/62781b6f73870f3c8e0635f3d5dfae552ee2adcf)) — by MoldyTaint
- Apply dependabot updates ([7a4ed39](https://github.com/MoldyTaint/Cinephage/commit/7a4ed393ce76ea9ec9489679f2505e0a13845f71)) — by MoldyTaint
- Bump @types/node ([860d314](https://github.com/MoldyTaint/Cinephage/commit/860d314d80e491a26040d26997f730c03b8975bc)) — by MoldyTaint
- Bump softprops/action-gh-release from 1 to 2 (#92) ([bcec97a](https://github.com/MoldyTaint/Cinephage/commit/bcec97a645f87aaed818d125eb08b9ceb61509cf)) — by dependabot[bot]
- Bump the svelte group with 3 updates (#94) ([503dc72](https://github.com/MoldyTaint/Cinephage/commit/503dc7280d7cc7346245333dc713cc066bdaa681)) — by dependabot[bot]
- Bump the minor-and-patch group with 8 updates ([3495dac](https://github.com/MoldyTaint/Cinephage/commit/3495dac430e288ce5b6e66ec292aeb4e331bfdc9)) — by dependabot[bot]
- Bump fast-xml-parser from 5.3.3 to 5.3.4 (#99) ([0638a6c](https://github.com/MoldyTaint/Cinephage/commit/0638a6cae70f9d602e45a8034d0435aab96f2eba)) — by dependabot[bot]
- Bump daisyui from 5.5.14 to 5.5.16 in the tailwind group (#103) ([18737c8](https://github.com/MoldyTaint/Cinephage/commit/18737c8ee439928fe28e70e185e07ab8f058943a)) — by dependabot[bot]
- Bump the svelte group with 2 updates (#102) ([622743e](https://github.com/MoldyTaint/Cinephage/commit/622743ee3bb3b0034b58e7b25e12e69077a888b1)) — by dependabot[bot]
- Bump the minor-and-patch group with 4 updates (#101) ([4a9e3fd](https://github.com/MoldyTaint/Cinephage/commit/4a9e3fdd349c96c561510d5f472a9722917ce8a3)) — by dependabot[bot]
- Bump @types/node ([b32d238](https://github.com/MoldyTaint/Cinephage/commit/b32d238a139bf3b4ef24c2544d22b42f64df5c76)) — by dependabot[bot]
- Bump the minor-and-patch group with 4 updates (#120) ([a4df28b](https://github.com/MoldyTaint/Cinephage/commit/a4df28b69271d3e2514015a6b394d22a7866c091)) — by dependabot[bot]
- Bump the svelte group with 2 updates (#121) ([eef3e63](https://github.com/MoldyTaint/Cinephage/commit/eef3e63b721bca69f51a8026e2cc25e86822b1f7)) — by dependabot[bot]
- Bump daisyui from 5.5.16 to 5.5.18 in the tailwind group (#122) ([733d28b](https://github.com/MoldyTaint/Cinephage/commit/733d28b27db15dd3dec6116f838b7f56ccee8c08)) — by dependabot[bot]
- Upgrade eslint to v10 ([1cb3cb1](https://github.com/MoldyTaint/Cinephage/commit/1cb3cb171b5a25dbe0ce96f76583248c41764723)) — by MoldyTaint
- Bump the minor-and-patch group with 6 updates (#131) ([e49605f](https://github.com/MoldyTaint/Cinephage/commit/e49605febb0697c086f83c975507e5d98bdc034e)) — by dependabot[bot]
- Bump the svelte group with 5 updates (#132) ([0d08e81](https://github.com/MoldyTaint/Cinephage/commit/0d08e81ad523ada2d3c38a64577df919f2ca24f3)) — by dependabot[bot]
- Bump the svelte group with 3 updates (#148) ([b60f327](https://github.com/MoldyTaint/Cinephage/commit/b60f32779bccb56bf10819ac111c10a9d5f78859)) — by dependabot[bot]
- Bump the tailwind group with 3 updates (#149) ([0704209](https://github.com/MoldyTaint/Cinephage/commit/07042092ab661b894a518169b796ded1d07d0dcd)) — by dependabot[bot]
- Bump the minor-and-patch group with 8 updates (#147) ([c434569](https://github.com/MoldyTaint/Cinephage/commit/c43456925e5d9bff3606318eed9c25f1d0196de2)) — by dependabot[bot]
- Bump devalue from 5.6.2 to 5.6.3 (#143) ([5916f5c](https://github.com/MoldyTaint/Cinephage/commit/5916f5cc1e78a6451b54bc363a801b42e3fe2617)) — by dependabot[bot]
- Bump eslint from 9.39.2 to 10.0.1 (#150) ([4c9a5d9](https://github.com/MoldyTaint/Cinephage/commit/4c9a5d9c19ae85617ebcd4046b69a5bb2d32e40b)) — by dependabot[bot]
- Pin GitHub Actions to commit SHAs ([0e9636a](https://github.com/MoldyTaint/Cinephage/commit/0e9636a53d312008be598493ca7c294c7894517a)) — by MoldyTaint
- Bump svelte from 5.53.2 to 5.53.5 ([f15235b](https://github.com/MoldyTaint/Cinephage/commit/f15235b0c6b1da96fd51814c6287edba65cafc1c)) — by dependabot[bot]
- Bump fast-xml-parser from 5.3.7 to 5.3.8 ([79bf886](https://github.com/MoldyTaint/Cinephage/commit/79bf8864549441bfd51f56050a4102631e3f08a7)) — by dependabot[bot]
- Bump rollup from 4.53.5 to 4.59.0 ([bcb7c77](https://github.com/MoldyTaint/Cinephage/commit/bcb7c77bfc08fcb9f14e3e2dab6b51ed369e9561)) — by dependabot[bot]
- Bump minimatch from 9.0.6 to 9.0.9 ([87d5490](https://github.com/MoldyTaint/Cinephage/commit/87d5490bf7047c5e80e0bc5bb0b61ea6c4d59eba)) — by dependabot[bot]
- Bump docker/metadata-action from 5.5.1 to 5.10.0 (#171) ([bf7374f](https://github.com/MoldyTaint/Cinephage/commit/bf7374f5fc7e9eed0874d6e6ade42ebdc8530abf)) — by dependabot[bot]
- Bump docker/login-action from 3.3.0 to 3.7.0 (#174) ([4da4de3](https://github.com/MoldyTaint/Cinephage/commit/4da4de3d676842d1eaf4ba5d7d818f3d744652b4)) — by dependabot[bot]
- Bump the minor-and-patch group with 6 updates (#176) ([84dbee4](https://github.com/MoldyTaint/Cinephage/commit/84dbee46279ceb5171c7deaff87ebb4c4d2cb6c8)) — by dependabot[bot]
- Bump the tailwind group with 2 updates (#178) ([be84981](https://github.com/MoldyTaint/Cinephage/commit/be84981651553a60afc52d5fd670543b6af01673)) — by dependabot[bot]
- Bump docker/setup-buildx-action from 3.7.1 to 3.12.0 (#172) ([bfeb2cc](https://github.com/MoldyTaint/Cinephage/commit/bfeb2cca454b27efbaae00c8a64046636bfd58ab)) — by dependabot[bot]
- Bump actions/attest-build-provenance (#173) ([ca4914c](https://github.com/MoldyTaint/Cinephage/commit/ca4914cb46b35511c20343887736890413449352)) — by dependabot[bot]
- Bump the svelte group with 4 updates (#177) ([023f181](https://github.com/MoldyTaint/Cinephage/commit/023f18199a47bab2c75b92e0732da73165ff328f)) — by dependabot[bot]
- Bump docker/build-push-action from 6.9.0 to 6.19.2 (#175) ([b4897f8](https://github.com/MoldyTaint/Cinephage/commit/b4897f802eb08751452b7b7e145d7eb9cb7721d9)) — by dependabot[bot]
- Bump vite from 7.3.1 to 8.0.3 ([9d10c90](https://github.com/MoldyTaint/Cinephage/commit/9d10c90bbaaf16e769980d96558aff8b9cd5f611)) — by dependabot[bot]
- Bump typescript from 5.9.3 to 6.0.2 ([b983706](https://github.com/MoldyTaint/Cinephage/commit/b983706c2e3cddefb5f1a8b792acfd2113f2c634)) — by dependabot[bot]
- Bump drizzle-orm from 0.45.1 to 0.45.2 in the drizzle group ([030f6f3](https://github.com/MoldyTaint/Cinephage/commit/030f6f3ea1c3b835d67ec2440e2abc027059e115)) — by dependabot[bot]
- Bump the tailwind group with 2 updates ([9069b55](https://github.com/MoldyTaint/Cinephage/commit/9069b55125f4ffedb4b0a0697ed8135cc612f834)) — by dependabot[bot]
- Update package-lock.json after dependabot merges ([4afb235](https://github.com/MoldyTaint/Cinephage/commit/4afb23552436287465b5b86ed66c1d81e91083b1)) — by MoldyTaint
- Remove obsolete troubleshooting scripts ([b2c939d](https://github.com/MoldyTaint/Cinephage/commit/b2c939dca3d2f66597c75f127c89c61f3a8b1898)) — by MoldyTaint
- Remove deprecated Cloudflare streaming fix and results documentation ([6587a3a](https://github.com/MoldyTaint/Cinephage/commit/6587a3a9b70548a5e22bfb5f3c10f731b4c46c73)) — by Keonramses
- Remove documentation (moved to separate repo) ([f5b3c18](https://github.com/MoldyTaint/Cinephage/commit/f5b3c1837c3b781353102b6d73d25e71b6b038b6)) — by MoldyTaint
- Bump flatted from 3.3.3 to 3.4.2 ([85a2d37](https://github.com/MoldyTaint/Cinephage/commit/85a2d37a0138a8716c6bbb55ee9c83f3a95fae90)) — by MoldyTaint
- Bump devalue from 5.6.3 to 5.6.4 ([c5d8411](https://github.com/MoldyTaint/Cinephage/commit/c5d8411ac69f1b82558960b673a29f5a3cd3366b)) — by MoldyTaint
- Bump fast-xml-parser from 5.4.1 to 5.5.7 ([3f7cb4b](https://github.com/MoldyTaint/Cinephage/commit/3f7cb4bdfdb24df6bd6dc78cabbc69c4006ef12b)) — by MoldyTaint
- Bump minor-and-patch group (better-sqlite3, camoufox-js, eslint, lucide-svelte, and 7 more) ([4cbf72e](https://github.com/MoldyTaint/Cinephage/commit/4cbf72e4163b63fdde9cdbd2951f3c4867011354)) — by MoldyTaint
- Bump tailwind group (@tailwindcss/vite 4.2.2, tailwindcss 4.2.2) ([209adc5](https://github.com/MoldyTaint/Cinephage/commit/209adc5eb67103991e4970a3cf162362867a7848)) — by MoldyTaint
- Bump svelte group (@sveltejs/kit 2.55.0, svelte 5.53.12, svelte-check 4.4.5) ([ce8accc](https://github.com/MoldyTaint/Cinephage/commit/ce8accc929ed4a107bf836455da2e4f7471a803a)) — by MoldyTaint
- Bump actions/setup-node from 6.2.0 to 6.3.0 ([8d8e52e](https://github.com/MoldyTaint/Cinephage/commit/8d8e52efd63b6ac9a939bb680d219dcffd5d737f)) — by MoldyTaint
- Bump docker/login-action from v3 to v4 ([f0db9a2](https://github.com/MoldyTaint/Cinephage/commit/f0db9a2f5c16e762930a8c1b12ec68e1a731c44d)) — by MoldyTaint
- Bump docker/metadata-action from v5 to v6 ([add62ec](https://github.com/MoldyTaint/Cinephage/commit/add62ec5672e3985da55885de19d990ad91dcca6)) — by MoldyTaint
- Bump docker/build-push-action from v6 to v7 ([2b2b041](https://github.com/MoldyTaint/Cinephage/commit/2b2b0414ec7d30fca015bb72130568dd2b0363c1)) — by MoldyTaint
- Bump actions/attest-build-provenance from v3 to v4.1.0 ([6135e2c](https://github.com/MoldyTaint/Cinephage/commit/6135e2c332589903fbed773f0124b6a0bfd18715)) — by MoldyTaint
- Update ignore files for i18n and test utilities ([341ebf7](https://github.com/MoldyTaint/Cinephage/commit/341ebf7cba5120d479a6359c5c8d915b54ea74aa)) — by MoldyTaint
- Remove dead code and documentation ([90d095a](https://github.com/MoldyTaint/Cinephage/commit/90d095abc3a3a09510a74e65b842d3e84bdf28ea)) — by MoldyTaint
- Bump lucide-svelte from 0.575.0 to 1.0.1 ([70b2e53](https://github.com/MoldyTaint/Cinephage/commit/70b2e537b259b8ee68ef9a85b44754787c885c17)) — by dependabot[bot]
- Bump the svelte group with 4 updates ([0f58c11](https://github.com/MoldyTaint/Cinephage/commit/0f58c1193a10c714a9c2a914b6d1b6fa3fefa5da)) — by dependabot[bot]
- Bump the minor-and-patch group with 16 updates ([6caaacc](https://github.com/MoldyTaint/Cinephage/commit/6caaacc8ffd3210c00eca886d6b779472fcb2a4e)) — by dependabot[bot]
- Bump docker/setup-buildx-action from 3.12.0 to 4.0.0 ([75091ae](https://github.com/MoldyTaint/Cinephage/commit/75091ae7810fbcc10a5f523ebfbc3ab5c84d2c21)) — by dependabot[bot]
- Bump brace-expansion from 5.0.3 to 5.0.5 ([f24bc6d](https://github.com/MoldyTaint/Cinephage/commit/f24bc6d05fadc60474f28fb0b0204a6801c959de)) — by dependabot[bot]
- Bump picomatch from 4.0.3 to 4.0.4 ([a965a10](https://github.com/MoldyTaint/Cinephage/commit/a965a1030a7011bd31d6e67bb1706e28ee50740a)) — by dependabot[bot]
- Bump undici from 7.19.1 to 7.24.6 ([fa78ab9](https://github.com/MoldyTaint/Cinephage/commit/fa78ab9400388d6bb7d3e810ac8d7db748196b01)) — by dependabot[bot]
- Trigger CI ([50cc375](https://github.com/MoldyTaint/Cinephage/commit/50cc3758f2d601957044d6ab7a058df83a6f329d)) — by Lautaro Busto
- Update package.json versions to match merged PRs ([c77d488](https://github.com/MoldyTaint/Cinephage/commit/c77d48848f0577bf73b9dbbf2800b5b8a3e6b98f)) — by MoldyTaint
- Rename main container channel from edge to main and decouple release provenance ([9e0a025](https://github.com/MoldyTaint/Cinephage/commit/9e0a025f7a8af1945118c8699571342b3d09426d)) — by Keonramses
- Improve GitHub release note categorization ([86a67a7](https://github.com/MoldyTaint/Cinephage/commit/86a67a770105430cc5cd650359195e7f2850a41d)) — by Keonramses
- Remove dead test files (demo.spec.ts, page.svelte.spec.ts) ([e09c82b](https://github.com/MoldyTaint/Cinephage/commit/e09c82b5160a3bd1d4e4df43dc0d4a64139cae37)) — by MoldyTaint
- Isolate live network tests behind LIVE_TESTS env flag ([38add03](https://github.com/MoldyTaint/Cinephage/commit/38add03bec1f44b4bdc87c2c13c19b667737a249)) — by MoldyTaint
- Bump the minor-and-patch group across 1 directory with 3 updates ([cbc946c](https://github.com/MoldyTaint/Cinephage/commit/cbc946cd4f86ed893dfcd8e22705d198c0ca2efd)) — by dependabot[bot]
- Bump docker/login-action from 3.7.0 to 4.1.0 ([aae24bb](https://github.com/MoldyTaint/Cinephage/commit/aae24bbbb74a8973a6d3bdc82793758aaf156c57)) — by dependabot[bot]
- Bump docker/build-push-action from 6.19.2 to 7.1.0 ([4359200](https://github.com/MoldyTaint/Cinephage/commit/4359200c92a8b1a8aa2dabeadf8ba94e78ca1614)) — by dependabot[bot]
- Remove release workflow ([c16331a](https://github.com/MoldyTaint/Cinephage/commit/c16331a0d7c57815c2c8a17d9486dbbead941834)) — by MoldyTaint

### Bot

- Update nix dependencies ([3f5096e](https://github.com/MoldyTaint/Cinephage/commit/3f5096e8aa658e4a607b1b2c8c91cbb11645e4c7)) — by github-actions[bot]

### Nix

- Make user and group actually dynamic ([c21e3bf](https://github.com/MoldyTaint/Cinephage/commit/c21e3bfc230b4a7318021ff67341261cfeae9c25)) — by Tilman Baumann

### Ci

- Add concurrency control to Docker Build workflow ([6d2e128](https://github.com/MoldyTaint/Cinephage/commit/6d2e128fdc38a0539a0559c1bbd35edf105d2788)) — by root
- Add Discord release announcement workflow ([8d20eba](https://github.com/MoldyTaint/Cinephage/commit/8d20eba04a9ae143298fd2317327c0e45aa3ff91)) — by root
- Replace nix-update workflow with update-flake-lock action ([9ea17a0](https://github.com/MoldyTaint/Cinephage/commit/9ea17a00b2ed37fbae1836069230171feaaad391)) — by MoldyTaint
- Remove old nix-update workflow ([a1f540c](https://github.com/MoldyTaint/Cinephage/commit/a1f540c8a029d75aa7ed46c317ff7be130958416)) — by MoldyTaint
- Centralize Docker build metadata, improve tagging, and add changelog categorization (#181) ([4ee8ee7](https://github.com/MoldyTaint/Cinephage/commit/4ee8ee7628331a777e5cb3668478a1ec4ef7a77f)) — by Kenneth Iwuchukwu
- Update release workflows for main/dev/experimental channels ([9998987](https://github.com/MoldyTaint/Cinephage/commit/99989876bd78c8fb9f4f4ecab8e8aa8e5a5bcb7e)) — by MoldyTaint
- Add coverage reporting and artifact upload to CI pipeline ([83166cc](https://github.com/MoldyTaint/Cinephage/commit/83166cc4ec682eed4b9122afe8d7963969087023)) — by MoldyTaint

### Security

- Add authentication check to STRM update endpoint ([88ec76a](https://github.com/MoldyTaint/Cinephage/commit/88ec76a196e65080b14b98859eb8f43aa1c0f06c)) — by MoldyTaint

<!-- Generated by git-cliff -->
