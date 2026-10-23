const hashText = (value: string, seed: number) => {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

/** Identidade estável e limitada; não é credencial nem assinatura criptográfica. */
export const createOpaqueHandle = (prefix: string, collectionName: string, realId: string, sessionSalt: string) => {
  const material = `${sessionSalt}\u0000${collectionName}\u0000${realId}`;
  return `${prefix}_${hashText(material, 2166136261)}${hashText(material, 2246822519)}`;
};
