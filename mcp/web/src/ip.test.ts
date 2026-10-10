import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './ip.ts';

describe('isPublicAddress', () => {
  it('lets public servers through', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '100.63.255.255', '2606:4700:4700::1111', '[2a00:1450:4001::200e]']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses this machine, its network, and the places a cloud host keeps its keys', () => {
    for (const address of [
      '127.0.0.1', '127.255.255.254', '0.0.0.0', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '169.254.169.254', '100.64.0.1', '224.0.0.1', '255.255.255.255', '192.0.2.1', '198.18.0.1',
      '::1', '::', 'fe80::1', 'fe80::1%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::', '2001::1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('sees an IPv4 address inside an IPv6 one for what it is', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:7f00:1')).toBe(false);
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false);
    expect(isPublicAddress('::ffff:10.1.2.3')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });

  it('refuses what it cannot read', () => {
    for (const address of ['', 'localhost', 'example.com', '1.2.3', '300.1.1.1', '1::2::3', 'gggg::1']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});
