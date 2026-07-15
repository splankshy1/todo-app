// ---------- Config ----------
const API_BASE = '/api/todos';

// ---------- Access code (session-only, not stored permanently) ----------
function getAccessKey(){
  return sessionStorage.getItem('appAccessKey') || '';
}
function authHeaders(extra = {}){
  return { 'x-app-key': getAccessKey(), ...extra };
}

// ---------- State ----------
let todos = [];
let currentFilter = 'all';
let draggedId = null;

// ---------- Elements ----------
const newTodoForm = document.getElementById('newTodoForm');
const newTodoInput = document.getElementById('newTodoInput');
const todoList = document.getElementById('todoList');
const itemsLeftCount = document.getElementById('itemsLeftCount');
const clearCompletedBtn = document.getElementById('clearCompleted');
const themeToggle = document.getElementById('themeToggle');
const iconSun = document.getElementById('iconSun');
const iconMoon = document.getElementById('iconMoon');
const template = document.getElementById('todoItemTemplate');
const allFilterButtons = document.querySelectorAll('.filter-btn');
const lockScreen = document.getElementById('lockScreen');
const lockForm = document.getElementById('lockForm');
const lockInput = document.getElementById('lockInput');
const lockError = document.getElementById('lockError');

// ---------- API helpers ----------
async function apiGetTodos(){
  const res = await fetch(API_BASE, { headers: authHeaders() });
  if(res.status === 401) throw { unauthorized: true };
  if(!res.ok) throw new Error('Failed to load todos');
  return res.json();
}

async function apiCreateTodo(text){
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text })
  });
  if(res.status === 401) throw { unauthorized: true };
  if(!res.ok) throw new Error('Failed to create todo');
  return res.json();
}

async function apiToggleTodo(id, completed){
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ completed })
  });
  if(res.status === 401) throw { unauthorized: true };
  if(!res.ok) throw new Error('Failed to update todo');
  return res.json();
}

async function apiDeleteTodo(id){
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: authHeaders() });
  if(res.status === 401) throw { unauthorized: true };
  if(!res.ok) throw new Error('Failed to delete todo');
}

async function apiClearCompleted(){
  const res = await fetch(API_BASE, { method: 'DELETE', headers: authHeaders() });
  if(res.status === 401) throw { unauthorized: true };
  if(!res.ok) throw new Error('Failed to clear completed todos');
}

async function apiReorder(orderList){
  const res = await fetch(`${API_BASE}/reorder`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderList })
  });
  if(res.status === 401) throw { unauthorized: true };
  if(!res.ok) throw new Error('Failed to save new order');
}

// ---------- Render ----------
function render(){
  todoList.innerHTML = '';

  const visible = todos.filter(t => {
    if(currentFilter === 'active') return !t.completed;
    if(currentFilter === 'completed') return t.completed;
    return true;
  });

  if(visible.length === 0){
    const empty = document.createElement('li');
    empty.className = 'empty-message';
    empty.textContent = currentFilter === 'completed'
      ? 'No completed todos yet.'
      : currentFilter === 'active'
        ? 'No active todos. Nice work!'
        : 'Add your first todo above.';
    todoList.appendChild(empty);
  } else {
    visible.forEach(todo => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = todo.id;
      node.classList.toggle('completed', todo.completed);
      node.querySelector('.todo-text').textContent = todo.text;

      node.querySelector('.checkbox').addEventListener('click', () => toggleTodo(todo.id));
      node.querySelector('.delete-btn').addEventListener('click', () => deleteTodo(todo.id));

      node.addEventListener('dragstart', () => {
        draggedId = todo.id;
        node.classList.add('dragging');
      });
      node.addEventListener('dragend', () => node.classList.remove('dragging'));
      node.addEventListener('dragover', (e) => {
        e.preventDefault();
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
      node.addEventListener('drop', (e) => {
        e.preventDefault();
        node.classList.remove('drag-over');
        reorderTodos(draggedId, todo.id);
      });

      todoList.appendChild(node);
    });
  }

  const remaining = todos.filter(t => !t.completed).length;
  itemsLeftCount.textContent = remaining;

  allFilterButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentFilter);
  });
}

