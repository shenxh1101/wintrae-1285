const COMPARE_SCHEMES_KEY = 'price_hunter_compare_schemes';
const ACTIVE_SCHEME_KEY = 'price_hunter_active_scheme';

const DEFAULT_WEIGHTS = { price: 30, warranty: 20, rating: 25, specs: 25 };

let allItems = [];
let schemes = [];
let activeSchemeId = null;
let settingsExpanded = false;

document.addEventListener('DOMContentLoaded', async () => {
  allItems = await getAllItems();
  schemes = await getStorage(COMPARE_SCHEMES_KEY) || [];
  activeSchemeId = await getStorage(ACTIVE_SCHEME_KEY) || null;

  populateSelect();
  renderSchemes();
  renderCompare();
  bindSettingEvents();

  document.getElementById('btn-add-to-compare').addEventListener('click', addToCompare);
  document.getElementById('btn-clear-compare').addEventListener('click', clearCurrentScheme);
  document.getElementById('btn-save-scheme').addEventListener('click', saveNewScheme);
  document.getElementById('btn-export-compare').addEventListener('click', exportCompare);
  document.getElementById('btn-toggle-settings').addEventListener('click', toggleSettings);
  document.getElementById('btn-settings-toggle').addEventListener('click', toggleSettings);
  document.getElementById('btn-save-settings').addEventListener('click', saveSchemeSettings);

  const weightInputs = ['price', 'warranty', 'rating', 'specs'];
  weightInputs.forEach(w => {
    const input = document.getElementById(`weight-${w}`);
    input.addEventListener('input', () => {
      document.getElementById(`weight-${w}-val`).textContent = input.value + '%';
    });
  });
});

function bindSettingEvents() {}

function getActiveScheme() {
  return schemes.find(s => s.id === activeSchemeId);
}

function calculateAndRankItems(items, scheme) {
  const allSpecKeys = [];
  const specKeySet = new Set();
  items.forEach(item => {
    if (item.specs) {
      Object.keys(item.specs).forEach(key => {
        if (!specKeySet.has(key)) {
          specKeySet.add(key);
          allSpecKeys.push(key);
        }
      });
    }
  });

  const weights = scheme?.weights || DEFAULT_WEIGHTS;
  const weightSum = weights.price + weights.warranty + weights.rating + weights.specs || 1;
  const schemeBudget = scheme?.budget || 0;

  const scoredItems = items.map(item => ({
    item,
    scores: calculateScores(item, items, allSpecKeys),
    totalScore: 0,
    isOverBudget: false,
    budgetPenalty: 1
  }));

  scoredItems.forEach(si => {
    let rawScore = (
      si.scores.price * weights.price +
      si.scores.warranty * weights.warranty +
      si.scores.rating * weights.rating +
      si.scores.specs * weights.specs
    ) / weightSum;

    if (schemeBudget > 0 && si.item.currentPrice > schemeBudget) {
      si.isOverBudget = true;
      const overPct = (si.item.currentPrice - schemeBudget) / schemeBudget;
      si.budgetPenalty = Math.max(0.3, 1 - overPct * 1.5);
    }

    if (si.item.budget > 0 && si.item.currentPrice > si.item.budget) {
      si.isOverBudget = true;
      const overPct = (si.item.currentPrice - si.item.budget) / si.item.budget;
      const itemPenalty = Math.max(0.3, 1 - overPct * 1.5);
      si.budgetPenalty = Math.min(si.budgetPenalty, itemPenalty);
    }

    si.totalScore = rawScore * si.budgetPenalty;
  });

  scoredItems.sort((a, b) => b.totalScore - a.totalScore);
  scoredItems.forEach((si, idx) => { si.rank = idx + 1; });

  return { scoredItems, allSpecKeys, weights };
}

async function saveSchemesToStorage() {
  await setStorage(COMPARE_SCHEMES_KEY, schemes);
  await setStorage(ACTIVE_SCHEME_KEY, activeSchemeId);
}

