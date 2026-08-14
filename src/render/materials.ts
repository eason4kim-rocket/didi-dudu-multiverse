import * as THREE from "three";

export const COLORS = {
  white: 0xf3eee4,
  orange: 0xe56a1a,
  dark: 0x1b1c1e,
  silver: 0xb7bec6,
  steel: 0x6d737a,
  lens: 0x111214,
  sand: 0xc4a06a,
  sandDark: 0x8d6a3e,
};

export function plastic(color: number, extras: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.08,
    ...extras,
  });
}

export function metal(color: number, extras: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.28,
    metalness: 0.72,
    ...extras,
  });
}
