// Links shared in Messenger, Zalo, Facebook, Instagram, TikTok, … open inside
// that app's own web view, where the game works badly (no install, cramped,
// mic/voice and sign-in often blocked). We hand the link over to Chrome:
// - Android: an `intent://` URL aimed at Chrome. Without Chrome, the intent's
//   fallback reloads the page with `?_ib=1`, which then asks for whatever the
//   default browser is.
// - iPhone / iPad: `googlechromes://` right away. Many apps (Messenger, …)
//   only let a page open another app after a tap, so <OpenInBrowser /> also
//   opens Chrome on the first tap anywhere, and shows Safari / Chrome buttons
//   plus how to do it from the app's menu.

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

/** Links that open this page in Safari / Chrome on iOS. */
export function iosBrowserLinks(href: string) {
  const https = href.startsWith("https:");
  return {
    safari: `x-safari-${href}`,
    chrome: (https ? "googlechromes:" : "googlechrome:") + href.replace(/^https?:/, ""),
  };
}

/** Query key that carries the #hash through an Android intent (which can't keep a fragment). */
const HASH_KEY = "_h";
/** Query flag set by the Chrome intent's fallback: no Chrome, try the default browser. */
const ANY_KEY = "_ib";
/** Once per tab: if the hand-over failed, don't loop. */
const TRIED_KEY = "msn:openedInBrowser";

const k = JSON.stringify;

/**
 * Runs inline in <head> before the app loads:
 * 1. restores a #hash that came through an intent as `?_h=` (so #pw=… still works);
 * 2. inside an in-app browser, opens the same link in Chrome (Android falls
 *    back to the default browser when Chrome isn't installed).
 */
export const OPEN_IN_BROWSER_SCRIPT = `(function(){try{
var u=new URL(location.href),h=u.searchParams.get(${k(HASH_KEY)}),any=u.searchParams.get(${k(ANY_KEY)})!==null,hash=h?"#"+h:location.hash;
if(h!==null||any){u.searchParams.delete(${k(HASH_KEY)});u.searchParams.delete(${k(ANY_KEY)});history.replaceState(history.state,"",u.pathname+u.search+hash);}
var ua=navigator.userAgent||"",ios=/iPhone|iPad|iPod/i.test(ua);
var inApp=${IN_APP_UA.toString()}.test(ua)||(ios&&!/Safari\\//.test(ua)&&navigator.standalone!==true);
if(!inApp)return;
if(!any){try{if(sessionStorage.getItem(${k(TRIED_KEY)}))return;sessionStorage.setItem(${k(TRIED_KEY)},"1");}catch(e){}}
if(/Android/i.test(ua)){
var q=new URLSearchParams(u.search);if(hash.length>1)q.set(${k(HASH_KEY)},hash.slice(1));
var s=q.toString();
var intent="intent://"+u.host+u.pathname+(s?"?"+s:"")+"#Intent;scheme="+location.protocol.replace(":","")+";action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;";
if(any){location.href=intent+"end";return;}
var f=new URLSearchParams(u.search);f.set(${k(ANY_KEY)},"1");
var back=u.origin+u.pathname+"?"+f.toString()+hash;
location.href=intent+"package=com.android.chrome;S.browser_fallback_url="+encodeURIComponent(back)+";end";
}else if(ios){
location.href=(u.protocol==="https:"?"googlechromes:":"googlechrome:")+(u.href.split("#")[0]+hash).replace(/^https?:/,"");
}
}catch(e){}})();`;
