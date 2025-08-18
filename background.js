// Background service worker for the Chrome extension

let isRunning = false;
let authToken = null;

// HARDCODED GOOGLE SHEET ID - Replace with your sheet ID
const SPREADSHEET_ID = '1xN9dFaZ6fltE9XfP1wl6WPbW5sbOq3jZENSoYdEjsKE'; // Replace this with your actual sheet ID

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Hourly Refresh & Cookie Extractor installed');

  // Set default state
  chrome.storage.local.set({
    isRunning: false,
    lastRefresh: null,
    authToken: null,
    totalRows: 0,
  });
});

// Google Sheets API integration
class GoogleSheetsAPI {
  constructor() {
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  }

  async authenticate() {
    try {
      console.log('Starting authentication...');

      // Clear any existing token first
      authToken = null;
      await chrome.storage.local.set({ authToken: null });

      // Get fresh token with explicit scopes
      const response = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      console.log('Raw token response:', response);
      console.log('Response type:', typeof response);

      // Extract the actual token from the response
      let token;
      if (typeof response === 'object' && response.token) {
        // New format: {token: "...", grantedScopes: [...]}
        token = response.token;
        console.log('Extracted token from object format');
        console.log('Granted scopes:', response.grantedScopes);
      } else if (typeof response === 'string') {
        // Old format: just the token string
        token = response;
        console.log('Using direct string token');
      } else {
        throw new Error('Unexpected token response format');
      }

      console.log('Final token type:', typeof token);
      console.log('Token received:', !!token);
      console.log('Token length:', token ? token.length : 'N/A');
      console.log(
        'Token starts with:',
        token ? token.substring(0, 10) : 'N/A'
      );

      if (!token || typeof token !== 'string' || token.length === 0) {
        throw new Error(
          'Invalid token received from Chrome identity API'
        );
      }

      authToken = token;
      await chrome.storage.local.set({ authToken: token });

      console.log('Token stored successfully');
      return token;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  async createSpreadsheet() {
    // Not used anymore - using hardcoded sheet ID
    throw new Error(
      'Sheet creation disabled - using hardcoded sheet ID'
    );
  }

  async testSheetAccess() {
    if (!authToken) {
      throw new Error('Not authenticated - no auth token');
    }

    try {
      console.log(`Testing access to sheet: ${SPREADSHEET_ID}`);
      console.log(
        `Using auth token: ${authToken.substring(0, 20)}...`
      );

      // Try to get basic sheet info
      const response = await fetch(
        `${this.baseUrl}/${SPREADSHEET_ID}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`Test response status: ${response.status}`);
      console.log(`Response headers:`, [
        ...response.headers.entries(),
      ]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Sheet access test failed: ${errorText}`);

        // If 401, try to refresh the token and retry
        if (response.status === 401) {
          console.log(
            '🧪 TEST SHEET: 401 error detected - triggering token refresh...'
          );
          await this.refreshToken();

          console.log(
            '🧪 TEST SHEET: Retrying test with refreshed token...'
          );
          // Retry the test with the new token
          return await this.testSheetAccess();
        }

        throw new Error(
          `Cannot access sheet. Status: ${response.status}, Error: ${errorText}`
        );
      }

      const result = await response.json();
      console.log(`Sheet found: ${result.properties.title}`);
      return result;
    } catch (error) {
      console.error('Error testing sheet access:', error);
      throw error;
    }
  }

  async refreshToken() {
    console.log(
      '🔄 TOKEN REFRESH: Starting token refresh attempt...'
    );
    console.log(
      `🔄 TOKEN REFRESH: Current token exists: ${!!authToken}`
    );
    console.log(
      `🔄 TOKEN REFRESH: Current token length: ${
        authToken ? authToken.length : 'N/A'
      }`
    );

    try {
      // Remove cached token
      if (authToken) {
        console.log('🔄 TOKEN REFRESH: Removing cached token...');
        await chrome.identity.removeCachedAuthToken({
          token: authToken,
        });
        authToken = null;
        console.log(
          '🔄 TOKEN REFRESH: Cached token removed successfully'
        );
      }

      console.log(
        '🔄 TOKEN REFRESH: Attempting non-interactive token refresh...'
      );

      // Get new token (non-interactive for automatic refresh)
      const response = await chrome.identity.getAuthToken({
        interactive: false,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      console.log(
        '🔄 TOKEN REFRESH: Non-interactive response received'
      );
      console.log(
        `🔄 TOKEN REFRESH: Response type: ${typeof response}`
      );

      // Extract token from response (handle both object and string formats)
      let newToken;
      if (typeof response === 'object' && response.token) {
        newToken = response.token;
        console.log(
          '🔄 TOKEN REFRESH: Token extracted from object format'
        );
        console.log(
          `🔄 TOKEN REFRESH: Granted scopes: ${JSON.stringify(
            response.grantedScopes
          )}`
        );
      } else if (typeof response === 'string') {
        newToken = response;
        console.log(
          '🔄 TOKEN REFRESH: Token extracted from string format'
        );
      } else {
        console.error(
          '🔄 TOKEN REFRESH: Failed to extract token from response'
        );
        throw new Error('Failed to get refresh token');
      }

      if (newToken && newToken.length > 0) {
        authToken = newToken;
        await chrome.storage.local.set({ authToken: newToken });
        console.log(
          '✅ TOKEN REFRESH: Non-interactive refresh SUCCESSFUL'
        );
        console.log(
          `✅ TOKEN REFRESH: New token length: ${newToken.length}`
        );
        console.log(
          `✅ TOKEN REFRESH: New token starts with: ${newToken.substring(
            0,
            10
          )}...`
        );
        return newToken;
      } else {
        console.error(
          '❌ TOKEN REFRESH: Empty token received during non-interactive refresh'
        );
        throw new Error('Empty token received during refresh');
      }
    } catch (error) {
      console.error(
        '❌ TOKEN REFRESH: Non-interactive refresh failed:',
        error.message
      );
      console.log(
        '🔄 TOKEN REFRESH: Attempting interactive fallback...'
      );

      // If non-interactive refresh fails, try interactive as fallback
      try {
        const interactiveResponse =
          await chrome.identity.getAuthToken({
            interactive: true,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });

        console.log(
          '🔄 TOKEN REFRESH: Interactive response received'
        );
        console.log(
          `🔄 TOKEN REFRESH: Interactive response type: ${typeof interactiveResponse}`
        );

        let interactiveToken;
        if (
          typeof interactiveResponse === 'object' &&
          interactiveResponse.token
        ) {
          interactiveToken = interactiveResponse.token;
          console.log(
            '🔄 TOKEN REFRESH: Interactive token extracted from object format'
          );
        } else if (typeof interactiveResponse === 'string') {
          interactiveToken = interactiveResponse;
          console.log(
            '🔄 TOKEN REFRESH: Interactive token extracted from string format'
          );
        }

        if (interactiveToken) {
          authToken = interactiveToken;
          await chrome.storage.local.set({
            authToken: interactiveToken,
          });
          console.log(
            '✅ TOKEN REFRESH: Interactive refresh SUCCESSFUL'
          );
          console.log(
            `✅ TOKEN REFRESH: Interactive token length: ${interactiveToken.length}`
          );
          console.log(
            `✅ TOKEN REFRESH: Interactive token starts with: ${interactiveToken.substring(
              0,
              10
            )}...`
          );
          return interactiveToken;
        } else {
          console.error(
            '❌ TOKEN REFRESH: Empty token received during interactive refresh'
          );
        }
      } catch (interactiveError) {
        console.error(
          '❌ TOKEN REFRESH: Interactive refresh also failed:',
          interactiveError.message
        );
      }

      console.error('❌ TOKEN REFRESH: All refresh attempts FAILED');
      throw new Error(
        'Token refresh failed - user may need to re-authenticate'
      );
    }
  }

  async addHeaders() {
    const headers = ['Timestamp', 'URL', 'Cookies JSON'];

    const values = [headers];

    try {
      const range = 'Sheet1!A1:C1'; // Headers in row 1, columns A through C
      const response = await fetch(
        `${this.baseUrl}/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: values,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error adding headers: ${errorText}`);

        // If 401, try to refresh the token and retry
        if (response.status === 401) {
          console.log(
            '📋 ADD HEADERS: 401 error detected - triggering token refresh...'
          );
          await this.refreshToken();

          console.log(
            '📋 ADD HEADERS: Retrying add headers with refreshed token...'
          );
          // Retry adding headers with the new token
          return await this.addHeaders();
        }

        throw new Error(`Failed to add headers: ${response.status}`);
      }

      console.log('Headers added to sheet');
    } catch (error) {
      console.error('Error adding headers:', error);
      throw error;
    }
  }

  async appendCookieData(cookieData) {
    if (!authToken) {
      throw new Error('Not authenticated');
    }

    console.log(`Attempting to write to sheet: ${SPREADSHEET_ID}`);
    console.log(`Auth token exists: ${!!authToken}`);

    // Create a single row with timestamp, URL, and JSON array of all cookies
    const timestamp = cookieData.timestamp;
    const url = cookieData.url;

    // Convert cookies to JSON string
    const cookiesJson = JSON.stringify(cookieData.cookies, null, 2);

    console.log(
      `Found ${cookieData.cookies.length} cookies to write as JSON`
    );
    console.log(`JSON length: ${cookiesJson.length} characters`);

    // Create single row: [Timestamp, URL, Cookies JSON]
    const rows = [[timestamp, url, cookiesJson]];

    // Correct Google Sheets API append endpoint format
    const range = 'Sheet1!A:C'; // Specify the sheet and range (A through C for our 3 columns)
    const apiUrl = `${this.baseUrl}/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW`;
    console.log(`API URL: ${apiUrl}`);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows,
        }),
      });

      console.log(`Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error Response: ${errorText}`);

        // If 401, try to refresh the token and retry
        if (response.status === 401) {
          console.log(
            '📝 APPEND COOKIES: 401 error detected - triggering token refresh...'
          );
          await this.refreshToken();

          console.log(
            '📝 APPEND COOKIES: Retrying append operation with refreshed token...'
          );
          // Retry the request with the new token
          return await this.appendCookieData(cookieData);
        }

        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const result = await response.json();
      console.log(
        `Successfully wrote 1 row with ${cookieData.cookies.length} cookies as JSON to Google Sheets`
      );

      // Update total rows count (now counting sessions, not individual cookies)
      const storage = await chrome.storage.local.get(['totalRows']);
      const newTotal = (storage.totalRows || 0) + 1;
      await chrome.storage.local.set({ totalRows: newTotal });

      return result;
    } catch (error) {
      console.error('Error writing to Google Sheets:', error);
      throw error;
    }
  }

  async getSpreadsheetUrl() {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
  }
}

