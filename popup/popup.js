document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initRefreshButton();
  await loadDashboard();
  await loadCurrentPageInfo();
  await loadWatchlistPage();
  await loadHistoryPage();
});

function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const page = btn.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
    });
  });
}

function initRefreshButton() {
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh');
    btn.textContent = '⏳ 刷新中';
    btn.disabled = true;
    await loadDashboard();
    btn.textContent = '🔄 刷新';
    btn.disabled = false;
  });
}

async function loadCurrentPageInfo() {
  const infoEl = document.getElementById('current-page-info');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
      infoEl.innerHTML = `
        <div class="current-page-detected">
          <div>
            <div class="page-name">非商品页面</div>
            <div class="page-platform">浏览商品页时可一键加入观察</div>
          </div>
        </div>`;
      return;
    }

    const items = await getAllItems();
    const matched = items.find(i => i.url === tab.url);

    if (matched) {
      const low = getLowestPrice(matched.priceHistory);
      const fluctuation = getRecentFluctuation(matched.priceHistory, 7);
      const reached = isTargetReached(matched);
      infoEl.innerHTML = `
        <div class="current-page-detected" style="flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
            <div>
              <div class="page-name">${escapeHtml(matched.name)}</div>
              <div class="page-platform">${matched.platform} · ${matched.category}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:18px;font-weight:700;color:var(--primary);">${formatPrice(matched.currentPrice)}</div>
              ${reached ? '<span class="badge badge-success">🎯 已达目标</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted);">
            <span>历史最低: <b style="color:var(--success)">${formatPrice(low)}</b></span>
            <span>波动: <b class="${fluctuation.trend === 'down' ? 'price-down' : fluctuation.trend === 'up' ? 'price-up' : ''}">${fluctuation.trend === 'down' ? '↓' : fluctuation.trend === 'up' ? '↑' : '→'} ${fluctuation.percent.toFixed(1)}%</b></span>
            ${matched.discountInfo ? `<span>优惠: ${escapeHtml(matched.discountInfo)}</span>` : ''}
          </div>
        </div>`;
    } else {
      infoEl.innerHTML = `
        <div class="current-page-detected">
          <div>
            <div class="page-name">${escapeHtml(tab.title || '当前页面')}</div>
            <div class="page-platform">点击页面上的 💰 按钮加入观察</div>
          </div>
          <span class="badge badge-primary">${detectPlatform(tab.url)}</span>
        </div>`;
    }
  } catch (e) {
    infoEl.innerHTML = `<div class="current-page-loading">无法获取当前页面信息</div>`;
  }
}

async function loadDashboard() {
  const items = await getAllItems();
  const active = items.filter(i => i.status === 'active');
  const reached = active.filter(i => isTargetReached(i));
  const dropping = active.filter(i => {
    const f = getRecentFluctuation(i.priceHistory, 7);
    return f.trend === 'down';
  });

  document.getElementById('stat-total').textContent = active.length;
  document.getElementById('stat-reached').textContent = reached.length;
  document.getElementById('stat-dropping').textContent = dropping.length;

  const list = document.getElementById('recent-list');
  if (active.length === 0) {
    list.innerHTML = `
      <div class="empty-mini">
        <div class="icon">🔍</div>
        <div>还没有观察中的商品</div>
        <div style="font-size:12px;margin-top:4px;">在商品页面点击 💰 按钮添加</div>
      </div>`;
    return;
  }

  const recent = active.slice(0, 5);
  list.innerHTML = recent.map(item => renderItemCard(item)).join('');
  list.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => showDetail(card.dataset.id));
  });
}

