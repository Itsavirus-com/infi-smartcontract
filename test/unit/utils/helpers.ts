export function hex(input: string): string {
  return `0x${Buffer.from(input).toString('hex')}`;
}
