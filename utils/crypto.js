// utils/crypto.js
// 密码哈希工具 — SHA-256 + 随机盐值，兼容旧明文密码自动升级

// ── SHA-256 纯 JS 实现 ──
function sha256(message) {
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function ch(x, y, z) { return (x & y) ^ (~x & z); }
  function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
  function bsig0(x) { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); }
  function bsig1(x) { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); }
  function ssig0(x) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3); }
  function ssig1(x) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10); }

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // 预处理: 转 UTF-8 字节
  var bytes = [];
  for (var i = 0; i < message.length; i++) {
    var c = message.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >>> 6)); bytes.push(0x80 | (c & 0x3f)); }
    else { bytes.push(0xe0 | (c >>> 12)); bytes.push(0x80 | ((c >>> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f)); }
  }

  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length + 8) % 64 !== 0) bytes.push(0);

  for (var j = 7; j >= 0; j--) bytes.push((bitLen >>> (j * 8)) & 0xff);

  // 分块处理
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  for (var bi = 0; bi < bytes.length; bi += 64) {
    var W = new Array(64);
    for (var t = 0; t < 16; t++) {
      W[t] = (bytes[bi + t * 4] << 24) | (bytes[bi + t * 4 + 1] << 16) | (bytes[bi + t * 4 + 2] << 8) | bytes[bi + t * 4 + 3];
    }
    for (var tt = 16; tt < 64; tt++) {
      W[tt] = (ssig1(W[tt - 2]) + W[tt - 7] + ssig0(W[tt - 15]) + W[tt - 16]) | 0;
    }

    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hx = H[7];
    for (var ttt = 0; ttt < 64; ttt++) {
      var T1 = (hx + bsig1(e) + ch(e, f, g) + K[ttt] + W[ttt]) | 0;
      var T2 = (bsig0(a) + maj(a, b, c)) | 0;
      hx = g; g = f; f = e; e = (d + T1) | 0;
      d = c; c = b; b = a; a = (T1 + T2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + hx) | 0;
  }

  var hex = '';
  for (var h = 0; h < 8; h++) {
    hex += ((H[h] >>> 24) & 0xff).toString(16).padStart(2, '0');
    hex += ((H[h] >>> 16) & 0xff).toString(16).padStart(2, '0');
    hex += ((H[h] >>> 8) & 0xff).toString(16).padStart(2, '0');
    hex += (H[h] & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}

// ── 随机盐值（16字节 hex 字符串）─
function randomSalt() {
  var s = '';
  for (var i = 0; i < 16; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s + Date.now().toString(16);
}

// ── 密码格式: `sha256:<salt>:<hash>` ──
// 哈希: SHA-256(salt + ":" + password)

function hashPassword(password) {
  var salt = randomSalt();
  var hash = sha256(salt + ':' + password);
  return 'sha256:' + salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored) return false;

  // 旧明文密码: 没有 `sha256:` 前缀，直接比对
  if (stored.indexOf('sha256:') !== 0) {
    return password === stored;
  }

  // 哈希密码: sha256:<salt>:<hash>
  var parts = stored.split(':');
  if (parts.length < 3) return false;
  var salt = parts[1];
  var expectedHash = parts.slice(2).join(':');
  var actualHash = sha256(salt + ':' + password);
  return actualHash === expectedHash;
}

// ── 判断是否已是哈希密码 ──
function isHashed(stored) {
  return stored && stored.indexOf('sha256:') === 0;
}

module.exports = {
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  isHashed: isHashed
};