function showError(message){
  // Simple inline error banner so a failed request doesn't fail silently
  let banner = document.getElementById('errorBanner');
  if(!banner){
    banner = document.createElement('div');
    banner.id = 'errorBanner';
    banner.style.cssText = 'background:#ffdada;color:#7a1f1f;padding:10px 16px;border-radius:6px;margin-bottom:16px;font-size:14px;text-align:center;';
    document.querySelector('.wrapper').insertBefore(banner, document.querySelector('.new-todo'));
  }
  banner.textContent = message;
  setTimeout(() => banner.remove(), 4000);
}

// ---------- Actions (each syncs with the server, then re-renders) ----------
function showLockScreen(message){
  lockScreen.style.display = 'flex';
  sessionStorage.removeItem('appAccessKey');
  if(message){
    lockError.textContent = message;
    lockError.style.display = 'block';
  }
}

async function loadTodos(){
  try{
    todos = await apiGetTodos();
    render();
  } catch(err){
    if(err && err.unauthorized){
      showLockScreen('Incorrect code. Try again.');
      return;
    }
    showError('Could not reach the server. Is server.js running?');
    console.error(err);
  }
}

async function addTodo(text){
  try{
    const newTodo = await apiCreateTodo(text);
    todos.push(newTodo);
    render();
  } catch(err){
    if(err && err.unauthorized){ showLockScreen('Incorrect code. Try again.'); return; }
    showError('Could not add todo. Check your connection to the server.');
    console.error(err);
  }
}

async function toggleTodo(id){
  const todo = todos.find(t => t.id === id);
  if(!todo) return;
  const nextState = !todo.completed;
  todo.completed = nextState; // optimistic update
  render();
  try{
    await apiToggleTodo(id, nextState);
  } catch(err){
    todo.completed = !nextState; // revert on failure
    render();
    if(err && err.unauthorized){ showLockScreen('Incorrect code. Try again.'); return; }
    showError('Could not save that change.');
    console.error(err);
  }
}

async function deleteTodo(id){
  const previous = todos;
  todos = todos.filter(t => t.id !== id);
  render();
  try{
    await apiDeleteTodo(id);
  } catch(err){
    todos = previous; // revert on failure
    render();
    if(err && err.unauthorized){ showLockScreen('Incorrect code. Try again.'); return; }
    showError('Could not delete that todo.');
    console.error(err);
  }
}

async function clearCompleted(){
  const previous = todos;
  todos = todos.filter(t => !t.completed);
  render();
  try{
    await apiClearCompleted();
  } catch(err){
    todos = previous;
    render();
    if(err && err.unauthorized){ showLockScreen('Incorrect code. Try again.'); return; }
    showError('Could not clear completed todos.');
    console.error(err);
  }
}

async function reorderTodos(draggedItemId, targetItemId){
  if(draggedItemId === targetItemId) return;
  const draggedIndex = todos.findIndex(t => t.id === draggedItemId);
  const targetIndex = todos.findIndex(t => t.id === targetItemId);
  if(draggedIndex === -1 || targetIndex === -1) return;

  const [draggedItem] = todos.splice(draggedIndex, 1);
  todos.splice(targetIndex, 0, draggedItem);
  render();

  try{
    await apiReorder(todos.map(t => t.id));
  } catch(err){
    if(err && err.unauthorized){ showLockScreen('Incorrect code. Try again.'); return; }
    showError('New order was not saved to the server.');
    console.error(err);
  }
}

// ---------- Theme (kept local — no need for a database round trip) ----------
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  iconSun.style.display = theme === 'dark' ? 'none' : 'block';
  iconMoon.style.display = theme === 'dark' ? 'block' : 'none';
  localStorage.setItem('theme', theme);
}

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// ---------- Event listeners ----------
newTodoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = newTodoInput.value.trim();
  if(!text) return;
  addTodo(text);
  newTodoInput.value = '';
});

clearCompletedBtn.addEventListener('click', clearCompleted);
themeToggle.addEventListener('click', toggleTheme);

allFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    render();
  });
});

// ---------- Lock screen ----------
lockForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = lockInput.value.trim();
  if(!code) return;
  sessionStorage.setItem('appAccessKey', code);
  lockError.style.display = 'none';
  lockScreen.style.display = 'none';
  loadTodos();
});

// ---------- Init ----------
const savedTheme = localStorage.getItem('theme') ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

if(getAccessKey()){
  lockScreen.style.display = 'none';
  loadTodos();
} else {
  lockScreen.style.display = 'flex';
}
