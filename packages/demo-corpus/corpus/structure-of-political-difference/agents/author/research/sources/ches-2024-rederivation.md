# ches-2024-rederivation
- **URL:** https://www.chesdata.eu/s/CHES_2024_final_v2.csv (downloaded to session scratchpad) · **Accessed:** 2026-07-31 · **For:** v1-response — MI2 (make the composite exercise reproducible); replaces v1's unstated composites
- **What it establishes:** My own re-run, 279 parties, z-scored means, pairwise Pearson r on the five declared composites:
  - economy = lrecon, redistribution, deregulation, spendvtax
  - coercion = civlib_laworder, executive_power
  - culture = galtan, womens_rights, lgbtq_rights, samesex_marriage, religious_principles
  - belonging = nationalism, immigrate_policy, multiculturalism, ethnic_minorities
  - system = anti_elite_salience, people_v_elite
  Results: coercion×culture +.84, coercion×belonging +.90, culture×belonging +.85 (the bundle: .84–.90); economy vs those three +.47/+.47/+.56; system×economy −.13; system vs culture/coercion/belonging +.38.
- **Key passages:** n=279 all pairs; computation in session scratchpad (python, stdlib only).
- **Reliability:** Primary — my own computation from the raw public dataset; matches the editor's independent re-derivation (ledger C10) in every figure.
- **Relevance:** v2 §IV reports these numbers (replacing v1's .78–.82/.39–.56 from unstated composites) and lists the variables in an endnote so the exercise is checkable. The first-person "I constructed exploratory composites" is now literally true of the published numbers.
