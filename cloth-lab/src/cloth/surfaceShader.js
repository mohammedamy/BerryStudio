// Welded/collapsed neighbor rings can have zero swept area. normalize(0)
// is undefined on GPUs; a NaN lighting value can contaminate every pixel
// through bloom. Preserve the rest normal, or a finite axis for a
// degenerate rest triangle, instead of passing invalid values downstream.
export const SAFE_CLOTH_NORMAL_GLSL = `
vec3 clothSafeNormal(vec3 candidate, vec3 restNormal) {
  float lenSq = dot(candidate, candidate);
  if (lenSq > 1e-12 && lenSq < 1e30) return candidate * inversesqrt(lenSq);
  float restLenSq = dot(restNormal, restNormal);
  if (restLenSq > 1e-12 && restLenSq < 1e30) return restNormal * inversesqrt(restLenSq);
  return vec3(0.0, 0.0, 1.0);
}
`
