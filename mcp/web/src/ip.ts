// Whether an address is one a public web server can have.
//
// A page address someone else wrote must never make this machine talk to
// itself or to its network: 127.0.0.1 (the editor, with its settings and keys),
// 192.168.x.x (the router), 169.254.169.254 (a cloud host's credentials).

import { BlockList, isIP } from 'node:net';

/** Ranges no public server has, IPv4 and the few IPv6 ranges inside 2000::/3 that are not global either. */
const NOT_PUBLIC = new BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) NOT_PUBLIC.addSubnet(network, bits, 'ipv4');
for (const [network, bits] of [
  ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) NOT_PUBLIC.addSubnet(network, bits, 'ipv6');

/** Global unicast IPv6 starts here; everything else (::1, fe80::, fc00::, ff00::, ...) is not public. */
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6');

/** The 16 bytes of an IPv6 address, or null if it is not one. */
function bytesOf(address: string): number[] | null {
  let text = address;
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    if ([a, b, c, d].some((part) => part > 255)) return null;
    text = `${text.slice(0, -tail[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const gap = 8 - head.length - rest.length;
  if (halves.length === 1 ? gap !== 0 : gap < 1) return null;
  const groups = [...head, ...(halves.length === 2 ? Array<string>(gap).fill('0') : []), ...rest];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 255);
  }
  return bytes.length === 16 ? bytes : null;
}

/** Whether *address* (an IP literal, with or without brackets) is a public one. Anything it cannot read is not. */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const family = isIP(bare);
  if (family === 4) return !NOT_PUBLIC.check(bare, 'ipv4');
  if (family !== 6) return false;
  const bytes = bytesOf(bare);
  if (!bytes) return false;
  // ::ffff:a.b.c.d is the IPv4 address a.b.c.d in an IPv6 coat.
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicAddress(bytes.slice(12).join('.'));
  }
  return GLOBAL_V6.check(bare, 'ipv6') && !NOT_PUBLIC.check(bare, 'ipv6');
}
