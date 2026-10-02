import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all picking sequences
router.get('/', async (req, res) => {
    try {
        const { search, model_suffix } = req.query;

        console.log(`[DEBUG PICKING-SEQUENCES] search: ${search || '-'} | model_suffix: ${model_suffix || '-'}`);

        let query = `
            SELECT ps.id, ps.part_no, ps.model_suffix, ps.quantity,
                   st.part_name, st.tag_id, st.new_address AS part_address, m.model_name
            FROM picking_sequence ps
            LEFT JOIN sps_rack_trimming st ON ps.part_no = st.part_no
            LEFT JOIN models m ON ps.model_suffix = m.model_suffix
            WHERE 1=1
        `;
        let params = [];

        if (search) {
            query += ' AND (ps.part_no LIKE ? OR st.part_name LIKE ? OR st.new_address LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (model_suffix) {
            query += ' AND ps.model_suffix = ?';
            params.push(model_suffix);
        }

        query += ' ORDER BY part_address ASC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, message: 'Berhasil mengambil data picking sequence', data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET picking sequence by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM picking_sequence WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Picking sequence not found' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST create picking sequence (support single or batch model_suffixes)
router.post('/', async (req, res) => {
    try {
        const { part_no, model_suffix, model_suffixes, quantity } = req.body;
        const qty = quantity || 1;

        if (!part_no) {
            return res.status(400).json({ success: false, error: 'part_no is required' });
        }

        let suffixes = [];
        if (model_suffixes && Array.isArray(model_suffixes) && model_suffixes.length > 0) {
            suffixes = model_suffixes;
        } else if (model_suffix) {
            suffixes = [model_suffix];
        }

        if (suffixes.length === 0) {
            return res.status(400).json({ success: false, error: 'model_suffix or model_suffixes is required' });
        }

        let insertedCount = 0;
        for (const suffix of suffixes) {
            await db.execute(
                'INSERT INTO picking_sequence (part_no, model_suffix, quantity) VALUES (?, ?, ?)',
                [part_no, suffix, qty]
            );
            insertedCount++;
        }

        res.status(201).json({
            success: true,
            message: `Successfully created ${insertedCount} picking sequence(s)`,
            count: insertedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT update picking sequence
router.put('/:id', async (req, res) => {
    try {
        const { part_no, model_suffix, quantity } = req.body;
        const [result] = await db.execute(
            'UPDATE picking_sequence SET part_no = ?, model_suffix = ?, quantity = ? WHERE id = ?',
            [part_no, model_suffix, quantity, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Picking sequence not found' });
        }

        res.json({ success: true, message: 'Picking sequence updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE picking sequence
router.delete('/:id', async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM picking_sequence WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Picking sequence not found' });
        }
        res.json({ success: true, message: 'Picking sequence deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
