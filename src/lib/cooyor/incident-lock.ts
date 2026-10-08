const replacementLocks = new Set<string>();

export function hasReplacementLock(
  originalTransferId: string
): boolean {
  return replacementLocks.has(originalTransferId);
}

export function acquireReplacementLock(
  originalTransferId: string
): boolean {
  if (replacementLocks.has(originalTransferId)) {
    return false;
  }

  replacementLocks.add(originalTransferId);
  return true;
}