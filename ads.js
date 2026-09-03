/* =====================================================================
   2048 Drop — advertising, consent, and rewarded video
   ---------------------------------------------------------------------
   POLICY NOTES — read before changing anything in this file.

   1. NEVER reward a player for CLICKING an ad. Incentivised clicks are
      invalid traffic under the AdSense programme policies and are grounds
      for permanent, non-appealable account termination. There is no
      "small amount" of this that is safe.

   2. Rewarding a player for WATCHING a rewarded video IS allowed, but only
      through a rewarded ad product: Google H5 Games Ads (web) or AdMob
      (apps). That is what showRewarded() below uses. A standard display
      unit can never be used this way.

   3. Display ads must sit at least 150px away from interactive game
      elements so a player cannot hit one by accident. That gap is enforced
      structurally by the .ad-safe elements in the markup, not by eyeballing
      the layout. Do not remove them.

   4. Never write "click our ads", "support us by clicking", or anything
      that draws attention to the ads as ads.
   ===================================================================== */

const ADS = {
  /* --- fill these in after AdSense approves you --- */
  client: '',                    // 'ca-pub-1234567890123456'
  slots: {
    rail:    '',                 // '1234567890'  300x600 beside the game
    article: '',                 //               in-content rectangle
    bottom:  ''                  //               leaderboard under the page
  },

  /* Apply for H5 Games Ads inside AdSense, then flip this on. It enables
     the rewarded video used by Second Chance and the power-up refill. */
  h5GamesAds: false,

  /* Testing knobs — turn both off in production. */
  testMode: true,                // adds data-adbreak-test=on
  showPlaceholders: true,        // dashed boxes so the layout is visible
  simulateRewards: true          // fake a 5s rewarded video pre-approval
};

