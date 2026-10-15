import struct


def strings(data):
    magic, ver = struct.unpack_from('<QI', data, 0)
    assert ver in (94, 95, 96, 97), ver
    p = 32
    (fileLength, globalCode, funcCount, kindCount, identCount, strCount, overflowCount, storageSize,
     bigIntCount, bigIntStorage, reCount, reStorage, arrBuf, objKey, objVal, seg, cjs, funcSrc, dbg) = struct.unpack_from('<19I', data, p)
    best = None
    for hdr in range(108, 160, 4):
        off = hdr
        off += funcCount * 16
        off = (off + 3) & ~3
        kinds_off = off
        off += kindCount * 4
        ident_off = off
        off += identCount * 4
        small_off = off
        off += strCount * 4
        off = (off + 3) & ~3
        over_off = off
        off += overflowCount * 8
        off = (off + 3) & ~3
        storage_off = off
        # sanity: first small entries should decode to printable text
        ok = 0
        for i in range(min(strCount, 40)):
            e = struct.unpack_from('<I', data, small_off + i * 4)[0]
            utf16 = e & 1
            o = (e >> 1) & 0x7FFFFF
            l = (e >> 24) & 0xFF
            if l == 0xFF:
                continue
            if utf16:
                raw = data[storage_off + o:storage_off + o + l * 2]
            else:
                raw = data[storage_off + o:storage_off + o + l]
            if len(raw) and all(32 <= b < 127 or b == 0 for b in raw[:12]):
                ok += 1
        if best is None or ok > best[0]:
            best = (ok, hdr, small_off, over_off, storage_off)
    ok, hdr, small_off, over_off, storage_off = best
    out = []
    for i in range(strCount):
        e = struct.unpack_from('<I', data, small_off + i * 4)[0]
        utf16 = e & 1
        o = (e >> 1) & 0x7FFFFF
        l = (e >> 24) & 0xFF
        if l == 0xFF:
            oo, ll = struct.unpack_from('<II', data, over_off + o * 8)
            o, l = oo, ll
        try:
            if utf16:
                s = data[storage_off + o:storage_off + o + l * 2].decode('utf-16-le', 'ignore')
            else:
                s = data[storage_off + o:storage_off + o + l].decode('utf-8', 'ignore')
        except Exception:
            s = ''
        out.append(s)
    return out, ok, hdr


if __name__ == '__main__':
    import sys
    d = open(sys.argv[1], 'rb').read()
    s, ok, hdr = strings(d)
    print(len(s), ok, hdr)
    for x in s[100:130]:
        print(repr(x[:100]))
