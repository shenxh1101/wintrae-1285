let allItems = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  allItems = await getAllItems();
  initFilters();
  renderList();

  document.getElementById('search-input').addEventListener('input', renderList);
  document.getElementById('filter-category').addEventListener('change', renderList);
  document.getElementById('filter-status').addEventListener('change', renderList);
  document.getElementById('sort-by').addEventListener('change', renderList);

  document.getElementById('btn-add-demo').addEventListener('click', addDemoItems);

  document.getElementById('edit-modal-close').addEventListener('click', closeModal);
  document.getElementById('edit-cancel').addEventListener('click', closeModal);
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);
  document.getElementById('edit-save').addEventListener('click', handleSave);
});

function initFilters() {
  const categories = getCategories(allItems);
  const select = document.getElementById('filter-category');
  select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function renderList() {
  allItems = await getAllItems();
  initFilters();

  const search = document.getElementById('search-input').value.toLowerCase();
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const sortBy = document.getElementById('sort-by').value;

  let items = [...allItems];

  if (search) {
    items = items.filter(i => i.name.toLowerCase().includes(search));
  }
  if (category !== '全部') {
    items = items.filter(i => i.category === category);
  }
  if (status === 'active') {
    items = items.filter(i => i.status === 'active' && !isTargetReached(i));
  } else if (status === 'paused') {
    items = items.filter(i => i.status === 'paused');
  } else if (status === 'reached') {
    items = items.filter(i => isTargetReached(i));
  }

  items.sort((a, b) => {
    switch (sortBy) {
      case 'createdAt': return new Date(b.createdAt) - new Date(a.createdAt);
      case 'currentPrice': return a.currentPrice - b.currentPrice;
      case 'currentPrice-desc': return b.currentPrice - a.currentPrice;
      case 'name': return a.name.localeCompare(b.name);
      default: return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
  });

  const activeCount = allItems.filter(i => i.status === 'active').length;
  const reachedCount = allItems.filter(i => isTargetReached(i)).length;
  const pausedCount = allItems.filter(i => i.status === 'paused').length;

  document.getElementById('summary-count').textContent = `${items.length} 个商品`;
  document.getElementById('summary-reached').textContent = `${reachedCount} 个达标`;
  document.getElementById('summary-paused').textContent = `${pausedCount} 个暂停`;

  const container = document.getElementById('watchlist-container');

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="icon">📋</div>
        <div class="title">暂无观察商品</div>
        <div class="desc">在商品页面点击 💰 按钮添加，或点击"添加示例"体验功能</div>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => renderCard(item)).join('');

  container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = allItems.find(i => i.id === id);
      if (item) {
        await updateItem(id, { status: item.status === 'active' ? 'paused' : 'active' });
        renderList();
      }
    });
  });

  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这个观察商品吗？')) {
        await deleteItem(btn.dataset.id);
        renderList();
      }
    });
  });

  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });
}

function renderCard(item) {
  const low = getLowestPrice(item.priceHistory);
  const high = getHighestPrice(item.priceHistory);
  const fluctuation = getRecentFluctuation(item.priceHistory, 7);
  const reached = isTargetReached(item);

  return `
    <div class="wl-card ${reached ? 'reached' : ''} ${item.status === 'paused' ? 'paused' : ''}">
      <div class="wl-card-head">
        <div class="wl-card-name">${escapeHtml(item.name)}</div>
        <div class="wl-card-price">${formatPrice(item.currentPrice)}</div>
      </div>
      <div class="wl-card-tags">
        <span class="badge badge-primary">${item.platform}</span>
        <span class="badge badge-primary">${item.category}</span>
        ${reached ? '<span class="badge badge-success">🎯 达标</span>' : ''}
        ${item.status === 'paused' ? '<span class="badge badge-warning">已暂停</span>' : ''}
        ${item.discountInfo ? `<span class="badge badge-warning">${escapeHtml(item.discountInfo)}</span>` : ''}
      </div>
      <div class="wl-card-info">
        ${item.targetPrice ? `<div class="info-row"><span>目标价格</span><span class="info-value ${reached ? 'price-down' : ''}">${formatPrice(item.targetPrice)}</span></div>` : ''}
        ${item.budget ? `<div class="info-row"><span>预算上限</span><span class="info-value">${formatPrice(item.budget)}</span></div>` : ''}
        <div class="info-row"><span>历史最低</span><span class="info-value price-down">${low !== null ? formatPrice(low) : '--'}</span></div>
        <div class="info-row"><span>历史最高</span><span class="info-value price-up">${high !== null ? formatPrice(high) : '--'}</span></div>
        <div class="info-row">
          <span>7日波动</span>
          <span class="info-value ${fluctuation.trend === 'down' ? 'price-down' : fluctuation.trend === 'up' ? 'price-up' : ''}">
            ${fluctuation.trend === 'down' ? '↓' : fluctuation.trend === 'up' ? '↑' : '→'} ${fluctuation.percent.toFixed(1)}%
          </span>
        </div>
        ${item.usage ? `<div class="info-row"><span>用途</span><span class="info-value">${escapeHtml(item.usage)}</span></div>` : ''}
        <div class="info-row"><span>更新时间</span><span class="info-value">${formatDate(item.updatedAt)}</span></div>
      </div>
      <div class="wl-card-actions">
        <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${item.id}">✏️ 编辑</button>
        <button class="btn btn-sm ${item.status === 'active' ? 'btn-ghost' : 'btn-success'}" data-action="toggle" data-id="${item.id}">
          ${item.status === 'active' ? '⏸ 暂停' : '▶ 恢复'}
        </button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${item.id}">🗑 删除</button>
      </div>
    </div>`;
}

