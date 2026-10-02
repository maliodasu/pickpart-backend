import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import db from '../db.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// CREATE Work Order
router.post('/', async (req, res) => {
  try {
    const {
      delivery_date, sequence, model_code, special_case, suffix,
      height_group, engine, engine_prefix, transmission, lot_orders,
      frame_no, wheelbase, brand, power_rating, frame, color_code,
      colour, suspension_spring, no_urut, common_case, tyre,
      tire_group, wheel_group, remarks, model_suffix
    } = req.body;

    const query = `
      INSERT INTO work_orders (
        delivery_date, sequence, model_code, special_case, suffix,
        height_group, engine, engine_prefix, transmission, lot_orders,
        frame_no, wheelbase, brand, power_rating, frame, color_code,
        colour, suspension_spring, no_urut, common_case, tyre,
        tire_group, wheel_group, remarks, model_suffix
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      delivery_date, sequence, model_code, special_case, suffix,
      height_group, engine, engine_prefix, transmission, lot_orders,
      frame_no, wheelbase, brand, power_rating, frame, color_code,
      colour, suspension_spring, no_urut || 1, common_case, tyre,
      tire_group, wheel_group, remarks, model_suffix
    ];

    const [result] = await db.execute(query, values);
    res.status(201).json({
      success: true,
      message: 'Work order created successfully',
      data: { id: result.insertId, sequence }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// // READ ALL Work Orders (dengan Pagination sederhana agar tidak berat)
// router.get('/', async (req, res) => {
//   try {
//     const limit = parseInt(req.query.limit) || 50;
//     const offset = parseInt(req.query.offset) || 0;
//
//     // Menggunakan template literal untuk limit/offset karena mysql2 prepared statements terkadang strict pada tipe data integer di LIMIT
//     const [rows] = await db.query(
//       `SELECT * FROM work_orders ORDER BY sequence DESC LIMIT ? OFFSET ?`,
//       [limit, offset]
//     );
//     res.json({ success: true, count: rows.length, data: rows });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

router.get('/', async (req, res) => {
    try {
        // Ambil parameter 'date' dari query string (contoh: ?date=2026-09-30)
        const targetDate = req.query.date;

        let query = 'SELECT * FROM work_orders';
        let queryParams = [];

        // Jika parameter tanggal diberikan, filter berdasarkan tanggal tersebut
        if (targetDate) {
            query += ' WHERE delivery_date = ?';
            queryParams.push(targetDate);
        } else {
            // Jika tidak ada parameter date, gunakan tanggal hari ini (CURDATE())
            query += ' WHERE delivery_date = CURDATE()';
        }

        const [rows] = await db.query(query, queryParams);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DOWNLOAD Excel Template
router.get('/template', async (req, res) => {
  try {
    const headers = [
      'sequence',
      'model_code',
      'special_case',
      'suffix',
      'height_group',
      'engine',
      'engine_prefix',
      'transmission',
      'lot_orders',
      'frame_no',
      'wheelbase',
      'brand',
      'power_rating',
      'frame',
      'color_code',
      'colour',
      'suspension_spring',
      'no_urut',
      'common_case',
      'tyre',
      'tire_group',
      'wheel_group',
      'remarks',
      'model_suffix'
    ];

    // Example dummy row to help users understand format
    const sampleRow = {
      sequence: 1,
      model_code: 'XZU710R',
      special_case: 'STD',
      suffix: 'KD-EF',
      height_group: 'H1',
      engine: 'N04C',
      engine_prefix: 'N04C-WK',
      transmission: 'M550',
      lot_orders: 'LOT-01',
      frame_no: 'FE123456',
      wheelbase: '3380',
      brand: 'HINO',
      power_rating: '136PS',
      frame: 'F1',
      color_code: '058',
      colour: 'WHITE',
      suspension_spring: 'SP-1',
      no_urut: 1,
      common_case: 'CC-1',
      tyre: '7.50-16',
      tire_group: 'TG-1',
      wheel_group: 'WG-1',
      remarks: 'Contoh remarks',
      model_suffix: 'XZU710R-KD'
    };

    const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'WorkOrder Template');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="work_order_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE Work Order
router.put('/:id', async (req, res) => {
  try {
    const {
      delivery_date, sequence, model_code, special_case, suffix,
      height_group, engine, engine_prefix, transmission, lot_orders,
      frame_no, wheelbase, brand, power_rating, frame, color_code,
      colour, suspension_spring, no_urut, common_case, tyre,
      tire_group, wheel_group, remarks, model_suffix
    } = req.body;

    const query = `
      UPDATE work_orders SET
        delivery_date = ?, sequence = ?, model_code = ?, special_case = ?, suffix = ?,
        height_group = ?, engine = ?, engine_prefix = ?, transmission = ?, lot_orders = ?,
        frame_no = ?, wheelbase = ?, brand = ?, power_rating = ?, frame = ?, color_code = ?,
        colour = ?, suspension_spring = ?, no_urut = ?, common_case = ?, tyre = ?,
        tire_group = ?, wheel_group = ?, remarks = ?, model_suffix = ?
      WHERE id = ?
    `;

    const values = [
      delivery_date, sequence, model_code, special_case, suffix,
      height_group, engine, engine_prefix, transmission, lot_orders,
      frame_no, wheelbase, brand, power_rating, frame, color_code,
      colour, suspension_spring, no_urut, common_case, tyre,
      tire_group, wheel_group, remarks, model_suffix,
      req.params.id
    ];

    const [result] = await db.execute(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Work order not found' });
    }
    res.json({ success: true, message: 'Work order updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE Work Order
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM work_orders WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Work order not found' });
    }
    res.json({ success: true, message: 'Work order deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// IMPORT Work Orders from Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const delivery_date = req.body.delivery_date || new Date().toISOString().split('T')[0];

    // Read workbook from buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Excel file is empty' });
    }

    let importedCount = 0;

    for (const row of rows) {
      // Helper function to find a key case-insensitively or matching common names
      const getVal = (possibleKeys) => {
        for (const pk of possibleKeys) {
          for (const key of Object.keys(row)) {
            if (key.trim().toLowerCase() === pk.toLowerCase()) {
              return row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';
            }
          }
        }
        return '';
      };

      const sequence = getVal(['sequence', 'seq', 'no', 'nomor']);
      const model_code = getVal(['model_code', 'model code', 'model', 'kode model']);
      const special_case = getVal(['special_case', 'special case', 'case khusus', 'case']);
      const suffix = getVal(['suffix', 'sfx']);
      const height_group = getVal(['height_group', 'height group', 'height']);
      const engine = getVal(['engine', 'mesin']);
      const engine_prefix = getVal(['engine_prefix', 'engine prefix', 'prefix mesin']);
      const transmission = getVal(['transmission', 'transmisi', 'trans']);
      const lot_orders = getVal(['lot_orders', 'lot orders', 'lot']);
      const frame_no = getVal(['frame_no', 'frame no', 'no rangka', 'frameno']);
      const wheelbase = getVal(['wheelbase', 'wb']);
      const brand = getVal(['brand', 'merk']);
      const power_rating = getVal(['power_rating', 'power rating', 'power']);
      const frame = getVal(['frame']);
      const color_code = getVal(['color_code', 'color code', 'kode warna']);
      const colour = getVal(['colour', 'color', 'warna']);
      const suspension_spring = getVal(['suspension_spring', 'suspension spring', 'spring']);
      const no_urut_val = getVal(['no_urut', 'no urut', 'nourut']);
      const no_urut = no_urut_val ? parseInt(no_urut_val, 10) || 1 : 1;
      const common_case = getVal(['common_case', 'common case']);
      const tyre = getVal(['tyre', 'tire', 'ban']);
      const tire_group = getVal(['tire_group', 'tire group']);
      const wheel_group = getVal(['wheel_group', 'wheel group']);
      const remarks = getVal(['remarks', 'remark', 'keterangan', 'note']);
      const model_suffix = getVal(['model_suffix', 'model suffix', 'modelsuffix']);

      // Skip row if sequence is missing
      if (!sequence) continue;

      const query = `
        INSERT INTO work_orders (
          delivery_date, sequence, model_code, special_case, suffix,
          height_group, engine, engine_prefix, transmission, lot_orders,
          frame_no, wheelbase, brand, power_rating, frame, color_code,
          colour, suspension_spring, no_urut, common_case, tyre,
          tire_group, wheel_group, remarks, model_suffix
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        delivery_date,
        sequence,
        model_code,
        special_case,
        suffix,
        height_group,
        engine,
        engine_prefix,
        transmission,
        lot_orders,
        frame_no,
        wheelbase,
        brand,
        power_rating,
        frame,
        color_code,
        colour,
        suspension_spring,
        no_urut,
        common_case,
        tyre,
        tire_group,
        wheel_group,
        remarks,
        model_suffix
      ];

      await db.execute(query, values);
      importedCount++;
    }

    res.json({
      success: true,
      message: `Berhasil mengimpor ${importedCount} work order dari Excel.`,
      count: importedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
