#!/usr/bin/env python3
"""
aerocall - intercepting HTTP(S) proxy, API workbench, and code factory.
One file. The basics need no extra packages.

What it does
------------
* Builder: method + URL + headers/query/body, sent by this server (no CORS).
  Follow redirects, set a timeout, edit the raw request, resend from history.
* Repeater / sequence: send a request N times, optionally substituting {{i}}.
* Code: live export to Python, JavaScript, cURL, HTTPie, and Go.
* Traffic: browser HTTP+HTTPS proxy streams here, bodies decoded (gzip/deflate;
  brotli/zstd with optional libs). Filter noise, search bodies, export HAR.
* Intercept: pause requests and/or responses, edit raw bytes, forward or drop.
  Optional URL filter so only matching calls stop.
* Rules: match/replace on request or response URL, headers, or body
  (literal or regex) before the other side sees them.
* Scope: include/exclude hosts so the log stays on the app you care about.
* Decoder: URL, Base64, hex, Unicode escapes, JWT header/payload (decode only).
* Cookies: jar harvested from Set-Cookie on captured traffic.
* Collections: named requests persisted next to the process.
* Scanner: passive Burp-style checks over captured flows (no extra requests).
* Intruder: replay a marked request with swapped payloads (sniper, battering
  ram, pitchfork, cluster bomb), grep-match and sort the results.
* Phone: --lan + QR setup, including the MITM CA.

HTTPS is decrypted with a per-host cert signed by a root CA minted on first run
(./ca/ca_cert.pem, also at /ca). Trust that CA in the proxied browser.
Without `cryptography`, HTTPS is tunneled (host visible, body not).

Only point this at your own traffic or systems you are authorized to test.
This is a workbench, not an exploit framework.

Requirements
------------
    pip install cryptography            # only for decrypting HTTPS via the proxy
    pip install brotli zstandard        # optional, to decode br/zstd bodies

Usage
-----
    python3 aerocall.py                 # UI on http://127.0.0.1:8081, proxy on 127.0.0.1:8080
    python3 aerocall.py --lan           # also reachable from phones on the same Wi-Fi (prints a QR code)
    python3 aerocall.py --open          # same, and open the UI in your browser
    python3 aerocall.py --no-proxy      # just the API caller, no proxy
    python3 aerocall.py --insecure      # don't verify origin TLS certs (local / self-signed servers)
    python3 aerocall.py -v              # also log traffic to the terminal

iPhone / Android
----------------
Start with --lan, then open "Phone setup" in the UI. It shows QR codes for the
phone URL and the certificate, plus the exact Settings paths: Wi-Fi proxy,
installing the certificate profile, and (iPhone) switching on full trust under
Settings -> General -> About -> Certificate Trust Settings. On the phone, Share
-> Add to Home Screen turns the UI into a full-screen app. --lan exposes the UI
and proxy to everyone on that network, so use it on Wi-Fi you trust.
"""

import argparse
import base64
import datetime
import gzip
import itertools
import json
import math
import os
import re
import secrets
import select
import socket
import ssl
import struct
import sys
import threading
import time
import webbrowser
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, parse_qsl, quote as urlquote

# ---- optional: HTTPS interception needs `cryptography` ----------------------
try:
    from cryptography import x509
    from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    HAVE_CRYPTO = True
except Exception:
    HAVE_CRYPTO = False

# ---- optional body codecs (degrade gracefully if missing) -------------------
try:
    import brotli as _brotli
except Exception:
    try:
        import brotlicffi as _brotli
    except Exception:
        _brotli = None
try:
    import zstandard as _zstd
except Exception:
    _zstd = None


CA_DIR = "ca"
CERT_DIR = "certs"
CA_CERT_PATH = os.path.join(CA_DIR, "ca_cert.pem")
CA_KEY_PATH = os.path.join(CA_DIR, "ca_key.pem")
COLLECTIONS_PATH = "aerocall-collections.json"
HAR_NAME = "aerocall-export.har"

USE_COLOR = sys.stdout.isatty()
MAX_FLOWS = 5000            # ring-buffer cap for stored flows
MAX_STORE_BODY = 2_000_000  # cap decoded body text kept per flow (chars)
PRINT_LOCK = threading.Lock()
INSECURE = False

# A per-run secret that gates the dashboard API. It only matters once the UI is
# reachable beyond loopback (--lan): the page is served with it as a cookie, and
# every data/command endpoint requires that cookie back, so a stranger on the
# same network cannot drive /api/send (a server-side request maker) or read the
# captured traffic. Printed in the operator's terminal, Jupyter-style.
UI_TOKEN = secrets.token_urlsafe(18)
REQUIRE_AUTH = False


def set_require_auth(on):
    global REQUIRE_AUTH
    REQUIRE_AUTH = bool(on)


_HOSTFILE_OK = re.compile(r"[^A-Za-z0-9._-]")


def _chmod_600(path):
    """Best-effort: keep private keys readable only by their owner (no-op on Windows)."""
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _write_ca_gitignore():
    """Drop a .gitignore in the CA dir so the private key can't be committed by accident."""
    try:
        with open(os.path.join(CA_DIR, ".gitignore"), "w") as f:
            f.write("*\n")
    except OSError:
        pass

# Talk to real origins over TLS, but force HTTP/1.1 via ALPN so we never end up
# trying to read HTTP/2 binary frames as text.
_origin_ctx = ssl.create_default_context()
_origin_ctx.set_alpn_protocols(["http/1.1"])


def set_insecure():
    """Stop verifying origin certificates (for local / self-signed servers)."""
    global INSECURE
    INSECURE = True
    _origin_ctx.check_hostname = False
    _origin_ctx.verify_mode = ssl.CERT_NONE


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


# ===========================================================================
# Tiny QR encoder (byte mode, versions 1-6, error level L) - enough for URLs,
# so the phone-setup screen needs no extra packages.
# ===========================================================================
_QR_EC = {1: (19, 7, 1), 2: (34, 10, 1), 3: (55, 15, 1), 4: (80, 20, 1), 5: (108, 26, 1), 6: (136, 18, 2)}
_QR_ALIGN = {2: 18, 3: 22, 4: 26, 5: 30, 6: 34}
_GF_EXP, _GF_LOG = [0] * 512, [0] * 256
_x = 1
for _i in range(255):
    _GF_EXP[_i], _GF_LOG[_x] = _x, _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11d
for _i in range(255, 512):
    _GF_EXP[_i] = _GF_EXP[_i - 255]


def _gf_mul(a, b):
    return 0 if a == 0 or b == 0 else _GF_EXP[_GF_LOG[a] + _GF_LOG[b]]


def _rs_ec(data, n):
    gen = [1]
    for i in range(n):
        nxt = [0] * (len(gen) + 1)
        for j, g in enumerate(gen):
            nxt[j] ^= g
            nxt[j + 1] ^= _gf_mul(g, _GF_EXP[i])
        gen = nxt
    rem = list(data) + [0] * n
    for i in range(len(data)):
        c = rem[i]
        if c:
            for j in range(1, len(gen)):
                rem[i + j] ^= _gf_mul(gen[j], c)
    return rem[len(data):]


