# Generic fabric weave texture

Source: [ambientCG Fabric030](https://ambientcg.com/a/Fabric030), CC0 (public
domain). Downloaded at 1K, resized to 512px and recompressed (JPEG quality
~60) here to keep the web bundle small — originals were ~1.7-2.7MB each,
these are ~80-120KB. `normal.jpg` is the OpenGL-convention normal map variant
(matches three.js's default expectation).

Used as one shared base weave for every fabric preset in `fabricPresets.js`
— color/roughness/sheen still differ per fabric via `ClothMesh.jsx`'s
material, this only adds real surface detail (grain, thread structure)
instead of a flat color. See Tier-1/B2 in the cloth-lab realism plan for
why a single shared texture was chosen over sourcing 8 distinct sets.
