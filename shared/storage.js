const DB_KEY = 'price_hunter_data';
const SETTINGS_KEY = 'price_hunter_settings';

const DEFAULT_SETTINGS = {
  reminderFrequency: 'daily',
  blockedWords: [],
  autoDetect: true,
  currency: 'CNY',
  priceCheckInterval: 60
};

async function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  });
}

async function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

async function getAllItems() {
  const data = await getStorage(DB_KEY);
  return data || [];
}

async function saveAllItems(items) {
  await setStorage(DB_KEY, items);
}

async function addItem(item) {
  const items = await getAllItems();
  const newItem = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: item.name || '未知商品',
    url: item.url || '',
    imageUrl: item.imageUrl || '',
    platform: item.platform || detectPlatform(item.url),
    category: item.category || '未分类',
    currentPrice: item.currentPrice || 0,
    targetPrice: item.targetPrice || 0,
    budget: item.budget || 0,
    usage: item.usage || '',
    notes: item.notes || '',
    specs: item.specs || {},
    shipping: item.shipping || '免运费',
    warranty: item.warranty || '',
    ratingSummary: item.ratingSummary || '',
    discountInfo: item.discountInfo || '',
    priceHistory: item.currentPrice ? [
      { price: item.currentPrice, date: new Date().toISOString(), source: '手动添加' }
    ] : [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  items.unshift(newItem);
  await saveAllItems(items);
  return newItem;
}

async function updateItem(id, updates) {
  const items = await getAllItems();
  const index = items.findIndex(i => i.id === id);
  if (index === -1) return null;
  items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
  await saveAllItems(items);
  return items[index];
}

async function deleteItem(id) {
  const items = await getAllItems();
  const filtered = items.filter(i => i.id !== id);
  await saveAllItems(filtered);
}

async function addPriceRecord(id, price, source) {
  const items = await getAllItems();
  const item = items.find(i => i.id === id);
  if (!item) return null;
  item.priceHistory.push({
    price,
    date: new Date().toISOString(),
    source: source || '自动更新'
  });
  item.currentPrice = price;
  item.updatedAt = new Date().toISOString();
  await saveAllItems(items);
  return item;
}

async function getSettings() {
  const settings = await getStorage(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function saveSettings(settings) {
  await setStorage(SETTINGS_KEY, settings);
}

function detectPlatform(url) {
  if (!url) return '未知';
  const platforms = [
    { pattern: /taobao\.com|tmall\.com/i, name: '淘宝/天猫' },
    { pattern: /jd\.com/i, name: '京东' },
    { pattern: /pinduoduo\.com|yangkeduo\.com/i, name: '拼多多' },
    { pattern: /suning\.com/i, name: '苏宁' },
    { pattern: /vip\.com/i, name: '唯品会' },
    { pattern: /amazon\./i, name: 'Amazon' },
    { pattern: /dangdang\.com/i, name: '当当' },
    { pattern: /smzdm\.com/i, name: '什么值得买' }
  ];
  for (const p of platforms) {
    if (p.pattern.test(url)) return p.name;
  }
  return '其他';
}

function formatPrice(price) {
  if (price === undefined || price === null) return '--';
  return '¥' + Number(price).toFixed(2);
}

function getLowestPrice(priceHistory) {
  if (!priceHistory || priceHistory.length === 0) return null;
  return Math.min(...priceHistory.map(p => p.price));
}

function getHighestPrice(priceHistory) {
  if (!priceHistory || priceHistory.length === 0) return null;
  return Math.max(...priceHistory.map(p => p.price));
}

function getRecentFluctuation(priceHistory, days) {
  if (!priceHistory || priceHistory.length < 2) return { trend: 'stable', change: 0, percent: 0 };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 7));
  const recent = priceHistory.filter(p => new Date(p.date) >= cutoff);
  if (recent.length < 2) return { trend: 'stable', change: 0, percent: 0 };
  const oldest = recent[0].price;
  const newest = recent[recent.length - 1].price;
  const change = newest - oldest;
  const percent = oldest !== 0 ? (change / oldest * 100) : 0;
  let trend = 'stable';
  if (change > 0) trend = 'up';
  else if (change < 0) trend = 'down';
  return { trend, change: Math.abs(change), percent: Math.abs(percent) };
}

function getConsecutiveDropInfo(priceHistory, minDays) {
  if (!priceHistory || priceHistory.length < 2) {
    return { consecutive: false, days: 0, totalDrop: 0, dropPercent: 0 };
  }

  const sorted = [...priceHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sorted.length < 2) {
    return { consecutive: false, days: 0, totalDrop: 0, dropPercent: 0 };
  }

  let consecutiveDays = 0;
  let lastDate = null;
  let currentPrice = sorted[0].price;
  let startPrice = sorted[0].price;
  let allDropping = true;

  for (let i = 1; i < sorted.length; i++) {
    const prevRecord = sorted[i - 1];
    const currRecord = sorted[i];

    const prevDate = new Date(prevRecord.date);
    const currDate = new Date(currRecord.date);

    if (currRecord.price < prevRecord.price) {
      consecutiveDays++;
      currentPrice = currRecord.price;
      lastDate = currDate;
    } else {
      allDropping = false;
      break;
    }
  }

  const totalDrop = startPrice - currentPrice;
  const dropPercent = startPrice !== 0 ? (totalDrop / startPrice) * 100 : 0;
  const isConsecutive = consecutiveDays >= (minDays || 3);

  return {
    consecutive: isConsecutive,
    days: consecutiveDays,
    totalDrop,
    dropPercent,
    startPrice,
    currentPrice
  };
}

function isTargetReached(item) {
  if (!item.targetPrice || item.targetPrice <= 0) return false;
  return item.currentPrice <= item.targetPrice;
}

function getCategories(items) {
  const cats = new Set();
  items.forEach(i => cats.add(i.category || '未分类'));
  return ['全部', ...Array.from(cats)];
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hour}:${min}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function exportToJSON(items) {
  return JSON.stringify(items, null, 2);
}

function exportToCSV(items) {
  const headers = ['名称', '平台', '分类', '当前价', '目标价', '预算', '用途', '运费', '保修', '备注', '状态', '链接', '创建时间'];
  const rows = items.map(i => [
    i.name, i.platform, i.category,
    i.currentPrice, i.targetPrice, i.budget,
    i.usage, i.shipping, i.warranty, i.notes,
    i.status === 'active' ? '观察中' : '已暂停',
    i.url, i.createdAt
  ]);
  return [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