const sheetsAPI = new GoogleSheetsAPI();

// Start the hourly refresh cycle
function startHourlyRefresh() {
  if (isRunning) return;

  isRunning = true;
  console.log('Starting hourly refresh cycle');

  // Create an alarm that fires every hour
  chrome.alarms.create('hourlyRefresh', {
    delayInMinutes: 60,
    periodInMinutes: 60,
  });

  // Save state
  chrome.storage.local.set({ isRunning: true });
}

// Stop the hourly refresh cycle
function stopHourlyRefresh() {
  isRunning = false;
  console.log('Stopping hourly refresh cycle');

  // Clear the alarm
  chrome.alarms.clear('hourlyRefresh');

  // Save state
  chrome.storage.local.set({ isRunning: false });
}

// Handle alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'hourlyRefresh') {
    await refreshActiveTabAndExtractCookies();
  }
});

// Main function to refresh tab and extract cookies
async function refreshActiveTabAndExtractCookies() {
  try {
    // Proactively refresh the token before each operation to prevent expiration
    console.log(
      '⏰ HOURLY OPERATION: Starting hourly refresh and cookie extraction...'
    );
    console.log(
      '⏰ HOURLY OPERATION: Proactively refreshing token before operation...'
    );

    try {
      await sheetsAPI.refreshToken();
      console.log(
        '✅ HOURLY OPERATION: Proactive token refresh completed successfully'
      );
    } catch (refreshError) {
      console.error(
        '❌ HOURLY OPERATION: Proactive token refresh failed, continuing with existing token:',
        refreshError.message
      );
    }

    // Get the active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab) {
      console.log('❌ HOURLY OPERATION: No active tab found');
      return;
    }

    console.log(
      `⏰ HOURLY OPERATION: Refreshing tab: ${activeTab.url}`
    );

    // Refresh the active tab
    await chrome.tabs.reload(activeTab.id);

    // Wait for the page to load before extracting cookies
    setTimeout(async () => {
      console.log(
        '⏰ HOURLY OPERATION: Page loaded, extracting cookies...'
      );
      await extractCookiesAndWriteToSheets(activeTab.url);
    }, 3000); // Wait 3 seconds for page to load

    // Update last refresh time
    chrome.storage.local.set({
      lastRefresh: new Date().toISOString(),
    });

    console.log(
      '✅ HOURLY OPERATION: Hourly operation completed successfully'
    );
  } catch (error) {
    console.error(
      '❌ HOURLY OPERATION: Error during hourly operation:',
      error
    );
  }
}

