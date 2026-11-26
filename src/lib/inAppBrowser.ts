// Links shared in Messenger, Zalo, Facebook, Instagram, TikTok, … open inside
// that app's own web view, where the game works badly (no install, cramped,
// mic/voice and sign-in often blocked). We try to hand the link over to the
// phone's real browser instead:
// - Android: an `intent://` URL with no package, so Android opens it in the
//   user's default browser (Chrome, Samsung Internet, Firefox, …).
// - iPhone / iPad: iOS lets no page leave an app's web view on its own, so
//   <OpenInBrowser /> shows buttons (a tap is needed) that open Safari
//   (`x-safari-https://`, iOS 17+) or Chrome (`googlechromes://`), plus how
//   to do it from the app's menu.

/** User agents of in-app browsers (web views inside chat / social apps). */
export const IN_APP_UA =
  /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Zalo|Line\/|MicroMessenger|TikTok|musical_ly|Bytedance|Twitter|Snapchat|LinkedInApp|KAKAOTALK|; wv\)/i;

export const isIos = (ua: string) => /iPhone|iPad|iPod/i.test(ua);

/**
 * In an app's web view? Known apps by name, plus any iPhone web view: Safari,
 * Chrome, Firefox and Edge on iOS all say "Safari/" in their user agent, a
 * plain web view doesn't. The installed home-screen app is left alone.
 */
export function isInAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  if (IN_APP_UA.test(ua)) return true;
  const standalone = typeof navigator !== "undefined" && (navigator as { standalone?: boolean }).standalone === true;
  return isIos(ua) && !/Safari\//.test(ua) && !standalone;
}

/** Links that open this page in Safari / Chrome on iOS (they need a tap). */
export function iosBrowserLinks(href: string) {
  const https = href.startsWith("https:");
  return {
    safari: `x-safari-${href}`,
    chrome: (https ? "googlechromes:" : "googlechrome:") + href.replace(/^https?:/, ""),
  };
}

/** Query key that carries the #hash through an Android intent (which can't keep a fragment). */
const HASH_KEY = "_h";
/** Once per tab: if the hand-over failed, don't loop. */
const TRIED_KEY = "msn:openedInBrowser";

/**
 * Runs inline in <head> before the app loads:
 * 1. restores a #hash that came through an intent as `?_h=` (so #pw=… still works);
 * 2. inside an Android in-app browser, opens the same link in the default browser.
 */
export const OPEN_IN_BROWSER_SCRIPT = `(function(){try{
var u=new URL(location.href),h=u.searchParams.get(${JSON.stringify(HASH_KEY)});
if(h!==null){u.searchParams.delete(${JSON.stringify(HASH_KEY)});history.replaceState(history.state,"",u.pathname+u.search+(h?"#"+h:""));}
var ua=navigator.userAgent||"";
if(!${IN_APP_UA.toString()}.test(ua))return;
try{if(sessionStorage.getItem(${JSON.stringify(TRIED_KEY)}))return;sessionStorage.setItem(${JSON.stringify(TRIED_KEY)},"1");}catch(e){}
if(/Android/i.test(ua)){
var q=new URLSearchParams(location.search);if(location.hash.length>1)q.set(${JSON.stringify(HASH_KEY)},location.hash.slice(1));
var s=q.toString();
location.href="intent://"+location.host+location.pathname+(s?"?"+s:"")+"#Intent;scheme="+location.protocol.replace(":","")+";action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
}
}catch(e){}})();`;