function getCompareIds() {
  const scheme = getActiveScheme();
  return scheme ? scheme.itemIds : [];
}

function populateSelect() {
  const select = document.getElementById('add-item-select');
  const compareIds = getCompareIds();
  const available = allItems.filter(i => !compareIds.includes(i.id));
  select.innerHTML = '<option value="">选择商品添加到比较...</option>' +
    available.map(i => `<option value="${i.id}">${escapeHtml(i.name)} - ${formatPrice(i.currentPrice)}</option>`).join('');
}

function addToCompare() {
  const select = document.getElementById('add-item-select');
  const id = select.value;
  if (!id) return;

  let scheme = getActiveScheme();
  if (!scheme) {
    scheme = createNewScheme('新方案');
    schemes.push(scheme);
    activeSchemeId = scheme.id;
  }

  if (scheme.itemIds.includes(id)) return;
  scheme.itemIds.push(id);
  saveSchemesToStorage();
  populateSelect();
  renderSchemes();
  renderCompare();
  select.value = '';
}

function createNewScheme(name) {
  return {
    id: Date.now().toString(36),
    name,
    itemIds: [],
    scene: '',
    budget: 0,
    weights: { ...DEFAULT_WEIGHTS }
  };
}

async function clearCurrentScheme() {
  const scheme = getActiveScheme();
  if (scheme) {
    scheme.itemIds = [];
    saveSchemesToStorage();
  }
  populateSelect();
  renderCompare();
}

function saveNewScheme() {
  const nameInput = document.getElementById('new-scheme-name');
  const name = nameInput.value.trim();
  if (!name) return;

  const scheme = createNewScheme(name);
  schemes.push(scheme);
  activeSchemeId = scheme.id;
  nameInput.value = '';
  saveSchemesToStorage();
  renderSchemes();
  renderCompare();
  loadSchemeSettings();
}

function switchScheme(id) {
  activeSchemeId = id;
  saveSchemesToStorage();
  populateSelect();
  renderSchemes();
  renderCompare();
  loadSchemeSettings();
}

function deleteScheme(id) {
  schemes = schemes.filter(s => s.id !== id);
  if (activeSchemeId === id) {
    activeSchemeId = schemes.length > 0 ? schemes[0].id : null;
  }
  saveSchemesToStorage();
  populateSelect();
  renderSchemes();
  renderCompare();
}

function renameScheme(id) {
  const scheme = schemes.find(s => s.id === id);
  if (!scheme) return;
  const newName = prompt('输入方案名称：', scheme.name);
  if (newName && newName.trim()) {
    scheme.name = newName.trim();
    saveSchemesToStorage();
    renderSchemes();
  }
}

