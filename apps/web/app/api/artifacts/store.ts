// /web/app/api/artifacts/store.ts
const artifactStore = new Map<string, string>();

export function putArtifact(hash: string, payload: string) {
  artifactStore.set(hash.toLowerCase(), payload);
}

export function getArtifact(hash: string) {
  return artifactStore.get(hash.toLowerCase());
}