function renderItemCard(item) {
  const low = getLowestPrice(item.priceHistory);
  const fluctuation = getRecentFluctuation(item.priceHistory, 7);
  const reached = isTargetReached(item);
  const cls = reached ? 'reached' : fluctuation.trend === 'down' ? 'dropping' : '';

  return `
    <div class="item-card ${cls}" data-id="${item.id}">
      <div class="item-top">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-price">${formatPrice(item.currentPrice)}</span>
      </div>
      <div class="item-meta">
        <span class="platform">${item.platform}</span>
        ${reached ? '<span class="target-reached">🎯 达标</span>' : ''}
        <span class="fluctuation ${fluctuation.trend}">
          ${fluctuation.trend === 'down' ? '↓' : fluctuation.trend === 'up' ? '↑' : '→'} ${fluctuation.percent.toFixed(1)}%
        </span>
        ${low !== null ? `<span>最低 ${formatPrice(low)}</span>` : ''}
        ${item.discountInfo ? `<span>${escapeHtml(item.discountInfo)}</span>` : ''}
      </div>
    </div>`;
}

async function loadWatchlistPage() {
  const items = await getAllItems();
  const categories = getCategories(items);
  const filterEl = document.getElementById('filter-category');
  filterEl.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');

  filterEl.addEventListener('change', () => renderWatchlist(items));
  document.getElementById('sort-by').addEventListener('change', () => renderWatchlist(items));

  renderWatchlist(items);
}

