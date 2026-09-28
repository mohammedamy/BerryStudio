# P7-08 local Image Studio benchmark

This small versioned regression benchmark verifies only local concept state:
text-to-image concepts carry no reference, reference-guided concepts retain the
selected source ID, and an invalid returned image leaves prior project state
unchanged. It does not measure an external provider, image quality, rights,
fashion suitability, user acceptance, fit, construction or production.
