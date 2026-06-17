const ALERTS_STATE_KEY = 'price_hunter_alerts_state';
const IGNORE_DAYS = 3;

let allItems = [];
let alertStates = {};
let currentTab = 'all';
let currentAlerts = [];

document.addEventListener('DOMContentLoaded', async () => {
  allItems = await getAllItems();
  alertStates = await getStorage(ALERTS_STATE_KEY) || {};

  document.querySelectorAll('.alert-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.alert-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderAlerts();
    });
  });

  document.getElementById('btn-mark-all-read').addEventListener('click', markAllRead);

  generateAlerts();
  updateCounts();
  renderAlerts();
});

function generateAlerts() {
  currentAlerts = [];

  allItems.forEach(item => {
    const state = alertStates[item.id] || {};
    if (state.ignoredUntil && state.ignoredUntil > Date.now()) return;

    const f7 = getRecentFluctuation(item.priceHistory, 7);

    if (isTargetReached(item)) {
      currentAlerts.push({
        item,
        type: 'reached',
        typeLabel: '🎯 目标价达成',
        reason: `当前价格 ${formatPrice(item.currentPrice)} 已低于目标价 ${formatPrice(item.targetPrice)}`,
        icon: '🎯',
        read: state.read?.reached || false
      });
    }

    if (f7.trend === 'down' && f7.percent >= 5) {
      currentAlerts.push({
        item,
        type: 'dropping',
        typeLabel: '📉 连续降价',
        reason: `近7天价格下降 ${f7.percent.toFixed(1)}%，累计降价 ${formatPrice(f7.change)}`,
        icon: '📉',
        read: state.read?.dropping || false
      });
    }

    if (f7.trend === 'up' && f7.percent >= 5) {
      currentAlerts.push({
        item,
        type: 'rising',
        typeLabel: '📈 近期涨价',
        reason: `近7天价格上涨 ${f7.percent.toFixed(1)}%，累计涨价 ${formatPrice(f7.change)}`,
        icon: '📈',
        read: state.read?.rising || false
      });
    }

    if (item.budget && item.currentPrice > item.budget) {
      const over = item.currentPrice - item.budget;
      const overPct = ((over / item.budget) * 100).toFixed(1);
      currentAlerts.push({
        item,
        type: 'overbudget',
        typeLabel: '⚠️ 超过预算',
        reason: `当前价 ${formatPrice(item.currentPrice)} 超出预算 ${formatPrice(item.budget)} 共 ${formatPrice(over)}（${overPct}%）`,
        icon: '⚠️',
        read: state.read?.overbudget || false
      });
    }
  });

  currentAlerts.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return new Date(b.item.updatedAt) - new Date(a.item.updatedAt);
  });
}

function updateCounts() {
  const counts = { all: currentAlerts.length };
  ['reached', 'dropping', 'rising', 'overbudget'].forEach(type => {
    counts[type] = currentAlerts.filter(a => a.type === type).length;
  });

  document.getElementById('count-all').textContent = counts.all;
  document.getElementById('count-reached').textContent = counts.reached;
  document.getElementById('count-dropping').textContent = counts.dropping;
  document.getElementById('count-rising').textContent = counts.rising;
  document.getElementById('count-overbudget').textContent = counts.overbudget;
}

function renderAlerts() {
  const list = document.getElementById('alerts-list');
  const empty = document.getElementById('alerts-empty');

  let filtered = currentAlerts;
  if (currentTab !== 'all') {
    filtered = currentAlerts.filter(a => a.type === currentTab);
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';

  list.innerHTML = filtered.map(alert => {
    const item = alert.item;
    const low = getLowestPrice(item.priceHistory);
    const high = getHighestPrice(item.priceHistory);
    const f7 = getRecentFluctuation(item.priceHistory, 7);

    return `
      <div class="alert-card type-${alert.type} ${alert.read ? '' : 'unread'}">
        <div class="alert-icon">${alert.icon}</div>
        <div class="alert-content">
          <div class="alert-title">
            ${escapeHtml(item.name)}
            <span class="alert-badge badge-${alert.type}">${alert.typeLabel}</span>
          </div>
          <div class="alert-reason">${alert.reason}</div>
          <div class="alert-price-row">
            <div class="alert-price-item"><span class="label">当前价</span><span class="value">${formatPrice(item.currentPrice)}</span></div>
            <div class="alert-price-item"><span class="label">目标价</span><span class="value">${item.targetPrice ? formatPrice(item.targetPrice) : '--'}</span></div>
            <div class="alert-price-item"><span class="label">历史最低</span><span class="value price-down">${low !== null ? formatPrice(low) : '--'}</span></div>
            <div class="alert-price-item"><span class="label">7日波动</span><span class="value ${f7.trend === 'down' ? 'price-down' : f7.trend === 'up' ? 'price-up' : ''}">${f7.trend === 'down' ? '↓' : f7.trend === 'up' ? '↑' : '→'} ${f7.percent.toFixed(1)}%</span></div>
          </div>
          <div class="alert-meta">
            <span>🏷️ ${item.category}</span>
            <span>🔗 ${item.platform}</span>
            <span>🕐 ${formatDate(item.updatedAt)}</span>
          </div>
        </div>
        <div class="alert-actions">
          <button class="btn btn-sm btn-ghost" data-action="view" data-id="${item.id}">查看</button>
          <button class="btn btn-sm btn-outline" data-action="read" data-id="${item.id}" data-type="${alert.type}">
            ${alert.read ? '↩️ 标未读' : '✓ 标记已读'}
          </button>
          <button class="btn btn-sm btn-ghost" data-action="ignore" data-id="${item.id}" title="暂时忽略 ${IGNORE_DAYS} 天">⏸ 忽略</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      window.location.href = `../price-history/price-history.html?id=${id}`;
    });
  });

  list.querySelectorAll('[data-action="read"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      await toggleRead(id, type);
      generateAlerts();
      updateCounts();
      renderAlerts();
    });
  });

  list.querySelectorAll('[data-action="ignore"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm(`确定要忽略该商品的所有预警 ${IGNORE_DAYS} 天吗？`)) {
        await ignoreItem(id);
        generateAlerts();
        updateCounts();
        renderAlerts();
      }
    });
  });
}

async function toggleRead(itemId, type) {
  if (!alertStates[itemId]) {
    alertStates[itemId] = { read: {} };
  }
  if (!alertStates[itemId].read) {
    alertStates[itemId].read = {};
  }
  alertStates[itemId].read[type] = !alertStates[itemId].read[type];
  await setStorage(ALERTS_STATE_KEY, alertStates);
}

async function ignoreItem(itemId) {
  if (!alertStates[itemId]) {
    alertStates[itemId] = { read: {} };
  }
  alertStates[itemId].ignoredUntil = Date.now() + IGNORE_DAYS * 86400000;
  await setStorage(ALERTS_STATE_KEY, alertStates);
}

async function markAllRead() {
  let filtered = currentAlerts;
  if (currentTab !== 'all') {
    filtered = currentAlerts.filter(a => a.type === currentTab);
  }

  filtered.forEach(alert => {
    if (!alertStates[alert.item.id]) {
      alertStates[alert.item.id] = { read: {} };
    }
    if (!alertStates[alert.item.id].read) {
      alertStates[alert.item.id].read = {};
    }
    alertStates[alert.item.id].read[alert.type] = true;
  });

  await setStorage(ALERTS_STATE_KEY, alertStates);
  generateAlerts();
  updateCounts();
  renderAlerts();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