def qr_matrix(text):
    """Boolean grid (True = dark) for `text`, or None if it doesn't fit."""
    data = text.encode("utf-8")
    for v, (dcw, ecn, nblocks) in _QR_EC.items():
        if len(data) <= dcw - 2:
            break
    else:
        return None
    bits = "0100" + format(len(data), "08b") + "".join(format(b, "08b") for b in data)
    bits += "0" * min(4, dcw * 8 - len(bits))
    bits += "0" * (-len(bits) % 8)
    cw = [int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)]
    for i in range(dcw - len(cw)):
        cw.append(0xEC if i % 2 == 0 else 0x11)
    per = dcw // nblocks
    dblocks = [cw[i * per:(i + 1) * per] for i in range(nblocks)]
    eblocks = [_rs_ec(b, ecn) for b in dblocks]
    seq = [b[i] for i in range(per) for b in dblocks] + [b[i] for i in range(ecn) for b in eblocks]
    stream = [(byte >> (7 - k)) & 1 for byte in seq for k in range(8)]

    size = 17 + 4 * v
    m = [[None] * size for _ in range(size)]          # None = data cell
    for r0, c0 in ((0, 0), (0, size - 7), (size - 7, 0)):   # finders + separators
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0 + r, c0 + c
                if 0 <= rr < size and 0 <= cc < size:
                    inner = 0 <= r <= 6 and 0 <= c <= 6
                    m[rr][cc] = inner and (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4))
    for i in range(8, size - 8):                              # timing
        m[6][i] = m[i][6] = (i % 2 == 0)
    if v >= 2:                                                # alignment
        p = _QR_ALIGN[v]
        for r in range(-2, 3):
            for c in range(-2, 3):
                m[p + r][p + c] = max(abs(r), abs(c)) != 1
    for i in range(9):                                        # format areas (filled per mask)
        if m[8][i] is None:
            m[8][i] = False
        if m[i][8] is None:
            m[i][8] = False
    for i in range(size - 8, size):
        m[8][i] = m[i][8] = False
    m[size - 8][8] = True                                     # the always-dark module
    func = [[cell is not None for cell in row] for row in m]

    idx, col, upward = 0, size - 1, True                      # zig-zag data placement
    while col > 0:
        if col == 6:
            col -= 1
        for r in (range(size - 1, -1, -1) if upward else range(size)):
            for c in (col, col - 1):
                if m[r][c] is None:
                    m[r][c] = stream[idx] if idx < len(stream) else 0
                    idx += 1
        col -= 2
        upward = not upward

    masks = [lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0,
             lambda r, c: (r + c) % 3 == 0, lambda r, c: (r // 2 + c // 3) % 2 == 0,
             lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
             lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
             lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0]

    def place_format(g, k):
        d = (0b01 << 3) | k                                   # level L, mask k
        rem = d
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        f = ((d << 10) | rem) ^ 0x5412
        gb = lambda i: bool((f >> i) & 1)
        for i in range(6):
            g[i][8] = gb(i)
        g[7][8], g[8][8], g[8][7] = gb(6), gb(7), gb(8)
        for i in range(9, 15):
            g[8][14 - i] = gb(i)
        for i in range(8):
            g[8][size - 1 - i] = gb(i)
        for i in range(8, 15):
            g[size - 15 + i][8] = gb(i)

    def penalty(g):
        n = 0
        cols = [list(x) for x in zip(*g)]
        for line in g + cols:
            run = 1
            for i in range(1, size):
                if line[i] == line[i - 1]:
                    run += 1
                else:
                    n += (run - 2) if run >= 5 else 0
                    run = 1
            n += (run - 2) if run >= 5 else 0
            for i in range(size - 6):
                if line[i:i + 7] == [True, False, True, True, True, False, True]:
                    if (i >= 4 and not any(line[i - 4:i])) or (i + 11 <= size and not any(line[i + 7:i + 11])):
                        n += 40
        for r in range(size - 1):
            for c in range(size - 1):
                if g[r][c] == g[r][c + 1] == g[r + 1][c] == g[r + 1][c + 1]:
                    n += 3
        dark = sum(sum(row) for row in g)
        return n + 10 * (abs(dark * 100 // (size * size) - 50) // 5)

    best = None
    for k, mask in enumerate(masks):
        g = [[bool(m[r][c]) if func[r][c] else bool(m[r][c] ^ mask(r, c)) for c in range(size)] for r in range(size)]
        place_format(g, k)
        score = penalty(g)
        if best is None or score < best[0]:
            best = (score, g)
    return best[1]


def qr_svg(text):
    g = qr_matrix(text)
    if g is None:
        return None
    size, quiet = len(g), 4
    dim = size + 2 * quiet
    path = "".join(f"M{c + quiet} {r + quiet}h1v1h-1z" for r in range(size) for c in range(size) if g[r][c])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {dim} {dim}" shape-rendering="crispEdges">'
            f'<rect width="{dim}" height="{dim}" fill="#fff"/><path d="{path}" fill="#000"/></svg>')


def qr_terminal(text):
    """Two-rows-per-line rendering with ANSI colours; None if it doesn't fit."""
    g = qr_matrix(text)
    if g is None:
        return None
    quiet = 2
    width = len(g) + 2 * quiet
    rows = [[False] * width for _ in range(quiet)] + [[False] * quiet + r + [False] * quiet for r in g]
    rows += [[False] * width for _ in range(quiet)]
    if len(rows) % 2:
        rows.append([False] * width)
    lines = []
    for i in range(0, len(rows), 2):
        line = ""
        for top, bot in zip(rows[i], rows[i + 1]):
            line += {(False, False): "█", (True, False): "▄", (False, True): "▀", (True, True): " "}[(top, bot)]
        lines.append("  " + line)
    return "\n".join(lines)


def lan_ip():
    """This machine's address on the local network (no packets are sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return None


# ===========================================================================
# Certificate authority - mint a valid-looking cert for any hostname.
# ===========================================================================
class CertificateAuthority:
    def __init__(self):
        os.makedirs(CA_DIR, exist_ok=True)
        os.makedirs(CERT_DIR, exist_ok=True)
        self._lock = threading.Lock()
        self._ctx_lock = threading.Lock()
        self._ctx_cache = {}
        if os.path.exists(CA_CERT_PATH) and os.path.exists(CA_KEY_PATH):
            self._load()
        else:
            self._create()

    def _create(self):
        print("[*] Generating a new root CA (first run)...")
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, "aerocall Root CA"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "aerocall"),
        ])
        self.cert = (
            x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(self.key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(_utcnow() - datetime.timedelta(days=1))
            .not_valid_after(_utcnow() + datetime.timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True,
                key_encipherment=False, content_commitment=False,
                data_encipherment=False, key_agreement=False,
                encipher_only=False, decipher_only=False), critical=True)
            .sign(self.key, hashes.SHA256())
        )
        with open(CA_KEY_PATH, "wb") as f:
            f.write(self.key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption()))
        _chmod_600(CA_KEY_PATH)
        with open(CA_CERT_PATH, "wb") as f:
            f.write(self.cert.public_bytes(serialization.Encoding.PEM))
        _write_ca_gitignore()
        print(f"[*] Root CA written to {CA_CERT_PATH}")
        print("[*] Anyone who reads ca_key.pem can impersonate every HTTPS site a")
        print("    browser that trusts this CA visits. Keep it local; it is not for")
        print("    sharing or committing. Trust it only in a browser you proxy.")

    def _load(self):
        with open(CA_KEY_PATH, "rb") as f:
            self.key = serialization.load_pem_private_key(f.read(), password=None)
        with open(CA_CERT_PATH, "rb") as f:
            self.cert = x509.load_pem_x509_certificate(f.read())

    @staticmethod
    def _cert_ok(path):
        """Leaf certs minted by older versions lack the EKU iOS insists on; re-mint those."""
        try:
            with open(path, "rb") as f:
                pem = f.read()
            cert = x509.load_pem_x509_certificate(pem[pem.find(b"-----BEGIN CERTIFICATE-----"):])
            cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage)
            exp = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after.replace(tzinfo=datetime.timezone.utc)
            return exp > _utcnow() + datetime.timedelta(days=30)
        except Exception:
            return False

    def _cert_path_for(self, host):
        with self._lock:
            # `host` comes from a client's CONNECT target / SNI, so it must never
            # be trusted to build a filesystem path. Reduce it to a safe leaf
            # name (no separators, no traversal) before it touches disk.
            safe = _HOSTFILE_OK.sub("_", host).strip("._") or "host"
            path = os.path.join(CERT_DIR, safe + ".pem")
            if os.path.exists(path) and self._cert_ok(path):
                return path
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            cert = (
                x509.CertificateBuilder()
                .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, host)]))
                .issuer_name(self.cert.subject)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(_utcnow() - datetime.timedelta(days=1))
                .not_valid_after(_utcnow() + datetime.timedelta(days=800))   # iOS refuses > 825 days
                .add_extension(x509.SubjectAlternativeName([x509.DNSName(host)]), critical=False)
                .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
                .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                .sign(self.key, hashes.SHA256())
            )
            with open(path, "wb") as f:
                f.write(key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.TraditionalOpenSSL,
                    serialization.NoEncryption()))
                f.write(cert.public_bytes(serialization.Encoding.PEM))
            _chmod_600(path)
            return path

    def server_context_for(self, host):
        """A cached TLS *server* context presenting a cert for `host`."""
        with self._ctx_lock:
            if host in self._ctx_cache:
                return self._ctx_cache[host]
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(self._cert_path_for(host))
        with self._ctx_lock:
            self._ctx_cache[host] = ctx
        return ctx


# ===========================================================================
# Low-level HTTP byte plumbing (raw bytes in, raw bytes out).
# ===========================================================================
def _read_headers(sock):
    """Read up to end-of-headers. Returns (header_bytes, leftover_body_bytes)."""
    buf = b""
    while b"\r\n\r\n" not in buf:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            break
        buf += chunk
    idx = buf.find(b"\r\n\r\n")
    if idx == -1:
        return buf, b""
    return buf[:idx + 4], buf[idx + 4:]


def _parse_headers(raw):
    """Return (start_line_str, [(key, value), ...]) preserving order/duplicates."""
    lines = raw.split(b"\r\n")
    start = lines[0].decode("latin-1")
    headers = []
    for line in lines[1:]:
        if not line.strip() or b":" not in line:
            continue
        k, _, v = line.partition(b":")
        headers.append((k.decode("latin-1").strip(), v.decode("latin-1").strip()))
    return start, headers


def _read_chunked(sock, leftover):
    buf, body = leftover, b""
    while True:
        while b"\r\n" not in buf:
            chunk = sock.recv(65536)
            if not chunk:
                return body
            buf += chunk
        size_line, _, buf = buf.partition(b"\r\n")
        try:
            size = int(size_line.split(b";")[0].strip(), 16)
        except ValueError:
            return body
        if size == 0:
            return body
        while len(buf) < size + 2:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buf += chunk
        body += buf[:size]
        buf = buf[size + 2:]


def _read_request_body(sock, hdict, leftover, method):
    if "chunked" in hdict.get("transfer-encoding", "").lower():
        return _read_chunked(sock, leftover)
    cl = hdict.get("content-length")
    if cl is not None and cl.isdigit():
        length, body = int(cl), leftover
        while len(body) < length:
            chunk = sock.recv(65536)
            if not chunk:
                break
            body += chunk
        return body
    return leftover


def _read_until_close(sock):
    """Read a whole response. We force `Connection: close` upstream, so the
    origin closes the socket when the body is complete - this cleanly handles
    Content-Length, chunked, gzip, everything, without parsing framing."""
    data = b""
    while True:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            break
        data += chunk
    return data


def _build_origin_request(start, headers, body, host):
    """Rewrite a proxy-style request into an origin-style one to forward."""
    parts = start.split(" ")
    method, target = parts[0], parts[1]
    if target.startswith(("http://", "https://")):
        u = urlsplit(target)
        target = (u.path or "/") + (("?" + u.query) if u.query else "")
    lines, have_host, have_cl = [f"{method} {target} HTTP/1.1"], False, False
    for k, v in headers:
        lk = k.lower()
        if lk in ("proxy-connection", "connection", "keep-alive",
                  "proxy-authorization", "transfer-encoding"):
            continue
        if lk == "content-length":
            v, have_cl = str(len(body)), True
        if lk == "host":
            have_host = True
        lines.append(f"{k}: {v}")
    if body and not have_cl:
        lines.append(f"Content-Length: {len(body)}")
    if not have_host:
        lines.append(f"Host: {host}")
    lines.append("Connection: close")
    return ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1", "replace") + body


def _path_of(start):
    target = start.split(" ")[1]
    if target.startswith(("http://", "https://")):
        u = urlsplit(target)
        return (u.path or "/") + (("?" + u.query) if u.query else "")
    return target


def parse_request(req_bytes):
    """(method, target, headers_list, body_bytes) from raw origin-style request."""
    head, _, body = req_bytes.partition(b"\r\n\r\n")
    start, headers = _parse_headers(head)
    parts = start.split(" ")
    method = parts[0] if parts else "?"
    target = parts[1] if len(parts) > 1 else "/"
    return method, target, headers, body


def parse_response(resp_bytes):
    """(status_int, reason, headers_list, body_bytes) from raw response."""
    head, _, body = resp_bytes.partition(b"\r\n\r\n")
    start, headers = _parse_headers(head)
    parts = start.split(" ", 2)
    status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    reason = parts[2] if len(parts) > 2 else ""
    return status, reason, headers, body


def open_origin(scheme, host, port, timeout=30):
    raw = socket.create_connection((host, port), timeout=timeout)
    raw.settimeout(timeout)
    if scheme == "https":
        return _origin_ctx.wrap_socket(raw, server_hostname=host)
    return raw


def forward_raw(scheme, host, port, request_bytes, timeout=30):
    """Send pre-built request bytes to the origin, return the full raw response."""
    origin = open_origin(scheme, host, port, timeout=timeout)
    try:
        origin.sendall(request_bytes)
        return _read_until_close(origin)
    finally:
        try:
            origin.close()
        except Exception:
            pass


def forward_with_redirects(scheme, host, port, request_bytes, max_hops=8, timeout=30):
    """Follow 3xx Location hops for builder sends. Returns (final_response, hops)."""
    hops = []
    current = request_bytes
    for _ in range(max(1, max_hops)):
        resp = forward_raw(scheme, host, port, current, timeout=timeout)
        hops.append((scheme, host, port))
        if not resp:
            return resp, hops
        status, _, headers, _ = parse_response(resp)
        if status not in (301, 302, 303, 307, 308):
            return resp, hops
        location = ""
        for k, v in headers:
            if k.lower() == "location":
                location = v
                break
        if not location:
            return resp, hops
        if location.startswith("/"):
            location = f"{scheme}://{host}{'' if port in (80, 443) else ':' + str(port)}{location}"
        elif not location.startswith(("http://", "https://")):
            location = f"{scheme}://{host}{location}"
        u = urlsplit(location)
        scheme = (u.scheme or scheme).lower()
        host = u.hostname or host
        port = u.port or (443 if scheme == "https" else 80)
        path = (u.path or "/") + (("?" + u.query) if u.query else "")
        method = current.split(b" ", 1)[0].decode("latin-1", "replace")
        if status in (301, 302, 303) and method not in ("GET", "HEAD"):
            method = "GET"
            body = b""
        else:
            _, _, _, body = parse_request(current)
        hdrs = [("Host", host if port in (80, 443) else f"{host}:{port}")]
        current = _build_origin_request(f"{method} {path} HTTP/1.1", hdrs, body, host)
    return resp, hops


def normalize_request(raw_text, fix_length=True):
    """Turn a raw-request string (from the UI) into wire bytes.
    Strips hop-by-hop headers, forces Connection: close, and (by default)
    recomputes Content-Length to match the body."""
    raw_text = raw_text.replace("\r\n", "\n")
    head, _, body = raw_text.partition("\n\n")
    head_lines = head.split("\n")
    start = head_lines[0].strip()
    body_bytes = body.encode("utf-8")
    out, seen_cl = [start], False
    for line in head_lines[1:]:
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        k, v, lk = k.strip(), v.strip(), k.strip().lower()
        if lk in ("connection", "proxy-connection", "keep-alive",
                  "proxy-authorization", "transfer-encoding"):
            continue
        if lk == "content-length":
            if fix_length:
                v = str(len(body_bytes))
            seen_cl = True
        out.append(f"{k}: {v}")
    if body_bytes and not seen_cl:
        out.append(f"Content-Length: {len(body_bytes)}")
    out.append("Connection: close")
    return ("\r\n".join(out) + "\r\n\r\n").encode("latin-1", "replace") + body_bytes, start


def normalize_response(raw_text, fix_length=True):
    """Turn a raw-response string (from the UI) into wire bytes."""
    raw_text = raw_text.replace("\r\n", "\n")
    head, _, body = raw_text.partition("\n\n")
    head_lines = head.split("\n")
    start = head_lines[0].strip() or "HTTP/1.1 200 OK"
    body_bytes = body.encode("utf-8")
    out, seen_cl = [start], False
    for line in head_lines[1:]:
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        k, v, lk = k.strip(), v.strip(), k.strip().lower()
        if lk in ("connection", "proxy-connection", "keep-alive", "transfer-encoding"):
            continue
        if lk == "content-length":
            if fix_length:
                v = str(len(body_bytes))
            seen_cl = True
        if lk == "content-encoding":
            continue
        out.append(f"{k}: {v}")
    if not seen_cl:
        out.append(f"Content-Length: {len(body_bytes)}")
    out.append("Connection: close")
    return ("\r\n".join(out) + "\r\n\r\n").encode("latin-1", "replace") + body_bytes, start


# ===========================================================================
# Body decoding + display helpers.
# ===========================================================================
def _c(code):
    return f"\033[{code}m" if USE_COLOR else ""


def _color_status(status):
    code = str(status)[:1]
    color = {"2": "32", "3": "36", "4": "33", "5": "31"}.get(code, "37")
    return f"{_c(color)}{status}{_c('0')}"


def _mostly_text(data):
    if not data:
        return True
    sample = data[:4096]
    bad = sum(1 for b in sample if b < 9 or (13 < b < 32))
    return bad / len(sample) < 0.05


def _decompress(enc, body):
    """Return (decoded_bytes, note). Never raises."""
    enc = (enc or "").lower().strip()
    if enc in ("", "identity"):
        return body, ""
    try:
        if enc == "gzip":
            return gzip.decompress(body), "gunzipped"
        if enc == "deflate":
            try:
                return zlib.decompress(body), "inflated"
            except zlib.error:
                return zlib.decompress(body, -zlib.MAX_WBITS), "inflated(raw)"
        if enc == "br":
            if _brotli is None:
                return body, "brotli body - `pip install brotli` to decode"
            return _brotli.decompress(body), "de-brotli'd"
        if enc == "zstd":
            if _zstd is None:
                return body, "zstd body - `pip install zstandard` to decode"
            return _zstd.ZstdDecompressor().decompress(body), "de-zstd'd"
    except Exception as e:
        return body, f"{enc} decode failed: {e}"
    return body, f"unknown encoding {enc}"


def body_view(hd, raw_body):
    """(display_text, is_binary, note) for a body given its headers dict."""
    data, note = _decompress(hd.get("content-encoding", ""), raw_body)
    ctype = hd.get("content-type", "").lower()
    try:
        text = data.decode("utf-8")
        decodable = True
    except Exception:
        decodable = False
        text = ""
    if decodable and _mostly_text(data):
        if len(text) > MAX_STORE_BODY:
            text = text[:MAX_STORE_BODY] + "\n\n... [truncated by aerocall] ..."
        return text, False, note
    label = f"[binary body: {len(raw_body)} bytes"
    if note:
        label += f"; {note}"
    if ctype:
        label += f"; {ctype}"
    return label + "]", True, note


def _preview(text, n=400):
    text = text.replace("\r", " ").replace("\n", " ")
    return text[:n] + (" ..." if len(text) > n else "")


# ===========================================================================
# Flow model + thread-safe store.
# ===========================================================================
class Flow:
    def __init__(self, fid, meta, source):
        self.id = fid
        self.ts = time.time()
        self.source = source            # "proxy" or "builder"
        self.scheme = meta["scheme"]
        self.host = meta["host"]
        self.port = meta["port"]
        self.url = meta["url"]
        self.method = meta.get("method", "?")
        self.path = meta.get("path", "/")
        self.req_headers = []
        self.req_body_text = ""
        self.req_body_size = 0
        self.req_is_binary = False
        self.status = 0
        self.reason = ""
        self.ctype = ""
        self.resp_headers = []
        self.resp_body_text = ""
        self.resp_body_size = 0
        self.resp_is_binary = False
        self.resp_encoding = ""
        self.duration_ms = 0.0
        self.error = None
        self.findings = []

    def set_request(self, request_bytes):
        method, target, headers, body = parse_request(request_bytes)
        self.method, self.path, self.req_headers = method, target, headers
        hd = {k.lower(): v for k, v in headers}
        self.req_body_text, self.req_is_binary, _ = body_view(hd, body)
        self.req_body_size = len(body)

    def set_response(self, resp_bytes):
        if not resp_bytes:
            return
        status, reason, headers, body = parse_response(resp_bytes)
        self.status, self.reason, self.resp_headers = status, reason, headers
        hd = {k.lower(): v for k, v in headers}
        self.ctype = hd.get("content-type", "")
        self.resp_encoding = hd.get("content-encoding", "")
        self.resp_body_text, self.resp_is_binary, _ = body_view(hd, body)
        self.resp_body_size = len(body)

    def raw_request(self):
        lines = [f"{self.method} {self.path} HTTP/1.1"]
        lines += [f"{k}: {v}" for k, v in self.req_headers]
        return "\n".join(lines) + "\n\n" + (self.req_body_text if not self.req_is_binary else "")

    def raw_response(self):
        lines = [f"HTTP/1.1 {self.status} {self.reason}".rstrip()]
        lines += [f"{k}: {v}" for k, v in self.resp_headers]
        return "\n".join(lines) + "\n\n" + (self.resp_body_text if not self.resp_is_binary else "")

    def cookies(self):
        out = []
        for k, v in self.resp_headers:
            if k.lower() == "set-cookie":
                name = v.split(";", 1)[0]
                out.append({"host": self.host, "raw": v, "pair": name})
        return out

    def summary(self):
        return {
            "id": self.id, "ts": self.ts, "source": self.source,
            "method": self.method, "scheme": self.scheme, "host": self.host,
            "port": self.port, "path": self.path, "url": self.url,
            "status": self.status, "reason": self.reason,
            "length": self.resp_body_size, "ctype": self.ctype.split(";")[0],
            "duration_ms": round(self.duration_ms, 1), "error": self.error,
            "findings": len(self.findings), "sev": _worst_sev(self.findings),
        }

    def detail(self):
        d = self.summary()
        d.update({
            "req_headers": self.req_headers,
            "req_body_text": self.req_body_text,
            "req_body_size": self.req_body_size,
            "req_is_binary": self.req_is_binary,
            "raw_request": self.raw_request(),
            "raw_response": self.raw_response(),
            "resp_headers": self.resp_headers,
            "resp_body_text": self.resp_body_text,
            "resp_body_size": self.resp_body_size,
            "resp_is_binary": self.resp_is_binary,
            "resp_encoding": self.resp_encoding,
            "findings_detail": self.findings,
        })
        return d


class FlowStore:
    def __init__(self, cap=MAX_FLOWS):
        self._lock = threading.Lock()
        self._flows = []
        self._by_id = {}
        self._next = 1
        self.cap = cap

    def new_id(self):
        with self._lock:
            fid = self._next
            self._next += 1
            return fid

    def add(self, flow):
        with self._lock:
            self._flows.append(flow)
            self._by_id[flow.id] = flow
            while len(self._flows) > self.cap:
                old = self._flows.pop(0)
                self._by_id.pop(old.id, None)

    def summaries_after(self, after_id):
        with self._lock:
            return [f.summary() for f in self._flows if f.id > after_id]

    def get(self, fid):
        with self._lock:
            f = self._by_id.get(fid)
            return f.detail() if f else None

    def clear(self):
        with self._lock:
            self._flows.clear()
            self._by_id.clear()

    def cookies(self):
        jar = []
        seen = set()
        with self._lock:
            flows = list(self._flows)
        for f in reversed(flows):
            for c in f.cookies():
                key = (c["host"], c["pair"].split("=", 1)[0])
                if key in seen:
                    continue
                seen.add(key)
                jar.append(c)
        return jar

    def search(self, needle, limit=80):
        needle = (needle or "").strip().lower()
        if not needle:
            return []
        hits = []
        with self._lock:
            flows = list(self._flows)
        for f in reversed(flows):
            blob = " ".join([
                f.method, f.url, str(f.status), f.req_body_text or "",
                f.resp_body_text or "", f.error or "",
            ]).lower()
            if needle in blob:
                hits.append(f.summary())
                if len(hits) >= limit:
                    break
        return hits

    def all_findings(self):
        with self._lock:
            out = []
            for f in self._flows:
                for fd in f.findings:
                    out.append({"flow_id": f.id, "method": f.method, "url": f.url,
                                "status": f.status, **fd})
            return out

    def to_har(self):
        entries = []
        with self._lock:
            flows = list(self._flows)
        for f in flows:
            started = datetime.datetime.fromtimestamp(f.ts, datetime.timezone.utc).isoformat()
            entries.append({
                "startedDateTime": started,
                "time": f.duration_ms,
                "request": {
                    "method": f.method,
                    "url": f.url,
                    "httpVersion": "HTTP/1.1",
                    "headers": [{"name": k, "value": v} for k, v in f.req_headers],
                    "queryString": [],
                    "cookies": [],
                    "headersSize": -1,
                    "bodySize": f.req_body_size,
                    "postData": {"mimeType": "", "text": f.req_body_text if not f.req_is_binary else ""},
                },
                "response": {
                    "status": f.status,
                    "statusText": f.reason,
                    "httpVersion": "HTTP/1.1",
                    "headers": [{"name": k, "value": v} for k, v in f.resp_headers],
                    "cookies": [],
                    "content": {
                        "size": f.resp_body_size,
                        "mimeType": f.ctype,
                        "text": f.resp_body_text if not f.resp_is_binary else "",
                    },
                    "redirectURL": "",
                    "headersSize": -1,
                    "bodySize": f.resp_body_size,
                },
                "cache": {},
                "timings": {"send": 0, "wait": f.duration_ms, "receive": 0},
            })
        return {
            "log": {
                "version": "1.2",
                "creator": {"name": "aerocall", "version": "2.0"},
                "entries": entries,
            }
        }


# ===========================================================================
# Passive scanner - Burp-style checks over each captured flow. No requests are
# sent; it only reads what already came back, so it can't break anything.
# ===========================================================================
_SEV_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}
ERROR_SIGNATURES = [
    ("you have an error in your sql syntax", "SQL syntax error disclosed"),
    ("sqlstate[", "SQL error disclosed"),
    ("traceback (most recent call last)", "Python stack trace disclosed"),
    ("warning: mysql", "PHP/MySQL error disclosed"),
    ("java.lang.nullpointerexception", "Java stack trace disclosed"),
    ("system.nullreferenceexception", ".NET exception disclosed"),
    ("microsoft ole db provider", "Database error disclosed"),
    ("pg::", "PostgreSQL error disclosed"),
    ("ora-0", "Oracle error disclosed"),
    ("undefined index:", "PHP notice disclosed"),
]


def _worst_sev(findings):
    return min((f["sev"] for f in findings), key=lambda s: _SEV_RANK.get(s, 9), default=None) if findings else None


def scan_flow(flow):
    """Return a list of {sev, title, detail} for one finished flow."""
    findings = []
    hdrs, cookies = {}, []
    for k, v in flow.resp_headers:
        lk = k.lower()
        hdrs.setdefault(lk, v)
        if lk == "set-cookie":
            cookies.append(v)
    ct = (flow.ctype or "").lower()
    is_html = "text/html" in ct
    https = flow.scheme == "https"
    reqct = next((v for k, v in flow.req_headers if k.lower() == "content-type"), "").lower()

    def add(sev, title, detail):
        findings.append({"sev": sev, "title": title, "detail": detail})

    if is_html and flow.status and flow.status < 400:
        if https and "strict-transport-security" not in hdrs:
            add("low", "Missing HSTS header", "No Strict-Transport-Security header on an HTTPS response.")
        if "content-security-policy" not in hdrs:
            add("low", "Missing Content-Security-Policy", "No CSP header; weaker defense against XSS and injection.")
        if "x-content-type-options" not in hdrs:
            add("info", "Missing X-Content-Type-Options", "No nosniff; the browser may MIME-sniff the response.")
        csp = hdrs.get("content-security-policy", "").lower()
        if "x-frame-options" not in hdrs and "frame-ancestors" not in csp:
            add("low", "No clickjacking protection", "Neither X-Frame-Options nor CSP frame-ancestors is set.")

    for c in cookies:
        low = c.lower()
        name = c.split("=", 1)[0].strip()
        attrs = [a.strip() for a in low.split(";")]
        if https and "secure" not in attrs:
            add("medium", "Cookie without Secure flag", f"Set-Cookie {name} may be sent over plain HTTP.")
        if "httponly" not in attrs:
            add("low", "Cookie without HttpOnly flag", f"Set-Cookie {name} is readable from JavaScript.")
        if not any(a.startswith("samesite") for a in attrs):
            add("info", "Cookie without SameSite", f"Set-Cookie {name} has no SameSite attribute.")

    for h in ("server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"):
        if h in hdrs and re.search(r"\d", hdrs[h]):
            add("info", "Server version disclosure", f"{h}: {hdrs[h]}")

    acao = hdrs.get("access-control-allow-origin", "")
    if acao == "*":
        add("info", "Permissive CORS (ACAO: *)", "Any origin can read non-credentialed responses.")
    elif acao and acao != "null" and hdrs.get("access-control-allow-credentials", "").lower() == "true":
        add("high", "CORS allows credentialed cross-origin reads", f"ACAO {acao} together with Allow-Credentials: true.")

    if not flow.resp_is_binary and flow.resp_body_text:
        body = flow.resp_body_text[:200000]
        low = body.lower()
        for needle, label in ERROR_SIGNATURES:
            if needle in low:
                add("medium", "Error or stack trace disclosed", label)
                break
        if is_html:
            vals, seen = [], 0
            qs = flow.path.split("?", 1)[1] if "?" in flow.path else ""
            try:
                vals += [v for _, v in parse_qsl(qs)]
                if "urlencoded" in reqct:
                    vals += [v for _, v in parse_qsl(flow.req_body_text or "")]
            except Exception:
                pass
            for v in vals:
                if 6 <= len(v) <= 120 and v in body:
                    add("medium", "Request input reflected in response", f"Value {v!r} is echoed into the HTML; check for XSS.")
                    seen += 1
                    if seen >= 5:
                        break
    return findings


# ===========================================================================
# Intruder - replay a request many times with payloads swapped into marked
# positions (the Burp Intruder idea). Positions are wrapped in section marks,
# e.g.  GET /item?id=SS1SS HTTP/1.1  (default marker is the section sign).
# ===========================================================================
MAX_INTRUDER = 20000            # hard cap on requests per run
INTRUDER_DETAIL_CAP = 2000      # how many full responses to keep for inspection


def parse_template(tpl, marker="§"):
    """Split a marked template into (literals, base_values). None if unbalanced."""
    parts = tpl.split(marker)
    if len(parts) % 2 == 0:                 # even count of marks = unbalanced
        return None, None
    return parts[0::2], parts[1::2]


def fill_template(literals, values):
    out = [literals[0]]
    for i, v in enumerate(values):
        out.append(v)
        out.append(literals[i + 1])
    return "".join(out)


def attack_total(bases, attack, lists):
    p = len(bases)
    if p == 0 or not lists:
        return 0
    if attack == "sniper":
        return p * len(lists[0])
    if attack == "ram":
        return len(lists[0])
    if attack == "pitchfork":
        return min((len(lists[i]) for i in range(p)), default=0) if len(lists) >= p else 0
    if attack == "clusterbomb":
        if len(lists) < p:
            return 0
        t = 1
        for i in range(p):
            t *= len(lists[i])
        return t
    return 0


def attack_tasks(bases, attack, lists):
    """Yield (label, values) pairs - one per request to send."""
    p = len(bases)
    if attack == "sniper":
        for i in range(p):
            for pl in lists[0]:
                vals = list(bases)
                vals[i] = pl
                yield (f"{pl}  @{i + 1}", vals)
    elif attack == "ram":
        for pl in lists[0]:
            yield (pl, [pl] * p)
    elif attack == "pitchfork":
        for j in range(min(len(lists[i]) for i in range(p))):
            vals = [lists[i][j] for i in range(p)]
            yield (" | ".join(vals), vals)
    elif attack == "clusterbomb":
        for combo in itertools.product(*[lists[i] for i in range(p)]):
            yield (" | ".join(combo), list(combo))


class IntruderJob:
    def __init__(self, jid, scheme, host, port, literals, tasks, total, grep, concurrency):
        self.id = jid
        self.scheme, self.host, self.port = scheme, host, port
        self.literals, self.tasks, self.total = literals, tasks, total
        self.grep = grep or ""
        self.concurrency = max(1, min(50, concurrency))
        self.host_hdr = host if port == (443 if scheme == "https" else 80) else f"{host}:{port}"
        self.log = []               # completed rows, in finish order
        self.details = {}           # original index -> full detail dict (capped)
        self.sent = 0
        self.done = False
        self._next = 0
        self._lock = threading.Lock()
        self._loglock = threading.Lock()

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def cancel(self):
        with self._lock:
            self._next = self.total    # workers see nothing left to take

    def _run(self):
        workers = [threading.Thread(target=self._worker, daemon=True) for _ in range(self.concurrency)]
        for w in workers:
            w.start()
        for w in workers:
            w.join()
        self.done = True

    def _worker(self):
        while True:
            with self._lock:
                i = self._next
                if i >= self.total:
                    return
                self._next += 1
            label, values = self.tasks[i]
            row = self._send(i, label, values)
            with self._loglock:
                self.log.append(row)
                self.sent += 1

    def _send(self, idx, label, values):
        filled = fill_template(self.literals, values)
        request_bytes, _ = normalize_request(filled, True)
        t0 = time.time()
        status, reason, headers, body, err = 0, "", [], b"", None
        try:
            resp = forward_raw(self.scheme, self.host, self.port, request_bytes)
            if resp:
                status, reason, headers, body = parse_response(resp)
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
        ms = (time.time() - t0) * 1000
        hd = {k.lower(): v for k, v in headers}
        text, is_bin, _ = body_view(hd, body)
        matched = False
        if self.grep:
            hay = text + "\n" + "\n".join(f"{k}: {v}" for k, v in headers)
            matched = self.grep in hay
        row = {"n": idx, "payload": label, "status": status, "reason": reason,
               "length": len(body), "ctype": hd.get("content-type", "").split(";")[0],
               "time_ms": round(ms, 1), "matched": matched, "error": err}
        if idx < INTRUDER_DETAIL_CAP:
            method, path, rhdrs, rbody = parse_request(request_bytes)
            self.details[idx] = {
                "id": f"intruder-{self.id}-{idx}", "source": "intruder", "method": method,
                "scheme": self.scheme, "host": self.host, "port": self.port, "path": path,
                "url": f"{self.scheme}://{self.host_hdr}{path}", "status": status, "reason": reason,
                "length": len(body), "ctype": hd.get("content-type", "").split(";")[0],
                "duration_ms": round(ms, 1), "error": err,
                "req_headers": rhdrs, "req_body_text": rbody.decode("utf-8", "replace"),
                "req_body_size": len(rbody), "req_is_binary": False, "raw_request": filled,
                "resp_headers": headers, "resp_body_text": text, "resp_body_size": len(body),
                "resp_is_binary": is_bin, "resp_encoding": hd.get("content-encoding", ""),
                "findings": 0, "sev": None, "findings_detail": [],
            }
        return row


class IntruderManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._jobs = {}
        self._order = []
        self._next = 1

    def start(self, scheme, host, port, literals, tasks, total, grep, concurrency):
        with self._lock:
            jid = str(self._next)
            self._next += 1
            job = IntruderJob(jid, scheme, host, port, literals, tasks, total, grep, concurrency)
            self._jobs[jid] = job
            self._order.append(jid)
            while len(self._order) > 8:          # keep only recent runs
                self._jobs.pop(self._order.pop(0), None)
        job.start()
        return job

    def get(self, jid):
        with self._lock:
            return self._jobs.get(jid)


def log_flow(flow, verbose=False):
    """Console line for a finished flow (proxy or builder)."""
    dur = flow.duration_ms
    with PRINT_LOCK:
        who = "" if flow.source == "proxy" else f" {_c('90')}[{flow.source}]{_c('0')}"
        tag = f"{_c('36')}#{flow.id}{_c('0')} {_c('1')}{flow.method}{_c('0')} {flow.url}{who}"
        if flow.error and not flow.status:
            print(f"{tag}\n     -> {_c('31')}{flow.error}{_c('0')}")
        else:
            print(f"{tag}\n     -> {_color_status(flow.status)} {flow.reason}  "
                  f"{flow.ctype.split(';')[0]}  {flow.resp_body_size} bytes  "
                  f"{_c('90')}{dur:.0f}ms{_c('0')}")
        if verbose:
            for k, v in flow.req_headers:
                print(f"       {_c('90')}>{_c('0')} {k}: {v}")
            if flow.req_body_size:
                print(f"     {_c('90')}request body:{_c('0')} {_preview(flow.req_body_text)}")
            if not flow.resp_is_binary and flow.resp_body_text:
                print(f"     {_c('90')}response body:{_c('0')} {_preview(flow.resp_body_text)}")
            print()


# ===========================================================================
# Interceptor - pause requests, let the UI edit / forward / drop them.
# ===========================================================================
class InterceptController:
    def __init__(self):
        self.enabled = False
        self.side = "request"          # request | response | both
        self.url_filter = ""           # substring; empty = everything
        self._lock = threading.Lock()
        self._queue = {}
        self._next = 1

    def configure(self, on=None, side=None, url_filter=None):
        if on is not None:
            self.enabled = bool(on)
        if side in ("request", "response", "both"):
            self.side = side
        if url_filter is not None:
            self.url_filter = str(url_filter)
        if not self.enabled:
            with self._lock:
                for item in self._queue.values():
                    item["action"] = "forward"
                    item["event"].set()

    def set_enabled(self, on):
        self.configure(on=on)

    def _match(self, meta, side):
        if not self.enabled:
            return False
        if self.side not in (side, "both"):
            return False
        needle = (self.url_filter or "").strip().lower()
        if needle and needle not in (meta.get("url") or "").lower():
            return False
        return True

    def _park(self, meta, raw_bytes, side):
        ev = threading.Event()
        with self._lock:
            pid = self._next
            self._next += 1
            self._queue[pid] = {
                "id": pid, "meta": meta, "side": side, "event": ev,
                "text": raw_bytes.decode("utf-8", "replace"),
                "result": raw_bytes, "action": "forward",
            }
        fired = ev.wait(timeout=300)
        with self._lock:
            item = self._queue.pop(pid, None)
        if not fired or item is None:
            return raw_bytes
        return None if item["action"] == "drop" else item["result"]

    def park(self, meta, request_bytes):
        if not self._match(meta, "request"):
            return request_bytes
        return self._park(meta, request_bytes, "request")

    def park_response(self, meta, response_bytes):
        if not response_bytes or not self._match(meta, "response"):
            return response_bytes
        return self._park(meta, response_bytes, "response")

    def resolve(self, pid, action, raw_text=None, fix_length=True):
        with self._lock:
            item = self._queue.get(pid)
            if not item:
                return False
            if action == "drop":
                item["action"] = "drop"
            else:
                if raw_text is not None:
                    if item.get("side") == "response":
                        item["result"], _ = normalize_response(raw_text, fix_length)
                    else:
                        item["result"], _ = normalize_request(raw_text, fix_length)
                item["action"] = "forward"
            item["event"].set()
        return True

    def queue_list(self):
        with self._lock:
            return [{"id": i["id"], "side": i.get("side", "request"),
                     "method": i["meta"].get("method", "?"),
                     "url": i["meta"].get("url", ""), "text": i["text"]}
                    for i in self._queue.values()]

    def snapshot(self):
        return {"enabled": self.enabled, "side": self.side, "url_filter": self.url_filter}


class RewriteEngine:
    """Literal or regex find/replace on captured request/response bytes."""

    def __init__(self):
        self._lock = threading.Lock()
        self.rules = []
        self._next = 1

    def list(self):
        with self._lock:
            return [dict(r) for r in self.rules]

    def replace_all(self, rules):
        cleaned = []
        nid = 1
        for r in rules or []:
            find = str(r.get("find") or "")
            if not find:
                continue
            cleaned.append({
                "id": nid,
                "enabled": bool(r.get("enabled", True)),
                "side": r.get("side") if r.get("side") in ("request", "response") else "request",
                "target": r.get("target") if r.get("target") in ("url", "header", "body") else "body",
                "find": find,
                "replace": str(r.get("replace") or ""),
                "regex": bool(r.get("regex")),
            })
            nid += 1
        with self._lock:
            self.rules = cleaned
            self._next = nid
        return self.list()

    def apply(self, raw_bytes, side):
        with self._lock:
            active = [r for r in self.rules if r["enabled"] and r["side"] == side]
        if not active or not raw_bytes:
            return raw_bytes
        try:
            text = raw_bytes.decode("utf-8")
            binary = False
        except Exception:
            text = raw_bytes.decode("latin-1", "replace")
            binary = True
        head, sep, body = text.partition("\n\n")
        if "\r\n\r\n" in text and sep != "\r\n\r\n":
            head, sep, body = text.partition("\r\n\r\n")
        lines = head.splitlines()
        start = lines[0] if lines else ""
        headers = lines[1:]
        for rule in active:
            find, repl = rule["find"], rule["replace"]
            def sub(s):
                if rule["regex"]:
                    try:
                        return re.sub(find, repl, s)
                    except re.error:
                        return s
                return s.replace(find, repl)
            if rule["target"] == "url":
                start = sub(start)
            elif rule["target"] == "header":
                headers = [sub(h) for h in headers]
            else:
                body = sub(body)
        rebuilt = "\r\n".join([start] + headers) + "\r\n\r\n" + body
        if binary:
            return rebuilt.encode("latin-1", "replace")
        if side == "request":
            out, _ = normalize_request(rebuilt.replace("\r\n", "\n"), True)
            return out
        out, _ = normalize_response(rebuilt.replace("\r\n", "\n"), True)
        return out


class ScopeFilter:
    def __init__(self):
        self.include = []   # host/url substrings; empty = all
        self.exclude = []
        self.hide_static = False

    def configure(self, include=None, exclude=None, hide_static=None):
        if include is not None:
            self.include = [s.strip() for s in include if str(s).strip()]
        if exclude is not None:
            self.exclude = [s.strip() for s in exclude if str(s).strip()]
        if hide_static is not None:
            self.hide_static = bool(hide_static)

    def snapshot(self):
        return {"include": list(self.include), "exclude": list(self.exclude),
                "hide_static": self.hide_static}

    def record(self, url, host, path, ctype=""):
        blob = f"{host} {url}".lower()
        if self.exclude and any(x.lower() in blob for x in self.exclude):
            return False
        if self.include and not any(x.lower() in blob for x in self.include):
            return False
        if self.hide_static:
            p = (path or "").lower().split("?", 1)[0]
            if re.search(r"\.(css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|avi)(?:$|\?)", p):
                return False
            if any(x in (ctype or "").lower() for x in (
                    "image/", "font/", "text/css", "javascript", "video/", "audio/")):
                return False
        return True


def load_collections():
    try:
        with open(COLLECTIONS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_collections(items):
    cleaned = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        cleaned.append({
            "id": it.get("id") or str(int(time.time() * 1000)),
            "name": str(it.get("name") or "untitled")[:80],
            "method": str(it.get("method") or "GET")[:16],
            "url": str(it.get("url") or ""),
            "headers": it.get("headers") if isinstance(it.get("headers"), list) else [],
            "body": str(it.get("body") or ""),
            "jsonMode": bool(it.get("jsonMode", True)),
        })
    with open(COLLECTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)
    return cleaned


# ===========================================================================
# The proxy.
# ===========================================================================
class ProxyServer:
    def __init__(self, ca, store, intercept, rewrite, scope, host="127.0.0.1", port=8080, verbose=False, display_host=None):
        self.ca = ca                      # None -> HTTPS is tunneled, not decrypted
        self.store = store
        self.intercept = intercept
        self.rewrite = rewrite
        self.scope = scope
        self.host, self.port, self.verbose = host, port, verbose
        self.display_host = display_host or host

    # ---- optional programmatic hook (edit responses in code if you like) ---
    def intercept_response(self, url, response_bytes):
        return response_bytes

    # ---- server loop -------------------------------------------------------
    def serve_forever(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((self.host, self.port))
        s.listen(200)
        print(f"[*] Proxy:    {self.display_host}:{self.port}   (set the browser's or phone's HTTP + HTTPS proxy to this)\n")
        try:
            while True:
                client, _ = s.accept()
                threading.Thread(target=self._safe, args=(client,), daemon=True).start()
        except KeyboardInterrupt:
            print("\n[*] Shutting down.")
        finally:
            s.close()

    def _safe(self, client):
        try:
            self._handle(client)
        except (ConnectionError, ssl.SSLError, socket.timeout, OSError):
            pass
        except Exception as e:
            with PRINT_LOCK:
                print(f"[!] {e!r}")
        finally:
            try:
                client.close()
            except Exception:
                pass

    def _handle(self, client):
        client.settimeout(30)
        head, leftover = _read_headers(client)
        if not head:
            return
        start, headers = _parse_headers(head)
        method = start.split(" ", 1)[0].upper()
        if method == "CONNECT":
            hostport = start.split(" ")[1]
            host, _, port = hostport.partition(":")
            self._handle_https(client, host, int(port or 443))
        else:
            self._handle_http(client, start, headers, leftover, method)

    def _serve_one(self, client, scheme, host, port, start, headers, leftover, method):
        """Shared request/response path for both HTTP and HTTPS."""
        hdict = {k.lower(): v for k, v in headers}
        body = _read_request_body(client, hdict, leftover, method)
        hostport = host if port == (443 if scheme == "https" else 80) else f"{host}:{port}"
        url = f"{scheme}://{hostport}{_path_of(start)}"
        meta = {"scheme": scheme, "host": host, "port": port,
                "path": _path_of(start), "url": url, "method": method}

        request_bytes = _build_origin_request(start, headers, body, host)
        request_bytes = self.rewrite.apply(request_bytes, "request")
        request_bytes = self.intercept.park(meta, request_bytes)   # may block
        if request_bytes is None:                                  # dropped
            try:
                client.sendall(b"HTTP/1.1 502 Dropped by aerocall\r\n"
                               b"Content-Length: 0\r\n\r\n")
            except Exception:
                pass
            self._record(meta, _build_origin_request(start, headers, body, host),
                         b"", 0.0, "dropped in interceptor")
            return

        t0 = time.time()
        err, response = None, b""
        try:
            response = forward_raw(scheme, host, port, request_bytes)
        except (ssl.SSLError, OSError) as e:
            err = f"origin error: {e}"
        dur = (time.time() - t0) * 1000
        if response:
            response = self.rewrite.apply(response, "response")
            response = self.intercept_response(url, response)
            parked = self.intercept.park_response(meta, response)
            if parked is None:
                try:
                    client.sendall(b"HTTP/1.1 502 Dropped by aerocall\r\n"
                                   b"Content-Length: 0\r\n\r\n")
                except Exception:
                    pass
                self._record(meta, request_bytes, response, dur, "response dropped in interceptor")
                return
            response = parked
            try:
                client.sendall(response)
            except Exception:
                pass
        self._record(meta, request_bytes, response, dur, err)

    def _handle_http(self, client, start, headers, leftover, method):
        target = start.split(" ")[1]
        hdict = {k.lower(): v for k, v in headers}
        if target.startswith("http://"):
            u = urlsplit(target)
            host, port = u.hostname, (u.port or 80)
        else:
            host, _, p = hdict.get("host", "").partition(":")
            port = int(p or 80)
        if not host:
            return
        self._serve_one(client, "http", host, port, start, headers, leftover, method)

    def _handle_https(self, client, host, port):
        if self.ca is None:
            return self._tunnel(client, host, port)
        client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        try:
            tls_client = self.ca.server_context_for(host).wrap_socket(client, server_side=True)
        except ssl.SSLError:
            with PRINT_LOCK:
                print(f"[!] TLS handshake failed for {host} - is the CA installed & trusted?")
            return
        tls_client.settimeout(30)
        head, leftover = _read_headers(tls_client)
        if not head:
            return
        start, headers = _parse_headers(head)
        method = start.split(" ", 1)[0].upper()
        self._serve_one(tls_client, "https", host, port, start, headers, leftover, method)

    def _tunnel(self, client, host, port):
        """CONNECT passthrough used when HTTPS can't be decrypted (no CA)."""
        hostport = host if port == 443 else f"{host}:{port}"
        meta = {"scheme": "https", "host": host, "port": port, "path": hostport,
                "url": f"https://{hostport}", "method": "CONNECT"}
        flow = Flow(self.store.new_id(), meta, source="proxy")
        try:
            origin = socket.create_connection((host, port), timeout=30)
        except OSError as e:
            client.sendall(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
            flow.error = f"tunnel failed: {e}"
            self.store.add(flow)
            log_flow(flow, self.verbose)
            return
        client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        flow.status, flow.reason = 200, "tunneled, not decrypted (pip install cryptography)"
        self.store.add(flow)
        log_flow(flow, self.verbose)
        client.settimeout(None)
        origin.settimeout(None)
        try:
            while True:
                ready, _, _ = select.select([client, origin], [], [], 60)
                if not ready:
                    return
                for s in ready:
                    data = s.recv(65536)
                    if not data:
                        return
                    (origin if s is client else client).sendall(data)
        except OSError:
            pass
        finally:
            try:
                origin.close()
            except Exception:
                pass

    def _record(self, meta, request_bytes, response_bytes, dur, err):
        flow = Flow(self.store.new_id(), meta, source="proxy")
        flow.set_request(request_bytes)
        flow.set_response(response_bytes)
        flow.duration_ms = dur
        flow.error = err
        flow.findings = scan_flow(flow)
        path = meta.get("path") or flow.path
        ctype = flow.ctype
        if self.scope and not self.scope.record(flow.url, flow.host, path, ctype):
            return
        self.store.add(flow)
        log_flow(flow, self.verbose)


# ===========================================================================
# App icons (favicon + Add-to-Home-Screen), drawn on the fly - no image libs.
# ===========================================================================
ICON_SVG = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><radialGradient id='g' cx='35%' cy='30%' r='75%'>"
            "<stop offset='0' stop-color='#fff'/><stop offset='.22' stop-color='#ffd6a6'/><stop offset='.62' stop-color='#ff7a1a'/>"
            "<stop offset='1' stop-color='#b33d00'/></radialGradient></defs><circle cx='32' cy='32' r='30' fill='url(#g)'/>"
            "<ellipse cx='26' cy='18' rx='14' ry='8' fill='#fff' opacity='.55'/></svg>")
_ICON_CACHE = {}


def icon_png(size=180):
    """Sunset sky with the glossy orb, as a PNG (RGBA, hand-packed)."""
    def mix(a, b, t):
        return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

    def ramp(stops, t):
        t = max(0.0, min(1.0, t))
        n = len(stops) - 1
        i = min(int(t * n), n - 1)
        return mix(stops[i], stops[i + 1], t * n - i)

    sky = [(255, 244, 227), (255, 207, 147), (255, 143, 46), (217, 79, 0)]
    orb = [(255, 255, 255), (255, 214, 166), (255, 122, 26), (179, 61, 0)]
    cx = cy = size / 2
    r = size * 0.34
    hx, hy = cx - r * 0.3, cy - r * 0.4
    rows = []
    for y in range(size):
        row = bytearray(b"\x00")
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            col = ramp(sky, y / (size - 1))
            d = math.hypot(px - cx, py - cy)
            if d < r + 0.8:
                col = mix(col, ramp(orb, math.hypot(px - hx, py - hy) / (r * 1.6)), max(0.0, min(1.0, r + 0.8 - d)))
            row += bytes(col) + b"\xff"
        rows.append(bytes(row))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


# ===========================================================================
# Dashboard: JSON API + the single-page web UI.
# ===========================================================================
class Dashboard(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, addr, store, intercept, rewrite, scope, ca, proxy_addr, verbose=False, lan_ip_addr=None, intruder=None):
        super().__init__(addr, DashHandler)
        self.store = store
        self.intercept = intercept
        self.rewrite = rewrite
        self.scope = scope
        self.intruder = intruder
        self.ca = ca
        self.proxy_addr = proxy_addr      # (host, port) or None
        self.verbose = verbose
        self.lan_ip = lan_ip_addr         # set with --lan; drives the Phone setup panel


class DashHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass  # keep the terminal clean

    # -- helpers --
    def _send(self, code, body, ctype="application/json", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        headers = {"Content-Type": ctype, "Content-Length": str(len(body)), "Cache-Control": "no-store"}
        headers.update(extra or {})
        self.send_response(code)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        if not n:
            return {}
        if n > 64 * 1024 * 1024:            # a builder request body, not a file upload
            self.rfile.read(min(n, 1 << 20))
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    def _authed(self):
        """True when the caller may use the data/command API. Off by default
        (loopback); on under --lan, where a valid session cookie (set only when
        the page was opened with the correct ?t= token) or the token header is
        required. secrets.compare_digest keeps the check constant-time."""
        if not REQUIRE_AUTH:
            return True
        for part in (self.headers.get("Cookie", "") or "").split(";"):
            part = part.strip()
            if part.startswith("act=") and secrets.compare_digest(part[4:], UI_TOKEN):
                return True
        tok = self.headers.get("X-AeroCall-Token", "")
        return bool(tok) and secrets.compare_digest(tok, UI_TOKEN)

    # -- routing --
    def do_GET(self):
        try:
            path = urlsplit(self.path).path
            query = parse_qs(urlsplit(self.path).query)
            store = self.server.store
            # These are safe to serve to anyone who can reach the port: the page
            # shell, the public CA cert, icons, and QR images. Everything else
            # under /api is gated by _authed() when --lan is on.
            open_paths = {"/ca", "/ca.pem", "/ca.crt", "/cert", "/icon.svg", "/icon.png",
                          "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/api/qr"}
            if path != "/" and path not in open_paths and not self._authed():
                return self._send(403, {"error": "unauthorized - open the UI with the link printed in the aerocall terminal"})
            if path == "/":
                # Hand the page a session cookie only when it arrived with the
                # right token (or when auth is off). SameSite=Strict + HttpOnly
                # so it is never sent cross-site and JS can't read it.
                extra = {}
                tok = query.get("t", [""])[0]
                if not REQUIRE_AUTH or (tok and secrets.compare_digest(tok, UI_TOKEN)):
                    extra["Set-Cookie"] = f"act={UI_TOKEN}; Path=/; SameSite=Strict; HttpOnly"
                return self._send(200, INDEX_HTML, "text/html; charset=utf-8", extra)
            if path in ("/ca", "/ca.pem", "/ca.crt", "/cert"):
                if self.server.ca is None:
                    return self._send(404, "HTTPS interception is off. pip install cryptography, then restart.",
                                      "text/plain; charset=utf-8")
                with open(CA_CERT_PATH, "rb") as f:
                    data = f.read()
                # x-x509-ca-cert makes iPhone Safari offer the profile install and Firefox its import dialog.
                return self._send(200, data, "application/x-x509-ca-cert",
                                  {"Content-Disposition": 'inline; filename="aerocall-ca.crt"'})
            if path == "/icon.svg":
                return self._send(200, ICON_SVG, "image/svg+xml", {"Cache-Control": "max-age=86400"})
            if path in ("/icon.png", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"):
                if "png" not in _ICON_CACHE:
                    _ICON_CACHE["png"] = icon_png()
                return self._send(200, _ICON_CACHE["png"], "image/png", {"Cache-Control": "max-age=86400"})
            if path == "/api/qr":
                text = query.get("text", [""])[0][:134]
                svg = qr_svg(text) if text else None
                if not svg:
                    return self._send(400, {"error": "nothing to encode, or too long for a QR code"})
                return self._send(200, svg, "image/svg+xml", {"Cache-Control": "max-age=3600"})
            if path == "/api/state":
                pa = self.server.proxy_addr
                ic = self.server.intercept.snapshot()
                return self._send(200, {
                    "proxy": {"host": pa[0], "port": pa[1]} if pa else None,
                    "https_intercept": self.server.ca is not None,
                    "intercept": ic["enabled"],
                    "intercept_side": ic["side"],
                    "intercept_filter": ic["url_filter"],
                    "insecure": INSECURE,
                    "have_brotli": _brotli is not None,
                    "have_zstd": _zstd is not None,
                    "lan_ip": self.server.lan_ip,
                    "ui_port": self.server.server_port,
                    "token": UI_TOKEN if REQUIRE_AUTH else "",
                    "scope": self.server.scope.snapshot(),
                    "rules": self.server.rewrite.list(),
                    "version": "2.0",
                })
            if path == "/api/cookies":
                return self._send(200, {"cookies": self.server.store.cookies()})
            if path == "/api/search":
                q = (query.get("q", [""])[0] or "")[:200]
                return self._send(200, {"hits": self.server.store.search(q)})
            if path == "/api/rules":
                return self._send(200, {"rules": self.server.rewrite.list()})
            if path == "/api/findings":
                return self._send(200, {"findings": store.all_findings()})
            if path == "/api/collections":
                return self._send(200, {"items": load_collections()})
            if path == "/api/har":
                har = json.dumps(self.server.store.to_har()).encode("utf-8")
                return self._send(200, har, "application/json",
                                  {"Content-Disposition": 'attachment; filename="aerocall.har"'})
            if path == "/api/flows":
                after = int((query.get("after", ["0"])[0]) or 0)
                flows = store.summaries_after(after)
                last = flows[-1]["id"] if flows else after
                return self._send(200, {"flows": flows, "last": last})
            if path.startswith("/api/flow/"):
                fid = int(path.rsplit("/", 1)[-1])
                d = store.get(fid)
                return self._send(200 if d else 404, d or {"error": "not found"})
            if path == "/api/intruder/status":
                job = self.server.intruder.get(query.get("id", [""])[0])
                if not job:
                    return self._send(404, {"error": "no such job"})
                after = int((query.get("after", ["0"])[0]) or 0)
                with job._loglock:
                    rows = job.log[after:]
                    sent = job.sent
                return self._send(200, {"total": job.total, "sent": sent, "done": job.done, "results": rows})
            if path == "/api/intruder/result":
                job = self.server.intruder.get(query.get("id", [""])[0])
                if not job:
                    return self._send(404, {"error": "no such job"})
                n = int((query.get("n", ["-1"])[0]) or -1)
                d = job.details.get(n)
                if d:
                    return self._send(200, d)
                return self._send(404, {"error": "response not retained (past the inspection limit) - re-send it from the builder"})
            if path == "/api/intercept/queue":
                return self._send(200, {"enabled": self.server.intercept.enabled,
                                        "items": self.server.intercept.queue_list()})
            return self._send(404, {"error": "not found"})
        except Exception as e:
            return self._send(500, {"error": repr(e)})

    def do_POST(self):
        try:
            # A custom header can't be set by a cross-site form post, so this
            # keeps random web pages from driving the local API.
            if self.headers.get("X-AeroCall") != "1":
                return self._send(403, {"error": "missing X-AeroCall header"})
            if not self._authed():
                return self._send(403, {"error": "unauthorized - open the UI with the link printed in the aerocall terminal"})
            path = urlsplit(self.path).path
            data = self._read_json()
            if path == "/api/send":
                return self._api_send(data)
            if path == "/api/clear":
                self.server.store.clear()
                return self._send(200, {"ok": True})
            if path == "/api/intruder/start":
                return self._api_intruder_start(data)
            if path == "/api/intruder/stop":
                job = self.server.intruder.get(str(data.get("id", "")))
                if job:
                    job.cancel()
                return self._send(200, {"ok": bool(job)})
            if path == "/api/intercept/toggle":
                self.server.intercept.configure(
                    on=data.get("on"),
                    side=data.get("side"),
                    url_filter=data.get("url_filter") if "url_filter" in data else None)
                return self._send(200, self.server.intercept.snapshot())
            if path == "/api/intercept/resolve":
                ok = self.server.intercept.resolve(
                    int(data["id"]), data.get("action", "forward"),
                    data.get("raw"), bool(data.get("fix_length", True)))
                return self._send(200 if ok else 404, {"ok": ok})
            if path == "/api/rules":
                rules = self.server.rewrite.replace_all(data.get("rules") or [])
                return self._send(200, {"rules": rules})
            if path == "/api/scope":
                self.server.scope.configure(
                    include=data.get("include"),
                    exclude=data.get("exclude"),
                    hide_static=data.get("hide_static"))
                return self._send(200, self.server.scope.snapshot())
            if path == "/api/collections":
                items = save_collections(data.get("items") or [])
                return self._send(200, {"items": items})
            return self._send(404, {"error": "not found"})
        except Exception as e:
            return self._send(500, {"error": repr(e)})

    def _api_intruder_start(self, data):
        """Validate an Intruder run, expand the attack, and launch it."""
        u = urlsplit(str(data.get("url") or "").strip())
        scheme = (u.scheme or "").lower()
        if scheme not in ("http", "https") or not u.hostname:
            return self._send(400, {"error": "Target URL must start with http:// or https:// and include a host"})
        try:
            port = u.port or (443 if scheme == "https" else 80)
        except ValueError:
            return self._send(400, {"error": "invalid port"})
        marker = data.get("marker") or "§"
        literals, bases = parse_template(str(data.get("template") or ""), marker)
        if literals is None:
            return self._send(400, {"error": f"Unbalanced {marker} markers - each position needs an opening and closing mark"})
        p = len(bases)
        if p < 1:
            return self._send(400, {"error": "Mark at least one position: select text in the template and use Mark selection"})
        attack = data.get("attack") or "sniper"
        lists = [[str(x) for x in pl] for pl in (data.get("payloads") or [])]
        lists = [pl for pl in lists]
        if attack in ("sniper", "ram"):
            if not lists or not lists[0]:
                return self._send(400, {"error": "Add at least one payload"})
        else:
            if len(lists) < p or any(not lists[i] for i in range(p)):
                return self._send(400, {"error": f"{attack} needs a payload list for each of the {p} positions"})
        total = attack_total(bases, attack, lists)
        if total <= 0:
            return self._send(400, {"error": "That combination produces no requests"})
        if total > MAX_INTRUDER:
            return self._send(400, {"error": f"That would send {total} requests; the cap is {MAX_INTRUDER}. Trim the payloads or attack type."})
        tasks = list(attack_tasks(bases, attack, lists))
        try:
            concurrency = int(data.get("concurrency") or 10)
        except (TypeError, ValueError):
            concurrency = 10
        job = self.server.intruder.start(scheme, u.hostname, port, literals, tasks, total,
                                         data.get("grep") or "", concurrency)
        return self._send(200, {"id": job.id, "total": total})

    def _api_send(self, data):
        """Builder -> origin. Structured request in, full flow detail out."""
        method = str(data.get("method") or "GET").strip().upper()
        if not method.isalpha():
            return self._send(400, {"error": "invalid method"})
        u = urlsplit(str(data.get("url") or "").strip())
        scheme = (u.scheme or "").lower()
        if scheme not in ("http", "https") or not u.hostname:
            return self._send(400, {"error": "URL must start with http:// or https:// and include a host"})
        host = u.hostname
        try:
            port = u.port or (443 if scheme == "https" else 80)
        except ValueError:
            return self._send(400, {"error": "invalid port"})
        path = (u.path or "/") + (("?" + u.query) if u.query else "")
        host_hdr = host if port == (443 if scheme == "https" else 80) else f"{host}:{port}"

        lines, seen = [f"{method} {path} HTTP/1.1"], set()
        for pair in data.get("headers") or []:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            k, v = str(pair[0]).strip(), str(pair[1]).strip()
            if not k or "\n" in k + v or "\r" in k + v:
                continue
            lines.append(f"{k}: {v}")
            seen.add(k.lower())
        if "host" not in seen:
            lines.insert(1, f"Host: {host_hdr}")
        if "user-agent" not in seen:
            lines.append("User-Agent: aerocall/1.0")
        if "accept" not in seen:
            lines.append("Accept: */*")
        body = data.get("body")
        body = "" if body is None else str(body)
        follow = bool(data.get("follow_redirects"))
        try:
            timeout = max(1, min(120, int(data.get("timeout") or 30)))
        except Exception:
            timeout = 30
        try:
            count = max(1, min(50, int(data.get("count") or 1)))
        except Exception:
            count = 1

        last = None
        for i in range(count):
            rendered = body.replace("{{i}}", str(i)).replace("{{n}}", str(i + 1))
            url_now = str(data.get("url") or "").replace("{{i}}", str(i)).replace("{{n}}", str(i + 1))
            u_i = urlsplit(url_now.strip()) if "{{" in str(data.get("url") or "") else u
            if "{{" in str(data.get("url") or ""):
                if (u_i.scheme or "").lower() in ("http", "https") and u_i.hostname:
                    scheme, host = u_i.scheme.lower(), u_i.hostname
                    try:
                        port = u_i.port or (443 if scheme == "https" else 80)
                    except ValueError:
                        port = 443 if scheme == "https" else 80
                    path = (u_i.path or "/") + (("?" + u_i.query) if u_i.query else "")
                    host_hdr = host if port == (443 if scheme == "https" else 80) else f"{host}:{port}"
            start_line = f"{method} {path} HTTP/1.1"
            raw = start_line + "\n" + "\n".join(lines[1:]) + "\n\n" + rendered
            request_bytes, _ = normalize_request(raw, True)
            request_bytes = self.server.rewrite.apply(request_bytes, "request")

            meta = {"scheme": scheme, "host": host, "port": port, "path": path,
                    "url": f"{scheme}://{host_hdr}{path}", "method": method}
            t0 = time.time()
            err, response = None, b""
            try:
                if follow:
                    response, _hops = forward_with_redirects(
                        scheme, host, port, request_bytes, timeout=timeout)
                else:
                    response = forward_raw(scheme, host, port, request_bytes, timeout=timeout)
                response = self.server.rewrite.apply(response, "response")
            except Exception as e:
                err = f"origin error: {e}"
            flow = Flow(self.server.store.new_id(), meta, source="builder")
            flow.set_request(request_bytes)
            flow.set_response(response)
            flow.duration_ms = (time.time() - t0) * 1000
            flow.error = err
            flow.findings = scan_flow(flow)
            self.server.store.add(flow)
            log_flow(flow, self.server.verbose)
            last = flow
        return self._send(200, last.detail() if last else {"error": "nothing sent"})


# --- the whole front-end, served as one page (vanilla JS, no dependencies) --
# The same page also works opened straight from disk: without the server it
# falls back to browser fetch() (subject to CORS) and hides the proxy features.
INDEX_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ff8f2e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="AeroCall">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.png">
<title>AeroCall</title>
<style>
:root{
  --ink:#4a2508;
  --ink-soft:#7a4a22;
  --mono:ui-monospace,"Cascadia Code","SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
html,body{margin:0;min-height:100%}
button,input,select,textarea,a{-webkit-tap-highlight-color:transparent}
button,a{touch-action:manipulation}
body{
  font-family:"Segoe UI",Frutiger,"Frutiger LT Std","Myriad Pro","Trebuchet MS","Helvetica Neue",Arial,sans-serif;
  font-size:14px;line-height:1.4;color:var(--ink);
  min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;
}

/* ---------- sky ---------- */
.sky{position:fixed;inset:0;z-index:-1;overflow:hidden;
  background:linear-gradient(180deg,#fff4e3 0%,#ffcf93 30%,#ff8f2e 68%,#d94f00 100%)}
.streak{position:absolute;left:-30%;width:160%;height:150px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);
  filter:blur(16px);transform:rotate(-15deg)}
.streak.s1{top:10%}
.streak.s2{top:44%;height:90px;opacity:.55;transform:rotate(-11deg)}
.glowspot{position:absolute;border-radius:50%;filter:blur(46px)}
.g1{width:560px;height:560px;left:-160px;top:-180px;background:rgba(255,255,255,.6)}
.g2{width:440px;height:440px;right:-140px;top:22%;background:rgba(255,224,190,.6)}
.meadow{position:absolute;left:-15%;right:-15%;bottom:-25%;height:55%;
  background:radial-gradient(ellipse at 50% 100%,rgba(255,214,80,.75),rgba(255,160,40,.35) 45%,transparent 72%)}
.bubble{position:absolute;border-radius:50%;
  background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.95) 0%,rgba(255,255,255,.38) 20%,rgba(255,255,255,.06) 48%,rgba(255,255,255,.26) 78%,rgba(255,255,255,.62) 100%);
  box-shadow:inset 0 0 14px rgba(255,255,255,.55),0 6px 18px rgba(120,50,0,.18);
  animation:drift 16s ease-in-out infinite}
.b1{width:92px;height:92px;left:7%;top:16%}
.b2{width:48px;height:48px;left:24%;top:66%;animation-delay:-5s}
.b3{width:130px;height:130px;right:10%;top:28%;animation-duration:23s}
.b4{width:64px;height:64px;right:30%;top:74%;animation-delay:-9s;animation-duration:19s}
.b5{width:34px;height:34px;left:56%;top:7%;animation-delay:-3s}
.b6{width:80px;height:80px;left:62%;bottom:6%;animation-duration:26s}
@keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-30px)}}
@media (prefers-reduced-motion:reduce){.bubble{animation:none}}

/* ---------- layout ---------- */
.app{max-width:1280px;margin:0 auto;display:grid;gap:16px;grid-template-columns:1fr;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.col{display:grid;gap:16px;align-content:start;min-width:0}
@media (min-width:900px){
  .app{grid-template-columns:1fr 1fr}
  .topbar,.pause,.phone{grid-column:1/-1}
}

/* ---------- glass ---------- */
.glass{position:relative;
  background:linear-gradient(180deg,rgba(255,255,255,.58),rgba(255,255,255,.3));
  border:1px solid rgba(255,255,255,.88);border-radius:16px;
  box-shadow:0 10px 30px rgba(120,50,0,.28),inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(120,50,0,.08);
  backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
  overflow:hidden}
.glass::before{content:"";position:absolute;left:0;right:0;top:0;height:58px;
  background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,0));
  border-radius:16px 16px 0 0;pointer-events:none}
