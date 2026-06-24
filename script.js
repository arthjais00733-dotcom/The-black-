/* =========================================
   THE BLACK — MULTI-TABLE ENGINE
   Handles Separate Tables & 50-Word Batches
   ========================================= */

const supabaseUrl = 'https://hbdcavwjbnkyghupsaxo.supabase.co';
const supabaseKey = 'sb_publishable_ozN1P49y3sCErxjH6Ek02Q_cE-ptWDQ';
const sbClient = supabase.createClient(supabaseUrl, supabaseKey);

let wordData = []; 
let mastery = JSON.parse(localStorage.getItem('myMasteryList')) || [];
let currentCategory = '';
let currentIndex = 0;
let unlearned = [];
let allArchive = [];

let practiceQueue = [];
let currentPracticeIndex = 0;
let practiceScore = 0;
let practiceWrongWords = [];

// --- INITIAL UPLINK ---
function initDatabase() {
  const dbStatus = document.getElementById('db-status');
  dbStatus.textContent = "SYSTEM READY";
  dbStatus.style.color = "rgba(255, 255, 255, 0.4)";
}
initDatabase();

// --- NAVIGATION & GESTURE SUPPORT ---
function showScreen(id, pushToHistory = true) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) { 
    el.classList.add('active'); 
    el.classList.add('fade-in'); 
    setTimeout(() => el.classList.remove('fade-in'), 400); 
  }
  if (pushToHistory) { history.pushState({ screenId: id }, '', `#${id}`); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('popstate', (event) => {
  if (event.state && event.state.screenId) { showScreen(event.state.screenId, false); } 
  else { showScreen('category', false); } 
});

window.addEventListener('DOMContentLoaded', () => { history.replaceState({ screenId: 'category' }, '', '#category'); });

function goRoot() { 
  currentCategory = ''; 
  wordData = []; 
  updateStats(); 
  showScreen('category'); 
}

// --- DYNAMIC TABLE FETCHING ---
async function selectCategory(type) {
  let tableName = 'words'; 
  let titleDisplay = type.toUpperCase();
  
  if(type === 'ows') { tableName = 'ows'; titleDisplay = "ONE WORD SUB"; }
  if(type === 'idiom') { tableName = 'idioms'; titleDisplay = "IDIOMS & PHRASES"; }
  if(type === 'vocab') { tableName = 'general_vocabulary'; titleDisplay = "GENERAL VOCAB"; }
  if(type === 'spelling') { tableName = 'spelling_test'; titleDisplay = "SPELLING TEST"; }

  document.getElementById('selected-category-title').textContent = "FETCHING DATA...";
  showScreen('home'); // Show home screen immediately while fetching

  try {
    const { data, error } = await sbClient
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: true }); // Locks batches based on upload time
        
    if (error) throw error;
    
    wordData = data || [];
    currentCategory = type; 

    document.getElementById('selected-category-title').textContent = titleDisplay;
    updateStats();
    
  } catch (err) {
    console.error("Fetch Error:", err);
    document.getElementById('selected-category-title').textContent = "FETCH FAILED";
  }
}

