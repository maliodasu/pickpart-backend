import express from 'express';
import db from '../db.js';

const router = express.Router();

// CREATE Picking Session
router.post('/', async (req, res) => {
  try {
    const { sequence, operator, status, notes } = req.body;

    const [result] = await db.execute(
      'INSERT INTO picking_session (sequence, operator, status, notes) VALUES (?, ?, ?, ?)',
      [sequence, operator, status || 'PENDING', notes]
    );

    res.status(201).json({
      success: true,
      message: 'Picking session created successfully',
      data: { id: result.insertId, sequence, operator }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// READ ALL Picking Sessions
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM picking_session');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// READ Picking Session by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM picking_session WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Picking session not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE Picking Session
router.put('/:id', async (req, res) => {
  try {
    const { sequence, operator, status, notes } = req.body;

    const [result] = await db.execute(
      'UPDATE picking_session SET sequence = ?, operator = ?, status = ?, notes = ? WHERE id = ?',
      [sequence, operator, status, notes, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Picking session not found' });
    }
    res.json({ success: true, message: 'Picking session updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE Picking Session
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM picking_session WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Picking session not found' });
    }
    res.json({ success: true, message: 'Picking session deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
