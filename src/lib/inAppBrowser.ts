// Links shared in Messenger, Zalo, Facebook, Instagram, TikTok, … open inside
// that app's own web view, where the game works badly (no install, cramped,
// mic/voice and sign-in often blocked). We try to hand the link over to the
// phone's real browser instead:
// - Android: an `intent://` URL with no package, so Android opens it in the
//   user's default browser (Chrome, Samsung Internet, Firefox, …).
// - iPhone / iPad: `x-safari-https://` (iOS 17+) asks the app to open Safari.
// Where that is blocked, <OpenInBrowser /> shows how to do it by hand.

/** User agents of in-app browsers (web views inside chat / social apps). */
export const IN_APP_UA =
  /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Zalo|Line\/|MicroMessenger|TikTok|musical_ly|Bytedance|Twitter|Snapchat|LinkedInApp|KAKAOTALK|; wv\)/i;

export function isInAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  return IN_APP_UA.test(ua);
}

/** Query key that carries the #hash through an Android intent (which can't keep a fragment). */
const HASH_KEY = "_h";
/** Once per tab: if the hand-over failed, don't loop. */
const TRIED_KEY = "msn:openedInBrowser";

/**
 * Runs inline in <head> before the app loads:
 * 1. restores a #hash that came through an intent as `?_h=` (so #pw=… still works);
 * 2. inside an in-app browser, opens the same link in the real browser.
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
}else if(/iPhone|iPad|iPod/i.test(ua)&&location.protocol==="https:"){
location.href="x-safari-"+location.href;
}
}catch(e){}})();`;