function updateStats() {
  const total = wordData.length;
  // Match by ID or Word to handle UUIDs seamlessly
  const masteredInThisCat = wordData.filter(w => mastery.find(m => m.id === w.id || m.word === w.word)).length;
  const left = total - masteredInThisCat;
  
  document.getElementById('mastered-count').textContent = masteredInThisCat;
  document.getElementById('total-count').textContent = total;
  document.getElementById('left-count').textContent = Math.max(0, left);
  
  const pct = total > 0 ? (masteredInThisCat / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
}

// --- LEARNING MODE (WITH BATCHES) ---
function setMode(mode) {
  if (mode === 'learn') {
    if (wordData.length === 0) { showScreen('empty'); return; }
    renderLearnMenu();
    showScreen('learn-menu');
  } else if (mode === 'practice') {
    const catMastery = mastery.filter(m => wordData.some(w => w.id === m.id || w.word === m.word));
    if (catMastery.length === 0) { showScreen('empty'); return; }
    renderPracticeMenu(catMastery);
    showScreen('practice-menu');
  }
}

function renderLearnMenu() {
  const box = document.getElementById('learn-batch-list');
  box.innerHTML = '';
  const batchSize = 50;
  const totalBatches = Math.ceil(wordData.length / batchSize);
  
  let html = '';
  for(let i=0; i<totalBatches; i++) {
    const batchWords = wordData.slice(i * batchSize, (i + 1) * batchSize);
    const masteredInBatch = batchWords.filter(w => mastery.find(m => m.id === w.id || m.word === w.word)).length;
    const isCompleted = masteredInBatch === batchWords.length;
    
    html += `<button class="mode-btn ${isCompleted ? 'archive-btn' : 'learn-btn'}" onclick="startLearn(${i})" style="width: 100%;">
        <span class="btn-icon">${isCompleted ? '' : ''}</span>
        <span class="btn-label">BATCH ${String(i+1).padStart(2, '0')}</span>
        <span class="btn-sub">${masteredInBatch} / ${batchWords.length} MASTERED</span>
    </button>`;
  }
  box.innerHTML = html;
}

function startLearn(batchIndex) {
  const batchSize = 50;
  const batchWords = wordData.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
  unlearned = batchWords.filter(w => !mastery.find(m => m.id === w.id || m.word === w.word));
  
  if (unlearned.length === 0) { 
      showScreen('all-done'); 
      return; 
  }
  
  // Shuffle unlearned for randomized learning within the batch
  for (let i = unlearned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unlearned[i], unlearned[j]] = [unlearned[j], unlearned[i]];
  }
  
  currentIndex = 0;
  const baseTitle = document.getElementById('selected-category-title').textContent;
  document.getElementById('learn-category-title').textContent = `${baseTitle} - BATCH ${String(batchIndex+1).padStart(2, '0')}`;
  showScreen('learn');
  renderLearn();
}

function renderLearn() {
  const word = unlearned[currentIndex];
  document.getElementById('learn-word').textContent = word.word;
  document.getElementById('learn-meaning').textContent = word.meaning;
  document.getElementById('card-counter').textContent = String(currentIndex + 1).padStart(2, '0') + ' / ' + String(unlearned.length).padStart(2, '0');
}

function nav(dir) {
  currentIndex = (currentIndex + dir + unlearned.length) % unlearned.length;
  renderLearn();
}

function markLearned() {
  const word = unlearned[currentIndex];
  if (!mastery.find(m => m.id === word.id || m.word === word.word)) mastery.push(word);
  localStorage.setItem('myMasteryList', JSON.stringify(mastery));
  unlearned.splice(currentIndex, 1);
  updateStats();
  
  if (unlearned.length === 0) { 
      showScreen('all-done'); 
      renderLearnMenu(); // Update batch counts in background
      return; 
  }
  
  currentIndex = Math.min(currentIndex, unlearned.length - 1);
  renderLearn();
  const card = document.querySelector('.word-card');
  card.classList.add('flash-green');
  setTimeout(() => card.classList.remove('flash-green'), 500);
}

// --- UNIFIED TEST ENGINE ---
function renderPracticeMenu(catMastery) {
    const box = document.getElementById('practice-batch-list');
    box.innerHTML = '';
    const batchSize = 50;
    const totalBatches = Math.ceil(catMastery.length / batchSize);
    
    let html = `<button class="mode-btn practice-btn" onclick="startPractice('all')" style="width: 100%;">
        <span class="btn-icon"> </span>
        <span class="btn-label">MIX ALL BATCHES</span>
        <span class="btn-sub">Random test from ${catMastery.length} words</span>
    </button>`;
    
    for(let i=0; i<totalBatches; i++) {
        const batchWords = catMastery.slice(i * batchSize, (i + 1) * batchSize);
        html += `<button class="mode-btn" onclick="startPractice(${i})" style="width: 100%;">
            <span class="btn-icon"> </span>
            <span class="btn-label">BATCH ${String(i+1).padStart(2, '0')}</span>
            <span class="btn-sub">${batchWords.length} / ${batchSize} MASTERED</span>
        </button>`;
    }
    box.innerHTML = html;
}

