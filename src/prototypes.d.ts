export {};

declare global {
  interface String {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formatUnicorn(...args: any): string;
  }
}
