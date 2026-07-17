/* WedEazzy browse logic - powers city.html and category.html */
(function () {
  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : window.location.origin;

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function titleCase(s) { return (s || '').replace(/(^|[\s-])(\w)/g, function(_,a,b){ return a + b.toUpperCase(); }); }
  function esc(s) { return (s || '').toString().replace(/[<>&"]/g, function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }

  var CAT_IMG = {
    'banquet-halls':         ['photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1519225421980-715cb0215aed','photo-1469371670807-013ccf25f16a','photo-1465495976277-4387d4b0b4c6','photo-1530023367847-a683933f4172','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e'],
    'marriage-gardens':      ['photo-1465495976277-4387d4b0b4c6','photo-1469371670807-013ccf25f16a','photo-1519741497674-611481863552','photo-1519225421980-715cb0215aed','photo-1464366400600-7168b8af9bc3','photo-1478146896981-b80fe463b330','photo-1502635994848-43d6f7a14784','photo-1513278974582-3e1b4a4fa21e'],
    'wedding-lawns':         ['photo-1465495976277-4387d4b0b4c6','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1530023367847-a683933f4172','photo-1519741497674-611481863552','photo-1502635994848-43d6f7a14784','photo-1478146896981-b80fe463b330','photo-1464366400600-7168b8af9bc3'],
    'wedding-photographers': ['photo-1511795409834-ef04bbd61622','photo-1519741497674-611481863552','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1530023367847-a683933f4172','photo-1525258946800-98cfd641d0de','photo-1606216794074-735e91aa2c92','photo-1583939003579-730e3918a45a'],
    'bridal-makeup':         ['photo-1487412947147-5cebf100ffc2','photo-1591035897819-f4bdf739f446','photo-1583001931096-959e7d3b9d80','photo-1583241800698-9c2e2c0bf06d','photo-1492106087820-71f1a00d2b11','photo-1522337360788-8b13dee7a37e','photo-1503236823255-94609f598e71','photo-1604336732494-bf02af26f97f'],
    'bridal-mehndi':         ['photo-1602216056096-3b40cc0c9944','photo-1611106671620-37b1eaecd55b','photo-1591035897819-f4bdf739f446','photo-1583001931096-959e7d3b9d80','photo-1492106087820-71f1a00d2b11','photo-1604336732494-bf02af26f97f','photo-1601001815853-3835274403b3','photo-1522337360788-8b13dee7a37e'],
    'wedding-planners':      ['photo-1530023367847-a683933f4172','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1465495976277-4387d4b0b4c6','photo-1606490194859-07c18c9f0968','photo-1583939003579-730e3918a45a'],
    'wedding-decorators':    ['photo-1519225421980-715cb0215aed','photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1469371670807-013ccf25f16a','photo-1530023367847-a683933f4172','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e','photo-1465495976277-4387d4b0b4c6'],
    'wedding-caterers':      ['photo-1555244162-803834f70033','photo-1414235077428-338989a2e8c0','photo-1502998070258-dc1338445ac2','photo-1493676304819-0d7a8d026dcf','photo-1546069901-ba9599a7e63c','photo-1565299507177-b0ac66763828','photo-1567620905732-2d1ec7ab7445','photo-1551782450-a2132b4ba21d'],
    'wedding-invitations':   ['photo-1607344645866-009c320b63e0','photo-1542665952-14513db15293','photo-1525857597365-5f6dbff2e36e','photo-1551184451-76b762941ad6','photo-1469371670807-013ccf25f16a','photo-1606800052052-a08af7148866','photo-1583241800698-9c2e2c0bf06d','photo-1606490194859-07c18c9f0968'],
    'wedding-entertainment': ['photo-1493676304819-0d7a8d026dcf','photo-1501281668745-f7f57925c3b4','photo-1470229722913-7c0e2dbbafd3','photo-1429962714451-bb934ecdc4ec','photo-1514525253161-7a46d19cd819','photo-1485872299712-c6c97ed29f3b','photo-1465495976277-4387d4b0b4c6','photo-1583939003579-730e3918a45a']
  };

  function vendorImg(v) {
    if (v.image_url) return v.image_url;
    if (v.photos && v.photos.length > 0 && v.photos[0].url) return v.photos[0].url;
    var arr = CAT_IMG[v.category_slug] || CAT_IMG['banquet-halls'];
    var seed = (v.id || v.name || '').split('').reduce(function(a,c){return a + c.charCodeAt(0);}, 0);
    var pic = arr[seed % arr.length];
    return 'https://images.unsplash.com/' + pic + '?w=600&h=420&fit=crop&q=70';
  }

  var citySlug = (qs('city') || '').toLowerCase();
  var catSlug  = (qs('cat')  || '').toLowerCase();
  var initialMode = window.BROWSE_MODE || 'city';
  if (initialMode === 'city' && !citySlug) citySlug = 'mumbai';
  if (initialMode === 'category' && !catSlug) catSlug = 'banquet-halls';

  var vendors = [];
  var page = 1;
  var limit = 20;
  var total = 0;
  var loading = false;
  var hasMore = true;

  function whatsappLink(v) {
    var msg = "Hi WedEazzy! I'm interested in *" + v.name + "* (" + v.category + " · " + v.city + (v.area ? ', ' + v.area : '') + "). I'm planning my wedding and would like availability, packages and pricing. Please connect me with the vendor. Thanks!";
    return 'https://wa.me/917498987620?text=' + encodeURIComponent(msg);
  }

  function getSelectedFilters() {
    var rating = parseFloat((document.querySelector('input[name="rating"]:checked') || {}).value || 0);
    var cats = Array.from(document.querySelectorAll('input[name="catFilter"]:checked')).map(function(c){return c.value;});
    var cities = Array.from(document.querySelectorAll('input[name="cityFilter"]:checked')).map(function(c){return c.value;});
    var sortBy = (document.getElementById('sortBy') || {}).value || 'rating';

    return {
      rating: rating,
      cats: cats,
      cities: cities,
      sortBy: sortBy
    };
  }

  function fetchVendors(append) {
    if (loading) return;
    loading = true;
    renderLoadingState(append);

    var filters = getSelectedFilters();
    
    // Build query params
    var queryParams = new URLSearchParams();
    queryParams.append('page', page);
    queryParams.append('limit', limit);
    queryParams.append('sortBy', filters.sortBy);

    // Apply primary filters
    if (citySlug) {
      // Check if user selected sub-city checkboxes, otherwise use page main city
      if (filters.cities.length > 0) {
        queryParams.append('city', filters.cities.join(','));
      } else {
        queryParams.append('city', citySlug);
      }
    } else if (filters.cities.length > 0) {
      queryParams.append('city', filters.cities.join(','));
    }

    if (catSlug) {
      if (filters.cats.length > 0) {
        queryParams.append('category', filters.cats.join(','));
      } else {
        queryParams.append('category', catSlug);
      }
    } else if (filters.cats.length > 0) {
      queryParams.append('category', filters.cats.join(','));
    }

    if (filters.rating > 0) {
      queryParams.append('rating', filters.rating);
    }

    fetch(API_BASE + '/api/public/vendors?' + queryParams.toString())
      .then(function(r) { return r.json(); })
      .then(function(res) {
        loading = false;
        if (res.ok) {
          total = res.pagination.total;
          var newVendors = res.vendors || [];
          
          if (append) {
            vendors = vendors.concat(newVendors);
          } else {
            vendors = newVendors;
          }

          hasMore = page < res.pagination.totalPages;
          render();
        } else {
          showErrorState();
        }
      })
      .catch(function(err) {
        loading = false;
        console.error('[WedEazzy] API Error:', err);
        showErrorState();
      });
  }

  function renderLoadingState(append) {
    var loadMoreContainer = getOrCreateLoadMoreContainer();
    if (!append) {
      document.getElementById('vendorList').innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px 0;"><div style="border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid var(--red); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div><p style="color:var(--text-muted);font-weight:600;">Searching vendors...</p></div>';
      loadMoreContainer.innerHTML = '';
    } else {
      loadMoreContainer.innerHTML = '<div style="border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid var(--red); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto;"></div>';
    }
  }

  function showErrorState() {
    document.getElementById('vendorList').innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px 0;"><p style="color:#DC2626;font-weight:700;">Failed to connect to directory. Please refresh or try again.</p></div>';
    getOrCreateLoadMoreContainer().innerHTML = '';
  }

  function getOrCreateLoadMoreContainer() {
    var c = document.getElementById('loadMoreContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'loadMoreContainer';
      c.style.textAlign = 'center';
      c.style.marginTop = '24px';
      c.style.width = '100%';
      c.style.gridColumn = '1/-1';
      document.getElementById('vendorList').insertAdjacentElement('afterend', c);
    }
    return c;
  }

  function renderFilters(metaData) {
    if (initialMode === 'city') {
      var box = document.getElementById('catFilterBox');
      if (box) {
        box.innerHTML = metaData.categories.map(function(cat){
          return '<label><input type="checkbox" name="catFilter" value="'+cat.slug+'"> ' + esc(cat.name) + ' (' + cat.count + ')</label>';
        }).join('');
      }
    } else {
      var box2 = document.getElementById('cityFilterBox');
      if (box2) {
        box2.innerHTML = metaData.cities.map(function(city){
          return '<label><input type="checkbox" name="cityFilter" value="'+city.slug+'"> ' + esc(city.name) + ' (' + city.count + ')</label>';
        }).join('');
      }
    }

    // Re-bind listeners on checkboxes
    document.querySelectorAll('input[name="catFilter"], input[name="cityFilter"]').forEach(function(el){
      el.addEventListener('change', function() {
        page = 1;
        fetchVendors(false);
      });
    });
  }

  function render() {
    document.getElementById('resCount').textContent = total;
    var hCount = document.getElementById('hCount');
    if (hCount) hCount.textContent = total + ' verified listings found';
    var list = document.getElementById('vendorList');
    
    if (!vendors.length) {
      list.innerHTML = '<div class="empty" style="grid-column: 1/-1;"><h3>No vendors match your filters</h3><p>Clear filters or chat with us on WhatsApp - we\'ll find one for you.</p><a href="https://wa.me/917498987620" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;background:#25D366;color:#fff;padding:10px 22px;border-radius:8px;font-weight:700;">Chat on WhatsApp</a></div>';
      getOrCreateLoadMoreContainer().innerHTML = '';
      return;
    }

    list.innerHTML = vendors.map(function(v, i){
      var hasReviews = (parseInt(v.rating_count, 10) || 0) > 0;
      var badge = '';
      if (v.subscriptionPlan === 'Featured') {
        badge = '<span class="badge badge-feat" style="background:#ea3b3b; color:#fff;">Featured</span>';
      } else if (v.subscriptionPlan === 'Premium') {
        badge = '<span class="badge badge-feat" style="background:#3b82f6; color:#fff;">Premium</span>';
      } else if (hasReviews && (parseFloat(v.rating)||0) >= 4.8) {
        badge = '<span class="badge">Top Rated</span>';
      }
      return '\
        <article class="v-card">\
          <a class="v-img" href="vendor.html?id=' + encodeURIComponent(v.id) + '">' + badge + '\
            <img loading="lazy" src="' + vendorImg(v) + '" alt="' + esc(v.name) + '">\
          </a>\
          <div class="v-info">\
            <span class="v-cat">' + esc(v.category) + '</span>\
            <h3><a href="vendor.html?id=' + encodeURIComponent(v.id) + '">' + esc(v.name) + '</a></h3>\
            <div class="v-loc">📍 ' + esc(v.area || v.city) + (v.pincode ? ' &middot; ' + esc(v.pincode) : '') + '</div>\
            <div class="v-meta">\
              ' + (hasReviews ? '<span class="rating-pill">★ ' + (parseFloat(v.rating)||0).toFixed(1) + '</span>' : '<span class="rating-pill" style="background:#f3f4f6;color:#79706A;">No reviews yet</span>') + '\
              ' + (v.google_cid ? '<a class="g-link" href="https://www.google.com/maps?cid=' + esc(v.google_cid) + '" target="_blank" rel="noopener">View on Google</a>' : '') + '\
            </div>\
          </div>\
          <div class="v-cta" style="display:flex; flex-direction:column; gap:6px;">\
            <a class="btn-view" href="vendor.html?id=' + encodeURIComponent(v.id) + '">View &amp; Inquire</a>\
            <button class="btn-quick" onclick="window.WEDEAZZY_BROWSE.openQuickView(\'' + esc(v.id) + '\')" style="background:#FFF0F2;border:1.5px solid #FBCDD1;color:#E11D2A;padding:10px 14px;font-size:13px;font-weight:700;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;font-family:inherit;line-height:1.2;box-sizing:border-box;">🔍 Quick View</button>\
            <a class="btn-wa" href="' + whatsappLink(v) + '" target="_blank" rel="noopener">\
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/></svg>\
              WhatsApp\
            </a>\
          </div>\
        </article>';
    }).join('');

    // Render Load More Button
    var loadMoreContainer = getOrCreateLoadMoreContainer();
    if (hasMore) {
      loadMoreContainer.innerHTML = '<button id="btnLoadMore" style="background:var(--red);color:#fff;border:none;padding:12px 28px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;transition:transform 0.1s;box-shadow:var(--shadow);">Load More Vendors</button>';
      document.getElementById('btnLoadMore').addEventListener('click', function() {
        page++;
        fetchVendors(true);
      });
    } else {
      loadMoreContainer.innerHTML = '<p style="color:var(--text-muted);font-size:13px;font-weight:600;padding:15px 0;">Showing all matching verified vendors</p>';
    }
  }

  // Init titles, breadcrumbs & load metadata
  document.addEventListener('DOMContentLoaded', function(){
    var cityName = titleCase(citySlug.replace(/-/g, ' '));
    var catName  = titleCase(catSlug.replace(/-/g, ' '));
    var heading;
    if (initialMode === 'city') {
      heading = (catSlug ? catName + ' in ' : 'Wedding Vendors in ') + cityName;
    } else {
      heading = catName + (citySlug ? ' in ' + cityName : ' across India');
    }

    document.getElementById('pageTitle').textContent = heading + ' | WedEazzy.com';
    document.getElementById('pageDesc').setAttribute('content', 'Browse ' + heading.toLowerCase() + '. Verified, hand-picked. Inquire direct on WhatsApp. Zero booking fees on WedEazzy.com.');
    document.getElementById('hH1').textContent = heading;
    document.getElementById('hCount').textContent = 'Loading verified listings...';
    document.getElementById('bcLeaf').textContent = heading;

    // Dynamic category circle links & active states
    var currentCat = catSlug;
    var catCards = document.querySelectorAll('.cat-circle-card');
    catCards.forEach(function(card) {
      var href = card.getAttribute('href');
      if (citySlug && href && href.indexOf('city=') === -1) {
        card.setAttribute('href', href + '&city=' + encodeURIComponent(citySlug));
      }
      var cardCat = card.getAttribute('data-cat');
      if (cardCat && cardCat === currentCat) {
        card.classList.add('active');
      }
    });

    // Load filter options from metadata endpoint
    fetch(API_BASE + '/api/public/meta')
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.ok) {
          renderFilters(res);
        }
      })
      .catch(function(e){ console.error('[WedEazzy] Metadata fetch failed:', e); });

    // Initial fetch of vendors
    fetchVendors(false);

    // Bind non-dynamic event listeners
    document.querySelectorAll('input[name="rating"]').forEach(function(r){
      r.addEventListener('change', function() {
        page = 1;
        fetchVendors(false);
      });
    });

    var sb = document.getElementById('sortBy');
    if (sb) {
      sb.addEventListener('change', function() {
        page = 1;
        fetchVendors(false);
      });
    }
  });

  window.WEDEAZZY_BROWSE = {
    resetFilters: function() {
      document.querySelectorAll('input[name="rating"]').forEach(function(r){ r.checked = r.value === '0'; });
      document.querySelectorAll('input[name="catFilter"], input[name="cityFilter"]').forEach(function(c){ c.checked = false; });
      page = 1;
      fetchVendors(false);
    },
    openQuickView: function(vendorId) {
      // Log profile visit analytics event asynchronously
      try {
        fetch(API_BASE + '/api/public/analytics/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorIdOrSlug: vendorId, eventType: 'profile_visit' })
        });
      } catch (e) {
        console.error('Failed to log profile visit analytics event:', e);
      }

      if (!document.getElementById('wedeazzy-quickview-styles')) {
        var style = document.createElement('style');
        style.id = 'wedeazzy-quickview-styles';
        style.innerHTML = '\
          @keyframes modal-zoom {\
            from { transform: scale(0.95); opacity: 0; }\
            to { transform: scale(1); opacity: 1; }\
          }\
          .quickview-info-block {\
            padding: 10px 12px;\
            background: #F8F9FC;\
            border-radius: 8px;\
            border: 1px solid #E2E8F0;\
          }\
          .quickview-info-block strong {\
            display: block;\
            font-size: 10.5px;\
            color: #64748B;\
            text-transform: uppercase;\
            letter-spacing: 0.5px;\
            margin-bottom: 2px;\
          }\
          .quickview-info-block span {\
            font-size: 13px;\
            color: #0F172A;\
            font-weight: 700;\
          }\
        ';
        document.head.appendChild(style);
      }

      var modalId = 'wedeazzy-quickview-modal';
      var modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.65); backdrop-filter:blur(6px); z-index:99999; display:none; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; font-family:var(--font);';
        document.body.appendChild(modal);
      }

      modal.style.display = 'flex';
      modal.innerHTML = '\
        <div style="background:#fff; width:100%; max-width:850px; max-height:90vh; overflow-y:auto; border-radius:20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); position:relative; display:flex; flex-direction:column; animation: modal-zoom 0.3s cubic-bezier(0.16, 1, 0.3, 1);">\
          <button onclick="document.getElementById(\'wedeazzy-quickview-modal\').style.display=\'none\'" style="position:absolute; top:18px; right:18px; width:36px; height:36px; border-radius:50%; border:none; background:#F1F5F9; color:#64748B; font-size:18px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10;">✕</button>\
          <div style="padding:40px; text-align:center;">\
            <div style="border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid var(--red); border-radius: 50%; width: 35px; height: 35px; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>\
            <p style="color:#64748B; font-weight:600;">Loading details...</p>\
          </div>\
        </div>';

      fetch(API_BASE + '/api/public/vendors/' + encodeURIComponent(vendorId))
        .then(function(r){ return r.json(); })
        .then(function(res){
          if (res.ok && res.vendor) {
            renderModalContent(modal, res.vendor);
          } else {
            renderModalError(modal);
          }
        })
        .catch(function(){
          renderModalError(modal);
        });
    }
  };

  function renderModalContent(modalEl, v) {
    var imgs = [imgFor(v, 0), imgFor(v, 1), imgFor(v, 2), imgFor(v, 3), imgFor(v, 4)];
    if (v.photos && v.photos.length > 0) {
      for (var i = 0; i < 5; i++) {
        if (v.photos[i]) imgs[i] = v.photos[i].url;
      }
    }

    var timingsHtml = '';
    if (v.businessTimings) {
      try {
        var parsed = JSON.parse(v.businessTimings);
        var days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        timingsHtml = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; background:#F8F9FC; padding:10px; border-radius:8px; border:1px solid #E2E8F0; margin-top:8px;">';
        days.forEach(function(day){
          if (parsed[day]) {
            var t = parsed[day];
            timingsHtml += '<div style="display:flex; justify-content:space-between; font-size:11.5px; padding:2px 0; border-bottom:1px dashed #E2E8F0;">' +
              '<span style="text-transform:capitalize; font-weight:600; color:#334155;">' + day.substring(0,3) + '</span>' +
              '<span style="color:' + (t.open ? '#0F172A;' : '#DC2626;') + ' font-weight:700;">' + (t.open ? esc(t.from) + '-' + esc(t.to) : 'Closed') + '</span>' +
            '</div>';
          }
        });
        timingsHtml += '</div>';
      } catch (e) {
        timingsHtml = '<p style="font-size:12px; margin:4px 0 0; color:#0F172A; font-weight:600;">⏰ ' + esc(v.businessTimings) + '</p>';
      }
    } else {
      timingsHtml = '<p style="font-size:12px; color:#64748B; margin:4px 0 0;">Timings not specified</p>';
    }

    var highlightsHtml = '';
    var parsedServices = [];
    if (v.services) {
      try {
        parsedServices = typeof v.services === 'string' ? JSON.parse(v.services) : v.services;
      } catch (e) {}
    }
    if (parsedServices && Array.isArray(parsedServices) && parsedServices.length > 0) {
      highlightsHtml = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:12px;">' +
        parsedServices.map(function(s){ return '<span style="background:#FFF0F2; color:#E11D2A; border:1px solid #FBCDD1; font-size:11px; font-weight:700; padding:4px 8px; border-radius:6px;">✓ ' + esc(s) + '</span>'; }).join('') +
      '</div>';
    }

    var msg = "Hi WedEazzy! I'm interested in *" + v.name + "* (" + v.category + " · " + v.city + "). I saw their profile on the Quick View popup. Please connect me with them. Thanks!";
    var waUrl = 'https://wa.me/917498987620?text=' + encodeURIComponent(msg);

    modalEl.innerHTML = '\
      <div style="background:#fff; width:100%; max-width:850px; max-height:90vh; overflow-y:auto; border-radius:20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); position:relative; display:flex; flex-direction:column; animation: modal-zoom 0.3s cubic-bezier(0.16, 1, 0.3, 1);">\
        <button onclick="document.getElementById(\'wedeazzy-quickview-modal\').style.display=\'none\'" style="position:absolute; top:18px; right:18px; width:36px; height:36px; border-radius:50%; border:none; background:#F1F5F9; color:#64748B; font-size:18px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10;">✕</button>\
        \
        <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:24px; padding:28px; box-sizing:border-box;">\
          \
          <!-- Left Column (Photos & Basic Info) -->\
          <div style="display:flex; flex-direction:column; gap:16px;">\
            <div style="position:relative; border-radius:12px; overflow:hidden; aspect-ratio:16/10;">\
              <img id="quickview-cover" src="' + imgs[0] + '" style="width:100%; height:100%; object-fit:cover;">\
              ' + (v.subscriptionPlan === 'Featured' ? '<span style="position:absolute; top:12px; left:12px; background:#ea3b3b; color:#fff; font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px;">Featured</span>' : (v.subscriptionPlan === 'Premium' ? '<span style="position:absolute; top:12px; left:12px; background:#3b82f6; color:#fff; font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px;">Premium</span>' : '')) + '\
            </div>\
            \
            <!-- Photo selection thumbnails -->\
            <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px;">\
              ' + imgs.map(function(img, idx){
                return '<img src="' + img + '" onclick="document.getElementById(\'quickview-cover\').src=\'' + img + '\'" style="width:55px; height:42px; object-fit:cover; border-radius:6px; cursor:pointer; border:2px solid transparent; transition:border-color 0.2s;" onmouseover="this.style.borderColor=\'#E11D2A\'" onmouseout="this.style.borderColor=\'transparent\'">';
              }).join('') + '\
            </div>\
            \
            <div>\
              <h2 style="margin:0; font-family:var(--serif); font-size:24px; color:var(--navy); font-weight:800;">' + esc(v.name) + '</h2>\
              <p style="margin:6px 0 0; font-size:13.5px; color:#64748B;">📍 ' + esc(v.area || v.city) + ', ' + esc(v.city) + '</p>\
              <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">\
                <span style="background:#FFF0F2; color:#E11D2A; font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px;">' + esc(v.category) + '</span>\
                ' + (v.rating_count && parseInt(v.rating_count, 10) > 0 ? '<span style="background:#FEF3C7; color:#B45309; font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px;">★ ' + ((parseFloat(v.rating)||0).toFixed(1)) + '</span>' : '<span style="background:#F1F5F9; color:#64748B; font-size:12px; font-weight:700; padding:3px 8px; border-radius:6px;">No reviews yet</span>') + '\
              </div>\
            </div>\
            \
            ' + highlightsHtml + '\
          </div>\
          \
          <!-- Right Column (Stats, Timings & CTAs) -->\
          <div style="display:flex; flex-direction:column; justify-content:space-between; border-left:1px solid #E2E8F0; padding-left:24px; box-sizing:border-box;">\
            <div style="display:flex; flex-direction:column; gap:16px;">\
              <div>\
                <h3 style="margin:0 0 8px 0; font-size:14px; text-transform:uppercase; color:#64748B; letter-spacing:0.5px; font-weight:700;">Business Details</h3>\
                <div style="display:grid; grid-template-columns:1fr; gap:8px;">\
                  ' + (v.yearsExperience ? '<div class="quickview-info-block"><strong>Experience</strong><span>' + esc(v.yearsExperience) + ' Years</span></div>' : '') + '\
                  ' + (v.teamSize ? '<div class="quickview-info-block"><strong>Team Size</strong><span>' + esc(v.teamSize) + ' People</span></div>' : '') + '\
                  ' + (v.languagesSpoken ? '<div class="quickview-info-block"><strong>Languages</strong><span>' + esc(v.languagesSpoken) + '</span></div>' : '') + '\
                  ' + (v.serviceAreas ? '<div class="quickview-info-block"><strong>Service Areas</strong><span>' + esc(v.serviceAreas) + '</span></div>' : '') + '\
                  <div class="quickview-info-block"><strong>Destination Weddings</strong><span>' + (v.acceptsDestination ? 'Yes' : 'No') + '</span></div>\
                </div>\
              </div>\
              \
              <div>\
                <h3 style="margin:0; font-size:13px; text-transform:uppercase; color:#64748B; letter-spacing:0.5px; font-weight:700;">Business Hours</h3>\
                ' + timingsHtml + '\
              </div>\
            </div>\
            \
            <!-- Direct CTAs -->\
            <div style="margin-top:24px; display:flex; flex-direction:column; gap:8px;">\
              <a href="' + waUrl + '" target="_blank" rel="noopener" style="background:#25D366; color:#fff; text-decoration:none; padding:12px; border-radius:10px; font-weight:700; font-size:14px; text-align:center; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow: 0 4px 12px rgba(37,211,102,0.25);">\
                <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px; height:18px;"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/></svg>\
                Inquire on WhatsApp\
              </a>\
              <a href="vendor.html?id=' + encodeURIComponent(v.id) + '" style="background:#E11D2A; color:#fff; text-decoration:none; padding:12px; border-radius:10px; font-weight:700; font-size:14px; text-align:center;">\
                View Full Profile & Reviews\
              </a>\
            </div>\
          </div>\
          \
        </div>\
      </div>\
    ';
  }

  function renderModalError(modalEl) {
    modalEl.innerHTML = '\
      <div style="background:#fff; width:100%; max-width:450px; border-radius:16px; padding:30px; text-align:center; position:relative; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">\
        <button onclick="document.getElementById(\'wedeazzy-quickview-modal\').style.display=\'none\'" style="position:absolute; top:12px; right:12px; width:30px; height:30px; border-radius:50%; border:none; background:#F1F5F9; color:#64748B; font-size:14px; font-weight:700; cursor:pointer;">✕</button>\
        <span style="font-size:40px; display:block; margin-bottom:12px;">⚠️</span>\
        <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin-bottom:6px;">Failed to Load</h3>\
        <p style="color:#64748B; font-size:13px; margin:0 0 16px 0; line-height:1.5;">Could not retrieve vendor profile. Please refresh or try again.</p>\
      </div>\
    ';
  }
})();
