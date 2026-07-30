/** Stands in for `next/cache`. */

export const revalidated: string[] = [];

export function reset(): void {
  revalidated.length = 0;
}

export function revalidatePath(path: string): void {
  revalidated.push(path);
}
