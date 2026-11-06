/*
 * Local replacement for the Tilda catalog API (store.tildaapi.com).
 * The original catalog was recovered from the Wayback Machine and lives in /assets/store/catalog.json.
 * The page's own Tilda catalog script keeps working unchanged: its XHR calls to
 * getfilters / getproductslist / getproduct are answered here, with filtering and paging.
 */
(function () {
  var RealXHR = window.XMLHttpRequest;
  var DATA = null, waiting = [];

  (function load() {
    var x = new RealXHR();
    x.open('GET', '/assets/store/catalog.json');
    x.onload = function () {
      try { DATA = JSON.parse(x.responseText); } catch (e) { DATA = { products: [], filters: { filters: [] }, parts: [] }; }
      waiting.splice(0).forEach(function (f) { f(); });
    };
    x.onerror = function () { DATA = { products: [], filters: { filters: [] }, parts: [] }; waiting.splice(0).forEach(function (f) { f(); }); };
    x.send();
  })();

  function norm(v) {
    return String(v).replace(/&amp;/g, '&').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function parseQuery(q) {
    var out = { filters: {} };
    (q || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('='), k, v;
      try { k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i)); v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1)); }
      catch (e) { return; }
      var m = k.match(/^filters\[([^\]]+)\](?:\[[^\]]*\])?$/);
      if (m) (out.filters[m[1]] = out.filters[m[1]] || []).push(v);
      else out[k] = v;
    });
    return out;
  }

  function matches(p, filters) {
    return Object.keys(filters).every(function (key) {
      var m = key.match(/^charact:(\d+)$/);
      if (!m) return true; // quantity, storepartuid, price etc. are not used by this catalog
      var wanted = [];
      filters[key].forEach(function (v) { String(v).split(':::').forEach(function (s) { if (s) wanted.push(norm(s)); }); });
      if (!wanted.length) return true;
      return (p.characteristics || []).some(function (c) {
        return String(c.charId) === m[1] && wanted.indexOf(norm(c.value)) > -1;
      });
    });
  }

  function respond(url) {
    var q = parseQuery(url.split('?')[1]);
    if (url.indexOf('/getfilters/') > -1) return JSON.stringify(DATA.filters);
    if (url.indexOf('/getproduct/') > -1) {
      var one = DATA.products.filter(function (p) { return String(p.uid) === String(q.productuid); })[0];
      return one ? JSON.stringify({ product: one }) : 'ERROR: Product not found';
    }
    if (url.indexOf('/getrelevantproducts/') > -1) return JSON.stringify({ relevants: [] });

    var list = DATA.products.filter(function (p) { return matches(p, q.filters); });
    var size = parseInt(q.size, 10) || 36, slice = parseInt(q.slice, 10) || 1;
    var page = list.slice((slice - 1) * size, slice * size);
    var res = {
      partuid: DATA.storepart, filter: 'y', filters: DATA.filters, total: list.length, isElastic: true,
      products: page, slice: slice, partlinks: [], parts: DATA.parts || [], options: []
    };
    if (slice * size < list.length) res.nextslice = slice + 1;
    return JSON.stringify(res);
  }

  function isCatalogCall(u) {
    return typeof u === 'string' && /tildaapi\.[a-z]+\/api\/(getfilters|getproductslist|getproduct|getrelevantproducts)\//.test(u);
  }

  function set(o, k, v) { Object.defineProperty(o, k, { value: v, configurable: true }); }

  class StoreXHR extends RealXHR {
    open(method, url) {
      if (isCatalogCall(url)) { this._storeUrl = url; this._aborted = false; return; }
      return super.open.apply(this, arguments);
    }
    setRequestHeader() { if (!this._storeUrl) return super.setRequestHeader.apply(this, arguments); }
    abort() { if (this._storeUrl) { this._aborted = true; return; } return super.abort(); }
    send(body) {
      if (!this._storeUrl) return super.send(body);
      var self = this;
      var run = function () {
        if (self._aborted) return;
        var text = respond(self._storeUrl);
        set(self, 'readyState', 4); set(self, 'status', 200); set(self, 'statusText', 'OK');
        set(self, 'responseText', text); set(self, 'response', text); set(self, 'responseURL', self._storeUrl);
        ['readystatechange', 'load', 'loadend'].forEach(function (t) { self.dispatchEvent(new Event(t)); });
      };
      setTimeout(function () { DATA ? run() : waiting.push(run); }, 0);
    }
  }
  window.XMLHttpRequest = StoreXHR;
})();
