import express from 'express';
import db from '../db.js';

const router = express.Router();

// CREATE Model
router.post('/', async (req, res) => {
  try {
    const { model_suffix, model_name } = req.body;
    const [result] = await db.execute(
      'INSERT INTO models (model_suffix, model_name) VALUES (?, ?)',
      [model_suffix, model_name]
    );
    res.status(201).json({
      success: true,
      message: 'Model created successfully',
      data: { id: result.insertId, model_suffix, model_name }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// READ ALL Models (dengan fitur pencarian)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let sqlQuery = 'SELECT * FROM models';
    let queryParams = [];

    // Jika ada parameter pencarian, tambahkan kondisi WHERE
    if (search) {
      sqlQuery += ' WHERE model_name LIKE ? OR model_suffix LIKE ?';
      const searchTerm = `%${search}%`; // Menambahkan % untuk pencarian parsial
      queryParams.push(searchTerm, searchTerm);
    }

    // Eksekusi query dengan parameter (aman dari SQL Injection)
    const [rows] = await db.execute(sqlQuery, queryParams);

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// READ Model by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM models WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE Model
router.put('/:id', async (req, res) => {
  try {
    const { model_suffix, model_name } = req.body;
    const [result] = await db.execute(
      'UPDATE models SET model_suffix = ?, model_name = ? WHERE id = ?',
      [model_suffix, model_name, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }
    res.json({ success: true, message: 'Model updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE Model
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM models WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }
    res.json({ success: true, message: 'Model deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