async function renderWatchlist(allItems) {
  const category = document.getElementById('filter-category').value;
  const sortBy = document.getElementById('sort-by').value;

  let items = category === '全部' ? [...allItems] : allItems.filter(i => i.category === category);

  items.sort((a, b) => {
    switch (sortBy) {
      case 'currentPrice': return a.currentPrice - b.currentPrice;
      case 'currentPrice-desc': return b.currentPrice - a.currentPrice;
      case 'name': return a.name.localeCompare(b.name);
      default: return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
  });

  const container = document.getElementById('watchlist-items');
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-mini"><div class="icon">📋</div><div>暂无观察商品</div></div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const reached = isTargetReached(item);
    return `
      <div class="item-card ${reached ? 'reached' : ''}" data-id="${item.id}">
        <div class="item-top">
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-price">${formatPrice(item.currentPrice)}</span>
        </div>
        <div class="item-meta">
          <span class="platform">${item.platform}</span>
          <span>${item.category}</span>
          ${item.targetPrice ? `<span>目标 ${formatPrice(item.targetPrice)}</span>` : ''}
          ${reached ? '<span class="target-reached">🎯 达标</span>' : ''}
          ${item.status === 'paused' ? '<span class="badge badge-warning">已暂停</span>' : ''}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => showDetail(card.dataset.id));
  });
}

async function loadHistoryPage() {
  const items = await getAllItems();
  const select = document.getElementById('history-item-select');
  select.innerHTML = '<option value="">选择商品查看价格记录</option>' +
    items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');

  select.addEventListener('change', () => {
    const item = items.find(i => i.id === select.value);
    renderPriceHistory(item);
  });

  if (items.length > 0) {
    select.value = items[0].id;
    renderPriceHistory(items[0]);
  }
}

function renderPriceHistory(item) {
  const chartEl = document.getElementById('price-chart');
  const recordsEl = document.getElementById('history-records');

  if (!item || !item.priceHistory || item.priceHistory.length === 0) {
    chartEl.innerHTML = '';
    recordsEl.innerHTML = '<div class="empty-mini"><div class="icon">📊</div><div>暂无价格记录</div></div>';
    return;
  }

  const history = item.priceHistory;
  const prices = history.map(h => h.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const range = maxPrice - minPrice || 1;

  const chartBars = history.slice(-20).map(h => {
    const height = Math.max(8, ((h.price - minPrice) / range) * 90 + 10);
    const isLowest = h.price === minPrice;
    const isHighest = h.price === maxPrice;
    return `<div class="chart-bar ${isLowest ? 'lowest' : ''} ${isHighest ? 'highest' : ''}" 
                 style="height:${height}%" 
                 data-label="¥${h.price.toFixed(2)} ${formatDateShort(h.date)}"></div>`;
  }).join('');
  chartEl.innerHTML = chartBars;

  const records = [...history].reverse().slice(0, 15);
  recordsEl.innerHTML = records.map(r => `
    <div class="history-record">
      <span class="price">${formatPrice(r.price)}</span>
      <span class="source">${r.source}</span>
      <span class="date">${formatDate(r.date)}</span>
    </div>
  `).join('');
}

async function showDetail(id) {
  const items = await getAllItems();
  const item = items.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('detail-modal');
  const body = document.getElementById('detail-body');
  const actions = document.getElementById('detail-actions');
  const low = getLowestPrice(item.priceHistory);
  const high = getHighestPrice(item.priceHistory);
  const fluctuation = getRecentFluctuation(item.priceHistory, 7);
  const reached = isTargetReached(item);

  document.getElementById('detail-name').textContent = item.name;

  body.innerHTML = `
    <div class="detail-row">
      <span class="label">当前价格</span>
      <span class="value price-main">${formatPrice(item.currentPrice)}</span>
    </div>
    <div class="detail-row">
      <span class="label">目标价格</span>
      <span class="value ${reached ? 'reached' : ''}">${formatPrice(item.targetPrice)} ${reached ? '✅ 已达标' : ''}</span>
    </div>
    ${item.budget ? `<div class="detail-row"><span class="label">预算上限</span><span class="value">${formatPrice(item.budget)}</span></div>` : ''}
    <div class="detail-row">
      <span class="label">历史最低</span>
      <span class="value" style="color:var(--success)">${low !== null ? formatPrice(low) : '--'}</span>
    </div>
    <div class="detail-row">
      <span class="label">历史最高</span>
      <span class="value" style="color:var(--danger)">${high !== null ? formatPrice(high) : '--'}</span>
    </div>
    <div class="detail-row">
      <span class="label">近期波动(7日)</span>
      <span class="value ${fluctuation.trend === 'down' ? 'price-down' : fluctuation.trend === 'up' ? 'price-up' : ''}">
        ${fluctuation.trend === 'down' ? '↓' : fluctuation.trend === 'up' ? '↑' : '→'} ${fluctuation.percent.toFixed(1)}%
      </span>
    </div>
    <div class="detail-row">
      <span class="label">平台</span>
      <span class="value">${item.platform}</span>
    </div>
    <div class="detail-row">
      <span class="label">分类</span>
      <span class="value">${item.category}</span>
    </div>
    ${item.discountInfo ? `<div class="detail-row"><span class="label">优惠说明</span><span class="value">${escapeHtml(item.discountInfo)}</span></div>` : ''}
    ${item.usage ? `<div class="detail-row"><span class="label">用途</span><span class="value">${escapeHtml(item.usage)}</span></div>` : ''}
    ${item.notes ? `<div class="detail-row"><span class="label">备注</span><span class="value">${escapeHtml(item.notes)}</span></div>` : ''}
    <div class="detail-row">
      <span class="label">状态</span>
      <span class="value">${item.status === 'active' ? '观察中' : '已暂停'}</span>
    </div>
    <div class="detail-row">
      <span class="label">价格记录</span>
      <span class="value">${item.priceHistory.length} 条</span>
    </div>
  `;

  actions.innerHTML = `
    <button class="btn btn-sm ${item.status === 'active' ? 'btn-ghost' : 'btn-success'}" id="btn-toggle">
      ${item.status === 'active' ? '⏸ 暂停观察' : '▶ 恢复观察'}
    </button>
    <button class="btn btn-sm btn-danger" id="btn-delete">🗑 删除</button>
  `;

  modal.classList.remove('hidden');

  document.getElementById('btn-toggle').addEventListener('click', async () => {
    await updateItem(item.id, { status: item.status === 'active' ? 'paused' : 'active' });
    modal.classList.add('hidden');
    await loadDashboard();
    await loadWatchlistPage();
  });

  document.getElementById('btn-delete').addEventListener('click', async () => {
    await deleteItem(item.id);
    modal.classList.add('hidden');
    await loadDashboard();
    await loadWatchlistPage();
    await loadHistoryPage();
  });
}

document.getElementById('detail-close').addEventListener('click', () => {
  document.getElementById('detail-modal').classList.add('hidden');
});

document.querySelector('.detail-overlay').addEventListener('click', () => {
  document.getElementById('detail-modal').classList.add('hidden');
});

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
