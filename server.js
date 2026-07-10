 // Fix Windows Node.js DNS lookup issue for MongoDB Atlas
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve the frontend (index.html, style.css, script.js, images) from this same folder
app.use(express.static(path.join(__dirname)));

// MongoDB Cloud Connection — credentials now come from .env, never hardcoded
const cloudURI = process.env.MONGO_URI;

if (!cloudURI) {
  console.error('Missing MONGO_URI in .env file. Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

mongoose.connect(cloudURI)
  .then(() => console.log('Connected securely to MongoDB Atlas Cloud! 🌍🌱'))
  .catch(err => console.error('MongoDB cloud connection error:', err));

// Todo Schema & Model
const todoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  order: { type: Number, default: 0 }
});

// Transform the MongoDB _id to match your frontend 'id' property seamlessly
todoSchema.method('toJSON', function() {
  const { __v, _id, ...object } = this.toObject();
  object.id = _id;
  return object;
});

const Todo = mongoose.model('Todo', todoSchema);

// ---------- API Routes ----------

// 1. GET all todos
app.get('/api/todos', async (req, res) => {
  try {
    const todos = await Todo.find().sort({ order: 1 });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST a new todo
app.post('/api/todos', async (req, res) => {
  try {
    const count = await Todo.countDocuments();
    const newTodo = new Todo({
      text: req.body.text,
      completed: false,
      order: count
    });
    const savedTodo = await newTodo.save();
    res.status(201).json(savedTodo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. PUT update all todos (For reordering)
// NOTE: this must be declared BEFORE '/api/todos/:id' below, otherwise
// Express matches '/api/todos/reorder' to the :id route with id="reorder"
app.put('/api/todos/reorder', async (req, res) => {
  try {
    const { orderList } = req.body; // Array of item IDs in new order
    const promises = orderList.map((id, index) => 
      Todo.findByIdAndUpdate(id, { order: index })
    );
    await Promise.all(promises);
    res.json({ message: 'Order updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. PUT update todo (Toggle complete status)
app.put('/api/todos/:id', async (req, res) => {
  try {
    const updatedTodo = await Todo.findByIdAndUpdate(
      req.params.id, 
      { completed: req.body.completed }, 
      { new: true }
    );
    res.json(updatedTodo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. DELETE a single todo
app.delete('/api/todos/:id', async (req, res) => {
  try {
    await Todo.findByIdAndDelete(req.params.id);
    res.json({ message: 'Todo deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. DELETE all completed todos
app.delete('/api/todos', async (req, res) => {
  try {
    await Todo.deleteMany({ completed: true });
    res.json({ message: 'Completed todos cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});