// Content script - runs on all pages
// This script can be used for additional page-level functionality if needed

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pageRefreshed') {
    console.log('Page has been refreshed by the extension');
    sendResponse({ success: true });
  }
});

// Optional: Log when the script loads
console.log('Hourly Refresh & Cookie Extractor content script loaded');