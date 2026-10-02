import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { date } = req.query;

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [totalRes] = await db.query('SELECT COUNT(*) as total FROM work_orders WHERE delivery_date = ?', [today]);
        const [antreanRes] = await db.query('SELECT COUNT(*) as total FROM picking_session ps JOIN work_orders wo ON ps.sequence = wo.sequence WHERE status = "IN_PROGRESS" AND delivery_date = ?', [today]);
        const [selesaiRes] = await db.query('SELECT COUNT(*) as total FROM picking_session ps JOIN work_orders wo ON ps.sequence = wo.sequence WHERE status = "COMPLETED" AND delivery_date = ?', [today]);
        const [kendalaRes] = await db.query('SELECT COUNT(*) as total FROM picking_session ps JOIN work_orders wo ON ps.sequence = wo.sequence WHERE status = "CANCELLED" AND delivery_date = ?', [today]);

        res.json({
            success: true,
            stats: {
                totalUnit: totalRes[0].total || 0,
                antreanSeq: antreanRes[0].total || 0,
                selesaiHariIni: selesaiRes[0].total || 0,
                adaKendala: kendalaRes[0].total || 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
