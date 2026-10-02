import express from 'express';
import db from '../db.js';

const router = express.Router();

// Helper untuk mengubah string kosong atau undefined menjadi null
const sanitize = (val) => (val === undefined || val === '' ? null : val);

// READ ALL or SEARCH Parts (mendukung ?search=query)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM sps_rack_trimming';
    let params = [];

    if (search) {
      query += ` WHERE part_no LIKE ? OR part_name LIKE ? OR supplier LIKE ? OR tag_id LIKE ?`;
      const searchTerm = `%${search}%`;
      params = [searchTerm, searchTerm, searchTerm, searchTerm];
    }

    const [rows] = await db.query(query, params);
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE Part
router.post('/', async (req, res) => {
  try {
    const {
      part_no, adv_picking, part_name, tag_id, setting,
      old_address, new_address, supplier, unique_number,
      pcs_per_kanban, packing_spec, rack_per_box, image_path, keterangan
    } = req.body;

    const query = `
      INSERT INTO sps_rack_trimming
      (part_no, adv_picking, part_name, tag_id, setting, old_address, new_address, supplier, unique_number, pcs_per_kanban, packing_spec, rack_per_box, image_path, keterangan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      sanitize(part_no), sanitize(adv_picking), sanitize(part_name), sanitize(tag_id), sanitize(setting),
      sanitize(old_address), sanitize(new_address), sanitize(supplier), sanitize(unique_number),
      sanitize(pcs_per_kanban) ?? 0, sanitize(packing_spec), sanitize(rack_per_box) ?? 0, sanitize(image_path), sanitize(keterangan)
    ];

    const [result] = await db.execute(query, values);
    res.status(201).json({
      success: true,
      message: 'Part created successfully',
      data: { id: result.insertId, part_no }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// READ Part by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM sps_rack_trimming WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Part not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE Part berdasarkan part_no (Sesuai dengan frontend)
router.put('/:part_no', async (req, res) => {
  try {
    const {
      adv_picking, part_name, tag_id, setting,
      old_address, new_address, supplier, unique_number,
      pcs_per_kanban, packing_spec, rack_per_box, image_path, keterangan
    } = req.body;

    const query = `
      UPDATE sps_rack_trimming SET
      adv_picking = ?, part_name = ?, tag_id = ?, setting = ?,
      old_address = ?, new_address = ?, supplier = ?, unique_number = ?,
      pcs_per_kanban = ?, packing_spec = ?, rack_per_box = ?, image_path = ?, keterangan = ?
      WHERE part_no = ?
    `;

    const values = [
      sanitize(adv_picking), sanitize(part_name), sanitize(tag_id), sanitize(setting),
      sanitize(old_address), sanitize(new_address), sanitize(supplier), sanitize(unique_number),
      sanitize(pcs_per_kanban) ?? 0, sanitize(packing_spec), sanitize(rack_per_box) ?? 0, sanitize(image_path), sanitize(keterangan),
      req.params.part_no
    ];

    const [result] = await db.execute(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Part not found' });
    }
    res.json({ success: true, message: 'Part updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE Part berdasarkan part_no (Sesuai dengan frontend)
router.delete('/:part_no', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM sps_rack_trimming WHERE part_no = ?', [req.params.part_no]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Part not found' });
    }
    res.json({ success: true, message: 'Part deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