function renderSchemes() {
  const container = document.getElementById('scheme-tabs');
  if (schemes.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无对比方案，添加商品或创建新方案</span>';
    return;
  }

  container.innerHTML = schemes.map(s => `
    <div class="scheme-tab ${s.id === activeSchemeId ? 'active' : ''}" data-id="${s.id}">
      <span class="scheme-name" data-action="switch" data-id="${s.id}">${escapeHtml(s.name)}</span>
      <span class="scheme-count">(${s.itemIds.length})</span>
      <button class="scheme-rename" data-action="rename" data-id="${s.id}" title="重命名">✏️</button>
      <button class="scheme-delete" data-action="delete-scheme" data-id="${s.id}" title="删除方案">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="switch"]').forEach(el => {
    el.addEventListener('click', () => switchScheme(el.dataset.id));
  });
  container.querySelectorAll('[data-action="rename"]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); renameScheme(btn.dataset.id); });
  });
  container.querySelectorAll('[data-action="delete-scheme"]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteScheme(btn.dataset.id); });
  });
}

function toggleSettings() {
  settingsExpanded = !settingsExpanded;
  const section = document.getElementById('scheme-settings');
  const btn = document.getElementById('btn-toggle-settings');
  if (settingsExpanded) {
    section.classList.remove('hidden');
    btn.textContent = '收起';
  } else {
    section.classList.add('hidden');
    btn.textContent = '展开';
  }
}

function loadSchemeSettings() {
  const scheme = getActiveScheme();
  if (!scheme) return;

  document.getElementById('scheme-scene').value = scheme.scene || '';
  document.getElementById('scheme-budget').value = scheme.budget || '';

  const weights = scheme.weights || { ...DEFAULT_WEIGHTS };
  ['price', 'warranty', 'rating', 'specs'].forEach(w => {
    const val = weights[w] || DEFAULT_WEIGHTS[w];
    document.getElementById(`weight-${w}`).value = val;
    document.getElementById(`weight-${w}-val`).textContent = val + '%';
  });
}

function saveSchemeSettings() {
  const scheme = getActiveScheme();
  if (!scheme) {
    alert('请先创建或选择一个对比方案');
    return;
  }

  scheme.scene = document.getElementById('scheme-scene').value.trim();
  scheme.budget = parseFloat(document.getElementById('scheme-budget').value) || 0;
  scheme.weights = {
    price: parseInt(document.getElementById('weight-price').value) || 0,
    warranty: parseInt(document.getElementById('weight-warranty').value) || 0,
    rating: parseInt(document.getElementById('weight-rating').value) || 0,
    specs: parseInt(document.getElementById('weight-specs').value) || 0
  };

  saveSchemesToStorage();
  renderCompare();
  alert('设置已保存，推荐结果已更新');
}

async function renderCompare() {
  allItems = await getAllItems();
  const compareIds = getCompareIds();
  const items = compareIds.map(id => allItems.find(i => i.id === id)).filter(Boolean);
  const scheme = getActiveScheme();

  const emptyEl = document.getElementById('compare-empty');
  const contentEl = document.getElementById('compare-content');
  const cardsEl = document.getElementById('compare-cards');
  const settingsEl = document.getElementById('scheme-settings');
  const recEl = document.getElementById('recommendation-section');

  if (items.length === 0) {
    emptyEl.style.display = '';
    contentEl.classList.add('hidden');
    cardsEl.innerHTML = '';
    recEl.classList.add('hidden');
    settingsEl.classList.add('hidden');
    return;
  }

  emptyEl.style.display = 'none';
  contentEl.classList.remove('hidden');

  const minPrice = Math.min(...items.map(i => i.currentPrice));
  const maxPrice = Math.max(...items.map(i => i.currentPrice));
  const priceRange = maxPrice - minPrice || 1;

  const { scoredItems, allSpecKeys, weights } = calculateAndRankItems(items, scheme);

  const scoreMap = {};
  scoredItems.forEach(si => { scoreMap[si.item.id] = si; });

  if (items.length >= 2) {
    settingsEl.classList.remove('hidden');
    recEl.classList.remove('hidden');
    renderRecommendation(scoredItems, scheme);

    if (scheme) {
      document.querySelector('.settings-header h3').textContent = `⚙️ 方案设置 - ${scheme.name}`;
      loadSchemeSettings();
    }
  } else {
    settingsEl.classList.add('hidden');
    recEl.classList.add('hidden');
  }

  const thead = document.getElementById('compare-head');
  thead.innerHTML = `<tr><th>属性</th>${items.map(i => {
    const si = scoreMap[i.id];
    const rankBadge = si && items.length >= 2 ? `<span class="rank-badge rank-${si.rank}">#${si.rank}</span>` : '';
    return `<th>${rankBadge} ${escapeHtml(i.name)}</th>`;
  }).join('')}</tr>`;

  const rows = [];

  if (items.length >= 2) {
    rows.push({
      label: '综合得分',
      key: 'score',
      render: (item) => {
        const si = scoreMap[item.id];
        return `<td><div class="cell-score">${si.totalScore.toFixed(1)}<span class="score-max">/100</span></div>
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${si.totalScore}%"></div></div></td>`;
      }
    });
  }

  rows.push(
    {
      label: '当前价格',
      key: 'price',
      render: (item) => {
        const isCheapest = item.currentPrice === minPrice && items.length > 1;
        const barWidth = Math.max(10, ((item.currentPrice - minPrice) / priceRange) * 70 + 30);
        const barClass = isCheapest ? 'bar-cheapest' : item.currentPrice === maxPrice ? 'bar-expensive' : 'bar-normal';
        return `<td>
          <div class="cell-price">${formatPrice(item.currentPrice)}${isCheapest ? '<span class="cell-best">最低</span>' : ''}</div>
          <div class="cell-bar-wrapper" style="margin-top:4px;">
            <div class="price-bar ${barClass}" style="width:${barWidth}%"></div>
          </div>
        </td>`;
      }
    },
    {
      label: '目标价格',
      key: 'target',
      render: (item) => {
        const reached = isTargetReached(item);
        return `<td><span class="${reached ? 'cell-reached' : 'cell-not-reached'}">${formatPrice(item.targetPrice)} ${reached ? '✅' : item.targetPrice ? '' : '--'}</span></td>`;
      }
    },
    {
      label: '预算上限',
      key: 'budget',
      render: (item) => `<td>${item.budget ? formatPrice(item.budget) : '--'}</td>`
    },
    {
      label: '历史最低',
      key: 'lowest',
      render: (item) => {
        const low = getLowestPrice(item.priceHistory);
        return `<td style="color:var(--success);font-weight:600;">${low !== null ? formatPrice(low) : '--'}</td>`;
      }
    },
    {
      label: '7日波动',
      key: 'fluctuation',
      render: (item) => {
        const f = getRecentFluctuation(item.priceHistory, 7);
        const cls = f.trend === 'down' ? 'price-down' : f.trend === 'up' ? 'price-up' : 'price-same';
        return `<td><span class="${cls}">${f.trend === 'down' ? '↓' : f.trend === 'up' ? '↑' : '→'} ${f.percent.toFixed(1)}%</span></td>`;
      }
    },
    {
      label: '平台',
      key: 'platform',
      render: (item) => `<td><span class="badge badge-primary">${item.platform}</span></td>`
    },
    {
      label: '分类',
      key: 'category',
      render: (item) => `<td>${item.category}</td>`
    },
    {
      label: '运费',
      key: 'shipping',
      render: (item) => `<td>${item.shipping || '--'}</td>`
    },
    {
      label: '保修',
      key: 'warranty',
      render: (item) => `<td>${item.warranty || '--'}</td>`
    },
    {
      label: '优惠说明',
      key: 'discount',
      render: (item) => `<td>${item.discountInfo ? `<span class="badge badge-warning">${escapeHtml(item.discountInfo)}</span>` : '--'}</td>`
    },
    {
      label: '用途',
      key: 'usage',
      render: (item) => `<td>${item.usage || '--'}</td>`
    },
    {
      label: '评价摘要',
      key: 'rating',
      render: (item) => `<td>${item.ratingSummary || '--'}</td>`
    }
  ];

  if (allSpecKeys.length > 0) {
    rows.push({
      label: '── 规格参数 ──',
      key: 'spec-divider',
      render: () => '',
      isDivider: true
    });
    allSpecKeys.forEach(key => {
      rows.push({
        label: key,
        key: `spec-${key}`,
        isSpec: true,
        render: (item) => `<td>${item.specs && item.specs[key] ? escapeHtml(item.specs[key]) : '--'}</td>`
      });
    });
  }

  rows.push({
    label: '备注',
    key: 'notes',
    render: (item) => `<td>${item.notes ? escapeHtml(item.notes) : '--'}</td>`
  });
  rows.push({
    label: '状态',
    key: 'status',
    render: (item) => `<td><span class="badge ${item.status === 'active' ? 'badge-success' : 'badge-warning'}">${item.status === 'active' ? '观察中' : '已暂停'}</span></td>`
  });

  const tbody = document.getElementById('compare-body');
  tbody.innerHTML = rows.map(row => {
    if (row.isDivider) {
      return `<tr><td class="row-label" style="text-align:center;font-weight:600;color:var(--text-secondary);">${row.label}</td>${items.map(() => '<td></td>').join('')}</tr>`;
    }
    if (row.isSpec) {
      return `<tr class="spec-row"><td class="row-label">${row.label}</td>${items.map(i => row.render(i)).join('')}</tr>`;
    }
    return `<tr><td class="row-label">${row.label}</td>${items.map(i => row.render(i)).join('')}</tr>`;
  }).join('');

  cardsEl.innerHTML = items.map(item => {
    const si = scoreMap[item.id];
    const isCheapest = item.currentPrice === minPrice && items.length > 1;
    const isTop = si.rank === 1 && items.length >= 2;
    const low = getLowestPrice(item.priceHistory);
    const high = getHighestPrice(item.priceHistory);
    const fluctuation = getRecentFluctuation(item.priceHistory, 7);

    let specsHtml = '';
    if (allSpecKeys.length > 0) {
      const specRows = allSpecKeys.map(key => {
        const val = item.specs && item.specs[key] ? escapeHtml(item.specs[key]) : '--';
        return `<div class="card-spec-item"><span class="spec-k">${escapeHtml(key)}</span><span class="spec-v ${val === '--' ? 'spec-empty' : ''}">${val}</span></div>`;
      }).join('');
      specsHtml = `
        <div class="card-specs">
          <div class="card-specs-title">规格参数</div>
          <div class="card-specs-list">${specRows}</div>
        </div>`;
    }

    return `
      <div class="compare-card ${isCheapest ? 'best-price' : ''} ${isTop ? 'top-ranked' : ''} ${si.isOverBudget ? 'over-budget' : ''}">
        ${isTop ? '<div class="compare-card-best compare-card-top">🏆 推荐 #1</div>' : ''}
        ${isCheapest && !isTop ? '<div class="compare-card-best">💰 最低价</div>' : ''}
        ${si.isOverBudget ? '<div class="compare-card-best compare-card-overbudget">⚠️ 超预算</div>' : ''}
        <div class="compare-card-head">
          <div class="compare-card-name">${escapeHtml(item.name)}</div>
          <div class="compare-card-price">${formatPrice(item.currentPrice)}</div>
        </div>
        ${items.length >= 2 ? `
          <div class="compare-card-score">
            <div class="score-info">
              <span class="score-label">综合得分</span>
              <span class="score-value">${si.totalScore.toFixed(1)}<span class="score-max">/100</span></span>
            </div>
            <div class="score-bar-bg">
              <div class="score-bar-fill" style="width:${si.totalScore}%"></div>
            </div>
            <div class="score-breakdown">
              <span title="价格得分">💰 ${si.scores.price.toFixed(0)}</span>
              <span title="保修得分">🛡️ ${si.scores.warranty.toFixed(0)}</span>
              <span title="评价得分">⭐ ${si.scores.rating.toFixed(0)}</span>
              <span title="规格得分">📐 ${si.scores.specs.toFixed(0)}</span>
            </div>
          </div>` : ''}
        <div class="compare-card-rows">
          <div class="compare-card-row"><span class="label">目标价格</span><span class="value ${isTargetReached(item) ? 'price-down' : ''}">${formatPrice(item.targetPrice)} ${isTargetReached(item) ? '✅' : ''}</span></div>
          <div class="compare-card-row"><span class="label">预算上限</span><span class="value">${item.budget ? formatPrice(item.budget) : '--'}</span></div>
          <div class="compare-card-row"><span class="label">历史最低</span><span class="value price-down">${low !== null ? formatPrice(low) : '--'}</span></div>
          <div class="compare-card-row"><span class="label">历史最高</span><span class="value price-up">${high !== null ? formatPrice(high) : '--'}</span></div>
          <div class="compare-card-row"><span class="label">7日波动</span><span class="value ${fluctuation.trend === 'down' ? 'price-down' : fluctuation.trend === 'up' ? 'price-up' : ''}">${fluctuation.trend === 'down' ? '↓' : fluctuation.trend === 'up' ? '↑' : '→'} ${fluctuation.percent.toFixed(1)}%</span></div>
          <div class="compare-card-row"><span class="label">平台</span><span class="value">${item.platform}</span></div>
          <div class="compare-card-row"><span class="label">运费</span><span class="value">${item.shipping || '--'}</span></div>
          <div class="compare-card-row"><span class="label">保修</span><span class="value">${item.warranty || '--'}</span></div>
          <div class="compare-card-row"><span class="label">优惠</span><span class="value">${item.discountInfo || '--'}</span></div>
          <div class="compare-card-row"><span class="label">评价</span><span class="value">${item.ratingSummary || '--'}</span></div>
          ${specsHtml}
        </div>
        <button class="btn btn-sm btn-ghost compare-card-remove" data-id="${item.id}">✕ 移除</button>
      </div>`;
  }).join('');

  cardsEl.querySelectorAll('.compare-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const scheme = getActiveScheme();
      if (scheme) {
        scheme.itemIds = scheme.itemIds.filter(id => id !== btn.dataset.id);
        saveSchemesToStorage();
      }
      populateSelect();
      renderCompare();
    });
  });
}

