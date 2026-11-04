<!-- GENERATED — demo-side-effects.ts (R7DEM.5; REQ-DWEB-7). Regenerate:
     pnpm exec vitest run packages/journeys/src/demo-side-effects.local.test.ts
     or node packages/journeys/dist/demo-side-effects.js --base <url> --out <dir>. -->

# Demo side-effect table (regenerated)

- Generated: 2026-11-04T21:45:03.034Z against https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app
- Walks: 20 (essay × {logged out, cookie} × {desktop, phone})
- Violations: 120

## Requests seen

| Request (method + path pattern) | Resource | Count | Allowlist |
|---|---|---|---|
| `GET /assets/fonts/inter-latin-wght-normal.woff2` | font | 932 | GET/HEAD — allowed |
| `GET /assets/fonts/jetbrains-mono-latin-wght-normal.woff2` | font | 230 | GET/HEAD — allowed |
| `GET /assets/fonts/literata-latin-standard-italic.woff2` | font | 591 | GET/HEAD — allowed |
| `GET /assets/fonts/literata-latin-standard-normal.woff2` | font | 912 | GET/HEAD — allowed |
| `GET /assets/spa/assets/ClientOnly-CcbOzC0Z.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/_authenticated-DauXgIxC.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/approval-settings-Dw6qEWYO.js` | script | 908 | GET/HEAD — allowed |
| `GET /assets/spa/assets/chrome-data-B-LZ5G3X.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/copy-BAloWFwY.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/demo-CCAng9KE.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/demo-beacon-YSzjXEdU.js` | script | 911 | GET/HEAD — allowed |
| `GET /assets/spa/assets/demo-tour-CG2Iy-PY.js` | script | 912 | GET/HEAD — allowed |
| `GET /assets/spa/assets/dist-C-4zyzNN.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/dist-DQsaaEhN.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/dist-Dni-QbXz.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/dossier-BpQFZZtO.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/dwell-DwTGqu-r.js` | script | 912 | GET/HEAD — allowed |
| `GET /assets/spa/assets/editor-BQn9FS1S.js` | script | 908 | GET/HEAD — allowed |
| `GET /assets/spa/assets/gate-card-CZFc-sCr.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/gate-presence-1MQg9e7R.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/hold-store-C3LEXoIG.js` | script | 908 | GET/HEAD — allowed |
| `GET /assets/spa/assets/main-DADhlSQW.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/not-found-i5RsCZif.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project-aTsMUr1j.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project.a._artifactId-ZFhLk1uB.js` | script | 767 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project.index-BejP7-io.js` | script | 48 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project.r._runId-BrPqDHB-.js` | script | 4 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project.review._runId-DlWfsq7L.js` | script | 28 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project.v._n.diff._m-D8hEBg6O.js` | script | 8 | GET/HEAD — allowed |
| `GET /assets/spa/assets/p._project.v._v-D78oUbmP.js` | script | 85 | GET/HEAD — allowed |
| `GET /assets/spa/assets/preload-helper-BgScVnTf.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/read-only-T-A619tu.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/search-DL4SZJ_y.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/states-D-YcUe38.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/useMutation-DFXo1q1a.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/useQuery-rYCj6b-5.js` | script | 940 | GET/HEAD — allowed |
| `GET /assets/spa/assets/useSelector-CP4_woLD.js` | script | 940 | GET/HEAD — allowed |
| `GET /bff/demo/asset/structure-of-political-difference/drafts/figures/figure_1_five_questions.png` | image | 19 | GET/HEAD — allowed |
| `GET /bff/demo/asset/structure-of-political-difference/drafts/figures/figure_2_ches_correlations.png` | image | 4 | GET/HEAD — allowed |
| `GET /bff/demo/asset/structure-of-political-difference/drafts/figures/figure_2_ches_correlations_v2.png` | image | 15 | GET/HEAD — allowed |
| `GET /bff/demo/asset/structure-of-political-difference/drafts/figures/figure_3_system_axis.png` | image | 19 | GET/HEAD — allowed |
| `GET /bff/demo/asset/structure-of-political-difference/drafts/figures/figure_4_public_lexicon.png` | image | 19 | GET/HEAD — allowed |
| `GET /bff/demo/asset/structure-of-political-difference/drafts/figures/figure_5_illustrative_profiles.png` | image | 19 | GET/HEAD — allowed |
| `GET /bff/demo/feed-labels` | fetch | 940 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>` | fetch | 48 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--drafting--v1--03-claim-ledger.md` | fetch | 11 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--ledgers--v1-response-ledger.md` | fetch | 24 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--ledgers--v2-response-ledger.md` | fetch | 27 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--index.md` | fetch | 20 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aarne-fist-withers-cnas-secure-governable-chips-2024.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aarne-petrie-flexheg-part-iii-2025.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--abc-cybertruck-chatgpt-2025-01-07.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--accessnow-espionage-for-repression-2026.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--accessnow-first-10000-cases-2021.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--accessnow-helpline.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-2022-dhs-location-data.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-2026-dhs-location-data-update.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-2026-palantir-roundup.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-galati-testimony-2012.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-khalil-scotus-review.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-nypd-surveillance-factsheet.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aclu-nypd-unit-disbanded-2014.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aiweekly-white-house-extend-open-models-2026-08-17.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--akkerman-mudde-zaslove-2014.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--ala-state-library-privacy-laws.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--alegre-2017-rethinking-freedom-of-thought.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--alegre-2020-regulating-around-forum-internum.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--alegre-shull-2023-cigi-freedom-of-thought.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--amnesty-2021-pegasus-project.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--anderson-epistemology-of-democracy.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--ansari-2026-hardware-level-governance.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--anthropic-claude-mythos-page.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--anthropic-fable-mythos-access-2026-06-12.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--anthropic-multi-agent-figures.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--anthropic-position-open-weights.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--anthropic-redeploying-fable-5-2026-06-30.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--ap-15-charged-2026-06.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--ap-mn-surveillance-2026-08-13.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--ap-pulitzer-2012-nypd.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--apsa-riaz-bermeo-definition.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--arendt-1967-truth-and-politics-new-yorker.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--arendt-origins-total-domination-scan.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--austin-social-legibility-2022.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--aviationist-brize-norton-2025-06-20.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--axios-trump-ai-framework-open-models-2026-08-04.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--axios-trump-openai-gpt-5-6-2026-06-25.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--balkin-2008-national-surveillance-state.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--balkin-national-surveillance-state-2008.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--bedi-2021-myth-of-the-chilling-effect.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--benson-2026-evidence-frame-integrity.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--benton-white-house-exempt-open-models-2026-08-05.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--berlin-1958-two-concepts-oxford-vl.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--berlin-two-concepts-of-liberty-1969.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--bho-ordinance-regulating-printing-1643.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--binney-turnkey-totalitarian-2012.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--biometricupdate-openai-hardware-passkeys-2026-07-14.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--blaze-1994-protocol-failure-ees.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--bobbio-left-and-right.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--bogost-warzel-american-panopticon-2025.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--brandeis-myers-dissent-1926.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--brennan-deportation-industrial-complex.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--brussels-signal-spo-vote-2026.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--caplan-lewis-exchange.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--cbs-comey-second-indictment.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--cbs-doj-drops-law-firm-eo-appeals.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--chatrie-docket-check.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--chen-more-llm-calls.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--ches-2024-rederivation.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--chilling-effects-skeptic-trail.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--church-committee-book-ii-1976.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--citizenlab-2025-graphite-caught.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--clapper-v-amnesty-2013.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--clearinghouse-khalil-v-joyce.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--clearinghouse-mennonite-v-dhs.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--clearinghouse-newsom-v-trump.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--cognition-dont-build-multi-agents.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--collier-mahon-1993.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--eight-values.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--estlund-democratic-authority.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--farrell-shalizi-cognitive-democracy.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--federalist-51-authorship.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--fei-when-agents-evolve.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--four-color-kempe-heawood.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--gonzalez-hxa-reply.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--hayek-use-of-knowledge.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--hooghe-marks-wilson-2002.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--huang-self-correction-yogurt.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--hungary-2026-election.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--kaesberg-voting-consensus.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--kitschelt-1994.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--kling-three-languages.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--mudde-2004.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--muller-what-is-populism.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--orbanomics.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--popper-critical-rationalism.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--rauch-constitution-of-knowledge.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--sjsebastian-venue-style.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--smit-going-mad.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--tax-foundation-tariff-tracker.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--author--research--sources--welfare-chauvinism.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--index.md` | fetch | 9 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--8values-test.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--9axes-test.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--akkerman-mudde-zaslove-2014.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--bobbio-left-and-right.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--caplan-lewis-exchange.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--caramani-2017-will-vs-reason.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--ches-2024-codebook-and-site.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--ches-2024-dataset-rederivation.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--collier-mahon-radial-categories.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--converse-1964-belief-systems.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--dewilde-2023-cosmo-comm.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--dewilde-cosmopolitan-communitarian.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--feldman-huddy-2014-not-so-simple.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--freeden-morphology.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/agents--editor--research--sources--gonzalez-spectrum-does-exist.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-drafting-note.md` | fetch | 11 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-response.md` | fetch | 16 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-review--01-claim-ledger.md` | fetch | 16 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-review--02-discourse-report-policy.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-review--02-discourse-report.md` | fetch | 16 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-review--05-second-read.md` | fetch | 16 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v1-review--editors-letter.md` | fetch | 16 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-response.md` | fetch | 19 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--00-piece-brief.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--01-claim-ledger.md` | fetch | 11 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--02-discourse-report-policy.md` | fetch | 7 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--02-discourse-report.md` | fetch | 11 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--03-argument-notes.md` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--04-craft-notes.md` | fetch | 12 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--05-second-read.md` | fetch | 11 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/correspondence--v2-review--editors-letter.md` | fetch | 11 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/a/drafts--taxonomy_reference_sheet.md` | fetch | 5 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/r/v2-review` | fetch | 4 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/review/v1-review` | fetch | 8 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/review/v2-review` | fetch | 20 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/v/<n>` | fetch | 81 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/v/<n>/diff/<n>` | fetch | 8 | GET/HEAD — allowed |
| `GET /bff/p/demo~<essay>/v/working` | fetch | 4 | GET/HEAD — allowed |
| `GET /demo` | document | 20 | GET/HEAD — allowed |
| `GET /demo/constitution-of-reason` | document | 8 | GET/HEAD — allowed |
| `GET /demo/constitution-of-reason/a/agents--author--ledgers--v2-response-ledger.md` | document | 8 | GET/HEAD — allowed |
| `GET /demo/constitution-of-reason/a/correspondence--v2-review--04-craft-notes.md` | document | 8 | GET/HEAD — allowed |
| `GET /demo/constitution-of-reason/review/v2-review` | document | 8 | GET/HEAD — allowed |
| `GET /demo/structure-of-political-difference` | document | 12 | GET/HEAD — allowed |
| `GET /demo/the-borrowed-commons` | document | 4 | GET/HEAD — allowed |
| `GET /demo/the-governable-mind` | document | 12 | GET/HEAD — allowed |
| `GET /demo/the-governable-mind/a/agents--author--ledgers--v2-response-ledger.md` | document | 8 | GET/HEAD — allowed |
| `GET /demo/the-governable-mind/a/correspondence--v2-response.md` | document | 8 | GET/HEAD — allowed |
| `GET /demo/the-governable-mind/review/v2-review` | document | 8 | GET/HEAD — allowed |
| `GET /demo/the-politics-of-visibility` | document | 12 | GET/HEAD — allowed |
| `GET /demo/the-politics-of-visibility/a/agents--author--ledgers--v1-response-ledger.md` | document | 8 | GET/HEAD — allowed |
| `GET /demo/the-politics-of-visibility/review/v1-review` | document | 8 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--drafting--v1--03-claim-ledger.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--ledgers--v1-response-ledger.md` | document | 16 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--ledgers--v2-response-ledger.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--index.md` | document | 20 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aarne-fist-withers-cnas-secure-governable-chips-2024.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aarne-petrie-flexheg-part-iii-2025.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--abc-cybertruck-chatgpt-2025-01-07.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--accessnow-espionage-for-repression-2026.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--accessnow-first-10000-cases-2021.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--accessnow-helpline.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-2022-dhs-location-data.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-2026-dhs-location-data-update.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-2026-palantir-roundup.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-galati-testimony-2012.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-khalil-scotus-review.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-nypd-surveillance-factsheet.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aclu-nypd-unit-disbanded-2014.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aiweekly-white-house-extend-open-models-2026-08-17.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--akkerman-mudde-zaslove-2014.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--ala-state-library-privacy-laws.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--alegre-2017-rethinking-freedom-of-thought.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--alegre-2020-regulating-around-forum-internum.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--alegre-shull-2023-cigi-freedom-of-thought.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--amnesty-2021-pegasus-project.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--anderson-epistemology-of-democracy.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--ansari-2026-hardware-level-governance.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--anthropic-claude-mythos-page.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--anthropic-fable-mythos-access-2026-06-12.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--anthropic-multi-agent-figures.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--anthropic-position-open-weights.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--anthropic-redeploying-fable-5-2026-06-30.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--ap-15-charged-2026-06.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--ap-mn-surveillance-2026-08-13.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--ap-pulitzer-2012-nypd.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--apsa-riaz-bermeo-definition.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--arendt-1967-truth-and-politics-new-yorker.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--arendt-origins-total-domination-scan.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--austin-social-legibility-2022.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--aviationist-brize-norton-2025-06-20.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--axios-trump-ai-framework-open-models-2026-08-04.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--axios-trump-openai-gpt-5-6-2026-06-25.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--balkin-2008-national-surveillance-state.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--balkin-national-surveillance-state-2008.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--bedi-2021-myth-of-the-chilling-effect.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--benson-2026-evidence-frame-integrity.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--benton-white-house-exempt-open-models-2026-08-05.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--berlin-1958-two-concepts-oxford-vl.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--berlin-two-concepts-of-liberty-1969.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--bho-ordinance-regulating-printing-1643.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--binney-turnkey-totalitarian-2012.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--biometricupdate-openai-hardware-passkeys-2026-07-14.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--blaze-1994-protocol-failure-ees.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--bobbio-left-and-right.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--bogost-warzel-american-panopticon-2025.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--brandeis-myers-dissent-1926.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--brennan-deportation-industrial-complex.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--brussels-signal-spo-vote-2026.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--caplan-lewis-exchange.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--cbs-comey-second-indictment.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--cbs-doj-drops-law-firm-eo-appeals.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--chatrie-docket-check.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--chen-more-llm-calls.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--ches-2024-rederivation.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--chilling-effects-skeptic-trail.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--church-committee-book-ii-1976.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--citizenlab-2025-graphite-caught.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--clapper-v-amnesty-2013.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--clearinghouse-khalil-v-joyce.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--clearinghouse-mennonite-v-dhs.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--clearinghouse-newsom-v-trump.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--cognition-dont-build-multi-agents.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--collier-mahon-1993.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--eight-values.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--estlund-democratic-authority.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--farrell-shalizi-cognitive-democracy.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--federalist-51-authorship.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--fei-when-agents-evolve.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--four-color-kempe-heawood.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--gonzalez-hxa-reply.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--hayek-use-of-knowledge.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--hooghe-marks-wilson-2002.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--huang-self-correction-yogurt.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--hungary-2026-election.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--kaesberg-voting-consensus.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--kitschelt-1994.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--kling-three-languages.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--mudde-2004.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--muller-what-is-populism.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--orbanomics.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--popper-critical-rationalism.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--rauch-constitution-of-knowledge.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--sjsebastian-venue-style.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--smit-going-mad.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--tax-foundation-tariff-tracker.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--author--research--sources--welfare-chauvinism.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--index.md` | document | 9 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--8values-test.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--9axes-test.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--akkerman-mudde-zaslove-2014.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--bobbio-left-and-right.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--caplan-lewis-exchange.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--caramani-2017-will-vs-reason.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--ches-2024-codebook-and-site.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--ches-2024-dataset-rederivation.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--collier-mahon-radial-categories.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--converse-1964-belief-systems.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--dewilde-2023-cosmo-comm.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--dewilde-cosmopolitan-communitarian.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--feldman-huddy-2014-not-so-simple.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--freeden-morphology.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/agents--editor--research--sources--gonzalez-spectrum-does-exist.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-drafting-note.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-response.md` | document | 16 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-review--01-claim-ledger.md` | document | 16 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-review--02-discourse-report-policy.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-review--02-discourse-report.md` | document | 16 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-review--05-second-read.md` | document | 16 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v1-review--editors-letter.md` | document | 16 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-response.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--00-piece-brief.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--01-claim-ledger.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--02-discourse-report-policy.md` | document | 7 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--02-discourse-report.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--03-argument-notes.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--04-craft-notes.md` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--05-second-read.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/correspondence--v2-review--editors-letter.md` | document | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/a/drafts--taxonomy_reference_sheet.md` | document | 5 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/palette-search` | fetch | 11 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/r/v2-review` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/review/v2-review` | document | 4 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/v/<n>` | document | 81 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/v/<n>/diff/<n>` | document | 8 | GET/HEAD — allowed |
| `GET /p/demo~<essay>/v/working` | document | 4 | GET/HEAD — allowed |
| `POST /a/demo` | ping | 20 | metrics carve-out (REQ-TOUR-9) |

## Out-of-allowlist / fault rows

- ❌ structure-of-political-difference anon 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ structure-of-political-difference anon 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ structure-of-political-difference anon 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ structure-of-political-difference anon 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ structure-of-political-difference anon 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ structure-of-political-difference anon 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ structure-of-political-difference anon 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ structure-of-political-difference anon 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ structure-of-political-difference anon 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ structure-of-political-difference anon 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ structure-of-political-difference anon 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ structure-of-political-difference anon 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ structure-of-political-difference cookie 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ structure-of-political-difference cookie 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ structure-of-political-difference cookie 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ structure-of-political-difference cookie 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ structure-of-political-difference cookie 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ structure-of-political-difference cookie 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ structure-of-political-difference cookie 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ structure-of-political-difference cookie 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ structure-of-political-difference cookie 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ structure-of-political-difference cookie 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ structure-of-political-difference cookie 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ structure-of-political-difference cookie 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-governable-mind anon 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-governable-mind anon 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-governable-mind anon 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-governable-mind anon 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-governable-mind anon 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-governable-mind anon 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-governable-mind anon 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-governable-mind anon 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-governable-mind anon 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-governable-mind anon 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-governable-mind anon 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-governable-mind anon 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-governable-mind cookie 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-governable-mind cookie 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-governable-mind cookie 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-governable-mind cookie 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-governable-mind cookie 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-governable-mind cookie 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-governable-mind cookie 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-governable-mind cookie 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-governable-mind cookie 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-governable-mind cookie 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-governable-mind cookie 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-governable-mind cookie 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ constitution-of-reason anon 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ constitution-of-reason anon 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ constitution-of-reason anon 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ constitution-of-reason anon 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ constitution-of-reason anon 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ constitution-of-reason anon 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ constitution-of-reason cookie 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ constitution-of-reason cookie 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ constitution-of-reason cookie 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ constitution-of-reason cookie 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ constitution-of-reason cookie 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ constitution-of-reason cookie 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-politics-of-visibility anon 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-politics-of-visibility anon 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-politics-of-visibility anon 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-politics-of-visibility anon 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-politics-of-visibility anon 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-politics-of-visibility anon 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-politics-of-visibility anon 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-politics-of-visibility anon 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-politics-of-visibility anon 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-politics-of-visibility anon 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-politics-of-visibility anon 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-politics-of-visibility anon 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-politics-of-visibility cookie 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-politics-of-visibility cookie 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-politics-of-visibility cookie 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-politics-of-visibility cookie 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-politics-of-visibility cookie 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-politics-of-visibility cookie 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-politics-of-visibility cookie 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-politics-of-visibility cookie 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-politics-of-visibility cookie 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-politics-of-visibility cookie 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-politics-of-visibility cookie 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-politics-of-visibility cookie 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/v/$v (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/a/$artifactId (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-borrowed-commons anon 1440px: 404 on https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app/bff/p/demo~the-borrowed-commons?b=4f66cebc39bf7f1d0b996cadf860a68f355df914
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/v/$v (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/a/$artifactId (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-borrowed-commons anon 390px: 404 on https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app/bff/p/demo~the-borrowed-commons?b=4f66cebc39bf7f1d0b996cadf860a68f355df914
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/v/$v (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/a/$artifactId (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-borrowed-commons cookie 1440px: 404 on https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app/bff/p/demo~the-borrowed-commons?b=4f66cebc39bf7f1d0b996cadf860a68f355df914
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/v/$v (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/v/$n/diff/$m (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/a/$artifactId (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/revisions/$cid (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/review/$runId (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/r/$runId (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/figures (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: route coverage miss: /p/$project/figures/$figureId (no visited URL matched)
- ❌ the-borrowed-commons cookie 390px: 404 on https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app/bff/p/demo~the-borrowed-commons?b=4f66cebc39bf7f1d0b996cadf860a68f355df914

## DataSource reach (DWEB-3's amended contract)

- Implemented (`demoDataSource`): 
- Reached by the walk: 
- Delta (implemented \ reached): (none)
- Delta (reached \ implemented): (none)
