/** Join class names, dropping falsy values. Deliberately tiny — every
 *  primitive owns its own, non-conflicting class strings. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