function startPractice(batchIndex) {
    const catMastery = mastery.filter(m => wordData.some(w => w.id === m.id || w.word === m.word));
    
    let pool = [];
    if (batchIndex === 'all') { pool = [...catMastery]; } 
    else { pool = catMastery.slice(batchIndex * 50, (batchIndex + 1) * 50); }
    
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    
    practiceQueue = pool;
    currentPracticeIndex = 0;
    practiceScore = 0;
    practiceWrongWords = [];
    
    showScreen('practice');
    renderPracticeNext();
}

function retryWrongWords() {
    if(practiceWrongWords.length === 0) return;
    practiceQueue = [...practiceWrongWords];
    
    for (let i = practiceQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [practiceQueue[i], practiceQueue[j]] = [practiceQueue[j], practiceQueue[i]];
    }
    
    currentPracticeIndex = 0;
    practiceScore = 0;
    practiceWrongWords = [];
    
    showScreen('practice');
    renderPracticeNext();
}

function renderPracticeNext() {
  if (currentPracticeIndex >= practiceQueue.length) {
      showResultScreen();
      return;
  }

  const fb = document.getElementById('feedback-box');
  fb.textContent = ''; fb.className = 'feedback-box';
  
  document.getElementById('practice-counter').textContent = String(currentPracticeIndex + 1).padStart(2, '0') + ' / ' + String(practiceQueue.length).padStart(2, '0');
  
  const currentWord = practiceQueue[currentPracticeIndex];
  let options = [currentWord.meaning];
  
  const distractorPool = wordData.filter(w => w.meaning !== currentWord.meaning);
  distractorPool.sort(() => Math.random() - 0.5);
  
  for (let w of distractorPool) {
    if (options.length >= 4) break;
    if (!options.includes(w.meaning)) options.push(w.meaning);
  }
  options.sort(() => Math.random() - 0.5);
  
  document.getElementById('practice-word').textContent = currentWord.word;
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';
  
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(btn, opt, currentWord);
    grid.appendChild(btn);
  });
}

function checkAnswer(btn, selected, currentWord) {
  const grid = document.getElementById('options-grid');
  grid.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
  const fb = document.getElementById('feedback-box');
  
  if (selected === currentWord.meaning) {
    btn.classList.add('correct');
    fb.textContent = '  CORRECT — NEURAL LINK CONFIRMED';
    fb.className = 'feedback-box success';
    practiceScore++;
  } else {
    btn.classList.add('wrong');
    fb.textContent = '  INCORRECT — RECALIBRATING...';
    fb.className = 'feedback-box error';
    grid.querySelectorAll('.option-btn').forEach(b => { if (b.textContent === currentWord.meaning) b.classList.add('correct'); });
    practiceWrongWords.push(currentWord);
  }
  
  currentPracticeIndex++;
  setTimeout(() => renderPracticeNext(), 1400); 
}

function showResultScreen() {
    showScreen('result');
    document.getElementById('result-score').textContent = `SCORE: ${practiceScore} / ${practiceQueue.length}`;
    
    const listContainer = document.getElementById('result-wrong-list');
    const title = document.getElementById('wrong-words-title');
    const retryBtn = document.getElementById('retry-btn');
    
    if (practiceWrongWords.length === 0) {
        title.textContent = "PERFECT SYNCHRONIZATION";
        title.style.color = "var(--success)";
        listContainer.innerHTML = '<div class="archive-empty" style="color: var(--success);">All answers correct. Mastery achieved.</div>';
        retryBtn.style.display = 'none';
    } else {
        title.textContent = "NEURAL MISMATCHES (WRONG)";
        title.style.color = "var(--error)";
        retryBtn.style.display = 'flex';
        listContainer.innerHTML = practiceWrongWords.map(w => {
            return `<div class="archive-item">
              <div class="arc-word" style="color: #FF8888;">${w.word}</div>
              <div class="arc-meaning">${w.meaning}</div>
            </div>`;
        }).join('');
    }
}

