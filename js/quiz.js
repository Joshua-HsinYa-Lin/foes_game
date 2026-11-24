(function () {
  'use strict';

  // Start-of-match math problems: grade-10 multiple-select questions with five options (A to E), one or more
  // of them correct. A problem is rebuilt from a seed, so the server and every browser get the same problem;
  // a second seed shuffles the options for each player.

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

  // The square root of a positive integer in simplest radical form, e.g. 20 gives 2√5.
  function root(n) {
    let k = 1;
    let m = n;
    for (let f = 2; f * f <= m; f++) {
      while (m % (f * f) === 0) {
        m /= f * f;
        k *= f;
      }
    }
    if (m === 1) return String(k);
    return (k === 1 ? '' : String(k)) + '√' + m;
  }

  const SUB = '₀₁₂₃₄₅₆₇₈₉';

  function sub(n) {
    return String(n)
      .split('')
      .map(c => SUB[Number(c)])
      .join('');
  }

  // A polynomial in x from its coefficients, highest power first.
  function poly(cs) {
    const deg = cs.length - 1;
    let s = '';
    cs.forEach((c, i) => {
      if (c === 0) return;
      const p = deg - i;
      const a = Math.abs(c);
      const pow = p === 1 ? '' : p === 2 ? '²' : '³';
      const body = p === 0 ? String(a) : (a === 1 ? '' : String(a)) + 'x' + pow;
      if (!s) s = (c < 0 ? MINUS : '') + body;
      else s += (c < 0 ? ' − ' : ' + ') + body;
    });
    return s || '0';
  }

  function pt(x, y) {
    return '(' + x + ', ' + y + ')';
  }

  function claim(ok, zh, en) {
    return { ok: !!ok, zh, en: en === undefined ? zh : en };
  }

  // A statement about a value: true with the right value, or false with one of the usual mistakes.
  // Values are compared as text, so a "mistake" that happens to equal the right value is never used.
  function val(R, right, wrongs, zh, en) {
    const bad = wrongs.filter(w => w !== right);
    if (!bad.length || R() < 0.5) return claim(true, zh(right), en(right));
    const w = pick(R, bad);
    return claim(false, zh(w), en(w));
  }

  // ---------- problem types ----------

  function quadratic(R) {
    const a = pick(R, [1, 1, 2, -1, -2, 3]);
    const p = int(R, -6, 5);
    const q = int(R, p + 1, 7);
    const f = x => a * (x - p) * (x - q);
    const c = a * p * q;
    const S = p + q;
    const P = p * q;
    const F = 'f(x) = ' + poly([a, -a * S, c]);
    const k = int(R, -3, 3);
    const gap2 = (q - p) * (q - p);
    return {
      q: { zh: '設 ' + F + '。下列哪些選項正確？', en: 'Let ' + F + '. Which of the following are true?' },
      gens: [
        R => val(R, num(S), [num(-S), num(a * S), num(S + 2)], v => 'f(x) = 0 的兩根之和為 ' + v, v => 'The two roots of f(x) = 0 add up to ' + v),
        R => val(R, num(P), [num(c), num(-P), num(P + 1)], v => 'f(x) = 0 的兩根之積為 ' + v, v => 'The product of the two roots of f(x) = 0 is ' + v),
        R => val(R, fr(S, 2), [fr(-S, 2), num(S)], v => '圖形頂點的 x 坐標為 ' + v, v => 'The vertex of the graph has x-coordinate ' + v),
        R => val(R, fr(-a * gap2, 4), [fr(a * gap2, 4), fr(-a * gap2, 2), fr(-gap2, 4)], v => '圖形頂點的 y 坐標為 ' + v, v => 'The vertex of the graph has y-coordinate ' + v),
        R => (R() < 0.5 ? claim(a > 0, 'f(x) 有最小值', 'f(x) has a minimum value') : claim(a < 0, 'f(x) 有最大值', 'f(x) has a maximum value')),
        R => val(R, num(f(k)), [num(f(-k)), num(f(k) + a), num(-f(k))], v => 'f(' + num(k) + ') = ' + v, v => 'f(' + num(k) + ') = ' + v),
        () => claim(a > 0, '不等式 f(x) < 0 的解為 ' + num(p) + ' < x < ' + num(q), 'The solution of f(x) < 0 is ' + num(p) + ' < x < ' + num(q)),
        R => val(R, pt(0, num(c)), [pt(0, num(P)), pt(0, num(-c)), pt(num(c), 0)], v => 'y = f(x) 的圖形與 y 軸交於點 ' + v, v => 'The graph of y = f(x) meets the y-axis at ' + v)
      ]
    };
  }

  function arithmetic(R) {
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
    const firstSign = () => {
      for (let x = 2; x < 200; x++) if ((d < 0 && t(x) < 0 && t(x - 1) >= 0) || (d > 0 && t(x) > 0 && t(x - 1) <= 0)) return x;
      return 0;
    };
    const fs = firstSign();
    const gens = [
      R => val(R, num(d), [num(-d), num((j - i) * d)], v => '公差為 ' + v, v => 'The common difference is ' + v),
      R => val(R, num(a1), [num(a1 + d), num(a1 - d)], v => 'a₁ = ' + v, v => 'a₁ = ' + v),
      R => val(R, num(t(n)), [num(t(n + 1)), num(t(n - 1))], v => 'a' + sub(n) + ' = ' + v, v => 'a' + sub(n) + ' = ' + v),
      R => val(R, fr(m * (a1 + t(m)), 2), [num(m * (a1 + t(m))), fr(m * (a1 + t(m + 1)), 2)], v => '前 ' + m + ' 項的和為 ' + v, v => 'The sum of the first ' + m + ' terms is ' + v),
      R => {
        // a_k1 + a_k2 = a_p1 + a_p2 exactly when k1 + k2 = p1 + p2, because d is not 0
        const p2 = k1 + k2 - p1 + (R() < 0.5 ? 0 : -1);
        return claim(k1 + k2 === p1 + p2, 'a' + sub(k1) + ' + a' + sub(k2) + ' = a' + sub(p1) + ' + a' + sub(p2));
      },
      R => (R() < 0.5 ? claim(d < 0, '此數列是遞減數列', 'The sequence is decreasing') : claim(d > 0, '此數列是遞增數列', 'The sequence is increasing'))
    ];
    if (fs) {
      const zhWord = d < 0 ? '第一個小於 0 的項是第 ' : '第一個大於 0 的項是第 ';
      const enWord = d < 0 ? 'The first negative term is term number ' : 'The first positive term is term number ';
      gens.push(R => val(R, String(fs), [String(fs - 1), String(fs + 1)], v => zhWord + v + ' 項', v => enWord + v));
    }
    return {
      q: { zh: '等差數列 ⟨aₙ⟩ 中，' + given + '，' + given2 + '。下列哪些選項正確？', en: 'In an arithmetic sequence ⟨aₙ⟩, ' + given + ' and ' + given2 + '. Which of the following are true?' },
      gens
    };
  }

  function geometric(R) {
    const r = pick(R, [2, 3, -2, -3]);
    const a1 = pick(R, [1, 2, 3, -1, -2, -3]);
    const t = n => a1 * Math.pow(r, n - 1);
    const s5 = (a1 * (Math.pow(r, 5) - 1)) / (r - 1);
    const given = 'a₂ = ' + num(t(2)) + '，a₅ = ' + num(t(5));
    const givenEn = 'a₂ = ' + num(t(2)) + ' and a₅ = ' + num(t(5));
    return {
      q: { zh: '等比數列 ⟨aₙ⟩ 中，' + given + '。下列哪些選項正確？', en: 'In a geometric sequence ⟨aₙ⟩, ' + givenEn + '. Which of the following are true?' },
      gens: [
        R => val(R, num(r), [num(-r), num(r * r), num(r * r * r)], v => '公比為 ' + v, v => 'The common ratio is ' + v),
        R => val(R, num(a1), [num(-a1), num(t(3))], v => 'a₁ = ' + v, v => 'a₁ = ' + v),
        R => val(R, num(t(6)), [num(t(7)), num(-t(6))], v => 'a₆ = ' + v, v => 'a₆ = ' + v),
        R => val(R, num(s5), [num(s5 + t(6)), num(s5 - a1)], v => '前 5 項的和為 ' + v, v => 'The sum of the first 5 terms is ' + v),
        R => (R() < 0.5 ? claim(true, 'a₃ × a₇ = (a₅)²') : claim(false, 'a₃ × a₇ = (a₄)²')),
        () => claim(a1 > 0 && r > 0, '此數列的每一項都是正數', 'Every term of the sequence is positive'),
        () => claim(r < 0, '此數列的項正負交替', 'The terms alternate between positive and negative')
      ]
    };
  }

  function line(R) {
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
    const P = pt(num(x1), num(y1));
    const Qp = pt(num(x2), num(y2));
    const u = int(R, -8, 8);
    const sq = dx * dx + dy * dy;
    const diff = Math.abs(dx * dx - dy * dy);
    const lenWrong = [num(Math.abs(dx) + Math.abs(dy))];
    if (diff > 0) lenWrong.push(root(diff));
    return {
      q: { zh: '坐標平面上有兩點 P' + P + '、Q' + Qp + '。下列哪些選項正確？', en: 'In the coordinate plane, P' + P + ' and Q' + Qp + '. Which of the following are true?' },
      gens: [
        R => val(R, fr(dy, dx), [fr(-dy, dx), fr(dx, dy)], v => '直線 PQ 的斜率為 ' + v, v => 'Line PQ has slope ' + v),
        R => val(R, fr(bN, dx), [fr(-bN, dx), fr(bN + dy, dx)], v => '直線 PQ 的 y 截距為 ' + v, v => 'The y-intercept of line PQ is ' + v),
        R => {
          const on = R() < 0.5;
          const pnt = pt(num(u), fr(dy * u + bN + (on ? 0 : dx), dx));
          return claim(on, '點 ' + pnt + ' 在直線 PQ 上', 'The point ' + pnt + ' lies on line PQ');
        },
        R => val(R, fr(-dx, dy), [fr(dx, dy), fr(-dy, dx)], v => '與直線 PQ 垂直的直線，斜率為 ' + v, v => 'A line perpendicular to PQ has slope ' + v),
        R => val(R, pt(fr(x1 + x2, 2), fr(y1 + y2, 2)), [pt(fr(dx, 2), fr(dy, 2)), pt(num(x1 + x2), num(y1 + y2))], v => '線段 PQ 的中點為 ' + v, v => 'The midpoint of PQ is ' + v),
        R => val(R, root(sq), lenWrong, v => '線段 PQ 的長度為 ' + v, v => 'PQ has length ' + v)
      ]
    };
  }

  function triangle(R) {
    const tr = pick(R, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]);
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
        zh: '直角三角形 ABC 中，∠C = 90°，AB = ' + AB + '，BC = ' + BC + '。下列哪些選項正確？',
        en: 'In right triangle ABC, ∠C = 90°, AB = ' + AB + ' and BC = ' + BC + '. Which of the following are true?'
      },
      gens: [
        R => val(R, num(AC), [root(AB * AB + BC * BC), num(AB - BC)], v => 'AC = ' + v, v => 'AC = ' + v),
        R => val(R, fr(a, c), [fr(b, c), fr(a, b)], v => 'sin A = ' + v, v => 'sin A = ' + v),
        R => val(R, fr(a, c), [fr(b, c), fr(b, a)], v => 'cos B = ' + v, v => 'cos B = ' + v),
        R => (R() < 0.5 ? claim(true, 'tan A × tan B = 1') : claim(false, 'tan A = tan B')),
        R => val(R, fr(BC * AC, 2), [fr(BC * AB, 2), num(BC * AC)], v => '△ABC 的面積為 ' + v, v => 'The area of triangle ABC is ' + v),
        () => claim(a > b, 'sin A > cos A'),
        R => val(R, fr(BC * AC, AB), [fr(AB, 2), fr(BC + AC, 2)], v => '斜邊 AB 上的高為 ' + v, v => 'The height to the hypotenuse AB is ' + v)
      ]
    };
  }

  function absIneq(R) {
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
    const right = span(fr(b - c, a), fr(b + c, a));
    const wrong = [span(fr(-b - c, a), fr(-b + c, a))];
    if (a !== 1) wrong.push(span(num(b - c), num(b + c)));
    const t = int(R, -6, 6);
    return {
      q: { zh: '關於不等式 ' + ineq + '，下列哪些選項正確？', en: 'For the inequality ' + ineq + ', which of the following are true?' },
      gens: [
        R => val(R, right, wrong, v => '解為 ' + v, v => 'Its solution is ' + v),
        R => val(R, String(count), [String(count + 1), String(count - 1)], v => '整數解共有 ' + v + ' 個', v => 'It has exactly ' + v + ' integer solutions'),
        () => claim(ok(t), 'x = ' + num(t) + ' 是此不等式的解', 'x = ' + num(t) + ' is a solution'),
        R => val(R, num(max), [num(max + 1), num(max - 1)], v => '最大的整數解為 ' + v, v => 'The largest integer solution is ' + v),
        R => val(R, fr(2 * c, a), [fr(c, a), num(2 * c)], v => '解區間的長度為 ' + v, v => 'The solution interval has length ' + v),
        R => val(R, fr(b, a), [fr(-b, a), num(b)], v => '解區間的中點為 x = ' + v, v => 'The midpoint of the solution interval is x = ' + v)
      ]
    };
  }

  function dice(R) {
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
      q: { zh: '同時擲兩顆公正的骰子。下列哪些選項正確？', en: 'Two fair dice are rolled. Which of the following are true?' },
      gens: [
        R => val(R, fr(cs, 36), [fr(1, 11), fr(cs, 21)], v => '點數和為 ' + s + ' 的機率是 ' + v, v => 'The probability that the sum is ' + s + ' is ' + v),
        R => val(R, fr(count((i, j) => i === j), 36), [fr(1, 36), fr(1, 12)], v => '兩顆點數相同的機率是 ' + v, v => 'The probability of rolling a double is ' + v),
        R => val(R, fr(count((i, j) => i === 6 || j === 6), 36), [fr(1, 3), fr(1, 36)], v => '至少出現一個 6 點的機率是 ' + v, v => 'The probability of at least one 6 is ' + v),
        R => val(R, fr(count((i, j) => (i * j) % 2 === 1), 36), [fr(1, 2), fr(1, 3)], v => '點數乘積為奇數的機率是 ' + v, v => 'The probability that the product is odd is ' + v),
        R => val(R, fr(count((i, j) => i + j > g), 36), [fr(count((i, j) => i + j >= g), 36), fr(12 - g, 11)], v => '點數和大於 ' + g + ' 的機率是 ' + v, v => 'The probability that the sum is greater than ' + g + ' is ' + v),
        () => claim(count((i, j) => i + j === s1) > count((i, j) => i + j === s2), '點數和為 ' + s1 + ' 的機率大於點數和為 ' + s2 + ' 的機率', 'A sum of ' + s1 + ' is more likely than a sum of ' + s2)
      ]
    };
  }

  function bag(R) {
    const r = int(R, 3, 6);
    const b = int(R, 2, 5);
    const n = r + b;
    const C2 = m => (m * (m - 1)) / 2;
    const all = C2(n);
    return {
      q: {
        zh: '袋中有 ' + r + ' 顆紅球、' + b + ' 顆藍球，從中同時取出兩顆球。下列哪些選項正確？',
        en: 'A bag holds ' + r + ' red and ' + b + ' blue balls. Two balls are drawn at the same time. Which of the following are true?'
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

  function stats(R) {
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
    const list = data.join('、');
    const listEn = data.join(', ');
    return {
      q: { zh: '某組資料為：' + list + '。下列哪些選項正確？', en: 'A data set: ' + listEn + '. Which of the following are true?' },
      gens: [
        R => val(R, meanTxt, [fr(S, n - 1), medTxt], v => '平均數為 ' + v, v => 'The mean is ' + v),
        R => val(R, medTxt, [meanTxt, String(data[Math.floor(n / 2)])], v => '中位數為 ' + v, v => 'The median is ' + v),
        R => val(R, String(mode), [String(hi), String(lo)], v => '眾數為 ' + v, v => 'The mode is ' + v),
        R => val(R, String(hi - lo), [String(hi), String(hi - lo + 1)], v => '全距為 ' + v, v => 'The range is ' + v),
        R =>
          R() < 0.5
            ? claim(true, '每個數都加 5 之後，標準差不變', 'If 5 is added to every value, the standard deviation stays the same')
            : claim(false, '每個數都加 5 之後，標準差也增加 5', 'If 5 is added to every value, the standard deviation also increases by 5'),
        R => val(R, fr(2 * S, n), [fr(S + 2 * n, n), meanTxt], v => '每個數都乘以 2 之後，平均數為 ' + v, v => 'If every value is doubled, the mean becomes ' + v),
        () => claim(2 * S > n * med2, '平均數大於中位數', 'The mean is greater than the median')
      ]
    };
  }

  function cubic(R) {
    const r = pick(R, [-3, -2, -1, 1, 2, 3]);
    const b = int(R, -4, 4);
    const c = int(R, -6, 6);
    const f = x => (x - r) * (x * x + b * x + c);
    const F = 'f(x) = ' + poly([1, b - r, c - r * b, -r * c]);
    const k = int(R, -3, 3);
    const s = R() < 0.5 ? r : pick(R, [-3, -2, -1, 1, 2, 3]);
    const u = int(R, 1, 3);
    return {
      q: { zh: '設 ' + F + '。下列哪些選項正確？', en: 'Let ' + F + '. Which of the following are true?' },
      gens: [
        () => claim(f(s) === 0, poly([1, -s]) + ' 是 f(x) 的因式', poly([1, -s]) + ' is a factor of f(x)'),
        R => val(R, num(f(k)), [num(f(-k)), num(-f(k))], v => 'f(x) 除以 ' + poly([1, -k]) + ' 的餘式為 ' + v, v => 'The remainder when f(x) is divided by ' + poly([1, -k]) + ' is ' + v),
        R => val(R, num(f(1)), [num(f(-1)), num(f(1) + 1)], v => 'f(x) 各項係數的和為 ' + v, v => 'The coefficients of f(x) add up to ' + v),
        () => claim(b * b - 4 * c >= 0, 'f(x) = 0 的根都是實數', 'Every root of f(x) = 0 is a real number'),
        () => claim(f(u) > f(-u), 'f(' + u + ') > f(' + num(-u) + ')'),
        R => val(R, poly([1, -r]), [poly([1, r])], v => 'f(x) 除以 ' + poly([1, b, c]) + ' 的商式為 ' + v, v => 'Dividing f(x) by ' + poly([1, b, c]) + ' gives the quotient ' + v)
      ]
    };
  }

  const TYPES = [quadratic, arithmetic, geometric, line, triangle, absIneq, dice, bag, stats, cubic];
  const LETTERS = 'ABCDE';

  // seed picks the problem; order shuffles its five options for one player.
  function make(seed, order) {
    const R = rng(seed);
    const type = Math.floor(R() * TYPES.length);
    let base = null;
    let items = null;
    for (let tries = 0; tries < 500; tries++) {
      base = TYPES[type](R);
      items = shuffle(R, base.gens.slice())
        .slice(0, 5)
        .map(g => g(R));
      const right = items.filter(c => c.ok).length;
      const distinct = new Set(items.map(c => c.en)).size === 5;
      if (right >= 1 && right <= 4 && distinct) break;
    }
    shuffle(rng(order || 1), items);
    return {
      type,
      q: base.q,
      opts: items.map(c => ({ zh: c.zh, en: c.en })),
      ans: items.map((c, i) => (c.ok ? LETTERS[i] : '')).join('')
    };
  }

  // "c a e" or "ACE" both become "ACE".
  function norm(s) {
    const t = String(s || '').toUpperCase();
    return LETTERS.split('')
      .filter(L => t.indexOf(L) >= 0)
      .join('');
  }

  const API = { make, norm, LETTERS, count: TYPES.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else globalThis.PF_QUIZ = API;
})();
