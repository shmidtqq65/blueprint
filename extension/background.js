// BLUEPRINT extension: inject the engine into the current tab on click (or Alt+Shift+P).
// Running it a second time on the same tab scans the original page back in.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id === undefined) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['blueprint.js'], world: 'MAIN' });
  } catch (err) {
    // chrome:// pages, the Web Store and the PDF viewer can't be scripted
    console.warn('BLUEPRINT cannot run on this page:', err && err.message);
    chrome.action.setBadgeBackgroundColor({ color: '#1b4b8f', tabId: tab.id });
    chrome.action.setBadgeText({ text: '×', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2500);
  }
});
