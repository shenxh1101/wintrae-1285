let settings = {};

document.addEventListener('DOMContentLoaded', async () => {
  settings = await getSettings();
  initFormValues();
  initEventListeners();
  renderBlockedWords();
});

function initFormValues() {
  document.getElementById('setting-frequency').value = settings.reminderFrequency || 'daily';
  document.getElementById('setting-target-notify').checked = settings.targetNotify !== false;
  document.getElementById('setting-drop-notify').checked = settings.dropNotify !== false;
  document.getElementById('setting-auto-detect').checked = settings.autoDetect !== false;
  document.getElementById('setting-currency').value = settings.currency || 'CNY';
}

function initEventListeners() {
  document.getElementById('setting-frequency').addEventListener('change', saveFormSettings);
  document.getElementById('setting-target-notify').addEventListener('change', saveFormSettings);
  document.getElementById('setting-drop-notify').addEventListener('change', saveFormSettings);
  document.getElementById('setting-auto-detect').addEventListener('change', saveFormSettings);
  document.getElementById('setting-currency').addEventListener('change', saveFormSettings);

  document.getElementById('btn-add-word').addEventListener('click', addBlockedWord);
  document.getElementById('new-blocked-word').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBlockedWord();
  });

  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', importData);
  document.getElementById('btn-clear-all').addEventListener('click', clearAllData);
}

async function saveFormSettings() {
  settings = {
    ...settings,
    reminderFrequency: document.getElementById('setting-frequency').value,
    targetNotify: document.getElementById('setting-target-notify').checked,
    dropNotify: document.getElementById('setting-drop-notify').checked,
    autoDetect: document.getElementById('setting-auto-detect').checked,
    currency: document.getElementById('setting-currency').value
  };
  await saveSettings(settings);

  const intervalMap = {
    realtime: 5,
    hourly: 60,
    daily: 1440,
    weekly: 10080,
    off: 0
  };

  if (chrome.alarms) {
    const minutes = intervalMap[settings.reminderFrequency] || 60;
    if (minutes > 0) {
      chrome.alarms.create('priceCheck', { periodInMinutes: minutes });
    } else {
      chrome.alarms.clear('priceCheck');
    }
  }
}

function renderBlockedWords() {
  const list = document.getElementById('blocked-words-list');
  const words = settings.blockedWords || [];

  if (words.length === 0) {
    list.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">暂无屏蔽词</span>';
    return;
  }

  list.innerHTML = words.map((word, idx) => `
    <span class="word-tag">
      ${escapeHtml(word)}
      <button class="word-tag-remove" data-idx="${idx}">✕</button>
    </span>
  `).join('');

  list.querySelectorAll('.word-tag-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const words = settings.blockedWords || [];
      words.splice(idx, 1);
      settings.blockedWords = words;
      await saveSettings(settings);
      renderBlockedWords();
    });
  });
}

async function addBlockedWord() {
  const input = document.getElementById('new-blocked-word');
  const word = input.value.trim();
  if (!word) return;

  if (!settings.blockedWords) {
    settings.blockedWords = [];
  }

  if (settings.blockedWords.includes(word)) {
    alert('该屏蔽词已存在');
    return;
  }

  settings.blockedWords.push(word);
  await saveSettings(settings);
  input.value = '';
  renderBlockedWords();
}

async function exportJSON() {
  const items = await getAllItems();
  const content = exportToJSON(items);
  downloadFile(content, 'price-hunter-export.json', 'application/json');
}

async function exportCSV() {
  const items = await getAllItems();
  const content = exportToCSV(items);
  downloadFile(content, 'price-hunter-export.csv', 'text/csv;charset=utf-8');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) {
        alert('导入失败：数据格式不正确');
        return;
      }

      const existing = await getAllItems();
      const existingIds = new Set(existing.map(i => i.id));
      const newItems = imported.filter(i => !existingIds.has(i.id));

      if (newItems.length === 0) {
        alert('没有新数据需要导入');
        return;
      }

      const merged = [...newItems, ...existing];
      await saveAllItems(merged);
      alert(`成功导入 ${newItems.length} 个商品`);
    } catch (err) {
      alert('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

async function clearAllData() {
  if (!confirm('确定要清空所有数据吗？此操作不可撤销！')) return;
  if (!confirm('再次确认：所有观察商品和价格记录将被永久删除')) return;

  await saveAllItems([]);
  alert('所有数据已清空');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
