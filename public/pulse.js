/**
 * Developster Pulse Client SDK (v1.0.0)
 * Native website visitor intelligence & behavioural tracking for Developster CRM.
 * Lightweight (~4.5KB), privacy-first, zero-fingerprinting, non-blocking.
 */
(function (window, document) {
  'use strict';

  if (window.DevelopsterPulse && window.DevelopsterPulse.__initialized) {
    return;
  }

  // Find script element and extract configuration
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var scriptSiteId = currentScript ? currentScript.getAttribute('data-site-id') : null;
  var scriptHost = currentScript ? currentScript.getAttribute('data-host') : null;

  // Auto-derive script host from script src URL if not explicitly provided
  if (!scriptHost && currentScript && currentScript.src) {
    try {
      var scriptUrl = new URL(currentScript.src, window.location.href);
      if (scriptUrl.origin && scriptUrl.origin !== window.location.origin) {
        scriptHost = scriptUrl.origin;
      }
    } catch (e) {}
  }

  var config = window.DevelopsterPulseConfig || {};
  var siteId = config.siteId || scriptSiteId || '';
  var endpoint = config.endpoint || (scriptHost ? scriptHost + '/api/pulse/v1/track' : '/api/pulse/v1/track');
  var sessionTimeoutMs = (config.sessionTimeoutMinutes || 30) * 60 * 1000;

  var STORAGE_KEY_VISITOR = '_dp_vis_id';
  var STORAGE_KEY_SESSION = '_dp_ses_id';
  var STORAGE_KEY_SESSION_TIME = '_dp_ses_time';
  var STORAGE_KEY_IDENTITIES = '_dp_ident';

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVisitorId() {
    var visId = null;
    try {
      visId = localStorage.getItem(STORAGE_KEY_VISITOR);
      if (!visId) {
        visId = 'vis_' + generateUUID();
        localStorage.setItem(STORAGE_KEY_VISITOR, visId);
      }
    } catch (e) {
      visId = 'vis_temp_' + generateUUID();
    }
    return visId;
  }

  function getSessionId() {
    var now = Date.now();
    var sesId = null;
    var lastActive = null;

    try {
      sesId = sessionStorage.getItem(STORAGE_KEY_SESSION);
      lastActive = parseInt(sessionStorage.getItem(STORAGE_KEY_SESSION_TIME) || '0', 10);

      if (!sesId || !lastActive || now - lastActive > sessionTimeoutMs) {
        sesId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        sessionStorage.setItem(STORAGE_KEY_SESSION, sesId);
      }
      sessionStorage.setItem(STORAGE_KEY_SESSION_TIME, String(now));
    } catch (e) {
      sesId = 'ses_temp_' + Date.now();
    }
    return sesId;
  }

  function getStoredIdentities() {
    try {
      var val = localStorage.getItem(STORAGE_KEY_IDENTITIES);
      return val ? JSON.parse(val) : {};
    } catch (e) {
      return {};
    }
  }

  function saveStoredIdentities(ident) {
    try {
      var existing = getStoredIdentities();
      var merged = Object.assign({}, existing, ident);
      localStorage.setItem(STORAGE_KEY_IDENTITIES, JSON.stringify(merged));
      return merged;
    } catch (e) {
      return ident;
    }
  }

  function extractAndStitchUrlIdentities() {
    try {
      var search = window.location.search.substring(1);
      if (!search) return;
      var pairs = search.split('&');
      var idents = {};
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        var key = decodeURIComponent(pair[0]);
        var val = decodeURIComponent(pair[1] || '').trim();
        if (!val) continue;
        if (key === 'pulse_lid' || key === 'cid' || key === 'lead_id' || key === 'leadId') {
          idents.leadId = val;
          idents.customerId = val;
        } else if (key === 'pulse_email' || key === 'email') {
          idents.email = val;
        }
      }
      if (Object.keys(idents).length > 0) {
        saveStoredIdentities(idents);
      }
    } catch (e) {}
  }

  // Auto-stitch identities from query parameters immediately on execution
  extractAndStitchUrlIdentities();

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  function getUtmParams() {
    var params = {};
    try {
      var search = window.location.search.substring(1);
      if (!search) return params;
      var pairs = search.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        var key = decodeURIComponent(pair[0]);
        var val = decodeURIComponent(pair[1] || '');
        if (key.indexOf('utm_') === 0) {
          var utmKey = key.replace('utm_', '');
          params[utmKey] = val;
        }
      }
    } catch (e) {}
    return params;
  }

  function sendEvent(type, name, data, identities) {
    if (!siteId) {
      console.warn('[Developster Pulse] Missing siteId. Event ignored:', type);
      return;
    }

    var visId = getVisitorId();
    var sesId = getSessionId();
    var idents = Object.assign({}, getStoredIdentities(), identities || {});

    var payload = {
      siteId: siteId,
      visitorId: visId,
      sessionId: sesId,
      type: type,
      name: name,
      source: 'sdk',
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer || '',
      utm: getUtmParams(),
      device: {
        type: getDeviceType(),
      },
      customerId: (idents && (idents.customerId || idents.leadId)) ? (idents.customerId || idents.leadId) : undefined,
      leadId: (idents && idents.leadId) ? idents.leadId : undefined,
      properties: data && data.properties ? data.properties : (data || {}),
      ecommerce: data && data.ecommerce ? data.ecommerce : undefined,
      identities: Object.keys(idents).length > 0 ? idents : undefined,
      timestamp: new Date().toISOString(),
    };

    var jsonStr = JSON.stringify(payload);

    // Prefer navigator.sendBeacon for reliable async transmission
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var sent = navigator.sendBeacon(endpoint, blob);
        if (sent) return;
      } catch (err) {}
    }

    // Fallback to fetch keepalive
    if (typeof fetch === 'function') {
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonStr,
          keepalive: true,
        }).catch(function () {});
      } catch (err) {}
    }
  }

  var Pulse = {
    __initialized: true,

    init: function (options) {
      if (options.siteId) siteId = options.siteId;
      if (options.endpoint) endpoint = options.endpoint;
    },

    pageView: function (properties) {
      sendEvent('page_view', 'Page View', { properties: properties || {} });
    },

    viewProduct: function (product) {
      sendEvent('product_viewed', 'View Product: ' + (product.name || product.id), {
        ecommerce: {
          items: [product],
        },
      });
    },

    addToCart: function (item) {
      sendEvent('item_added_to_cart', 'Added to Cart: ' + (item.name || item.id), {
        ecommerce: {
          items: [item],
          total: (item.price || 0) * (item.quantity || 1),
        },
      });
    },

    removeFromCart: function (item) {
      sendEvent('item_removed_from_cart', 'Removed from Cart: ' + (item.name || item.id), {
        ecommerce: {
          items: [item],
        },
      });
    },

    startCheckout: function (checkout) {
      sendEvent('checkout_started', 'Checkout Started', {
        ecommerce: {
          orderId: checkout.orderId,
          total: checkout.total || 0,
          currency: checkout.currency || 'INR',
          items: checkout.items || [],
        },
      });
    },

    completePurchase: function (order) {
      sendEvent('purchase_completed', 'Purchase Completed #' + (order.orderId || ''), {
        ecommerce: {
          orderId: order.orderId,
          total: order.total || 0,
          currency: order.currency || 'INR',
          items: order.items || [],
        },
      });
    },

    submitForm: function (formDetails) {
      var idents = {};
      if (formDetails.email) idents.email = formDetails.email;
      if (formDetails.phone) idents.phone = formDetails.phone;
      if (formDetails.name) idents.name = formDetails.name;
      if (Object.keys(idents).length > 0) {
        saveStoredIdentities(idents);
      }

      sendEvent(
        'form_submitted',
        'Form Submitted: ' + (formDetails.formName || 'General Form'),
        {
          properties: formDetails.properties || formDetails,
        },
        idents
      );
    },

    identify: function (identity) {
      if (!identity) return;
      var saved = saveStoredIdentities(identity);
      sendEvent(
        'account_registered',
        'User Identified',
        { properties: { method: 'explicit_identify' } },
        saved
      );
    },

    custom: function (name, properties) {
      sendEvent('custom_event', name, { properties: properties || {} });
    },
  };

  window.DevelopsterPulse = Pulse;

  // Process any queued commands
  if (window.pulse && Array.isArray(window.pulse.q)) {
    var queue = window.pulse.q;
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      var method = item[0];
      var args = item.slice(1);
      if (typeof Pulse[method] === 'function') {
        Pulse[method].apply(Pulse, args);
      }
    }
  }

  // Auto-track page view if not disabled
  if (config.autoPageView !== false) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      Pulse.pageView();
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        Pulse.pageView();
      });
    }
  }
})(window, document);

