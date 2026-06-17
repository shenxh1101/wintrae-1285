let allItems = [];
let compareIds = [];

document.addEventListener('DOMContentLoaded', async () => {
  allItems = await getAllItems();
  populateSelect();
  renderCompare();

  document.getElementById('btn-add-to-compare').addEventListener('click', addToCompare);
  document.getElementById('btn-clear-compare').addEventListener('click', clearCompare);
});

function populateSelect() {
  const select = document.getElementById('add-item-select');
  const available = allItems.filter(i => !compareIds.includes(i.id));
  select.innerHTML = '<option value="">选择商品添加到比较...</option>' +
    available.map(i => `<option value="${i.id}">${escapeHtml(i.name)} - ${formatPrice(i.currentPrice)}</option>`).join('');
}

function addToCompare() {
  const select = document.getElementById('add-item-select');
  const id = select.value;
  if (!id || compareIds.includes(id)) return;

  compareIds.push(id);
  populateSelect();
  renderCompare();
  select.value = '';
}

function clearCompare() {
  compareIds = [];
  populateSelect();
  renderCompare();
}

async function renderCompare() {
  allItems = await getAllItems();
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
    },
    {
      label: '备注',
      key: 'notes',
      render: (item) => `<td>${item.notes ? escapeHtml(item.notes) : '--'}</td>`
    },
    {
      label: '状态',
      key: 'status',
      render: (item) => `<td><span class="badge ${item.status === 'active' ? 'badge-success' : 'badge-warning'}">${item.status === 'active' ? '观察中' : '已暂停'}</span></td>`
    }
  ];

  const tbody = document.getElementById('compare-body');
  tbody.innerHTML = rows.map(row => {
    return `<tr><td class="row-label">${row.label}</td>${items.map(i => row.render(i)).join('')}</tr>`;
  }).join('');

  cardsEl.innerHTML = items.map(item => {
    const isCheapest = item.currentPrice === minPrice && items.length > 1;
    const low = getLowestPrice(item.priceHistory);
    const high = getHighestPrice(item.priceHistory);
    const fluctuation = getRecentFluctuation(item.priceHistory, 7);

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
        </div>
        <button class="btn btn-sm btn-ghost compare-card-remove" data-id="${item.id}">✕ 移除</button>
      </div>`;
  }).join('');

  cardsEl.querySelectorAll('.compare-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      compareIds = compareIds.filter(id => id !== btn.dataset.id);
      populateSelect();
      renderCompare();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