// Extract cookies and write to Google Sheets
async function extractCookiesAndWriteToSheets(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Get all cookies for this domain
    const cookies = await chrome.cookies.getAll({
      domain: domain,
    });

    console.log(`Found ${cookies.length} cookies for ${domain}`);

    // Prepare cookie data with Unix timestamp expiration dates
    const cookieData = {
      timestamp: new Date().toISOString(),
      url: url,
      domain: domain,
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate || null,
      })),
    };

    // Write to Google Sheets
    await sheetsAPI.appendCookieData(cookieData);

    console.log(
      'Cookies extracted and written to Google Sheets:',
      cookieData
    );
  } catch (error) {
    console.error(
      'Error extracting cookies and writing to sheets:',
      error
    );
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    (async () => {
      try {
        switch (request.action) {
          case 'start':
            startHourlyRefresh();
            sendResponse({ success: true, running: true });
            break;

          case 'stop':
            stopHourlyRefresh();
            sendResponse({ success: true, running: false });
            break;

          case 'getStatus':
            sendResponse({
              running: isRunning,
              lastRefresh: null, // Will be retrieved from storage in popup
            });
            break;

          case 'refreshNow':
            await refreshActiveTabAndExtractCookies();
            sendResponse({ success: true });
            break;

          case 'testSheet':
            const testResult = await sheetsAPI.testSheetAccess();
            sendResponse({ success: true, result: testResult });
            break;

          case 'authenticateAlt':
            try {
              // Alternative authentication without scopes parameter
              console.log('Trying alternative authentication...');
              const altResponse = await chrome.identity.getAuthToken({
                interactive: true,
              });
              console.log('Alt response received:', !!altResponse);
              console.log('Alt response type:', typeof altResponse);

              // Extract token from response
              let altToken;
              if (
                typeof altResponse === 'object' &&
                altResponse.token
              ) {
                altToken = altResponse.token;
              } else if (typeof altResponse === 'string') {
                altToken = altResponse;
              }

              console.log(
                'Alt token length:',
                altToken ? altToken.length : 'N/A'
              );

              if (
                altToken &&
                typeof altToken === 'string' &&
                altToken.length > 0
              ) {
                authToken = altToken;
                await chrome.storage.local.set({
                  authToken: altToken,
                });
                sendResponse({ success: true, authenticated: true });
              } else {
                sendResponse({
                  success: false,
                  error: 'Invalid token from alternative method',
                });
              }
            } catch (error) {
              console.error(
                'Alternative authentication failed:',
                error
              );
              sendResponse({ success: false, error: error.message });
            }
            break;

          case 'authenticate':
            const token = await sheetsAPI.authenticate();
            sendResponse({ success: true, authenticated: !!token });
            break;

          case 'addHeaders':
            await sheetsAPI.addHeaders();
            sendResponse({ success: true });
            break;

          case 'getSpreadsheetUrl':
            const url = await sheetsAPI.getSpreadsheetUrl();
            sendResponse({ url: url });
            break;

          default:
            sendResponse({ error: 'Unknown action' });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }
);

// Restore state on startup
chrome.storage.local.get(['isRunning', 'authToken'], (result) => {
  if (result.authToken) {
    authToken = result.authToken;
  }
  if (result.isRunning) {
    startHourlyRefresh();
  }
});