// --- ARCHIVE & FOLDERS ---
function toggleBatch(id) {
    const content = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (content.classList.contains('open')) {
        content.classList.remove('open');
        icon.textContent = ' ';
        icon.style.color = 'var(--grey-medium)';
    } else {
        content.classList.add('open');
        icon.textContent = ' ';
        icon.style.color = 'var(--silver-light)'; 
    }
}

function showArchive() {
  document.getElementById('archive-category-title').textContent = document.getElementById('selected-category-title').textContent + " ARCHIVE";
  allArchive = mastery.filter(m => wordData.some(w => w.id === m.id || w.word === m.word));
  
  document.getElementById('archive-count').textContent = allArchive.length + ' items';
  document.getElementById('archive-search').value = '';
  renderArchiveBatches(allArchive);
  showScreen('archive');
}

function filterArchive() {
  const q = document.getElementById('archive-search').value.toLowerCase();
  if (q) {
      const filtered = allArchive.filter(w => w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
      renderArchiveListFlat(filtered);
  } else {
      renderArchiveBatches(allArchive);
  }
}

function renderArchiveBatches(list) {
  const box = document.getElementById('archive-list');
  if (list.length === 0) { box.innerHTML = '<div class="archive-empty">No items found.</div>'; return; }
  
  let html = '';
  const batchSize = 50;
  const totalBatches = Math.ceil(list.length / batchSize);
  
  for(let i=0; i<totalBatches; i++) {
      const batchWords = list.slice(i * batchSize, (i + 1) * batchSize);
      const batchId = 'batch-folder-' + i;
      
      html += `<div class="batch-folder">
        <div class="batch-header" onclick="toggleBatch('${batchId}')">
          <span>  BATCH ${String(i+1).padStart(2, '0')}</span>
          <div class="batch-stats">
            <span>${batchWords.length}/${batchSize}</span>
            <span id="icon-${batchId}" style="color: var(--grey-medium); font-size: 0.8rem; width: 15px; text-align: center;"> </span>
          </div>
        </div>
        <div class="batch-content" id="${batchId}">`;
      
      html += `<button class="mode-btn practice-btn" onclick="startPractice(${i})" style="padding: 12px; margin-bottom: 12px; justify-content: center; width: 100%;">
          <span class="btn-icon"> </span>
          <span class="btn-label" style="text-align: center;">TEST THIS BATCH</span>
      </button>`;
      
      html += batchWords.map(w => {
        return `<div class="archive-item">
          <div class="arc-word">${w.word}</div>
          <div class="arc-meaning">${w.meaning}</div>
          <button class="remove-btn" onclick="removeFromArchive('${w.id || w.word}')"> </button>
        </div>`;
      }).join('');
      
      html += `</div></div>`;
  }
  box.innerHTML = html;
}

function renderArchiveListFlat(list) {
  const box = document.getElementById('archive-list');
  if (list.length === 0) { box.innerHTML = '<div class="archive-empty">No items found.</div>'; return; }
  box.innerHTML = list.map(w => {
    return `<div class="archive-item">
      <div class="arc-word">${w.word}</div>
      <div class="arc-meaning">${w.meaning}</div>
      <button class="remove-btn" onclick="removeFromArchive('${w.id || w.word}')"> </button>
    </div>`;
  }).join('');
}

function removeFromArchive(identifier) {
  mastery = mastery.filter(m => m.id !== identifier && m.word !== identifier);
  localStorage.setItem('myMasteryList', JSON.stringify(mastery));
  updateStats();
  showArchive();
}
