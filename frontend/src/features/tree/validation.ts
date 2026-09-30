export function getValueError(nodeValue: string): string | null {
  if (!nodeValue.trim()) {
    return 'Enter a nonblank value.'
  }

  if (nodeValue.length > 500) {
    return 'Values must contain at most 500 characters.'
  }

  if (nodeValue.includes('\0')) {
    return 'Remove null (NUL) characters from the value.'
  }

  return null
}
