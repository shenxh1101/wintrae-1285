const COMPARE_SCHEMES_KEY = 'price_hunter_compare_schemes';
const ACTIVE_SCHEME_KEY = 'price_hunter_active_scheme';

let allItems = [];
let schemes = [];
let activeSchemeId = null;

document.addEventListener('DOMContentLoaded', async () => {
  allItems = await getAllItems();
  schemes = await getStorage(COMPARE_SCHEMES_KEY) || [];
  activeSchemeId = await getStorage(ACTIVE_SCHEME_KEY) || null;

  populateSelect();
  renderSchemes();
  renderCompare();

  document.getElementById('btn-add-to-compare').addEventListener('click', addToCompare);
  document.getElementById('btn-clear-compare').addEventListener('click', clearCurrentScheme);
  document.getElementById('btn-save-scheme').addEventListener('click', saveNewScheme);
  document.getElementById('btn-export-compare').addEventListener('click', exportCompare);
});

async function saveSchemesToStorage() {
  await setStorage(COMPARE_SCHEMES_KEY, schemes);
  await setStorage(ACTIVE_SCHEME_KEY, activeSchemeId);
}

function getCompareIds() {
  const scheme = schemes.find(s => s.id === activeSchemeId);
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

  let scheme = schemes.find(s => s.id === activeSchemeId);
  if (!scheme) {
    scheme = { id: Date.now().toString(36), name: '新方案', itemIds: [] };
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

async function clearCurrentScheme() {
  const scheme = schemes.find(s => s.id === activeSchemeId);
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

  const scheme = { id: Date.now().toString(36), name, itemIds: [] };
  schemes.push(scheme);
  activeSchemeId = scheme.id;
  nameInput.value = '';
  saveSchemesToStorage();
  renderSchemes();
  renderCompare();
}

function switchScheme(id) {
  activeSchemeId = id;
  saveSchemesToStorage();
  populateSelect();
  renderSchemes();
  renderCompare();
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

async function renderCompare() {
  allItems = await getAllItems();
  const compareIds = getCompareIds();
  const items = compareIds.map(id => allItems.find(i => i.id === id)).filter(Boolean);

  const emptyEl = document.getElementById('compare-empty');
  const contentEl = document.getElementById('compare-content');
  const cardsEl = document.getElementById('compare-cards');

  if (items.length === 0) {
    emptyEl.style.display = '';
    contentEl.classList.add('hidden');
    cardsEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  contentEl.classList.remove('hidden');

  const minPrice = Math.min(...items.map(i => i.currentPrice));
  const maxPrice = Math.max(...items.map(i => i.currentPrice));
  const priceRange = maxPrice - minPrice || 1;

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

  const thead = document.getElementById('compare-head');
  thead.innerHTML = `<tr><th>属性</th>${items.map(i => `<th>${escapeHtml(i.name)}</th>`).join('')}</tr>`;

  const rows = [
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
    const isCheapest = item.currentPrice === minPrice && items.length > 1;
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
      <div class="compare-card ${isCheapest ? 'best-price' : ''}">
        ${isCheapest ? '<div class="compare-card-best">💰 最低价</div>' : ''}
        <div class="compare-card-head">
          <div class="compare-card-name">${escapeHtml(item.name)}</div>
          <div class="compare-card-price">${formatPrice(item.currentPrice)}</div>
        </div>
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
      const scheme = schemes.find(s => s.id === activeSchemeId);
      if (scheme) {
        scheme.itemIds = scheme.itemIds.filter(id => id !== btn.dataset.id);
        saveSchemesToStorage();
      }
      populateSelect();
      renderCompare();
    });
  });
}

function exportCompare() {
  const scheme = schemes.find(s => s.id === activeSchemeId);
  if (!scheme || scheme.itemIds.length === 0) {
    alert('当前方案中没有商品');
    return;
  }

  const items = scheme.itemIds.map(id => allItems.find(i => i.id === id)).filter(Boolean);
  const schemeName = scheme.name;

  let csv = `对比方案: ${schemeName}\n\n`;
  const headers = ['属性', ...items.map(i => i.name)];
  csv += headers.map(h => `"${h}"`).join(',') + '\n';

  const rows = [
    ['当前价格', ...items.map(i => i.currentPrice)],
    ['目标价格', ...items.map(i => i.targetPrice || '--')],
    ['预算上限', ...items.map(i => i.budget || '--')],
    ['平台', ...items.map(i => i.platform)],
    ['分类', ...items.map(i => i.category)],
    ['运费', ...items.map(i => i.shipping || '--')],
    ['保修', ...items.map(i => i.warranty || '--')],
    ['优惠说明', ...items.map(i => i.discountInfo || '--')],
    ['用途', ...items.map(i => i.usage || '--')],
    ['评价摘要', ...items.map(i => i.ratingSummary || '--')],
    ['备注', ...items.map(i => i.notes || '--')]
  ];

  const allSpecKeys = new Set();
  items.forEach(i => { if (i.specs) Object.keys(i.specs).forEach(k => allSpecKeys.add(k)); });
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