function calculateScores(item, allItems, allSpecKeys) {
  const prices = allItems.map(i => i.currentPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  let priceScore = 0;
  if (maxPrice !== minPrice) {
    priceScore = 100 - ((item.currentPrice - minPrice) / (maxPrice - minPrice)) * 100;
  } else {
    priceScore = 100;
  }

  let warrantyScore = 50;
  if (item.warranty) {
    const w = item.warranty;
    if (w.includes('终') || w.includes('终身')) warrantyScore = 100;
    else if (w.includes('3年') || w.includes('三年')) warrantyScore = 90;
    else if (w.includes('2年') || w.includes('两年')) warrantyScore = 80;
    else if (w.includes('1年') || w.includes('一年') || w.includes('12个月')) warrantyScore = 70;
    else if (w.includes('6个月') || w.includes('半年')) warrantyScore = 60;
    else if (w.includes('3个月')) warrantyScore = 55;
    else warrantyScore = 65;
  } else {
    warrantyScore = 20;
  }

  let ratingScore = 50;
  if (item.ratingSummary) {
    const r = item.ratingSummary;
    const match = r.match(/(\d+\.?\d*)\s*分/);
    if (match) {
      const score = parseFloat(match[1]);
      ratingScore = Math.min(100, (score / 5) * 100);
    } else {
      ratingScore = 60;
    }
  } else {
    ratingScore = 30;
  }

  let specsScore = 50;
  if (item.specs && Object.keys(item.specs).length > 0) {
    const count = Object.keys(item.specs).length;
    const maxCount = Math.max(...allItems.map(i => i.specs ? Object.keys(i.specs).length : 0));
    if (maxCount > 0) {
      specsScore = (count / maxCount) * 100;
    }
  } else {
    specsScore = 20;
  }

  return {
    price: Math.round(priceScore * 10) / 10,
    warranty: Math.round(warrantyScore * 10) / 10,
    rating: Math.round(ratingScore * 10) / 10,
    specs: Math.round(specsScore * 10) / 10
  };
}

function renderRecommendation(scoredItems, scheme) {
  const list = document.getElementById('recommendation-list');

  list.innerHTML = scoredItems.map((si, idx) => {
    const item = si.item;
    const isTop = idx === 0;
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

    const reasons = [];
    if (si.isOverBudget) reasons.push({ text: '⚠️ 超预算', warn: true });
    else if (si.scores.price >= 80) reasons.push({ text: '价格有优势' });
    if (si.scores.warranty >= 80) reasons.push({ text: '保修有保障' });
    if (si.scores.rating >= 80) reasons.push({ text: '评价优秀' });
    if (si.scores.specs >= 80) reasons.push({ text: '规格丰富' });
    if (isTargetReached(item)) reasons.push({ text: '已达目标价' });
    if (scheme && scheme.budget && item.currentPrice <= scheme.budget) reasons.push({ text: '在预算内' });

    return `
      <div class="rec-item ${isTop ? 'rec-top' : ''}">
        <div class="rec-rank">${medal}</div>
        <div class="rec-info">
          <div class="rec-name">${escapeHtml(item.name)}</div>
          <div class="rec-reasons">
            ${reasons.map(r => `<span class="rec-reason ${r.warn ? 'rec-reason-warn' : ''}">${r.text}</span>`).join('')}
          </div>
        </div>
        <div class="rec-score">
          <div class="rec-score-val">${si.totalScore.toFixed(1)}</div>
          <div class="rec-score-label">综合得分</div>
        </div>
        <div class="rec-price">${formatPrice(item.currentPrice)}</div>
      </div>
    `;
  }).join('');
}

function exportCompare() {
  const scheme = getActiveScheme();
  if (!scheme || scheme.itemIds.length === 0) {
    alert('当前方案中没有商品');
    return;
  }

  const items = scheme.itemIds.map(id => allItems.find(i => i.id === id)).filter(Boolean);
  const schemeName = scheme.name;

  const { scoredItems, weights } = calculateAndRankItems(items, scheme);

  const scoreMap = {};
  scoredItems.forEach(si => { scoreMap[si.item.id] = si; });

  const allSpecKeys = new Set();
  items.forEach(i => { if (i.specs) Object.keys(i.specs).forEach(k => allSpecKeys.add(k)); });

  let csv = `对比方案: ${schemeName}\n`;
  if (scheme.scene) csv += `购买场景: ${scheme.scene}\n`;
  if (scheme.budget) csv += `预算上限: ${formatPrice(scheme.budget)}\n`;
  csv += `权重偏好 - 价格:${weights.price}% 保修:${weights.warranty}% 评价:${weights.rating}% 规格:${weights.specs}%\n\n`;

  csv += `🏆 推荐排序 (按综合得分)\n`;
  scoredItems.forEach((si, idx) => {
    csv += `第${idx + 1}名: ${si.item.name} - 综合得分 ${si.totalScore.toFixed(1)} - ${formatPrice(si.item.currentPrice)}`;
    if (si.isOverBudget) csv += ' (超预算)';
    csv += '\n';
  });
  csv += `\n`;

  const headers = ['属性', ...items.map(i => i.name)];
  csv += headers.map(h => `"${h}"`).join(',') + '\n';

  const rows = [
    ['综合得分', ...items.map(i => scoreMap[i.id].totalScore.toFixed(1) + '/100')],
    ['推荐排名', ...items.map(i => `第${scoreMap[i.id].rank}名`)],
    ['是否超预算', ...items.map(i => scoreMap[i.id].isOverBudget ? '是' : '否')],
    ['当前价格', ...items.map(i => i.currentPrice)],
    ['目标价格', ...items.map(i => i.targetPrice || '--')],
    ['预算上限', ...items.map(i => i.budget || '--')],
    ['价格得分', ...items.map(i => scoreMap[i.id].scores.price.toFixed(1))],
    ['保修得分', ...items.map(i => scoreMap[i.id].scores.warranty.toFixed(1))],
    ['评价得分', ...items.map(i => scoreMap[i.id].scores.rating.toFixed(1))],
    ['规格得分', ...items.map(i => scoreMap[i.id].scores.specs.toFixed(1))],
    ['平台', ...items.map(i => i.platform)],
    ['分类', ...items.map(i => i.category)],
    ['运费', ...items.map(i => i.shipping || '--')],
    ['保修', ...items.map(i => i.warranty || '--')],
    ['优惠说明', ...items.map(i => i.discountInfo || '--')],
    ['用途', ...items.map(i => i.usage || '--')],
    ['评价摘要', ...items.map(i => i.ratingSummary || '--')],
    ['备注', ...items.map(i => i.notes || '--')]
  ];

  allSpecKeys.forEach(key => {
    rows.push([key, ...items.map(i => i.specs && i.specs[key] ? i.specs[key] : '--')]);
  });

  csv += rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `对比方案-${schemeName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