const Ads = (function(){
  const CONSENT_KEY = 'drop2048.consent';
  let consent = null;
  let rewardBusy = false;

  /* ------------------------------------------------------------------
     Consent
     ------------------------------------------------------------------
     This banner covers the plain-language disclosure. For EEA/UK/Swiss
     traffic Google additionally requires a CERTIFIED CMP — use the free
     one built into AdSense (Privacy & messaging -> European regulations),
     which will overlay this. See README.
     ------------------------------------------------------------------ */
  function readConsent(){
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function writeConsent(v){
    consent = v;
    try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {}
  }

  function mountConsent(){
    consent = readConsent();
    if (consent) return;
    const bar = document.createElement('div');
    bar.id = 'consent';
    bar.innerHTML =
      '<p>This site uses cookies and local storage to keep your scores and to show ads. ' +
      'You can choose non-personalised ads instead. ' +
      '<a href="privacy.html">Privacy Policy</a></p>' +
      '<div class="acts">' +
        '<button class="btn ghost sm" data-c="limited">Non-personalised</button>' +
        '<button class="btn sm" data-c="all">Accept all</button>' +
      '</div>';
    document.body.appendChild(bar);

    // The banner is fixed to the bottom, so without this it sits on top of the
    // footer — and the footer is where the Privacy Policy link lives.
    function pad(){ document.body.style.paddingBottom = (bar.offsetHeight + 16) + 'px'; }
    pad();
    window.addEventListener('resize', pad);

    bar.addEventListener('click', function(e){
      const b = e.target.closest('[data-c]');
      if (!b) return;
      writeConsent(b.dataset.c);
      window.removeEventListener('resize', pad);
      document.body.style.paddingBottom = '';
      bar.remove();
      mountDisplayAds();
    });
  }

  /* ------------------------------------------------------------------
     Display units
     ------------------------------------------------------------------ */
  const UNITS = [
    { el:'ad-rail',    slot:function(){return ADS.slots.rail;},    format:'vertical'   },
    { el:'ad-article', slot:function(){return ADS.slots.article;}, format:'rectangle'  },
    { el:'ad-bottom',  slot:function(){return ADS.slots.bottom;},  format:'horizontal' }
  ];

  let scriptLoaded = false;
  function loadScript(){
    if (scriptLoaded || !ADS.client) return;
    scriptLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADS.client;
    s.crossOrigin = 'anonymous';
    if (ADS.h5GamesAds && ADS.testMode) s.setAttribute('data-adbreak-test', 'on');
    document.head.appendChild(s);

    window.adsbygoogle = window.adsbygoogle || [];
    if (ADS.h5GamesAds){
      // The H5 Games Ads API is opted into by defining these two shims.
      window.adBreak = window.adConfig = function(o){ window.adsbygoogle.push(o); };
      window.adConfig({ preloadAdBreaks:'on', sound:'on' });
    }
  }

  function mountDisplayAds(){
    const live = Boolean(ADS.client);
    if (live) loadScript();

    UNITS.forEach(function(u){
      const host = document.getElementById(u.el);
      if (!host || host.dataset.filled) return;
      const slot = u.slot();

      if (live && slot){
        host.dataset.filled = '1';
        const lab = document.createElement('div');
        lab.className = 'ad-label';
        lab.textContent = 'Advertisement';   // required labelling, neutral wording
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.style.width = '100%';
        ins.setAttribute('data-ad-client', ADS.client);
        ins.setAttribute('data-ad-slot', slot);
        ins.setAttribute('data-ad-format', u.format);
        ins.setAttribute('data-full-width-responsive', 'true');
        host.appendChild(lab);
        host.appendChild(ins);

        window.adsbygoogle = window.adsbygoogle || [];
        if (consent === 'limited') window.adsbygoogle.requestNonPersonalizedAds = 1;
        window.adsbygoogle.push({});

      } else if (ADS.showPlaceholders){
        host.dataset.filled = '1';
        const ph = document.createElement('div');
        ph.className = 'ad-ph';
        ph.innerHTML = 'Ad space<small>configure ADS.client in ads.js</small>';
        host.appendChild(ph);

      } else {
        host.style.display = 'none';
      }
    });
  }

  /* ------------------------------------------------------------------
     Rewarded video
     ------------------------------------------------------------------
     showRewarded({ name, title, reward, onReward, onSkip })

     The player must opt in by pressing a button — a rewarded ad may never
     auto-play. They are told exactly what they get and that it is an ad.
     The reward is granted on adViewed (a completed VIEW). Nothing here
     ever depends on a click.
     ------------------------------------------------------------------ */
  function showRewarded(opts){
    if (rewardBusy) return;
    rewardBusy = true;

    let settled = false;
    function done(granted){
      if (settled) return;
      settled = true;
      rewardBusy = false;
      closeShell();
      if (granted) { if (opts.onReward) opts.onReward(); }
      else { if (opts.onSkip) opts.onSkip(); }
    }

    /* Real H5 Games Ads path */
    if (ADS.h5GamesAds && typeof window.adBreak === 'function'){
      openShell(opts, 'Loading sponsor message…');
      window.adBreak({
        type: 'reward',
        name: opts.name,
        beforeReward: function(showAdFn){ showAdFn(); },
        adViewed:    function(){ done(true); },
        adDismissed: function(){ done(false); },
        adBreakDone: function(info){
          if (!settled) done(info && info.breakStatus === 'viewed');
        }
      });
      // If the SDK never calls back (blocker, no fill), do not hang the game.
      setTimeout(function(){ if (!settled) done(false); }, 12000);
      return;
    }

    /* Pre-approval fallback: a visible placeholder so the flow is testable
       and the game stays fully playable without any ad network. */
    if (ADS.simulateRewards){
      let left = 5;
      const shell = openShell(opts, 'Sponsor message · ' + left + 's');
      const timer = setInterval(function(){
        left--;
        const t = shell.querySelector('[data-count]');
        if (t) t.textContent = 'Sponsor message · ' + left + 's';
        const ring = shell.querySelector('.ring');
        if (ring) ring.textContent = left;
        if (left <= 0){ clearInterval(timer); done(true); }
      }, 1000);
      shell.addEventListener('click', function(e){
        if (e.target.closest('[data-skip]')){ clearInterval(timer); done(false); }
      });
      return;
    }

    done(false);
  }

  let shellEl = null;
  function openShell(opts, statusText){
    closeShell();
    shellEl = document.createElement('div');
    shellEl.className = 'modal';
    shellEl.innerHTML =
      '<div class="modal-card">' +
        '<h2>' + esc(opts.title || 'Reward') + '</h2>' +
        '<p class="sub">Watch a short ad to receive ' + esc(opts.reward || 'your reward') + '.</p>' +
        '<div class="reward-box">' +
          '<div class="ring">5</div>' +
          '<div data-count>' + esc(statusText) + '</div>' +
        '</div>' +
        '<div class="modal-foot"><button class="btn ghost sm" data-skip>No thanks</button></div>' +
      '</div>';
    document.body.appendChild(shellEl);
    return shellEl;
  }
  function closeShell(){
    if (shellEl && shellEl.parentNode) shellEl.parentNode.removeChild(shellEl);
    shellEl = null;
  }
  function esc(s){
    return String(s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }

  /* ------------------------------------------------------------------ */
  function init(){
    mountConsent();
    if (consent || !ADS.client) mountDisplayAds();
  }

  return {
    init: init,
    showRewarded: showRewarded,
    available: function(){
      return (ADS.h5GamesAds && typeof window.adBreak === 'function') || ADS.simulateRewards;
    },
    resetConsent: function(){
      try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
      location.reload();
    }
  };
})();

document.addEventListener('DOMContentLoaded', Ads.init);