.glass.pause{background:linear-gradient(180deg,rgba(255,226,222,.72),rgba(255,205,200,.45));border-color:rgba(255,240,238,.95)}
.panel{padding:14px}
.panel h2{font-size:15px;font-weight:600;margin:0 0 8px;position:relative}

/* ---------- top bar ---------- */
.topbar{padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:50%;position:relative;flex:none;
  background:radial-gradient(circle at 35% 30%,#fff 0%,#ffd6a6 22%,#ff7a1a 62%,#b33d00 100%);
  box-shadow:0 3px 8px rgba(90,30,0,.4),inset 0 -4px 8px rgba(0,0,0,.22)}
.orb::after{content:"";position:absolute;left:7px;top:4px;width:16px;height:9px;border-radius:50%;
  background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.1))}
h1{font-size:22px;font-weight:600;margin:0;letter-spacing:.2px;
  text-shadow:0 1px 0 rgba(255,255,255,.9),0 0 14px rgba(255,255,255,.7)}
.tagline{margin:0;color:var(--ink-soft);font-size:13px}
.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;position:relative}
.hint{font-size:12px;color:var(--ink-soft)}
kbd{font-family:inherit;font-size:11px;padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.9);
  background:linear-gradient(180deg,#fff,#ffe6cc);box-shadow:0 1px 0 rgba(120,50,0,.25)}
.chip{display:inline-flex;align-items:center;gap:7px;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:600;
  background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.95);
  box-shadow:inset 0 1px 0 #fff,0 1px 3px rgba(120,50,0,.15);cursor:default}
.dot{width:10px;height:10px;border-radius:50%;flex:none;
  background:radial-gradient(circle at 35% 30%,#fff,#d9c3b0 40%,#8c7462);box-shadow:0 0 0 1px rgba(0,0,0,.15)}
.dot.live{background:radial-gradient(circle at 35% 30%,#fff,#ffb870 30%,#f06a00);
  box-shadow:0 0 9px rgba(255,140,30,.85),0 0 0 1px rgba(140,60,0,.4)}

/* ---------- controls ---------- */
input[type=text],input[type=url],select,textarea{
  font:inherit;color:var(--ink);width:100%;min-width:0;
  background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.97));
  border:1px solid rgba(200,110,40,.5);border-radius:9px;padding:8px 10px;
  box-shadow:inset 0 2px 4px rgba(120,50,0,.12),0 1px 0 rgba(255,255,255,.6);outline:none}
input:focus,select:focus,textarea:focus{border-color:#ff8a2a;
  box-shadow:0 0 0 3px rgba(255,150,60,.4),inset 0 2px 4px rgba(120,50,0,.12)}
select{appearance:none;-webkit-appearance:none;padding-right:28px;cursor:pointer;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%234a2508' stroke-width='1.6'/></svg>"),linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.97));
  background-repeat:no-repeat,no-repeat;background-position:right 10px center,0 0;background-size:10px 6px,100% 100%}
textarea{min-height:150px;resize:vertical;font-family:var(--mono);font-size:12.5px;line-height:1.5}
.method{font-weight:700;letter-spacing:.3px}
.method[data-m="GET"]{color:#c77800}
.method[data-m="POST"]{color:#f06a00}
.method[data-m="PUT"]{color:#b8410c}
.method[data-m="PATCH"]{color:#e0a000}
.method[data-m="DELETE"]{color:#d1261b}
.method[data-m="HEAD"],.method[data-m="OPTIONS"]{color:#8c6b52}

.btn{font:inherit;font-weight:600;cursor:pointer;padding:8px 16px;border-radius:10px;color:#fff;
  text-shadow:0 1px 1px rgba(0,0,0,.35);border:1px solid rgba(140,60,0,.55);text-decoration:none;display:inline-block;
  background:linear-gradient(180deg,#ffe9b0 0%,#ffc24d 48%,#f5a000 52%,#ffb62b 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 2px 6px rgba(120,50,0,.25);
  transition:filter .12s,transform .05s;white-space:nowrap;line-height:normal}
.btn:hover{filter:brightness(1.08)}
.btn:active{transform:translateY(1px);filter:brightness(.95)}
.btn:focus-visible{outline:3px solid rgba(255,255,255,.9);outline-offset:1px}
.btn:disabled{filter:saturate(.4) brightness(1.05);cursor:default;transform:none}
.btn.send{border-color:rgba(140,30,0,.6);padding:8px 24px;font-size:15px;
  background:linear-gradient(180deg,#ffc9a8 0%,#ff7a3d 48%,#e8400a 52%,#ff6a2a 100%)}
.btn.drop{border-color:rgba(120,30,30,.55);
  background:linear-gradient(180deg,#ffd0cc 0%,#f2604f 48%,#d63b2a 52%,#ee6a55 100%)}
.btn.toggle.on{border-color:rgba(120,30,30,.55);
  background:linear-gradient(180deg,#ffd0cc 0%,#f2604f 48%,#d63b2a 52%,#ee6a55 100%)}
.btn.small{padding:4px 10px;font-size:12px;border-radius:8px}

.urlbar{display:grid;grid-template-columns:auto 1fr;gap:8px;position:relative}
.urlbar .method{width:118px}
.urlbar .send{grid-column:1/-1}
@media (min-width:560px){
  .urlbar{grid-template-columns:auto 1fr auto}
  .urlbar .send{grid-column:auto}
}

/* tabs */
.tabs{display:flex;gap:4px;margin:14px 0 10px;border-bottom:1px solid rgba(255,255,255,.75);align-items:flex-end}
.tab{font:inherit;font-weight:600;font-size:13px;padding:6px 12px;border:1px solid transparent;border-bottom:none;
  border-radius:10px 10px 0 0;background:transparent;color:var(--ink);cursor:pointer;opacity:.7}
.tab:hover{opacity:1}
.tab.active{opacity:1;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.55));
  border-color:rgba(255,255,255,.95);box-shadow:0 -2px 6px rgba(120,50,0,.1)}
.tab:focus-visible{outline:2px solid #ff8a2a;outline-offset:-2px}
.tabs .edit{margin-left:auto;margin-bottom:5px}
.pane{display:none}
.pane.active{display:block}

/* key / value rows */
.kv .row{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center}
.x{width:28px;height:28px;border-radius:50%;border:1px solid rgba(120,30,30,.5);color:#fff;font-weight:700;
  font-size:15px;line-height:1;cursor:pointer;padding:0;
  background:linear-gradient(180deg,#ffb3ad,#f2604f 50%,#d63b2a 51%,#ee6a55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 1px 4px rgba(0,0,0,.2)}
.x:hover{filter:brightness(1.08)}
.bodytools{display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:13px}
.bodytools label{display:flex;align-items:center;gap:6px;cursor:pointer}
.bodytools .btn{margin-left:auto}
.note{font-size:12px;color:var(--ink-soft);margin-top:6px;position:relative}
.warn-text{font-size:12px;color:#a02a00;margin-top:6px}
.hidden{display:none!important}

/* output panes (deep amber glass) */
.out{margin:0;padding:12px;min-height:120px;max-height:440px;overflow:auto;
  font-family:var(--mono);font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;
  color:#ffe9d2;
  background:linear-gradient(180deg,rgba(70,26,6,.88),rgba(48,17,4,.93));
  border:1px solid rgba(255,180,110,.4);border-radius:12px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 0 30px rgba(255,120,0,.16)}
.out .key{color:#ffc27a}
.out .str{color:#fff1d6}
.out .num{color:#ffd84d}
.out .bool{color:#ff9f6b}
.out .null{color:#e0b8a0}

.resphead,.codehead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:relative}
.resphead h2,.codehead h2{margin:0}
.meta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-soft);margin-left:auto}
.subtitle{font-family:var(--mono);font-size:12px;color:var(--ink-soft);margin-top:6px;word-break:break-all;position:relative}
.pill{padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;color:#fff;
  text-shadow:0 1px 1px rgba(0,0,0,.3);border:1px solid rgba(0,0,0,.2);
  background:linear-gradient(180deg,#c4b4a6,#8c7462 55%,#7a6555)}
.pill.ok{background:linear-gradient(180deg,#a5ec78,#46b81e 55%,#3aa116);border-color:rgba(20,90,20,.5)}
.pill.redir{background:linear-gradient(180deg,#ffe08a,#e0a000 55%,#c48c00);border-color:rgba(120,80,0,.5)}
.pill.warn{background:linear-gradient(180deg,#ffb37a,#f06a00 55%,#d15a00);border-color:rgba(140,60,0,.5)}
.pill.err{background:linear-gradient(180deg,#ffb3ad,#d63b2a 55%,#b92e1f);border-color:rgba(120,30,30,.5)}
.tabs.small{margin:10px 0 8px}
.tabs.small .tab{font-size:12px;padding:4px 10px}

.seg{display:inline-flex;border:1px solid rgba(160,80,20,.5);border-radius:999px;overflow:hidden;
  background:rgba(255,255,255,.55);box-shadow:inset 0 1px 2px rgba(120,50,0,.15)}
.seg button{font:inherit;font-size:12px;font-weight:600;padding:5px 13px;border:0;background:transparent;
  color:var(--ink);cursor:pointer}
.seg button.active{color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.3);
  background:linear-gradient(180deg,#ffd9a8,#ff9d3c 48%,#f06a00 52%,#ff8a1f)}
.seg button:focus-visible{outline:2px solid #ff8a2a;outline-offset:-2px}
.codehead .btn{margin-left:auto}
.codehead + .out{margin-top:10px}

/* traffic */
.traffic-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;position:relative}
.traffic-head h2{margin:0}
.traffic-head .count{font-size:12px;color:var(--ink-soft);white-space:nowrap}
.traffic-head input{flex:1;min-width:150px;padding:5px 9px;font-size:13px}
.flows{list-style:none;margin:10px 0 0;padding:0;max-height:420px;overflow:auto;position:relative}
.flows li{display:grid;grid-template-columns:auto auto 1fr auto;gap:8px;align-items:center;padding:6px 8px;border-radius:9px;
  cursor:pointer;background:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.8);margin-bottom:5px}
.flows li:hover{background:rgba(255,255,255,.65)}
.flows li.sel{background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,232,210,.9));border-color:#ffb26b;
  box-shadow:0 0 0 2px rgba(255,150,60,.35)}
.flows li.mine{border-left:3px solid #f06a00}
.flows .m{font-weight:700;font-size:11px;padding:2px 6px;border-radius:6px;color:#fff;background:#8c6b52;min-width:44px;text-align:center}
.flows .m.GET{background:#c77800}.flows .m.POST{background:#f06a00}.flows .m.PUT{background:#b8410c}
.flows .m.PATCH{background:#e0a000}.flows .m.DELETE{background:#d1261b}
.flows .st{font-family:var(--mono);font-size:12px;font-weight:700;min-width:26px;text-align:right}
.st.s2{color:#1f8f36}.st.s3{color:#c48c00}.st.s4{color:#f06a00}.st.s5,.st.s0{color:#cf2f26}
.flows .u{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono);font-size:12px;color:var(--ink-soft)}
.flows .u b{font-weight:600;color:var(--ink)}
.flows .sz{font-size:11px;color:var(--ink-soft);white-space:nowrap;text-align:right}
.empty{margin-top:10px;padding:14px;border-radius:10px;border:1px dashed rgba(200,110,40,.5);color:var(--ink-soft);font-size:13px;position:relative}

/* phone setup */
.phone .lead{margin:0 0 10px;font-size:13px;color:var(--ink-soft);position:relative}
.steps{display:grid;gap:12px;grid-template-columns:1fr;position:relative}
@media (min-width:900px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.9);border-radius:12px;padding:12px;min-width:0}
.step h3{font-size:14px;font-weight:600;margin:0 0 6px}
.step .qr{width:150px;height:150px;display:block;margin:6px 0;border:6px solid #fff;border-radius:8px;background:#fff;
  box-shadow:0 2px 8px rgba(120,50,0,.2)}
.step .url{font-family:var(--mono);font-size:12px;word-break:break-all;margin:4px 0 6px}
.step p{margin:6px 0 0;font-size:13px}
.step code,.phone code{font-family:var(--mono);font-size:12px;background:rgba(255,255,255,.7);padding:1px 4px;border-radius:4px}

/* phones and other small screens */
@media (max-width:600px){
  input[type=text],input[type=url],select,textarea{font-size:16px}   /* 16px keeps iOS from zooming into fields */
  .btn{min-height:42px;padding:10px 16px}
  .btn.small{min-height:36px;padding:6px 12px}
  .x{width:34px;height:34px}
  .tab{padding:9px 12px}
  .flows li{padding:9px 8px}
  .out{max-height:60vh}
  .step .qr{width:180px;height:180px}
}
@media (hover:none) and (pointer:coarse){.hint{display:none}}

.icfg,.rowish,.opts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0;position:relative}
.opts label,.icfg label,.quiet{font-size:13px;color:var(--ink-soft);display:flex;align-items:center;gap:6px}
.authline{display:flex;align-items:center;gap:8px;margin-top:8px;position:relative}
.authline input{flex:1}
.rule{display:grid;grid-template-columns:auto auto auto 1fr 1fr auto auto;gap:6px;align-items:center;margin-bottom:6px;position:relative}
@media (max-width:800px){.rule{grid-template-columns:1fr 1fr;}}
.rule select{min-width:0}
#decodepanel textarea,#pane-raw textarea{min-height:120px}

/* interceptor */
.icard{background:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.9);border-radius:12px;padding:10px;margin-top:10px;position:relative}
.icard .h{font-family:var(--mono);font-size:12px;word-break:break-all;margin-bottom:6px;font-weight:600}
.icard textarea{min-height:110px}
.icard .row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;font-size:13px}
.icard label{display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:auto}

/* tool panels (intruder / findings) */
.tool .lead{margin:0 0 10px;font-size:13px;color:var(--ink-soft)}
.irrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.irrow.spread{align-items:flex-end}
.field{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink-soft)}
.field input,.field select{padding:6px 8px}
.field .u{width:220px}
.field .n{width:78px}
.irtpl{min-height:120px;margin-bottom:8px}
.paybox{display:grid;gap:8px;grid-template-columns:1fr;margin-bottom:8px}
@media (min-width:720px){.paybox.multi{grid-template-columns:repeat(2,1fr)}}
.paycol label{font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:3px}
.paycol textarea{min-height:96px}
.progress{font-size:13px;color:var(--ink-soft);white-space:nowrap}
.irtablewrap{max-height:360px;overflow:auto;border:1px solid rgba(255,255,255,.8);border-radius:10px;margin-top:8px;background:rgba(255,255,255,.4)}
table.ir{border-collapse:collapse;width:100%;font-size:12.5px}
table.ir th,table.ir td{padding:5px 9px;text-align:left;white-space:nowrap}
table.ir thead th{position:sticky;top:0;background:linear-gradient(180deg,#fff,#ffe9d2);cursor:pointer;
  font-weight:600;border-bottom:1px solid rgba(200,110,40,.4);user-select:none}
table.ir th.sorted::after{content:" \2193";font-size:10px}
table.ir th.asc::after{content:" \2191"}
table.ir tbody tr{border-bottom:1px solid rgba(255,210,170,.5);cursor:pointer}
table.ir tbody tr:hover{background:rgba(255,255,255,.7)}
table.ir tbody tr.sel{background:linear-gradient(180deg,#fff,#ffe0c8);box-shadow:inset 3px 0 0 #f06a00}
table.ir tbody tr.hit{background:rgba(255,232,150,.5)}
table.ir td.pl{font-family:var(--mono);max-width:320px;overflow:hidden;text-overflow:ellipsis}
table.ir td.st.s2{color:#1f8f36;font-weight:700}table.ir td.st.s3{color:#c48c00;font-weight:700}
table.ir td.st.s4{color:#f06a00;font-weight:700}table.ir td.st.s5,table.ir td.st.s0{color:#cf2f26;font-weight:700}
table.ir td.num{font-family:var(--mono);text-align:right}
.irnote{font-size:12px;color:var(--ink-soft);margin-top:6px}

/* findings */
.fbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.fbar .seg button{text-transform:capitalize}
.flist{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto}
.flist li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:9px 8px;
  border-bottom:1px solid rgba(255,210,170,.5);cursor:pointer}
.flist li:hover{background:rgba(255,255,255,.6)}
.flist .sev{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#fff;
  padding:2px 7px;border-radius:999px;text-align:center;min-width:60px}
.sev-high{background:#d1261b}.sev-medium{background:#f06a00}.sev-low{background:#e0a000}.sev-info{background:#7a8590}
.flist .ftitle{font-weight:600}
.flist .fdetail{font-size:12.5px;color:var(--ink-soft);word-break:break-word}
.flist .furl{font-family:var(--mono);font-size:11.5px;color:var(--ink-soft);word-break:break-all;margin-top:2px}
.fbadge{width:16px;height:16px;border-radius:50%;color:#fff;font-size:10px;font-weight:700;line-height:16px;
  text-align:center;flex:none}
.fbadge.sev-high{background:#d1261b}.fbadge.sev-medium{background:#f06a00}
.fbadge.sev-low{background:#e0a000}.fbadge.sev-info{background:#7a8590}
.flows li{grid-template-columns:auto auto 1fr auto auto}
</style>
</head>
<body>

<div class="sky" aria-hidden="true">
  <div class="glowspot g1"></div><div class="glowspot g2"></div>
  <div class="streak s1"></div><div class="streak s2"></div>
  <div class="meadow"></div>
  <div class="bubble b1"></div><div class="bubble b2"></div><div class="bubble b3"></div>
  <div class="bubble b4"></div><div class="bubble b5"></div><div class="bubble b6"></div>
</div>

<main class="app">
  <header class="glass topbar">
    <div class="logo"><span class="orb"></span><h1>AeroCall</h1></div>
    <p class="tagline">Intercepting proxy, API workbench, rewrite rules, and copy-paste clients.</p>
    <div class="actions">
      <span class="chip" id="proxychip"><span class="dot" id="proxydot"></span><span id="proxytext">connecting</span></span>
      <button class="btn small toggle" id="intercept" type="button">Intercept: off</button>
      <a class="btn small" id="calink" href="/ca">CA certificate</a>
      <button class="btn small" id="rulesbtn" type="button">Rules</button>
      <button class="btn small" id="decodebtn" type="button">Decode</button>
      <button class="btn small" id="cookbtn" type="button">Cookies</button>
      <button class="btn small" id="colbtn" type="button">Saved</button>
      <button class="btn small hidden" id="intruderbtn" type="button">Intruder</button>
      <button class="btn small hidden" id="findingsbtn" type="button">Findings</button>
      <button class="btn small" id="phonebtn" type="button">Phone setup</button>
      <a class="btn small" id="harexport" href="/api/har">Export HAR</a>
      <span class="hint"><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> sends</span>
    </div>
  </header>

  <section class="glass panel pause hidden" id="pause">
    <h2>Paused traffic</h2>
    <div class="note">Matching browser requests and/or responses stop here. Edit the raw message, then forward or drop it. Only use this on systems you are allowed to test.</div>
    <div class="icfg">
      <label>Pause <select id="iside"><option value="request">requests</option><option value="response">responses</option><option value="both">both</option></select></label>
      <input id="ifilter" type="text" placeholder="only URLs containing…" spellcheck="false" autocomplete="off">
      <button class="btn small" id="isave" type="button">Apply filter</button>
    </div>
    <div class="note" id="waiting">Waiting for the next matching message.</div>
    <div id="ipile"></div>
  </section>

  <section class="glass panel hidden" id="rulespanel">
    <h2>Match / replace</h2>
    <div class="note">Rules run on proxied traffic and builder sends before the other side sees them. Literal match unless Regex is ticked.</div>
    <div id="rulelist"></div>
    <div class="rowish">
      <button class="btn small" id="addrule" type="button">Add rule</button>
      <button class="btn small send" id="saverules" type="button">Save rules</button>
    </div>
  </section>

  <section class="glass panel hidden" id="decodepanel">
    <h2>Decoder</h2>
    <div class="note">Transform text locally. JWT only splits and base64-decodes header/payload — it does not verify or crack signatures.</div>
    <textarea id="decin" placeholder="paste a token, URL-encoded blob, base64, hex…" spellcheck="false"></textarea>
    <div class="rowish">
      <button class="btn small" data-dec="url" type="button">URL decode</button>
      <button class="btn small" data-dec="urlenc" type="button">URL encode</button>
      <button class="btn small" data-dec="b64" type="button">Base64 decode</button>
      <button class="btn small" data-dec="b64e" type="button">Base64 encode</button>
      <button class="btn small" data-dec="hex" type="button">Hex decode</button>
      <button class="btn small" data-dec="hexe" type="button">Hex encode</button>
      <button class="btn small" data-dec="uni" type="button">Unicode unescape</button>
      <button class="btn small" data-dec="jwt" type="button">JWT decode</button>
    </div>
    <pre class="out" id="decout">Output lands here.</pre>
  </section>

  <section class="glass panel hidden" id="cookpanel">
    <h2>Cookie jar</h2>
    <div class="note">Latest Set-Cookie from captured responses, newest host+name wins.</div>
    <pre class="out" id="cookout">No cookies yet.</pre>
  </section>

  <section class="glass panel hidden" id="colpanel">
    <h2>Saved requests</h2>
    <div class="note">Named snapshots of the builder. Stored in aerocall-collections.json next to the process.</div>
    <div class="rowish">
      <input id="colname" type="text" placeholder="name this request" spellcheck="false">
      <button class="btn small send" id="colsave" type="button">Save current</button>
    </div>
    <ul class="flows" id="collist"></ul>
  </section>

  <section class="glass panel phone hidden" id="phone">
    <h2>Phone setup</h2>
    <div id="phonebody"></div>
  </section>

  <section class="glass panel tool hidden" id="intruder">
    <h2>Intruder</h2>
    <p class="lead">Replay one request many times, swapping payloads into marked positions. Load a request from the
      builder, select the bit you want to vary and press Mark selection (wraps it in § marks), pick an attack type,
      add payloads, and run. Results are sortable — watch the status and length columns for the odd one out.</p>
    <div class="irrow spread">
      <button class="btn small" id="ir-load" type="button">Load from builder</button>
      <button class="btn small" id="ir-mark" type="button">Mark selection</button>
      <button class="btn small" id="ir-clear" type="button">Clear markers</button>
      <label class="field">Attack type
        <select id="ir-attack">
          <option value="sniper">Sniper (one position at a time)</option>
          <option value="ram">Battering ram (same payload everywhere)</option>
          <option value="pitchfork">Pitchfork (lists in parallel)</option>
          <option value="clusterbomb">Cluster bomb (every combination)</option>
        </select>
      </label>
    </div>
    <label class="field">Target URL
      <input type="url" id="ir-url" class="u" style="width:100%" placeholder="https://api.example.com/thing" spellcheck="false" autocomplete="off">
    </label>
    <textarea id="ir-tpl" class="irtpl" spellcheck="false" placeholder="GET /search?q=§test§ HTTP/1.1&#10;Host: api.example.com&#10;Accept: */*"></textarea>
    <div class="paybox" id="ir-payloads"></div>
    <div class="irrow">
      <label class="field">Numbers from<input type="text" id="ir-from" class="n" value="1" spellcheck="false"></label>
      <label class="field">to<input type="text" id="ir-to" class="n" value="100" spellcheck="false"></label>
      <label class="field">step<input type="text" id="ir-step" class="n" value="1" spellcheck="false"></label>
      <button class="btn small" id="ir-gen" type="button">Add numbers</button>
      <label class="field">Built-in list
        <select id="ir-lib">
          <option value="">—</option>
          <option value="xss">XSS probes</option>
          <option value="sqli">SQLi probes</option>
          <option value="dirs">Common paths</option>
          <option value="users">Common usernames</option>
        </select>
      </label>
      <button class="btn small" id="ir-append" type="button">Append list</button>
    </div>
    <div class="irrow spread">
      <label class="field">Match (grep)<input type="text" id="ir-grep" style="width:180px" placeholder="flag a response containing…" spellcheck="false"></label>
      <label class="field">Threads<input type="text" id="ir-conc" class="n" value="10" spellcheck="false"></label>
      <button class="btn send small" id="ir-start" type="button">Start attack</button>
      <button class="btn drop small hidden" id="ir-stop" type="button">Stop</button>
      <span class="progress" id="ir-progress"></span>
    </div>
    <input type="text" id="ir-filter" style="width:100%;margin-top:4px" placeholder="filter results by payload or status" spellcheck="false" autocomplete="off">
    <div class="irtablewrap hidden" id="ir-wrap">
      <table class="ir">
        <thead><tr>
          <th data-sort="n">#</th><th data-sort="payload">Payload</th><th data-sort="status">Status</th>
          <th data-sort="length">Length</th><th data-sort="time_ms">Time</th><th data-sort="matched">Match</th>
        </tr></thead>
        <tbody id="ir-body"></tbody>
      </table>
    </div>
    <div class="irnote hidden" id="ir-note"></div>
  </section>

  <section class="glass panel tool hidden" id="findings">
    <h2>Findings</h2>
    <p class="lead">Passive checks over everything in Traffic — missing security headers, insecure cookies, version
      leaks, error messages and reflected input. Nothing extra is sent; it only reads responses you already captured.
      Click a finding to jump to its request.</p>
    <div class="fbar">
      <div class="seg" id="f-filter">
        <button data-sev="all" class="active" type="button">All</button>
        <button data-sev="high" type="button">High</button>
        <button data-sev="medium" type="button">Medium</button>
        <button data-sev="low" type="button">Low</button>
        <button data-sev="info" type="button">Info</button>
      </div>
      <span class="count" id="f-count">0 findings</span>
      <button class="btn small" id="f-refresh" type="button">Refresh</button>
    </div>
    <ul class="flist" id="f-list"></ul>
    <div class="empty" id="f-empty">No findings yet. Send or capture some traffic, then refresh.</div>
  </section>

  <section class="col">
    <div class="glass panel">
      <div class="urlbar">
        <select id="method" class="method" aria-label="Method">
          <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option>
          <option>DELETE</option><option>HEAD</option><option>OPTIONS</option>
        </select>
        <input id="url" type="url" placeholder="https://api.example.com/things" value="https://jsonplaceholder.typicode.com/todos/1" aria-label="URL" autocomplete="off" spellcheck="false">
        <button id="send" class="btn send" type="button">Send</button>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab active" data-tab="params" type="button">Query</button>
        <button class="tab" data-tab="headers" type="button">Headers</button>
        <button class="tab" data-tab="body" type="button">Body</button>
        <button class="tab" data-tab="raw" type="button">Raw</button>
        <button class="tab" data-tab="opts" type="button">Options</button>
      </div>

      <div class="pane active" id="pane-params">
        <div class="kv" id="params"></div>
        <button class="btn small" data-add="params" type="button">Add parameter</button>
      </div>
      <div class="pane" id="pane-headers">
        <div class="kv" id="headers"></div>
        <button class="btn small" data-add="headers" type="button">Add header</button>
      </div>
      <div class="pane" id="pane-body">
        <div class="bodytools">
          <label><input type="checkbox" id="jsonmode" checked> Send as JSON</label>
          <button class="btn small" id="prettify" type="button">Prettify</button>
        </div>
        <textarea id="body" placeholder="{&#10;  &quot;title&quot;: &quot;buy milk&quot;,&#10;  &quot;done&quot;: false,&#10;  &quot;tags&quot;: [&quot;errand&quot;, &quot;home&quot;]&#10;}" spellcheck="false"></textarea>
        <div class="note hidden" id="bodynote">GET and HEAD requests are sent without a body.</div>
        <div class="warn-text hidden" id="bodywarn">Body isn't valid JSON, so it will be sent exactly as typed.</div>
      </div>
      <div class="pane" id="pane-raw">
        <textarea id="rawreq" placeholder="GET / HTTP/1.1&#10;Host: example.com&#10;&#10;" spellcheck="false"></textarea>
        <div class="note">Editing raw does not automatically push back into the form fields. Send still uses Query / Headers / Body.</div>
      </div>
      <div class="pane" id="pane-opts">
        <div class="opts">
          <label><input type="checkbox" id="follow"> Follow redirects (builder only)</label>
          <label>Timeout <input id="timeout" type="text" value="30" style="width:64px"> sec</label>
          <label>Repeat <input id="repcount" type="text" value="1" style="width:48px"> times</label>
        </div>
        <div class="note">In URL or body, <code>{{i}}</code> is 0-based index and <code>{{n}}</code> is 1-based. Max 50 repeats. For authorized APIs you own or have permission to exercise.</div>
        <label class="authline">Bearer <input id="bearer" type="text" placeholder="paste a token — sets Authorization" spellcheck="false" autocomplete="off"></label>
      </div>
    </div>

    <div class="glass panel">
      <div class="traffic-head">
        <h2>Traffic</h2>
        <span class="count" id="count">0 requests</span>
        <input type="text" id="filter" placeholder="filter by host, path, method or status" spellcheck="false" autocomplete="off">
        <label class="quiet"><input type="checkbox" id="hidestatic"> Hide static</label>
        <button class="btn small" id="searchbtn" type="button">Search bodies</button>
        <button class="btn small" id="clear" type="button">Clear</button>
      </div>
      <ul class="flows" id="flows"></ul>
      <div class="empty" id="empty">Calls you send will show up here.</div>
    </div>
  </section>

  <section class="col">
    <div class="glass panel">
      <div class="resphead">
        <h2>Response</h2>
        <div class="meta"><span id="status" class="pill">idle</span><span id="time"></span><span id="size"></span></div>
      </div>
      <div class="subtitle" id="subtitle">Send a request, or pick one from Traffic.</div>
      <div class="tabs small" role="tablist">
        <button class="tab active" data-rtab="rbody" type="button">Body</button>
        <button class="tab" data-rtab="rheaders" type="button">Headers</button>
        <button class="tab" data-rtab="rreq" type="button">Request</button>
        <button class="tab" data-rtab="rhex" type="button">Hex</button>
        <button class="btn small edit" id="edit" type="button" disabled>Edit in builder</button>
        <button class="btn small" id="resend" type="button" disabled>Resend</button>
        <button class="btn small" id="copycurl" type="button" disabled>Copy cURL</button>
      </div>
      <pre id="rbody" class="out">Press Send to see the response here.</pre>
      <pre id="rheaders" class="out hidden"></pre>
      <pre id="rreq" class="out hidden"></pre>
      <pre id="rhex" class="out hidden"></pre>
    </div>

    <div class="glass panel">
      <div class="codehead">
        <h2>Code</h2>
        <div class="seg" role="tablist">
          <button class="active" data-lang="python" type="button">Python</button>
          <button data-lang="js" type="button">JavaScript</button>
          <button data-lang="curl" type="button">cURL</button>
          <button data-lang="httpie" type="button">HTTPie</button>
          <button data-lang="go" type="button">Go</button>
        </div>
        <button class="btn small" id="copy" type="button">Copy</button>
      </div>
      <pre id="code" class="out"></pre>
    </div>
  </section>
</main>

<script>
"use strict";
// ===== pure helpers (no DOM) =====
const NO_BODY = new Set(['GET', 'HEAD']);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const q = (s) => JSON.stringify(String(s)); // double-quoted string literal valid in JSON, JS and Python

function normalizeUrl(raw) {
  let s = (raw || '').trim();
  if (!s) throw new Error('Enter a URL first.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  return new URL(s);
}

function buildUrl(raw, params) {
  const u = normalizeUrl(raw);
  for (const p of params) if (p.key) u.searchParams.append(p.key, p.value);
  return u.toString();
}

// Turns form fields into the exact request that gets sent and code-generated.
function describeRequest(f) {
  const method = f.method;
  const url = buildUrl(f.rawUrl, f.params);
  const headers = {};
  for (const h of f.headerRows) if (h.key) headers[h.key] = h.value;
  const bearer = (els.bearer && els.bearer.value || '').trim();
  if (bearer && !Object.keys(headers).some(k => k.toLowerCase() === 'authorization')) {
    headers['Authorization'] = bearer.toLowerCase().startsWith('bearer ') ? bearer : ('Bearer ' + bearer);
  }
  const text = (f.bodyText || '').trim();
  const body = (!NO_BODY.has(method) && text) ? text : null;
  let parsed;
  if (body !== null && f.jsonMode) {
    try { parsed = JSON.parse(body); } catch (e) { /* not JSON, send raw */ }
    if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  }
  return { method, url, headers, body, parsed };
}

function pyLiteral(v, indent = 0) {
  const pad = ' '.repeat(indent + 4), end = ' '.repeat(indent);
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return q(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '[\n' + v.map(x => pad + pyLiteral(x, indent + 4)).join(',\n') + '\n' + end + ']';
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  return '{\n' + keys.map(k => pad + q(k) + ': ' + pyLiteral(v[k], indent + 4)).join(',\n') + '\n' + end + '}';
}

function indentTail(s, n) {
  const pad = ' '.repeat(n);
  return s.split('\n').map((l, i) => (i ? pad + l : l)).join('\n');
}

function genPython(req, respJson) {
  const L = ['import requests', '', 'url = ' + q(req.url)];
  const hk = Object.keys(req.headers);
  if (hk.length) {
    L.push('headers = {');
    for (const k of hk) L.push('    ' + q(k) + ': ' + q(req.headers[k]) + ',');
    L.push('}');
  }
  let arg = '';
  if (req.body !== null) {
    if (req.parsed !== undefined) { L.push('payload = ' + pyLiteral(req.parsed)); arg = ', json=payload'; }
    else { L.push('payload = ' + q(req.body)); arg = ', data=payload'; }
  }
  L.push('', 'response = requests.' + req.method.toLowerCase() + '(url' + (hk.length ? ', headers=headers' : '') + arg + ')');
  L.push('print(response.status_code)');
  L.push(respJson ? 'print(response.json())' : 'print(response.text)');
  return L.join('\n');
}

function genJS(req, respJson) {
  const L = [];
  const hk = Object.keys(req.headers);
  const opts = ['  method: ' + q(req.method) + ','];
  if (hk.length) {
    opts.push('  headers: {');
    for (const k of hk) opts.push('    ' + q(k) + ': ' + q(req.headers[k]) + ',');
    opts.push('  },');
  }
  if (req.body !== null) {
    if (req.parsed !== undefined) opts.push('  body: JSON.stringify(' + indentTail(JSON.stringify(req.parsed, null, 2), 2) + '),');
    else opts.push('  body: ' + q(req.body) + ',');
  }
  if (req.method === 'GET' && opts.length === 1) L.push('const response = await fetch(' + q(req.url) + ');');
  else L.push('const response = await fetch(' + q(req.url) + ', {', ...opts, '});');
  L.push('', respJson ? 'const data = await response.json();' : 'const data = await response.text();');
  L.push('console.log(response.status, data);');
  return L.join('\n');
}

function genCurl(req) {
  const parts = ['curl -sS -X ' + req.method];
  for (const k of Object.keys(req.headers)) parts.push("-H " + q(k + ': ' + req.headers[k]));
  if (req.body !== null) parts.push('--data-raw ' + q(req.body));
  parts.push(q(req.url));
  return parts.join(' \\\n  ');
}

function genHttpie(req) {
  const verb = req.method === 'GET' ? 'http' : 'http ' + req.method;
  const hdrs = Object.keys(req.headers).map(k => q(k + ':' + req.headers[k]));
  if (req.body !== null && req.parsed !== undefined) {
    return [verb, q(req.url)].concat(hdrs).concat(['<<<', JSON.stringify(req.parsed, null, 2)]).join(' ');
  }
  if (req.body !== null) return [verb, q(req.url)].concat(hdrs).concat(['--raw', q(req.body)]).join(' ');
  return [verb, q(req.url)].concat(hdrs).join(' ');
}

function genGo(req) {
  const L = ['package main', '', 'import (', '\t"fmt"', '\t"io"', '\t"net/http"', '\t"strings"', ')', '', 'func main() {'];
  if (req.body !== null) L.push('\tbody := strings.NewReader(' + q(req.body) + ')');
  else L.push('\tvar body io.Reader');
  L.push('\treq, _ := http.NewRequest(' + q(req.method) + ', ' + q(req.url) + ', body)');
  for (const k of Object.keys(req.headers)) L.push('\treq.Header.Set(' + q(k) + ', ' + q(req.headers[k]) + ')');
  L.push('\tres, err := http.DefaultClient.Do(req)');
  L.push('\tif err != nil { panic(err) }');
  L.push('\tdefer res.Body.Close()');
  L.push('\tb, _ := io.ReadAll(res.Body)');
  L.push('\tfmt.Println(res.StatusCode, string(b))');
  L.push('}');
  return L.join('\n');
}

function renderCode(req, respJson) {
  if (state.lang === 'python') return genPython(req, respJson);
  if (state.lang === 'js') return genJS(req, respJson);
  if (state.lang === 'curl') return genCurl(req);
  if (state.lang === 'httpie') return genHttpie(req);
  if (state.lang === 'go') return genGo(req);
  return genPython(req, respJson);
}

function hexDump(text) {
  const bytes = [];
  for (let i = 0; i < text.length && i < 4096; i++) bytes.push(text.charCodeAt(i) & 255);
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const hex = slice.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const asc = slice.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    lines.push(i.toString(16).padStart(8, '0') + '  ' + hex.padEnd(47, ' ') + '  |' + asc + '|');
  }
  if (text.length > 4096) lines.push('… truncated');
  return lines.join('\n') || '(empty)';
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlightJSON(str) {
  return esc(str).replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (m) => {
    let cls = 'num';
    if (m[0] === '"') cls = /:$/.test(m) ? 'key' : 'str';
    else if (m === 'true' || m === 'false') cls = 'bool';
    else if (m === 'null') cls = 'null';
    return '<span class="' + cls + '">' + m + '</span>';
  });
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

function statusClass(s) { return 's' + String(s || 0)[0]; }

function prettyIfJSON(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) { return text; }
}

// ===== DOM =====
const $ = (s) => document.querySelector(s);
const els = {
  method: $('#method'), url: $('#url'), send: $('#send'), body: $('#body'), jsonMode: $('#jsonmode'),
  params: $('#params'), headers: $('#headers'), bodyNote: $('#bodynote'), bodyWarn: $('#bodywarn'),
  status: $('#status'), time: $('#time'), size: $('#size'), subtitle: $('#subtitle'),
  rbody: $('#rbody'), rheaders: $('#rheaders'), rreq: $('#rreq'), edit: $('#edit'),
  code: $('#code'), copy: $('#copy'),
  flows: $('#flows'), empty: $('#empty'), count: $('#count'), filter: $('#filter'), clear: $('#clear'),
  proxyChip: $('#proxychip'), proxyDot: $('#proxydot'), proxyText: $('#proxytext'),
  intercept: $('#intercept'), caLink: $('#calink'), pause: $('#pause'), waiting: $('#waiting'), ipile: $('#ipile'),
  phoneBtn: $('#phonebtn'), phone: $('#phone'), phoneBody: $('#phonebody'),
  iside: $('#iside'), ifilter: $('#ifilter'), isave: $('#isave'),
  rulesBtn: $('#rulesbtn'), rulesPanel: $('#rulespanel'), ruleList: $('#rulelist'),
  decodeBtn: $('#decodebtn'), decodePanel: $('#decodepanel'), decIn: $('#decin'), decOut: $('#decout'),
  cookBtn: $('#cookbtn'), cookPanel: $('#cookpanel'), cookOut: $('#cookout'),
  colBtn: $('#colbtn'), colPanel: $('#colpanel'), colName: $('#colname'), colList: $('#collist'),
  follow: $('#follow'), timeout: $('#timeout'), repcount: $('#repcount'), bearer: $('#bearer'),
  hideStatic: $('#hidestatic'), rawReq: $('#rawreq'), rhex: $('#rhex'),
  resend: $('#resend'), copyCurl: $('#copycurl'),
  intruderBtn: $('#intruderbtn'), intruder: $('#intruder'), findingsBtn: $('#findingsbtn'), findings: $('#findings'),
};
const MARK = '§';
const LIBS = {
  xss: ['<scr' + 'ipt>alert(1)</scr' + 'ipt>', '"><svg onload=alert(1)>', "'-alert(1)-'", '<img src=x onerror=alert(1)>', 'javascript:alert(1)'],
  sqli: ["'", '"', "' OR '1'='1", "1' OR '1'='1' -- ", "' UNION SELECT NULL-- ", "1;WAITFOR DELAY '0:0:5'--", "' AND SLEEP(5)-- "],
  dirs: ['admin', 'login', 'api', 'config', '.git/config', '.env', 'backup', 'robots.txt', 'wp-admin', 'phpinfo.php'],
  users: ['admin', 'administrator', 'root', 'test', 'guest', 'user', 'demo', 'oracle', 'postgres'],
};
const state = {
  lang: 'python', respJson: true, backend: false, intercept: false,
  collections: [], rules: [],
  flows: [], byId: {}, details: {}, lastId: 0, localId: 0, selected: null, current: null, filter: '',
};
const API = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AeroCall': '1' } };
const post = (path, data) => fetch(path, Object.assign({ body: JSON.stringify(data || {}) }, API));

// ----- builder -----
function addRow(container, key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<input type="text" class="k" placeholder="key" spellcheck="false" autocomplete="off">' +
                  '<input type="text" class="v" placeholder="value" spellcheck="false" autocomplete="off">' +
                  '<button class="x" type="button" title="Remove" aria-label="Remove">×</button>';
  row.querySelector('.k').value = key;
  row.querySelector('.v').value = value;
  container.appendChild(row);
  return row;
}
function readRows(container) {
  return [...container.querySelectorAll('.row')].map(r => ({
    key: r.querySelector('.k').value.trim(), value: r.querySelector('.v').value,
  }));
}
function fillRows(container, rows) {
  container.innerHTML = '';
  (rows && rows.length ? rows : [{ key: '', value: '' }]).forEach(r => addRow(container, r.key, r.value));
}
function formFields() {
  return {
    method: els.method.value, rawUrl: els.url.value, params: readRows(els.params),
    headerRows: readRows(els.headers), bodyText: els.body.value, jsonMode: els.jsonMode.checked,
  };
}
function syncBodyNotes() {
  els.bodyNote.classList.toggle('hidden', !NO_BODY.has(els.method.value));
  let bad = false;
  if (els.jsonMode.checked && els.body.value.trim()) { try { JSON.parse(els.body.value); } catch (e) { bad = true; } }
  els.bodyWarn.classList.toggle('hidden', !bad);
}
function updateCode() {
  syncBodyNotes();
  let req;
  try { req = describeRequest(formFields()); }
  catch (e) {
    els.code.textContent = (state.lang === 'python' ? '# ' : '// ') + (e.message.includes('URL') ? 'That URL is not valid yet.' : e.message);
    return;
  }
  els.code.textContent = renderCode(req, state.respJson);
}
function paintMethod() { els.method.dataset.m = els.method.value; }

function loadIntoBuilder(d) {
  els.method.value = METHODS.includes(d.method) ? d.method : 'GET';
  paintMethod();
  els.url.value = d.url;
  fillRows(els.params, []);
  const skip = new Set(['host', 'content-length', 'connection', 'proxy-connection', 'keep-alive', 'transfer-encoding', 'accept-encoding']);
  fillRows(els.headers, (d.req_headers || []).filter(([k]) => !skip.has(k.toLowerCase())).map(([k, v]) => ({ key: k, value: v })));
  let bodyText = d.req_is_binary ? '' : (d.req_body_text || '');
  if (bodyText.trim()) { try { bodyText = JSON.stringify(JSON.parse(bodyText), null, 2); } catch (e) { /* not JSON, keep as captured */ } }
  els.body.value = bodyText;
  const ct = ((d.req_headers || []).find(([k]) => k.toLowerCase() === 'content-type') || [])[1] || '';
  els.jsonMode.checked = !els.body.value.trim() || /json/i.test(ct);
  updateCode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----- traffic list -----
function matches(f) {
  if (!state.filter) return true;
  const needle = state.filter.toLowerCase();
  return (f.method + ' ' + f.url + ' ' + f.status + ' ' + (f.ctype || '')).toLowerCase().includes(needle);
}
function rowFor(f) {
  const li = document.createElement('li');
  li.dataset.id = f.id;
  li.className = (f.source === 'proxy' ? '' : 'mine') + (state.selected === f.id ? ' sel' : '');
  li.innerHTML = '<span class="m"></span><span class="st"></span><span class="u"><b></b><span></span></span><span class="fbadge hidden"></span><span class="sz"></span>';
  const m = li.querySelector('.m'); m.textContent = f.method; if (/^[A-Za-z]+$/.test(f.method)) m.classList.add(f.method);
  const st = li.querySelector('.st');
  st.textContent = (f.error && !f.status) ? 'err' : (f.status || '·');
  st.classList.add(statusClass(f.status));
  li.querySelector('.u b').textContent = f.host;
  li.querySelector('.u span').textContent = f.path;
  li.querySelector('.sz').textContent = fmtBytes(f.length || 0) + (f.duration_ms != null ? '  ' + Math.round(f.duration_ms) + ' ms' : '');
  const badge = li.querySelector('.fbadge');
  if (f.findings) { badge.classList.remove('hidden'); badge.classList.add('sev-' + (f.sev || 'info')); badge.textContent = f.findings; badge.title = f.findings + ' passive finding' + (f.findings === 1 ? '' : 's'); }
  li.title = f.url + (f.error ? '  [' + f.error + ']' : '');
  li.addEventListener('click', () => select(f.id));
  return li;
}
function addFlows(list) {
  const nearBottom = els.flows.scrollTop + els.flows.clientHeight > els.flows.scrollHeight - 60;
  for (const f of list) {
    if (state.byId[f.id]) continue;
    state.flows.push(f); state.byId[f.id] = f;
    if (matches(f)) els.flows.appendChild(rowFor(f));
  }
  els.count.textContent = state.flows.length + (state.flows.length === 1 ? ' request' : ' requests');
  els.empty.classList.toggle('hidden', state.flows.length > 0);
  if (nearBottom) els.flows.scrollTop = els.flows.scrollHeight;
}
function renderList() {
  els.flows.innerHTML = '';
  for (const f of state.flows) if (matches(f)) els.flows.appendChild(rowFor(f));
}
function markSelected() {
  [...els.flows.children].forEach(li => li.classList.toggle('sel', +li.dataset.id === state.selected));
}
async function select(id) {
  state.selected = id;
  markSelected();
  let d = state.details[id];
  if (!d && state.backend) {
    try { const r = await fetch('/api/flow/' + id); if (!r.ok) return; d = await r.json(); } catch (e) { return; }
    state.details[id] = d;
  }
  if (d) renderInspector(d);
}

// ----- inspector -----
function renderInspector(d) {
  state.current = d;
  if (d.error && !d.status) { els.status.textContent = 'failed'; els.status.className = 'pill err'; }
  else {
    els.status.textContent = (d.status + ' ' + (d.reason || '')).trim();
    els.status.className = 'pill ' + (d.status < 300 ? 'ok' : d.status < 400 ? 'redir' : d.status < 500 ? 'warn' : 'err');
  }
  els.time.textContent = d.duration_ms != null ? Math.round(d.duration_ms) + ' ms' : '';
  els.size.textContent = d.resp_body_size != null ? fmtBytes(d.resp_body_size) : '';
  els.subtitle.textContent = d.method + ' ' + d.url + (d.source === 'proxy' ? '' : '   (sent from the builder)');

  if (d.error && !d.status) {
    let msg = d.error;
    if (/CERTIFICATE_VERIFY_FAILED/i.test(msg)) msg += '\n\nThe origin\'s certificate is not trusted. Restart with --insecure to skip verification for local or self-signed servers.';
    els.rbody.textContent = msg;
    state.respJson = false;
  } else if (d.resp_is_binary) {
    els.rbody.textContent = d.resp_body_text;
    state.respJson = false;
  } else {
    const text = d.resp_body_text || '';
    let parsed, isJson = false;
    if (text.length < 400000) { try { parsed = JSON.parse(text); isJson = true; } catch (e) { /* plain text */ } }
    if (isJson) els.rbody.innerHTML = highlightJSON(JSON.stringify(parsed, null, 2));
    else els.rbody.textContent = text || '(empty body)';
    state.respJson = isJson;
  }
  const rh = (d.resp_headers || []).map(([k, v]) => k + ': ' + v);
  if (d.resp_encoding) rh.push('', '(body shown decoded from ' + d.resp_encoding + ')');
  els.rheaders.textContent = rh.length ? rh.join('\n')
    : (state.backend ? '(no headers)' : '(no headers exposed - browsers only reveal CORS-safelisted response headers)');
  let rq = d.method + ' ' + (d.path || '/') + ' HTTP/1.1\n' + (d.req_headers || []).map(([k, v]) => k + ': ' + v).join('\n');
  if (d.req_body_size) rq += '\n\n' + prettyIfJSON(d.req_body_text || '');
  els.rreq.textContent = rq;
  if (els.rhex) els.rhex.textContent = hexDump(d.resp_is_binary ? '' : (d.resp_body_text || ''));
  if (els.rawReq && d.raw_request) els.rawReq.value = d.raw_request;
  els.edit.disabled = false;
  if (els.resend) els.resend.disabled = false;
  if (els.copyCurl) els.copyCurl.disabled = false;
  updateCode();
}
function showFailure(message) {
  els.status.textContent = 'failed'; els.status.className = 'pill err';
  els.time.textContent = ''; els.size.textContent = '';
  els.rbody.textContent = message;
}

// ----- sending -----
async function sendViaServer(req) {
  const r = await post('/api/send', {
    method: req.method, url: req.url, headers: Object.entries(req.headers), body: req.body,
    follow_redirects: !!(els.follow && els.follow.checked),
    timeout: parseInt((els.timeout && els.timeout.value) || '30', 10),
    count: parseInt((els.repcount && els.repcount.value) || '1', 10),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || ('server returned ' + r.status));
  return d;
}
async function sendViaBrowser(req) {
  const opts = { method: req.method, headers: req.headers };
  if (req.body !== null) opts.body = req.body;
  const t0 = performance.now();
  const res = await fetch(req.url, opts);
  const text = await res.text();
  const ms = performance.now() - t0;
  const u = new URL(req.url);
  const rh = []; res.headers.forEach((v, k) => rh.push([k, v]));
  const size = new TextEncoder().encode(text).length;
  return {
    id: ++state.localId, source: 'builder', method: req.method, scheme: u.protocol.replace(':', ''),
    host: u.host, port: u.port, path: u.pathname + u.search, url: req.url,
    status: res.status, reason: res.statusText, length: size, ctype: (res.headers.get('content-type') || '').split(';')[0],
    duration_ms: ms, error: null,
    req_headers: Object.entries(req.headers), req_body_text: req.body || '',
    req_body_size: req.body ? new TextEncoder().encode(req.body).length : 0, req_is_binary: false,
    resp_headers: rh, resp_body_text: text, resp_body_size: size, resp_is_binary: false, resp_encoding: '',
  };
}
async function send() {
  let req;
  try { req = describeRequest(formFields()); }
  catch (e) {
    els.status.textContent = 'not sent'; els.status.className = 'pill warn';
    els.time.textContent = ''; els.size.textContent = '';
    els.rbody.textContent = e.message.includes('URL') ? 'That URL is not valid. Check it and try again.' : e.message;
    return;
  }
  els.send.disabled = true; els.send.textContent = 'Sending';
  try {
    const d = state.backend ? await sendViaServer(req) : await sendViaBrowser(req);
    state.details[d.id] = d;
    if (state.backend) { await pollFlows(); loadFindings(); } else addFlows([d]);
    state.selected = d.id;
    markSelected();
    renderInspector(d);
  } catch (err) {
    showFailure(err.name + ': ' + err.message + '\n\n' + (state.backend
      ? 'Could not reach the aerocall server. Is python3 aerocall.py still running?'
      : 'If the URL is right, this is almost always CORS (the API does not allow calls from a web page) or a preview sandbox blocking network access. Run python3 aerocall.py and use its UI, or copy the code below and run it from a terminal.'));
  } finally {
    els.send.disabled = false; els.send.textContent = 'Send';
  }
}

// ----- backend polling -----
let polling = false;
async function pollFlows() {
  if (!state.backend || polling) return;
  polling = true;
  try {
    const r = await fetch('/api/flows?after=' + state.lastId);
    const d = await r.json();
    if (d.flows && d.flows.length) { addFlows(d.flows); state.lastId = d.last; }
  } catch (e) { /* server away; try again next tick */ }
  finally { polling = false; }
}
function flowLoop() { pollFlows(); setTimeout(flowLoop, 1000); }

// ----- interceptor -----
function setIntercept(on) {
  state.intercept = on;
  els.intercept.textContent = on ? 'Intercept: on' : 'Intercept: off';
  els.intercept.classList.toggle('on', on);
  els.pause.classList.toggle('hidden', !on);
  if (!on) els.ipile.innerHTML = '';
}
async function toggleIntercept() {
  if (!state.backend) return;
  try {
    const d = await (await post('/api/intercept/toggle', {
      on: !state.intercept,
      side: els.iside ? els.iside.value : 'request',
      url_filter: els.ifilter ? els.ifilter.value : '',
    })).json();
    setIntercept(!!d.enabled);
  } catch (e) {}
}
async function applyInterceptOpts() {
  if (!state.backend) return;
  try {
    await post('/api/intercept/toggle', {
      on: state.intercept,
      side: els.iside ? els.iside.value : 'request',
      url_filter: els.ifilter ? els.ifilter.value : '',
    });
  } catch (e) {}
}
async function queueLoop() {
  if (state.backend && state.intercept) {
    try { const d = await (await fetch('/api/intercept/queue')).json(); renderQueue(d.items || []); } catch (e) {}
  }
  setTimeout(queueLoop, 700);
}
function renderQueue(items) {
  const have = new Set(items.map(i => String(i.id)));
  [...els.ipile.children].forEach(c => { if (!have.has(c.dataset.id)) c.remove(); });
  for (const it of items) {
    if (els.ipile.querySelector('[data-id="' + it.id + '"]')) continue;
    const card = document.createElement('div');
    card.className = 'icard'; card.dataset.id = it.id;
    card.innerHTML = '<div class="h"></div><textarea spellcheck="false"></textarea>' +
      '<div class="row"><button class="btn small send" type="button">Forward</button>' +
      '<button class="btn small drop" type="button">Drop</button>' +
      '<label><input type="checkbox" class="fix" checked> Fix Content-Length</label></div>';
    card.querySelector('.h').textContent = (it.side === 'response' ? 'RESP ' : 'REQ ') + it.method + ' ' + it.url;
    const ta = card.querySelector('textarea'); ta.value = it.text;
    card.querySelector('.send').addEventListener('click', () => resolveItem(it.id, 'forward', ta.value, card.querySelector('.fix').checked));
    card.querySelector('.drop').addEventListener('click', () => resolveItem(it.id, 'drop'));
    els.ipile.appendChild(card);
  }
  els.waiting.classList.toggle('hidden', items.length > 0);
}
async function resolveItem(id, action, raw, fix) {
  try { await post('/api/intercept/resolve', { id, action, raw, fix_length: fix }); } catch (e) {}
  const c = els.ipile.querySelector('[data-id="' + id + '"]');
  if (c) c.remove();
  if (!els.ipile.children.length) els.waiting.classList.remove('hidden');
}

// ----- proxy status chip -----
function setProxyChip(s) {
  if (!s) {
    els.proxyDot.className = 'dot';
    els.proxyText.textContent = 'standalone page';
    els.proxyChip.title = 'Run python3 aerocall.py to capture browser traffic and send calls without CORS limits.';
    els.intercept.classList.add('hidden'); els.caLink.classList.add('hidden');
    els.empty.textContent = 'Calls you send will show up here. Tap one to inspect it or load it back into the builder.';
    return;
  }
  const phost = (s.proxy && s.proxy.host === '0.0.0.0') ? (s.lan_ip || 'this computer') : (s.proxy && s.proxy.host);
  if (s.proxy) {
    els.proxyDot.className = 'dot live';
    els.proxyText.textContent = 'proxy ' + phost + ':' + s.proxy.port;
    els.proxyChip.title = s.https_intercept
      ? 'Point a browser at this proxy and trust the CA certificate to see its HTTPS traffic.'
      : 'HTTPS is tunneled without decryption. pip install cryptography, then restart, to see HTTPS traffic.';
    els.empty.textContent = 'Point a browser\'s (or phone\'s) HTTP and HTTPS proxy at ' + phost + ':' + s.proxy.port +
      ' and its requests will stream in here. Calls you send from the builder land here too.';
  } else {
    els.proxyDot.className = 'dot';
    els.proxyText.textContent = 'proxy off';
    els.proxyChip.title = 'Started with --no-proxy. Sends still go through the server, so there are no CORS limits.';
    els.intercept.classList.add('hidden');
    els.empty.textContent = 'Calls you send will show up here. Tap one to inspect it or load it back into the builder.';
  }
  els.caLink.classList.toggle('hidden', !s.https_intercept);
  const raw = [];
  if (s.have_brotli === false) raw.push('brotli');
  if (s.have_zstd === false) raw.push('zstd');
  if (raw.length) els.proxyChip.title += ' Bodies compressed with ' + raw.join(' or ') + ' are shown raw (pip install brotli zstandard).';
  if (s.insecure) els.proxyChip.title += ' Origin certificates are not being verified (--insecure).';
}

// ----- phone setup -----
const escHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function renderPhone(s) {
  if (!s.lan_ip) {
    els.phoneBody.innerHTML = '<p class="lead">This server only listens on 127.0.0.1, so a phone can\'t reach it yet. ' +
      'Restart it with <code>python3 aerocall.py --lan</code> on the same Wi-Fi as the phone and this panel fills in with ' +
      'the addresses, QR codes and the steps for iPhone and Android.</p>';
    return;
  }
  const ui = 'http://' + s.lan_ip + ':' + s.ui_port;
  // The phone needs the token to reach the gated API; the CA download stays open.
  const uiOpen = ui + (s.token ? '/?t=' + encodeURIComponent(s.token) : '');
  const qr = (t) => '<img class="qr" alt="QR code for ' + escHtml(t) + '" src="/api/qr?text=' + encodeURIComponent(t) + '">';
  let proxyStep = '<h3>2. Route the phone through the proxy</h3>';
  if (s.proxy) {
    proxyStep += '<div class="url">' + escHtml(s.lan_ip + ':' + s.proxy.port) + '</div>' +
      '<p><b>iPhone:</b> Settings › Wi‑Fi › the ⓘ next to your network › Configure Proxy › Manual › Server <code>' +
      escHtml(s.lan_ip) + '</code>, Port <code>' + s.proxy.port + '</code> › Save.</p>' +
      '<p><b>Android:</b> long-press the network › Modify › Advanced › Proxy: Manual › same host and port.</p>';
  } else {
    proxyStep += '<p>The proxy is off (started with --no-proxy). Restart without it to capture the phone\'s traffic.</p>';
  }
  let caStep = '<h3>3. Trust the certificate, so HTTPS can be read</h3>';
  if (s.https_intercept) {
    caStep += qr(ui + '/ca') + '<div class="url">' + escHtml(ui) + '/ca</div>' +
      '<p><b>iPhone:</b> open that link in Safari and allow the profile, then Settings › Profile Downloaded › Install. ' +
      'Then Settings › General › About › Certificate Trust Settings › switch on full trust for <b>aerocall Root CA</b>.</p>' +
      '<p><b>Android:</b> download it, then Settings › Security › Encryption &amp; credentials › Install a certificate › CA certificate. ' +
      'Chrome will trust it; many apps ignore user-installed CAs.</p>' +
      '<p class="warn-text">While the proxy is set but the certificate isn\'t trusted yet, HTTPS on the phone fails. Remove the proxy setting when you\'re done.</p>';
  } else {
    caStep += '<p>HTTPS is being tunneled, not decrypted. <code>pip install cryptography</code> on this computer, restart, and this step fills in.</p>';
  }
  els.phoneBody.innerHTML =
    '<p class="lead">The phone and this computer need to be on the same Wi‑Fi. Anyone on that network can reach this UI and proxy while --lan is on.</p>' +
    '<div class="steps">' +
    '<div class="step"><h3>1. Open AeroCall on the phone</h3>' + qr(uiOpen) + '<div class="url">' + escHtml(uiOpen) + '</div>' +
    '<p>Scan it with the camera. On iPhone, Share › Add to Home Screen gives it an icon and a full-screen window.</p></div>' +
    '<div class="step">' + proxyStep + '</div>' +
    '<div class="step">' + caStep + '</div></div>';
}

// ----- intruder -----
function markerCount() { return (els.intruder && (($('#ir-tpl').value.match(new RegExp(MARK, 'g')) || []).length)) || 0; }
function positions() { return Math.floor(markerCount() / 2); }
const irPayloadCache = [];

function renderPayloadBoxes() {
  const attack = $('#ir-attack').value;
  const multi = (attack === 'pitchfork' || attack === 'clusterbomb');
  const p = Math.max(1, positions());
  const boxes = multi ? p : 1;
  const wrap = $('#ir-payloads');
  wrap.classList.toggle('multi', multi && boxes > 1);
  [...wrap.querySelectorAll('textarea')].forEach((t, i) => { irPayloadCache[i] = t.value; });
  wrap.innerHTML = '';
  for (let i = 0; i < boxes; i++) {
    const col = document.createElement('div');
    col.className = 'paycol';
    const label = multi ? ('Payloads for position ' + (i + 1)) : 'Payloads (one per line)';
    col.innerHTML = '<label>' + label + '</label><textarea spellcheck="false" placeholder="one payload per line"></textarea>';
    const ta = col.querySelector('textarea');
    if (irPayloadCache[i]) ta.value = irPayloadCache[i];
    wrap.appendChild(ta);
    wrap.appendChild; // no-op
  }
}
function payloadLists() {
  return [...$('#ir-payloads').querySelectorAll('textarea')].map(t => t.value.split('\n').map(s => s.trim()).filter(Boolean));
}
function activePayloadBox() {
  const boxes = [...$('#ir-payloads').querySelectorAll('textarea')];
  return document.activeElement && boxes.includes(document.activeElement) ? document.activeElement : boxes[0];
}
function irLoadFromBuilder() {
  let req;
  try { req = describeRequest(formFields()); } catch (e) { alert(e.message); return; }
  const u = new URL(req.url);
  $('#ir-url').value = req.url;
  const path = u.pathname + u.search;
  const lines = [req.method + ' ' + path + ' HTTP/1.1', 'Host: ' + u.host];
  for (const [k, v] of Object.entries(req.headers)) if (k.toLowerCase() !== 'host') lines.push(k + ': ' + v);
  $('#ir-tpl').value = lines.join('\n') + '\n\n' + (req.body || '');
  renderPayloadBoxes();
}
function irMark() {
  const ta = $('#ir-tpl');
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  if (s === e) { ta.setRangeText(MARK + MARK, s, e, 'end'); }
  else { ta.value = v.slice(0, s) + MARK + v.slice(s, e) + MARK + v.slice(e); }
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}
function irClearMarks() { const ta = $('#ir-tpl'); ta.value = ta.value.split(MARK).join(''); ta.dispatchEvent(new Event('input')); }
function irGenNumbers() {
  const from = parseFloat($('#ir-from').value), to = parseFloat($('#ir-to').value), step = parseFloat($('#ir-step').value) || 1;
  if (!isFinite(from) || !isFinite(to)) return;
  const out = [];
  if (step > 0) for (let x = from; x <= to && out.length < 20000; x += step) out.push(+x.toFixed(6));
  else if (step < 0) for (let x = from; x >= to && out.length < 20000; x += step) out.push(+x.toFixed(6));
  const ta = activePayloadBox();
  if (ta) { ta.value = (ta.value.trim() ? ta.value.replace(/\n+$/, '') + '\n' : '') + out.join('\n'); }
}
function irAppendLib() {
  const key = $('#ir-lib').value;
  if (!key || !LIBS[key]) return;
  const ta = activePayloadBox();
  if (ta) ta.value = (ta.value.trim() ? ta.value.replace(/\n+$/, '') + '\n' : '') + LIBS[key].join('\n');
}

const ir = { id: null, rows: [], have: 0, total: 0, timer: null, sort: { key: 'n', dir: 1 }, sel: null, done: false };
function irStatusClass(s) { return 's' + String(s || 0)[0]; }

async function irStart() {
  const lists = payloadLists();
  const attack = $('#ir-attack').value;
  if (positions() < 1) { alert('Mark at least one position first: select text in the template and press Mark selection.'); return; }
  const body = { url: $('#ir-url').value, template: $('#ir-tpl').value, marker: MARK, attack,
    payloads: lists, grep: $('#ir-grep').value, concurrency: parseInt($('#ir-conc').value, 10) || 10 };
  let res;
  try { res = await (await post('/api/intruder/start', body)).json(); }
  catch (e) { alert('Could not reach the server.'); return; }
  if (res.error) { alert(res.error); return; }
  if (res.total > 1000 && !confirm('This will send ' + res.total + ' requests to ' + $('#ir-url').value + '. Continue?')) {
    try { await post('/api/intruder/stop', { id: res.id }); } catch (e) {}
    return;
  }
  ir.id = res.id; ir.rows = []; ir.have = 0; ir.total = res.total; ir.sel = null; ir.done = false;
  $('#ir-wrap').classList.remove('hidden');
  $('#ir-note').classList.add('hidden');
  $('#ir-start').classList.add('hidden');
  $('#ir-stop').classList.remove('hidden');
  $('#ir-body').innerHTML = '';
  irPoll();
  ir.timer = setInterval(irPoll, 700);
}
async function irStop() { if (ir.id) { try { await post('/api/intruder/stop', { id: ir.id }); } catch (e) {} } }
async function irPoll() {
  if (!ir.id) return;
  let d;
  try { d = await (await fetch('/api/intruder/status?id=' + ir.id + '&after=' + ir.have)).json(); }
  catch (e) { return; }
  if (d.results && d.results.length) { ir.rows.push(...d.results); ir.have += d.results.length; }
  ir.total = d.total;
  $('#ir-progress').textContent = d.sent + ' / ' + d.total + (d.done ? '  done' : '  sending…');
  renderIrTable();
  if (d.done) {
    clearInterval(ir.timer); ir.timer = null;
    $('#ir-stop').classList.add('hidden'); $('#ir-start').classList.remove('hidden');
  }
}
function renderIrTable() {
  const f = ($('#ir-filter').value || '').toLowerCase();
  let rows = ir.rows;
  if (f) rows = rows.filter(r => (r.payload + ' ' + r.status).toLowerCase().includes(f));
  const key = ir.sort.key, dir = ir.sort.dir;
  rows = rows.slice().sort((a, b) => {
    let x = a[key], y = b[key];
    if (key === 'payload') { x = String(x); y = String(y); return dir * (x < y ? -1 : x > y ? 1 : 0); }
    return dir * ((x || 0) - (y || 0));
  });
  const cap = 3000, shown = rows.slice(0, cap);
  const html = shown.map(r => {
    const cls = (r.n === ir.sel ? ' class="sel"' : (r.matched ? ' class="hit"' : ''));
    const st = r.error ? 'ERR' : (r.status || '·');
    return '<tr data-n="' + r.n + '"' + cls + '>' +
      '<td class="num">' + (r.n + 1) + '</td>' +
      '<td class="pl">' + esc(String(r.payload)) + '</td>' +
      '<td class="st ' + irStatusClass(r.status) + '">' + esc(String(st)) + '</td>' +
      '<td class="num">' + (r.length != null ? r.length : '') + '</td>' +
      '<td class="num">' + (r.time_ms != null ? Math.round(r.time_ms) : '') + '</td>' +
      '<td>' + (r.matched ? '✓' : '') + '</td></tr>';
  }).join('');
  $('#ir-body').innerHTML = html;
  document.querySelectorAll('table.ir th').forEach(th => {
    th.classList.toggle('sorted', th.dataset.sort === key && dir === 1);
    th.classList.toggle('asc', th.dataset.sort === key && dir === -1);
  });
  const note = $('#ir-note');
  if (rows.length > cap) { note.classList.remove('hidden'); note.textContent = 'Showing the first ' + cap + ' of ' + rows.length + ' rows (sort or filter to narrow).'; }
  else note.classList.add('hidden');
}
async function irOpenResult(n) {
  ir.sel = n; renderIrTable();
  if (!state.backend) return;
  try {
    const r = await fetch('/api/intruder/result?id=' + ir.id + '&n=' + n);
    const d = await r.json();
    if (!r.ok) { showFailure(d.error || 'not retained'); return; }
    state.details[d.id] = d; renderInspector(d);
    document.querySelector('#status').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {}
}

// ----- findings -----
const findingsState = { sev: 'all', items: [] };
async function loadFindings() {
  if (!state.backend) return;
  try { const d = await (await fetch('/api/findings')).json(); findingsState.items = d.findings || []; }
  catch (e) { return; }
  renderFindings();
  const n = findingsState.items.length;
  els.findingsBtn.textContent = n ? ('Findings (' + n + ')') : 'Findings';
}
function renderFindings() {
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  let items = findingsState.items.slice();
  if (findingsState.sev !== 'all') items = items.filter(i => i.sev === findingsState.sev);
  items.sort((a, b) => (order[a.sev] - order[b.sev]) || (a.flow_id - b.flow_id));
  $('#f-count').textContent = items.length + (items.length === 1 ? ' finding' : ' findings');
  $('#f-empty').classList.toggle('hidden', items.length > 0);
  $('#f-list').innerHTML = items.map(i =>
    '<li data-flow="' + i.flow_id + '"><span class="sev sev-' + i.sev + '">' + i.sev + '</span>' +
    '<div><div class="ftitle">' + esc(i.title) + '</div><div class="fdetail">' + esc(i.detail) + '</div>' +
    '<div class="furl">' + esc(i.method + ' ' + i.url) + '</div></div></li>').join('');
}

// ----- copy -----
async function copyCode() {
  const text = els.code.textContent;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    if (/ipad|iphone|ipod/i.test(navigator.userAgent)) {
      const range = document.createRange(); range.selectNodeContents(ta);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      ta.setSelectionRange(0, text.length);
    } else {
      ta.select();
    }
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  els.copy.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { els.copy.textContent = 'Copy'; }, 1400);
}

// ----- wiring -----
for (const kind of ['params', 'headers']) {
  const c = els[kind];
  c.addEventListener('input', updateCode);
  c.addEventListener('click', (e) => {
    if (!e.target.classList.contains('x')) return;
    e.target.closest('.row').remove();
    if (!c.querySelector('.row')) addRow(c);
    updateCode();
  });
}
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
  addRow(els[b.dataset.add]).querySelector('.k').focus();
}));
document.querySelectorAll('[data-tab]').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + t.dataset.tab));
}));
document.querySelectorAll('[data-rtab]').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('[data-rtab]').forEach(x => x.classList.toggle('active', x === t));
  for (const id of ['rbody', 'rheaders', 'rreq', 'rhex']) if (els[id]) els[id].classList.toggle('hidden', t.dataset.rtab !== id);
}));
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
  state.lang = b.dataset.lang;
  document.querySelectorAll('[data-lang]').forEach(x => x.classList.toggle('active', x === b));
  updateCode();
}));
els.method.addEventListener('change', () => { paintMethod(); updateCode(); });
els.url.addEventListener('input', updateCode);
els.url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
els.body.addEventListener('input', updateCode);
els.jsonMode.addEventListener('change', updateCode);
els.send.addEventListener('click', send);
els.copy.addEventListener('click', copyCode);
els.edit.addEventListener('click', () => { if (state.current) loadIntoBuilder(state.current); });
els.filter.addEventListener('input', (e) => { state.filter = e.target.value; renderList(); });
els.clear.addEventListener('click', async () => {
  if (state.backend) { try { await post('/api/clear'); } catch (e) {} }
  state.flows = []; state.byId = {}; state.details = {}; state.lastId = 0; state.selected = null;
  els.flows.innerHTML = ''; els.count.textContent = '0 requests'; els.empty.classList.remove('hidden');
});
els.intercept.addEventListener('click', toggleIntercept);
if (els.isave) els.isave.addEventListener('click', applyInterceptOpts);
els.phoneBtn.addEventListener('click', () => {
  els.phone.classList.toggle('hidden');
  if (!els.phone.classList.contains('hidden')) els.phone.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
els.intruderBtn.addEventListener('click', () => {
  els.intruder.classList.toggle('hidden');
  if (!els.intruder.classList.contains('hidden')) { if (positions() < 1 && !$('#ir-tpl').value.trim()) irLoadFromBuilder(); renderPayloadBoxes(); els.intruder.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});
els.findingsBtn.addEventListener('click', () => {
  els.findings.classList.toggle('hidden');
  if (!els.findings.classList.contains('hidden')) { loadFindings(); els.findings.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});
$('#ir-load').addEventListener('click', irLoadFromBuilder);
$('#ir-mark').addEventListener('click', irMark);
$('#ir-clear').addEventListener('click', irClearMarks);
$('#ir-attack').addEventListener('change', renderPayloadBoxes);
$('#ir-tpl').addEventListener('input', renderPayloadBoxes);
$('#ir-gen').addEventListener('click', irGenNumbers);
$('#ir-append').addEventListener('click', irAppendLib);
$('#ir-start').addEventListener('click', irStart);
$('#ir-stop').addEventListener('click', irStop);
$('#ir-filter').addEventListener('input', renderIrTable);
$('#ir-body').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) irOpenResult(+tr.dataset.n); });
document.querySelectorAll('table.ir th').forEach(th => th.addEventListener('click', () => {
  const k = th.dataset.sort;
  if (ir.sort.key === k) ir.sort.dir *= -1; else { ir.sort.key = k; ir.sort.dir = (k === 'payload') ? 1 : -1; }
  renderIrTable();
}));
$('#f-refresh').addEventListener('click', loadFindings);
document.querySelectorAll('#f-filter button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#f-filter button').forEach(x => x.classList.toggle('active', x === b));
  findingsState.sev = b.dataset.sev; renderFindings();
}));
$('#f-list').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  select(+li.dataset.flow);
  document.querySelector('#status').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
function togglePanel(el) {
  if (!el) return;
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
if (els.rulesBtn) els.rulesBtn.addEventListener('click', () => togglePanel(els.rulesPanel));
if (els.decodeBtn) els.decodeBtn.addEventListener('click', () => togglePanel(els.decodePanel));
if (els.cookBtn) els.cookBtn.addEventListener('click', async () => {
  togglePanel(els.cookPanel);
  if (state.backend) {
    try {
      const d = await (await fetch('/api/cookies')).json();
      const lines = (d.cookies || []).map(c => c.host + '  ' + c.pair);
      els.cookOut.textContent = lines.length ? lines.join('\n') : 'No cookies yet.';
    } catch (e) {}
  }
});
if (els.colBtn) els.colBtn.addEventListener('click', () => { togglePanel(els.colPanel); renderCollections(); });
if (els.resend) els.resend.addEventListener('click', () => {
  if (state.current) { loadIntoBuilder(state.current); send(); }
});
if (els.copyCurl) els.copyCurl.addEventListener('click', async () => {
  try {
    const req = describeRequest(formFields());
    try { await navigator.clipboard.writeText(genCurl(req)); } catch (e) {}
    els.copyCurl.textContent = 'Copied';
    setTimeout(() => { els.copyCurl.textContent = 'Copy cURL'; }, 1400);
  } catch (e) {}
});
if (els.hideStatic) els.hideStatic.addEventListener('change', async () => {
  if (!state.backend) return;
  try { await post('/api/scope', { hide_static: els.hideStatic.checked }); } catch (e) {}
});
if (els.bearer) els.bearer.addEventListener('input', updateCode);
function emptyRule() {
  return { enabled: true, side: 'request', target: 'body', find: '', replace: '', regex: false };
}
function ruleRow(rule) {
  const d = document.createElement('div');
  d.className = 'rule';
  d.innerHTML = '<label><input type="checkbox" class="on"></label>' +
    '<select class="side"><option value="request">req</option><option value="response">resp</option></select>' +
    '<select class="target"><option value="body">body</option><option value="header">header</option><option value="url">url</option></select>' +
    '<input type="text" class="find" placeholder="find" spellcheck="false">' +
    '<input type="text" class="repl" placeholder="replace" spellcheck="false">' +
    '<label class="quiet"><input type="checkbox" class="rx"> regex</label>' +
    '<button class="x" type="button" aria-label="Remove">×</button>';
  d.querySelector('.on').checked = !!rule.enabled;
  d.querySelector('.side').value = rule.side || 'request';
  d.querySelector('.target').value = rule.target || 'body';
  d.querySelector('.find').value = rule.find || '';
  d.querySelector('.repl').value = rule.replace || '';
  d.querySelector('.rx').checked = !!rule.regex;
  d.querySelector('.x').addEventListener('click', () => d.remove());
  return d;
}
function readRules() {
  return [...document.querySelectorAll('#rulelist .rule')].map(d => ({
    enabled: d.querySelector('.on').checked,
    side: d.querySelector('.side').value,
    target: d.querySelector('.target').value,
    find: d.querySelector('.find').value,
    replace: d.querySelector('.repl').value,
    regex: d.querySelector('.rx').checked,
  }));
}
function renderRules(rules) {
  if (!els.ruleList) return;
  els.ruleList.innerHTML = '';
  (rules && rules.length ? rules : [emptyRule()]).forEach(r => els.ruleList.appendChild(ruleRow(r)));
}
if ($('#addrule')) $('#addrule').addEventListener('click', () => els.ruleList.appendChild(ruleRow(emptyRule())));
if ($('#saverules')) $('#saverules').addEventListener('click', async () => {
  if (!state.backend) return;
  try {
    const d = await (await post('/api/rules', { rules: readRules() })).json();
    renderRules(d.rules);
    $('#saverules').textContent = 'Saved';
    setTimeout(() => { $('#saverules').textContent = 'Save rules'; }, 1400);
  } catch (e) {}
});
function b64pad(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}
function decodeBytes(kind, src) {
  if (kind === 'url') { try { return decodeURIComponent(src.replace(/\+/g, ' ')); } catch (e) { return 'URL decode failed: ' + e.message; } }
  if (kind === 'urlenc') return encodeURIComponent(src);
  if (kind === 'b64') { try { return atob(b64pad(src.trim())); } catch (e) { return 'Base64 decode failed: ' + e.message; } }
  if (kind === 'b64e') { try { return btoa(src); } catch (e) { return 'Base64 encode failed: ' + e.message; } }
  if (kind === 'hex') {
    const h = src.replace(/[^0-9a-fA-F]/g, '');
    if (h.length % 2) return 'Odd number of hex digits.';
    let out = '';
    for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    return out;
  }
  if (kind === 'hexe') return Array.from(src).map(ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
  if (kind === 'uni') {
    return src.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
              .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  if (kind === 'jwt') {
    const parts = src.trim().split('.');
    if (parts.length < 2) return 'Not a JWT (need at least header.payload).';
    const dec = (p) => {
      try { return JSON.stringify(JSON.parse(atob(b64pad(p))), null, 2); }
      catch (e) { try { return atob(b64pad(p)); } catch (e2) { return '(undecodable)'; } }
    };
    return 'header:\n' + dec(parts[0]) + '\n\npayload:\n' + dec(parts[1]) +
      (parts[2] ? '\n\nsignature: ' + parts[2].slice(0, 24) + '… (not verified)' : '');
  }
  return src;
}
document.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
  els.decOut.textContent = decodeBytes(b.dataset.dec, els.decIn.value || '');
}));
async function loadCollections() {
  if (!state.backend) return;
  try {
    const d = await (await fetch('/api/collections')).json();
    state.collections = d.items || [];
    renderCollections();
  } catch (e) {}
}
function renderCollections() {
  if (!els.colList) return;
  els.colList.innerHTML = '';
  if (!state.collections.length) {
    els.colList.innerHTML = '<li class="empty" style="display:block">Nothing saved yet.</li>';
    return;
  }
  for (const it of state.collections) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="m"></span><span class="u"><b></b><span></span></span><button class="btn small" type="button">Load</button><button class="x" type="button">×</button>';
    li.querySelector('.m').textContent = it.method;
    li.querySelector('b').textContent = it.name;
    li.querySelector('span span').textContent = ' ' + (it.url || '');
    li.querySelector('.btn').addEventListener('click', () => {
      els.method.value = METHODS.includes(it.method) ? it.method : 'GET';
      paintMethod();
      els.url.value = it.url || '';
      fillRows(els.headers, (it.headers || []).map(h => ({ key: h[0] || h.key || '', value: h[1] || h.value || '' })));
      els.body.value = it.body || '';
      els.jsonMode.checked = it.jsonMode !== false;
      updateCode();
    });
    li.querySelector('.x').addEventListener('click', async () => {
      state.collections = state.collections.filter(x => x.id !== it.id);
      if (state.backend) try { await post('/api/collections', { items: state.collections }); } catch (e) {}
      renderCollections();
    });
    els.colList.appendChild(li);
  }
}
if ($('#colsave')) $('#colsave').addEventListener('click', async () => {
  const f = formFields();
  let req;
  try { req = describeRequest(f); } catch (e) { return; }
  state.collections.push({
    id: String(Date.now()),
    name: (els.colName.value || (req.method + ' ' + req.url)).slice(0, 80),
    method: req.method, url: req.url,
    headers: Object.entries(req.headers),
    body: req.body || '', jsonMode: !!f.jsonMode,
  });
  if (state.backend) try { await post('/api/collections', { items: state.collections }); } catch (e) {}
  els.colName.value = '';
  renderCollections();
});
if ($('#searchbtn')) $('#searchbtn').addEventListener('click', async () => {
  const needle = els.filter.value.trim();
  if (!needle || !state.backend) { renderList(); return; }
  try {
    const d = await (await fetch('/api/search?q=' + encodeURIComponent(needle))).json();
    els.flows.innerHTML = '';
    for (const f of (d.hits || [])) els.flows.appendChild(rowFor(f));
    els.count.textContent = (d.hits || []).length + ' hits';
  } catch (e) { renderList(); }
});
$('#prettify').addEventListener('click', () => {
  try { els.body.value = JSON.stringify(JSON.parse(els.body.value), null, 2); } catch (e) {}
  updateCode();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
});

// ----- init -----
async function init() {
  addRow(els.params);
  addRow(els.headers);
  paintMethod();
  updateCode();
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error('no backend');
    const s = await r.json();
    if (typeof s.https_intercept !== 'boolean') throw new Error('no backend');
    state.backend = true;
    setProxyChip(s);
    setIntercept(!!s.intercept);
    if (els.iside && s.intercept_side) els.iside.value = s.intercept_side;
    if (els.ifilter && s.intercept_filter) els.ifilter.value = s.intercept_filter;
    if (els.hideStatic && s.scope) els.hideStatic.checked = !!s.scope.hide_static;
    renderRules(s.rules || []);
    renderPhone(s);
    els.phoneBtn.classList.remove('hidden');
    els.intruderBtn.classList.remove('hidden');
    els.findingsBtn.classList.remove('hidden');
    loadCollections();
    loadFindings();
    flowLoop();
    queueLoop();
  } catch (e) {
    state.backend = false;
    setProxyChip(null);
    els.phoneBtn.classList.add('hidden');
    els.intruderBtn.classList.add('hidden');
    els.findingsBtn.classList.add('hidden');
  }
}
init();
</script>
</body>
</html>
"""


def start_dashboard(host, port, store, intercept, rewrite, scope, ca, proxy_addr, verbose, lan_ip_addr=None, intruder=None):
    srv = Dashboard((host, port), store, intercept, rewrite, scope, ca, proxy_addr, verbose, lan_ip_addr, intruder)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    tq = f"/?t={UI_TOKEN}" if REQUIRE_AUTH else ""
    url = base + tq
    print(f"[*] Web UI:   {url}")
    if REQUIRE_AUTH:
        print("[*] The UI is token-protected. Use the link above; the token is what")
        print("    keeps other people on this network out of the API and your traffic.")
    if ca is not None:
        print(f"[*] CA cert:  {base}/ca   (trust this in the browser you proxy, for HTTPS)")
    if lan_ip_addr:
        phone = f"http://{lan_ip_addr}:{port}{tq}"
        print(f"[*] Phone:    {phone}   (same Wi-Fi; open Phone setup in the UI for the proxy + certificate steps)")
        print("[!] --lan: anyone on this network can reach this port. The token gates the")
        print("    UI and API; the proxy itself still forwards for anyone who sets it.")
        code = qr_terminal(phone)
        if code:
            try:
                print("\n" + code + "\n")
            except UnicodeEncodeError:
                pass
    return url


# ===========================================================================
def main():
    ap = argparse.ArgumentParser(description="aerocall - quick API calls + intercepting proxy + Python/JS export")
    ap.add_argument("-H", "--host", default="127.0.0.1", help="proxy bind host")
    ap.add_argument("-p", "--port", type=int, default=8080, help="proxy port")
    ap.add_argument("--ui-host", default="127.0.0.1", help="web UI bind host")
    ap.add_argument("--ui-port", type=int, default=8081, help="web UI port")
    ap.add_argument("--no-proxy", action="store_true", help="run only the API caller, without the proxy")
    ap.add_argument("--lan", action="store_true", help="listen on all interfaces so phones on the same Wi-Fi can use the UI and proxy")
    ap.add_argument("--insecure", "-k", action="store_true", help="don't verify origin TLS certificates")
    ap.add_argument("--open", action="store_true", help="open the web UI in your browser")
    ap.add_argument("-v", "--verbose", action="store_true", help="also log traffic to the terminal")
    args = ap.parse_args()
    if sys.platform == "win32":
        os.system("")                      # switches the Windows console to ANSI colours
    if args.lan:
        if args.host == "127.0.0.1":
            args.host = "0.0.0.0"
        if args.ui_host == "127.0.0.1":
            args.ui_host = "0.0.0.0"
    # Gate the UI/API with a token whenever it is reachable beyond loopback, so
    # --lan (or an explicit public --ui-host) can't be driven by strangers.
    set_require_auth(args.ui_host not in ("127.0.0.1", "localhost", "::1"))
    ip = lan_ip() if args.lan else None

    print("""
    ==========================================================
      AeroCall    quick API calls  +  intercepting proxy
    ==========================================================
""")
    if args.insecure:
        set_insecure()
        print("[!] --insecure: origin TLS certificates are NOT verified.")

    ca = None
    if not args.no_proxy:
        if HAVE_CRYPTO:
            ca = CertificateAuthority()
        else:
            print("[!] `cryptography` is not installed, so HTTPS through the proxy is tunneled, not decrypted.")
            print("    pip install cryptography   (then restart) to see HTTPS traffic.")

    store = FlowStore()
    intercept = InterceptController()
    rewrite = RewriteEngine()
    scope = ScopeFilter()
    intruder_mgr = IntruderManager()
    proxy_addr = None if args.no_proxy else (args.host, args.port)
    url = start_dashboard(args.ui_host, args.ui_port, store, intercept, rewrite, scope, ca, proxy_addr, args.verbose, ip, intruder_mgr)
    if args.open:
        webbrowser.open(url)

    if args.no_proxy:
        print("[*] Proxy:    off (--no-proxy)\n")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            print("\n[*] Shutting down.")
    else:
        ProxyServer(ca, store, intercept, rewrite, scope, args.host, args.port, args.verbose, ip).serve_forever()


if __name__ == "__main__":
    main()
