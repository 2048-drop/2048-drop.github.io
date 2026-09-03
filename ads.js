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

   5. There is deliberately NO ad slot inside the rewarded dialog. A rewarded
      ad is rendered by the H5 Games Ads SDK itself, full screen - adBreak()
      takes over the display, so there is nothing to place. Putting a standard
      display unit behind a "watch this to get a reward" prompt would be
      incentivised engagement with a non-rewarded unit, which is the exact
      violation rule 1 describes. If no rewarded provider is available we do
      not show an ad-shaped dialog at all; see rewardKind() below.
   ===================================================================== */

const ADS = {
  /* --- fill these in after AdSense approves you --- */
  client: 'ca-pub-5623328978041556',                    // 'ca-pub-1234567890123456'
  slots: {
    rail:    '',                 // '1234567890'  300x600 beside the game
    article: '',                 //               in-content rectangle
    bottom:  ''                  //               leaderboard under the page
  },

  /* Apply for H5 Games Ads inside AdSense, then flip this on. It enables
     the rewarded video used by Second Chance and the power-up refill. */
  h5GamesAds: true,

  /* Testing knobs — turn both off in production. */
  testMode: false,                // adds data-adbreak-test=on
  showPlaceholders: true,        // dashed boxes, only while no client is set
  rewardsWithoutAds: false        // no rewarded provider yet? grant the bonus
                                 // outright rather than fake an ad
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
    window.adsbygoogle = window.adsbygoogle || [];
    if (document.querySelector('script[src*="adsbygoogle.js"]')){
      // Already loaded from the page <head> (the snippet AdSense gives you).
      if (ADS.h5GamesAds && !window.adBreak){
        window.adBreak = window.adConfig = function(o){ window.adsbygoogle.push(o); };
        window.adConfig({ preloadAdBreaks:'on', sound:'on' });
      }
      return;
    }
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

      } else if (ADS.showPlaceholders && !live){
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
  /* Three possible states, and the UI must not lie about which one it is in:
       'video'  - a real rewarded ad will play, so ad wording is honest
       'direct' - no rewarded provider; grant the bonus with NO ad framing
                  rather than showing a fake "sponsor message"
       'none'   - rewards disabled entirely                                */
  function rewardKind(){
    if (ADS.h5GamesAds && typeof window.adBreak === 'function') return 'video';
    if (ADS.rewardsWithoutAds) return 'direct';
    return 'none';
  }

  function showRewarded(opts){
    if (rewardBusy) return;
    const kind = rewardKind();
    if (kind === 'none'){ if (opts.onSkip) opts.onSkip(); return; }
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

    /* No rewarded inventory: just give the bonus. No countdown, no spinner,
       no "sponsor message" - nothing that implies an ad the player is not
       actually being shown. */
    if (kind === 'direct'){ done(true); return; }

    openShell(opts, 'Loading ad\u2026');
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
  }

  /* ------------------------------------------------------------------
     Interstitial (H5 Games Ads type:'next')
     ------------------------------------------------------------------
     Unlike a rewarded ad this is NOT opt-in - it plays on the transition
     between games. That is the placement the format is designed for. Rules
     this respects: only at a genuine break (never mid-run), the game always
     continues afterwards, and audio is muted while it plays.

     adBreak() is a REQUEST, not a guarantee: Google applies its own frequency
     capping and fill logic, so done() must run whether an ad showed or not,
     otherwise the player is stranded on a dead screen.
     ------------------------------------------------------------------ */
  function interstitialAvailable(){
    return Boolean(ADS.h5GamesAds && typeof window.adBreak === 'function');
  }

  function showInterstitial(opts){
    const done = opts.done || function(){};
    if (!interstitialAvailable() || rewardBusy){ done(); return; }

    let settled = false;
    function finish(){
      if (settled) return;
      settled = true;
      if (opts.afterAd) opts.afterAd();
      done();
    }
    try {
      window.adBreak({
        type: 'next',
        name: opts.name || 'next-game',
        beforeAd: function(){ if (opts.beforeAd) opts.beforeAd(); },
        afterAd:  finish,
        adBreakDone: function(){ finish(); }
      });
    } catch (e) { finish(); return; }
    // If the SDK never calls back, never leave the player stuck.
    setTimeout(finish, 10000);
  }

  let shellEl = null;
  function openShell(opts, statusText){
    closeShell();
    shellEl = document.createElement('div');
    shellEl.className = 'modal';
    shellEl.innerHTML =
      '<div class="modal-card">' +
        '<h2>' + esc(opts.title || 'Reward') + '</h2>' +
        '<p class="sub">A short ad is loading. You will receive ' + esc(opts.reward || 'your reward') + ' once it finishes.</p>' +
        '<div class="reward-box">' +
          '<div class="ring">\u25B6</div>' +
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
    showInterstitial: showInterstitial,
    interstitialAvailable: interstitialAvailable,
    available: function(){ return rewardKind() !== 'none'; },
    rewardKind: rewardKind,
    resetConsent: function(){
      try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
      location.reload();
    }
  };
})();

document.addEventListener('DOMContentLoaded', Ads.init);
