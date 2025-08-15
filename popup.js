// Popup script for Chrome extension

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const authBtn = document.getElementById('authBtn');
  const authAltBtn = document.getElementById('authAltBtn');
  const reAuthBtn = document.getElementById('reAuthBtn');
  const testSheetBtn = document.getElementById('testSheetBtn');
  const addHeadersBtn = document.getElementById('addHeadersBtn');
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.getElementById('statusText');
  const lastRefreshTime = document.getElementById('lastRefreshTime');
  const totalRows = document.getElementById('totalRows');
  const setupSection = document.getElementById('setupSection');
  const setupMessages = document.getElementById('setupMessages');
  const sheetLink = document.getElementById('sheetLink');
  const sheetId = document.getElementById('sheetId');

  let isAuthenticated = false;

  // Get the hardcoded sheet ID from background script
  const SPREADSHEET_ID =
    '1xN9dFaZ6fltE9XfP1wl6WPbW5sbOq3jZENSoYdEjsKE'; // This should match the one in background.js

  // Load initial status
  loadStatus();

  // Event listeners
  startBtn.addEventListener('click', startRefresh);
  stopBtn.addEventListener('click', stopRefresh);
  refreshBtn.addEventListener('click', refreshNow);
  authBtn.addEventListener('click', authenticate);
  authAltBtn.addEventListener('click', authenticateAlt);
  reAuthBtn.addEventListener('click', authenticate);
  testSheetBtn.addEventListener('click', testSheet);
  addHeadersBtn.addEventListener('click', addHeaders);

  async function loadStatus() {
    try {
      // Display the hardcoded sheet ID
      sheetId.textContent = SPREADSHEET_ID;

      // Get running status
      const response = await chrome.runtime.sendMessage({
        action: 'getStatus',
      });

      // Get additional data from storage
      const result = await chrome.storage.local.get([
        'lastRefresh',
        'totalRows',
        'authToken',
      ]);

      // Check authentication status
      isAuthenticated = !!result.authToken;

      updateSetupUI();
      updateMainUI(
        response.running,
        result.lastRefresh,
        result.totalRows || 0
      );

      // Always show sheet link since we have hardcoded ID
      updateSheetLink();
    } catch (error) {
      console.error('Error loading status:', error);
      showMessage('Error loading extension status', 'error');
    }
  }

  function updateSetupUI() {
    // Update authentication button
    if (isAuthenticated) {
      authBtn.style.display = 'none';
      reAuthBtn.style.display = 'block';
      reAuthBtn.textContent = '✓ Authenticated (Click to re-auth)';
      reAuthBtn.style.background = '#4CAF50';
      testSheetBtn.disabled = false;
      addHeadersBtn.disabled = false;
      setupSection.className = 'setup-section completed';
    } else {
      authBtn.style.display = 'block';
      reAuthBtn.style.display = 'none';
      authBtn.textContent = 'Authenticate with Google';
      authBtn.disabled = false;
      authBtn.style.background = '#FF9800';
      testSheetBtn.disabled = true;
      addHeadersBtn.disabled = true;
      setupSection.className = 'setup-section';
    }

    // Enable/disable main controls based on authentication
    const setupComplete = isAuthenticated;
    startBtn.disabled = !setupComplete;
    stopBtn.disabled = !setupComplete;
    refreshBtn.disabled = !setupComplete;
  }

  function updateMainUI(isRunning, lastRefresh, totalRowsCount) {
    // Update status indicator
    if (isRunning) {
      statusIndicator.className = 'status-indicator running';
      statusText.textContent = 'Running';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      statusIndicator.className = 'status-indicator stopped';
      statusText.textContent = 'Stopped';
      if (isAuthenticated) {
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    }

    // Update last refresh time
    if (lastRefresh) {
      const date = new Date(lastRefresh);
      lastRefreshTime.textContent = date.toLocaleString();
    } else {
      lastRefreshTime.textContent = 'Never';
    }

    // Update total rows (now sessions)
    totalRows.textContent = totalRowsCount;
  }

  function updateSheetLink() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
    sheetLink.innerHTML = `<a href="${url}" target="_blank" class="link">Open Google Sheet</a>`;
  }

  function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    setupMessages.appendChild(messageDiv);

    // Remove message after 5 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 5000);
  }

  async function authenticateAlt() {
    try {
      authAltBtn.textContent = 'Authenticating (Alt)...';
      authAltBtn.disabled = true;

      const response = await chrome.runtime.sendMessage({
        action: 'authenticateAlt',
      });

      if (response.success) {
        isAuthenticated = true;
        showMessage(
          'Alternative authentication successful!',
          'success'
        );
        updateSetupUI();

        // Automatically test sheet access after authentication
        setTimeout(() => {
          testSheet();
        }, 1000);
      } else {
        throw new Error(
          response.error || 'Alternative authentication failed'
        );
      }
    } catch (error) {
      console.error('Error with alternative authentication:', error);
      showMessage(
        `Alternative authentication failed: ${error.message}`,
        'error'
      );
      authAltBtn.textContent = 'Try Alternative Auth';
      authAltBtn.disabled = false;
    }
  }

  async function authenticate() {
    try {
      authBtn.textContent = 'Authenticating...';
      authBtn.disabled = true;

      // Clear any existing authentication state
      await chrome.storage.local.set({ authToken: null });

      const response = await chrome.runtime.sendMessage({
        action: 'authenticate',
      });

      if (response.success) {
        isAuthenticated = true;
        showMessage(
          'Successfully authenticated with Google!',
          'success'
        );
        updateSetupUI();

        // Automatically test sheet access after authentication
        setTimeout(() => {
          testSheet();
        }, 1000);
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error) {
      console.error('Error authenticating:', error);
      showMessage(`Authentication failed: ${error.message}`, 'error');
      authBtn.textContent = 'Authenticate with Google';
      authBtn.disabled = false;
    }
  }

  async function testSheet() {
    try {
      testSheetBtn.textContent = 'Testing Sheet...';
      testSheetBtn.disabled = true;

      const response = await chrome.runtime.sendMessage({
        action: 'testSheet',
      });

      if (response.success) {
        showMessage(
          `Sheet found: "${response.result.properties.title}"`,
          'success'
        );
        testSheetBtn.textContent = '✓ Sheet Accessible';
        testSheetBtn.style.background = '#4CAF50';
      } else {
        throw new Error('Sheet test failed');
      }
    } catch (error) {
      console.error('Error testing sheet:', error);
      showMessage(
        'Sheet not accessible. Check Sheet ID and permissions.',
        'error'
      );
      testSheetBtn.textContent = 'Test Sheet Access';
      testSheetBtn.disabled = false;
    }
  }

  async function addHeaders() {
    try {
      addHeadersBtn.textContent = 'Adding Headers...';
      addHeadersBtn.disabled = true;

      const response = await chrome.runtime.sendMessage({
        action: 'addHeaders',
      });

      if (response.success) {
        showMessage('Headers added to Google Sheet!', 'success');
        addHeadersBtn.textContent = '✓ Headers Added';
        addHeadersBtn.style.background = '#4CAF50';
      } else {
        throw new Error('Failed to add headers');
      }
    } catch (error) {
      console.error('Error adding headers:', error);
      showMessage(
        'Failed to add headers. Make sure the sheet is accessible.',
        'error'
      );
      addHeadersBtn.textContent = 'Add Headers to Sheet';
      addHeadersBtn.disabled = false;
    }
  }

  async function startRefresh() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'start',
      });
      if (response.success) {
        showMessage('Hourly refresh started!', 'success');
        loadStatus();
      }
    } catch (error) {
      console.error('Error starting refresh:', error);
      showMessage('Failed to start refresh', 'error');
    }
  }

  async function stopRefresh() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'stop',
      });
      if (response.success) {
        showMessage('Hourly refresh stopped', 'success');
        loadStatus();
      }
    } catch (error) {
      console.error('Error stopping refresh:', error);
      showMessage('Failed to stop refresh', 'error');
    }
  }

  async function refreshNow() {
    try {
      refreshBtn.textContent = 'Refreshing...';
      refreshBtn.disabled = true;

      await chrome.runtime.sendMessage({ action: 'refreshNow' });
      showMessage(
        'Page refreshed and cookies written as JSON to Google Sheets!',
        'success'
      );

      // Wait a bit then reload status
      setTimeout(() => {
        loadStatus();
        refreshBtn.textContent = 'Refresh Now';
        refreshBtn.disabled = false;
      }, 4000);
    } catch (error) {
      console.error('Error refreshing now:', error);
      showMessage('Failed to refresh and extract cookies', 'error');
      refreshBtn.textContent = 'Refresh Now';
      refreshBtn.disabled = false;
    }
  }

  // Refresh status every few seconds
  setInterval(loadStatus, 10000);
});
