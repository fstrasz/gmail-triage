# Gmail Triage — Known Issues
<!-- version: 1.0 | updated: 2026-04-04 -->

## Open

| # | Severity | Area | Description | Found |
|---|----------|------|-------------|-------|
| 1 | High | Security | 9x CodeQL: incomplete HTML attribute sanitization (js/incomplete-html-attribute-sanitization) — medium CodeQL severity | 2026-03-17 |
| 2 | High | Security | 3x CodeQL: polynomial ReDoS on uncontrolled data (js/polynomial-redos) | 2026-03-17 |
| 3 | High | Security | 1x CodeQL: reflected XSS (js/reflected-xss) | 2026-03-17 |
| 4 | Medium | Security | 1x CodeQL: SSRF (js/request-forgery) — alert #17, pending dismissal or fix | 2026-03-17 |
| 5 | Low | Deploy | Uncommitted changes in gmail.js, html.js, triage.js, unsub.js not yet pushed to GitHub | 2026-04-04 |

## Fixed

| # | Severity | Area | Description | Fixed | Resolution |
|---|----------|------|-------------|-------|------------|
| F1 | Critical | Security | 2x SSRF (js/request-forgery) — CodeQL taint through fetch() | 2026-03-17 | Refactored SSRF guard to break taint chain; alert #16 dismissed |
| F2 | High | Data | List entries duplicating on add (VIP, OK) | 2026-03-17 | Deduplicate by email only in addToViplist/addToOklist/loadViplist |
| F3 | High | UI | Conflict display showing duplicate labels (VIP, VIP, OK) | 2026-03-17 | getListConflicts() uses Sets |
| F4 | High | UI | Remove from list buttons not working (email+name mismatch) | 2026-03-17 | All three remove functions now filter by email only |
| F5 | Medium | Deploy | deploy.ps1 double version bump (incrementing by 2 per deploy) | 2026-03-17 | Removed redundant first bump block |

## Won't Fix

| # | Description | Reason |
|---|-------------|--------|
| W1 | SSRF alert #16 (js/request-forgery) | Dismissed — mitigated by sanitizeUrl() blocking private IPs, localhost, link-local, internal hostnames |
