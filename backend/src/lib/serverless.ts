export function isServerless(): boolean {
  return process.env.VERCEL === '1';
}
