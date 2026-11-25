(function () {
  'use strict';

  // Start-of-match math problems: multiple-select questions with five options (A to E), one to four of them
  // correct, from grade 7 to grade 12. Each problem type has its numbers drawn from a seed, so the server and
  // the browser rebuild exactly the same problem from (seed, grade), and a new seed gives new numbers.

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function int(R, lo, hi) {
    return lo + Math.floor(R() * (hi - lo + 1));
  }

  // A random integer from -m to m, never 0.
  function nz(R, m) {
    const v = int(R, 1, m);
    return R() < 0.5 ? -v : v;
  }

  function pick(R, arr) {
    return arr[Math.floor(R() * arr.length)];
  }

  function shuffle(R, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  const MINUS = '−';

  function num(n) {
    return n < 0 ? MINUS + -n : String(n);
  }

  function neg(s) {
    if (s === '0') return s;
    return s[0] === MINUS ? s.slice(1) : MINUS + s;
  }

  // The exact fraction n/d in lowest terms.
  function fr(n, d) {
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1;
    n /= g;
    d /= g;
    if (d === 1) return num(n);
    return (n < 0 ? MINUS : '') + Math.abs(n) + '/' + d;
  }

  // (n/d)·√m in simplest form, e.g. rad(5, 2, 3) is 5√3/2 and rad(1, 1, 20) is 2√5.
  function rad(n, d, m) {
    let k = 1;
    let r = m;
    for (let f = 2; f * f <= r; f++) {
      while (r % (f * f) === 0) {
        r /= f * f;
        k *= f;
      }
    }
    n *= k;
    if (r === 0) return '0';
    if (r === 1 || n === 0) return fr(n, d);
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    n /= g;
    d /= g;
    const a = Math.abs(n);
    return (n < 0 ? MINUS : '') + (a === 1 ? '' : String(a)) + '√' + r + (d === 1 ? '' : '/' + d);
  }

  function root(n) {
    return rad(1, 1, n);
  }

  // (n/d)·π, e.g. piStr(5, 6) is 5π/6.
  function piStr(n, d) {
    if (n === 0) return '0';
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    n /= g;
    d /= g;
    const a = Math.abs(n);
    return (n < 0 ? MINUS : '') + (a === 1 ? '' : String(a)) + 'π' + (d === 1 ? '' : '/' + d);
  }

  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  function sub(n) {
    return (n < 0 ? '₋' : '') +
      String(Math.abs(n))
        .split('')
        .map(c => SUB[Number(c)])
        .join('');
  }

  function sup(n) {
    return (n < 0 ? '⁻' : '') +
      String(Math.abs(n))
        .split('')
        .map(c => SUP[Number(c)])
        .join('');
  }

  // A polynomial in x from its coefficients, highest power first.
  function poly(cs) {
    const deg = cs.length - 1;
    const vars = cs.map((_, i) => {
      const p = deg - i;
      return p === 0 ? '' : p === 1 ? 'x' : 'x' + sup(p);
    });
    return linear(cs, vars);
  }

  // A sum of terms, e.g. linear([3, -4, 10], ['x', 'y', '']) is "3x − 4y + 10".
  function linear(cs, vars) {
    let s = '';
    cs.forEach((c, i) => {
      if (c === 0) return;
      const a = Math.abs(c);
      const body = vars[i] ? (a === 1 ? '' : String(a)) + vars[i] : String(a);
      if (!s) s = (c < 0 ? MINUS : '') + body;
      else s += (c < 0 ? ' − ' : ' + ') + body;
    });
    return s || '0';
  }

  // A polynomial with fraction coefficients [[n, d], ...], highest power first.
  function polyFr(cs) {
    const deg = cs.length - 1;
    let s = '';
    cs.forEach((nd, i) => {
      let n = nd[0];
      let d = nd[1];
      if (n === 0) return;
      const g = gcd(n, d);
      n /= g;
      d /= g;
      if (d < 0) {
        n = -n;
        d = -d;
      }
      const p = deg - i;
      const a = Math.abs(n);
      const coef = d === 1 ? (a === 1 && p > 0 ? '' : String(a)) : '(' + a + '/' + d + ')';
      const body = coef + (p === 0 ? '' : p === 1 ? 'x' : 'x' + sup(p));
      if (!s) s = (n < 0 ? MINUS : '') + body;
      else s += (n < 0 ? ' − ' : ' + ') + body;
    });
    return s || '0';
  }

  // a + bi
  function cx(a, b) {
    if (b === 0) return num(a);
    const ib = Math.abs(b) === 1 ? 'i' : Math.abs(b) + 'i';
    if (a === 0) return (b < 0 ? MINUS : '') + ib;
    return num(a) + (b < 0 ? ' − ' : ' + ') + ib;
  }

  function pt(x, y) {
    return '(' + x + ', ' + y + ')';
  }

  function deg(x) {
    return x + '°';
  }

  function fact(n) {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  }

  function C(n, k) {
    return fact(n) / (fact(k) * fact(n - k));
  }

  function P(n, k) {
    return fact(n) / fact(n - k);
  }

  function factors(n) {
    const out = [];
    for (let p = 2; n > 1; p++) {
      let e = 0;
      while (n % p === 0) {
        n /= p;
        e++;
      }
      if (e) out.push([p, e]);
    }
    return out;
  }

  function factStr(f) {
    return f.map(pe => pe[0] + (pe[1] > 1 ? sup(pe[1]) : '')).join(' × ');
  }

  // Exact values at the special angles (degrees), signs by quadrant. tan is null where it is undefined.
  const REF = { 0: ['0', '1', '0'], 30: ['1/2', '√3/2', '√3/3'], 45: ['√2/2', '√2/2', '1'], 60: ['√3/2', '1/2', '√3'], 90: ['1', '0', null] };
  function trig(d) {
    const m = d % 180;
    const ref = Math.min(m, 180 - m);
    const v = REF[ref];
    const sinNeg = d > 180;
    const cosNeg = d > 90 && d < 270;
    const sin = sinNeg ? neg(v[0]) : v[0];
    const cos = cosNeg ? neg(v[1]) : v[1];
    const tan = v[2] === null ? null : sinNeg !== cosNeg ? neg(v[2]) : v[2];
    return { sin, cos, tan };
  }

  function claim(ok, zh, en) {
    return { ok: !!ok, zh, en: en === undefined ? zh : en };
  }

  // A statement about a value: true with the right value, or false with one of the usual mistakes. A value is
  // a string, or [zh, en] when the words differ. A "mistake" that equals the right value is never used.
  function val(R, right, wrongs, zh, en) {
    const key = v => (Array.isArray(v) ? v[1] : v);
    const zv = v => (Array.isArray(v) ? v[0] : v);
    const ev = v => (Array.isArray(v) ? v[1] : v);
    const bad = wrongs.filter(w => key(w) !== key(right));
    en = en || zh;
    if (!bad.length || R() < 0.5) return claim(true, zh(zv(right)), en(ev(right)));
    const w = pick(R, bad);
    return claim(false, zh(zv(w)), en(ev(w)));
  }

  function choose(R, list) {
    const f = pick(R, list);
    return claim(f[0], f[1], f[2]);
  }

  const ASK = { zh: '下列哪些選項正確？', en: 'Which of the following are true?' };

  // ---------- grade 7 ----------

  const signed = {
    id: 'signed',
    g: 7,
    hint: {
      zh: '正負數運算：減去一個數等於加上它的相反數；同號相乘為正、異號相乘為負；先算括號，再乘除，後加減。',
      en: 'Signed numbers: subtracting a number is adding its opposite; same signs multiply to a positive, different signs to a negative; brackets first, then × and ÷, then + and −.'
    },
    yt: { zh: '正負數 四則運算 國一', en: 'integer operations negative numbers' },
    make(R) {
      const a = int(R, -9, -2);
      const b = int(R, 2, 9);
      let c;
      do {
        c = int(R, -7, 7);
      } while (c === 0 || c === a || c === b);
      return {
        q: { zh: '設 a = ' + num(a) + '，b = ' + num(b) + '，c = ' + num(c) + '。' + ASK.zh, en: 'Let a = ' + num(a) + ', b = ' + num(b) + ' and c = ' + num(c) + '. ' + ASK.en },
        gens: [
          R => val(R, num(a - b), [num(a + b), num(b - a)], v => 'a − b = ' + v),
          R => val(R, num(a * c), [num(-a * c), num(a + c)], v => 'a × c = ' + v),
          () => claim(Math.abs(a) > Math.abs(b), '|a| > |b|'),
          R => val(R, num((a + b) * c), [num(a + b * c), num(-(a + b) * c)], v => '(a + b) × c = ' + v),
          R => val(R, num(a * a), [num(-a * a), num(2 * a)], v => 'a² = ' + v),
          R => val(R, num(b - c), [num(b + c), num(c - b)], v => 'b − c = ' + v),
          () => claim(a * b * c > 0, 'a × b × c > 0')
        ]
      };
    }
  };

  const fractions = {
    id: 'fractions',
    g: 7,
    hint: {
      zh: '分數加減要先通分；分數乘法是分子乘分子、分母乘分母；除以一個分數等於乘以它的倒數。',
      en: 'To add or subtract fractions use a common denominator; to multiply, multiply tops and bottoms; dividing by a fraction is multiplying by its reciprocal.'
    },
    yt: { zh: '分數 四則運算 國一', en: 'fraction operations add subtract multiply divide' },
    make(R) {
      const d1 = pick(R, [2, 3, 4, 5, 6]);
      const n1 = int(R, 1, d1 + 3);
      const d2 = pick(R, [2, 3, 4, 5, 6, 8]);
      const n2 = -int(R, 1, d2 + 2);
      return {
        q: { zh: '設 x = ' + fr(n1, d1) + '，y = ' + fr(n2, d2) + '。' + ASK.zh, en: 'Let x = ' + fr(n1, d1) + ' and y = ' + fr(n2, d2) + '. ' + ASK.en },
        gens: [
          R => val(R, fr(n1 * d2 + n2 * d1, d1 * d2), [fr(n1 + n2, d1 + d2), fr(n1 * d2 - n2 * d1, d1 * d2)], v => 'x + y = ' + v),
          R => val(R, fr(n1 * d2 - n2 * d1, d1 * d2), [fr(n1 * d2 + n2 * d1, d1 * d2), fr(n1 - n2, d1 + d2)], v => 'x − y = ' + v),
          R => val(R, fr(n1 * n2, d1 * d2), [fr(n1 * d2, d1 * n2), fr(n1 * n2, d1 + d2)], v => 'x × y = ' + v),
          R => val(R, fr(n1 * d2, d1 * n2), [fr(n1 * n2, d1 * d2), fr(d1 * n2, n1 * d2)], v => 'x ÷ y = ' + v),
          () => claim(n1 * d2 > -n2 * d1, '|x| > |y|'),
          R => val(R, fr(d2, n2), [fr(-d2, n2), fr(n2, d2)], v => 'y 的倒數是 ' + v, v => 'The reciprocal of y is ' + v)
        ]
      };
    }
  };

  const linEq = {
    id: 'linEq',
    g: 7,
    hint: {
      zh: '一元一次方程式：把含 x 的項移到一邊、常數移到另一邊（移項要變號），再把兩邊同除以 x 的係數。',
      en: 'Move the x-terms to one side and the numbers to the other (changing their signs as they move), then divide both sides by the coefficient of x.'
    },
    yt: { zh: '一元一次方程式 移項 解法', en: 'solving linear equations variables on both sides' },
    make(R) {
      const s = int(R, -8, 8);
      const a = int(R, 2, 9);
      let c;
      do {
        c = int(R, -5, 5);
      } while (c === a);
      const b = int(R, -12, 12);
      const d = a * s + b - c * s;
      const t = int(R, -5, 5);
      const eq = poly([a, b]) + ' = ' + poly([c, d]);
      const sw = a + c !== 0 ? ['x = ' + fr(d - b, a + c)] : [];
      return {
        q: { zh: '關於方程式 ' + eq + '，' + ASK.zh, en: 'For the equation ' + eq + ', which of the following are true?' },
        gens: [
          R => val(R, 'x = ' + num(s), ['x = ' + num(-s)].concat(sw), v => '方程式的解是 ' + v, v => 'The solution is ' + v),
          R => val(R, poly([a - c, 0]) + ' = ' + num(d - b), [poly([a + c, 0]) + ' = ' + num(d - b), poly([a - c, 0]) + ' = ' + num(d + b)], v => '移項整理後可得 ' + v, v => 'Collecting terms gives ' + v),
          R => val(R, num(a * t + b), [num(a * t - b), num(c * t + d)], v => '當 x = ' + num(t) + ' 時，等號左邊的值是 ' + v, v => 'When x = ' + num(t) + ', the left side equals ' + v),
          () => claim(s > 0, '方程式的解是正數', 'The solution is a positive number'),
          R => val(R, num(2 * s + 1), [num(2 * s - 1)], v => '把解代入 2x + 1，得到 ' + v, v => 'Putting the solution into 2x + 1 gives ' + v),
          () => claim(s % 2 === 0, '方程式的解是偶數', 'The solution is an even number')
        ]
      };
    }
  };

  const gcdLcm = {
    id: 'gcdLcm',
    g: 7,
    hint: {
      zh: '先把兩數做質因數分解：最大公因數取共同質因數的較小次方，最小公倍數取所有質因數的較大次方；兩數的最大公因數 × 最小公倍數 = 兩數乘積。',
      en: 'Write both numbers as products of primes: the GCF uses the common primes with the smaller powers, the LCM uses every prime with the larger power; GCF × LCM = the product of the two numbers.'
    },
    yt: { zh: '最大公因數 最小公倍數 質因數分解', en: 'gcf lcm prime factorization' },
    make(R) {
      const g = pick(R, [2, 3, 4, 6, 8, 12]);
      let m;
      let n;
      do {
        m = int(R, 2, 9);
        n = int(R, 2, 9);
      } while (m === n || gcd(m, n) !== 1);
      const A = g * m;
      const B = g * n;
      let divs = 0;
      for (let i = 1; i <= A; i++) if (A % i === 0) divs++;
      const f = factors(A);
      const fw = f.map((pe, i) => (i === 0 ? [pe[0], pe[1] + 1] : pe));
      const k = pick(R, [3, 4, 5]);
      return {
        q: { zh: '關於 ' + A + ' 與 ' + B + '，' + ASK.zh, en: 'About the numbers ' + A + ' and ' + B + ', which of the following are true?' },
        gens: [
          R => val(R, String(g), [String(2 * g), String(Math.min(A, B))], v => '兩數的最大公因數是 ' + v, v => 'Their greatest common factor is ' + v),
          R => val(R, String(g * m * n), [String(A * B), String(g * (m + n))], v => '兩數的最小公倍數是 ' + v, v => 'Their least common multiple is ' + v),
          R =>
            choose(R, [
              [true, '最大公因數 × 最小公倍數 = ' + A + ' × ' + B, 'GCF × LCM = ' + A + ' × ' + B],
              [false, '最大公因數 + 最小公倍數 = ' + A + ' + ' + B, 'GCF + LCM = ' + A + ' + ' + B]
            ]),
          R => val(R, String(divs), [String(divs + 1), String(divs - 1)], v => A + ' 的正因數共有 ' + v + ' 個', v => A + ' has exactly ' + v + ' positive factors'),
          R => val(R, factStr(f), [factStr(fw)], v => A + ' 的質因數分解是 ' + v, v => 'The prime factorization of ' + A + ' is ' + v),
          () => claim(B % k === 0, B + ' 是 ' + k + ' 的倍數', B + ' is a multiple of ' + k)
        ]
      };
    }
  };

  const percent = {
    id: 'percent',
    g: 7,
    hint: {
      zh: '百分率：增加 r% 就是乘以 (1 + r%)，減少 r% 就是乘以 (1 − r%)；先漲後跌的基準不同，所以不會回到原價。',
      en: 'Going up r% means multiplying by (1 + r%), going down r% means multiplying by (1 − r%); the two changes apply to different amounts, so they do not cancel out.'
    },
    yt: { zh: '百分率 漲價 打折 應用問題', en: 'percent increase and decrease word problems' },
    make(R) {
      const r = pick(R, [10, 20, 25, 50]);
      const ps = [200, 400, 500, 800, 1000, 1200, 1600, 2000].filter(x => (x * (10000 - r * r)) % 10000 === 0);
      const p = pick(R, ps);
      const up = (p * (100 + r)) / 100;
      return {
        q: {
          zh: '一件商品原價 ' + p + ' 元，先漲價 ' + r + '%，之後再降價 ' + r + '%。' + ASK.zh,
          en: 'An item costs $' + p + '. Its price goes up by ' + r + '%, then comes down by ' + r + '%. ' + ASK.en
        },
        gens: [
          R => val(R, String(up), [String(p + r), String((p * r) / 100)], v => '漲價後的價格是 ' + v + ' 元', v => 'After the increase the price is $' + v),
          R => val(R, fr(p * (10000 - r * r), 10000), [String(p), String((p * (100 - r)) / 100)], v => '最後的價格是 ' + v + ' 元', v => 'The final price is $' + v),
          R =>
            choose(R, [
              [true, '最後的價格比原價低', 'The final price is lower than the original price'],
              [false, '最後的價格和原價一樣', 'The final price equals the original price']
            ]),
          R => val(R, fr(p * r * r, 10000), ['0', String((p * r) / 100)], v => '最後的價格比原價少 ' + v + ' 元', v => 'The final price is $' + v + ' less than the original'),
          R =>
            choose(R, [
              [true, '如果先降價 ' + r + '% 再漲價 ' + r + '%，最後的價格也一樣', 'Coming down ' + r + '% first and then going up ' + r + '% gives the same final price'],
              [false, '如果先降價 ' + r + '% 再漲價 ' + r + '%，會回到原價', 'Coming down ' + r + '% first and then going up ' + r + '% gives back the original price']
            ]),
          R => val(R, String(100 - r), [String(r), String(100 + r)], v => '降價 ' + r + '% 等於付原本價格的 ' + v + '%', v => 'Coming down ' + r + '% means paying ' + v + '% of the price')
        ]
      };
    }
  };

  const system2 = {
    id: 'system2',
    g: 7,
    hint: {
      zh: '二元一次聯立方程式：用代入消去法或加減消去法消去一個未知數，解出另一個，再代回求出第一個。',
      en: 'Eliminate one variable (by substitution, or by adding or subtracting the equations), solve for the other, then substitute back.'
    },
    yt: { zh: '二元一次聯立方程式 加減消去法', en: 'solving systems of equations elimination' },
    make(R) {
      const x0 = int(R, -6, 6);
      const y0 = int(R, -6, 6);
      let a1;
      let b1;
      let a2;
      let b2;
      do {
        a1 = nz(R, 5);
        b1 = nz(R, 5);
        a2 = nz(R, 5);
        b2 = nz(R, 5);
      } while (a1 * b2 === a2 * b1);
      const c1 = a1 * x0 + b1 * y0;
      const c2 = a2 * x0 + b2 * y0;
      const e1 = linear([a1, b1], ['x', 'y']) + ' = ' + num(c1);
      const e2 = linear([a2, b2], ['x', 'y']) + ' = ' + num(c2);
      return {
        q: { zh: '聯立方程式 ' + e1 + '，' + e2 + '。' + ASK.zh, en: 'Solve the system ' + e1 + ' and ' + e2 + '. ' + ASK.en },
        gens: [
          R => val(R, pt(num(x0), num(y0)), [pt(num(y0), num(x0)), pt(num(-x0), num(y0))], v => '解是 (x, y) = ' + v, v => 'The solution is (x, y) = ' + v),
          R => val(R, num(x0 + y0), [num(x0 - y0), num(-x0 - y0)], v => 'x + y = ' + v),
          R => {
            const u = x0 + b1;
            const w = y0 - a1 + (R() < 0.5 ? 0 : 1);
            return claim(a1 * u + b1 * w === c1, '點 ' + pt(num(u), num(w)) + ' 滿足第一個方程式', 'The point ' + pt(num(u), num(w)) + ' satisfies the first equation');
          },
          R => val(R, num(x0 * y0), [num(-x0 * y0), num(x0 + y0)], v => 'xy = ' + v),
          R =>
            choose(R, [
              [true, '這組聯立方程式恰有一組解', 'The system has exactly one solution'],
              [false, '這組聯立方程式無解', 'The system has no solution']
            ]),
          R => val(R, num(2 * x0 - y0), [num(2 * x0 + y0)], v => '2x − y = ' + v)
        ]
      };
    }
  };

  const powers = {
    id: 'powers',
    g: 7,
    hint: {
      zh: '指數律：aᵐ × aⁿ = aᵐ⁺ⁿ，(aᵐ)ⁿ = aᵐⁿ，a⁰ = 1（a ≠ 0），10⁻ⁿ = 1/10ⁿ；負數的偶次方是正數、奇次方是負數。',
      en: 'Exponent rules: aᵐ × aⁿ = aᵐ⁺ⁿ, (aᵐ)ⁿ = aᵐⁿ, a⁰ = 1 (a ≠ 0), 10⁻ⁿ = 1/10ⁿ; a negative number to an even power is positive, to an odd power negative.'
    },
    yt: { zh: '指數律 科學記號 國一', en: 'exponent rules scientific notation' },
    make(R) {
      const b = pick(R, [2, 3, 5, 7, 10]);
      const m = int(R, 2, 6);
      const n = int(R, 2, 5);
      const k = int(R, 2, 5);
      const e = int(R, 2, 5);
      const p = int(R, 2, 5);
      const mant = pick(R, ['1.2', '2.5', '3.6', '4.5', '6.4', '7.5', '8.1']);
      const ex = R() < 0.5 ? int(R, 3, 6) : -int(R, 2, 5);
      const digits = mant.replace('.', '');
      const dec = ex > 0 ? digits + '0'.repeat(ex - 1) : '0.' + '0'.repeat(-ex - 1) + digits;
      return {
        q: { zh: '下列有關指數的敘述，哪些正確？', en: 'Which of these statements about exponents are true?' },
        gens: [
          R => val(R, b + sup(m + n), [b + sup(m * n)], v => b + sup(m) + ' × ' + b + sup(n) + ' = ' + v),
          R => val(R, b + sup(m * n), [b + sup(m + n)], v => '(' + b + sup(m) + ')' + sup(n) + ' = ' + v),
          R => val(R, num(Math.pow(-k, e)), [num(-Math.pow(-k, e))], v => '(' + MINUS + k + ')' + sup(e) + ' = ' + v),
          R => val(R, '0.' + '0'.repeat(p - 1) + '1', ['0.' + '0'.repeat(p) + '1', MINUS + '1' + '0'.repeat(p)], v => '10' + sup(-p) + ' = ' + v),
          R => val(R, '1', ['0', String(b)], v => b + '⁰ = ' + v),
          R => val(R, mant + ' × 10' + sup(ex), [mant + ' × 10' + sup(ex > 0 ? ex + 1 : ex - 1), mant + ' × 10' + sup(-ex)], v => dec + ' = ' + v)
        ]
      };
    }
  };

  const linIneq = {
    id: 'linIneq',
    g: 7,
    hint: {
      zh: '一元一次不等式：移項的方法和方程式一樣，但兩邊同乘或同除以負數時，不等號要反向。',
      en: 'Solve it like an equation, but when you multiply or divide both sides by a negative number, reverse the inequality sign.'
    },
    yt: { zh: '一元一次不等式 不等號反向', en: 'solving linear inequalities negative reverse sign' },
    make(R) {
      let a;
      do {
        a = int(R, -4, 5);
      } while (a >= -1 && a <= 1);
      const b = int(R, -10, 10);
      const c = int(R, -10, 10);
      const rel = pick(R, ['<', '≤', '>', '≥']);
      const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
      const solRel = a > 0 ? rel : FLIP[rel];
      const cmp = (l, r) => (rel === '<' ? l < r : rel === '≤' ? l <= r : rel === '>' ? l > r : l >= r);
      const ok = x => cmp(a * x + b, c);
      const below = solRel === '<' || solRel === '≤';
      let ext = null;
      for (let x = -100; x <= 100; x++) {
        if (ok(x) && (below || ext === null)) ext = x;
      }
      const ineq = poly([a, b]) + ' ' + rel + ' ' + num(c);
      const t = int(R, -6, 6);
      const word = below ? ['最大的整數解是 ', 'The largest integer solution is '] : ['最小的整數解是 ', 'The smallest integer solution is '];
      return {
        q: { zh: '關於不等式 ' + ineq + '，' + ASK.zh, en: 'For the inequality ' + ineq + ', which of the following are true?' },
        gens: [
          R => val(R, 'x ' + solRel + ' ' + fr(c - b, a), ['x ' + FLIP[solRel] + ' ' + fr(c - b, a), 'x ' + solRel + ' ' + fr(c + b, a)], v => '解是 ' + v, v => 'Its solution is ' + v),
          () => claim(ok(t), 'x = ' + num(t) + ' 是此不等式的解', 'x = ' + num(t) + ' is a solution'),
          R => val(R, num(ext), [num(ext + 1), num(ext - 1)], v => word[0] + v, v => word[1] + v),
          () => claim(a < 0, '解這個不等式時，不等號要反向', 'Solving it requires reversing the inequality sign'),
          () => claim(ok(0), 'x = 0 是此不等式的解', 'x = 0 is a solution')
        ]
      };
    }
  };

  // ---------- grade 8 ----------

  const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]];

  const pythag = {
    id: 'pythag',
    g: 8,
    hint: {
      zh: '畢氏定理：直角三角形兩股的平方和等於斜邊的平方，a² + b² = c²；面積 = 兩股乘積的一半。',
      en: 'Pythagorean theorem: in a right triangle a² + b² = c², where c is the hypotenuse; the area is half the product of the legs.'
    },
    yt: { zh: '畢氏定理 國二', en: 'pythagorean theorem' },
    make(R) {
      const tr = pick(R, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]]);
      const k = pick(R, [1, 2]);
      const a = tr[0] * k;
      const b = tr[1] * k;
      const c = tr[2] * k;
      const t2 = pick(R, TRIPLES);
      const m = int(R, 1, 3);
      const x = t2[0] * m;
      const y = t2[1] * m;
      const z = t2[2] * m + (R() < 0.5 ? 0 : 1);
      const s = int(R, 2, 9);
      return {
        q: { zh: '直角三角形的兩股長分別是 ' + a + ' 和 ' + b + '。' + ASK.zh, en: 'A right triangle has legs ' + a + ' and ' + b + '. ' + ASK.en },
        gens: [
          R => val(R, String(c), [String(a + b), root(b * b - a * a)], v => '斜邊長是 ' + v, v => 'The hypotenuse is ' + v),
          R => val(R, fr(a * b, 2), [String(a * b), fr(a * c, 2)], v => '面積是 ' + v, v => 'The area is ' + v),
          R => val(R, String(a + b + c), [String(2 * (a + b))], v => '周長是 ' + v, v => 'The perimeter is ' + v),
          () => claim(x * x + y * y === z * z, '三邊長是 ' + x + '、' + y + '、' + z + ' 的三角形是直角三角形', 'A triangle with sides ' + x + ', ' + y + ' and ' + z + ' is a right triangle'),
          R => val(R, fr(a * b, c), [fr(c, 2), fr(a + b, 2)], v => '斜邊上的高是 ' + v, v => 'The height to the hypotenuse is ' + v),
          R => val(R, rad(s, 1, 2), [String(2 * s), rad(s, 1, 3)], v => '邊長 ' + s + ' 的正方形，對角線長是 ' + v, v => 'A square with side ' + s + ' has a diagonal of ' + v)
        ]
      };
    }
  };

  const expand = {
    id: 'expand',
    g: 8,
    hint: {
      zh: '乘法公式：(a + b)² = a² + 2ab + b²，(a − b)² = a² − 2ab + b²，(a + b)(a − b) = a² − b²。',
      en: 'Special products: (a + b)² = a² + 2ab + b², (a − b)² = a² − 2ab + b², (a + b)(a − b) = a² − b².'
    },
    yt: { zh: '乘法公式 和的平方 平方差 國二', en: 'special products square of a binomial difference of squares' },
    make(R) {
      const a = int(R, 1, 5);
      const b = nz(R, 9);
      const m = int(R, 2, 9);
      let p;
      let q;
      do {
        p = nz(R, 7);
        q = nz(R, 7);
      } while (p === q);
      const n = pick(R, [50, 100, 200]);
      const d = int(R, 1, 9);
      return {
        q: { zh: '下列哪些乘法公式的展開或計算正確？', en: 'Which of these expansions or calculations are correct?' },
        gens: [
          R => val(R, poly([a * a, 2 * a * b, b * b]), [poly([a * a, 0, b * b]), poly([a * a, a * b, b * b])], v => '(' + poly([a, b]) + ')² = ' + v),
          R => val(R, poly([1, 0, -m * m]), [poly([1, 0, m * m]), poly([1, -2 * m, -m * m])], v => '(' + poly([1, m]) + ')(' + poly([1, -m]) + ') = ' + v),
          R => val(R, poly([1, p + q, p * q]), [poly([1, p * q, p + q]), poly([1, p + q, -p * q])], v => '(' + poly([1, p]) + ')(' + poly([1, q]) + ') = ' + v),
          R => val(R, String((n + d) * (n - d)), [String(n * n + d * d), String(n * n - d)], v => n + d + ' × ' + (n - d) + ' = ' + v),
          R => val(R, String((n + d) * (n + d)), [String(n * n + d * d), String(n * n + n * d + d * d)], v => n + d + '² = ' + v),
          R => val(R, poly([a * a, 0, -b * b]), [poly([a * a, 0, b * b]), poly([a * a, -2 * a * b, -b * b])], v => '(' + poly([a, b]) + ')(' + poly([a, -b]) + ') = ' + v)
        ]
      };
    }
  };

  const factor = {
    id: 'factor',
    g: 8,
    hint: {
      zh: '因式分解：先提出公因式；x² + bx + c 要找相乘得 c、相加得 b 的兩個數（十字交乘）；a² − b² = (a + b)(a − b)；分解完可以乘開檢查。',
      en: 'Take out common factors first; for x² + bx + c find two numbers that multiply to c and add to b; a² − b² = (a + b)(a − b); check by multiplying back out.'
    },
    yt: { zh: '因式分解 十字交乘法 國二', en: 'factoring quadratics trinomials' },
    make(R) {
      let p;
      let q;
      do {
        p = nz(R, 7);
        q = nz(R, 7);
      } while (p === q);
      const B = -(p + q);
      const Cc = p * q;
      const fac = rs =>
        rs
          .slice()
          .sort((x, y) => x - y)
          .map(r => '(' + poly([1, -r]) + ')')
          .join('');
      // fully factored answers only: no common factor left inside the brackets
      let k;
      let mm;
      do {
        k = int(R, 1, 5);
        mm = int(R, 1, 7);
      } while (gcd(k, mm) !== 1);
      const g = int(R, 2, 6);
      let aa;
      let bb;
      do {
        aa = int(R, 1, 4);
        bb = nz(R, 7);
      } while (gcd(aa, bb) !== 1);
      const dd = nz(R, 6);
      return {
        q: { zh: '下列哪些因式分解或敘述正確？', en: 'Which of these factorizations or statements are correct?' },
        gens: [
          R => val(R, fac([p, q]), [fac([-p, -q]), fac([p, -q])], v => poly([1, B, Cc]) + ' = ' + v),
          R => val(R, '(' + poly([k, mm]) + ')(' + poly([k, -mm]) + ')', ['(' + poly([k, -mm]) + ')²', '(' + poly([k, mm]) + ')²'], v => poly([k * k, 0, -mm * mm]) + ' = ' + v),
          R => val(R, g + 'x(' + poly([aa, bb]) + ')', [g + 'x(' + poly([aa, g * bb]) + ')', g + 'x(' + poly([g * aa, bb]) + ')'], v => poly([g * aa, g * bb, 0]) + ' = ' + v),
          R => {
            const kx = pick(R, [p, q, -p, p + 1]);
            return claim(kx * kx + B * kx + Cc === 0, 'x = ' + num(kx) + ' 是方程式 ' + poly([1, B, Cc]) + ' = 0 的解', 'x = ' + num(kx) + ' is a solution of ' + poly([1, B, Cc]) + ' = 0');
          },
          R => val(R, '(' + poly([1, dd]) + ')²', ['(' + poly([1, -dd]) + ')²'], v => poly([1, 2 * dd, dd * dd]) + ' = ' + v)
        ]
      };
    }
  };

  const quadEq = {
    id: 'quadEq',
    g: 8,
    hint: {
      zh: '一元二次方程式可以用因式分解或公式解 x = (−b ± √(b² − 4ac)) / 2a；判別式 b² − 4ac > 0 有兩相異實根、= 0 有重根、< 0 沒有實根。',
      en: 'Factor it, or use the quadratic formula x = (−b ± √(b² − 4ac)) / 2a; the discriminant b² − 4ac > 0 means two different real roots, = 0 a double root, < 0 no real roots.'
    },
    yt: { zh: '一元二次方程式 公式解 判別式', en: 'quadratic formula discriminant' },
    make(R) {
      const A = pick(R, [1, 1, 2, 3]);
      let p;
      let q;
      do {
        p = int(R, -6, 6);
        q = R() < 0.2 ? p : int(R, -6, 6);
      } while (p === 0 && q === 0);
      const B = -A * (p + q);
      const Cc = A * p * q;
      const rs = (x, y) =>
        x === y
          ? ['x = ' + num(x) + '（重根）', 'x = ' + num(x) + ' (a double root)']
          : ['x = ' + num(Math.min(x, y)) + ' 或 x = ' + num(Math.max(x, y)), 'x = ' + num(Math.min(x, y)) + ' or x = ' + num(Math.max(x, y))];
      return {
        q: { zh: '關於方程式 ' + poly([A, B, Cc]) + ' = 0，' + ASK.zh, en: 'For the equation ' + poly([A, B, Cc]) + ' = 0, which of the following are true?' },
        gens: [
          R => val(R, num(B * B - 4 * A * Cc), [num(B * B + 4 * A * Cc), num(B * B - 4 * Cc)], v => '判別式 b² − 4ac = ' + v, v => 'The discriminant b² − 4ac is ' + v),
          () => claim(p !== q, '方程式有兩個相異實根', 'The equation has two different real roots'),
          R => val(R, rs(p, q), [rs(-p, -q), rs(p, -q)], v => '解是 ' + v, v => 'The solutions are ' + v),
          R => {
            const k = pick(R, [p, q, -p, p + 1, q - 1]);
            return claim(A * k * k + B * k + Cc === 0, 'x = ' + num(k) + ' 是方程式的解', 'x = ' + num(k) + ' is a solution');
          },
          R => val(R, num(p + q), [num(-(p + q)), num(B)], v => '兩根之和是 ' + v, v => 'The roots add up to ' + v),
          R => val(R, num(p * q), [num(Cc), num(-p * q)], v => '兩根之積是 ' + v, v => 'The product of the roots is ' + v)
        ]
      };
    }
  };

  const radicals = {
    id: 'radicals',
    g: 8,
    hint: {
      zh: '根式化簡：把被開方數裡的完全平方數提出來，√(k²m) = k√m；√a × √b = √(ab)，但 √a + √b ≠ √(a + b)；分母有根號時，分子分母同乘那個根號（有理化）。',
      en: 'Take perfect squares out of the root: √(k²m) = k√m; √a × √b = √(ab), but √a + √b ≠ √(a + b); to rationalize, multiply top and bottom by the root in the denominator.'
    },
    yt: { zh: '根式化簡 分母有理化 國二', en: 'simplifying radicals rationalizing the denominator' },
    make(R) {
      const m = pick(R, [2, 3, 5, 6, 7]);
      const k = int(R, 2, 6);
      const xy = pick(R, [[2, 3], [2, 5], [3, 5], [2, 7], [3, 7]]);
      const x = xy[0];
      const y = xy[1];
      const a = int(R, 2, 9);
      const mr = pick(R, [2, 3, 5]);
      const p1 = int(R, 2, 5);
      const q1 = pick(R, [2, 3, 5]);
      let p2;
      let q2;
      do {
        p2 = int(R, 2, 5);
        q2 = pick(R, [2, 3, 5]);
      } while (p2 === p1 && q2 === q1);
      return {
        q: { zh: '下列有關平方根的敘述，哪些正確？', en: 'Which of these statements about square roots are true?' },
        gens: [
          R => val(R, rad(k, 1, m), [rad(k + 1, 1, m), rad(k, 1, m + 1)], v => '√' + k * k * m + ' = ' + v),
          R =>
            choose(R, [
              [false, '√' + x + ' + √' + y + ' = √' + (x + y)],
              [true, '√' + x + ' × √' + y + ' = √' + x * y]
            ]),
          R => val(R, rad(a, mr, mr), [rad(a, 1, mr), fr(a, mr)], v => a + '/√' + mr + ' = ' + v),
          () => claim(p1 * p1 * q1 > p2 * p2 * q2, p1 + '√' + q1 + ' > ' + p2 + '√' + q2),
          R => val(R, num(x - y), [String(x + y), num(x * x - y * y)], v => '(√' + x + ' + √' + y + ')(√' + x + ' − √' + y + ') = ' + v),
          R => val(R, String(k * k * m), [String(k * m), String(k * k + m)], v => '(' + k + '√' + m + ')² = ' + v)
        ]
      };
    }
  };

  const arithmetic = {
    id: 'arithmetic',
    g: 8,
    hint: {
      zh: '等差數列：第 n 項 aₙ = a₁ + (n − 1)d；前 n 項和 = n(a₁ + aₙ)/2；若 m + n = p + q，則第 m 項 + 第 n 項 = 第 p 項 + 第 q 項。',
      en: 'Arithmetic sequence: aₙ = a₁ + (n − 1)d; the sum of the first n terms is n(a₁ + aₙ)/2; if m + n = p + q, then term m + term n = term p + term q.'
    },
    yt: { zh: '等差數列 等差級數 公式 國二', en: 'arithmetic sequence formula sum' },
    make(R) {
      const d = pick(R, [-5, -4, -3, -2, 2, 3, 4, 5]);
      const a1 = int(R, -12, 20);
      const t = n => a1 + (n - 1) * d;
      const i = int(R, 2, 4);
      const j = i + int(R, 3, 5);
      const given = 'a' + sub(i) + ' = ' + num(t(i));
      const given2 = 'a' + sub(j) + ' = ' + num(t(j));
      const n = int(R, 10, 15);
      const m = int(R, 8, 12);
      const k1 = int(R, 1, 4);
      const k2 = int(R, k1 + 4, 12);
      const p1 = k1 + int(R, 1, 2);
      let fs = 0;
      for (let x = 2; x < 200 && !fs; x++) if ((d < 0 && t(x) < 0 && t(x - 1) >= 0) || (d > 0 && t(x) > 0 && t(x - 1) <= 0)) fs = x;
      const gens = [
        R => val(R, num(d), [num(-d), num((j - i) * d)], v => '公差是 ' + v, v => 'The common difference is ' + v),
        R => val(R, num(a1), [num(a1 + d), num(a1 - d)], v => 'a₁ = ' + v),
        R => val(R, num(t(n)), [num(t(n + 1)), num(t(n - 1))], v => 'a' + sub(n) + ' = ' + v),
        R => val(R, fr(m * (a1 + t(m)), 2), [num(m * (a1 + t(m))), fr(m * (a1 + t(m + 1)), 2)], v => '前 ' + m + ' 項的和是 ' + v, v => 'The sum of the first ' + m + ' terms is ' + v),
        R => {
          // a_k1 + a_k2 = a_p1 + a_p2 exactly when k1 + k2 = p1 + p2, because d is not 0
          const p2 = k1 + k2 - p1 + (R() < 0.5 ? 0 : -1);
          return claim(k1 + k2 === p1 + p2, 'a' + sub(k1) + ' + a' + sub(k2) + ' = a' + sub(p1) + ' + a' + sub(p2));
        },
        R =>
          choose(R, [
            [d < 0, '此數列是遞減數列', 'The sequence is decreasing'],
            [d > 0, '此數列是遞增數列', 'The sequence is increasing']
          ])
      ];
      if (fs) {
        const zw = d < 0 ? '第一個小於 0 的項是第 ' : '第一個大於 0 的項是第 ';
        const ew = d < 0 ? 'The first negative term is term number ' : 'The first positive term is term number ';
        gens.push(R => val(R, String(fs), [String(fs - 1), String(fs + 1)], v => zw + v + ' 項', v => ew + v));
      }
      return {
        q: { zh: '等差數列 ⟨aₙ⟩ 中，' + given + '，' + given2 + '。' + ASK.zh, en: 'In an arithmetic sequence ⟨aₙ⟩, ' + given + ' and ' + given2 + '. ' + ASK.en },
        gens
      };
    }
  };

  const polygon = {
    id: 'polygon',
    g: 8,
    hint: {
      zh: 'n 邊形的內角和 = (n − 2) × 180°，外角和永遠是 360°；正 n 邊形每個外角 = 360° ÷ n；對角線共有 n(n − 3)/2 條。',
      en: 'The interior angles of an n-gon add up to (n − 2) × 180° and the exterior angles always add up to 360°; each exterior angle of a regular n-gon is 360° ÷ n; there are n(n − 3)/2 diagonals.'
    },
    yt: { zh: '多邊形 內角和 外角和 國二', en: 'polygon interior angle sum exterior angles' },
    make(R) {
      const n = pick(R, [5, 6, 8, 9, 10, 12, 15, 18, 20]);
      const inner = ((n - 2) * 180) / n;
      return {
        q: { zh: '關於正 ' + n + ' 邊形，' + ASK.zh, en: 'For a regular polygon with ' + n + ' sides, which of the following are true?' },
        gens: [
          R => val(R, deg((n - 2) * 180), [deg(n * 180), deg((n - 1) * 180)], v => '內角和是 ' + v, v => 'Its interior angles add up to ' + v),
          R => val(R, deg(inner), [deg(360 / n), deg(inner + 10)], v => '每個內角是 ' + v, v => 'Each interior angle is ' + v),
          R => val(R, deg(360 / n), [deg(inner), deg(720 / n)], v => '每個外角是 ' + v, v => 'Each exterior angle is ' + v),
          R => val(R, String((n * (n - 3)) / 2), [String(n * (n - 3)), String((n * (n - 1)) / 2)], v => '對角線共有 ' + v + ' 條', v => 'It has ' + v + ' diagonals'),
          R =>
            choose(R, [
              [true, '外角和是 360°', 'Its exterior angles add up to 360°'],
              [false, '外角和是 ' + deg((n - 2) * 180), 'Its exterior angles add up to ' + deg((n - 2) * 180)]
            ]),
          R => val(R, String(n - 2), [String(n - 3), String(n)], v => '從一個頂點畫出所有對角線，可以把它分成 ' + v + ' 個三角形', v => 'The diagonals from one vertex split it into ' + v + ' triangles')
        ]
      };
    }
  };

  const triAngles = {
    id: 'triAngles',
    g: 8,
    hint: {
      zh: '三角形內角和是 180°；一個外角等於不相鄰的兩個內角和；大角對大邊、小角對小邊。',
      en: 'The angles of a triangle add up to 180°; an exterior angle equals the sum of the two interior angles not next to it; the larger angle is opposite the longer side.'
    },
    yt: { zh: '三角形 內角和 外角定理 大角對大邊', en: 'triangle angle sum exterior angle theorem' },
    make(R) {
      let A;
      let B;
      let Cg;
      do {
        A = 5 * int(R, 6, 20);
        B = 5 * int(R, 6, 20);
        Cg = 180 - A - B;
      } while (Cg < 20 || A === B || A === Cg || B === Cg);
      const mx = Math.max(A, B, Cg);
      return {
        q: { zh: '△ABC 中，∠A = ' + deg(A) + '，∠B = ' + deg(B) + '。' + ASK.zh, en: 'In triangle ABC, ∠A = ' + deg(A) + ' and ∠B = ' + deg(B) + '. ' + ASK.en },
        gens: [
          R => val(R, deg(Cg), [deg(180 - A), deg(360 - A - B)], v => '∠C = ' + v),
          R => val(R, deg(A + B), [deg(Cg), deg(Math.abs(A - B))], v => '∠C 的外角是 ' + v, v => 'The exterior angle at C is ' + v),
          () => claim(A === mx, '最長的邊是 BC', 'BC is the longest side'),
          R =>
            choose(R, [
              [mx > 90, '△ABC 是鈍角三角形', 'Triangle ABC is obtuse'],
              [mx < 90, '△ABC 是銳角三角形', 'Triangle ABC is acute']
            ]),
          () => claim(Cg < B, 'AB < AC'),
          R => val(R, deg(180 - A), [deg(B), deg(Cg)], v => '∠A 的外角是 ' + v, v => 'The exterior angle at A is ' + v)
        ]
      };
    }
  };

  const stats = {
    id: 'stats',
    g: 8,
    hint: {
      zh: '平均數 = 總和 ÷ 個數；中位數要先由小到大排好再取中間（偶數個取中間兩個的平均）；眾數是出現最多次的數；全距 = 最大值 − 最小值。',
      en: 'Mean = total ÷ count; for the median sort the values first and take the middle one (the average of the middle two for an even count); the mode is the most frequent value; range = largest − smallest.'
    },
    yt: { zh: '平均數 中位數 眾數 全距', en: 'mean median mode range' },
    make(R) {
      const n = pick(R, [5, 6, 7]);
      const pool = shuffle(R, Array.from({ length: 20 }, (_, i) => i + 1));
      const vals = pool.slice(0, n - 1);
      const mode = pick(R, vals);
      const data = shuffle(R, vals.concat([mode]));
      const sorted = data.slice().sort((x, y) => x - y);
      const S = data.reduce((x, y) => x + y, 0);
      // twice the median, so it stays an integer for an even count
      const med2 = n % 2 ? 2 * sorted[(n - 1) / 2] : sorted[n / 2 - 1] + sorted[n / 2];
      const medTxt = fr(med2, 2);
      const meanTxt = fr(S, n);
      const lo = sorted[0];
      const hi = sorted[n - 1];
      return {
        q: { zh: '某組資料為：' + data.join('、') + '。' + ASK.zh, en: 'A data set: ' + data.join(', ') + '. ' + ASK.en },
        gens: [
          R => val(R, meanTxt, [fr(S, n - 1), medTxt], v => '平均數是 ' + v, v => 'The mean is ' + v),
          R => val(R, medTxt, [meanTxt, String(data[Math.floor(n / 2)])], v => '中位數是 ' + v, v => 'The median is ' + v),
          R => val(R, String(mode), [String(hi), String(lo)], v => '眾數是 ' + v, v => 'The mode is ' + v),
          R => val(R, String(hi - lo), [String(hi), String(hi - lo + 1)], v => '全距是 ' + v, v => 'The range is ' + v),
          R =>
            choose(R, [
              [true, '每個數都加 5 之後，全距不變', 'If 5 is added to every value, the range stays the same'],
              [false, '每個數都加 5 之後，全距也增加 5', 'If 5 is added to every value, the range also goes up by 5']
            ]),
          R => val(R, fr(2 * S, n), [fr(S + 2 * n, n), meanTxt], v => '每個數都乘以 2 之後，平均數是 ' + v, v => 'If every value is doubled, the mean becomes ' + v),
          () => claim(2 * S > n * med2, '平均數大於中位數', 'The mean is greater than the median')
        ]
      };
    }
  };

  // ---------- grade 9 ----------

  const quadratic = {
    id: 'quadratic',
    g: 9,
    hint: {
      zh: '二次函數 f(x) = a(x − h)² + k 的頂點是 (h, k)；a > 0 開口向上、有最小值，a < 0 開口向下、有最大值；兩根之和 = −b/a，兩根之積 = c/a。',
      en: 'A quadratic f(x) = a(x − h)² + k has vertex (h, k); if a > 0 it opens up and has a minimum, if a < 0 it opens down and has a maximum; the roots add up to −b/a and multiply to c/a.'
    },
    yt: { zh: '二次函數 頂點 最大值 最小值 國三', en: 'quadratic function vertex maximum minimum' },
    make(R) {
      const a = pick(R, [1, 1, 2, -1, -2, 3]);
      const p = int(R, -6, 5);
      const q = int(R, p + 1, 7);
      const f = x => a * (x - p) * (x - q);
      const c = a * p * q;
      const S = p + q;
      const Pr = p * q;
      const F = 'f(x) = ' + poly([a, -a * S, c]);
      const k = int(R, -3, 3);
      const gap2 = (q - p) * (q - p);
      return {
        q: { zh: '設 ' + F + '。' + ASK.zh, en: 'Let ' + F + '. ' + ASK.en },
        gens: [
          R => val(R, num(S), [num(-S), num(a * S), num(S + 2)], v => 'f(x) = 0 的兩根之和是 ' + v, v => 'The two roots of f(x) = 0 add up to ' + v),
          R => val(R, num(Pr), [num(c), num(-Pr), num(Pr + 1)], v => 'f(x) = 0 的兩根之積是 ' + v, v => 'The product of the two roots of f(x) = 0 is ' + v),
          R => val(R, fr(S, 2), [fr(-S, 2), num(S)], v => '圖形頂點的 x 坐標是 ' + v, v => 'The vertex of the graph has x-coordinate ' + v),
          R => val(R, fr(-a * gap2, 4), [fr(a * gap2, 4), fr(-a * gap2, 2), fr(-gap2, 4)], v => '圖形頂點的 y 坐標是 ' + v, v => 'The vertex of the graph has y-coordinate ' + v),
          R =>
            choose(R, [
              [a > 0, 'f(x) 有最小值', 'f(x) has a minimum value'],
              [a < 0, 'f(x) 有最大值', 'f(x) has a maximum value']
            ]),
          R => val(R, num(f(k)), [num(f(-k)), num(f(k) + a), num(-f(k))], v => 'f(' + num(k) + ') = ' + v),
          () => claim(a > 0, '不等式 f(x) < 0 的解是 ' + num(p) + ' < x < ' + num(q), 'The solution of f(x) < 0 is ' + num(p) + ' < x < ' + num(q)),
          R => val(R, pt(0, num(c)), [pt(0, num(Pr)), pt(0, num(-c)), pt(num(c), 0)], v => 'y = f(x) 的圖形與 y 軸交於點 ' + v, v => 'The graph of y = f(x) meets the y-axis at ' + v)
        ]
      };
    }
  };

  const line = {
    id: 'line',
    g: 9,
    hint: {
      zh: '斜率 m = (y₂ − y₁)/(x₂ − x₁)；直線 y = mx + b 的 y 截距是 b；互相垂直的兩直線斜率相乘為 −1；中點是兩點坐標的平均；兩點距離 = √((x₂ − x₁)² + (y₂ − y₁)²)。',
      en: 'Slope m = (y₂ − y₁)/(x₂ − x₁); the line y = mx + b has y-intercept b; perpendicular slopes multiply to −1; the midpoint averages the coordinates; distance = √((x₂ − x₁)² + (y₂ − y₁)²).'
    },
    yt: { zh: '直線斜率 中點 兩點距離 直線方程式', en: 'slope midpoint distance formula equation of a line' },
    make(R) {
      let x1;
      let y1;
      let x2;
      let y2;
      do {
        x1 = int(R, -6, 6);
        y1 = int(R, -6, 6);
        x2 = int(R, -6, 6);
        y2 = int(R, -6, 6);
      } while (x1 === x2 || y1 === y2);
      const dx = x2 - x1;
      const dy = y2 - y1;
      // y = (dy/dx)x + b with b = (y1·dx − dy·x1)/dx
      const bN = y1 * dx - dy * x1;
      const Pp = pt(num(x1), num(y1));
      const Qp = pt(num(x2), num(y2));
      const u = int(R, -8, 8);
      const diff = Math.abs(dx * dx - dy * dy);
      const lenWrong = [num(Math.abs(dx) + Math.abs(dy))];
      if (diff > 0) lenWrong.push(root(diff));
      return {
        q: { zh: '坐標平面上有兩點 P' + Pp + '、Q' + Qp + '。' + ASK.zh, en: 'In the coordinate plane, P' + Pp + ' and Q' + Qp + '. ' + ASK.en },
        gens: [
          R => val(R, fr(dy, dx), [fr(-dy, dx), fr(dx, dy)], v => '直線 PQ 的斜率是 ' + v, v => 'Line PQ has slope ' + v),
          R => val(R, fr(bN, dx), [fr(-bN, dx), fr(bN + dy, dx)], v => '直線 PQ 的 y 截距是 ' + v, v => 'The y-intercept of line PQ is ' + v),
          R => {
            const on = R() < 0.5;
            const pnt = pt(num(u), fr(dy * u + bN + (on ? 0 : dx), dx));
            return claim(on, '點 ' + pnt + ' 在直線 PQ 上', 'The point ' + pnt + ' lies on line PQ');
          },
          R => val(R, fr(-dx, dy), [fr(dx, dy), fr(-dy, dx)], v => '與直線 PQ 垂直的直線，斜率是 ' + v, v => 'A line perpendicular to PQ has slope ' + v),
          R => val(R, pt(fr(x1 + x2, 2), fr(y1 + y2, 2)), [pt(fr(dx, 2), fr(dy, 2)), pt(num(x1 + x2), num(y1 + y2))], v => '線段 PQ 的中點是 ' + v, v => 'The midpoint of PQ is ' + v),
          R => val(R, root(dx * dx + dy * dy), lenWrong, v => '線段 PQ 的長度是 ' + v, v => 'PQ has length ' + v)
        ]
      };
    }
  };

  const dice = {
    id: 'dice',
    g: 9,
    hint: {
      zh: '兩顆骰子共有 6 × 6 = 36 種機會相等的結果（要分第一顆、第二顆）；數出符合條件的有幾種，機率 = 個數 ÷ 36。',
      en: 'Two dice give 6 × 6 = 36 equally likely outcomes (first die and second die count separately); count the outcomes that fit, and the probability is that count ÷ 36.'
    },
    yt: { zh: '擲兩顆骰子 機率 國三', en: 'probability two dice sample space' },
    make(R) {
      const count = f => {
        let n = 0;
        for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) if (f(i, j)) n++;
        return n;
      };
      const s = int(R, 3, 11);
      const cs = count((i, j) => i + j === s);
      const g = int(R, 7, 10);
      const s1 = int(R, 2, 12);
      let s2 = int(R, 2, 11);
      if (s2 >= s1) s2++;
      return {
        q: { zh: '同時擲兩顆公正的骰子。' + ASK.zh, en: 'Two fair dice are rolled. ' + ASK.en },
        gens: [
          R => val(R, fr(cs, 36), [fr(1, 11), fr(cs, 21)], v => '點數和為 ' + s + ' 的機率是 ' + v, v => 'The probability that the sum is ' + s + ' is ' + v),
          R => val(R, fr(count((i, j) => i === j), 36), [fr(1, 36), fr(1, 12)], v => '兩顆點數相同的機率是 ' + v, v => 'The probability of rolling a double is ' + v),
          R => val(R, fr(count((i, j) => i === 6 || j === 6), 36), [fr(1, 3), fr(1, 36)], v => '至少出現一個 6 點的機率是 ' + v, v => 'The probability of at least one 6 is ' + v),
          R => val(R, fr(count((i, j) => (i * j) % 2 === 1), 36), [fr(1, 2), fr(1, 3)], v => '點數乘積是奇數的機率是 ' + v, v => 'The probability that the product is odd is ' + v),
          R => val(R, fr(count((i, j) => i + j > g), 36), [fr(count((i, j) => i + j >= g), 36), fr(12 - g, 11)], v => '點數和大於 ' + g + ' 的機率是 ' + v, v => 'The probability that the sum is greater than ' + g + ' is ' + v),
          () => claim(count((i, j) => i + j === s1) > count((i, j) => i + j === s2), '點數和為 ' + s1 + ' 的機率大於點數和為 ' + s2 + ' 的機率', 'A sum of ' + s1 + ' is more likely than a sum of ' + s2)
        ]
      };
    }
  };

  const similar = {
    id: 'similar',
    g: 9,
    hint: {
      zh: '相似三角形：對應角相等、對應邊成比例；周長比等於邊長比，面積比等於邊長比的平方。',
      en: 'Similar triangles: corresponding angles are equal and corresponding sides are in proportion; perimeters have the same ratio as the sides, areas have the square of that ratio.'
    },
    yt: { zh: '相似三角形 面積比 周長比 國三', en: 'similar triangles area ratio perimeter ratio' },
    make(R) {
      const pq = pick(R, [[1, 2], [2, 3], [3, 2], [2, 1], [3, 4], [4, 3], [1, 3], [3, 1]]);
      const p = pq[0];
      const q = pq[1];
      let u;
      let v;
      let w;
      do {
        u = int(R, 2, 6);
        v = int(R, 2, 7);
        w = int(R, 2, 8);
      } while (u === v || v === w || u === w || u + v <= w || u + w <= v || v + w <= u);
      const t = int(R, 2, 6);
      const per = u + v + w;
      return {
        q: {
          zh: '△ABC ∼ △DEF（A、B、C 依序對應 D、E、F），AB = ' + p * u + '，BC = ' + p * v + '，CA = ' + p * w + '，DE = ' + q * u + '。' + ASK.zh,
          en: 'Triangle ABC ∼ triangle DEF (A, B, C match D, E, F), with AB = ' + p * u + ', BC = ' + p * v + ', CA = ' + p * w + ' and DE = ' + q * u + '. ' + ASK.en
        },
        gens: [
          R => val(R, String(q * v), [num(p * v + q * u - p * u)], v2 => 'EF = ' + v2),
          R => val(R, p + ' : ' + q, [p * p + ' : ' + q * q, q + ' : ' + p], v2 => '△ABC 與 △DEF 的周長比是 ' + v2, v2 => 'The perimeters of ABC and DEF are in the ratio ' + v2),
          R => val(R, p * p + ' : ' + q * q, [p + ' : ' + q, p * p * p + ' : ' + q * q * q], v2 => '△ABC 與 △DEF 的面積比是 ' + v2, v2 => 'The areas of ABC and DEF are in the ratio ' + v2),
          R => val(R, String(q * per), [String(p * per), String((p + q) * per)], v2 => '△DEF 的周長是 ' + v2, v2 => 'The perimeter of DEF is ' + v2),
          R => choose(R, [[true, '∠A = ∠D'], [false, '∠A = ∠E']]),
          R => val(R, String(q * q * t), [String(p * q * t), String(2 * q * q * t)], v2 => '若 △ABC 的面積是 ' + p * p * t + '，則 △DEF 的面積是 ' + v2, v2 => 'If triangle ABC has area ' + p * p * t + ', triangle DEF has area ' + v2)
        ]
      };
    }
  };

  const circleAngles = {
    id: 'circleAngles',
    g: 9,
    hint: {
      zh: '圓周角是同弧所對圓心角的一半；弧長 = 2πr × θ/360，扇形面積 = πr² × θ/360；切線垂直於過切點的半徑。',
      en: 'An inscribed angle is half the central angle on the same arc; arc length = 2πr × θ/360 and sector area = πr² × θ/360; a tangent is perpendicular to the radius at the point where it touches.'
    },
    yt: { zh: '圓周角 圓心角 弧長 扇形面積', en: 'inscribed angle central angle arc length sector area' },
    make(R) {
      const r = int(R, 3, 12);
      const th = pick(R, [40, 60, 72, 80, 90, 100, 120, 140]);
      return {
        q: {
          zh: '圓 O 的半徑是 ' + r + '，圓心角 ∠AOB = ' + deg(th) + '，點 C 在優弧 AB 上。' + ASK.zh,
          en: 'Circle O has radius ' + r + ' and central angle ∠AOB = ' + deg(th) + '; point C is on the major arc AB. ' + ASK.en
        },
        gens: [
          R => val(R, deg(th / 2), [deg(th), deg(180 - th / 2)], v => '∠ACB = ' + v),
          R => val(R, piStr(th * r, 180), [piStr(th * r, 360), piStr(th * r * r, 360)], v => '劣弧 AB 的長度是 ' + v, v => 'The minor arc AB has length ' + v),
          R => val(R, piStr(th * r * r, 360), [piStr(th * r, 180), piStr(th * r * r, 180)], v => '扇形 OAB 的面積是 ' + v, v => 'Sector OAB has area ' + v),
          R =>
            choose(R, [
              [true, '過 A 的切線與 OA 垂直', 'The tangent at A is perpendicular to OA'],
              [false, '過 A 的切線與 OA 的夾角是 ' + deg(th / 2), 'The tangent at A meets OA at an angle of ' + deg(th / 2)]
            ]),
          R => val(R, deg((180 - th) / 2), [deg(th / 2), deg(180 - th)], v => '∠OAB = ' + v),
          R => val(R, deg(180 - th / 2), [deg(th / 2), deg(th)], v => '若 D 在劣弧 AB 上，則 ∠ADB = ' + v, v => 'If D is on the minor arc AB, then ∠ADB = ' + v)
        ]
      };
    }
  };

  const centers = {
    id: 'centers',
    g: 9,
    hint: {
      zh: '外心到三頂點等距，直角三角形的外心在斜邊中點（外接圓半徑 = 斜邊的一半）；內心到三邊等距，直角三角形的內切圓半徑 = (a + b − c)/2；重心把每條中線分成 2 : 1。',
      en: 'The circumcenter is the same distance from all three vertices; in a right triangle it is the midpoint of the hypotenuse (circumradius = half the hypotenuse). The incenter is the same distance from all three sides; a right triangle has inradius (a + b − c)/2. The centroid splits each median 2 : 1.'
    },
    yt: { zh: '三角形 外心 內心 重心 國三', en: 'triangle centroid circumcenter incenter' },
    make(R) {
      const tr = pick(R, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25]]);
      const k = pick(R, [1, 2]);
      const a = tr[0] * k;
      const b = tr[1] * k;
      const c = tr[2] * k;
      return {
        q: { zh: '直角三角形 ABC 中，∠C = 90°，BC = ' + a + '，CA = ' + b + '。' + ASK.zh, en: 'In right triangle ABC, ∠C = 90°, BC = ' + a + ' and CA = ' + b + '. ' + ASK.en },
        gens: [
          R => val(R, fr(c, 2), [fr(a + b, 2), String(c)], v => '外接圓半徑是 ' + v, v => 'The circumradius is ' + v),
          R => val(R, fr(a + b - c, 2), [fr(c, 2), fr(a * b, a + b)], v => '內切圓半徑是 ' + v, v => 'The inradius is ' + v),
          R =>
            choose(R, [
              [true, '外心是斜邊 AB 的中點', 'The circumcenter is the midpoint of the hypotenuse AB'],
              [false, '外心是直角的頂點 C', 'The circumcenter is the right-angle vertex C']
            ]),
          R => val(R, fr(c, 3), [fr(c, 2), fr(c, 6)], v => '直角頂點 C 到重心的距離是 ' + v, v => 'The distance from C to the centroid is ' + v),
          R =>
            choose(R, [
              [true, '外心到三個頂點的距離相等', 'The circumcenter is the same distance from all three vertices'],
              [false, '重心到三個頂點的距離相等', 'The centroid is the same distance from all three vertices']
            ]),
          R => val(R, fr(a * b, 2), [String(a * b), fr(a * c, 2)], v => '面積是 ' + v, v => 'The area is ' + v)
        ]
      };
    }
  };

  const balls = {
    id: 'balls',
    g: 9,
    hint: {
      zh: '每顆球被抽到的機會相等時，機率 = 符合條件的球數 ÷ 全部球數；P(不發生) = 1 − P(發生)。注意 1 不是質數。',
      en: 'When every ball is equally likely, probability = balls that fit ÷ all balls; P(not A) = 1 − P(A). Remember that 1 is not a prime.'
    },
    yt: { zh: '機率 國三 古典機率', en: 'basic probability favorable outcomes' },
    make(R) {
      const N = int(R, 10, 30);
      const k = pick(R, [3, 4, 5]);
      const isPrime = x => {
        if (x < 2) return false;
        for (let i = 2; i * i <= x; i++) if (x % i === 0) return false;
        return true;
      };
      let primes = 0;
      for (let i = 1; i <= N; i++) if (isPrime(i)) primes++;
      let sq = 0;
      while ((sq + 1) * (sq + 1) <= N) sq++;
      const ev = Math.floor(N / 2);
      const mk = Math.floor(N / k);
      return {
        q: {
          zh: '箱子裡有 ' + N + ' 顆球，分別寫著 1 到 ' + N + '，從中隨機抽出一顆。' + ASK.zh,
          en: 'A box holds ' + N + ' balls numbered 1 to ' + N + '. One ball is drawn at random. ' + ASK.en
        },
        gens: [
          R => val(R, fr(ev, N), [fr(1, 2), fr(N - ev + 1, N)], v => '抽到偶數的機率是 ' + v, v => 'The probability of an even number is ' + v),
          R => val(R, fr(mk, N), [fr(1, k), fr(mk + 1, N)], v => '抽到 ' + k + ' 的倍數的機率是 ' + v, v => 'The probability of a multiple of ' + k + ' is ' + v),
          R => val(R, fr(primes, N), [fr(primes + 1, N)], v => '抽到質數的機率是 ' + v, v => 'The probability of a prime number is ' + v),
          R => val(R, fr(N - mk, N), [fr(mk, N)], v => '抽到的數不是 ' + k + ' 的倍數的機率是 ' + v, v => 'The probability of a number that is not a multiple of ' + k + ' is ' + v),
          () => claim(N % 2 === 1, '抽到奇數的機率比抽到偶數的機率大', 'An odd number is more likely than an even number'),
          R => val(R, fr(sq, N), [fr(sq - 1, N)], v => '抽到完全平方數的機率是 ' + v, v => 'The probability of a perfect square is ' + v)
        ]
      };
    }
  };

  // ---------- grade 10 ----------

  const geometric = {
    id: 'geometric',
    g: 10,
    hint: {
      zh: '等比數列：aₙ = a₁·rⁿ⁻¹；前 n 項和 = a₁(rⁿ − 1)/(r − 1)（r ≠ 1）；a₃ × a₇ = (a₅)²（等比中項）。',
      en: 'Geometric sequence: aₙ = a₁·rⁿ⁻¹; the sum of the first n terms is a₁(rⁿ − 1)/(r − 1) when r ≠ 1; a₃ × a₇ = (a₅)².'
    },
    yt: { zh: '等比數列 等比級數 公式', en: 'geometric sequence formula sum' },
    make(R) {
      const r = pick(R, [2, 3, -2, -3]);
      const a1 = pick(R, [1, 2, 3, -1, -2, -3]);
      const t = n => a1 * Math.pow(r, n - 1);
      const s5 = (a1 * (Math.pow(r, 5) - 1)) / (r - 1);
      return {
        q: {
          zh: '等比數列 ⟨aₙ⟩ 中，a₂ = ' + num(t(2)) + '，a₅ = ' + num(t(5)) + '。' + ASK.zh,
          en: 'In a geometric sequence ⟨aₙ⟩, a₂ = ' + num(t(2)) + ' and a₅ = ' + num(t(5)) + '. ' + ASK.en
        },
        gens: [
          R => val(R, num(r), [num(-r), num(r * r), num(r * r * r)], v => '公比是 ' + v, v => 'The common ratio is ' + v),
          R => val(R, num(a1), [num(-a1), num(t(3))], v => 'a₁ = ' + v),
          R => val(R, num(t(6)), [num(t(7)), num(-t(6))], v => 'a₆ = ' + v),
          R => val(R, num(s5), [num(s5 + t(6)), num(s5 - a1)], v => '前 5 項的和是 ' + v, v => 'The sum of the first 5 terms is ' + v),
          R => choose(R, [[true, 'a₃ × a₇ = (a₅)²'], [false, 'a₃ × a₇ = (a₄)²']]),
          () => claim(a1 > 0 && r > 0, '此數列的每一項都是正數', 'Every term of the sequence is positive'),
          () => claim(r < 0, '此數列的項正負交替', 'The terms alternate between positive and negative')
        ]
      };
    }
  };

  const rightTrig = {
    id: 'rightTrig',
    g: 10,
    hint: {
      zh: '直角三角形的三角比：sin A = 對邊/斜邊，cos A = 鄰邊/斜邊，tan A = 對邊/鄰邊；先用畢氏定理求出第三邊；A + B = 90° 時 sin A = cos B。',
      en: 'In a right triangle: sin A = opposite/hypotenuse, cos A = adjacent/hypotenuse, tan A = opposite/adjacent; find the third side with the Pythagorean theorem first; when A + B = 90°, sin A = cos B.'
    },
    yt: { zh: '三角比 sin cos tan 直角三角形', en: 'right triangle trigonometry sin cos tan' },
    make(R) {
      const tr = pick(R, TRIPLES);
      const swap = R() < 0.5;
      const a = swap ? tr[1] : tr[0];
      const b = swap ? tr[0] : tr[1];
      const c = tr[2];
      const k = pick(R, [1, 2, 3]);
      const BC = k * a;
      const AC = k * b;
      const AB = k * c;
      return {
        q: {
          zh: '直角三角形 ABC 中，∠C = 90°，AB = ' + AB + '，BC = ' + BC + '。' + ASK.zh,
          en: 'In right triangle ABC, ∠C = 90°, AB = ' + AB + ' and BC = ' + BC + '. ' + ASK.en
        },
        gens: [
          R => val(R, num(AC), [root(AB * AB + BC * BC), num(AB - BC)], v => 'AC = ' + v),
          R => val(R, fr(a, c), [fr(b, c), fr(a, b)], v => 'sin A = ' + v),
          R => val(R, fr(a, c), [fr(b, c), fr(b, a)], v => 'cos B = ' + v),
          R => choose(R, [[true, 'tan A × tan B = 1'], [false, 'tan A = tan B']]),
          R => val(R, fr(BC * AC, 2), [fr(BC * AB, 2), num(BC * AC)], v => '△ABC 的面積是 ' + v, v => 'The area of triangle ABC is ' + v),
          () => claim(a > b, 'sin A > cos A'),
          R => val(R, fr(BC * AC, AB), [fr(AB, 2), fr(BC + AC, 2)], v => '斜邊 AB 上的高是 ' + v, v => 'The height to the hypotenuse AB is ' + v)
        ]
      };
    }
  };

  const absIneq = {
    id: 'absIneq',
    g: 10,
    hint: {
      zh: '|x − a| ≤ b 表示 x 到 a 的距離不超過 b，也就是 a − b ≤ x ≤ a + b；|ax − b| ≤ c 先寫成 −c ≤ ax − b ≤ c 再解。',
      en: '|x − a| ≤ b means x is at most b away from a, so a − b ≤ x ≤ a + b; write |ax − b| ≤ c as −c ≤ ax − b ≤ c and solve.'
    },
    yt: { zh: '絕對值不等式 高一', en: 'absolute value inequalities' },
    make(R) {
      const a = pick(R, [1, 2, 3]);
      const b = int(R, -9, 9);
      const c = int(R, 2, 9);
      const strict = R() < 0.4;
      const rel = strict ? ' < ' : ' ≤ ';
      const ok = x => (strict ? Math.abs(a * x - b) < c : Math.abs(a * x - b) <= c);
      const ineq = '|' + poly([a, -b]) + '|' + rel + c;
      let count = 0;
      let max = null;
      for (let x = -60; x <= 60; x++) {
        if (ok(x)) {
          count++;
          max = x;
        }
      }
      const span = (lo, hi) => lo + rel + 'x' + rel + hi;
      const wrong = [span(fr(-b - c, a), fr(-b + c, a))];
      if (a !== 1) wrong.push(span(num(b - c), num(b + c)));
      const t = int(R, -6, 6);
      return {
        q: { zh: '關於不等式 ' + ineq + '，' + ASK.zh, en: 'For the inequality ' + ineq + ', which of the following are true?' },
        gens: [
          R => val(R, span(fr(b - c, a), fr(b + c, a)), wrong, v => '解是 ' + v, v => 'Its solution is ' + v),
          R => val(R, String(count), [String(count + 1), String(count - 1)], v => '整數解共有 ' + v + ' 個', v => 'It has exactly ' + v + ' integer solutions'),
          () => claim(ok(t), 'x = ' + num(t) + ' 是此不等式的解', 'x = ' + num(t) + ' is a solution'),
          R => val(R, num(max), [num(max + 1), num(max - 1)], v => '最大的整數解是 ' + v, v => 'The largest integer solution is ' + v),
          R => val(R, fr(2 * c, a), [fr(c, a), num(2 * c)], v => '解區間的長度是 ' + v, v => 'The solution interval has length ' + v),
          R => val(R, fr(b, a), [fr(-b, a), num(b)], v => '解區間的中點是 x = ' + v, v => 'The midpoint of the solution interval is x = ' + v)
        ]
      };
    }
  };

  const bag = {
    id: 'bag',
    g: 10,
    hint: {
      zh: '同時取兩顆球的方法數用組合 C(n, 2)；兩紅的機率 = C(紅球數, 2) ÷ C(總球數, 2)；「至少一顆」= 1 − 「一顆都沒有」。',
      en: 'Drawing two balls at once can happen in C(n, 2) ways; P(two red) = C(red, 2) ÷ C(total, 2); P(at least one) = 1 − P(none).'
    },
    yt: { zh: '組合 機率 取球 高一', en: 'probability combinations drawing without replacement' },
    make(R) {
      const r = int(R, 3, 6);
      const b = int(R, 2, 5);
      const n = r + b;
      const C2 = m => (m * (m - 1)) / 2;
      const all = C2(n);
      return {
        q: {
          zh: '袋中有 ' + r + ' 顆紅球、' + b + ' 顆藍球，從中同時取出兩顆球。' + ASK.zh,
          en: 'A bag holds ' + r + ' red and ' + b + ' blue balls. Two balls are drawn at the same time. ' + ASK.en
        },
        gens: [
          R => val(R, fr(C2(r), all), [fr(r * r, n * n), fr(r, n)], v => '兩顆都是紅球的機率是 ' + v, v => 'The probability that both are red is ' + v),
          R => val(R, fr(r * b, all), [fr(r * b, n * n), fr(2 * r * b, n * n)], v => '一紅一藍的機率是 ' + v, v => 'The probability of one red and one blue is ' + v),
          R => val(R, fr(all - C2(r), all), [fr(C2(b), all), fr(b, n)], v => '至少一顆藍球的機率是 ' + v, v => 'The probability of at least one blue is ' + v),
          R => val(R, fr(C2(r) + C2(b), all), [fr(r * r + b * b, n * n), fr(1, 2)], v => '兩顆同色的機率是 ' + v, v => 'The probability that both are the same color is ' + v),
          () => claim(r > b, '兩顆都是紅球的機率大於兩顆都是藍球的機率', 'Two red balls are more likely than two blue balls')
        ]
      };
    }
  };

  const cubic = {
    id: 'cubic',
    g: 10,
    hint: {
      zh: '餘式定理：f(x) 除以 x − a 的餘式是 f(a)；因式定理：f(a) = 0 ⟺ x − a 是 f(x) 的因式；各項係數和 = f(1)。',
      en: 'Remainder theorem: f(x) divided by x − a leaves remainder f(a); factor theorem: f(a) = 0 exactly when x − a is a factor; the coefficients add up to f(1).'
    },
    yt: { zh: '餘式定理 因式定理 高一', en: 'remainder theorem factor theorem' },
    make(R) {
      const r = pick(R, [-3, -2, -1, 1, 2, 3]);
      const b = int(R, -4, 4);
      const c = int(R, -6, 6);
      const f = x => (x - r) * (x * x + b * x + c);
      const F = 'f(x) = ' + poly([1, b - r, c - r * b, -r * c]);
      const k = int(R, -3, 3);
      const s = R() < 0.5 ? r : pick(R, [-3, -2, -1, 1, 2, 3]);
      const u = int(R, 1, 3);
      return {
        q: { zh: '設 ' + F + '。' + ASK.zh, en: 'Let ' + F + '. ' + ASK.en },
        gens: [
          () => claim(f(s) === 0, poly([1, -s]) + ' 是 f(x) 的因式', poly([1, -s]) + ' is a factor of f(x)'),
          R => val(R, num(f(k)), [num(f(-k)), num(-f(k))], v => 'f(x) 除以 ' + poly([1, -k]) + ' 的餘式是 ' + v, v => 'The remainder when f(x) is divided by ' + poly([1, -k]) + ' is ' + v),
          R => val(R, num(f(1)), [num(f(-1)), num(f(1) + 1)], v => 'f(x) 各項係數的和是 ' + v, v => 'The coefficients of f(x) add up to ' + v),
          () => claim(b * b - 4 * c >= 0, 'f(x) = 0 的根都是實數', 'Every root of f(x) = 0 is a real number'),
          () => claim(f(u) > f(-u), 'f(' + u + ') > f(' + num(-u) + ')'),
          R => val(R, poly([1, -r]), [poly([1, r])], v => 'f(x) 除以 ' + poly([1, b, c]) + ' 的商式是 ' + v, v => 'Dividing f(x) by ' + poly([1, b, c]) + ' gives the quotient ' + v)
        ]
      };
    }
  };

  const logs = {
    id: 'logs',
    g: 10,
    hint: {
      zh: '對數的定義：logₐ N = x 表示 aˣ = N；logₐ(MN) = logₐ M + logₐ N，logₐ(Mⁿ) = n·logₐ M；換底公式 logₐ N = log N / log a。',
      en: 'By definition logₐ N = x means aˣ = N; logₐ(MN) = logₐ M + logₐ N and logₐ(Mⁿ) = n·logₐ M; change of base: logₐ N = log N / log a.'
    },
    yt: { zh: '對數 運算性質 換底公式 高一', en: 'logarithm rules properties change of base' },
    make(R) {
      const b = pick(R, [2, 3, 5]);
      const m = int(R, 2, b === 5 ? 4 : 5);
      const n = int(R, 1, 4);
      const k = int(R, 2, 5);
      const N = pick(R, [3, 5, 6, 7, 10, 12, 20, 24, 40, 50, 100, 200]);
      let e = 0;
      while (Math.pow(2, e + 1) <= N) e++;
      const lg = 'log' + sub(b);
      const rules = [
        [true, lg + '(xy) = ' + lg + ' x + ' + lg + ' y（x、y > 0）', lg + '(xy) = ' + lg + ' x + ' + lg + ' y (x, y > 0)'],
        [false, lg + '(x + y) = ' + lg + ' x + ' + lg + ' y（x、y > 0）', lg + '(x + y) = ' + lg + ' x + ' + lg + ' y (x, y > 0)'],
        [false, lg + '(xy) = ' + lg + ' x × ' + lg + ' y（x、y > 0）', lg + '(xy) = ' + lg + ' x × ' + lg + ' y (x, y > 0)'],
        [true, lg + '(x³) = 3 ' + lg + ' x（x > 0）', lg + '(x³) = 3 ' + lg + ' x (x > 0)']
      ];
      return {
        q: { zh: '下列有關對數的敘述，哪些正確？', en: 'Which of these statements about logarithms are true?' },
        gens: [
          R => val(R, String(m), [String(b * m), String(m + 1)], v => lg + ' ' + Math.pow(b, m) + ' = ' + v),
          R => choose(R, rules),
          R => val(R, String(m + n), [String(m * n)], v => lg + '(' + b + sup(m) + ' × ' + b + sup(n) + ') = ' + v),
          R => val(R, num(-k), [String(k), num(1 - k)], v => 'log 0.' + '0'.repeat(k - 1) + '1 = ' + v),
          R => {
            const lo = R() < 0.5 ? e : e + 1;
            return claim(lo === e, 'log₂ ' + N + ' 介於 ' + lo + ' 和 ' + (lo + 1) + ' 之間', 'log₂ ' + N + ' is between ' + lo + ' and ' + (lo + 1));
          },
          R => val(R, fr(m, 2), [String(2 * m), String(m)], v => 'log' + sub(b * b) + ' ' + Math.pow(b, m) + ' = ' + v)
        ]
      };
    }
  };

  const expEq = {
    id: 'expEq',
    g: 10,
    hint: {
      zh: '指數方程式：把兩邊化成同底數，bᵐ = bⁿ 就得到 m = n；b > 1 時 y = bˣ 遞增，0 < b < 1 時遞減；b⁻ⁿ = 1/bⁿ。',
      en: 'Write both sides as powers of the same base: bᵐ = bⁿ means m = n; y = bˣ increases when b > 1 and decreases when 0 < b < 1; b⁻ⁿ = 1/bⁿ.'
    },
    yt: { zh: '指數方程式 同底數 高一', en: 'solving exponential equations same base' },
    make(R) {
      const b = pick(R, [2, 3, 5]);
      const top = b === 2 ? 6 : b === 3 ? 5 : 4;
      const p = pick(R, [1, 2, 3]);
      let s;
      let q0;
      do {
        s = int(R, -2, 4);
        q0 = int(R, -3, 3);
      } while (p * s + q0 < 0 || p * s + q0 > top);
      const r = p * s + q0;
      const N = Math.pow(b, r);
      const E = q0 === 0 && p === 1 ? 'x' : '(' + poly([p, q0]) + ')';
      const kk = int(R, 2, 4);
      const P0 = pick(R, [100, 200, 300, 500]);
      const T = pick(R, [2, 3, 5]);
      const kd = int(R, 2, 5);
      return {
        q: { zh: '下列有關指數的敘述，哪些正確？', en: 'Which of these statements about exponents are true?' },
        gens: [
          R => val(R, 'x = ' + num(s), ['x = ' + fr(N - q0, p), 'x = ' + fr(r + q0, p)], v => '方程式 ' + b + '^' + E + ' = ' + N + ' 的解是 ' + v, v => 'The solution of ' + b + '^' + E + ' = ' + N + ' is ' + v),
          R => val(R, 'x = ' + num(-kk), ['x = ' + kk], v => '方程式 (1/' + b + ')^x = ' + Math.pow(b, kk) + ' 的解是 ' + v, v => 'The solution of (1/' + b + ')^x = ' + Math.pow(b, kk) + ' is ' + v),
          R => {
            const m1 = 10 * int(R, 3, 10);
            const m2 = 10 * int(R, 2, 7);
            return claim(m1 * Math.log(2) > m2 * Math.log(3), '2' + sup(m1) + ' > 3' + sup(m2));
          },
          R => val(R, String(P0 * Math.pow(2, kd)), [String(P0 * 2 * kd), String(P0 * Math.pow(2, kd + 1))], v => '某種細菌每 ' + T + ' 小時數量變成 2 倍，原本 ' + P0 + ' 個，' + T * kd + ' 小時後有 ' + v + ' 個', v => 'Bacteria double every ' + T + ' hours. Starting from ' + P0 + ', after ' + T * kd + ' hours there are ' + v),
          R =>
            choose(R, [
              [true, 'y = ' + b + '^x 是遞增函數', 'y = ' + b + '^x is an increasing function'],
              [false, 'y = (1/' + b + ')^x 是遞增函數', 'y = (1/' + b + ')^x is an increasing function']
            ]),
          R => val(R, fr(1, Math.pow(b, kk)), [num(-Math.pow(b, kk)), fr(-1, Math.pow(b, kk))], v => b + sup(-kk) + ' = ' + v)
        ]
      };
    }
  };

  const counting = {
    id: 'counting',
    g: 10,
    hint: {
      zh: '排列 P(n, k) = n!/(n − k)!（順序有差），組合 C(n, k) = n!/(k!(n − k)!)（順序沒差）；C(n, k) = C(n, n − k)；n 個元素的集合有 2ⁿ 個子集合。',
      en: 'Permutations P(n, k) = n!/(n − k)! (order matters); combinations C(n, k) = n!/(k!(n − k)!) (order does not); C(n, k) = C(n, n − k); a set with n elements has 2ⁿ subsets.'
    },
    yt: { zh: '排列組合 高一', en: 'permutations and combinations' },
    make(R) {
      const n = int(R, 5, 9);
      const k = int(R, 2, 4);
      let j;
      do {
        j = int(R, 1, n - 1);
      } while (j === k || j === n - k);
      const books = int(R, 4, 7);
      const set = int(R, 3, 7);
      const ppl = int(R, 5, 12);
      return {
        q: { zh: '下列有關排列組合的敘述，哪些正確？', en: 'Which of these counting statements are true?' },
        gens: [
          R => val(R, String(C(n, k)), [String(P(n, k)), String(C(n, k - 1))], v => 'C(' + n + ', ' + k + ') = ' + v),
          R => val(R, String(P(n, k)), [String(C(n, k)), String(Math.pow(n, k))], v => 'P(' + n + ', ' + k + ') = ' + v),
          R => {
            const jj = R() < 0.5 && n - k !== k ? n - k : j;
            return claim(C(n, k) === C(n, jj), 'C(' + n + ', ' + k + ') = C(' + n + ', ' + jj + ')');
          },
          R => val(R, String(fact(books)), [String(books * books), String(Math.pow(2, books))], v => books + ' 本不同的書排成一列，共有 ' + v + ' 種排法', v => books + ' different books can be lined up in ' + v + ' ways'),
          R => val(R, String(Math.pow(2, set)), [String(fact(set)), String(Math.pow(2, set) - 1)], v => '有 ' + set + ' 個元素的集合，共有 ' + v + ' 個子集合', v => 'A set with ' + set + ' elements has ' + v + ' subsets'),
          R => val(R, String(ppl * (ppl - 1)), [String(C(ppl, 2)), String(ppl * ppl)], v => '從 ' + ppl + ' 人中選出班長和副班長各一人，共有 ' + v + ' 種選法', v => 'Choosing a class president and a vice president from ' + ppl + ' people can be done in ' + v + ' ways')
        ]
      };
    }
  };

  const series = {
    id: 'series',
    g: 10,
    hint: {
      zh: '常用級數：1 + 2 + … + n = n(n + 1)/2，1² + 2² + … + n² = n(n + 1)(2n + 1)/6，1 + 3 + … + (2n − 1) = n²；等差級數和 = (首項 + 末項) × 項數 ÷ 2；1 + r + … + rᵐ = (rᵐ⁺¹ − 1)/(r − 1)。',
      en: 'Useful sums: 1 + 2 + … + n = n(n + 1)/2, 1² + 2² + … + n² = n(n + 1)(2n + 1)/6, 1 + 3 + … + (2n − 1) = n²; an arithmetic series = (first + last) × count ÷ 2; 1 + r + … + rᵐ = (rᵐ⁺¹ − 1)/(r − 1).'
    },
    yt: { zh: '級數 公式 sigma 高一', en: 'sum of series formulas sigma notation' },
    make(R) {
      const n = int(R, 6, 20);
      const m2 = int(R, 5, 12);
      const od = int(R, 5, 15);
      const a = int(R, 2, 5);
      const b = int(R, 1, 6);
      const nn = int(R, 5, 12);
      const pw = int(R, 4, 9);
      const sq = (m2 * (m2 + 1) * (2 * m2 + 1)) / 6;
      return {
        q: { zh: '下列哪些等式正確？', en: 'Which of these sums are correct?' },
        gens: [
          R => val(R, String((n * (n + 1)) / 2), [String((n * (n - 1)) / 2), String(n * n)], v => '1 + 2 + 3 + … + ' + n + ' = ' + v),
          R => val(R, String(sq), [String(Math.pow((m2 * (m2 + 1)) / 2, 2)), String(2 * sq)], v => '1² + 2² + 3² + … + ' + m2 + '² = ' + v),
          R => val(R, String(od * od), [String(od * od - 1), String(od * (od + 1))], v => '1 + 3 + 5 + … + ' + (2 * od - 1) + ' = ' + v),
          R => val(R, String((a * nn * (nn + 1)) / 2 + b * nn), [String((a * nn * (nn + 1)) / 2 + b), String((2 * b + a + a * nn) * nn)], v => a + b + ' + ' + (2 * a + b) + ' + ' + (3 * a + b) + ' + … + ' + (a * nn + b) + ' = ' + v),
          R =>
            choose(R, [
              [true, '1³ + 2³ + … + ' + nn + '³ = (1 + 2 + … + ' + nn + ')²'],
              [false, '1³ + 2³ + … + ' + nn + '³ = 1² + 2² + … + ' + nn + '²']
            ]),
          R => val(R, String(Math.pow(2, pw + 1) - 1), [String(Math.pow(2, pw + 1)), String(Math.pow(2, pw) - 1)], v => '1 + 2 + 2² + … + 2' + sup(pw) + ' = ' + v)
        ]
      };
    }
  };

  const variance = {
    id: 'variance',
    g: 10,
    hint: {
      zh: '母體變異數 σ² = Σ(xᵢ − μ)² ÷ n，標準差 σ 是它的平方根；每筆資料都變成 y = ax + b 時，平均數變成 aμ + b，標準差變成 |a|σ（加上 b 不影響），變異數變成 a²σ²。',
      en: 'Population variance σ² = Σ(xᵢ − μ)² ÷ n and the standard deviation σ is its square root; if every value becomes y = ax + b, the mean becomes aμ + b, the standard deviation |a|σ (adding b changes nothing) and the variance a²σ².'
    },
    yt: { zh: '標準差 變異數 資料線性變換 高一', en: 'variance standard deviation linear transformation' },
    make(R) {
      const mu = int(R, 8, 20);
      const n = pick(R, [4, 5, 6]);
      const a = int(R, 1, 6);
      let b;
      do {
        b = int(R, 1, 6);
      } while (b === a);
      const e = int(R, 1, 6);
      const devs = n === 4 ? [-a, a, -b, b] : n === 5 ? [-a, a, -b, b, 0] : [-a, a, -b, b, -e, e];
      const data = shuffle(R, devs.map(d => mu + d));
      const S2 = devs.reduce((s, d) => s + d * d, 0);
      const SA = devs.reduce((s, d) => s + Math.abs(d), 0);
      const c = pick(R, [2, 3, -2]);
      const d0 = int(R, 1, 9);
      const half = Math.max(a, b, n === 6 ? e : 0);
      const tf = poly([c, d0]);
      return {
        q: { zh: '某組資料為：' + data.join('、') + '。' + ASK.zh, en: 'A data set: ' + data.join(', ') + '. ' + ASK.en },
        gens: [
          R => val(R, String(mu), [String(mu + 1), fr(mu * n, n - 1)], v => '平均數是 ' + v, v => 'The mean is ' + v),
          R => val(R, fr(S2, n), [fr(S2, n - 1), fr(SA, n)], v => '母體變異數（除以 n）是 ' + v, v => 'The population variance (dividing by n) is ' + v),
          R => val(R, num(c * mu + d0), [num(c * mu), num(mu + d0)], v => '每個數 x 都換成 ' + tf + ' 之後，平均數是 ' + v, v => 'If every value x becomes ' + tf + ', the mean is ' + v),
          R =>
            choose(R, [
              [true, '每個數 x 都換成 ' + tf + ' 之後，標準差變成原來的 ' + Math.abs(c) + ' 倍', 'If every value x becomes ' + tf + ', the standard deviation becomes ' + Math.abs(c) + ' times as large'],
              [false, '每個數 x 都換成 ' + tf + ' 之後，標準差變成原來的 ' + Math.abs(c) + ' 倍再加 ' + d0, 'If every value x becomes ' + tf + ', the standard deviation becomes ' + Math.abs(c) + ' times as large plus ' + d0]
            ]),
          R => val(R, fr(c * c * S2, n), [fr(Math.abs(c) * S2, n), fr(c * c * S2, n - 1)], v => '每個數 x 都換成 ' + tf + ' 之後，母體變異數是 ' + v, v => 'If every value x becomes ' + tf + ', the population variance is ' + v),
          R => val(R, String(2 * half), [String(half), String(2 * half + 1)], v => '全距是 ' + v, v => 'The range is ' + v)
        ]
      };
    }
  };

  // ---------- grade 11 ----------

  const cosLaw = {
    id: 'cosLaw',
    g: 11,
    hint: {
      zh: '餘弦定理：c² = a² + b² − 2ab·cos C；三角形面積 = ½ab·sin C；正弦定理：a/sin A = b/sin B = c/sin C = 2R（R 是外接圓半徑）。',
      en: 'Law of cosines: c² = a² + b² − 2ab·cos C; area = ½ab·sin C; law of sines: a/sin A = b/sin B = c/sin C = 2R, where R is the circumradius.'
    },
    yt: { zh: '餘弦定理 正弦定理 三角形面積 高二', en: 'law of cosines law of sines triangle area' },
    make(R) {
      const obtuse = R() < 0.5;
      // integer triangles with a 60° or a 120° angle opposite the third side
      const tr = pick(R, obtuse ? [[3, 5, 7], [7, 8, 13], [5, 16, 19], [6, 10, 14]] : [[3, 8, 7], [5, 8, 7], [5, 21, 19], [7, 15, 13], [8, 15, 13]]);
      const swap = R() < 0.5;
      const a = swap ? tr[1] : tr[0];
      const b = swap ? tr[0] : tr[1];
      const c = tr[2];
      const Cd = obtuse ? 120 : 60;
      return {
        q: {
          zh: '△ABC 中，BC = ' + a + '，CA = ' + b + '，∠C = ' + deg(Cd) + '。' + ASK.zh,
          en: 'In triangle ABC, BC = ' + a + ', CA = ' + b + ' and ∠C = ' + deg(Cd) + '. ' + ASK.en
        },
        gens: [
          R => val(R, String(c), [root(a * a + b * b), root(a * a + b * b + (obtuse ? -a * b : a * b))], v => 'AB = ' + v),
          R => val(R, rad(a * b, 4, 3), [fr(a * b, 4), rad(a * b, 2, 3)], v => '△ABC 的面積是 ' + v, v => 'The area of triangle ABC is ' + v),
          R => val(R, fr(obtuse ? -1 : 1, 2), [fr(obtuse ? 1 : -1, 2)], v => 'cos C = ' + v),
          R => val(R, rad(c, 3, 3), [fr(c, 2), rad(c, 2, 3)], v => '外接圓半徑是 ' + v, v => 'The circumradius is ' + v),
          () => claim(c > a && c > b, '∠C 是最大的角', '∠C is the largest angle'),
          R => val(R, rad(1, 2, 3), [fr(1, 2), rad(-1, 2, 3)], v => 'sin C = ' + v)
        ]
      };
    }
  };

  const trigValues = {
    id: 'trigValues',
    g: 11,
    hint: {
      zh: '特別角：sin 30° = 1/2、sin 45° = √2/2、sin 60° = √3/2；先找參考角，再依象限決定正負（一全二正弦三正切四餘弦）；180° = π 弧度；y = sin(kx) 的週期是 2π/k。',
      en: 'Special angles: sin 30° = 1/2, sin 45° = √2/2, sin 60° = √3/2; use the reference angle, then the quadrant for the sign; 180° = π radians; y = sin(kx) has period 2π/k.'
    },
    yt: { zh: '三角函數 特別角 廣義角 弧度', en: 'unit circle special angles radians' },
    make(R) {
      const off = [30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330];
      const show = d => (R() < 0.5 ? deg(d) : piStr(d, 180));
      const RECIP = { '√3/3': '√3', '√3': '√3/3', '1': '1' };
      const ids = [
        [true, 'sin²θ + cos²θ = 1（對所有 θ 都成立）', 'sin²θ + cos²θ = 1 (for every θ)'],
        [true, 'sin(−θ) = −sin θ（對所有 θ 都成立）', 'sin(−θ) = −sin θ (for every θ)'],
        [false, 'cos(−θ) = −cos θ（對所有 θ 都成立）', 'cos(−θ) = −cos θ (for every θ)'],
        [true, 'sin(180° − θ) = sin θ（對所有 θ 都成立）', 'sin(180° − θ) = sin θ (for every θ)'],
        [false, 'cos(180° − θ) = cos θ（對所有 θ 都成立）', 'cos(180° − θ) = cos θ (for every θ)'],
        [false, 'sin(180° + θ) = sin θ（對所有 θ 都成立）', 'sin(180° + θ) = sin θ (for every θ)']
      ];
      return {
        q: { zh: '下列哪些三角函數值或性質正確？', en: 'Which of these trigonometric values or facts are true?' },
        gens: [
          R => {
            const d = pick(R, off);
            const A = show(d);
            const t = trig(d);
            return val(R, t.sin, [neg(t.sin), t.cos], v => 'sin ' + A + ' = ' + v);
          },
          R => {
            const d = pick(R, off);
            const A = show(d);
            const t = trig(d);
            return val(R, t.cos, [neg(t.cos), t.sin], v => 'cos ' + A + ' = ' + v);
          },
          R => {
            const d = pick(R, off);
            const A = show(d);
            const t = trig(d);
            const abs = t.tan[0] === MINUS ? t.tan.slice(1) : t.tan;
            const recip = t.tan[0] === MINUS ? MINUS + RECIP[abs] : RECIP[abs];
            return val(R, t.tan, [neg(t.tan), recip], v => 'tan ' + A + ' = ' + v);
          },
          R => {
            const d = pick(R, off.concat([90, 180, 270]));
            return val(R, piStr(d, 180), [piStr(d, 360), piStr(2 * d, 180)], v => deg(d) + ' = ' + v + ' 弧度', v => deg(d) + ' = ' + v + ' radians');
          },
          R => {
            const k = int(R, 2, 6);
            return val(R, piStr(2, k), [piStr(1, k), piStr(2 * k, 1)], v => 'y = sin(' + k + 'x) 的週期是 ' + v, v => 'y = sin(' + k + 'x) has period ' + v);
          },
          R => choose(R, ids)
        ]
      };
    }
  };

  const vectors = {
    id: 'vectors',
    g: 11,
    hint: {
      zh: '內積 u·v = x₁x₂ + y₁y₂ = |u||v|cos θ，內積為 0 表示垂直；|u| = √(x² + y²)；u、v 平行 ⟺ x₁y₂ − x₂y₁ = 0；u、v 張成的平行四邊形面積 = |x₁y₂ − x₂y₁|。',
      en: 'Dot product u·v = x₁x₂ + y₁y₂ = |u||v|cos θ, and 0 means perpendicular; |u| = √(x² + y²); u and v are parallel exactly when x₁y₂ − x₂y₁ = 0; the parallelogram they span has area |x₁y₂ − x₂y₁|.'
    },
    yt: { zh: '平面向量 內積 垂直 平行四邊形面積 高二', en: 'vectors dot product perpendicular parallelogram area' },
    make(R) {
      const a = nz(R, 6);
      const b = nz(R, 6);
      let c;
      let d;
      const kind = R();
      if (kind < 0.35) {
        const k = pick(R, [1, -1, 2, -2]);
        c = -b * k;
        d = a * k;
      } else if (kind < 0.5) {
        const k = pick(R, [2, -1, -2, 3]);
        c = a * k;
        d = b * k;
      } else {
        do {
          c = nz(R, 6);
          d = nz(R, 6);
        } while (a * d === b * c || a * c + b * d === 0);
      }
      const dot = a * c + b * d;
      const cr = a * d - b * c;
      const lenW = [num(Math.abs(a) + Math.abs(b))];
      if (a * a !== b * b) lenW.push(root(Math.abs(a * a - b * b)));
      return {
        q: { zh: '向量 u = ' + pt(num(a), num(b)) + '，v = ' + pt(num(c), num(d)) + '。' + ASK.zh, en: 'Vectors u = ' + pt(num(a), num(b)) + ' and v = ' + pt(num(c), num(d)) + '. ' + ASK.en },
        gens: [
          R => val(R, num(dot), [num(a * c - b * d), num(a * d + b * c)], v => 'u · v = ' + v),
          R => val(R, root(a * a + b * b), lenW, v => '|u| = ' + v),
          () => claim(dot === 0, 'u 與 v 互相垂直', 'u and v are perpendicular'),
          R => val(R, pt(num(2 * a - c), num(2 * b - d)), [pt(num(2 * a + c), num(2 * b + d)), pt(num(2 * a - c), num(2 * b + d))], v => '2u − v = ' + v),
          () => claim(cr === 0, 'u 與 v 互相平行', 'u and v are parallel'),
          R => val(R, String(Math.abs(cr)), [String(Math.abs(dot)), fr(Math.abs(cr), 2)], v => 'u 與 v 張成的平行四邊形面積是 ' + v, v => 'The parallelogram spanned by u and v has area ' + v)
        ]
      };
    }
  };

  const circleEq = {
    id: 'circleEq',
    g: 11,
    hint: {
      zh: '配方：x² + y² + Dx + Ey + F = 0 可寫成 (x + D/2)² + (y + E/2)² = (D² + E² − 4F)/4，圓心是 (−D/2, −E/2)；比較點到圓心的距離和半徑，判斷點在圓內、圓上或圓外。',
      en: 'Complete the square: x² + y² + Dx + Ey + F = 0 becomes (x + D/2)² + (y + E/2)² = (D² + E² − 4F)/4, with center (−D/2, −E/2); compare a point’s distance from the center with the radius.'
    },
    yt: { zh: '圓的方程式 配方 圓心 半徑 高二', en: 'equation of a circle completing the square center radius' },
    make(R) {
      const r = int(R, 2, 7);
      const h = int(R, -5, 5);
      let k = int(R, -5, 5);
      if (R() < 0.3) k = R() < 0.5 ? r : -r;
      const D = -2 * h;
      const E = -2 * k;
      const F = h * h + k * k - r * r;
      const eq = 'x² + y²' + [[D, 'x'], [E, 'y'], [F, '']].map(t => (t[0] === 0 ? '' : (t[0] < 0 ? ' − ' : ' + ') + (t[1] && Math.abs(t[0]) === 1 ? '' : Math.abs(t[0])) + t[1])).join('') + ' = 0';
      return {
        q: { zh: '圓 C：' + eq + '。' + ASK.zh, en: 'Circle C: ' + eq + '. ' + ASK.en },
        gens: [
          R => val(R, pt(num(h), num(k)), [pt(num(-h), num(-k)), pt(num(D), num(E))], v => '圓心是 ' + v, v => 'The center is ' + v),
          R => val(R, String(r), [String(r * r), root(Math.abs(F))], v => '半徑是 ' + v, v => 'The radius is ' + v),
          R => {
            const on = R() < 0.5;
            const side = R() < 0.5;
            const px = side ? h + r : h;
            const py = side ? k + (on ? 0 : 1) : k - r + (on ? 0 : 1);
            return claim((px - h) * (px - h) + (py - k) * (py - k) === r * r, '點 ' + pt(num(px), num(py)) + ' 在圓上', 'The point ' + pt(num(px), num(py)) + ' is on the circle');
          },
          () => claim(h * h + k * k < r * r, '原點在圓的內部', 'The origin is inside the circle'),
          () => claim(Math.abs(k) === r, '這個圓與 x 軸相切', 'The circle touches the x-axis'),
          R => val(R, piStr(r * r, 1), [piStr(2 * r, 1), piStr(r, 1)], v => '圓的面積是 ' + v, v => 'The area of the circle is ' + v)
        ]
      };
    }
  };

  const matrix = {
    id: 'matrix',
    g: 11,
    hint: {
      zh: '2 × 2 矩陣 [a, b; c, d] 的行列式 = ad − bc，行列式不是 0 才有反矩陣；det(AB) = det A × det B，det(kA) = k² det A；矩陣乘法是「列乘行」。',
      en: 'For a 2 × 2 matrix [a, b; c, d], det = ad − bc, and it has an inverse only when det ≠ 0; det(AB) = det A × det B and det(kA) = k² det A; multiply matrices row by column.'
    },
    yt: { zh: '二階行列式 矩陣乘法 反矩陣', en: '2x2 matrix determinant inverse multiplication' },
    make(R) {
      const M = () => [int(R, -4, 4), int(R, -4, 4), int(R, -4, 4), int(R, -4, 4)];
      const A = M();
      const B = M();
      const dA = A[0] * A[3] - A[1] * A[2];
      const dB = B[0] * B[3] - B[1] * B[2];
      const ms = m => '[' + num(m[0]) + ', ' + num(m[1]) + '; ' + num(m[2]) + ', ' + num(m[3]) + ']';
      return {
        q: {
          zh: '矩陣 A = ' + ms(A) + '，B = ' + ms(B) + '（分號隔開兩列）。' + ASK.zh,
          en: 'Matrices A = ' + ms(A) + ' and B = ' + ms(B) + ' (a semicolon separates the rows). ' + ASK.en
        },
        gens: [
          R => val(R, num(dA), [num(A[0] * A[3] + A[1] * A[2]), num(A[0] * A[1] - A[2] * A[3])], v => 'det A = ' + v),
          () => claim(dA !== 0, 'A 有反矩陣', 'A has an inverse'),
          R => val(R, num(dA * dB), [num(dA + dB), num(2 * dA * dB)], v => 'det(AB) = ' + v),
          R => val(R, num(A[0] * B[0] + A[1] * B[2]), [num(A[0] * B[0] + A[1] * B[1]), num(A[0] * B[0] + A[2] * B[2])], v => 'AB 左上角的元素是 ' + v, v => 'The top-left entry of AB is ' + v),
          R => val(R, ms(A.map((x, i) => x + B[i])), [ms(A.map((x, i) => x * B[i])), ms(A.map((x, i) => x - B[i]))], v => 'A + B = ' + v),
          R => val(R, num(4 * dA), [num(2 * dA), num(dA)], v => 'det(2A) = ' + v)
        ]
      };
    }
  };

  const pointLine = {
    id: 'pointLine',
    g: 11,
    hint: {
      zh: '點 (x₀, y₀) 到直線 ax + by + c = 0 的距離 = |ax₀ + by₀ + c| / √(a² + b²)；平行線 ax + by + c₁ = 0 與 ax + by + c₂ = 0 的距離 = |c₁ − c₂| / √(a² + b²)；兩直線垂直 ⟺ a₁a₂ + b₁b₂ = 0。',
      en: 'The distance from (x₀, y₀) to ax + by + c = 0 is |ax₀ + by₀ + c| / √(a² + b²); parallel lines ax + by + c₁ = 0 and ax + by + c₂ = 0 are |c₁ − c₂| / √(a² + b²) apart; two lines are perpendicular when a₁a₂ + b₁b₂ = 0.'
    },
    yt: { zh: '點到直線距離公式 平行線距離 高二', en: 'distance from a point to a line formula' },
    make(R) {
      const nv = pick(R, [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [8, 15, 17], [6, 8, 10]]);
      const a = nv[0] * (R() < 0.5 ? 1 : -1);
      const b = nv[1] * (R() < 0.5 ? 1 : -1);
      const L2 = nv[2];
      const c = int(R, -15, 15);
      const x0 = int(R, -5, 5);
      const y0 = int(R, -5, 5);
      let c2;
      do {
        c2 = int(R, -20, 20);
      } while (c2 === c);
      const L = linear([a, b, c], ['x', 'y', '']) + ' = 0';
      const L2s = linear([a, b, c2], ['x', 'y', '']) + ' = 0';
      return {
        q: { zh: '直線 L：' + L + '，點 P' + pt(num(x0), num(y0)) + '。' + ASK.zh, en: 'Line L: ' + L + ', and point P' + pt(num(x0), num(y0)) + '. ' + ASK.en },
        gens: [
          R => val(R, fr(Math.abs(a * x0 + b * y0 + c), L2), [fr(Math.abs(a * x0 + b * y0), L2), String(Math.abs(a * x0 + b * y0 + c))], v => 'P 到 L 的距離是 ' + v, v => 'The distance from P to L is ' + v),
          R => val(R, fr(-a, b), [fr(a, b), fr(b, a)], v => 'L 的斜率是 ' + v, v => 'L has slope ' + v),
          R => {
            const on = R() < 0.5;
            const t = int(R, -4, 4);
            const P = pt(num(t), fr(-c - a * t + (on ? 0 : b), b));
            return claim(on, '點 ' + P + ' 在 L 上', 'The point ' + P + ' is on L');
          },
          R => val(R, fr(Math.abs(c - c2), L2), [String(Math.abs(c - c2)), fr(Math.abs(c + c2), L2)], v => 'L 與直線 ' + L2s + ' 的距離是 ' + v, v => 'The distance between L and the line ' + L2s + ' is ' + v),
          R => {
            const m = R() < 0.5 ? [b, -a] : [a, -b];
            const kk = int(R, -9, 9);
            const M = linear([m[0], m[1], kk], ['x', 'y', '']) + ' = 0';
            return claim(a * m[0] + b * m[1] === 0, 'L 與直線 ' + M + ' 互相垂直', 'L is perpendicular to the line ' + M);
          },
          R => val(R, fr(-c, b), [fr(c, b), fr(-c, a)], v => 'L 的 y 截距是 ' + v, v => 'The y-intercept of L is ' + v)
        ]
      };
    }
  };

  // ---------- grade 12 ----------

  const derivative = {
    id: 'derivative',
    g: 12,
    hint: {
      zh: '微分：(xⁿ)′ = nxⁿ⁻¹；f′(a) 是 x = a 處切線的斜率；f′(x) > 0 的地方遞增、< 0 的地方遞減；f′ 由正變負的點有極大值，由負變正的點有極小值。',
      en: 'Power rule: (xⁿ)′ = nxⁿ⁻¹; f′(a) is the slope of the tangent at x = a; f increases where f′(x) > 0 and decreases where f′(x) < 0; f′ changing from + to − gives a local maximum, from − to + a local minimum.'
    },
    yt: { zh: '導數 微分 極值 切線斜率', en: 'derivatives local maximum minimum polynomial' },
    make(R) {
      const a = pick(R, [1, 1, -1, 2]);
      let p;
      let q;
      do {
        p = int(R, -4, 3);
        q = int(R, p + 1, 4);
      } while ((p + q) % 2 !== 0);
      // f′(x) = 3a(x − p)(x − q)
      const B = (-3 * a * (p + q)) / 2;
      const Cc = 3 * a * p * q;
      const Dc = int(R, -9, 9);
      const f = x => a * x * x * x + B * x * x + Cc * x + Dc;
      const fp = x => 3 * a * x * x + 2 * B * x + Cc;
      const k = int(R, -3, 3);
      return {
        q: { zh: '設 f(x) = ' + poly([a, B, Cc, Dc]) + '。' + ASK.zh, en: 'Let f(x) = ' + poly([a, B, Cc, Dc]) + '. ' + ASK.en },
        gens: [
          R => val(R, poly([3 * a, 2 * B, Cc]), [poly([a, B, Cc]), poly([3 * a, B, Cc])], v => 'f′(x) = ' + v),
          R => val(R, num(fp(k)), [num(f(k)), num(fp(-k))], v => 'f′(' + num(k) + ') = ' + v),
          R =>
            choose(R, [
              [a > 0, 'f(x) 在 x = ' + num(p) + ' 有極大值', 'f has a local maximum at x = ' + num(p)],
              [a < 0, 'f(x) 在 x = ' + num(p) + ' 有極小值', 'f has a local minimum at x = ' + num(p)]
            ]),
          () => claim(a > 0, 'f(x) 在 x > ' + num(q) + ' 時遞增', 'f is increasing for x > ' + num(q)),
          R => val(R, 'y = ' + poly([Cc, Dc]), ['y = ' + poly([Dc, Cc]), 'y = ' + poly([Cc, 0])], v => 'y = f(x) 在 x = 0 的切線是 ' + v, v => 'The tangent line to y = f(x) at x = 0 is ' + v),
          R => val(R, '0', [num(f(p))], v => 'f′(' + num(p) + ') = ' + v)
        ]
      };
    }
  };

  const integral = {
    id: 'integral',
    g: 12,
    hint: {
      zh: '積分：∫ xⁿ dx = xⁿ⁺¹/(n + 1) + C；從 a 積到 b 的定積分 = F(b) − F(a)，其中 F′(x) = f(x)；上下限對調時積分值變號；d/dx ∫₀ˣ f(t) dt = f(x)。',
      en: 'Integrals: ∫ xⁿ dx = xⁿ⁺¹/(n + 1) + C; the definite integral from a to b is F(b) − F(a), where F′(x) = f(x); swapping the limits changes the sign; d/dx ∫₀ˣ f(t) dt = f(x).'
    },
    yt: { zh: '定積分 反導函數 微積分基本定理', en: 'definite integral antiderivative fundamental theorem of calculus' },
    make(R) {
      const c2 = nz(R, 3);
      const c1 = int(R, -4, 4);
      const c0 = int(R, -5, 5);
      const a = int(R, -2, 2);
      const b = int(R, a + 1, 4);
      const f = x => c2 * x * x + c1 * x + c0;
      const cube = x => x * x * x;
      const N6 = 2 * c2 * (cube(b) - cube(a)) + 3 * c1 * (b * b - a * a) + 6 * c0 * (b - a);
      const ii = (lo, hi) => '∫' + sub(lo) + sup(hi);
      const nP = int(R, 2, 6);
      const fs = poly([c2, c1, c0]);
      const F = polyFr([[c2, 3], [c1, 2], [c0, 1], [0, 1]]);
      return {
        q: { zh: '設 f(x) = ' + fs + '。' + ASK.zh, en: 'Let f(x) = ' + fs + '. ' + ASK.en },
        gens: [
          R => val(R, fr(N6, 6), [num(c2 * (cube(b) - cube(a)) + c1 * (b * b - a * a) + c0 * (b - a)), num(f(b) - f(a))], v => ii(a, b) + ' f(x) dx = ' + v),
          R => val(R, F + ' + C', [polyFr([[c2, 1], [c1, 1], [c0, 1], [0, 1]]) + ' + C', polyFr([[c2, 2], [c1, 1], [c0, 1], [0, 1]]) + ' + C'], v => '∫ f(x) dx = ' + v),
          R =>
            choose(R, [
              [true, ii(a, b) + ' f(x) dx = ' + MINUS + ii(b, a) + ' f(x) dx'],
              [N6 === 0, ii(a, b) + ' f(x) dx = ' + ii(b, a) + ' f(x) dx']
            ]),
          R => val(R, fr(1, nP + 1), [fr(1, nP), String(nP + 1)], v => ii(0, 1) + ' x' + sup(nP) + ' dx = ' + v),
          R => val(R, fs, [poly([2 * c2, c1]), F], v => 'd/dx ∫₀ˣ f(t) dt = ' + v),
          R => val(R, num(c0 * (b - a)), [num(c0), num(c0 * (b + a))], v => ii(a, b) + ' ' + num(c0) + ' dx = ' + v)
        ]
      };
    }
  };

  const limits = {
    id: 'limits',
    g: 12,
    hint: {
      zh: '0/0 型先因式分解、約分再代入；n → ∞ 時，分子分母同除以 n 的最高次方；無窮等比級數 a + ar + ar² + … 在 |r| < 1 時收斂，和為 a/(1 − r)；多項式的極限直接代入。',
      en: 'For 0/0, factor and cancel, then substitute; as n → ∞, divide top and bottom by the highest power of n; a + ar + ar² + … converges when |r| < 1, to a/(1 − r); for a polynomial, just substitute.'
    },
    yt: { zh: '極限 無窮等比級數 收斂 高三', en: 'limits infinite geometric series convergence' },
    make(R) {
      const a = nz(R, 5);
      const pn = int(R, 1, 6);
      const pd = int(R, 1, 6);
      const qn = int(R, -5, 5);
      const qd = nz(R, 5);
      const rr = pick(R, [[1, 2], [-1, 2], [1, 3], [-1, 3], [2, 3], [-2, 3], [3, 4]]);
      const A0 = int(R, 1, 8);
      const conv = pick(R, [[1, 2], [3, 2], [-1, 3], [-2, 1], [1, 1], [-3, 4]]);
      const kb = int(R, 2, 5);
      const pc = [int(R, 1, 3), int(R, -4, 4), int(R, -5, 5)];
      const cc = int(R, -3, 3);
      const Pv = x => pc[0] * x * x + pc[1] * x + pc[2];
      const rn = rr[0];
      const rd = rr[1];
      const series = A0 + (rn < 0 ? ' − ' + fr(-A0 * rn, rd) : ' + ' + fr(A0 * rn, rd)) + ' + ' + fr(A0 * rn * rn, rd * rd) + ' + …';
      return {
        q: { zh: '下列有關極限的敘述，哪些正確？', en: 'Which of these statements about limits are true?' },
        gens: [
          R => val(R, num(2 * a), [num(a), '0'], v => 'lim (x→' + num(a) + ') (' + poly([1, 0, -a * a]) + ')/(' + poly([1, -a]) + ') = ' + v),
          R => val(R, fr(pn, pd), [fr(qn, qd), '0'], v => 'lim (n→∞) (' + linear([pn, qn], ['n', '']) + ')/(' + linear([pd, qd], ['n', '']) + ') = ' + v),
          R => val(R, fr(A0 * rd, rd - rn), [fr(A0 * rd, rd + rn), fr(A0 * rn, rd - rn)], v => '無窮等比級數 ' + series + ' 的和是 ' + v, v => 'The infinite geometric series ' + series + ' adds up to ' + v),
          () => claim(Math.abs(conv[0]) < Math.abs(conv[1]), '級數 1 + r + r² + … 在 r = ' + fr(conv[0], conv[1]) + ' 時收斂', 'The series 1 + r + r² + … converges for r = ' + fr(conv[0], conv[1])),
          R =>
            choose(R, [
              [true, 'lim (n→∞) (' + fr(kb - 1, kb) + ')ⁿ = 0'],
              [false, 'lim (n→∞) (' + fr(kb + 1, kb) + ')ⁿ = 0']
            ]),
          R => val(R, num(Pv(cc)), [num(Pv(-cc)), num(Pv(cc) + 1)], v => 'lim (x→' + num(cc) + ') (' + poly(pc) + ') = ' + v)
        ]
      };
    }
  };

  const complex = {
    id: 'complex',
    g: 12,
    hint: {
      zh: 'i² = −1，iⁿ 每 4 次循環一次（i、−1、−i、1）；(a + bi)(c + di) = (ac − bd) + (ad + bc)i；|a + bi| = √(a² + b²)；z 乘以它的共軛複數 z̄ 等於 |z|²。',
      en: 'i² = −1 and the powers of i repeat every 4 (i, −1, −i, 1); (a + bi)(c + di) = (ac − bd) + (ad + bc)i; |a + bi| = √(a² + b²); z times its conjugate z̄ equals |z|².'
    },
    yt: { zh: '複數 運算 共軛複數 絕對值', en: 'complex numbers multiplication conjugate modulus powers of i' },
    make(R) {
      const a = int(R, -5, 5);
      const b = nz(R, 5);
      const c = int(R, -5, 5);
      const d = nz(R, 5);
      const n = int(R, 5, 30);
      const cyc = ['1', 'i', MINUS + '1', MINUS + 'i'];
      const lenW = [num(Math.abs(a) + Math.abs(b))];
      if (a * a !== b * b) lenW.push(root(Math.abs(a * a - b * b)));
      return {
        q: { zh: '設複數 z = ' + cx(a, b) + '，w = ' + cx(c, d) + '。' + ASK.zh, en: 'Let z = ' + cx(a, b) + ' and w = ' + cx(c, d) + '. ' + ASK.en },
        gens: [
          R => val(R, cx(a + c, b + d), [cx(a + c, b - d), cx(a - c, b + d)], v => 'z + w = ' + v),
          R => val(R, cx(a * c - b * d, a * d + b * c), [cx(a * c + b * d, a * d + b * c), cx(a * c, b * d)], v => 'zw = ' + v),
          R => val(R, root(a * a + b * b), lenW, v => '|z| = ' + v),
          R => val(R, cx(a, -b), [cx(-a, b), cx(-a, -b)], v => 'z 的共軛複數是 ' + v, v => 'The conjugate of z is ' + v),
          R => val(R, cyc[n % 4], [cyc[(n + 1) % 4], cyc[(n + 2) % 4]], v => 'i' + sup(n) + ' = ' + v),
          R => val(R, String(a * a + b * b), [num(a * a - b * b), num(2 * a * b)], v => 'z × z̄ = ' + v)
        ]
      };
    }
  };

  const binomial = {
    id: 'binomial',
    g: 12,
    hint: {
      zh: '二項分布 B(n, p)：P(X = k) = C(n, k)·pᵏ·(1 − p)ⁿ⁻ᵏ；期望值 E(X) = np，變異數 Var(X) = np(1 − p)；「至少一次」= 1 − P(X = 0)。',
      en: 'Binomial distribution B(n, p): P(X = k) = C(n, k)·pᵏ·(1 − p)ⁿ⁻ᵏ; E(X) = np and Var(X) = np(1 − p); P(at least once) = 1 − P(X = 0).'
    },
    yt: { zh: '二項分布 期望值 變異數 高三', en: 'binomial distribution expected value variance' },
    make(R) {
      const pp = pick(R, [[1, 2], [1, 3], [1, 4], [2, 3], [3, 4]]);
      const pn = pp[0];
      const pd = pp[1];
      const qn = pd - pn;
      const n = int(R, 3, 6);
      const den = Math.pow(pd, n);
      const p0 = Math.pow(qn, n);
      const p1 = n * pn * Math.pow(qn, n - 1);
      const p = fr(pn, pd);
      return {
        q: {
          zh: '某個遊戲每次獲勝的機率是 ' + p + '，獨立玩 ' + n + ' 次，設 X 為獲勝的次數。' + ASK.zh,
          en: 'A game is won with probability ' + p + ' each time. It is played ' + n + ' times independently, and X is the number of wins. ' + ASK.en
        },
        gens: [
          R => val(R, fr(n * pn, pd), [fr(n * qn, pd), p], v => 'E(X) = ' + v),
          R => val(R, fr(n * pn * qn, pd * pd), [fr(n * pn, pd), fr(n * pn * pn, pd * pd)], v => 'Var(X) = ' + v),
          R => val(R, fr(p0, den), [fr(Math.pow(pn, n), den), fr(qn, pd)], v => 'P(X = 0) = ' + v),
          R => val(R, fr(Math.pow(pn, n), den), [p, fr(n * Math.pow(pn, n), den)], v => 'P(X = ' + n + ') = ' + v),
          R => val(R, fr(p1, den), [fr(pn * Math.pow(qn, n - 1), den), p], v => 'P(X = 1) = ' + v),
          R =>
            choose(R, [
              [true, 'P(X ≥ 1) = 1 − P(X = 0)'],
              [p0 === p1, 'P(X ≥ 1) = 1 − P(X = 1)']
            ])
        ]
      };
    }
  };

  const parabola = {
    id: 'parabola',
    g: 12,
    hint: {
      zh: '拋物線 y² = 4cx 的焦點是 (c, 0)、準線是 x = −c，正焦弦長 4|c|；x² = 4cy 的焦點是 (0, c)、準線是 y = −c；拋物線上每一點到焦點的距離等於到準線的距離。',
      en: 'The parabola y² = 4cx has focus (c, 0), directrix x = −c and latus rectum 4|c|; x² = 4cy has focus (0, c) and directrix y = −c; every point on a parabola is as far from the focus as from the directrix.'
    },
    yt: { zh: '拋物線 焦點 準線 正焦弦', en: 'parabola focus directrix latus rectum' },
    make(R) {
      const c = pick(R, [-3, -2, -1, 1, 2, 3]);
      const vert = R() < 0.5;
      const t = nz(R, 3);
      const eq = vert ? 'x² = ' + num(4 * c) + 'y' : 'y² = ' + num(4 * c) + 'x';
      const P = vert ? [2 * c * t, c * t * t] : [c * t * t, 2 * c * t];
      const along = vert ? P[1] : P[0];
      const Ps = pt(num(P[0]), num(P[1]));
      return {
        q: { zh: '拋物線 Γ：' + eq + '。' + ASK.zh, en: 'Parabola Γ: ' + eq + '. ' + ASK.en },
        gens: [
          R => val(R, vert ? pt('0', num(c)) : pt(num(c), '0'), [vert ? pt('0', num(4 * c)) : pt(num(4 * c), '0'), vert ? pt(num(c), '0') : pt('0', num(c))], v => '焦點是 ' + v, v => 'The focus is ' + v),
          R => val(R, (vert ? 'y = ' : 'x = ') + num(-c), [(vert ? 'y = ' : 'x = ') + num(c), (vert ? 'x = ' : 'y = ') + num(-c)], v => '準線是 ' + v, v => 'The directrix is ' + v),
          R => val(R, String(4 * Math.abs(c)), [String(2 * Math.abs(c)), String(Math.abs(c))], v => '正焦弦長是 ' + v, v => 'The latus rectum has length ' + v),
          () => (vert ? claim(c > 0, '開口向上', 'It opens upward') : claim(c > 0, '開口向右', 'It opens to the right')),
          R => {
            const ok = R() < 0.5;
            const Q = vert ? [P[0], P[1] + (ok ? 0 : 1)] : [P[0] + (ok ? 0 : 1), P[1]];
            const truth = vert ? Q[0] * Q[0] === 4 * c * Q[1] : Q[1] * Q[1] === 4 * c * Q[0];
            return claim(truth, '點 ' + pt(num(Q[0]), num(Q[1])) + ' 在拋物線上', 'The point ' + pt(num(Q[0]), num(Q[1])) + ' is on the parabola');
          },
          R => val(R, String(Math.abs(along + c)), [String(Math.abs(along)), String(Math.abs(along - c))], v => '點 ' + Ps + ' 到焦點的距離是 ' + v, v => 'The point ' + Ps + ' is ' + v + ' from the focus')
        ]
      };
    }
  };

  const TYPES = [
    signed, fractions, linEq, gcdLcm, percent, system2, powers, linIneq,
    pythag, expand, factor, quadEq, radicals, arithmetic, polygon, triAngles, stats,
    quadratic, line, dice, similar, circleAngles, centers, balls,
    geometric, rightTrig, absIneq, bag, cubic, logs, expEq, counting, series, variance,
    cosLaw, trigValues, vectors, circleEq, matrix, pointLine,
    derivative, integral, limits, complex, binomial, parabola
  ];
  const LETTERS = 'ABCDE';
  const DEFAULT_GRADE = 9.5;

  // Grade 7 to 12 in half steps; a whole grade uses that grade's problems, a half grade mixes the two around it.
  function normGrade(g) {
    const n = Math.round(Number(g) * 2) / 2;
    if (!Number.isFinite(n)) return DEFAULT_GRADE;
    return Math.min(12, Math.max(7, n));
  }

  function typesFor(grade) {
    const g = normGrade(grade);
    return TYPES.filter(t => Math.abs(t.g - g) <= 0.5);
  }

  function make(seed, grade) {
    const R = rng(seed >>> 0 || 1);
    const pool = typesFor(grade);
    const type = pool[Math.floor(R() * pool.length)];
    let base = null;
    let items = null;
    for (let tries = 0; tries < 500; tries++) {
      base = type.make(R);
      items = shuffle(R, base.gens.slice())
        .slice(0, 5)
        .map(g => g(R));
      const right = items.filter(c => c.ok).length;
      const distinct = new Set(items.map(c => c.en)).size === 5;
      if (right >= 1 && right <= 4 && distinct) break;
    }
    return {
      id: type.id,
      g: type.g,
      q: base.q,
      opts: items.map(c => ({ zh: c.zh, en: c.en })),
      ans: items.map((c, i) => (c.ok ? LETTERS[i] : '')).join(''),
      hint: type.hint,
      yt: type.yt
    };
  }

  // "c a e" or "ACE" both become "ACE".
  function norm(s) {
    const t = String(s || '').toUpperCase();
    return LETTERS.split('')
      .filter(L => t.indexOf(L) >= 0)
      .join('');
  }

  // A YouTube search for lessons on the problem's topic (a search, so it never points at a missing video).
  function videoUrl(prob, lang) {
    const q = lang === 'en' ? prob.yt.en + ' Khan Academy' : prob.yt.zh + ' 均一';
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  }

  // Experience for a correct answer: more for higher grades, half after using a hint.
  function credit(grade, hints) {
    return Math.round((20 + 10 * (normGrade(grade) - 7)) * (hints ? 0.5 : 1));
  }

  function newSeed() {
    return (Math.random() * 4294967296) >>> 0 || 1;
  }

  // SHA-256 (works on plain http pages too, where crypto.subtle is missing).
  const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const s = unescape(encodeURIComponent(str));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function sha256(str) {
    const bytes = utf8(str);
    const l = bytes.length;
    const total = Math.ceil((l + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[l] = 0x80;
    const bits = l * 8;
    m[total - 4] = (bits >>> 24) & 255;
    m[total - 3] = (bits >>> 16) & 255;
    m[total - 2] = (bits >>> 8) & 255;
    m[total - 1] = bits & 255;
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    const ror = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = ((m[i + 4 * t] << 24) | (m[i + 4 * t + 1] << 16) | (m[i + 4 * t + 2] << 8) | m[i + 4 * t + 3]) >>> 0;
      for (let t = 16; t < 64; t++) {
        const s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = H[0];
      let b = H[1];
      let c = H[2];
      let d = H[3];
      let e = H[4];
      let f = H[5];
      let g = H[6];
      let h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[t] + w[t]) >>> 0;
        const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    return H.map(x => x.toString(16).padStart(8, '0')).join('');
  }

  // Only hashes of the family codes are kept here: "lower" allows a grade below the default, "skip" skips a
  // problem. Anyone who can edit the page could still get around them; they are a family lock, not security.
  const HASH = {
    lower: '633e2e5618cb9e15f66a4ccf96fdf0d0459061ef44592b53d62894058d327dae',
    skip: 'a24fbe37a4082f063d75944e99c400cc3a5ae92b8dc00365b3df4c4ddf18e62e'
  };

  function codeOk(kind, code) {
    return !!HASH[kind] && sha256('yunwang:' + kind + ':' + String(code == null ? '' : code).trim()) === HASH[kind];
  }

  const API = { make, norm, LETTERS, TYPES, count: TYPES.length, typesFor, normGrade, DEFAULT_GRADE, videoUrl, credit, newSeed, sha256, HASH, codeOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else globalThis.PF_QUIZ = API;
})();
