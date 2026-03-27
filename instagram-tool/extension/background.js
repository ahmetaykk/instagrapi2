// background service worker — bfcache port hatalarını sessizce yakala
chrome.runtime.onMessage.addListener(() => {
  // intentionally empty — prevents unchecked runtime.lastError
});