function openEditModal(id) {
  editingId = id;
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  document.getElementById('edit-modal-title').textContent = '编辑商品';
  const body = document.getElementById('edit-modal-body');

  body.innerHTML = `
    <div class="form-group">
      <label>商品名称</label>
      <input type="text" id="edit-name" value="${escapeAttr(item.name)}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>目标价格 (¥)</label>
        <input type="number" id="edit-target" value="${item.targetPrice || ''}" step="0.01" min="0">
      </div>
      <div class="form-group">
        <label>预算上限 (¥)</label>
        <input type="number" id="edit-budget" value="${item.budget || ''}" step="0.01" min="0">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>分类</label>
        <select id="edit-category">
          ${['数码', '家电', '服饰', '食品', '家居', '图书', '美妆', '运动', '未分类'].map(c =>
            `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>运费</label>
        <input type="text" id="edit-shipping" value="${escapeAttr(item.shipping || '')}">
      </div>
    </div>
    <div class="form-group">
      <label>用途</label>
      <input type="text" id="edit-usage" value="${escapeAttr(item.usage || '')}">
    </div>
    <div class="form-group">
      <label>保修</label>
      <input type="text" id="edit-warranty" value="${escapeAttr(item.warranty || '')}">
    </div>
    <div class="form-group">
      <label>优惠说明</label>
      <input type="text" id="edit-discount" value="${escapeAttr(item.discountInfo || '')}">
    </div>
    <div class="form-group">
      <label>备注</label>
      <textarea id="edit-notes" rows="3">${escapeHtml(item.notes || '')}</textarea>
    </div>
  `;

  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editingId = null;
}

async function handleSave() {
  if (!editingId) return;

  const updates = {
    name: document.getElementById('edit-name').value.trim(),
    targetPrice: parseFloat(document.getElementById('edit-target').value) || 0,
    budget: parseFloat(document.getElementById('edit-budget').value) || 0,
    category: document.getElementById('edit-category').value,
    shipping: document.getElementById('edit-shipping').value.trim(),
    usage: document.getElementById('edit-usage').value.trim(),
    warranty: document.getElementById('edit-warranty').value.trim(),
    discountInfo: document.getElementById('edit-discount').value.trim(),
    notes: document.getElementById('edit-notes').value.trim()
  };

  if (!updates.name) {
    alert('请输入商品名称');
    return;
  }

  await updateItem(editingId, updates);
  closeModal();
  renderList();
}

async function addDemoItems() {
  const demoItems = [
    {
      name: 'Sony WH-1000XM5 无线降噪耳机',
      url: 'https://example.com/sony-xm5',
      currentPrice: 2299,
      targetPrice: 1999,
      budget: 2500,
      category: '数码',
      usage: '自用通勤',
      notes: '黑色款优先',
      shipping: '免运费',
      warranty: '1年保修',
      discountInfo: '满2000减100'
    },
    {
      name: 'Apple iPad Air M2 11英寸',
      url: 'https://example.com/ipad-air',
      currentPrice: 4799,
      targetPrice: 4299,
      budget: 5000,
      category: '数码',
      usage: '办公+娱乐',
      notes: '256GB WiFi版',
      shipping: '免运费',
      warranty: '1年保修',
      discountInfo: '教育优惠可用'
    },
    {
      name: '戴森 V15 Detect 吸尘器',
      url: 'https://example.com/dyson-v15',
      currentPrice: 4490,
      targetPrice: 3999,
      budget: 4500,
      category: '家电',
      usage: '家庭清洁',
      notes: '',
      shipping: '免运费',
      warranty: '2年保修',
      discountInfo: ''
    },
    {
      name: '优衣库 Ultra Light 羽绒服',
      url: 'https://example.com/uniqlo-down',
      currentPrice: 399,
      targetPrice: 299,
      budget: 400,
      category: '服饰',
      usage: '冬季通勤',
      notes: '黑色 M码',
      shipping: '运费8元',
      warranty: '',
      discountInfo: '限时折扣'
    },
    {
      name: 'Kindle Paperwhite 5',
      url: 'https://example.com/kindle-pw5',
      currentPrice: 999,
      targetPrice: 799,
      budget: 1000,
      category: '图书',
      usage: '阅读',
      notes: '',
      shipping: '免运费',
      warranty: '1年保修',
      discountInfo: '会员专享价'
    }
  ];

  for (const item of demoItems) {
    await addItem(item);
  }

  allItems = await getAllItems();
  initFilters();
  renderList();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
