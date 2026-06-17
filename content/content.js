(function () {
  let fab = null;
  let modal = null;
  let isAdded = false;
  let currentUrl = '';

  function init() {
    if (document.getElementById('price-hunter-fab')) return;

    fab = document.createElement('button');
    fab.id = 'price-hunter-fab';
    fab.className = 'price-hunter-fab';
    fab.innerHTML = '💰';
    fab.title = '价格猎手 - 加入观察';
    fab.addEventListener('click', toggleModal);
    document.body.appendChild(fab);

    checkIfAdded();
  }

  function checkIfAdded() {
    chrome.storage.local.get('price_hunter_data', (result) => {
      const items = result.price_hunter_data || [];
      currentUrl = window.location.href;
      isAdded = items.some(i => i.url === currentUrl);
      updateFabState();
    });
  }

  function updateFabState() {
    if (!fab) return;
    if (isAdded) {
      fab.classList.add('added');
      fab.innerHTML = '✅';
      fab.title = '价格猎手 - 已在观察中';
    } else {
      fab.classList.remove('added');
      fab.innerHTML = '💰';
      fab.title = '价格猎手 - 加入观察';
    }
  }

  function toggleModal() {
    if (isAdded) {
      showToast('该商品已在观察清单中');
      return;
    }
    if (modal) {
      closeModal();
      return;
    }
    openModal();
  }

  function openModal() {
    modal = document.createElement('div');
    modal.className = 'price-hunter-modal';
    modal.innerHTML = buildModalHTML();
    document.body.appendChild(modal);

    modal.querySelector('.ph-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.ph-btn-ghost').addEventListener('click', closeModal);
    modal.querySelector('.ph-btn-primary').addEventListener('click', handleSubmit);

    const nameInput = modal.querySelector('#ph-name');
    if (nameInput) nameInput.value = document.title || '';

    modal.querySelector('#ph-url').value = window.location.href;
  }

  function closeModal() {
    if (modal) {
      modal.remove();
      modal = null;
    }
  }

  function buildModalHTML() {
    return `
      <div class="ph-modal-header">
        <h3>🎯 加入价格观察</h3>
        <button class="ph-modal-close">✕</button>
      </div>
      <div class="ph-modal-body">
        <div>
          <label for="ph-name">商品名称</label>
          <input type="text" id="ph-name" placeholder="输入商品名称">
        </div>
        <input type="hidden" id="ph-url">
        <div class="ph-price-row">
          <div>
            <label for="ph-price">当前价格 (¥)</label>
            <input type="number" id="ph-price" placeholder="0.00" step="0.01" min="0">
          </div>
          <div>
            <label for="ph-target">目标价格 (¥)</label>
            <input type="number" id="ph-target" placeholder="0.00" step="0.01" min="0">
          </div>
        </div>
        <div class="ph-price-row">
          <div>
            <label for="ph-budget">预算上限 (¥)</label>
            <input type="number" id="ph-budget" placeholder="0.00" step="0.01" min="0">
          </div>
          <div>
            <label for="ph-category">分类</label>
            <select id="ph-category">
              <option value="数码">数码</option>
              <option value="家电">家电</option>
              <option value="服饰">服饰</option>
              <option value="食品">食品</option>
              <option value="家居">家居</option>
              <option value="图书">图书</option>
              <option value="美妆">美妆</option>
              <option value="运动">运动</option>
              <option value="未分类">其他</option>
            </select>
          </div>
        </div>
        <div>
          <label for="ph-usage">用途</label>
          <input type="text" id="ph-usage" placeholder="自用 / 送礼 / 办公等">
        </div>
        <div>
          <label for="ph-notes">备注</label>
          <textarea id="ph-notes" rows="2" placeholder="其他需要记录的信息"></textarea>
        </div>
      </div>
      <div class="ph-modal-footer">
        <button class="ph-btn ph-btn-ghost">取消</button>
        <button class="ph-btn ph-btn-primary">加入观察</button>
      </div>
    `;
  }

  function handleSubmit() {
    const name = modal.querySelector('#ph-name').value.trim();
    const url = modal.querySelector('#ph-url').value;
    const price = parseFloat(modal.querySelector('#ph-price').value) || 0;
    const target = parseFloat(modal.querySelector('#ph-target').value) || 0;
    const budget = parseFloat(modal.querySelector('#ph-budget').value) || 0;
    const category = modal.querySelector('#ph-category').value;
    const usage = modal.querySelector('#ph-usage').value.trim();
    const notes = modal.querySelector('#ph-notes').value.trim();

    if (!name) {
      showToast('请输入商品名称');
      return;
    }
    if (price <= 0) {
      showToast('请输入当前价格');
      return;
    }

    const newItem = { name, url, currentPrice: price, targetPrice: target, budget, category, usage, notes };

    chrome.storage.local.get('price_hunter_data', (result) => {
      const items = result.price_hunter_data || [];
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      items.unshift({
        id,
        name: newItem.name,
        url: newItem.url,
        imageUrl: '',
        platform: detectPlatform(newItem.url),
        category: newItem.category,
        currentPrice: newItem.currentPrice,
        targetPrice: newItem.targetPrice,
        budget: newItem.budget,
        usage: newItem.usage,
        notes: newItem.notes,
        specs: {},
        shipping: '免运费',
        warranty: '',
        ratingSummary: '',
        discountInfo: '',
        priceHistory: [{ price: newItem.currentPrice, date: new Date().toISOString(), source: '手动添加' }],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      chrome.storage.local.set({ price_hunter_data: items }, () => {
        isAdded = true;
        updateFabState();
        closeModal();
        showToast('✅ 已加入观察清单');
      });
    });
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
    ];
    for (const p of platforms) {
      if (p.pattern.test(url)) return p.name;
    }
    return '其他';
  }

  function showToast(msg) {
    const existing = document.querySelector('.ph-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'ph-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
