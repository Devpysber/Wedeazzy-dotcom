/* WedEazzy browse page - powers category.html and city.html
 *
 *   category.html?cat=bridal-mehndi[&city=mumbai][&country=GB]
 *   city.html?city=mumbai[&cat=banquet-halls]
 *
 * One toolbar drives everything: search, place (city on category pages,
 * category on city pages), minimum rating and sort. Results page in with
 * "Load more".
 */
(function () {
  var API_BASE = window.location.origin;
  var WA_NUMBER = '917498987620';

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function $(id) { return document.getElementById(id); }
  function titleCase(s) { return (s || '').replace(/(^|[\s-])(\w)/g, function (_, a, b) { return a + b.toUpperCase(); }); }
  function esc(s) { return (s == null ? '' : String(s)).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Some vendors put emoji into their self-submitted business name; strip them for display.
  var EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}]/gu;
  function cleanName(s) { return (s || '').toString().replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim(); }

  // Stock photos for vendors without their own (vetted: on-topic and reachable)
  var CAT_IMG = {
    'banquet-halls': ['photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1519225421980-715cb0215aed','photo-1469371670807-013ccf25f16a','photo-1465495976277-4387d4b0b4c6','photo-1530023367847-a683933f4172','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e','photo-1675247488725-22d1b78e75db','photo-1783314867628-220ab03cac99','photo-1775918427144-51f0bf53f8c4','photo-1762765684665-6b6855bb6fe6','photo-1773407377203-faf8b19a2142','photo-1761114905078-163aa92141c8','photo-1783314863884-be035ed5ed5c','photo-1765947384834-3bdcffcaffff','photo-1780337092331-6580fd9ccb47','photo-1717680281618-442cb9c12b6c','photo-1769224751561-feca3f403d49','photo-1780593116478-c46838f86523','photo-1780337092243-8cc6bdd6cb3e','photo-1780337092608-aad7948d7a60','photo-1759477274116-e3cb02d2b9d8'],
    'marriage-gardens': ['photo-1465495976277-4387d4b0b4c6','photo-1469371670807-013ccf25f16a','photo-1519741497674-611481863552','photo-1519225421980-715cb0215aed','photo-1464366400600-7168b8af9bc3','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e','photo-1634507554990-2043ccc61e61','photo-1663185776079-33231c5242eb','photo-1778842893922-5635dbde6c82','photo-1783142979736-9596873cf20a','photo-1762216444919-043cf813e4de','photo-1784749615325-fbe47c1243c7','photo-1772404245994-200ca40c47fa','photo-1759954644836-a57275881ded','photo-1759490821541-f78bb13a752d','photo-1762216444731-802dcf3da009','photo-1780245989879-1d0234b161de','photo-1768777278961-df45d3c2aa22','photo-1781268520671-6b59d4c6d83b','photo-1783352117644-11f69ea78256'],
    'wedding-lawns': ['photo-1465495976277-4387d4b0b4c6','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1530023367847-a683933f4172','photo-1519741497674-611481863552','photo-1478146896981-b80fe463b330','photo-1464366400600-7168b8af9bc3','photo-1712764995305-75422fbe0ecc','photo-1696271026740-4c0c1a367f03','photo-1578730169862-749bbdc763a8','photo-1613256253852-d3a720ad9983','photo-1620704043184-bc985bebeb8e','photo-1427477321886-abc24e8ce923','photo-1635073431256-aa670801bd4b','photo-1557296440-0dc5e8ba9bc8','photo-1676189676971-2ceedca28d3c','photo-1768777277892-a7853afe5bd7','photo-1770217614282-a74cd3309528','photo-1770824906466-6254ca2cdc14','photo-1774814305525-c302b0dee3e7','photo-1773407377148-8e9551e31b9f','photo-1782025419777-09e493453d9f'],
    'wedding-photographers': ['photo-1511795409834-ef04bbd61622','photo-1519741497674-611481863552','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1530023367847-a683933f4172','photo-1525258946800-98cfd641d0de','photo-1606216794074-735e91aa2c92','photo-1583939003579-730e3918a45a','photo-1623783356340-95375aac85ce','photo-1629756048377-09540f52caa1','photo-1622277430358-f4d134452e2e','photo-1630526720753-aa4e71acf67d','photo-1519741196428-6a2175fa2557','photo-1600164913117-2125c1f60b01','photo-1617724975854-70b5d0cedb0a','photo-1611550287705-7ff8b459c8eb','photo-1519689950823-0a2251441815','photo-1503525443530-339273ca8a86','photo-1622277583249-4c1fad490804','photo-1506355639690-a1f2a100689e','photo-1722805740177-04256b6517f2','photo-1617725145063-56958eadf557'],
    'bridal-makeup': ['photo-1487412947147-5cebf100ffc2','photo-1503236823255-94609f598e71','photo-1512496015851-a90fb38ba796','photo-1684868268327-7e5590bcfbd6','photo-1684868265714-fd2300637c23','photo-1610047614301-13c63f00c032','photo-1610173827043-9db50e0d8ef9','photo-1600685890506-593fdf55949b','photo-1684868682581-4cac3af5b8d4','photo-1631549424057-403e75d68e2f','photo-1684868265715-03e19a3e0e00','photo-1511923199659-1c16881689de','photo-1707576618343-26a1b377ca7a','photo-1684868264466-4c4fcf0a5b37','photo-1662561283890-b00a2d5b4bfc','photo-1641699862936-be9f49b1c38d'],
    'bridal-mehndi': ['photo-1505932794465-147d1f1b2c97','photo-1525135850648-b42365991054','photo-1684814070823-97e0b9e99c69','photo-1530082625928-db66d39c5a21','photo-1564809392273-798ebbb1914a','photo-1619734089700-842e56497353','photo-1530785404354-f4ed0206a0d1','photo-1566745265763-de510bdae868','photo-1619733839322-1e28cdb928a0','photo-1572969147844-920fff94e326','photo-1566829682463-2aa5f6c8afd8','photo-1556536088-f010a312a8d3','photo-1684813270065-73dce8b31b92','photo-1730003873829-09b4b16444c1','photo-1565368114375-ba1a4db7099f'],
    'wedding-planners': ['photo-1530023367847-a683933f4172','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1465495976277-4387d4b0b4c6','photo-1606490194859-07c18c9f0968','photo-1583939003579-730e3918a45a','photo-1502635385003-ee1e6a1a742d','photo-1511285560929-80b456fea0bc','photo-1494955870715-979ca4f13bf0','photo-1576694667642-6f289dd54187','photo-1522673607200-164d1b6ce486','photo-1525441273400-056e9c7517b3','photo-1515715709530-858f7bfa1b10','photo-1612599542558-f3022089fb38','photo-1524777313293-86d2ab467344','photo-1620315472787-52921e5f88a0','photo-1587271407850-8d438ca9fdf2','photo-1729237261091-bae8eba0c60c','photo-1509316554658-04f9287cdb78','photo-1625076932159-61a032e2b7ad'],
    'wedding-decorators': ['photo-1519225421980-715cb0215aed','photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1469371670807-013ccf25f16a','photo-1530023367847-a683933f4172','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e','photo-1465495976277-4387d4b0b4c6','photo-1521129866021-4313ccf20e9e','photo-1644135129271-e80c8c673511','photo-1772127822561-35f4e05a004b','photo-1684243920725-956d93ff391a','photo-1664530140722-7e3bdbf2b870','photo-1613067532295-b4f1760616cd','photo-1544813618-56d190260a84','photo-1544577080-91762bc7f475','photo-1630300728268-90c227710a3f','photo-1724847764267-12775ec49657','photo-1724847664831-27b55fef3121','photo-1724847664518-c62583f1bf69','photo-1724847664903-ef526403bd6b','photo-1724847665541-46d65d4a27ec'],
    'wedding-caterers': ['photo-1555244162-803834f70033','photo-1414235077428-338989a2e8c0','photo-1502998070258-dc1338445ac2','photo-1493676304819-0d7a8d026dcf','photo-1546069901-ba9599a7e63c','photo-1525265332434-d52e2314161d','photo-1576842546422-60562b9242ae','photo-1518619745898-93e765966dcd','photo-1740047602722-b4993b79e4b7','photo-1633424411431-5eb8d0e96488','photo-1567496295302-b8dbcd2913b6','photo-1678646142794-253fdd20fa05','photo-1637059395523-d5a35541d544','photo-1651964060295-ef9e1ee08667','photo-1633424414664-c24a6d28086b','photo-1565898094840-7e408a6f361d','photo-1636906227201-f3ec32645129','photo-1668097519018-f7d13a079c0a','photo-1637059395717-109549c5d055'],
    'wedding-invitations': ['photo-1607344645866-009c320b63e0','photo-1542665952-14513db15293','photo-1469371670807-013ccf25f16a','photo-1606800052052-a08af7148866','photo-1606490194859-07c18c9f0968','photo-1632610992723-82d7c212f6d7','photo-1656104717095-9d062b0d4e8d','photo-1697217866029-2aef7068ecee','photo-1509316554658-04f9287cdb78','photo-1612611450433-360c82a57e01','photo-1641317136698-284db1e10c1b','photo-1712313992209-93a2cc377ede','photo-1710587384897-b1390bd46cc6','photo-1612611450392-826af708c34a','photo-1621877504328-8c802bef9614','photo-1518600593288-2ec370b80cba','photo-1721176487015-5408ae0e9bc2','photo-1732649124686-3bab54f79aa3','photo-1741893043659-ca8b82a8b637','photo-1738898179451-b5fc497f9f8e'],
    'wedding-entertainment': ['photo-1493676304819-0d7a8d026dcf','photo-1501281668745-f7f57925c3b4','photo-1470229722913-7c0e2dbbafd3','photo-1429962714451-bb934ecdc4ec','photo-1514525253161-7a46d19cd819','photo-1465495976277-4387d4b0b4c6','photo-1583939003579-730e3918a45a','photo-1470225620780-dba8ba36b745','photo-1541126274323-dbac58d14741','photo-1571266028243-d220c6a7edbf','photo-1594623930572-300a3011d9ae','photo-1544785349-c4a5301826fd','photo-1618409698966-6caa2b95733a','photo-1660211934853-e33d8a02201d','photo-1651065699236-6a6885503943','photo-1553190842-24c3f93ba116','photo-1641573481523-3e0447d7ba86','photo-1516873240891-4bf014598ab4','photo-1461784180009-21121b2f204c','photo-1618107095181-e3ba0f53ee59','photo-1642784353725-5a79aaaaecab','photo-1571397133301-3f838ea96f56']
  };

  function seedOf(v) { return (v.id || v.name || '').split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0); }
  function stockImg(v, offset) {
    var arr = CAT_IMG[v.category_slug] || CAT_IMG['banquet-halls'];
    return 'https://images.unsplash.com/' + arr[(seedOf(v) + (offset || 0)) % arr.length] + '?w=720&h=480&fit=crop&q=70';
  }
  // Stock photos already shown in the current results, so neighbouring
  // vendors without their own photo don't get the same picture.
  var usedStock = {};
  function vendorImg(v) {
    if (v.image_url) return v.image_url;
    if (v.photos && v.photos.length && v.photos[0].url) return v.photos[0].url;
    var arr = CAT_IMG[v.category_slug] || CAT_IMG['banquet-halls'];
    var seed = seedOf(v);
    for (var k = 0; k < arr.length; k++) {
      var pick = arr[(seed + k) % arr.length];
      if (!usedStock[pick]) { usedStock[pick] = true; return 'https://images.unsplash.com/' + pick + '?w=720&h=480&fit=crop&q=70'; }
    }
    return stockImg(v, 0); // more vendors than photos: repeats are unavoidable
  }

  // ---------- page context ----------
  var MODE = window.BROWSE_MODE || 'category';
  var citySlug = (qs('city') || '').toLowerCase();
  var catSlug = (qs('cat') || '').toLowerCase();
  if (MODE === 'city' && !citySlug) citySlug = 'mumbai';
  if (MODE === 'category' && !catSlug) catSlug = 'banquet-halls';
  var countryCode = (qs('country') || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) countryCode = '';
  var COUNTRY_NAMES = { IN: 'India', AE: 'the UAE', GB: 'the UK', US: 'the USA', CA: 'Canada', AU: 'Australia' };

  var CATS = [
    ['banquet-halls', 'Venues & Banquets', 'https://images.unsplash.com/photo-1587271407850-8d438ca9fdf2?w=80&h=80&fit=crop&q=70'],
    ['wedding-photographers', 'Photographers', '../assets/images/hero-couple.jpg'],
    ['bridal-makeup', 'Bridal Makeup', 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=80&h=80&fit=crop&q=70'],
    ['bridal-mehndi', 'Mehendi Artists', 'https://images.unsplash.com/photo-1597157639073-69284dc0fdaf?w=80&h=80&fit=crop&q=70'],
    ['wedding-decorators', 'Decorators', 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=80&h=80&fit=crop&q=70'],
    ['wedding-caterers', 'Caterers', 'https://images.unsplash.com/photo-1555244162-803834f70033?w=80&h=80&fit=crop&q=70'],
    ['wedding-planners', 'Wedding Planners', '../assets/images/pre_couple.jpg'],
    ['wedding-invitations', 'Invitations', 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=80&h=80&fit=crop&q=70'],
    ['pandits', 'Pandits', '../assets/images/pandit.png'],
    ['wedding-lawns', 'Wedding Lawns', 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=80&h=80&fit=crop&q=70'],
    ['wedding-entertainment', 'Entertainment', 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=80&h=80&fit=crop&q=70']
  ];
  var CAT_NAME = {};
  CATS.forEach(function (c) { CAT_NAME[c[0]] = c[1]; });
  function catLabel(slug) { return CAT_NAME[slug] || titleCase((slug || '').replace(/-/g, ' ')); }
  var cityName = titleCase(citySlug.replace(/-/g, ' '));

  // ---------- state ----------
  var state = { page: 1, limit: 18, total: 0, hasMore: false, loading: false, vendors: [], search: '', place: '', rating: 0, sortBy: 'rating', reqId: 0 };

  function whatsappLink(v) {
    var msg = "Hi WedEazzy! I'm interested in *" + cleanName(v.name) + '* (' + v.category + ' · ' + v.city + (v.area ? ', ' + v.area : '') + "). I'm planning my wedding and would like availability, packages and pricing. Please connect me with the vendor. Thanks!";
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
  }

  function buildQuery() {
    var p = new URLSearchParams();
    p.set('page', state.page);
    p.set('limit', state.limit);
    p.set('sortBy', state.sortBy);
    if (MODE === 'category') {
      p.set('category', catSlug);
      if (state.place) p.set('city', state.place);
      else if (citySlug) p.set('city', citySlug);
      else if (countryCode) p.set('country', countryCode);
    } else {
      p.set('city', citySlug);
      if (state.place) p.set('category', state.place);
      else if (catSlug) p.set('category', catSlug);
    }
    if (state.rating > 0) p.set('rating', state.rating);
    if (state.search) p.set('search', state.search);
    return p.toString();
  }

  // ---------- rendering ----------
  function skeletons(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="skeleton" aria-hidden="true"><div class="sk-img"></div><div class="sk-line w60"></div><div class="sk-line w40"></div></div>';
    return out;
  }

  function card(v) {
    var reviews = parseInt(v.rating_count, 10) || 0;
    var rating = parseFloat(v.rating) || 0;
    var tag = v.subscriptionPlan === 'Featured' ? '<span class="card-tag feat">Featured</span>'
      : v.subscriptionPlan === 'Premium' ? '<span class="card-tag">Premium</span>'
      : (reviews && rating >= 4.8 ? '<span class="card-tag">Top rated</span>' : '');
    var href = 'vendor.html?id=' + encodeURIComponent(v.id);
    var name = esc(cleanName(v.name));
    var loc = esc(v.area || v.city) + (v.area && v.city && v.area !== v.city ? ', ' + esc(v.city) : '');
    var photos = (v.photos || []).length;
    // Category label only where results mix categories (city page, all vendors)
    var kicker = MODE === 'city' && !catSlug && !state.place ? '<p class="card-kicker">' + esc(catLabel(v.category_slug) || v.category) + '</p>' : '';
    var line = reviews
      ? '<span class="rate"><svg><use href="#i-star"/></svg>' + rating.toFixed(1) + ' <small>(' + reviews + ' review' + (reviews === 1 ? '' : 's') + ')</small></span>'
      : '<span class="new">New listing</span>';
    if (v.google_cid) line += '<a class="g" href="https://www.google.com/maps?cid=' + encodeURIComponent(v.google_cid) + '" target="_blank" rel="noopener">Google reviews</a>';
    var facts = [];
    if (v.yearsExperience) facts.push(v.yearsExperience + '+ yrs experience');
    if (v.capacity) facts.push('Up to ' + Number(v.capacity).toLocaleString('en-IN') + ' guests');
    if (v.acceptsDestination) facts.push('Destination weddings');
    var price = v.price_min ? '<p class="card-price">Starting at <b>₹' + Number(v.price_min).toLocaleString('en-IN') + '</b></p>' : '';

    return '<article class="card">' +
      '<a class="card-media" href="' + href + '" aria-label="' + name + '">' + tag +
        '<img loading="lazy" src="' + esc(vendorImg(v)) + '" alt="" data-fallback="' + esc(stockImg(v, 1)) + '" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}else{this.onerror=null;this.style.visibility=\'hidden\';}" />' +
        (photos > 1 ? '<span class="card-count"><svg><use href="#i-grid"/></svg>' + photos + '</span>' : '') +
      '</a>' +
      '<div class="card-body">' + kicker +
        '<h3><a href="' + href + '">' + name + '</a></h3>' +
        '<p class="card-loc"><svg><use href="#i-pin"/></svg>' + loc + '</p>' +
        '<div class="card-line">' + line + '</div>' +
        (facts.length ? '<div class="card-facts">' + facts.slice(0, 2).map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') + '</div>' : '') +
        price +
      '</div>' +
      '<div class="card-actions">' +
        '<button type="button" class="btn btn-ink" data-enquire="' + esc(v.id) + '">Enquire now</button>' +
        '<a class="btn btn-wa" href="' + whatsappLink(v) + '" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>WhatsApp</a>' +
      '</div>' +
    '</article>';
  }

  // Shown within the results: for couples who'd rather be matched than browse
  function promoCard() {
    var what = MODE === 'category' ? catLabel(catSlug).toLowerCase() : 'vendors';
    return '<article class="card promo">' +
      '<div><small>Free service</small><h3>Can\'t decide? Get matched ' + esc(what) + '.</h3>' +
      '<ul><li><svg><use href="#i-check"/></svg>Tell us your date, city and budget</li><li><svg><use href="#i-check"/></svg>We shortlist available vendors</li><li><svg><use href="#i-check"/></svg>Quotes within 24 hours, free</li></ul></div>' +
      '<a class="btn btn-block" href="/#enquire">Get free quotes</a>' +
    '</article>';
  }

  function render() {
    var list = $('vendorList'), more = $('moreBox');
    var n = state.total.toLocaleString('en-IN');
    $('hCount').textContent = n;
    setDesc(state.total);
    $('resText').innerHTML = state.total === 1 ? '<b>1</b> vendor' : '<b>' + n + '</b> vendors';
    $('clearBtn').hidden = !(state.search || state.place || state.rating);

    if (!state.vendors.length) {
      list.innerHTML = '<div class="state"><h3>No vendors match yet</h3><p>Try a different area or clear the filters, or tell us what you need and we\'ll find vendors for you.</p><a class="btn btn-ink" href="/#enquire">Get free quotes</a></div>';
      more.innerHTML = '';
      return;
    }
    usedStock = {};
    var cards = state.vendors.map(card);
    if (cards.length > 7) cards.splice(7, 0, promoCard());
    list.innerHTML = cards.join('');
    more.innerHTML = state.hasMore
      ? '<button type="button" class="btn btn-line" id="loadMore">Show more vendors</button><p>Showing ' + state.vendors.length.toLocaleString('en-IN') + ' of ' + n + '</p>'
      : (state.total > state.limit ? '<p>You\'ve seen all ' + n + ' vendors</p>' : '');
    var lm = $('loadMore');
    if (lm) lm.addEventListener('click', function () { state.page += 1; load(true); });
  }

  function load(append) {
    var id = ++state.reqId;
    state.loading = true;
    if (!append) { $('vendorList').innerHTML = skeletons(6); $('moreBox').innerHTML = ''; }
    else { var lm = $('loadMore'); if (lm) { lm.disabled = true; lm.textContent = 'Loading…'; } }

    fetch(API_BASE + '/api/public/vendors?' + buildQuery())
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (id !== state.reqId) return; // a newer search replaced this one
        state.loading = false;
        if (!res || !res.ok) throw new Error('bad response');
        state.total = res.pagination.total;
        state.hasMore = state.page < res.pagination.totalPages;
        state.vendors = append ? state.vendors.concat(res.vendors || []) : (res.vendors || []);
        render();
      })
      .catch(function () {
        if (id !== state.reqId) return;
        state.loading = false;
        $('vendorList').innerHTML = '<div class="state"><h3>Couldn\'t load vendors</h3><p>Please check your connection and try again.</p><button type="button" class="btn btn-line" onclick="location.reload()">Try again</button></div>';
        $('moreBox').innerHTML = '';
      });
  }

  function reload() { state.page = 1; load(false); }

  // ---------- enquiry dialog: sign in (email code) then send to this vendor ----------
  var enqVendor = null;
  function openEnquiry(v) {
    enqVendor = v;
    $('enqImg').src = vendorImg(v);
    $('enqCat').textContent = catLabel(v.category_slug) + ' · ' + (v.area || v.city || '');
    $('enqVendor').textContent = cleanName(v.name);
    $('enqProfile').href = 'vendor.html?id=' + encodeURIComponent(v.id);
    $('enqForm').hidden = false; $('enqAuth').hidden = true; $('enqAuth').innerHTML = '';
    $('enqErr').textContent = '';
    var send = $('enqSend'); send.disabled = false; send.textContent = 'Send enquiry';
    $('eDate').min = new Date().toISOString().slice(0, 10);
    // Signed-in couples: prefill their details
    if (window.WZCoupleAuth) WZCoupleAuth.currentCouple().then(function (acc) {
      if (!acc) return;
      if (!$('eName').value) $('eName').value = acc.user.name || '';
      if (!$('eEmail').value) $('eEmail').value = acc.user.email || '';
      if (!$('ePhone').value && acc.user.phone) $('ePhone').value = '+' + acc.user.phone;
    });
    $('enqScrim').classList.add('open'); $('enqDialog').classList.add('open'); document.body.classList.add('enq-lock');
    setTimeout(function () { $('eName').focus(); }, 60);
  }
  function closeEnquiry() {
    $('enqScrim').classList.remove('open'); $('enqDialog').classList.remove('open'); document.body.classList.remove('enq-lock');
  }

  function submitEnquiry(e) {
    e.preventDefault();
    var f = $('enqForm'), err = $('enqErr'), send = $('enqSend');
    var d = { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim().toLowerCase(), eventDate: f.eventDate.value, guests: f.guests.value, notes: f.notes.value.trim() };
    var bad = null;
    [['name', d.name.length > 1], ['phone', d.phone.replace(/\D/g, '').length >= 8 && d.phone.replace(/\D/g, '').length <= 15], ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)]].forEach(function (r) {
      f[r[0]].setAttribute('aria-invalid', r[1] ? 'false' : 'true');
      if (!r[1] && !bad) bad = f[r[0]];
    });
    if (bad) { err.textContent = 'Please fill in the highlighted fields.'; bad.focus(); return; }
    err.textContent = ''; send.disabled = true; send.textContent = 'Please wait…';

    var authHost = $('enqAuth');
    d.onCodeStep = function () { f.hidden = true; authHost.hidden = false; };
    WZCoupleAuth.ensure(authHost, d).then(function (token) {
      authHost.hidden = false; f.hidden = true;
      authHost.innerHTML = '<p class="enq-fine">Sending your enquiry…</p>';
      return WZCoupleAuth.postJson('/api/inquiry', {
        vendorId: enqVendor.id, name: d.name, phone: d.phone, email: d.email,
        eventDate: d.eventDate || undefined, guests: d.guests || undefined, notes: d.notes || undefined
      }, token);
    }).then(function (r) {
      if (!r.res.ok || !r.data.ok) throw new Error(r.data.message || 'Could not send your enquiry right now.');
      if (window.gtag) gtag('event', 'generate_lead', { vendor: enqVendor.id, category: enqVendor.category_slug });
      authHost.innerHTML = '<div class="enq-done"><div class="tick">✓</div><h4>Enquiry sent</h4><p>' + esc(cleanName(enqVendor.name)) + ' will get back to you soon. Taking you to your dashboard…</p><a class="btn btn-ink" href="/pages/user-dashboard.html#inquiries">Go to my enquiries</a></div>';
      setTimeout(function () { location.href = '/pages/user-dashboard.html#inquiries'; }, 2200);
    }).catch(function (e2) {
      authHost.hidden = true; authHost.innerHTML = ''; f.hidden = false;
      send.disabled = false; send.textContent = 'Send enquiry';
      if (!(e2 && e2.cancelled)) err.textContent = (e2 && e2.message) || 'Something went wrong. Please try again.';
    });
  }

  // ---------- setup ----------
  function setDesc(total) {
    var el = $('hDesc'); if (!el) return;
    var n = total ? total.toLocaleString('en-IN') + ' ' : '';
    var where = citySlug ? 'in ' + cityName : 'across ' + (COUNTRY_NAMES[countryCode] || 'India');
    el.textContent = MODE === 'city'
      ? 'Compare ' + n + (catSlug ? catLabel(catSlug).toLowerCase() : 'wedding vendors') + ' in ' + cityName + '. See their work and reviews, then contact them directly. No booking fees, ever.'
      : 'Compare ' + n + catLabel(catSlug).toLowerCase() + ' ' + where + '. See their work and reviews, then contact them directly. No booking fees, ever.';
  }

  // Popular quick filters: top cities (category page) or services (city page)
  function renderPopular(meta) {
    var box = $('popPlaces'); if (!box || !meta) return;
    var items = [];
    if (MODE === 'category') {
      items = (meta.cities || []).filter(function (c) { return c.slug !== citySlug; }).slice(0, 8).map(function (c) { return [c.slug, c.name]; });
    } else {
      var cats = {};
      (meta.categories || []).forEach(function (c) { if (c.slug && c.slug !== catSlug) cats[c.slug] = (cats[c.slug] || 0) + c.count; });
      items = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 8).map(function (sl) { return [sl, catLabel(sl)]; });
    }
    if (!items.length) return;
    box.innerHTML = '<span>Popular:</span>' + items.map(function (it) { return '<button type="button" data-place="' + esc(it[0]) + '">' + esc(it[1]) + '</button>'; }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-place]'); if (!b) return;
      var val = b.classList.contains('on') ? '' : b.getAttribute('data-place');
      $('fPlace').value = val; state.place = val;
      syncPopular();
      reload();
      document.querySelector('.toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function syncPopular() {
    [].forEach.call(document.querySelectorAll('#popPlaces [data-place]'), function (b) { b.classList.toggle('on', b.getAttribute('data-place') === state.place); });
  }

  function setHeadings() {
    var where = citySlug ? 'in ' + cityName : 'across ' + (COUNTRY_NAMES[countryCode] || 'India');
    var h1Html, plain;
    if (MODE === 'city') {
      var what = catSlug ? catLabel(catSlug) : 'Wedding vendors';
      h1Html = esc(what) + ' in <em>' + esc(cityName) + '</em>';
      plain = what + ' in ' + cityName;
    } else {
      h1Html = esc(catLabel(catSlug)) + ' <em>' + esc(where) + '</em>';
      plain = catLabel(catSlug) + ' ' + where;
    }
    $('hH1').innerHTML = h1Html;
    $('bcLeaf').textContent = plain;
    $('pageTitle').textContent = plain + ' | WedEazzy.com';
    $('pageDesc').setAttribute('content', 'Browse ' + plain.toLowerCase() + '. Verified vendors, direct contact on WhatsApp, zero booking fees on WedEazzy.com.');
  }

  function buildRail() {
    var extra = citySlug ? '&city=' + encodeURIComponent(citySlug) : (countryCode ? '&country=' + countryCode : '');
    var base = MODE === 'city' ? 'city.html?city=' + encodeURIComponent(citySlug) + '&cat=' : 'category.html?cat=';
    var html = CATS.map(function (c) {
      var href = base + c[0] + (MODE === 'city' ? '' : extra);
      return '<a href="' + href + '"' + (c[0] === catSlug ? ' class="active" aria-current="page"' : '') + '><img src="' + c[2] + '" alt="" loading="lazy" />' + esc(c[1]) + '</a>';
    }).join('');
    if (MODE === 'city') html = '<a href="city.html?city=' + encodeURIComponent(citySlug) + '"' + (!catSlug ? ' class="active" aria-current="page"' : '') + '><img src="../assets/images/logo.png" alt="" style="object-fit:contain;background:#fff" />All vendors</a>' + html;
    $('catRail').innerHTML = html;
    var active = $('catRail').querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function fillPlaceSelect(meta) {
    var sel = $('fPlace');
    if (MODE === 'category') {
      $('fPlaceLabel').textContent = 'City';
      var cities = (meta && meta.cities) || [];
      sel.innerHTML = '<option value="">' + (citySlug ? esc(cityName) : 'All cities') + '</option>' +
        cities.filter(function (c) { return c.slug !== citySlug; }).map(function (c) {
          return '<option value="' + esc(c.slug) + '">' + esc(c.name) + ' (' + c.count + ')</option>';
        }).join('');
    } else {
      $('fPlaceLabel').textContent = 'Service';
      var cats = {};
      ((meta && meta.categories) || []).forEach(function (c) { if (c.slug) cats[c.slug] = (cats[c.slug] || 0) + c.count; });
      sel.innerHTML = '<option value="">' + (catSlug ? esc(catLabel(catSlug)) : 'All services') + '</option>' +
        Object.keys(cats).filter(function (s) { return s !== catSlug && cats[s] > 0; }).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (s) {
          return '<option value="' + esc(s) + '">' + esc(catLabel(s)) + ' (' + cats[s] + ')</option>';
        }).join('');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('yr').textContent = new Date().getFullYear();
    setHeadings();
    buildRail();

    var metaUrl = API_BASE + '/api/public/meta' + (MODE === 'category'
      ? '?category=' + encodeURIComponent(catSlug) + (countryCode ? '&country=' + countryCode : '')
      : '?city=' + encodeURIComponent(citySlug));
    fetch(metaUrl).then(function (r) { return r.json(); }).then(function (m) { if (m && m.ok) { fillPlaceSelect(m); renderPopular(m); } })
      .catch(function () { fillPlaceSelect(null); });

    // Toolbar
    var t = null;
    $('fSearch').addEventListener('input', function (e) {
      clearTimeout(t);
      t = setTimeout(function () { state.search = e.target.value.trim(); reload(); }, 350);
    });
    $('fPlace').addEventListener('change', function (e) { state.place = e.target.value; syncPopular(); reload(); });
    $('fRating').addEventListener('change', function (e) { state.rating = parseFloat(e.target.value) || 0; reload(); });
    $('sortBy').addEventListener('change', function (e) { state.sortBy = e.target.value; reload(); });
    $('clearBtn').addEventListener('click', function () {
      state.search = ''; state.place = ''; state.rating = 0;
      $('fSearch').value = ''; $('fPlace').value = ''; $('fRating').value = '0'; syncPopular();
      reload();
    });

    // Enquiry dialog
    $('vendorList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-enquire]');
      if (!b) return;
      var v = state.vendors.filter(function (x) { return String(x.id) === b.getAttribute('data-enquire'); })[0];
      if (v) openEnquiry(v);
    });
    $('enqClose').addEventListener('click', closeEnquiry);
    $('enqScrim').addEventListener('click', closeEnquiry);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeEnquiry(); });
    $('enqForm').addEventListener('submit', submitEnquiry);
    ['eName', 'ePhone', 'eEmail'].forEach(function (id) { $(id).addEventListener('input', function () { $(id).removeAttribute('aria-invalid'); }); });

    // Toolbar gets a solid edge + shadow once it sticks under the header
    var sentinel = $('tbSentinel'), toolbar = document.querySelector('.toolbar');
    if (sentinel && toolbar && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { toolbar.classList.toggle('stuck', !entries[0].isIntersecting); }, { rootMargin: '-72px 0px 0px 0px' }).observe(sentinel);
    }

    // Mobile menu
    var mb = $('menuBtn'), hr = $('headerRight');
    if (mb && hr) mb.addEventListener('click', function () {
      var open = hr.classList.toggle('open');
      mb.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    load(false);
  });
})();
