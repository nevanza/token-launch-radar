/* Token Launch Radar — static page. No framework, no network.
   Renders from window.RADAR (data.js), which the program writes beside this page. */

(function () {
  'use strict';

  function boot(R) {
    var state = { q: '', cat: 'all', sort: 'value', dir: -1, open: null };

    function $(id) { return document.getElementById(id); }

    function money(n) {
      if (n === null || n === undefined) return '—';
      if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
      if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
      if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
      return '$' + Math.round(n);
    }

    function pct(v) {
      if (v === null || v === undefined) return '<span class="mut">—</span>';
      var cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
      return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
    }

    function ageTxt(d) { return (d === null || d === undefined) ? '<span class="mut">—</span>' : d + 'd'; }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    function conf(c) {
      var dots = Math.max(1, Math.min(5, Math.round((c || 0) * 5)));
      var s = '';
      for (var i = 0; i < dots; i++) s += '<i></i>';
      return '<span class="conf" title="' + Math.round((c || 0) * 100) + '% of this value rests on reported figures">' + s + '</span>';
    }

    /* ---- radar: every ranked protocol plotted by implied value, angle by rank ---- */
    function radarSvg(rows) {
      var W = 620, H = 380, cx = W / 2, cy = H / 2, ring = 168;
      var maxVal = 0, maxTvl = 0;
      rows.forEach(function (r) {
        if (r.implied_value_usd > maxVal) maxVal = r.implied_value_usd;
        if (r.tvl_usd > maxTvl) maxTvl = r.tvl_usd;
      });
      var out = [];
      for (var k = 4; k >= 1; k--) {
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (ring * k / 4).toFixed(1) + '" class="ring"/>');
      }
      out.push('<line x1="' + cx + '" y1="' + (cy - ring) + '" x2="' + cx + '" y2="' + (cy + ring) + '" class="cross"/>');
      out.push('<line x1="' + (cx - ring) + '" y1="' + cy + '" x2="' + (cx + ring) + '" y2="' + cy + '" class="cross"/>');

      var seg = 24, sweep = 64;
      for (var i = 0; i < seg; i++) {
        var a0 = (-90 + (sweep / seg) * i) * Math.PI / 180;
        var a1 = (-90 + (sweep / seg) * (i + 1)) * Math.PI / 180;
        out.push('<path class="sweep" style="opacity:' + (0.03 + 0.32 * (i / seg)).toFixed(2) +
          '" d="M' + cx + ',' + cy +
          ' L' + (cx + ring * Math.cos(a0)).toFixed(1) + ',' + (cy + ring * Math.sin(a0)).toFixed(1) +
          ' A' + ring + ',' + ring + ' 0 0,1 ' + (cx + ring * Math.cos(a1)).toFixed(1) + ',' + (cy + ring * Math.sin(a1)).toFixed(1) + ' Z"/>');
      }

      rows.forEach(function (r) {
        var angle = (r.rank * 137.508) % 360;
        var dist = Math.sqrt(r.implied_value_usd / maxVal);
        var a = angle * Math.PI / 180;
        var x = cx + dist * ring * 0.94 * Math.cos(a);
        var y = cy + dist * ring * 0.94 * Math.sin(a);
        var rad = 1.5 + 3.0 * Math.sqrt(r.tvl_usd / maxTvl);
        out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(1) +
          '" class="blip" data-slug="' + esc(r.slug) + '"><title>' + esc(r.name) + ' · ' + money(r.implied_value_usd) +
          ' · TVL ' + money(r.tvl_usd) + ' · ' + (r.age_days === null ? 'runway unknown' : r.age_days + 'd runway') +
          '</title></circle>');
      });

      out.push('<circle cx="' + cx + '" cy="' + cy + '" r="3.5" class="core"/>');
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="radar svgviz" role="img" aria-label="Radar of ranked protocols">' +
        out.join('') + '</svg>';
    }

    /* ---- scatter: launch value against TVL, both log scale ---- */
    function scatterSvg(rows) {
      var W = 620, H = 300, pad = 44;
      var maxX = 0, maxY = 1;
      rows.forEach(function (r) {
        if (r.tvl_usd > maxX) maxX = r.tvl_usd;
        if (r.implied_value_usd > maxY) maxY = r.implied_value_usd;
      });
      var lx = Math.log10(maxX + 1), ly = Math.log10(maxY + 1);
      var px = function (v) { return pad + (Math.log10(v + 1) / lx) * (W - pad - 14); };
      var py = function (v) { return H - pad - (Math.log10(v + 1) / ly) * (H - pad - 14); };
      var out = [];
      out.push('<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - 14) + '" y2="' + (H - pad) + '" class="axis"/>');
      out.push('<line x1="' + pad + '" y1="14" x2="' + pad + '" y2="' + (H - pad) + '" class="axis"/>');
      for (var g = 1; g < 4; g++) {
        var gy = py(Math.pow(10, ly * g / 4));
        out.push('<line x1="' + pad + '" y1="' + gy.toFixed(1) + '" x2="' + (W - 14) + '" y2="' + gy.toFixed(1) + '" class="grid"/>');
      }
      rows.forEach(function (r) {
        out.push('<circle cx="' + px(r.tvl_usd).toFixed(1) + '" cy="' + py(r.implied_value_usd).toFixed(1) +
          '" r="' + (1.8 + 2.2 * (r.confidence || 0)).toFixed(1) + '" class="dot"><title>' + esc(r.name) +
          ' · ' + money(r.implied_value_usd) + ' on ' + money(r.tvl_usd) + ' TVL</title></circle>');
      });
      out.push('<text x="' + (W / 2) + '" y="' + (H - 12) + '" class="axlabel" text-anchor="middle">TVL today, log scale</text>');
      out.push('<text x="14" y="' + (H / 2) + '" class="axlabel" text-anchor="middle" transform="rotate(-90 14 ' +
        (H / 2) + ')">launch value, log scale</text>');
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="scatter svgviz" role="img" aria-label="Launch value against TVL">' +
        out.join('') + '</svg>';
    }

    function matches(r) {
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (!state.q) return true;
      var q = state.q.toLowerCase();
      return r.name.toLowerCase().indexOf(q) !== -1 ||
        (r.category || '').toLowerCase().indexOf(q) !== -1 ||
        r.chains.join(' ').toLowerCase().indexOf(q) !== -1;
    }

    function sorted(rows) {
      var k = state.sort, dir = state.dir;
      return rows.slice().sort(function (a, b) {
        var x, y;
        if (k === 'name') { x = a.name.toLowerCase(); y = b.name.toLowerCase(); }
        else if (k === 'tvl') { x = a.tvl_usd; y = b.tvl_usd; }
        else if (k === 'growth') { x = a.change_7d === null ? -999 : a.change_7d; y = b.change_7d === null ? -999 : b.change_7d; }
        else if (k === 'age') { x = a.age_days === null ? -1 : a.age_days; y = b.age_days === null ? -1 : b.age_days; }
        else { x = a.implied_value_usd; y = b.implied_value_usd; }
        if (x === y) return a.rank - b.rank;
        return (x < y ? -1 : 1) * dir;
      });
    }

    function stepsFor(r) {
      var chain = r.chains.length ? r.chains[0] : 'its main chain';
      var cap = r.tvl_usd >= 5e9 ? 250 : r.tvl_usd >= 1e9 ? 150 : r.tvl_usd >= 1e8 ? 100 : 50;
      var hold = r.age_days === null ? 30 : r.age_days < 180 ? 60 : r.age_days < 365 ? 45 : 30;
      var c = (r.category || '').toLowerCase();
      var action;
      if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1)
        action = 'Supply $' + cap + ' of USDC to ' + r.name + ' on ' + chain + ' and keep the position open.';
      else if (c.indexOf('dex') !== -1 || c.indexOf('yield') !== -1)
        action = 'Provide $' + cap + ' of liquidity to ' + r.name + "'s main pool on " + chain + ' and keep it there.';
      else if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1)
        action = 'Deposit $' + cap + ' into a ' + r.name + ' vault on ' + chain + ' and keep the shares.';
      else if (c.indexOf('rwa') !== -1)
        action = 'Mint $' + cap + " of the protocol's yield asset on " + chain + ' and hold it.';
      else if (c.indexOf('stable') !== -1)
        action = 'Mint or deposit $' + cap + ' of the stable asset through ' + r.name + ' on ' + chain + '.';
      else if (c.indexOf('insurance') !== -1)
        action = 'Buy $' + cap + ' of cover from ' + r.name + ' on ' + chain + ' and keep the policy.';
      else if (c.indexOf('restak') !== -1 || c.indexOf('staking') !== -1)
        action = "Stake $" + cap + " of the chain's staking asset through " + r.name + ' and keep the receipt.';
      else
        action = 'Deposit $' + cap + ' of USDC into ' + r.name + ' on ' + chain + ' and keep the position open.';
      return [
        ['Use a fresh wallet that holds only what you farm, seed phrase offline.', 'under $3 of gas', '5 minutes'],
        [action, '$' + cap + ' capital, about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes'],
        ['Make one qualifying action a week: a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
        ['Hold at least ' + hold + ' days so the activity spans more than one snapshot.', '$' + cap + ' stays in the position', hold + ' days'],
        ["Claim only from the protocol's own points page, and never pay to claim.", 'free to check', '10 minutes'],
        ['Log the wallet, the dates and every transaction so you can unwind later.', 'nothing but the log', '5 minutes']
      ];
    }

    function detailHtml(r) {
      var steps = stepsFor(r).map(function (s, i) {
        return '<li><span class="n">' + (i + 1) + '</span><div><b>' + esc(s[0]) + '</b>' +
          '<span class="cost">' + esc(s[1]) + ' · ' + esc(s[2]) + '</span></div></li>';
      }).join('');
      var m = r.multiple !== undefined ? {multiple: r.multiple, multiple_basis: r.multiple_basis, multiple_peers: r.multiple_peers, growth_multiplier: r.growth_multiplier, maturity_multiplier: r.maturity_multiplier} : {};
      var mult = money(r.tvl_usd) + ' × ' + (m.multiple || 0).toFixed(3) +
        ' × growth ' + (m.growth_multiplier || 0).toFixed(3) +
        ' × runway ' + (m.maturity_multiplier || 0).toFixed(3);
      return '<div class="detail"><div class="dgrid">' +
        '<div><span class="k">Implied launch value</span><span class="v big">' + money(r.implied_value_usd) + '</span>' +
        '<span class="k2">' + esc(mult) + '</span></div>' +
        '<div><span class="k">TVL today</span><span class="v">' + money(r.tvl_usd) + '</span>' +
        '<span class="k2">' + (r.change_7d === null ? 'no 7d print' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '% over 7 days') + '</span></div>' +
        '<div><span class="k">Tracked</span><span class="v">' + ageTxt(r.age_days) + '</span>' +
        '<span class="k2">since ' + esc(r.listed_at || 'unknown') + '</span></div>' +
        '<div><span class="k">Multiple source</span><span class="v">' + (m.multiple_basis === 'category' ? 'its category' : 'whole field') + '</span>' +
        '<span class="k2">median market cap / TVL across ' + (m.multiple_peers || 0) + ' token-priced peers</span></div>' +
        '<div><span class="k">Confirmations</span><span class="v">' + conf(r.confidence) + '</span>' +
        '<span class="k2">' + Math.round((r.confidence || 0) * 100) + '% of this value rests on reported figures</span></div>' +
        '</div><h3>Farm plan before the launch</h3><ol class="steps">' + steps + '</ol></div>';
    }

    function rowHtml(r) {
      var open = state.open === r.slug;
      var maturity = Math.min(100, Math.round(((r.age_days || 0) / 1080) * 100));
      return '<tr class="row' + (open ? ' open' : '') + '" data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="c-rank">' + r.rank + '</td>' +
        '<td class="c-name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'uncategorised') + '</span></td>' +
        '<td class="c-val">' + money(r.implied_value_usd) + '</td>' +
        '<td class="c-tvl">' + money(r.tvl_usd) + '</td>' +
        '<td class="c-growth">' + pct(r.change_7d) + '</td>' +
        '<td class="c-age">' + ageTxt(r.age_days) + '<span class="bar"><i style="width:' + maturity + '%"></i></span></td>' +
        '<td class="c-conf">' + conf(r.confidence) + '</td></tr>' +
        (open ? '<tr class="detrow"><td colspan="7">' + detailHtml(r) + '</td></tr>' : '');
    }

    function render() {
      var rows = sorted(R.rows.filter(matches));
      $('rows').innerHTML = rows.map(rowHtml).join('');
      $('shown').textContent = rows.length + ' of ' + R.rows.length + ' ranked protocols';
      $('radar').innerHTML = radarSvg(rows.slice(0, 112));
    }

    function live() {
      var rows = R.live.map(function (l) {
        return '<div class="lrow"><b>' + esc(l.name) + '</b><span>' + esc(l.category || '—') + '</span><span>' + money(l.mcap_usd) + '</span></div>';
      }).join('');
      $('livewrap').innerHTML = '<p class="note">A protocol that already trades is listed here with its own market cap and never mixed into the ranking: a launch value and a live market cap measure different things.</p>' + rows;
    }

    function wire() {
      $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
      var sel = $('cat');
      var seen = {};
      R.rows.forEach(function (r) { if (r.category) seen[r.category] = 1; });
      Object.keys(seen).sort().forEach(function (c) {
        var o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o);
      });
      sel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
      var btns = document.querySelectorAll('[data-sort]');
      Array.prototype.forEach.call(btns, function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-sort');
          if (state.sort === k) state.dir = -state.dir;
          else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
          Array.prototype.forEach.call(btns, function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          b.setAttribute('data-dir', state.dir === -1 ? 'down' : 'up');
          render();
        });
      });
      $('rows').addEventListener('click', function (e) {
        var tr = e.target.closest('.row');
        if (!tr) return;
        var slug = tr.getAttribute('data-slug');
        state.open = state.open === slug ? null : slug;
        render();
      });
    }

    $('meta').textContent = 'Snapshot ' + R.as_of + ' · model ' + R.model_version + ' · ' +
      R.watchlist_size + ' on the watchlist · ' + R.board_size + ' ranked · ' + R.early_size +
      ' found below the floor';
    $('scatter').innerHTML = scatterSvg(R.rows);
    live();
    wire();
    render();
  }

  if (!window.RADAR) {
    var run = function () { if (window.RADAR) boot(window.RADAR); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else window.addEventListener('load', run);
    return;
  }
  boot(window.RADAR);
})();
