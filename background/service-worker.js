importScripts('../shared/storage.js');

const INTERVAL_MAP = {
  realtime: 5,
  hourly: 60,
  daily: 1440,
  weekly: 10080,
  off: 0
};

async function initAlarm() {
  const settings = await getSettings();
  const minutes = INTERVAL_MAP[settings.reminderFrequency];
  if (minutes && minutes > 0) {
    chrome.alarms.clear('priceCheck', () => {
      chrome.alarms.create('priceCheck', { periodInMinutes: minutes });
    });
  } else {
    chrome.alarms.clear('priceCheck');
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'priceCheck') {
    await checkAllPrices();
  }
});

async function checkAllPrices() {
  const items = await getAllItems();
  const settings = await getSettings();
  const activeItems = items.filter(i => i.status === 'active');

  for (const item of activeItems) {
    if (settings.blockedWords && settings.blockedWords.some(w => item.name.includes(w))) {
      continue;
    }

    const simulated = simulatePriceChange(item);
    if (simulated !== item.currentPrice) {
      await addPriceRecord(item.id, simulated, '自动检测');

      if (settings.targetNotify !== false && isTargetReached({ ...item, currentPrice: simulated })) {
        chrome.notifications.create(`target-${item.id}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🎯 目标价已达到！',
          message: `${item.name} 当前价格 ¥${simulated.toFixed(2)}，已达到您的目标价 ¥${item.targetPrice.toFixed(2)}`
        });
      }

      const fluctuation = ((simulated - item.currentPrice) / item.currentPrice) * 100;
      if (settings.dropNotify !== false && fluctuation <= -10) {
        chrome.notifications.create(`drop-${item.id}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '📉 价格大幅下降！',
          message: `${item.name} 降幅 ${Math.abs(fluctuation).toFixed(1)}%，当前 ¥${simulated.toFixed(2)}`
        });
      }
    }
  }
}

function simulatePriceChange(item) {
  const volatility = 0.03;
  const change = (Math.random() - 0.5) * 2 * volatility;
  let newPrice = item.currentPrice * (1 + change);
  if (item.priceHistory && item.priceHistory.length > 0) {
    const lowest = Math.min(...item.priceHistory.map(p => p.price));
    const highest = Math.max(...item.priceHistory.map(p => p.price));
    newPrice = Math.max(lowest * 0.9, Math.min(highest * 1.1, newPrice));
  }
  return Math.round(newPrice * 100) / 100;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_PRICES') {
    checkAllPrices().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'UPDATE_ALARM') {
    initAlarm().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || '', title: tabs[0]?.title || '' });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  initAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  initAlarm();
});
